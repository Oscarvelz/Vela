/* Device fingerprint unlock for Vela.
   Needs a secure page (https) and a phone fingerprint.
   The fingerprint wraps the journal passphrase on this device only:
   - with WebAuthn PRF, the authenticator's secret is the AES-GCM key;
   - otherwise a non-extractable device key kept in IndexedDB is used.
   The record is tied to this device's vault id; a new passphrase or a new
   journal clears it, and the user adds the fingerprint again. */

const BIO_LS = "vela-fingerprint";
const BIO_DB = "vela-bio";

export type BioRecord = {
  username: string;
  credentialId: string;
  prf: boolean;
  salt?: string;
  keyId?: string;
  iv: string;
  data: string;
};

type Made = {
  cred: PublicKeyCredential;
  salt: Uint8Array;
  prf: Uint8Array | null;
};

export function bioBytes(n: number) {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function bytesToB64(bytes: Uint8Array) {
  let text = "";
  for (let i = 0; i < bytes.length; i += 1) text += String.fromCharCode(bytes[i]);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function b64ToBytes(value: string) {
  let padded = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  while (padded.length % 4) padded += "=";
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export function bioSupported() {
  return Boolean(window.isSecureContext && window.PublicKeyCredential && navigator.credentials && crypto.subtle);
}

export function bioRecord(): BioRecord | null {
  try {
    const raw = localStorage.getItem(BIO_LS);
    if (!raw) return null;
    const rec = JSON.parse(raw) as BioRecord;
    if (!rec || !rec.username || !rec.credentialId || !rec.iv || !rec.data) return null;
    return rec;
  } catch {
    return null;
  }
}

export function bioForUser(profileKey: string) {
  const rec = bioRecord();
  if (!rec || !profileKey) return null;
  if (rec.username !== profileKey) return null;
  return rec;
}

/**
 * The sealed passphrase on this device, for this journal if possible, otherwise whatever this device sealed
 * (the journal id can drift: a journal re-adopted from the account gets a new id). Only a candidate: the
 * passphrase it holds still has to open the journal before anything is used.
 */
export function bioCandidate(vaultId: string) {
  return bioForUser(vaultId) ?? bioRecord();
}

/** The sealed passphrase opened this journal under another id: tie it to this one (no prompt, same seal). */
export function rebindFingerprint(vaultId: string) {
  const rec = bioRecord();
  if (!rec || !vaultId || rec.username === vaultId) return;
  try {
    localStorage.setItem(BIO_LS, JSON.stringify({ ...rec, username: vaultId }));
  } catch {
    /* keep going */
  }
}

function openBioDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(BIO_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains("keys")) req.result.createObjectStore("keys");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function bioPutKey(id: string, key: CryptoKey) {
  return openBioDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction("keys", "readwrite");
        tx.objectStore("keys").put(key, id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }),
  );
}

function bioGetKey(id: string) {
  return openBioDb().then(
    (db) =>
      new Promise<CryptoKey | null>((resolve, reject) => {
        const tx = db.transaction("keys", "readonly");
        const req = tx.objectStore("keys").get(id);
        req.onsuccess = () => resolve((req.result as CryptoKey) || null);
        req.onerror = () => reject(req.error);
      }),
  );
}

function bioDeleteKey(id: string) {
  if (!id) return Promise.resolve();
  return openBioDb()
    .then(
      (db) =>
        new Promise<void>((resolve) => {
          const tx = db.transaction("keys", "readwrite");
          tx.objectStore("keys").delete(id);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        }),
    )
    .catch(() => undefined);
}

export function clearFingerprint() {
  const rec = bioRecord();
  try {
    localStorage.removeItem(BIO_LS);
  } catch {
    /* keep going */
  }
  if (rec?.keyId) void bioDeleteKey(rec.keyId);
}

function prfSecret(cred: PublicKeyCredential) {
  try {
    const ext = cred.getClientExtensionResults() as {
      prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } };
    };
    const first = ext?.prf?.results?.first;
    if (first && first.byteLength) return new Uint8Array(first);
  } catch {
    /* extension missing */
  }
  return null;
}

