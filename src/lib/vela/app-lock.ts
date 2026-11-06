/* App lock, the way Journey does it (Oscar, Nov 1 2026: "The phrase word should be for encryption purposes,
   not to work like a second password every single time").

   - The thing Vela asks for on open is the phone's own fingerprint / screen lock (a WebAuthn platform
     credential with userVerification "required", so the device PIN or pattern works too). The check runs on
     the device; nothing is uploaded.
   - The passphrase is for encryption only. The key it derives is parked on the device (grace.ts) and stays
     there across closes and locks; locking only hides the journal behind this gate.
   - Vela locks when you leave it for longer than the chosen time (10 s by default) and on every fresh launch.
     Brief blips, a file/photo picker opened from inside Vela, the fingerprint prompt itself and the silent
     reload that installs an update never lock.
   - The credential is kept per owner (the signed-in account, or "local" when there is none), like Faro's
     faro.lock.<uid>, so signing out and back in, or removing the journal from this device, never asks to set
     the fingerprint up again. All of this is per device and not private (localStorage). */
import { inAndroidApp, nativeAuth, nativeCanAuth } from "./native";
import { b64ToBytes, bioBytes, bioFailCode, bioForUser, bioRecord, bioSupported, bytesToB64, enrollFingerprint, keepStorage } from "./fingerprint";

const OWNER_LS = "vela.lock.owner";
const REC_LS = (owner: string) => `vela.lock.${owner}`;
const ON_LS = "vela.applock";
const AFTER_LS = "vela.lock.after";
const SEEN_LS = "vela.lock.seen";
const OFFERED_LS = (owner: string) => `vela.lock.offered.${owner}`;
const MIGRATED_LS = "vela.lock.v2";
const QUIET_SS = "vela-quiet-boot";

export const LOCK_AFTER_OPTIONS = [0, 10_000, 60_000, 300_000] as const;
export const DEFAULT_LOCK_AFTER = 10_000;
/** A reload right after use (installing an update) reopens without the gate only this soon after. */
const QUIET_WINDOW_MS = 60_000;
/** A hide this soon after tapping a file input is the picker, not leaving. */
const PICKER_MS = 3_000;

export type LockRecord = { credentialId: string; at: number };
/** Vela for Android: the app lock is the phone's own prompt (no WebAuthn credential), recorded under this id. */
export const NATIVE_LOCK_ID = "android-prompt";

function lsGet(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode: per-session only */
  }
}

/* ---- owner ---- */
export function lockOwner(): string {
  return lsGet(OWNER_LS) || "local";
}
function ownerSet() {
  return Boolean(lsGet(OWNER_LS));
}
/**
 * A cloud account is signed in. The journal on this device becomes that account's, and the fingerprint
 * follows it. `trusted` is true when the journal is open (or there is none): a sign-in made on a locked
 * screen never moves the lock to an account without a fingerprint.
 */
export function adoptOwner(uid: string, trusted: boolean) {
  if (!uid) return;
  const cur = lockOwner();
  if (cur === uid) return;
  if (ownerSet() && !trusted) return;
  const prev = lockRecord(cur) ?? lockRecord();
  if (prev && !lockRecord(uid)) lsSet(REC_LS(uid), JSON.stringify({ credentialId: prev.credentialId, at: prev.at || Date.now() }));
  lsSet(OWNER_LS, uid);
}

