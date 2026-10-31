import { addDays, parseDate } from "./dates";

export type CyclePhase = "period" | "fertile" | "ovulation" | "quiet";

export type CycleSettings = {
  enabled: boolean;
  periodDays: number;
  cycleDays: number;
  lutealDays: number;
  fertileDays: number;
  starts: string[];
};

export function defaultCycle(): CycleSettings {
  return { enabled: false, periodDays: 5, cycleDays: 28, lutealDays: 14, fertileDays: 5, starts: [] };
}

export function cleanCycle(raw: unknown): CycleSettings {
  const base = defaultCycle();
  if (!raw || typeof raw !== "object") return base;
  const value = raw as Partial<CycleSettings>;
  const periodDays = clamp(typeof value.periodDays === "number" ? value.periodDays : base.periodDays, 2, 10);
  const cycleDays = clamp(typeof value.cycleDays === "number" ? value.cycleDays : base.cycleDays, 21, 45);
  const lutealDays = clamp(typeof value.lutealDays === "number" ? value.lutealDays : base.lutealDays, 10, 18);
  const fertileDays = clamp(typeof value.fertileDays === "number" ? value.fertileDays : base.fertileDays, 3, 7);
  const starts = sortedStarts(Array.isArray(value.starts) ? value.starts.filter((item) => typeof item === "string") : []);
  return { enabled: Boolean(value.enabled), periodDays, cycleDays, lutealDays, fertileDays, starts };
}

export function sortedStarts(starts: string[]) {
  return [...new Set(starts.filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item)))].sort();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function daysBetween(from: string, to: string) {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000);
}

function averageCycle(starts: string[], fallback: number) {
  const gaps: number[] = [];
  for (let index = 1; index < starts.length; index += 1) {
    const gap = daysBetween(starts[index - 1], starts[index]);
    if (gap >= 15 && gap <= 60) gaps.push(gap);
  }
  if (gaps.length === 0) return fallback;
  const recent = gaps.slice(-6);
  const avg = Math.round(recent.reduce((sum, gap) => sum + gap, 0) / recent.length);
  return clamp(avg, 21, 45);
}

export function cycleLengthOf(cycle: CycleSettings) {
  return averageCycle(sortedStarts(cycle.starts), clamp(cycle.cycleDays, 21, 45));
}

type Anchor = { start: string; next: string; logged: boolean };

function anchors(cycle: CycleSettings): Anchor[] {
  const starts = sortedStarts(cycle.starts);
  if (starts.length === 0) return [];
  const length = averageCycle(starts, clamp(cycle.cycleDays, 21, 45));
  const list: Anchor[] = [];
  for (let index = 0; index < starts.length; index += 1) {
    const next = starts[index + 1] ?? addDays(starts[index], length);
    list.push({ start: starts[index], next, logged: true });
  }
  let cursor = list[list.length - 1].next;
  for (let step = 0; step < 8; step += 1) {
    const next = addDays(cursor, length);
    list.push({ start: cursor, next, logged: false });
    cursor = next;
  }
  return list;
}

function paint(map: Record<string, CyclePhase>, ds: string, phase: CyclePhase, from: string, to: string) {
  if (ds < from || ds > to) return;
  const current = map[ds];
  if (current === "period") return;
  if (phase === "period" || !current || phase === "ovulation" || (phase === "fertile" && current !== "ovulation")) {
    map[ds] = phase;
  }
}

export function phaseMap(cycle: CycleSettings, from: string, to: string) {
  const map: Record<string, CyclePhase> = {};
  if (!cycle.enabled) return map;
  const period = clamp(cycle.periodDays, 2, 10);
  const luteal = clamp(cycle.lutealDays || 14, 10, 18);
  const fertile = clamp(cycle.fertileDays || 5, 3, 7);
  for (const anchor of anchors(cycle)) {
    for (let day = 0; day < period; day += 1) {
      const ds = addDays(anchor.start, day);
      if (ds >= anchor.next) break;
      paint(map, ds, "period", from, to);
    }
    const ovulation = addDays(anchor.next, -luteal);
    if (ovulation <= anchor.start || ovulation >= anchor.next) continue;
    for (let offset = -fertile; offset <= 0; offset += 1) {
      const ds = addDays(ovulation, offset);
      if (ds <= anchor.start || ds >= anchor.next) continue;
      paint(map, ds, offset === 0 ? "ovulation" : "fertile", from, to);
    }
  }
  return map;
}

export function phaseOn(cycle: CycleSettings, ds: string): CyclePhase {
  if (!cycle.enabled || cycle.starts.length === 0) return "quiet";
  return phaseMap(cycle, ds, ds)[ds] ?? "quiet";
}

export type CycleSnapshot = {
  phase: CyclePhase;
  length: number;
  day: number | null;
  nextPeriod: string | null;
  ovulation: string | null;
  fertileStart: string | null;
  periodEnd: string | null;
  hasStarts: boolean;
  startedToday: boolean;
};

export function cycleSnapshot(cycle: CycleSettings, today: string): CycleSnapshot {
  const starts = sortedStarts(cycle.starts);
  const length = averageCycle(starts, clamp(cycle.cycleDays, 21, 45));
  const empty: CycleSnapshot = {
    phase: "quiet",
    length,
    day: null,
    nextPeriod: null,
    ovulation: null,
    fertileStart: null,
    periodEnd: null,
    hasStarts: starts.length > 0,
    startedToday: starts.includes(today),
  };
  if (!cycle.enabled || starts.length === 0) return empty;
  const luteal = clamp(cycle.lutealDays || 14, 10, 18);
  const fertile = clamp(cycle.fertileDays || 5, 3, 7);
  const list = anchors(cycle);
  const current = list.find((anchor) => anchor.start <= today && today < anchor.next) ?? list[0];
  const nextPeriod = current.start > today ? current.start : current.next;
  const ovulation = addDays(current.next, -luteal);
  const fertileStart = addDays(ovulation, -fertile);
  const periodEnd = addDays(current.start, clamp(cycle.periodDays, 2, 10) - 1);
  return {
    phase: phaseOn(cycle, today),
    length,
    day: current.start <= today && today < current.next ? daysBetween(current.start, today) + 1 : null,
    nextPeriod,
    ovulation: ovulation > current.start && ovulation < current.next ? ovulation : null,
    fertileStart: fertileStart > current.start && fertileStart < current.next ? fertileStart : null,
    periodEnd: periodEnd < current.next ? periodEnd : addDays(current.next, -1),
    hasStarts: true,
    startedToday: starts.includes(today),
  };
}

export function sessionsByPhase(cycle: CycleSettings, dates: string[], today: string) {
  const counts: Record<CyclePhase, number> = { period: 0, fertile: 0, ovulation: 0, quiet: 0 };
  const starts = sortedStarts(cycle.starts);
  if (!cycle.enabled || starts.length === 0) return counts;
  const last = dates.reduce((max, date) => (date > max ? date : max), today);
  const map = phaseMap(cycle, starts[0], last < today ? today : last);
  for (const date of dates) {
    if (date < starts[0] || date > today) continue;
    counts[map[date] ?? "quiet"] += 1;
  }
  return counts;
}
