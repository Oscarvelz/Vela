import type { CSSProperties } from "react";
import type { RatingKey } from "./types";

/** One level's colour: gradient start, gradient end, and a deep ink used for text in day mode. */
export type Tone = { a: string; b: string; ink: string };

/**
 * Emotional colour scales for the 1–5 rating cards. Each scale climbs in warmth or charge:
 * Connection runs from cool moonlight to Vela's amber flame.
 */
export const RATING_TONES: Record<RatingKey, readonly [Tone, Tone, Tone, Tone, Tone]> = {
  // Gentle → Consuming: blush, amber, rose-crimson, electric magenta, blazing scarlet fire
  intensity: [
    { a: "#f7bfae", b: "#eb9a88", ink: "#a24c38" },
    { a: "#ffbf6b", b: "#f2943a", ink: "#99520a" },
    { a: "#ff6f91", b: "#e03a64", ink: "#ae1f4a" },
    { a: "#ff6fd0", b: "#b266ff", ink: "#9c2389" },
    { a: "#ff6a3d", b: "#d91a2a", ink: "#a3170f" },
  ],
  // Distant → Profound: moonlit slate, lilac, rose, coral ember, amber-gold flame
  connection: [
    { a: "#8fa6d6", b: "#5f76b0", ink: "#3d5189" },
    { a: "#c2a6f5", b: "#de9ad9", ink: "#7045b0" },
    { a: "#f791c0", b: "#e5609c", ink: "#b02d6a" },
    { a: "#ff9670", b: "#ef5d48", ink: "#b33a1f" },
    { a: "#ffdc7a", b: "#ff9a2b", ink: "#9a5600" },
  ],
  // Light → Unforgettable: morning sky, seafoam, fresh green, honey gold, rose-gold radiance
  satisfaction: [
    { a: "#a5c9ec", b: "#7aa6d8", ink: "#2c6394" },
    { a: "#86dcc8", b: "#4cbca3", ink: "#17735f" },
    { a: "#c9e07a", b: "#93c74e", ink: "#4f7410" },
    { a: "#ffd666", b: "#f2aa2e", ink: "#8f5d05" },
    { a: "#ffbf8f", b: "#ff7aa6", ink: "#b0365f" },
  ],
  // Languid → Wild: dusk indigo, lagoon teal, lime spark, sunset orange, hot magenta
  energy: [
    { a: "#9d97e6", b: "#6d63c7", ink: "#4a3fa6" },
    { a: "#79cfe3", b: "#43a6c4", ink: "#196b84" },
    { a: "#b2e783", b: "#62c96e", ink: "#33771b" },
    { a: "#ffb35a", b: "#ff7433", ink: "#a2440a" },
    { a: "#ff5a86", b: "#ff2ea0", ink: "#ad0f52" },
  ],
};

export function toneFor(key: RatingKey, level: number): Tone | null {
  if (level < 1 || level > 5) return null;
  return RATING_TONES[key][level - 1];
}

/** CSS custom properties carrying a tone into the rating styles. */
export function toneVars(tone: Tone | null): CSSProperties | undefined {
  if (!tone) return undefined;
  return { "--va": tone.a, "--vb": tone.b, "--vi": tone.ink } as CSSProperties;
}
