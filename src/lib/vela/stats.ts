import type { Lang } from "./copy";
import type { WeekStart } from "./catalog";
import { addDays, fmtShort, startOfWeek, todayStr, parseDate } from "./dates";
import type { Session } from "./types";

export function sessionsSorted(sessions: Session[]) {
  return sessions
    .slice()
    .sort(
      (a, b) =>
        (b.date + b.time).localeCompare(a.date + a.time) || b.createdAt - a.createdAt,
    );
}

export function renumber(sessions: Session[]): Session[] {
  const copy = sessions.map((s) => ({ ...s, positions: s.positions.slice() }));
  const groups = new Map<string, Session[]>();
  for (const s of copy) {
    const list = groups.get(s.date) ?? [];
    list.push(s);
    groups.set(s.date, list);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    group.forEach((s, i) => {
      s.sessionNumber = i + 1;
    });
  }
  return copy;
}

export function weekCount(sessions: Session[], weekStart: WeekStart) {
  const start = startOfWeek(todayStr(), weekStart);
  return sessions.filter((s) => s.date >= start).length;
}

export function monthCount(sessions: Session[]) {
  const ym = todayStr().slice(0, 7);
  return sessions.filter((s) => s.date.slice(0, 7) === ym).length;
}

export function yearCount(sessions: Session[]) {
  const y = todayStr().slice(0, 4);
  return sessions.filter((s) => s.date.slice(0, 4) === y).length;
}

export function longestStreak(sessions: Session[]) {
  const days = Array.from(new Set(sessions.map((s) => s.date))).sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const day of days) {
    run = prev && addDays(prev, 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
    prev = day;
  }
  return best;
}

/** The session that first introduced each position into the whole history. */
export function firstOccurrences(sessions: Session[]) {
  const first = new Map<string, Session>();
  for (const session of sessionsSorted(sessions).reverse()) {
    for (const position of session.positions) if (!first.has(position)) first.set(position, session);
  }
  return first;
}

export function topCounts(values: string[], n = 99): [string, number][] {
  const map = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    map.set(value, (map.get(value) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

export type CompareMode = "weeks" | "months" | "years";

export function spansIn(spans: { startDate: string; endDate: string }[], from: string, to: string) {
  return spans.filter((span) => span.startDate <= to && span.endDate >= from).length;
}

export function comparisonBars(
  sessions: Session[],
  mode: CompareMode,
  weekStart: WeekStart,
  lang: Lang,
  encounters: { startDate: string; endDate: string }[] = [],
) {
  if (mode === "weeks") {
    const bars = [];
    for (let i = 7; i >= 0; i--) {
      const start = addDays(startOfWeek(todayStr(), weekStart), -7 * i);
      const end = addDays(start, 7);
      bars.push({
        label: fmtShort(start, lang),
        n: sessions.filter((s) => s.date >= start && s.date < end).length,
        encounters: spansIn(encounters, start, addDays(start, 6)),
        from: start,
        to: addDays(start, 6),
      });
    }
    return bars;
  }
  if (mode === "months") {
    const now = new Date();
    const bars = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      bars.push({
        label: d.toLocaleDateString(lang === "es" ? "es-ES" : "en-US", { month: "short" }),
        n: sessions.filter((s) => s.date.slice(0, 7) === ym).length,
        encounters: spansIn(encounters, `${ym}-01`, `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`),
        from: `${ym}-01`,
        to: `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`,
      });
    }
    return bars;
  }
  const years = Array.from(
    new Set([
      ...sessions.map((session) => session.date.slice(0, 4)),
      ...encounters.flatMap((encounter) => [encounter.startDate.slice(0, 4), encounter.endDate.slice(0, 4)]),
    ]),
  )
    .filter(Boolean)
    .sort();
  // A lifetime of bars becomes unreadable slivers (the audit, Nov 14 2026): the years view keeps
  // the most recent 14, and Insights says so under the bars.
  return years.slice(-14).map((year) => ({
    label: year,
    n: sessions.filter((s) => s.date.slice(0, 4) === year).length,
    encounters: spansIn(encounters, `${year}-01-01`, `${year}-12-31`),
    from: `${year}-01-01`,
    to: `${year}-12-31`,
  }));
}

export function weekdayCounts(sessions: Session[]) {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const s of sessions) counts[parseDate(s.date).getDay()] += 1;
  return counts;
}

export function timeBuckets(sessions: Session[]) {
  const buckets = [0, 0, 0, 0];
  for (const s of sessions) {
    const hour = Number((s.time || "21:00").split(":")[0]);
    buckets[hour < 6 ? 0 : hour < 12 ? 1 : hour < 18 ? 2 : 3] += 1;
  }
  return buckets;
}
