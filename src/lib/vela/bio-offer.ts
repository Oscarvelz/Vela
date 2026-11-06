/* When to offer the app lock ("Lock Vela with your fingerprint"): once per owner, dismissible. */
import { create } from "zustand";
import { inAndroidApp } from "./native";
import { bioForUser, bioSupported, platformAvailable, sealFailed, sessionPass } from "./fingerprint";
import { appLockOn, lockRecord, offerDone } from "./app-lock";

type BioUi = {
  /** The one-tap offer sheet is showing. */
  offer: boolean;
  /** The offer re-seals the passphrase for a phone whose fingerprint is already the app lock. */
  reseal: boolean;
  /** Bumped whenever the fingerprint record changes, so views re-read it. */
  tick: number;
  setOffer: (offer: boolean, reseal?: boolean) => void;
  bump: () => void;
};

export const useBioUi = create<BioUi>((set, get) => ({
  offer: false,
  reseal: false,
  tick: 0,
  setOffer: (offer, reseal = false) => set({ offer, reseal: offer ? reseal : false }),
  bump: () => set({ tick: get().tick + 1 }),
}));

/**
 * Show the offer when this phone can do it and the app lock is on, and either
 * - no fingerprint is set up yet (once per owner, dismissible), or
 * - the passphrase was just typed on this device and the fingerprint doesn't hold a sealed copy of it for this
 *   journal. Then it is offered right away, whatever was dismissed before: sealing it is what lets this phone
 *   open the journal with the fingerprint alone even if the parked key is ever lost, so the passphrase is
 *   never asked here again.
 */
export async function maybeOfferFingerprint(vaultId: string, passTyped = false) {
  if (!vaultId || !bioSupported() || !appLockOn()) return false;
  // The Android app's lock is the phone's own prompt and seals no passphrase: nothing to re-seal there.
  const reseal = !inAndroidApp() && passTyped && Boolean(sessionPass()) && (!bioForUser(vaultId) || sealFailed());
  if (!reseal && (lockRecord() || offerDone())) return false;
  if (!(await platformAvailable())) return false;
  useBioUi.getState().setOffer(true, reseal && Boolean(lockRecord()));
  return true;
}
