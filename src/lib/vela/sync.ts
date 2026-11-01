/* Encrypted cloud sync with revision-based optimistic concurrency.
   Every edit is saved (encrypted) on the device first and marks the journal dirty.
   A sync pulls the row, merges by item updatedAt + cleared/deleted markers,
   then pushes with baseRevision. A conflict means someone else wrote first:
   pull, merge, retry. Offline edits wait in the dirty flag until reconnect. */

import { create } from "zustand";
import { forgetUser, getClient, keepSignedIn, lastUser, pullVault, pushVault, rememberUser, userFromSession, type CloudUser, type RemoteVault } from "./cloud";
import { cloudConfigured } from "./supabase-config";
import { currentKey, journalFromUnknown, mergeJournals, useJournal, type CloudPhase } from "./store";
import type { Journal } from "./types";
import { open, openWithCandidates, seal } from "./vault-crypto";
import { readSync, writeSync, type SyncMeta } from "./vault-db";
import { rememberPass } from "./fingerprint";
import { dropGrace } from "./grace";

type CloudState = {
  authReady: boolean;
  user: CloudUser | null;
  /** undefined: not checked yet · null: no row in the account. */
  remote: RemoteVault | undefined;
  pendingRemote: RemoteVault;
  /** Kept signed in, but the cloud session ended by itself (expired refresh token, password
      changed elsewhere…). The diary stays open (behind its own lock); settings offer "Sign in again". */
  sessionGone: boolean;
  /** Email of that last account, to prefill the sign-in form. */
  lastEmail: string;
};

export const useCloud = create<CloudState>(() => ({
  authReady: !cloudConfigured,
  user: null,
  remote: undefined,
  pendingRemote: null,
  sessionGone: false,
  lastEmail: "",
}));

let signingOut = false;

/** No session now: was it an account kept on this device whose session ran out? */
function noteNoSession() {
  const last = keepSignedIn() && !signingOut ? lastUser() : null;
  useCloud.setState(last ? { sessionGone: true, lastEmail: last.email } : { sessionGone: false });
}

function noteSession(user: CloudUser | null) {
  if (user) {
    rememberUser(user);
    useCloud.setState({ sessionGone: false, lastEmail: user.email });
  } else noteNoSession();
}

const setPhase = (p: CloudPhase) => {
  if (useJournal.getState().cloudPhase !== p) useJournal.getState().setCloudPhase(p);
};

let meta: SyncMeta = { userId: "", baseRevision: 0, dirty: true };
let metaLoaded: Promise<void> | null = null;
let editSeq = 0;
let hold = false;
let running: Promise<void> | null = null;
let again = false;
let retryTimer = 0;

function loadMeta() {
  if (!metaLoaded) {
    metaLoaded = readSync()
      .then((m) => {
        if (m) meta = m;
      })
      .catch(() => undefined);
  }
  return metaLoaded;
}

function saveMeta() {
  void writeSync({ ...meta }).catch(() => undefined);
}

export function resetSyncMeta() {
  meta = { userId: "", baseRevision: 0, dirty: true };
  saveMeta();
}

/** Called on every local journal change that came from the user. */
export function markDirty() {
  if (hold) return;
  editSeq += 1;
  if (!meta.dirty) {
    meta.dirty = true;
    saveMeta();
  }
}

function withHold(fn: () => void) {
  hold = true;
  try {
    fn();
  } finally {
    hold = false;
  }
}

function body(j: Journal) {
  return JSON.stringify([j.sessions, j.encounters, j.partners, j.settings, j.deleted ?? {}, j.profile?.displayName ?? ""]);
}

export async function initAuth() {
  await loadMeta();
  if (!cloudConfigured) {
    setPhase("unconfigured");
    useCloud.setState({ authReady: true });
    return;
  }
  const sb = await getClient();
  if (!sb) {
    setPhase("unconfigured");
    useCloud.setState({ authReady: true });
    return;
  }
  sb.auth.onAuthStateChange((_event, session) => {
    const user = userFromSession(session);
    noteSession(user);
    const prev = useCloud.getState().user;
    if (prev?.id !== user?.id) {
      useCloud.setState({ user, remote: undefined, pendingRemote: null });
      void syncNow();
    }
  });
  try {
    const { data } = await sb.auth.getSession();
    const user = userFromSession(data.session);
    useCloud.setState({ user });
    noteSession(user);
  } catch {
    /* offline: no session info */
  }
  useCloud.setState({ authReady: true });
  void syncNow();
}

export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      await syncOnce();
    } while (again);
  })().finally(() => {
    running = null;
  });
  return running;
}

function scheduleRetry() {
  window.clearTimeout(retryTimer);
  retryTimer = window.setTimeout(() => void syncNow(), 30_000);
}