function prfEnabled(cred: PublicKeyCredential) {
  try {
    const ext = cred.getClientExtensionResults() as { prf?: { enabled?: boolean } };
    return Boolean(ext.prf?.enabled);
  } catch {
    return false;
  }
}

export function bioFailCode(err: unknown) {
  const name = err && typeof err === "object" && "name" in err ? String((err as { name?: string }).name) : "";
  if (name === "NotAllowedError" || name === "AbortError") return "cancel" as const;
  if (name === "SecurityError") return "insecure" as const;
  if (name === "NotSupportedError" || name === "TypeError") return "unsupported" as const;
  if (name === "InvalidStateError") return "already" as const;
  const message = err instanceof Error ? err.message : "";
  if (message.includes("missing") || message.includes("didn't confirm")) return "missing" as const;
  return "failed" as const;
}

function encryptPin(key: CryptoKey, pin: string) {
  const iv = bioBytes(12);
  return crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(pin)).then((ct) => ({
    iv: bytesToB64(iv),
    data: bytesToB64(new Uint8Array(ct)),
  }));
}

function decryptPin(key: CryptoKey, rec: BioRecord) {
  return crypto.subtle
    .decrypt({ name: "AES-GCM", iv: b64ToBytes(rec.iv) }, key, b64ToBytes(rec.data))
    .then((buf) => new TextDecoder().decode(buf))
    .catch(() => {
      // The sealed copy can't be opened any more (damaged or from an old key).
      throw new Error("Fingerprint data on this device is missing. Add it again in Settings.");
    });
}

export function webAuthnCreate(profileKey: string) {
  const salt = bioBytes(32);
  return navigator.credentials
    .create({
      publicKey: {
        challenge: bioBytes(32),
        rp: { name: "Vela" },
        user: {
          id: new TextEncoder().encode(`vela:${profileKey}`),
          name: "Vela",
          displayName: "Vela",
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        timeout: 60000,
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          residentKey: "preferred",
          userVerification: "required",
        },
        attestation: "none",
        extensions: { prf: { eval: { first: salt } } },
      } as PublicKeyCredentialCreationOptions,
    })
    .then((cred) => {
      if (!cred || cred.type !== "public-key") throw new Error("Fingerprint was cancelled.");
      const made = cred as PublicKeyCredential;
      const secret = prfSecret(made);
      if (secret) return { cred: made, salt, prf: secret } satisfies Made;
      if (!prfEnabled(made)) return { cred: made, salt, prf: null } satisfies Made;
      return navigator.credentials
        .get({
          publicKey: {
            challenge: bioBytes(32),
            allowCredentials: [{ type: "public-key", id: made.rawId }],
            userVerification: "required",
            timeout: 60000,
            extensions: { prf: { eval: { first: salt } } },
          } as PublicKeyCredentialRequestOptions,
        })
        .then((assertion) => ({
          cred: made,
          salt,
          prf: assertion && assertion.type === "public-key" ? prfSecret(assertion as PublicKeyCredential) : null,
        }));
    });
}

function saveBioRecord(rec: BioRecord) {
  sealFailedMem = false;
  const prev = bioRecord();
  localStorage.setItem(BIO_LS, JSON.stringify(rec));
  if (prev?.keyId && prev.keyId !== rec.keyId) void bioDeleteKey(prev.keyId);
}

export function enrollFingerprint(pin: string, profileKey: string) {
  if (!profileKey) return Promise.reject(new Error("Enter your PIN first."));
  return webAuthnCreate(profileKey).then((made) => {
    const credId = bytesToB64(new Uint8Array(made.cred.rawId));
    if (made.prf) {
      return crypto.subtle.importKey("raw", made.prf, "AES-GCM", false, ["encrypt"]).then((key) =>
        encryptPin(key, pin).then((box) => {
          saveBioRecord({
            username: profileKey,
            credentialId: credId,
            prf: true,
            salt: bytesToB64(made.salt),
            iv: box.iv,
            data: box.data,
          });
        }),
      );
    }
    return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]).then((key) => {
      const keyId = bytesToB64(bioBytes(16));
      return bioPutKey(keyId, key).then(() => encryptPin(key, pin)).then((box) => {
        saveBioRecord({
          username: profileKey,
          credentialId: credId,
          prf: false,
          keyId,
          iv: box.iv,
          data: box.data,
        });
      });
    });
  });
}

