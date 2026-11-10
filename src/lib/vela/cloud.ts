/* Supabase client + the one encrypted row per user (public.vela_vault).
   The row only ever holds ciphertext, iv, salt and KDF params. */

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { cloudConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase-config";
import { asEnvelope, type Envelope } from "./vault-crypto";

export const TABLE = "vela_vault";
export const AUTH_STORAGE_KEY = "vela-auth";

/* "Keep me signed in" — only about the Supabase cloud session. The journal's own lock
   (passphrase / fingerprint / grace) is untouched by this.
   On (default): the session lives in localStorage until you sign out.
   Off: it lives in sessionStorage, so it ends when the app or tab is closed. */
const KEEP = "vela.keep";
const LAST = "vela.lastUser";

export function keepSignedIn(): boolean {
  try {
    return localStorage.getItem(KEEP) !== "0";
  } catch {
    return true;
  }
}

function box(on = keepSignedIn()): Storage {
  return on ? localStorage : sessionStorage;
}

/** Saves the choice and moves any existing auth entries to the matching storage,
    so nobody is signed out by switching. The owner mark (LAST) never moves: it lives in
    localStorage whatever the session choice is (see rememberUser). */
export function setKeepSignedIn(on: boolean) {
  try {
    const was = keepSignedIn();
    localStorage.setItem(KEEP, on ? "1" : "0");
    if (was === on) return;
    const from = box(was);
    const to = box(on);
    for (let i = from.length - 1; i >= 0; i -= 1) {
      const k = from.key(i);
      if (k && k.startsWith(AUTH_STORAGE_KEY)) {
        const v = from.getItem(k);
        if (v !== null) to.setItem(k, v);
        from.removeItem(k);
      }
    }
    // A mark left in sessionStorage by an older build becomes the device mark again.
    const stray = sessionStorage.getItem(LAST);
    if (stray && !localStorage.getItem(LAST)) localStorage.setItem(LAST, stray);
    sessionStorage.removeItem(LAST);
  } catch {
    /* storage unavailable */
  }
}

/** Auth storage that follows the keep choice. Same storageKey as before, so a session
    already in localStorage (every user before this option existed) is read as is. */
const authStorage = {
  getItem: (k: string) => {
    try {
      return box().getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k: string, v: string) => {
    try {
      const on = keepSignedIn();
      box(on).setItem(k, v);
      box(!on).removeItem(k);
    } catch {
      /* storage full or blocked */
    }
  },
  removeItem: (k: string) => {
    try {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

/** The last account signed in here (id + email only): the device's owner mark.
    It lives in localStorage OUTSIDE the session, whatever "keep me signed in" says — the session
    may end (closed app, expired token, no signal) without the device forgetting whose journal
    this is, so Vela opens locally and only the sync waits for a sign-in (the door rule Oscar set
    for Brizna and Faro, Nov 9 2026). Only an explicit sign-out erases the mark (forgetUser). */
export function rememberUser(u: { id: string; email: string } | null) {
  if (!u) return;
  try {
    localStorage.setItem(LAST, JSON.stringify({ id: u.id, email: u.email }));
    sessionStorage.removeItem(LAST);
  } catch {
    /* ignore */
  }
}
export function lastUser(): { id: string; email: string } | null {
  try {
    // Older builds kept the mark with the session (sessionStorage when "keep" was off): read it
    // there once and promote it to the device mark.
    let raw = localStorage.getItem(LAST);
    if (!raw) {
      raw = sessionStorage.getItem(LAST);
      if (raw) {
        localStorage.setItem(LAST, raw);
        sessionStorage.removeItem(LAST);
      }
    }
    const u = JSON.parse(raw || "null") as { id?: unknown; email?: unknown } | null;
    return u && typeof u.id === "string" ? { id: u.id, email: typeof u.email === "string" ? u.email : "" } : null;
  } catch {
    return null;
  }
}
export function forgetUser() {
  try {
    localStorage.removeItem(LAST);
    sessionStorage.removeItem(LAST);
  } catch {
    /* ignore */
  }
}

let client: SupabaseClient | null = null;
let loading: Promise<SupabaseClient | null> | null = null;

/** Lazily loads supabase-js so the offline-only build never needs it. */
export function getClient(): Promise<SupabaseClient | null> {
  if (!cloudConfigured) return Promise.resolve(null);
  if (client) return Promise.resolve(client);
  if (!loading) {
    loading = import("@supabase/supabase-js")
      .then(({ createClient }) => {
        client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: AUTH_STORAGE_KEY, storage: authStorage },
        });
        return client;
      })
      .catch(() => {
        loading = null;
        return null;
      });
  }
  return loading;
}

export type CloudUser = { id: string; email: string };

export function userFromSession(s: Session | null): CloudUser | null {
  return s?.user ? { id: s.user.id, email: s.user.email ?? "" } : null;
}

export type RemoteVault = { envelope: Envelope; revision: number; updatedAt: string } | null;

export async function pullVault(userId: string): Promise<RemoteVault> {
  const sb = await getClient();
  if (!sb) throw new Error("offline");
  const { data, error } = await sb
    .from(TABLE)
    .select("ciphertext, iv, salt, kdf, version, revision, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const envelope = asEnvelope({ v: data.version, kdf: data.kdf, salt: data.salt, iv: data.iv, ciphertext: data.ciphertext });
  if (!envelope) throw new Error("bad-row");
  return { envelope, revision: Number(data.revision) || 0, updatedAt: String(data.updated_at ?? "") };
}

export type PushResult = { ok: true; revision: number } | { ok: false; conflict: true };

/** Optimistic concurrency: only writes when the row is still at baseRevision. */
export async function pushVault(userId: string, env: Envelope, baseRevision: number): Promise<PushResult> {
  const sb = await getClient();
  if (!sb) throw new Error("offline");
  const row = { ciphertext: env.ciphertext, iv: env.iv, salt: env.salt, kdf: env.kdf, version: env.v };
  if (baseRevision === 0) {
    const { data, error } = await sb.from(TABLE).insert({ ...row, user_id: userId, revision: 1 }).select("revision").maybeSingle();
    if (error) {
      if (error.code === "23505") return { ok: false, conflict: true };
      throw error;
    }
    return { ok: true, revision: Number(data?.revision) || 1 };
  }
  const { data, error } = await sb
    .from(TABLE)
    .update({ ...row, revision: baseRevision + 1 })
    .eq("user_id", userId)
    .eq("revision", baseRevision)
    .select("revision");
  if (error) throw error;
  if (!data || data.length === 0) return { ok: false, conflict: true };
  return { ok: true, revision: Number(data[0].revision) || baseRevision + 1 };
}
