import { useId } from "react";
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
        <radialGradient id={`h${id}`} cx="50" cy="62" r="50" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: "var(--mark-halo)", stopOpacity: "var(--mark-halo-o)" }} />
          <stop offset="0.45" style={{ stopColor: "var(--mark-halo)", stopOpacity: "calc(var(--mark-halo-o) * 0.35)" }} />
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
      <circle className="vela-mark-halo" cx="50" cy="62" r="50" fill={`url(#h${id})`} />
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
