/* Encrypted cloud sync, decided by REVISION only — never by any clock (Oscar, Nov 9 2026,
   the same rule he set for Brizna and Faro).
   Every edit is saved (encrypted) on the device first and marks the journal dirty.
   A sync first OBSERVES the account row (pull), then:
   - the row is still at baseRevision → this device's copy is pushed (revision + 1);
   - the row moved and this device has no unsynced edits → the account copy is adopted whole;
   - the row moved AND this device has unsynced edits → a real conflict: nothing is merged,
     nothing is overwritten, no timestamp picks a winner. Both copies stay exactly as they are
     until Oscar chooses one in Settings; the copy not chosen is downloaded first as an
     encrypted backup file, so no version is ever lost.
   Offline edits wait in the dirty flag until reconnect; entering the journal never waits for
   the network or the account session (the local vault and its owner mark live on the device). */

import { create } from "zustand";
import { forgetUser, getClient, lastUser, pullVault, pushVault, rememberUser, userFromSession, type CloudUser, type RemoteVault } from "./cloud";
import { cloudConfigured } from "./supabase-config";
import { BACKUP_KIND, currentKey, journalFromUnknown, mergeDroppedCycles, mergeJournals, useJournal, type CloudPhase } from "./store";
import { STR } from "./copy";
import type { Journal } from "./types";
import { open, openWithCandidates, seal } from "./vault-crypto";
import { readSync, writeSync, type SyncMeta } from "./vault-db";
import { bioFailCode, bioRecord, rebindFingerprint, rememberPass, unlockFingerprint } from "./fingerprint";
import { adoptOwner } from "./app-lock";
import { todayStr } from "./dates";

type CloudState = {
  authReady: boolean;
  user: CloudUser | null;
  /** undefined: not checked yet · null: no row in the account. */
  remote: RemoteVault | undefined;
  pendingRemote: RemoteVault;
  /** Both copies changed since the last common revision: sync is paused on this untouched
      account copy until Oscar picks a side (resolveConflictKeepMine / UseCloud). */
  conflict: RemoteVault;
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
  conflict: null,
  sessionGone: false,
  lastEmail: "",
}));

let signingOut = false;

/** No session now: is an account remembered on this device (its owner mark) whose session ran out?
    The mark lives outside the session, so this does not depend on "keep me signed in": that choice
    governs the session token, never whether the device knows whose journal it holds. */
function noteNoSession() {
  const last = !signingOut ? lastUser() : null;
  useCloud.setState(last ? { sessionGone: true, lastEmail: last.email } : { sessionGone: false });
}