async function syncOnce() {
  await loadMeta();
  if (!cloudConfigured) return setPhase("unconfigured");
  const user = useCloud.getState().user;
  if (!user) return setPhase("signed-out");
  const st = useJournal.getState();
  if (!st.unlocked) {
    // Locked or no journal yet: only look whether the account already holds one (new-device setup).
    if (st.vault === "none" && navigator.onLine) {
      try {
        useCloud.setState({ remote: await pullVault(user.id) });
      } catch {
        /* try again later */
      }
    }
    return;
  }
  const key = currentKey();
  if (!key) return;
  if (meta.userId && meta.userId !== user.id) return setPhase("other-account");
  if (!navigator.onLine) return setPhase("offline");
  if (meta.userId !== user.id) {
    meta = { userId: user.id, baseRevision: 0, dirty: true };
    saveMeta();
  }
  setPhase("saving");
  try {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const remote = await pullVault(user.id);
      useCloud.setState({ remote });
      let needPush = meta.dirty || !remote;
      if (remote && remote.envelope.salt !== key.salt && remote.revision !== meta.baseRevision) {
        // The account copy uses another passphrase (changed elsewhere, or a separate journal).
        useCloud.setState({ pendingRemote: remote });
        return setPhase("needs-pass");
      }
      if (remote && remote.envelope.salt !== key.salt) needPush = true; // we re-keyed locally
      if (remote && remote.revision !== meta.baseRevision) {
        let raw: unknown;
        try {
          raw = await open(key, remote.envelope);
        } catch {
          useCloud.setState({ pendingRemote: remote });
          return setPhase("needs-pass");
        }
        const theirs = journalFromUnknown(raw, useJournal.getState().journal.settings.language);
        const mine = useJournal.getState().journal;
        const merged = mergeJournals(mine, theirs);
        merged.settings = { ...merged.settings, language: mine.settings.language };
        if (body(merged) !== body(mine)) withHold(() => useJournal.getState().replaceJournal(merged));
        needPush = needPush || body(merged) !== body(theirs);
        meta.baseRevision = remote.revision;
        saveMeta();
      }
      if (!needPush) {
        meta.dirty = false;
        saveMeta();
        return setPhase("saved");
      }
      const seq = editSeq;
      const env = await seal(currentKey() ?? key, useJournal.getState().journal);
      const res = await pushVault(user.id, env, remote ? remote.revision : 0);
      if (res.ok) {
        meta.baseRevision = res.revision;
        meta.dirty = editSeq !== seq;
        saveMeta();
        useCloud.setState({ remote: { envelope: env, revision: res.revision, updatedAt: new Date().toISOString() } });
        if (meta.dirty) again = true;
        return setPhase("saved");
      }
      // conflict: loop → pull, merge, retry
    }
    setPhase("error");
    scheduleRetry();
  } catch {
    setPhase(navigator.onLine ? "error" : "offline");
    scheduleRetry();
  }
}

/** New device: open the account's encrypted journal with the passphrase. */
export async function openFromCloud(passphrase: string): Promise<boolean> {
  const user = useCloud.getState().user;
  const remote = useCloud.getState().remote;
  if (!user || !remote) return false;
  try {
    const { vk, data, used } = await openWithCandidates(passphrase, remote.envelope);
    meta = { userId: user.id, baseRevision: remote.revision, dirty: false };
    saveMeta();
    hold = true;
    try {
      await useJournal.getState().adoptJournal(data, vk);
      rememberPass(used);
    } finally {
      hold = false;
    }
    void syncNow();
    return true;
  } catch {
    return false;
  }
}

/** The account copy uses another passphrase: open it, adopt that key, merge, push. */
export async function adoptRemotePassphrase(passphrase: string): Promise<boolean> {
  const remote = useCloud.getState().pendingRemote;
  if (!remote || !useJournal.getState().unlocked) return false;
  try {
    const { vk, data, used } = await openWithCandidates(passphrase, remote.envelope);
    const mine = useJournal.getState().journal;
    const merged = mergeJournals(mine, journalFromUnknown(data, mine.settings.language));
    merged.settings = { ...merged.settings, language: mine.settings.language };
    hold = true;
    try {
      await useJournal.getState().rekey(vk, used);
      useJournal.getState().replaceJournal(merged);
    } finally {
      hold = false;
    }
    meta.baseRevision = remote.revision;
    meta.dirty = true;
    saveMeta();
    useCloud.setState({ pendingRemote: null });
    void syncNow();
    return true;
  } catch {
    return false;
  }
}

export async function signOut() {
  // Signing out also ends "stay unlocked on this device": the journal locks and the parked key is wiped.
  useJournal.getState().lock();
  await dropGrace();
  const sb = await getClient();
  signingOut = true;
  forgetUser();
  try {
    await sb?.auth.signOut({ scope: "local" });
  } catch {
    /* offline: the local session is still cleared */
  } finally {
    signingOut = false;
  }
  useCloud.setState({ user: null, remote: undefined, pendingRemote: null, sessionGone: false });
  setPhase("signed-out");
}
