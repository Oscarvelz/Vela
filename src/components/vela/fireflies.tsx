/*
  The living background Oscar asked for, carried over from Brizna's «Noche
  viva» (his order, 2026-11-10): eighteen fireflies on fixed seeds — never
  Math.random, so the drawing never jumps between renders — drifting and
  blinking on a fixed layer BEHIND the content. They show in the gaps,
  never over text. Twelve on phones, eighteen on wider screens; still and
  faint under reduced motion; barely-there warm motes in day mode. The sky
  itself (gradient, moon glow, nine quiet stars) is painted in CSS on the
  app shell — see the "Noche viva" block at the end of styles.css.
*/

const FLIES = [
  [8, 22, 0, 17], [23, 64, 3.1, 21], [37, 12, 6.4, 19], [52, 78, 1.7, 23], [66, 35, 4.9, 18], [81, 58, 2.6, 22],
  [92, 15, 7.3, 20], [14, 88, 5.2, 24], [45, 46, 8.1, 19], [73, 90, 0.9, 21], [30, 34, 9.4, 25], [88, 72, 3.8, 18],
  [5, 50, 6.9, 22], [60, 8, 2.2, 20], [96, 40, 10.2, 23], [19, 5, 4.4, 21], [42, 95, 7.8, 19], [77, 24, 1.3, 24],
] as const;

export function Fireflies() {
  return (
    <div className="vela-flies" aria-hidden>
      {FLIES.map(([x, y, d, t], i) => (
        <i
          key={i}
          style={{
            left: `${x}%`,
            top: `${y}%`,
            animationDelay: `-${d}s, -${(d * 0.7).toFixed(1)}s`,
            animationDuration: `${t}s, ${(3.2 + (i % 4) * 0.6).toFixed(1)}s`,
          }}
        />
      ))}
    </div>
  );
}
