/**
 * Launch splash state (src/components/vela/launch-splash.tsx). The splash plays once per page load, never on in-app
 * navigation. While it is up, <html data-splash="on"> hides the lock screen's hero (it is the splash's own hero that
 * glides into that exact spot) and holds the lock screen's rise animations, so they play as the splash leaves.
 *
 * Kinds (decided before React, by the inline script in index.html):
 * - "full":   browser / installed PWA. The flame ignites from an ember, the halo blooms, stars and the wordmark settle.
 * - "native": inside the Vela Android app. The phone's own splash already lit the flame (animated vector), so the
 *             page picks up from a lit flame at the same spot and only blooms the halo and settles the wordmark.
 * - "quiet":  a reload the app made itself (an update applied on the lock screen): no show, just the static sky.
 *
 * The splash never decides whether the journal opens: it only covers the screen while the lock screen (or the app)
 * mounts underneath, and the fingerprint prompt waits until it has left (afterSplash).
 */
export type SplashKind = "full" | "native" | "quiet";

const QUIET_KEY = "vela-quiet-boot";

let done = false;
let landing = false;
const waiters = new Set<() => void>();

export function splashKind(): SplashKind {
  if (typeof document === "undefined") return "quiet";
  const k = document.documentElement.dataset.boot;
  return k === "native" || k === "quiet" ? k : "full";
}

/** Whether this page load showed the animated splash and it is still up (or gliding away). */
export function splashActive(): boolean {
  return !done;
}

/** The lock screen's hero takes over from the splash in place (no rise of its own) when the splash glided into it. */
export function splashLanding(): boolean {
  return landing;
}

export function setSplashLanding(v: boolean) {
  landing = v;
}

/** The splash has left the screen. Runs everything that waited for it (the fingerprint prompt). */
export function finishSplash() {
  if (done) return;
  done = true;
  if (typeof document !== "undefined") delete document.documentElement.dataset.splash;
  const list = [...waiters];
  waiters.clear();
  for (const run of list) run();
}

/** Run once the splash is gone (at once if it already is). Returns a cancel. */
export function afterSplash(run: () => void): () => void {
  if (done) {
    run();
    return () => undefined;
  }
  let live = true;
  const w = () => {
    if (live) run();
  };
  waiters.add(w);
  return () => {
    live = false;
    waiters.delete(w);
  };
}

/** The next load is a reload the app makes itself (an update): skip the show. Read once by index.html. */
export function markQuietBoot() {
  try {
    sessionStorage.setItem(QUIET_KEY, "1");
  } catch {
    /* ignore */
  }
}