function noteSession(user: CloudUser | null) {
  if (user) {
    rememberUser(user);
    const st = useJournal.getState();
    adoptOwner(user.id, st.unlocked || st.vault === "none");
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

/** One journal out as an encrypted Vela backup file — the Data & Backup export format,
    so a copy preserved at a conflict can be restored (and merged by hand) from there. */
async function downloadJournalBackup(journal: Journal, filename: string) {
  const key = currentKey();
  if (!key) return;
  const envelope = await seal(key, { app: "vela", version: 2, exportedAt: new Date().toISOString(), journal });
  const file = { app: "vela", kind: BACKUP_KIND, createdAt: new Date().toISOString(), ...envelope };
  const blob = new Blob([JSON.stringify(file)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
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
      useCloud.setState({ user, remote: undefined, pendingRemote: null, conflict: null });
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
    // First bind of this device to the account (a different recorded owner is stopped above as
    // "other-account"). Record the owner WITHOUT forgetting the revision the local copy is
    // based on: creating a journal resets the meta mid-flight (resetSyncMeta), and a push that
    // already landed must not lose its base — under the old clock-merge that amnesia was
    // invisible; with revision-only sync it would invent a conflict out of thin air.
    meta = { userId: user.id, baseRevision: meta.baseRevision, dirty: meta.dirty };
    saveMeta();
  }
  // A conflict already waiting for a choice: sync stays paused, nothing is retried over it.
  if (useCloud.getState().conflict) return setPhase("conflict");
  setPhase("saving");
  try {
    // Observe first: the account row is read before anything is written.
    const remote = await pullVault(user.id);
    useCloud.setState({ remote });
    if (remote && remote.envelope.salt !== key.salt && remote.revision !== meta.baseRevision) {
      // The account copy uses another passphrase (changed elsewhere, or a separate journal).
      useCloud.setState({ pendingRemote: remote });
      return setPhase("needs-pass");
    }
    const rekeyed = Boolean(remote && remote.envelope.salt !== key.salt); // row still at our base: we re-keyed locally
    if (remote && remote.revision !== meta.baseRevision) {
      // The account copy moved since the revision this device last saw.
      if (meta.dirty || rekeyed) {
        // Both sides changed. Pause untouched — no merge, no overwrite, no clock decides.
        useCloud.setState({ conflict: remote });
        return setPhase("conflict");
      }
      // Only the account moved: adopt its copy whole.
      let raw: unknown;
      try {
        raw = await open(key, remote.envelope);
      } catch {
        useCloud.setState({ pendingRemote: remote });
        return setPhase("needs-pass");
      }
      const theirs = journalFromUnknown(raw, useJournal.getState().journal.settings.language);
      theirs.settings = { ...theirs.settings, language: useJournal.getState().journal.settings.language };
      withHold(() => useJournal.getState().replaceJournal(theirs));
      meta.baseRevision = remote.revision;
      meta.dirty = false;
      saveMeta();
      return setPhase("saved");
    }
    if (!meta.dirty && remote && !rekeyed) return setPhase("saved");
    // The row is at our base (or there is no row yet): push this device's copy.
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
    // Someone wrote between our pull and our push: observe again, then the same rules apply.
    const now = await pullVault(user.id);
    useCloud.setState({ remote: now });
    if (now && now.envelope.salt === key.salt) {
      useCloud.setState({ conflict: now });
      return setPhase("conflict");
    }
    setPhase("error");
    scheduleRetry();
  } catch {
    setPhase(navigator.onLine ? "error" : "offline");
    scheduleRetry();
  }
}

/** Conflict, his choice: this device's copy wins. The account copy is downloaded first as an
    encrypted backup file, then this device pushes over it (revision + 1, never a merge). */
export async function resolveConflictKeepMine(): Promise<boolean> {
  const remote = useCloud.getState().conflict;
  const user = useCloud.getState().user;
  const key = currentKey();
  if (!remote || !user || !key) return false;
  try {
    const raw = await open(key, remote.envelope);
    const theirs = journalFromUnknown(raw, useJournal.getState().journal.settings.language);
    await downloadJournalBackup(theirs, `vela-account-copy-${todayStr()}.json`);
  } catch {
    return false; // could not preserve the other copy: change nothing
  }
  meta.baseRevision = remote.revision;
  meta.dirty = true;
  saveMeta();
  useCloud.setState({ conflict: null });
  void syncNow();
  return true;
}

/** Conflict, his choice: the account's copy wins. This device's copy is downloaded first as an
    encrypted backup file, then the account copy is adopted whole. */
export async function resolveConflictUseCloud(): Promise<boolean> {
  const remote = useCloud.getState().conflict;
  const key = currentKey();
  if (!remote || !key) return false;
  let theirs: Journal;
  try {
    const raw = await open(key, remote.envelope);
    theirs = journalFromUnknown(raw, useJournal.getState().journal.settings.language);
  } catch {
    useCloud.setState({ conflict: null, pendingRemote: remote });
    setPhase("needs-pass");
    return false;
  }
  await downloadJournalBackup(useJournal.getState().journal, `vela-device-copy-${todayStr()}.json`);
  theirs.settings = { ...theirs.settings, language: useJournal.getState().journal.settings.language };
  withHold(() => useJournal.getState().replaceJournal(theirs));
  meta.baseRevision = remote.revision;
  meta.dirty = false;
  saveMeta();
  useCloud.setState({ conflict: null });
  setPhase("saved");
  return true;
}

/** New device: open the account's encrypted journal with the passphrase. */
export async function openFromCloud(passphrase: string, opts: { sealed?: boolean } = {}): Promise<boolean> {
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
      useJournal.setState({ passTyped: !opts.sealed });
      if (opts.sealed) rebindFingerprint(useJournal.getState().vaultId);
    } finally {
      hold = false;
    }
    void syncNow();
    return true;
  } catch {
    return false;
  }
}

/**
 * No journal on this device, but the account has one and this phone still holds the fingerprint-sealed
 * passphrase (the journal was removed or lost here, the seal wasn't): the fingerprint opens the account copy.
 */
export async function openFromCloudWithFingerprint(): Promise<"ok" | "none" | "mismatch" | string> {
  const rec = bioRecord();
  if (!rec) return "none";
  let pass = "";
  try {
    pass = await unlockFingerprint(rec.username);
  } catch (err) {
    return bioFailCode(err);
  }
  return (await openFromCloud(pass, { sealed: true })) ? "ok" : "mismatch";
}

/** The account copy uses another passphrase: open it, adopt that key, merge, push. */
export async function adoptRemotePassphrase(passphrase: string): Promise<boolean> {
  const remote = useCloud.getState().pendingRemote;
  if (!remote || !useJournal.getState().unlocked) return false;
  try {
    const { vk, data, used } = await openWithCandidates(passphrase, remote.envelope);
    const mine = useJournal.getState().journal;
    const remoteJournal = journalFromUnknown(data, mine.settings.language);
    const merged = mergeJournals(mine, remoteJournal);
    merged.settings = { ...merged.settings, language: mine.settings.language };
    const droppedCycles = mergeDroppedCycles(mine, remoteJournal, merged);
    hold = true;
    try {
      await useJournal.getState().rekey(vk, used);
      useJournal.getState().replaceJournal(merged);
    } finally {
      hold = false;
    }
    if (droppedCycles > 0) useJournal.getState().showToast(STR[mine.settings.language].cyMergeFull);
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

/**
 * Signs out of the account. The journal stays on this device, encrypted, with its key, behind the app lock;
 * the fingerprint stays enrolled for this account (signing back in never asks to set it up again).
 * `forget`: also remove the journal and its key from this device, so the passphrase is needed to open it here again.
 */
export async function signOut(opts: { forget?: boolean } = {}) {
  if (opts.forget) {
    await useJournal.getState().forgetDevice();
    resetSyncMeta();
  } else useJournal.getState().lock();
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
  useCloud.setState({ user: null, remote: undefined, pendingRemote: null, conflict: null, sessionGone: false });
  setPhase("signed-out");
}
