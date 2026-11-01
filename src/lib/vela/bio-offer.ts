/* When to offer the app lock ("Lock Vela with your fingerprint"): once per owner, dismissible. */
import { create } from "zustand";
import { bioSupported, platformAvailable } from "./fingerprint";
import { appLockOn, lockRecord, offerDone } from "./app-lock";

type BioUi = {
  /** The one-tap offer sheet is showing. */
  offer: boolean;
  /** Bumped whenever the fingerprint record changes, so views re-read it. */
  tick: number;
  setOffer: (offer: boolean) => void;
  bump: () => void;
};

export const useBioUi = create<BioUi>((set, get) => ({
  offer: false,
  tick: 0,
  setOffer: (offer) => set({ offer }),
  bump: () => set({ tick: get().tick + 1 }),
}));

/** Show the offer once if this phone can do it, app lock is on, and no fingerprint is set up yet. */
export async function maybeOfferFingerprint(vaultId: string) {
  if (!vaultId || !bioSupported() || !appLockOn()) return false;
  if (lockRecord() || offerDone()) return false;
  if (!(await platformAvailable())) return false;
  useBioUi.getState().setOffer(true);
  return true;
}