/* ---- the credential ---- */
function readRecord(key: string): LockRecord | null {
  try {
    const rec = JSON.parse(lsGet(key) || "null") as LockRecord | null;
    return rec && typeof rec.credentialId === "string" && rec.credentialId ? rec : null;
  } catch {
    return null;
  }
}
const NOT_RECORDS = new Set([OWNER_LS, AFTER_LS, SEEN_LS, MIGRATED_LS]);
/** Every app-lock credential kept on this device, whoever it was saved for. */
function deviceRecords(): LockRecord[] {
  const out: LockRecord[] = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith("vela.lock.") || NOT_RECORDS.has(k) || k.startsWith("vela.lock.offered.")) continue;
      const rec = readRecord(k);
      if (rec) out.push(rec);
    }
  } catch {
    /* storage blocked */
  }
  return out.sort((a, b) => (b.at || 0) - (a.at || 0));
}
export type LockSource = "owner" | "local" | "other" | "sealed" | "none";
/**
 * Where this device's fingerprint enrolment was found. The fingerprint belongs to the phone, not to whoever
 * is signed in, so an enrolment saved for another owner (signed out, the account not known yet at boot, a
 * session still loading or offline) or only as the sealed passphrase still counts: Vela never decides
 * "no fingerprint here" just because it couldn't tell whose it was.
 */
export function lockSource(): LockSource {
  const owner = lockOwner();
  if (readRecord(REC_LS(owner))) return "owner";
  if (owner !== "local" && readRecord(REC_LS("local"))) return "local";
  if (deviceRecords().length) return "other";
  if (bioRecord()) return "sealed";
  return "none";
}
/** `owner` given: exactly that owner's record. No owner: this device's enrolment, found wherever it was kept. */
export function lockRecord(owner?: string): LockRecord | null {
  if (owner !== undefined) return readRecord(REC_LS(owner));
  const own = lockOwner();
  const exact = readRecord(REC_LS(own)) ?? (own !== "local" ? readRecord(REC_LS("local")) : null) ?? deviceRecords()[0] ?? null;
  if (exact) return exact;
  const sealed = bioRecord();
  return sealed ? { credentialId: sealed.credentialId, at: 0 } : null;
}
/** Copies an enrolment found elsewhere on this device to the current owner, so it is found directly next time. */
export function healLockRecord() {
  const own = lockOwner();
  if (readRecord(REC_LS(own))) return;
  const found = lockRecord();
  if (found) lsSet(REC_LS(own), JSON.stringify({ credentialId: found.credentialId, at: found.at || Date.now() } satisfies LockRecord));
}
function saveRecord(credentialId: string, owner = lockOwner()) {
  lsSet(REC_LS(owner), JSON.stringify({ credentialId, at: Date.now() } satisfies LockRecord));
  if (!ownerSet()) lsSet(OWNER_LS, owner);
}
export function clearLockRecord(owner = lockOwner()) {
  lsSet(REC_LS(owner), null);
}

/* ---- per-device choices ---- */
export function appLockOn() {
  return lsGet(ON_LS) !== "off";
}
export function setAppLockOn(on: boolean) {
  lsSet(ON_LS, on ? "on" : "off");
}
export function lockAfterMs(): number {
  const v = Number(lsGet(AFTER_LS));
  return (LOCK_AFTER_OPTIONS as readonly number[]).includes(v) && lsGet(AFTER_LS) !== null ? v : DEFAULT_LOCK_AFTER;
}
export function setLockAfter(ms: number) {
  lsSet(AFTER_LS, String(ms));
}
/** The gate is used: app lock on, this browser can do it, and a credential is enrolled for this owner. */
export function gateReady() {
  return appLockOn() && bioSupported() && Boolean(lockRecord());
}

/**
 * Android app only: the app lock is on and was set up here, but the phone can't show its prompt now (screen lock
 * removed, or the phone refuses for a moment). Then the parked key must not open the journal by itself: the
 * passphrase is asked instead. Never true in a browser.
 */
export function gateUnavailable() {
  return inAndroidApp() && appLockOn() && Boolean(lockRecord()) && !nativeCanAuth();
}

/* ---- the one-time setup offer ---- */
export function offerDone(owner = lockOwner()) {
  return lsGet(OFFERED_LS(owner)) === "1";
}
export function markOfferDone(owner = lockOwner()) {
  lsSet(OFFERED_LS(owner), "1");
}

