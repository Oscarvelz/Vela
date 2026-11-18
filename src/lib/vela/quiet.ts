import { fold } from "./batch";
import { NUMBER_WORDS } from "./batch-lexicon";
import { addDays, finiteStamp, isRealDate, parseDate, todayStr } from "./dates";
import type { QuietMark, QuietReasonId, QuietThemeId, Session } from "./types";

/**
 * Quiet days (2.2.4) — the stretches without intimacy, closed with a name.
 *
 * A quiet day is not a failed day: the family's whole vocabulary is quiet /
 * tranquilo / pausa, and the reason travels with the silence to every surface
 * that reads it (the Calendar, the Advisor's rhythm, the Insights card). The
 * marks name NO person — they are the journal speaking, not a partner
 * testifying — and they never enter cycle or phase math: this module is
 * consumed only by the rhythm line, the pattern line and the barriers card.
 *
 * The honesty line: Vela reflects and testifies; it never diagnoses the
 * relationship. A theme word appears only when it was the user's own word.
 */

export const QUIET_REASONS: QuietReasonId[] = ["work", "travel", "kids", "health", "argued", "distance", "life"];

const THEME_IDS: QuietThemeId[] = [...QUIET_REASONS, "communication", "school"];

export function newQuietId(): string {
  return `q-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function cleanQuietMarks(raw: unknown): QuietMark[] {
  if (!Array.isArray(raw)) return [];
  const out: QuietMark[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const m = item as Partial<QuietMark>;
    if (typeof m.id !== "string" || !m.id) continue;
    if (!isRealDate(m.from) || !isRealDate(m.to)) continue;
    if (m.to < m.from) continue;
    if (m.reason !== "custom" && !THEME_IDS.includes(m.reason as QuietThemeId)) continue;
    out.push({
      id: m.id,
      from: m.from,
      to: m.to,
      reason: m.reason as QuietMark["reason"],
      ...(m.reason === "custom" && typeof m.custom === "string" && m.custom.trim() ? { custom: m.custom.trim().slice(0, 80) } : {}),
      ...(typeof m.note === "string" && m.note.trim() ? { note: m.note.trim().slice(0, 160) } : {}),
      source: m.source === "read" ? "read" : "manual",
      ...(typeof m.themeText === "string" && m.themeText.trim() ? { themeText: m.themeText.trim().slice(0, 160) } : {}),
      createdAt: finiteStamp(m.createdAt) ?? 0,
      ...(finiteStamp(m.updatedAt) !== undefined ? { updatedAt: m.updatedAt } : {}),
    });
  }
  /* One id seats one mark (Round 4, RT4-H6 B5): the later edit stamp
   * wins a duplicate; a tie resolves by content. */
  const byId = new Map<string, QuietMark>();
  for (const m of out) {
    const prev = byId.get(m.id);
    if (!prev) { byId.set(m.id, m); continue; }
    const s = (m.updatedAt ?? m.createdAt) - (prev.updatedAt ?? prev.createdAt);
    if (s > 0 || (s === 0 && JSON.stringify(m) > JSON.stringify(prev))) byId.set(m.id, m);
  }
  return [...byId.values()].sort((a, b) => a.from.localeCompare(b.from));
}

function dayDiff(from: string, to: string) {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86400000);
}

export function eachDay(from: string, to: string): string[] {
  // No silent cap: a stretch is as long as it is, and a reader that stops
  // early lies about the rest (prejudice hunt V3-12 — a 730-day silence
  // painted and counted as 400 days). Counting surfaces use interval
  // arithmetic (episodes below); this enumeration serves bounded windows.
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}

/** Every day a mark names, as a set. Marks may reach into the future (a trip
 *  next week); readers decide for themselves how far they read. */
export function markedDays(marks: QuietMark[]): Set<string> {
  const out = new Set<string>();
  for (const mark of marks) for (const day of eachDay(mark.from, mark.to)) out.add(day);
  return out;
}

/** The mark that names a given day, if any. */
export function markOn(marks: QuietMark[], date: string): QuietMark | null {
  return marks.find((m) => m.from <= date && date <= m.to) ?? null;
}

export type QuietEpisode = { mark: QuietMark; days: number; firstDay: string };

/** Episodes: one per mark, counting only days up to `today` that carry no
 *  session — a session breaks a stretch at read time, never at write time,
 *  so the mark itself is never edited by what happened inside it. */
export function episodes(marks: QuietMark[], sessions: Session[], today = todayStr()): QuietEpisode[] {
  const sessionDays = new Set(sessions.map((s) => s.date));
  const out: QuietEpisode[] = [];
  for (const mark of marks) {
    if (mark.from > today) continue;
    // Interval arithmetic, not enumeration: the count is the span's length
    // minus the session days inside it, however long the span runs.
    const end = mark.to > today ? today : mark.to;
    let sessionInside = 0;
    for (const d of sessionDays) if (d >= mark.from && d <= end) sessionInside += 1;
    const days = dayDiff(mark.from, end) + 1 - sessionInside;
    if (days <= 0) continue;
    let firstDay = mark.from;
    while (firstDay <= end && sessionDays.has(firstDay)) firstDay = addDays(firstDay, 1);
    out.push({ mark, days, firstDay });
  }
  return out;
}

/** How much of the stretch [from, to] is named by marks (0..1), and the mark
 *  doing most of the naming — the Advisor's explained-silence test. */
export function explanationFor(
  marks: QuietMark[],
  sessions: Session[],
  from: string,
  to: string,
): { cover: number; mark: QuietMark | null } {
  const sessionDays = new Set(sessions.map((s) => s.date));
  const span = eachDay(from, to);
  if (!span.length) return { cover: 0, mark: null };
  const byMark = new Map<string, number>();
  let covered = 0;
  for (const day of span) {
    if (sessionDays.has(day)) {
      covered += 1; // a day with a session is not silence at all
      continue;
    }
    const mark = markOn(marks, day);
    if (mark) {
      covered += 1;
      byMark.set(mark.id, (byMark.get(mark.id) ?? 0) + 1);
    }
  }
  let best: QuietMark | null = null;
  let bestDays = 0;
  for (const [id, days] of byMark) {
    const mark = marks.find((m) => m.id === id) ?? null;
    if (mark && (days > bestDays || (days === bestDays && best && mark.to > best.to))) {
      best = mark;
      bestDays = days;
    }
  }
  return { cover: covered / span.length, mark: best };
}

/** Long stretches of silence with no name — the one invitation Insights may
 *  make, counted in gaps between session days (and the run to today). */
export function unnamedLongGaps(sessions: Session[], marks: QuietMark[], today = todayStr()): number {
  const dates = Array.from(new Set(sessions.map((s) => s.date))).sort();
  if (!dates.length) return 0;
  let count = 0;
  const spans: [string, string][] = [];
  for (let i = 0; i + 1 < dates.length; i++) spans.push([addDays(dates[i], 1), addDays(dates[i + 1], -1)]);
  spans.push([addDays(dates[dates.length - 1], 1), today]);
  for (const [from, to] of spans) {
    if (dayDiff(from, to) + 1 < 14) continue;
    if (explanationFor(marks, sessions, from, to).cover < 0.5) count += 1;
  }
  return count;
}

/* ── The reader: relationship themes in the user's own words ────────────────
 * A theme rule is a CONJUNCTION — a domain word AND an absence/duration
 * frame inside one clause. A bare domain word is meaningless ("we had dinner
 * after work" names no quiet stretch); frames carry the meaning. Distance
 * and communication may also stand on a stative verb ("nos sentimos
 * distantes"). `life` is manual-only: a shrug a person taps is not a phrase
 * a reader may infer. Reader themes are PROPOSALS, never writes. */

type ThemeRule = { theme: QuietThemeId; domain: RegExp; stativeOk?: boolean };

const ABSENCE =
  /\b(haven'?t|have not|hadn'?t|didn'?t|did not|no hemos|no habiamos|no tuvimos|no habia|sin tiempo|no time|nunca|never|hardly|apenas|sin poder|no pudimos|couldn'?t|sin lograr)\b/;
const DURATION = /\b(semanas?|weeks?|mes|meses|month|months|todo el mes|all month|ultimamente|lately|estos dias|these days|ultimos dias|last few days|hace dias|for days|por dias)\b/;
const STATIVE = /\b(distantes?|distant|lejos|alejados?|desconectados?|disconnected)\b/;

const THEME_RULES: ThemeRule[] = [
  { theme: "work", domain: /\b(trabajo|trabajando|trabajar|work|working|la tienda|el negocio|business|oficina|office|turnos?|shifts?|jornada)\b/ },
  { theme: "travel", domain: /\b(viaje|viajo|viajando|viajar|travel|trip|traveling|travelling|out of town|fuera de la ciudad|de viaje)\b/ },
  { theme: "kids", domain: /\b(ninos?|kids?|children|hijos?|los peques|bebes?|babies)\b/ },
  { theme: "school", domain: /\b(escuela|school|clases|classes|examenes|exams|estudiando|studying|universidad|college)\b/ },
  { theme: "health", domain: /\b(enfermo|enferma|enfermedad|ill|sick|salud|health|gripe|flu|operacion|surgery|recuperandose|recovering|hospital)\b/ },
  { theme: "argued", domain: /\b(discutimos|discusion|discutiendo|argued|argument|arguing|pelea|peleamos|fight|fighting)\b/ },
  {
    theme: "distance",
    domain: /\b(distancia|distance|distantes?|distant|lejos|alejados?|distancia emocional|emotional distance)\b/,
    stativeOk: true,
  },
  {
    theme: "communication",
    domain:
      /\b(comunicacion|communication|falta de comunicacion|lack of communication|sin hablar|no hablar|no hemos hablado|not talking|don'?t talk|haven'?t talked|haven'?t spoken|desconectados?|disconnected)\b/,
    stativeOk: true,
  },
];

export type ThemeProposal = {
  theme: QuietThemeId;
  /** The clause that carried the theme, in the user's original words. */
  evidence: string;
  from: string;
  to: string;
};

function durationDays(clause: string): number | null {
  const m = clause.match(/(\d+|[a-záéíóúñ]+)\s*(semanas?|weeks?|mes|meses|months?|dias|days)/);
  if (!m) return null;
  const n = /^\d+$/.test(m[1]) ? parseInt(m[1], 10) : (NUMBER_WORDS[m[1]] ?? null);
  if (!n || n < 1) return null;
  if (/semana|week/.test(m[2])) return n * 7;
  if (/mes|month/.test(m[2])) return n * 30;
  return n;
}

/** Read a batch text for relationship themes. The stretch a proposal names
 *  is anchored to the days the text itself spans (the entries the reader
 *  dated); a clause that states its own duration narrows the stretch to its
 *  last days. With no dated span there is nothing honest to anchor to, and
 *  the reader stays silent. */
export function readThemeProposals(text: string, span: { from: string; to: string } | null): ThemeProposal[] {
  if (!span) return [];
  const found = new Map<QuietThemeId, ThemeProposal>();
  const clauses = text.split(/[.;\n]+/).map((c) => c.trim()).filter(Boolean);
  for (const clause of clauses) {
    const foldedClause = fold(clause);
    for (const rule of THEME_RULES) {
      if (found.has(rule.theme)) break;
      if (!rule.domain.test(foldedClause)) continue;
      const framed = ABSENCE.test(foldedClause) || DURATION.test(foldedClause) || (rule.stativeOk && STATIVE.test(foldedClause));
      if (!framed) continue;
      const spanDays = dayDiff(span.from, span.to) + 1;
      const stated = durationDays(foldedClause);
      const days = stated ? Math.min(stated, spanDays) : Math.min(spanDays, 31);
      found.set(rule.theme, {
        theme: rule.theme,
        evidence: clause.slice(0, 160),
        from: addDays(span.to, -(days - 1)),
        to: span.to,
      });
      break;
    }
  }
  return [...found.values()];
}
