/* When to offer "Unlock with fingerprint next time" after a passphrase unlock. */
import { create } from "zustand";
import { bioForUser, bioSupported, offerSkipped, platformAvailable, sessionPass } from "./fingerprint";

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

/** Show the offer if this phone can do it, it isn't on yet, and the user didn't say "don't ask". */
export async function maybeOfferFingerprint(vaultId: string) {
  if (!vaultId || !bioSupported() || !sessionPass()) return false;
  if (bioForUser(vaultId) || offerSkipped(vaultId)) return false;
  if (!(await platformAvailable())) return false;
  useBioUi.getState().setOffer(true);
  return true;
}
