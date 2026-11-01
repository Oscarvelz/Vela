/* End-to-end encryption for the Vela journal.
   A key is derived from the user's passphrase with PBKDF2-SHA256 (600,000 rounds,
   random 16-byte salt). The whole journal is sealed with AES-GCM 256 and a fresh
   random 12-byte IV on every save. Only the sealed envelope ever leaves memory. */

export const KDF_ITERATIONS = 600_000;
export const ENVELOPE_VERSION = 1;
export const MIN_PASSPHRASE = 8;

export type KdfParams = { name: "PBKDF2"; hash: "SHA-256"; iterations: number };

export type Envelope = {
  v: number;
  kdf: KdfParams;
  salt: string;
  iv: string;
  ciphertext: string;
};

export type VaultKey = { key: CryptoKey; salt: string; kdf: KdfParams };

export function defaultKdf(): KdfParams {
  return { name: "PBKDF2", hash: "SHA-256", iterations: KDF_ITERATIONS };
}

export function randomBytes(n: number) {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function toB64(bytes: Uint8Array) {
  let text = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    text += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(text);
}

export function fromB64(value: string) {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export function validKdf(raw: unknown): KdfParams | null {
  if (!raw || typeof raw !== "object") return null;
  const k = raw as Partial<KdfParams>;
  if (k.name !== "PBKDF2" || k.hash !== "SHA-256") return null;
  const iterations = Number(k.iterations);
  if (!Number.isFinite(iterations) || iterations < 100_000 || iterations > 10_000_000) return null;
  return { name: "PBKDF2", hash: "SHA-256", iterations: Math.floor(iterations) };
}

export async function deriveKey(passphrase: string, salt: string, kdf: KdfParams = defaultKdf(), normalize = true): Promise<VaultKey> {
  const text = normalize ? passphrase.normalize("NFC") : passphrase;
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(text), "PBKDF2", false, [
    "deriveKey",
  ]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: kdf.hash, iterations: kdf.iterations, salt: fromB64(salt) },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  return { key, salt, kdf };
}

export async function newVaultKey(passphrase: string) {
  return deriveKey(passphrase, toB64(randomBytes(16)), defaultKdf());
}

export async function seal(vk: VaultKey, data: unknown): Promise<Envelope> {
  const iv = randomBytes(12);
  const plain = new TextEncoder().encode(JSON.stringify(data));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, vk.key, plain);
  return { v: ENVELOPE_VERSION, kdf: vk.kdf, salt: vk.salt, iv: toB64(iv), ciphertext: toB64(new Uint8Array(ct)) };
}

/** Throws when the key is wrong or the data was tampered with. */
export async function open<T = unknown>(vk: VaultKey, env: Envelope): Promise<T> {
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(env.iv) }, vk.key, fromB64(env.ciphertext));
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

export function asEnvelope(raw: unknown): Envelope | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Partial<Envelope>;
  const kdf = validKdf(e.kdf);
  if (!kdf || typeof e.salt !== "string" || typeof e.iv !== "string" || typeof e.ciphertext !== "string") return null;
  return { v: Number(e.v) || 1, kdf, salt: e.salt, iv: e.iv, ciphertext: e.ciphertext };
}

/** Opens an envelope with the passphrase, deriving with the envelope's own salt. */
export async function openWithPassphrase<T = unknown>(passphrase: string, env: Envelope) {
  const vk = await deriveKey(passphrase, env.salt, env.kdf);
  const data = await open<T>(vk, env);
  return { vk, data };
}

/* ---- what a phone keyboard may have changed ----
   The passphrase is always tried exactly as typed first (NFC, as it was created). Only when
   that fails are a few look-alike spellings tried, each one a full PBKDF2 + AES-GCM check
   against the journal itself, so nothing about the key, salt or iterations is weakened:
   - the raw string without Unicode normalization (journals made before NFC was applied),
   - NFKC (full-width / compatibility characters some keyboards insert),
   - leading/trailing whitespace removed and no-break spaces turned into spaces
     (swipe typing and suggestion taps add a trailing space),
   - "smart" punctuation turned back into plain ASCII (’ ‘ “ ” – — …).
   Case is never changed. */
export type Candidate = { text: string; normalize: boolean };

function plainSpaces(v: string) {
  return v.replace(/[\u00a0\u2007\u202f]/g, " ");
}
function trimmed(v: string) {
  return plainSpaces(v).replace(/^[\s\u200b\ufeff]+|[\s\u200b\ufeff]+$/g, "");
}
function desmart(v: string) {
  return v
    .replace(/[\u2018\u2019\u201a\u2032]/g, "'")
    .replace(/[\u201c\u201d\u201e\u2033]/g, '"')
    .replace(/\u2014/g, "--")
    .replace(/[\u2013\u2212]/g, "-")
    .replace(/\u2026/g, "...");
}

export function passphraseCandidates(typed: string): Candidate[] {
  const out: Candidate[] = [{ text: typed, normalize: true }];
  const seen = new Set([typed.normalize("NFC")]);
  const add = (text: string, normalize = true) => {
    const id = normalize ? text.normalize("NFC") : `raw:${text}`;
    if (!text || seen.has(id) || (!normalize && seen.has(text))) return;
    seen.add(id);
    out.push({ text, normalize });
  };
  if (typed !== typed.normalize("NFC")) add(typed, false);
  const nfkc = typed.normalize("NFKC");
  add(nfkc);
  add(trimmed(typed));
  add(desmart(typed));
  add(desmart(trimmed(nfkc)));
  return out.slice(0, 6);
}

/** Opens an envelope with what was typed, trying the exact passphrase first, then the look-alikes. */
export async function openWithCandidates<T = unknown>(typed: string, env: Envelope) {
  for (const c of passphraseCandidates(typed)) {
    try {
      const vk = await deriveKey(c.text, env.salt, env.kdf, c.normalize);
      const data = await open<T>(vk, env);
      return { vk, data, used: c.text, exact: c.text === typed && c.normalize };
    } catch {
      /* next candidate */
    }
  }
  throw new Error("wrong passphrase");
}
