/* Staying unlocked on this device ("Ask for my passphrase").
   After an unlock, the non-extractable AES key (it can be used, never exported) is parked in
   IndexedDB together with the device's policy. On the next open, the policy decides whether it
   may be used again or must be wiped:
     open  – every time Vela is opened: only a reload in the same app session (sessionStorage token)
     15m   – back within 15 minutes of the last use
     day   – within 24 hours of the last real unlock
     week  – within 7 days of the last real unlock
     lock  – until the person taps Lock, signs out or forgets the device (default)
   The policy is a per-device choice kept in localStorage (not synced, not private). */
import type { VaultKey } from "./vault-crypto";

const DB = "vela-grace";
const STORE = "k";
const SLOT = "parked";
const SS = "vela_grace"; // per-session token (and, before this change, the old ticket)
const POLICY_LS = "vela_ask_pass";
const SEEN_LS = "vela_seen";

export type AskPolicy = "open" | "15m" | "day" | "week" | "lock";
export const ASK_POLICIES: AskPolicy[] = ["open", "15m", "day", "week", "lock"];
export const DEFAULT_POLICY: AskPolicy = "lock";
const MIN = 60_000;
export const OPEN_IDLE_MS = 5 * MIN; // "every time": idle inside the app
export const OPEN_AWAY_MS = 60_000; // "every time": in the background this long counts as closing
const AWAY_MS = 15 * MIN;
const DAY_MS = 24 * 60 * MIN;
const WEEK_MS = 7 * DAY_MS;

type Parked = VaultKey & { vaultId: string; unlockedAt: number; session?: string };
type OldTicket = { token: string; vaultId: string; exp: number };

/* ---- policy ---- */
export function readPolicy(): AskPolicy {
  try {
    const v = localStorage.getItem(POLICY_LS) as AskPolicy | null;
    if (v && ASK_POLICIES.includes(v)) return v;
    // Migration: devices from before this setting (and new ones) start on the default.
    localStorage.setItem(POLICY_LS, DEFAULT_POLICY);
  } catch {
    /* private mode: default */
  }
  return DEFAULT_POLICY;
}
export function writePolicy(p: AskPolicy) {
  try {
    localStorage.setItem(POLICY_LS, p);
  } catch {
    /* ignore */
  }
}

/* ---- last use ("away" clock) ---- */
export function readSeen() {
  try {
    return Number(localStorage.getItem(SEEN_LS)) || 0;
  } catch {
    return 0;
  }
}
let lastSeenWrite = 0;
export function markSeen(force = false) {
  const now = Date.now();
  if (!force && now - lastSeenWrite < 20_000) return;
  lastSeenWrite = now;
  try {
    localStorage.setItem(SEEN_LS, String(now));
  } catch {
    /* ignore */
  }
}

/** True when a key unlocked at `unlockedAt`, last used at `seen`, may still be used under `policy`. */
export function stillOpen(policy: AskPolicy, unlockedAt: number, seen: number, now = Date.now()) {
  switch (policy) {
    case "lock":
      return true;
    case "week":
      return now - unlockedAt <= WEEK_MS;
    case "day":
      return now - unlockedAt <= DAY_MS;
    case "15m":
      return now - (seen || unlockedAt) <= AWAY_MS;
    case "open":
      return now - (seen || unlockedAt) <= OPEN_IDLE_MS;
  }
}

/* ---- storage ---- */
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => {
      d.close();
      res(req ? (req.result as T) : undefined);
    };
    t.onerror = () => {
      d.close();
      rej(t.error);
    };
  });
}
function sessionToken(create: boolean) {
  try {
    const raw = sessionStorage.getItem(SS) || "";
    if (raw && !raw.startsWith("{")) return raw;
    if (!create) return "";
    const token = crypto.randomUUID();
    sessionStorage.setItem(SS, token);
    return token;
  } catch {
    return "";
  }
}
function oldTicket(): OldTicket | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(SS) || "null");
    return v && typeof v.token === "string" ? v : null;
  } catch {
    return null;
  }
}

/** Parks the key for this device's policy. `unlockedAt` is the time of the real unlock. */
export async function parkKey(vk: VaultKey, vaultId: string, unlockedAt: number) {
  try {
    const policy = readPolicy();
    const rec: Parked = { key: vk.key, salt: vk.salt, kdf: vk.kdf, vaultId, unlockedAt };
    if (policy === "open") rec.session = sessionToken(true);
    await tx("readwrite", (s) => {
      s.clear();
      s.put(rec, SLOT);
    });
    markSeen(true);
  } catch {
    /* staying open is a convenience only */
  }
}

export async function dropGrace() {
  try {
    sessionStorage.removeItem(SS);
  } catch {
    /* ignore */
  }
  try {
    await tx("readwrite", (s) => {
      s.clear();
    });
  } catch {
    /* ignore */
  }
}

/** The parked key if this device's policy still allows it; otherwise wipes it. */
export async function claimGrace(vaultId: string): Promise<{ vk: VaultKey; unlockedAt: number } | null> {
  const policy = readPolicy();
  try {
    let rec = (await tx<Parked>("readonly", (s) => s.get(SLOT))) ?? null;
    if (!rec) {
      // Before this change: key under a random token, ticket in sessionStorage (same-session reload).
      const t = oldTicket();
      if (t && t.vaultId === vaultId && Date.now() <= t.exp) {
        const old = (await tx<VaultKey>("readonly", (s) => s.get(t.token))) ?? null;
        if (old?.key) rec = { ...old, vaultId, unlockedAt: Date.now(), session: undefined };
      }
      if (rec) {
        try {
          sessionStorage.removeItem(SS);
        } catch {
          /* ignore */
        }
        await parkKey(rec, vaultId, rec.unlockedAt);
        return { vk: { key: rec.key, salt: rec.salt, kdf: rec.kdf }, unlockedAt: rec.unlockedAt };
      }
      await dropGrace();
      return null;
    }
    const sessionOk = policy !== "open" || (Boolean(rec.session) && rec.session === sessionToken(false));
    if (!rec.key || rec.vaultId !== vaultId || !sessionOk || !stillOpen(policy, rec.unlockedAt, readSeen())) {
      await dropGrace();
      return null;
    }
    return { vk: { key: rec.key, salt: rec.salt, kdf: rec.kdf }, unlockedAt: rec.unlockedAt };
  } catch {
    return null;
  }
}
