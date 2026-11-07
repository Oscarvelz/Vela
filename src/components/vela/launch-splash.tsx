import { useEffect, useRef, useState } from "react";
import { STR } from "@/lib/vela/copy";
import { setSplashLanding, splashKind, type SplashKind } from "@/lib/vela/splash";
import { Starfield } from "./starfield";
import { FlameHalo, Mark } from "./mark";

/*
  Launch splash: one short reveal per app launch, on the Firmament night sky that every launch opens on (the lock
  screen wears it too). Full show (browser / PWA): an ember catches, the flame rises, its light blooms, the stars come
  out, then VELA and the tagline settle. In the Android app the phone's splash has already lit the flame, so the page
  picks up from there. As soon as the journal is ready and the show has played (about a second), the hero glides into
  the exact spot of the lock screen's own flame and wordmark while the sky melts into the lock screen's sky and its
  panels rise; the lock screen's hero takes over in place, so nothing jumps. If the app opens straight into the journal
  (app lock off), the splash simply fades into it. A tap skips ahead once the journal is ready. Reduced motion: no
  movement, a short fade.

  It never decides whether the journal opens (the lock screen underneath does) and it is not a back step: Back on the
  lock screen still leaves the app.
*/

/** How long the show plays before it may leave (ms from its first frame). */
const MIN_SHOW: Record<SplashKind, number> = { full: 1000, native: 620, quiet: 0 };
const GLIDE_MS = 480;
const SKIP_MS = 300;
const FADE_MS = 380;

type Phase = "show" | "glide" | "fade";

export function LaunchSplash({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const [kind] = useState<SplashKind>(() => {
    const k = splashKind();
    setSplashLanding(k !== "quiet");
    return k;
  });
  const [phase, setPhase] = useState<Phase>("show");
  const [move, setMove] = useState<{ x: number; y: number; ms: number } | null>(null);
  const t0 = useRef(performance.now());
  const stage = useRef<HTMLDivElement>(null);
  const leaving = useRef(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  // Test builds only: slow the hand-off down so the review can see each frame of it.
  const leave = (fast: boolean) => {
    const slow = import.meta.env.VITE_E2E === "1" ? ((window as unknown as { __velaSplashSlow?: number }).__velaSplashSlow ?? 1) : 1;
    if (leaving.current) return;
    leaving.current = true;
    const root = document.documentElement;
    if (kind === "quiet") {
      doneRef.current();
      return;
    }
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const target = document.querySelector<HTMLElement>("[data-vela-hero] .vela-flame-stage");
    const from = stage.current?.getBoundingClientRect();
    const to = target?.getBoundingClientRect();
    if (!still && from && to && to.width > 0) {
      const ms = (fast ? SKIP_MS : GLIDE_MS) * slow;
      // The hero glides on the splash's own sky; the sky melts into the lock screen's in the second half, and the
      // lock screen's panels start rising only as the hero settles (never under it while it moves).
      setMove({ x: to.left - from.left, y: to.top - from.top, ms });
      setPhase("glide");
      window.setTimeout(() => {
        if (root.dataset.splash) root.dataset.splash = "glide";
      }, ms * 0.6);
      window.setTimeout(() => doneRef.current(), ms + 20);
      return;
    }
    // Straight into the journal (no lock screen hero), or reduced motion: a short fade.
    root.dataset.splash = "fade";
    setPhase("fade");
    window.setTimeout(() => doneRef.current(), still ? 220 : FADE_MS);
  };

  useEffect(() => {
    if (!ready) return;
    const wait = Math.max(0, MIN_SHOW[kind] - (performance.now() - t0.current));
    // Two frames after ready, so the lock screen underneath has laid out before the hero is measured.
    let raf = 0;
    let id = 0;
    const go = () => {
      // Test builds only (compiled out of docs/): the frame-by-frame review can hold the show on screen.
      if (import.meta.env.VITE_E2E === "1" && (window as unknown as { __velaSplashHold?: boolean }).__velaSplashHold) {
        id = window.setTimeout(go, 40);
        return;
      }
      raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(() => leave(false));
      });
    };
    id = window.setTimeout(go, wait);
    return () => {
      window.clearTimeout(id);
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Same language the lock screen will use: the saved one (index.html puts it on <html>), else the phone's.
  const [lang] = useState<"en" | "es">(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("vela_ui") || "{}").language;
      if (saved === "es" || saved === "en") return saved;
    } catch {
      /* ignore */
    }
    return navigator.language?.toLowerCase().startsWith("es") ? "es" : "en";
  });
  const show = kind !== "quiet";

  return (
    <div
      className={`vela-splash vs-${kind}`}
      data-phase={phase}
      data-testid="launch-splash"
      aria-hidden
      style={phase === "fade" ? { transitionDuration: `${FADE_MS}ms` } : undefined}
      onPointerDown={() => {
        if (ready && phase === "show") leave(true);
      }}
    >
      <div className="vs-sky" style={move ? { transitionDuration: `${Math.round(move.ms * 0.6)}ms`, transitionDelay: `${Math.round(move.ms * 0.4)}ms` } : undefined}>
        {show ? <Starfield dense /> : null}
      </div>
      {show ? (
        <div
          className="vs-hero"
          style={move ? { transform: `translate3d(${move.x}px, ${move.y}px, 0)`, transitionDuration: `${move.ms}ms` } : undefined}
        >
          <div ref={stage} className="vela-flame-stage mx-auto size-24">
            <FlameHalo />
            <span className="vs-ember" />
            <div className="vs-flame relative size-24">
              <Mark alive className="relative size-24" />
            </div>
          </div>
          <p className="vs-word vela-wordmark mt-5 font-display text-4xl tracking-brand">VELA</p>
          <p className="vs-tag mt-2 text-xs tracking-widest whitespace-nowrap text-dim uppercase">{STR[lang].tagline}</p>
        </div>
      ) : null}
    </div>
  );
}
