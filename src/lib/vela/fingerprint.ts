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

function bioBytes(n: number) {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return bytes;
}

function bytesToB64(bytes: Uint8Array) {
  let text = "";
  for (let i = 0; i < bytes.length; i += 1) text += String.fromCharCode(bytes[i]);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64ToBytes(value: string) {
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
    .then((buf) => new TextDecoder().decode(buf));
}

function webAuthnCreate(profileKey: string) {
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

export function unlockFingerprint(profileKey: string, mediation?: CredentialMediationRequirement) {
  const rec = bioForUser(profileKey);
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
  const options: CredentialRequestOptions = { publicKey: request };
  if (mediation) options.mediation = mediation;
  return navigator.credentials.get(options).then((assertion) => {
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

let bioAsked = false;
let bioPlainTried = false;

export function resetFingerprintPrompt() {
  bioAsked = false;
  bioPlainTried = false;
}

export function askFingerprintOnOpen(
  profileKey: string,
  tryOpen: (passphrase: string) => Promise<boolean>,
  onFail: (code: "insecure" | "unsupported" | "already" | "missing" | "failed" | "mismatch") => void,
) {
  if (bioAsked) return;
  if (!bioForUser(profileKey) || !bioSupported()) return;
  bioAsked = true;
  const opened = (passphrase: string) => {
    void tryOpen(passphrase).then((ok) => {
      if (ok) return;
      clearFingerprint();
      bioAsked = false;
      onFail("mismatch");
    });
  };
  const quiet = (err: unknown) => {
    const code = bioFailCode(err);
    if (code === "cancel") return;
    if (!bioPlainTried && code === "unsupported") {
      bioPlainTried = true;
      unlockFingerprint(profileKey).then(opened).catch(quiet);
      return;
    }
    onFail(code);
  };
  unlockFingerprint(profileKey, "immediate" as CredentialMediationRequirement).then(opened).catch(quiet);
}
