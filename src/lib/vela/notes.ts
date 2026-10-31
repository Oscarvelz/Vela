import { RATING_LABELS, SENTENCES, type Lang } from "./copy";
import type { RatingKey } from "./types";

export function composedNote(
  draft: Record<RatingKey, number>,
  lang: Lang,
) {
  const parts: string[] = [];
  for (const key of ["intensity", "connection", "satisfaction", "energy"] as const) {
    const level = draft[key];
    if (level > 0) {
      const line = (SENTENCES[lang][key] as readonly string[])[level];
      if (line) parts.push(line);
    }
  }
  return parts.join(" ");
}

export function ratingLabel(lang: Lang, key: RatingKey, level: number) {
  return (RATING_LABELS[lang][key] as readonly string[])[level] ?? "";
}

export function ratingSentence(lang: Lang, key: RatingKey, level: number) {
  return (SENTENCES[lang][key] as readonly string[])[level] ?? "";
}