/* ---- leaving and coming back ---- */
let pickerAt = 0;
if (typeof document !== "undefined") {
  // A photo/backup file picker opened from inside Vela hides the page; it never counts as leaving.
  document.addEventListener(
    "click",
    (event) => {
      const el = event.target as Element | null;
      try {
        if (el?.closest?.('input[type="file"], label:has(input[type="file"])')) pickerAt = Date.now();
      } catch {
        if ((el as HTMLInputElement | null)?.type === "file" || el?.closest?.("label")?.querySelector?.('input[type="file"]')) pickerAt = Date.now();
      }
    },
    true,
  );
}
export function pickerJustOpened(now = Date.now()) {
  return now - pickerAt < PICKER_MS;
}
/** Lets code that opens a picker programmatically (input.click()) say so. */
export function notePicker() {
  pickerAt = Date.now();
}

/** The journal was open and in use just now (only ever called while it is open). */
export function markSeen() {
  lsSet(SEEN_LS, String(Date.now()));
}
/** Locked: a reload from here must ask. */
export function clearSeen() {
  lsSet(SEEN_LS, null);
}
function seenAt() {
  return Number(lsGet(SEEN_LS)) || 0;
}

/** Called just before the silent reload that installs an update, while the journal is open. */
export function markQuietReload() {
  try {
    sessionStorage.setItem(QUIET_SS, String(Date.now()));
  } catch {
    /* ignore */
  }
  markSeen();
}
// Read once per page load: this boot is the update reload, made moments after the journal was in use.
const QUIET_BOOT = (() => {
  try {
    const at = Number(sessionStorage.getItem(QUIET_SS) || 0);
    sessionStorage.removeItem(QUIET_SS);
    return at > 0 && Date.now() - at < QUIET_WINDOW_MS;
  } catch {
    return false;
  }
})();
// A reload of the page that was open moments ago (pull-to-refresh) is not leaving the app either.
const RELOAD_BOOT = (() => {
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return nav?.type === "reload";
  } catch {
    return false;
  }
})();
/**
 * This launch is not a fresh one: the silent update reload, or a reload (pull-to-refresh) made while the journal
 * was open, within the same grace as leaving the app. A reload from the lock screen always asks.
 */
export function quietResume() {
  const away = Date.now() - seenAt();
  if (away < 0) return false; // the clock moved back: don't trust it
  if (QUIET_BOOT && away < QUIET_WINDOW_MS) return true;
  const grace = lockAfterMs();
  return RELOAD_BOOT && grace > 0 && away < grace;
}

/* ---- migration from the "Ask for my passphrase" build ---- */
/**
 * Runs once per device. The owner becomes the remembered account (or "local"), and a fingerprint enrolled
 * before (sealed passphrase, keyed by the journal id) becomes the app-lock credential, with no prompt.
 */
export function migrateLock(vaultId: string, lastUserId: string | null) {
  const done = lsGet(MIGRATED_LS) === "1";
  if (!ownerSet()) lsSet(OWNER_LS, lastUserId || "local");
  // Every boot, not once: an enrolment kept under another owner (or only as the sealed passphrase) becomes
  // this owner's app lock.
  if (!readRecord(REC_LS(lockOwner()))) healLockRecord();
  // Only called after the journal store was read successfully (hydrate returns early otherwise), so an empty
  // vaultId here really means "no journal on this device".
  if (!done) {
    lsSet(MIGRATED_LS, "1");
    const old = (vaultId ? bioForUser(vaultId) : null) ?? bioRecord();
    if (old && !lockRecord()) saveRecord(old.credentialId);
    // Someone who said "Don't ask on this device" for the fingerprint isn't offered the app lock again.
    if (lsGet("vela-bio-skip") && !lockRecord()) markOfferDone();
    lsSet("vela_ask_pass", null);
    lsSet("vela_seen", null);
  }
}

