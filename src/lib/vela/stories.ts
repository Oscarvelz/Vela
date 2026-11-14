/* Stories (2.1.23) — the app remembering on its own. On Home, a quiet rail of
   cards: this same calendar day, at a distance — a month ago, three months, six,
   a year, then every year the journal reaches. A card is a DOOR, not a display:
   it names the distance, the person and the glow, never the journal's words,
   and opens History on exactly that day.
   The mute is part of the feature, not an apology for it: a memory can wound,
   so a day can be hidden forever and a person can stop resurfacing, from the
   card itself. Hidden stays hidden until the user revives it in Settings. */
import { iso, parseDate } from "./dates";
import type { Session, StoryMuted } from "./types";

export type Story = {
  /** The past date the story points at (also its mute key for "hide this memory"). */
  date: string;
  kind: "months" | "years";
  n: number;
  /** Sessions that day (after muted people are removed). */
  count: number;
  /** Distinct partner names that day, in journal order; "" means solo. */
  partners: string[];
  /** Best overall rating that day (0 = unrated). */
  bestOverall: number;
};

const EMPTY_MUTED: StoryMuted = { people: [], days: [] };

export function cleanMuted(raw: Partial<StoryMuted> | undefined | null): StoryMuted {
  if (!raw) return { people: [], days: [] };
  const people = Array.isArray(raw.people) ? raw.people.filter((p): p is string => typeof p === "string" && p.trim() !== "") : [];
  const days = Array.isArray(raw.days) ? raw.days.filter((d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) : [];
  return { people: [...new Set(people)], days: [...new Set(days)] };
}

function daysInMonth(year: number, month1: number) {
  return new Date(year, month1, 0).getDate();
}

/** The same month-day, n months earlier; the day clamps to the target month's end. */
export function monthsAgo(today: string, n: number): string {
  const dt = parseDate(today);
  const y = dt.getFullYear();
  const m = dt.getMonth() + 1;
  const d = dt.getDate();
  const total = y * 12 + (m - 1) - n;
  const ty = Math.floor(total / 12);
  const tm = (total % 12) + 1;
  return iso(ty, tm - 1, Math.min(d, daysInMonth(ty, tm)));
}

/** The same month-day, n years earlier; Feb 29 lands on Feb 28 in common years. */
export function yearsAgo(today: string, n: number): string {
  const dt = parseDate(today);
  const m = dt.getMonth() + 1;
  const ty = dt.getFullYear() - n;
  return iso(ty, m - 1, Math.min(dt.getDate(), daysInMonth(ty, m)));
}

const MONTH_STEPS = [1, 3, 6];

export function findStories(sessions: Session[], today: string, mutedRaw?: Partial<StoryMuted> | null): Story[] {
  if (sessions.length === 0) return [];
  const muted = cleanMuted(mutedRaw ?? EMPTY_MUTED);
  const mutedPeople = new Set(muted.people.map((p) => p.trim().toLowerCase()));
  const mutedDays = new Set(muted.days);

  const sorted = [...sessions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const earliest = sorted[0].date;
  const byDate = new Map<string, Session[]>();
  for (const s of sorted) {
    const list = byDate.get(s.date);
    if (list) list.push(s);
    else byDate.set(s.date, [s]);
  }
  // Encounter spans: an encounter that was still unfolding on the target day
  // counts for that day even when no single session carries the date itself.
  const spans = new Map<string, { from: string; to: string; sessions: Session[] }>();
  for (const s of sorted) {
    if (!s.encounterId) continue;
    const span = spans.get(s.encounterId);
    if (!span) spans.set(s.encounterId, { from: s.date, to: s.date, sessions: [s] });
    else {
      if (s.date < span.from) span.from = s.date;
      if (s.date > span.to) span.to = s.date;
      span.sessions.push(s);
    }
  }

  const targets: { date: string; kind: "months" | "years"; n: number }[] = [];
  for (const n of MONTH_STEPS) targets.push({ date: monthsAgo(today, n), kind: "months", n });
  const maxYears = parseDate(today).getFullYear() - parseDate(earliest).getFullYear();
  for (let n = 1; n <= maxYears; n++) targets.push({ date: yearsAgo(today, n), kind: "years", n });

  const stories: Story[] = [];
  for (const target of targets) {
    if (target.date < earliest || target.date >= today) continue;
    if (mutedDays.has(target.date)) continue;
    let daySessions = byDate.get(target.date) ?? [];
    if (daySessions.length === 0) {
      for (const span of spans.values()) {
        if (span.from <= target.date && target.date <= span.to) {
          daySessions = span.sessions;
          break;
        }
      }
    }
    if (daySessions.length === 0) continue;
    const visible = daySessions.filter((s) => !mutedPeople.has(s.partnerName.trim().toLowerCase()));
    if (visible.length === 0) continue;
    const partners: string[] = [];
    for (const s of visible) if (!partners.includes(s.partnerName)) partners.push(s.partnerName);
    stories.push({
      date: target.date,
      kind: target.kind,
      n: target.n,
      count: visible.length,
      partners,
      // A memory's glow is the highest reading anyone gave it (2.2.2): in
      // couple mode her voice can carry a moment his read lower.
      bestOverall: Math.max(0, ...visible.map((s) => Math.max(s.overall, s.partnerVoice?.overall ?? 0))),
    });
  }
  return stories;
}