export function unlockFingerprint(profileKey: string) {
  const rec = bioCandidate(profileKey);
  if (!rec) return Promise.reject(new Error("Fingerprint isn't set up for this account on this device."));
  const request: PublicKeyCredentialRequestOptions = {
    challenge: bioBytes(32),
    allowCredentials: [{ type: "public-key", id: b64ToBytes(rec.credentialId) }],
    userVerification: "required",
    timeout: 60000,
  };
  if (rec.prf && rec.salt) {
    request.extensions = { prf: { eval: { first: b64ToBytes(rec.salt) } } } as AuthenticationExtensionsClientInputs;
  }
  return navigator.credentials.get({ publicKey: request }).then((assertion) => {
    if (!assertion || assertion.type !== "public-key") throw new Error("Fingerprint was cancelled.");
    const cred = assertion as PublicKeyCredential;
    if (rec.prf) {
      const secret = prfSecret(cred);
      if (!secret) throw new Error("This device didn't confirm the fingerprint key. Remove it in Settings and add it again.");
      return crypto.subtle.importKey("raw", secret, "AES-GCM", false, ["decrypt"]).then((key) => decryptPin(key, rec));
    }
    return bioGetKey(rec.keyId || "").then((key) => {
      if (!key) throw new Error("Fingerprint data on this device is missing. Add it again in Settings.");
      return decryptPin(key, rec);
    });
  });
}

/* ---------- session memory ----------
   While the journal is open, the passphrase it was opened with is kept in this
   tab's memory only (the derived key is in memory too), so fingerprint can be
   turned on with one tap. Locking forgets it. Never written anywhere. */
let sessionPassMem = "";
export function rememberPass(passphrase: string) {
  sessionPassMem = passphrase;
}
export function sessionPass() {
  return sessionPassMem;
}

/** Called on lock: forget the passphrase held for this session. */
export function resetFingerprintPrompt() {
  sessionPassMem = "";
}