/** Diagnostics only: what this device holds for the lock, as yes/no facts (no ids, no secrets). */
export function lockFacts() {
  return {
    owner: ownerSet() ? (lockOwner() === "local" ? "local" : "account") : "unset",
    source: lockSource(),
    appLock: appLockOn(),
    migrated: lsGet(MIGRATED_LS) === "1",
    offerDone: offerDone(),
    after: lockAfterMs(),
  };
}

/* ---- WebAuthn ---- */
export type GateOutcome = { ok: true } | { ok: false; code: "cancel" | "insecure" | "unsupported" | "already" | "missing" | "failed" | "busy" | "none" };

let asking = false;
/** True while the fingerprint / screen-lock sheet is up (it hides the page on some phones). */
export function gateAsking() {
  return asking;
}

/** Asks for the enrolled fingerprint / screen lock. Only says yes or no; it opens nothing by itself. */
export async function verifyAppLock(): Promise<GateOutcome> {
  const rec = lockRecord();
  if (!rec) return { ok: false, code: "none" };
  if (asking) return { ok: false, code: "busy" };
  asking = true;
  try {
    if (inAndroidApp()) {
      // Fingerprint / face, or the phone's PIN, pattern or password; nothing else opens it.
      const res = await nativeAuth();
      return res.ok ? { ok: true } : { ok: false, code: res.code === "timeout" ? "failed" : res.code };
    }
    const got = await navigator.credentials.get({
      publicKey: {
        challenge: bioBytes(32),
        allowCredentials: [{ type: "public-key", id: b64ToBytes(rec.credentialId), transports: ["internal"] }],
        userVerification: "required",
        timeout: 60000,
      },
    });
    if (!got || got.type !== "public-key") return { ok: false, code: "cancel" };
    return { ok: true };
  } catch (err) {
    return { ok: false, code: bioFailCode(err) };
  } finally {
    asking = false;
  }
}

/**
 * Enrolls this phone's fingerprint / screen lock as the app lock. When the passphrase is in memory (just
 * typed), the same credential also seals it for recovery if the parked key is ever lost.
 */
export async function enrollAppLock(vaultId: string, passphrase: string): Promise<void> {
  if (asking) throw Object.assign(new Error("busy"), { name: "InvalidStateError" });
  asking = true;
  try {
    if (inAndroidApp()) {
      // The phone's prompt confirms once that its lock works here; no passphrase is sealed (the parked key stays
      // the device copy, as in the browser).
      void vaultId;
      void passphrase;
      const res = await nativeAuth();
      if (!res.ok) {
        const name = res.code === "cancel" ? "NotAllowedError" : res.code === "unsupported" ? "NotSupportedError" : "Error";
        throw Object.assign(new Error(res.code), { name });
      }
      saveRecord(NATIVE_LOCK_ID);
    } else if (passphrase && vaultId) {
      await enrollFingerprint(passphrase, vaultId);
      const rec = bioForUser(vaultId);
      if (!rec) throw new Error("Fingerprint data on this device is missing.");
      saveRecord(rec.credentialId);
    } else {
      const cred = (await navigator.credentials.create({
        publicKey: {
          challenge: bioBytes(32),
          rp: { name: "Vela" },
          user: { id: new TextEncoder().encode(`vela:lock:${lockOwner()}`.slice(0, 64)), name: "Vela", displayName: "Vela" },
          pubKeyCredParams: [
            { type: "public-key", alg: -7 },
            { type: "public-key", alg: -257 },
          ],
          authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
          timeout: 60000,
          attestation: "none",
        },
      })) as PublicKeyCredential | null;
      if (!cred || cred.type !== "public-key") throw Object.assign(new Error("cancelled"), { name: "NotAllowedError" });
      saveRecord(bytesToB64(new Uint8Array(cred.rawId)));
    }
    markOfferDone();
    setAppLockOn(true);
    void keepStorage();
  } finally {
    asking = false;
  }
}
