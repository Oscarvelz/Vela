/* The pregnancy reader (2.2.7) — Oscar's order: the app becomes really good
   at spotting when her own words already state a pregnancy or a pregnancy
   test, in the first person or the third ("she got pregnant", "she did a
   pregnancy test — two were negative and one was positive"), English and
   Spanish. What it finds is never written silently: the batch door shows it
   as a proposal with the exact clause as evidence (the 2.2.4 law), and
   keeping it records the cycle's reason, so the end-of-cycle question —
   which exists to ask what the journal does not know — never needs to ask
   what she already said. Wishes, fears and tries are not statements:
   "trying to get pregnant", "afraid she might be", "not pregnant" all read
   as silence here. */
import { fold } from "./batch";
import { NUMBER_WORDS } from "./batch-lexicon";
import type { PregnancyTestEvent } from "./types";

export function newTestId(): string {
  return `pt-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

const TEST_NOUN = /\b(pregnancy test|prueba de embarazo|test de embarazo)\b/;
/* A clause of wishes, fears or trying states no fact — it is suppressed for
   declarations and test results alike. */
const UNCERTAIN = /\b(trying|try|hope|hoping|wish|wishes|afraid|scared|fear|maybe|might|perhaps|tratando|intentando|buscando|espero|esperanza|ojala|miedo|temo|quizas|tal vez|puede que)\b/;
/* Negation before the fact kills it ("I'm not pregnant", "no estoy…"). */
const NEGATED = /\b(no|not|never|nunca|jamas|sin|n’t)\b/;

const DECLARATIONS: RegExp[] = [
  /\bi(?:'m| am) pregnant\b/,
  /\bshe(?:'s| is| got| became) pregnant\b/,
  /\bmy (?:wife|partner|girlfriend) is pregnant\b/,
  /\bestoy embarazada\b/,
  /\besta embarazada\b/,
  /\bquedo embarazada\b/,
  /\bquede embarazada\b/,
  /\bse embarazo\b/,
];

const RESULT_OF = (word: string): "positive" | "negative" => (word.startsWith("pos") ? "positive" : "negative");

function countBefore(clause: string, index: number): number {
  const before = clause.slice(Math.max(0, index - 22), index);
  const m = before.match(/(\d+|one|two|three|four|five|una?|dos|tres|cuatro|cinco)\s+(?:were\s+|fueron\s+|salieron\s+|eran\s+|fueron\s+)?$/);
  if (!m) return 1;
  const token = m[1];
  if (/^\d+$/.test(token)) return Math.max(1, Math.min(9, parseInt(token, 10)));
  return NUMBER_WORDS[token] ?? 1;
}

function countAfter(clause: string, index: number, wordLength: number): number | null {
  const after = clause.slice(index + wordLength, index + wordLength + 16);
  const m = after.match(/^\s*(twice|three times|dos veces|tres veces)\b/);
  if (!m) return null;
  return m[1].startsWith("tw") || m[1].startsWith("tres") || m[1].startsWith("three") ? (m[1] === "twice" || m[1] === "dos veces" ? 2 : 3) : 2;
}

export type PregnancyReading = {
  /** The earliest stated pregnancy (declaration or positive test), if any. */
  reason: { date: string; evidence: string } | null;
  /** Test events in her words, counts as stated. */
  tests: Omit<PregnancyTestEvent, "id" | "createdAt">[];
};

/** Reads the parsed entries' original text, entry by entry, so every
 *  statement carries the date of the entry it was found in. */
export function readPregnancy(entries: { date: string; source: string; notes: string }[]): PregnancyReading {
  let reason: PregnancyReading["reason"] = null;
  const tests: PregnancyReading["tests"] = [];
  for (const entry of entries) {
    const raw = entry.source || entry.notes || "";
    if (!raw) continue;
    const clauses = raw.split(/[.;\n]+/).map((c) => c.trim()).filter(Boolean);
    for (const clause of clauses) {
      const folded = fold(clause);
      if (UNCERTAIN.test(folded)) continue;
      const evidence = clause.slice(0, 160);
      let stated = false;
      // Declarations: her statement of the fact itself.
      for (const re of DECLARATIONS) {
        const m = folded.match(re);
        if (m && !NEGATED.test(folded.slice(0, m.index))) {
          stated = true;
          break;
        }
      }
      // Test statements: the noun must be present; results may be counted
      // in her words ("two were negative and one was positive").
      if (TEST_NOUN.test(folded)) {
        const results = [...folded.matchAll(/(positiv|negativ)([a-z]*)/g)];
        for (const r of results) {
          if (NEGATED.test(folded.slice(Math.max(0, (r.index ?? 0) - 14), r.index))) continue;
          const result = RESULT_OF(r[1]);
          const count = countAfter(folded, r.index ?? 0, r[0].length) ?? countBefore(folded, r.index ?? 0);
          tests.push({ date: entry.date, result, count, evidence });
          if (result === "positive") stated = true;
        }
      }
      if (stated && (!reason || entry.date < reason.date)) {
        reason = { date: entry.date, evidence };
      }
    }
  }
  return { reason, tests };
}

/** Defensive cleaner for the journal gate: unknown shapes become nothing,
 *  counts clamp to what words can state, evidence stays a short quote. */
export function cleanPregnancyTests(raw: unknown): PregnancyTestEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: PregnancyTestEvent[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const t = item as Partial<PregnancyTestEvent>;
    if (typeof t.id !== "string" || !t.id) continue;
    if (typeof t.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(t.date)) continue;
    if (t.result !== "positive" && t.result !== "negative") continue;
    out.push({
      id: t.id,
      date: t.date,
      result: t.result,
      count: typeof t.count === "number" && Number.isFinite(t.count) ? Math.max(1, Math.min(9, Math.round(t.count))) : 1,
      evidence: typeof t.evidence === "string" ? t.evidence.slice(0, 160) : "",
      createdAt: typeof t.createdAt === "number" ? t.createdAt : 0,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
}