/** True when this phone has a fingerprint / screen-lock authenticator WebAuthn can use. */
export function platformAvailable(): Promise<boolean> {
  if (!bioSupported()) return Promise.resolve(false);
  try {
    const fn = PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable;
    if (typeof fn !== "function") return Promise.resolve(true);
    return fn.call(PublicKeyCredential).catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}

/** Ask the browser to keep Vela's storage (so the journal key and the fingerprint seal are never evicted). */
export function keepStorage(): Promise<boolean | null> {
  try {
    const st = navigator.storage;
    if (!st?.persist) return Promise.resolve(null);
    return st
      .persisted()
      .then((already) => (already ? true : st.persist()))
      .catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}
export function storagePersisted(): Promise<boolean | null> {
  try {
    return navigator.storage?.persisted ? navigator.storage.persisted().catch(() => null) : Promise.resolve(null);
  } catch {
    return Promise.resolve(null);
  }
}

/** Does the device-key mode seal still have its key (IndexedDB "vela-bio")? Diagnostics only. */
export function bioKeyPresent(): Promise<boolean | null> {
  const rec = bioRecord();
  if (!rec) return Promise.resolve(null);
  if (rec.prf) return Promise.resolve(true);
  return bioGetKey(rec.keyId || "")
    .then((k) => Boolean(k))
    .catch(() => false);
}

/* ---------- "don't ask again" on this device ---------- */
const SKIP_LS = "vela-bio-skip";
export function offerSkipped(vaultId: string) {
  try {
    return Boolean(vaultId) && localStorage.getItem(SKIP_LS) === vaultId;
  } catch {
    return false;
  }
}
export function setOfferSkipped(vaultId: string, skip: boolean) {
  try {
    if (skip) localStorage.setItem(SKIP_LS, vaultId);
    else localStorage.removeItem(SKIP_LS);
  } catch {
    /* keep going */
  }
}

/** Enroll with the passphrase held for this session (one tap after unlock). */
export function enrollWithSession(vaultId: string) {
  const pass = sessionPassMem;
  if (!pass) return Promise.reject(new Error("Enter your passphrase first."));
  return enrollFingerprint(pass, vaultId).then(() => {
    setOfferSkipped(vaultId, false);
    keepStorage();
  });
}

/**
 * The passphrase changed: seal the new one with the same fingerprint.
 * Device-key mode needs no prompt; PRF mode asks for the fingerprint once.
 * If that fails the old record is removed (it would only hold the old passphrase).
 */
export function rewrapFingerprint(passphrase: string, vaultId: string): Promise<"none" | "ok" | "cleared"> {
  const rec = bioForUser(vaultId);
  if (!rec) {
    clearFingerprint();
    return Promise.resolve("none");
  }
  const seal = (key: CryptoKey) =>
    encryptPin(key, passphrase).then((box) => {
      saveBioRecord({ ...rec, iv: box.iv, data: box.data });
      return "ok" as const;
    });
  const work = rec.prf
    ? navigator.credentials
        .get({
          publicKey: {
            challenge: bioBytes(32),
            allowCredentials: [{ type: "public-key", id: b64ToBytes(rec.credentialId) }],
            userVerification: "required",
            timeout: 60000,
            extensions: { prf: { eval: { first: b64ToBytes(rec.salt || "") } } },
          } as PublicKeyCredentialRequestOptions,
        })
        .then((assertion) => {
          const secret = assertion ? prfSecret(assertion as PublicKeyCredential) : null;
          if (!secret) throw new Error("missing");
          return crypto.subtle.importKey("raw", secret, "AES-GCM", false, ["encrypt"]).then(seal);
        })
    : bioGetKey(rec.keyId || "").then((key) => {
        if (!key) throw new Error("missing");
        return seal(key);
      });
  return work.catch(() => {
    clearFingerprint();
    return "cleared" as const;
  });
}

export type BioOutcome =
  | { ok: true }
  | { ok: false; code: "cancel" | "insecure" | "unsupported" | "already" | "missing" | "failed" | "mismatch" | "busy" };

let inFlight = false;
let bioStale = false;
let sealFailedMem = false;
/** The sealed passphrase couldn't be opened this session (no PRF output, device key gone…): seal it anew. */
export function sealFailed() {
  return sealFailedMem;
}
/** The fingerprint opened an older passphrase: re-seal it after the next passphrase unlock. */
export function bioIsStale() {
  return bioStale;
}
export function setBioStale(v: boolean) {
  bioStale = v;
}

/**
 * One fingerprint unlock attempt. A stale record (wrong passphrase / lost key) is
 * removed so the passphrase path takes over cleanly.
 */
export async function fingerprintUnlock(vaultId: string, tryOpen: (passphrase: string) => Promise<boolean>): Promise<BioOutcome> {
  if (inFlight) return { ok: false, code: "busy" };
  inFlight = true;
  try {
    const pass = await unlockFingerprint(vaultId);
    const opened = await tryOpen(pass);
    if (opened) {
      sessionPassMem = pass;
      bioStale = false;
      sealFailedMem = false;
      rebindFingerprint(vaultId);
      return { ok: true };
    }
    // The sealed passphrase no longer opens this journal (changed in another window or device) or
    // the journal couldn't be read just now. Keep the fingerprint: the next passphrase unlock
    // re-seals it, so it works again without setting it up from scratch.
    bioStale = true;
    return { ok: false, code: "mismatch" };
  } catch (err) {
    sealFailedMem = true;
    // Never delete the sealed passphrase here. A phone that doesn't hand back the fingerprint key this once
    // (PRF not returned, a provider hiccup) would otherwise lose it for good and ask for the passphrase from
    // then on. It is replaced only by a new seal (after the passphrase is typed) or removed on purpose.
    return { ok: false, code: bioFailCode(err) };
  } finally {
    inFlight = false;
  }
}
