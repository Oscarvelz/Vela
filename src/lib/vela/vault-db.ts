/* Device storage. The journal is kept in IndexedDB only as an encrypted envelope.
   Small, non-private display preferences (theme, day/night, language, discreet)
   stay in localStorage so the lock screen can paint before unlock. */

import type { Envelope } from "./vault-crypto";

const DB_NAME = "vela-vault";
const STORE = "kv";

export type LocalVault = { vaultId: string; envelope: Envelope; savedAt: number };
export type SyncMeta = { userId: string; baseRevision: number; dirty: boolean };

let dbp: Promise<IDBDatabase> | null = null;

function db() {
  if (!dbp) {
    const p = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => {
        const d = req.result;
        // The browser may close the connection (storage cleanup, another version): open a fresh one next time.
        d.onclose = () => {
          if (dbp === p) dbp = null;
        };
        resolve(d);
      };
      req.onerror = () => reject(req.error);
    });
    // A failed open is never cached: the next read tries again instead of failing for the rest of the session.
    p.catch(() => {
      if (dbp === p) dbp = null;
    });
    dbp = p;
  }
  return dbp;
}

async function get<T>(key: string): Promise<T | null> {
  const d = await db();
  return new Promise<T | null>((resolve, reject) => {
    const req = d.transaction(STORE, "readonly").objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function put(key: string, value: unknown) {
  const d = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = d.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function del(key: string) {
  const d = await db();
  return new Promise<void>((resolve) => {
    const tx = d.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export const readVault = () => get<LocalVault>("vault");
export const writeVault = (v: LocalVault) => put("vault", v);
export const deleteVault = () => del("vault");

export const readSync = () => get<SyncMeta>("sync");
export const writeSync = (m: SyncMeta) => put("sync", m);
export const deleteSync = () => del("sync");

/* ---- display preferences (not private) ---- */
export const UI_KEY = "vela_ui";
export type UiPrefs = { theme?: string; mode?: string; language?: "en" | "es"; discreet?: boolean };

export function readUi(): UiPrefs {
  try {
    const raw = localStorage.getItem(UI_KEY);
    return raw ? (JSON.parse(raw) as UiPrefs) : {};
  } catch {
    return {};
  }
}

export function writeUi(p: UiPrefs) {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}
