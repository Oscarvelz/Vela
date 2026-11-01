/* The journal key kept on this device.
   The passphrase is for encryption only (Oscar, Nov 1 2026). After it is entered once on a device, the AES key
   it derives (PBKDF2-SHA256 600k → AES-GCM-256, non-extractable: it can be used here, never read or exported)
   is parked in IndexedDB and stays across closes, locks and updates. What Vela asks for on open is the app
   lock (app-lock.ts), not the passphrase.
   The key is wiped only when the journal is removed from this device (forget device / sign out with
   "remove from this device"), when a new journal replaces it, or when it no longer opens the journal
   (passphrase changed elsewhere) — those are the only times the passphrase is asked again. */
import type { VaultKey } from "./vault-crypto";

const DB = "vela-grace";
const STORE = "k";
const SLOT = "parked";
const SS = "vela_grace"; // builds before "Ask for my passphrase" kept a session ticket here

type Parked = VaultKey & { vaultId: string; unlockedAt: number; session?: string };
type OldTicket = { token: string; vaultId: string; exp: number };

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
function oldTicket(): OldTicket | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(SS) || "null");
    return v && typeof v.token === "string" ? v : null;
  } catch {
    return null;
  }
}

/** Keeps the key on this device for this journal (replaces any other). */
export async function parkKey(vk: VaultKey, vaultId: string, unlockedAt = Date.now()) {
  try {
    const rec: Parked = { key: vk.key, salt: vk.salt, kdf: vk.kdf, vaultId, unlockedAt };
    await tx("readwrite", (s) => {
      s.clear();
      s.put(rec, SLOT);
    });
    return true;
  } catch {
    return false;
  }
}

/** Wipes the key from this device. */
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

/**
 * The key parked for this journal, or null. Keys from the "Ask for my passphrase" build are used as they are
 * (whatever that build's choice was), so updating never asks for the passphrase when a key is there.
 */
export async function claimGrace(vaultId: string): Promise<{ vk: VaultKey; unlockedAt: number } | null> {
  try {
    let rec = (await tx<Parked>("readonly", (s) => s.get(SLOT))) ?? null;
    if (!rec) {
      // Older still: key under a random token, ticket in sessionStorage (same-session reload).
      const t = oldTicket();
      if (t && t.vaultId === vaultId && Date.now() <= t.exp) {
        const old = (await tx<VaultKey>("readonly", (s) => s.get(t.token))) ?? null;
        if (old?.key) rec = { ...old, vaultId, unlockedAt: Date.now() };
      }
      if (!rec) return null;
      try {
        sessionStorage.removeItem(SS);
      } catch {
        /* ignore */
      }
      await parkKey(rec, vaultId, rec.unlockedAt);
    }
    if (!rec.key || rec.vaultId !== vaultId) return null;
    return { vk: { key: rec.key, salt: rec.salt, kdf: rec.kdf }, unlockedAt: rec.unlockedAt };
  } catch {
    return null;
  }
}
