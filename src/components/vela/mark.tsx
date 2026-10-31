import { useEffect, useId } from "react";
import { cn } from "@/lib/cn";

/* Vela mark: the amber flame itself with its halo, no tile, so it sits on any theme.
   Outer flame + bright inner core; colours come from CSS vars (.vela-mark in styles.css). */
export const FLAME_OUTER =
  "M52 6 C49 20 70 34 72 56 C74 78 63 92 50 92 C36 92 26 80 27 63 C28 45 44 36 48 21 C49 15 51 10 52 6 Z";
export const FLAME_INNER =
  "M51 44 C50 52 60 59 60 70 C60 79 56 84 50 84 C44 84 40 79 40 72 C40 62 48 57 49 50 C49.5 48 50 46 51 44 Z";

export function Mark({ className, alive = false }: { className?: string; alive?: boolean }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={cn("vela-mark shrink-0 overflow-visible", alive && "vela-mark-alive", className)}>
      <defs>
        <radialGradient id={`h${id}`} cx="50" cy="60" r="78" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: "var(--mark-halo)", stopOpacity: "var(--mark-halo-o)" }} />
          <stop offset="0.28" style={{ stopColor: "var(--mark-halo)", stopOpacity: "calc(var(--mark-halo-o) * 0.45)" }} />
          <stop offset="0.6" style={{ stopColor: "var(--mark-halo)", stopOpacity: "calc(var(--mark-halo-o) * 0.12)" }} />
          <stop offset="1" style={{ stopColor: "var(--mark-halo)", stopOpacity: "0" }} />
        </radialGradient>
        <linearGradient id={`o${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--mark-tip)" }} />
          <stop offset="0.55" style={{ stopColor: "var(--mark-body)" }} />
          <stop offset="1" style={{ stopColor: "var(--mark-base)" }} />
        </linearGradient>
        <radialGradient id={`c${id}`} cx="50" cy="72" r="16" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fffaf0" />
          <stop offset="0.6" stopColor="#ffe9b0" />
          <stop offset="1" stopColor="#ffd276" />
        </radialGradient>
      </defs>
      <circle className="vela-mark-halo" cx="50" cy="60" r="78" fill={`url(#h${id})`} />
      <g className="vela-mark-fire">
        <g className="vela-mark-sway">
          <path className="vela-mark-flame" d={FLAME_OUTER} fill={`url(#o${id})`} />
          <path className="vela-mark-core" d={FLAME_INNER} fill={`url(#c${id})`} />
        </g>
      </g>
      {alive && (
        <g className="vela-mark-sparks" fill="var(--mark-tip)">
          <circle cx="52" cy="14" r="1.3" />
          <circle cx="47" cy="18" r="1" />
          <circle cx="55" cy="22" r="0.8" />
        </g>
      )}
    </svg>
  );
}

/* The sign-in halo: light pouring out of the flame into the night, well past the mark itself.
   Pure CSS radial layers (no blur, no canvas), animated only with transform/opacity (.vela-halo in styles.css).
   Wrap it and the Mark in a .vela-flame-stage; it centres on the flame body. */
export function FlameHalo() {
  useEffect(() => {
    // Pause every flame animation while the tab is hidden (battery).
    const root = document.documentElement;
    const sync = () => {
      if (document.hidden) root.dataset.idle = "1";
      else delete root.dataset.idle;
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      delete root.dataset.idle;
    };
  }, []);
  return (
    <div className="vela-halo" aria-hidden>
      <span className="vela-halo-outer" />
      <span className="vela-halo-rays" />
      <span className="vela-halo-mid" />
      <span className="vela-halo-core" />
    </div>
  );
}

export function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M12 0.8 13.7 10.3 23.2 12 13.7 13.7 12 23.2 10.3 13.7 0.8 12 10.3 10.3Z"
      />
    </svg>
  );
}

/* A small amber constellation: "a moment" among the stars. Used where the flame would repeat. */
const STARS: [number, number, number][] = [
  [16, 72, 9], [40, 38, 14], [66, 56, 10], [86, 20, 8], [54, 88, 6.5],
];
export function Constellation({ className }: { className?: string }) {
  const star = (x: number, y: number, r: number) =>
    `M${x} ${y - r} L${x + r * 0.22} ${y - r * 0.22} L${x + r} ${y} L${x + r * 0.22} ${y + r * 0.22} L${x} ${y + r} L${x - r * 0.22} ${y + r * 0.22} L${x - r} ${y} L${x - r * 0.22} ${y - r * 0.22} Z`;
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={cn("vela-constellation shrink-0 overflow-visible", className)}>
      <polyline points="16,72 40,38 66,56 86,20" fill="none" className="vela-const-line" />
      <line x1="66" y1="56" x2="54" y2="88" className="vela-const-line" />
      {STARS.map(([x, y, r], i) => (
        <g key={i} className="vela-const-star" style={{ animationDelay: `${i * 1.3}s`, animationDuration: `${4.2 + i * 0.9}s` }}>
          <circle cx={x} cy={y} r={r * 1.6} className="vela-const-glow" />
          <path d={star(x, y, r)} />
        </g>
      ))}
    </svg>
  );
}
