/* Refresh grace: keeps the journal open across a reload (pull-to-refresh) in the same app session.
   The non-extractable AES key is parked in IndexedDB under a random token; the token lives only in
   sessionStorage, which dies when the app/tab is closed. Lock, expiry or a new session wipes it. */
import type { VaultKey } from "./vault-crypto";

const DB = "vela-grace";
const STORE = "k";
const SS = "vela_grace";
const MAX_IDLE_MIN = 15;

type Ticket = { token: string; vaultId: string; exp: number };

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
    t.oncomplete = () => { d.close(); res(req ? (req.result as T) : undefined); };
    t.onerror = () => { d.close(); rej(t.error); };
  });
}
function ticket(): Ticket | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(SS) || "null");
    return v && typeof v.token === "string" ? v : null;
  } catch {
    return null;
  }
}
function idleMs(autoLockMins: number) {
  return (autoLockMins > 0 ? Math.min(autoLockMins, MAX_IDLE_MIN) : MAX_IDLE_MIN) * 60_000;
}

export async function parkKey(vk: VaultKey, vaultId: string, autoLockMins: number) {
  try {
    const token = crypto.randomUUID();
    await tx("readwrite", (s) => { s.clear(); s.put(vk, token); });
    sessionStorage.setItem(SS, JSON.stringify({ token, vaultId, exp: Date.now() + idleMs(autoLockMins) } satisfies Ticket));
  } catch {
    /* grace is a convenience only */
  }
}

let lastBump = 0;
export function bumpGrace(autoLockMins: number) {
  const now = Date.now();
  if (now - lastBump < 20_000) return;
  lastBump = now;
  const t = ticket();
  if (!t) return;
  t.exp = now + idleMs(autoLockMins);
  try { sessionStorage.setItem(SS, JSON.stringify(t)); } catch { /* ignore */ }
}

export async function dropGrace() {
  try { sessionStorage.removeItem(SS); } catch { /* ignore */ }
  try { await tx("readwrite", (s) => { s.clear(); }); } catch { /* ignore */ }
}

/** Returns the parked key if this same session reloaded within the idle window; otherwise wipes it. */
export async function claimGrace(vaultId: string): Promise<VaultKey | null> {
  const t = ticket();
  if (!t || t.vaultId !== vaultId || Date.now() > t.exp) {
    await dropGrace();
    return null;
  }
  try {
    const vk = (await tx<VaultKey>("readonly", (s) => s.get(t.token))) ?? null;
    if (!vk || !vk.key) { await dropGrace(); return null; }
    return vk;
  } catch {
    return null;
  }
}
