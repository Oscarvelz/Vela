import type { RatingKey, Session } from "./types";

/**
 * The two voices, read together (2.2.2).
 *
 * Agreement is a distribution, never a grade: how often two readings of the
 * same moment landed on the same number, per dial, over the moments both
 * people actually wrote. There is no compatibility percentage here and no
 * winner — the largest recurring gap is a conversation topic, not a deficit.
 * A dial counts only where BOTH voices rated it; an unrated dial is silence,
 * not disagreement.
 */

export type VoiceDialRow = {
  dial: RatingKey | "overall";
  his: number;
  hers: number;
  /** Moments where both rated this dial identically. */
  same: number;
  /** Moments where both rated this dial at all. */
  both: number;
  /** Mean absolute distance between the two readings. */
  gap: number;
};

export type VoiceReading = {
  /** Sessions carrying a second voice. */
  paired: number;
  sameOverall: number;
  rows: VoiceDialRow[];
  /** The dial the two readings differ on most — only when the difference is
   *  real (≥3 shared ratings, mean gap ≥ 0.8). */
  gap: VoiceDialRow | null;
};

const DIALS: (RatingKey | "overall")[] = ["overall", "intensity", "connection", "satisfaction", "energy"];

export function voiceReading(sessions: Session[]): VoiceReading | null {
  const pairs = sessions.filter((s) => s.partnerVoice);
  if (!pairs.length) return null;
  const rows = DIALS.map((dial) => {
    let hisSum = 0;
    let herSum = 0;
    let gapSum = 0;
    let same = 0;
    let both = 0;
    for (const s of pairs) {
      const his = dial === "overall" ? s.overall : s[dial];
      const hers = dial === "overall" ? s.partnerVoice!.overall : s.partnerVoice![dial];
      if (his > 0 && hers > 0) {
        both += 1;
        hisSum += his;
        herSum += hers;
        gapSum += Math.abs(his - hers);
        if (his === hers) same += 1;
      }
    }
    return {
      dial,
      his: both ? hisSum / both : 0,
      hers: both ? herSum / both : 0,
      same,
      both,
      gap: both ? gapSum / both : 0,
    };
  });
  const gap = rows.filter((row) => row.both >= 3 && row.gap >= 0.8).sort((a, b) => b.gap - a.gap)[0] ?? null;
  return { paired: pairs.length, sameOverall: rows[0].same, rows, gap };
}
