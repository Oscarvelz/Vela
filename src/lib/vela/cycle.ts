import { addDays, parseDate } from "./dates";

/**
 * Cycle engine. Everything here is pure and works on dates as "YYYY-MM-DD" strings in local time.
 * The data lives in journal settings, so it is encrypted and synced with the rest of the diary.
 */

export type CyclePhase = "period" | "fertile" | "ovulation" | "quiet";
/** Finer display stage for the current day ("quiet" splits into before / after ovulation). */
export type CycleStage = "period" | "follicular" | "fertile" | "ovulation" | "luteal" | "late";
export type Flow = "spotting" | "light" | "medium" | "heavy";

export const FLOWS: Flow[] = ["spotting", "light", "medium", "heavy"];
export const SYMPTOMS = [
  "cramps",
  "headache",
  "bloating",
  "tender",
  "fatigue",
  "acne",
  "libidoHigh",
  "libidoLow",
  "discharge",
] as const;
export const MOODS = ["calm", "happy", "sensitive", "irritable", "anxious", "low"] as const;
export type Symptom = (typeof SYMPTOMS)[number];
export type Mood = (typeof MOODS)[number];

export type DayLog = { flow?: Flow; symptoms?: Symptom[]; mood?: Mood; note?: string };

export type Perspective = "self" | "partner";

export type CycleSettings = {
  enabled: boolean;
  /** "self": I track my own cycle · "partner": I follow my partner's cycle (dates only, no day log). */
  perspective: Perspective;
  /** Optional name or nickname used in partner wording. */
  partnerName: string;
  /** Usual period length, used until real ends are logged. */
  periodDays: number;
  /** Usual cycle length, used until two starts are logged. */
  cycleDays: number;
  lutealDays: number;
  fertileDays: number;
  starts: string[];
  /** Logged last day of a period, keyed by that period's start. */
  ends: Record<string, string>;
  /** Light daily log: flow, symptoms, mood, note. */
  days: Record<string, DayLog>;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PERIOD = 14;
const NOTE_MAX = 600;

export function defaultCycle(): CycleSettings {
  return { enabled: false, perspective: "self", partnerName: "", periodDays: 5, cycleDays: 28, lutealDays: 14, fertileDays: 5, starts: [], ends: {}, days: {} };
}

/** Accepts anything (old journals, synced copies) and returns a valid cycle. Old data migrates silently. */
export function cleanCycle(raw: unknown): CycleSettings {
  const base = defaultCycle();
  if (!raw || typeof raw !== "object") return base;
  const value = raw as Partial<CycleSettings>;
  const periodDays = clamp(typeof value.periodDays === "number" ? value.periodDays : base.periodDays, 2, 10);
  const cycleDays = clamp(typeof value.cycleDays === "number" ? value.cycleDays : base.cycleDays, 21, 45);
  const lutealDays = clamp(typeof value.lutealDays === "number" ? value.lutealDays : base.lutealDays, 10, 18);
  const fertileDays = clamp(typeof value.fertileDays === "number" ? value.fertileDays : base.fertileDays, 3, 7);
  const starts = sortedStarts(Array.isArray(value.starts) ? value.starts.filter((item) => typeof item === "string") : []);
  return {
    enabled: Boolean(value.enabled),
    perspective: value.perspective === "partner" ? "partner" : "self",
    partnerName: typeof value.partnerName === "string" ? value.partnerName.trim().slice(0, 40) : "",
    periodDays,
    cycleDays,
    lutealDays,
    fertileDays,
    starts,
    ends: cleanEnds(value.ends, starts),
    days: cleanDays(value.days),
  };
}

function cleanEnds(raw: unknown, starts: string[]) {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object") return out;
  const map = raw as Record<string, unknown>;
  starts.forEach((start, index) => {
    const end = map[start];
    if (typeof end !== "string" || !DATE_RE.test(end) || end < start) return;
    if (daysBetween(start, end) >= MAX_PERIOD) return;
    const next = starts[index + 1];
    if (next && end >= next) return;
    out[start] = end;
  });
  return out;
}

function cleanDays(raw: unknown) {
  const out: Record<string, DayLog> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [date, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!DATE_RE.test(date) || !entry || typeof entry !== "object") continue;
    const log = cleanLog(entry as DayLog);
    if (log) out[date] = log;
  }
  return out;
}

/** Normalises one day's log; returns null when nothing is left in it. */
export function cleanLog(entry: Partial<DayLog> | null | undefined): DayLog | null {
  if (!entry) return null;
  const log: DayLog = {};
  if (entry.flow && FLOWS.includes(entry.flow)) log.flow = entry.flow;
  if (Array.isArray(entry.symptoms)) {
    const list = [...new Set(entry.symptoms.filter((item): item is Symptom => (SYMPTOMS as readonly string[]).includes(item)))];
    if (list.length) log.symptoms = list;
  }
  if (entry.mood && (MOODS as readonly string[]).includes(entry.mood)) log.mood = entry.mood;
  if (typeof entry.note === "string" && entry.note.trim()) log.note = entry.note.trim().slice(0, NOTE_MAX);
  return Object.keys(log).length ? log : null;
}

export function sortedStarts(starts: string[]) {
  return [...new Set(starts.filter((item) => DATE_RE.test(item)))].sort();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function daysBetween(from: string, to: string) {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000);
}

/* ── Statistics ─────────────────────────────────────────────────────────── */

export type Regularity = "learning" | "regular" | "irregular";

export type CycleStatsResult = {
  /** Average cycle length (recent gaps, else the usual length). */
  cycle: number;
  /** Average period length (logged ends, else the usual length). */
  period: number;
  /** Cycle gaps used (most recent last, at most 6). */
  gaps: number[];
  sd: number;
  min: number | null;
  max: number | null;
  regularity: Regularity;
  /** ± days around predictions; 0 when regular or still learning. */
  window: number;
  periodFromLogs: boolean;
  cycleFromLogs: boolean;
};

function gapsOf(starts: string[]) {
  const gaps: number[] = [];
  for (let index = 1; index < starts.length; index += 1) {
    const gap = daysBetween(starts[index - 1], starts[index]);
    if (gap >= START_MERGE_DAYS && gap <= 60) gaps.push(gap);
  }
  return gaps.slice(-6);
}

export function cycleStats(cycle: CycleSettings): CycleStatsResult {
  const starts = sortedStarts(cycle.starts);
  const gaps = gapsOf(starts);
  const usual = clamp(cycle.cycleDays, 21, 45);
  const avg = gaps.length ? clamp(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length, 21, 45) : usual;
  const mean = gaps.length ? gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length : 0;
  const sd = gaps.length > 1 ? Math.sqrt(gaps.reduce((sum, gap) => sum + (gap - mean) ** 2, 0) / (gaps.length - 1)) : 0;
  const min = gaps.length ? Math.min(...gaps) : null;
  const max = gaps.length ? Math.max(...gaps) : null;
  // Two or more measured cycles are needed to judge; a spread over 7 days counts as irregular.
  const regularity: Regularity = gaps.length < 2 ? "learning" : (max! - min!) > 7 ? "irregular" : "regular";
  const window = regularity === "irregular" ? clamp(Math.ceil(sd), 2, 7) : 0;
  const lengths = starts
    .filter((start) => cycle.ends[start])
    .map((start) => daysBetween(start, cycle.ends[start]) + 1)
    .slice(-6);
  const period = lengths.length
    ? clamp(lengths.reduce((sum, len) => sum + len, 0) / lengths.length, 2, 10)
    : clamp(cycle.periodDays, 2, 10);
  return {
    cycle: avg,
    period,
    gaps,
    sd: Math.round(sd * 10) / 10,
    min,
    max,
    regularity,
    window,
    periodFromLogs: lengths.length > 0,
    cycleFromLogs: gaps.length > 0,
  };
}

export function cycleLengthOf(cycle: CycleSettings) {
  return cycleStats(cycle).cycle;
}

/** Completed cycles, most recent last: start, length in days, and period length (logged or usual). */
export function pastCycles(cycle: CycleSettings, limit = 6) {
  const starts = sortedStarts(cycle.starts);
  const stats = cycleStats(cycle);
  const rows: { start: string; length: number; period: number; periodLogged: boolean }[] = [];
  for (let index = 1; index < starts.length; index += 1) {
    const start = starts[index - 1];
    const length = daysBetween(start, starts[index]);
    if (length < START_MERGE_DAYS || length > 60) continue;
    const end = cycle.ends[start];
    rows.push({
      start,
      length,
      period: end ? daysBetween(start, end) + 1 : Math.min(stats.period, length),
      periodLogged: Boolean(end),
    });
  }
  return rows.slice(-limit);
}

/* ── Timeline ───────────────────────────────────────────────────────────── */

type Anchor = {
  start: string;
  next: string;
  /** The start the ovulation estimate counts back from (not shifted when a period is late). */
  ovRef: string;
  logged: boolean;
  periodEnd: string;
};

export type DayMark = {
  phase: CyclePhase;
  /** True for anything not yet confirmed by the user's own log (future, or projected cycles). */
  predicted: boolean;
  /** First day of a logged period. */
  start?: boolean;
};

function settingsNums(cycle: CycleSettings) {
  return {
    luteal: clamp(cycle.lutealDays || 14, 10, 18),
    fertile: clamp(cycle.fertileDays || 5, 3, 7),
  };
}

function lateInfo(cycle: CycleSettings, today: string) {
  const starts = sortedStarts(cycle.starts);
  if (!starts.length) return { predictedNext: null as string | null, late: 0, due: false };
  const last = starts[starts.length - 1];
  const predictedNext = addDays(last, cycleStats(cycle).cycle);
  // "Due": the predicted day has arrived (or passed) and no new start is logged yet.
  const due = last <= today && today >= predictedNext;
  const late = due ? daysBetween(predictedNext, today) : 0;
  return { predictedNext, late, due };
}

function anchors(cycle: CycleSettings, today: string): Anchor[] {
  const starts = sortedStarts(cycle.starts);
  if (starts.length === 0) return [];
  const stats = cycleStats(cycle);
  const { predictedNext, due } = lateInfo(cycle, today);
  const list: Anchor[] = [];
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index];
    const ovRef = starts[index + 1] ?? predictedNext!;
    // A due or late period keeps the current cycle open through today (it is never "day 1" until logged);
    // the projected period then starts today ("expected any day"), overlapping only that one day.
    const next = starts[index + 1] ?? (due ? addDays(today, 1) : predictedNext!);
    const end = cycle.ends[start] ?? addDays(start, stats.period - 1);
    list.push({ start, next, ovRef, logged: true, periodEnd: end < next ? end : addDays(next, -1) });
  }
  let cursor = due ? today : list[list.length - 1].next;
  for (let step = 0; step < 9; step += 1) {
    const next = addDays(cursor, stats.cycle);
    list.push({ start: cursor, next, ovRef: next, logged: false, periodEnd: addDays(cursor, stats.period - 1) });
    cursor = next;
  }
  return list;
}

const RANK: Record<CyclePhase, number> = { quiet: 0, fertile: 1, ovulation: 2, period: 3 };

/** Rich marks for each day in [from, to]: phase, whether it is predicted, and logged starts. */
export function cycleMarks(cycle: CycleSettings, from: string, to: string, today: string): Record<string, DayMark> {
  const map: Record<string, DayMark> = {};
  if (!cycle.enabled) return map;
  const { luteal, fertile } = settingsNums(cycle);
  const put = (ds: string, phase: CyclePhase, predicted: boolean) => {
    if (ds < from || ds > to) return;
    const current = map[ds];
    if (current && RANK[current.phase] >= RANK[phase]) return;
    map[ds] = { ...current, phase, predicted };
  };
  for (const anchor of anchors(cycle, today)) {
    if (anchor.start > to) break;
    if (anchor.next < from) continue;
    for (let ds = anchor.start; ds <= anchor.periodEnd; ds = addDays(ds, 1)) {
      put(ds, "period", !anchor.logged || ds > today);
    }
    const ovulation = addDays(anchor.ovRef, -luteal);
    if (ovulation > anchor.start && ovulation < anchor.next) {
      // Fertile window: the `fertile` days before ovulation, ovulation, and the day after
      // (ACOG: pregnancy is possible from 5 days before until 1 day after ovulation).
      for (let offset = -fertile; offset <= 1; offset += 1) {
        const ds = addDays(ovulation, offset);
        if (ds <= anchor.periodEnd || ds >= anchor.next) continue;
        put(ds, offset === 0 ? "ovulation" : "fertile", true);
      }
    }
    if (anchor.logged && anchor.start >= from && anchor.start <= to) map[anchor.start] = { ...map[anchor.start], start: true };
  }
  return map;
}

/** Phase per day (kept for older call sites). */
export function phaseMap(cycle: CycleSettings, from: string, to: string, today = localToday()) {
  const marks = cycleMarks(cycle, from, to, today);
  const out: Record<string, CyclePhase> = {};
  for (const [ds, mark] of Object.entries(marks)) out[ds] = mark.phase;
  return out;
}

/**
 * The phase a day actually had: a period that is only predicted for today or earlier (due / late,
 * nothing logged yet) does not count as a period day. Future days keep their predicted phase.
 */
function actualPhase(mark: DayMark | undefined, ds: string, today: string): CyclePhase {
  if (!mark) return "quiet";
  if (mark.phase === "period" && mark.predicted && ds <= today) return "quiet";
  return mark.phase;
}

export function phaseOn(cycle: CycleSettings, ds: string, today = localToday()): CyclePhase {
  if (!cycle.enabled || cycle.starts.length === 0) return "quiet";
  return actualPhase(cycleMarks(cycle, ds, ds, today)[ds], ds, today);
}

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ── Snapshot for "today" ───────────────────────────────────────────────── */

export type CycleSnapshot = {
  phase: CyclePhase;
  stage: CycleStage;
  /** Average cycle length (for predictions). */
  length: number;
  /** Length of the dial for the current cycle (grows while a period is late). */
  ringLength: number;
  day: number | null;
  cycleStart: string | null;
  nextPeriod: string | null;
  daysToPeriod: number | null;
  ovulation: string | null;
  fertileStart: string | null;
  periodEnd: string | null;
  periodLength: number;
  /** A period started recently and its end has not been logged yet. */
  periodOpen: boolean;
  periodDay: number | null;
  late: number;
  regularity: Regularity;
  window: number;
  hasStarts: boolean;
  startedToday: boolean;
};

export function cycleSnapshot(cycle: CycleSettings, today: string): CycleSnapshot {
  const starts = sortedStarts(cycle.starts);
  const stats = cycleStats(cycle);
  const empty: CycleSnapshot = {
    phase: "quiet",
    stage: "follicular",
    length: stats.cycle,
    ringLength: stats.cycle,
    day: null,
    cycleStart: null,
    nextPeriod: null,
    daysToPeriod: null,
    ovulation: null,
    fertileStart: null,
    periodEnd: null,
    periodLength: stats.period,
    periodOpen: false,
    periodDay: null,
    late: 0,
    regularity: stats.regularity,
    window: stats.window,
    hasStarts: starts.length > 0,
    startedToday: starts.includes(today),
  };
  if (!cycle.enabled || starts.length === 0) return empty;
  const { luteal, fertile } = settingsNums(cycle);
  const { late, due } = lateInfo(cycle, today);
  const list = anchors(cycle, today);
  const current = list.find((anchor) => anchor.start <= today && today < anchor.next) ?? list[0];
  const inside = current.start <= today && today < current.next;
  const day = inside ? daysBetween(current.start, today) + 1 : null;
  // While due or late the next period is "expected any day": shown as today.
  const nextPeriod = due ? today : current.start > today ? current.start : current.next;
  const ovulationRaw = addDays(current.ovRef, -luteal);
  const ovulation = ovulationRaw > current.start && ovulationRaw < current.next ? ovulationRaw : null;
  const fertileRaw = ovulation ? addDays(ovulation, -fertile) : null;
  const fertileStart = fertileRaw && fertileRaw > current.periodEnd ? fertileRaw : ovulation ? addDays(current.periodEnd, 1) : null;
  const phase = phaseOn(cycle, today, today);
  const inPeriod = phase === "period" && inside;
  const last = starts[starts.length - 1];
  // "Period ended" stays offered through the estimated end plus two days of grace.
  const periodOpen =
    current.start === last && last <= today && !cycle.ends[last] && today <= addDays(last, stats.period + 1);
  const stage: CycleStage =
    late > 0
      ? "late"
      : phase === "period"
        ? "period"
        : phase === "ovulation"
          ? "ovulation"
          : phase === "fertile"
            ? "fertile"
            : ovulation && today > ovulation
              ? "luteal"
              : "follicular";
  return {
    phase,
    stage,
    length: stats.cycle,
    ringLength: Math.max(stats.cycle, day ?? 0, inside ? daysBetween(current.start, current.next) : 0),
    day,
    cycleStart: inside ? current.start : null,
    nextPeriod,
    daysToPeriod: daysBetween(today, nextPeriod),
    ovulation,
    fertileStart,
    periodEnd: current.periodEnd,
    periodLength: stats.period,
    periodOpen,
    periodDay: inPeriod ? daysBetween(current.start, today) + 1 : null,
    late,
    regularity: stats.regularity,
    window: stats.window,
    hasStarts: true,
    startedToday: starts.includes(today),
  };
}

/* ── Lower-chance days on the dial ────────────────────────────────────── */

export type DayRange = { from: number; to: number };

/**
 * Lower-chance days of the current cycle as ring indices (0 = cycle day 1, `to` exclusive).
 * Conservative calendar (rhythm-method) bounds: the shortest and longest measured cycles are used
 * (first fertile day = shortest − 18, last fertile day = longest − 11), never the average alone, and
 * the app's own fertile window (with the day after ovulation) is never covered. While the rhythm is
 * still learning or irregular, one extra day of margin is kept on each side.
 * - early: after the period ends, before any possibly fertile day (less certain).
 * - low: from 3 days after the estimated ovulation (4 unless regular) to the end of the ring.
 */
export function lowChanceDays(cycle: CycleSettings, today: string, ringLength?: number): { early: DayRange | null; low: DayRange | null } {
  const none = { early: null, low: null };
  const snap = cycleSnapshot(cycle, today);
  if (!snap.cycleStart || !snap.ovulation || !snap.fertileStart || !snap.periodEnd) return none;
  const stats = cycleStats(cycle);
  const length = ringLength ?? snap.ringLength;
  const margin = stats.regularity === "regular" ? 0 : 1;
  const shortest = stats.min !== null ? Math.min(stats.min, stats.cycle) : stats.cycle;
  const longest = stats.max !== null ? Math.max(stats.max, stats.cycle) : stats.cycle;
  const index = (ds: string) => daysBetween(snap.cycleStart!, ds);
  const ov = index(snap.ovulation);
  const fertileFrom = index(snap.fertileStart);
  const earlyFrom = index(snap.periodEnd) + 1;
  // Last lower-chance index before the window: day (shortest − 19) → index shortest − 20.
  const earlyTo = Math.min(fertileFrom - margin, shortest - 19, ov - 1);
  const lowFrom = Math.max(ov + 3 + margin, longest - 11);
  return {
    early: earlyTo > earlyFrom ? { from: earlyFrom, to: earlyTo } : null,
    low: lowFrom < length - 1 ? { from: lowFrom, to: length } : null,
  };
}

/** Measured cycles needed before the dial shows lower-chance days at all. */
export const LOW_CHANCE_MIN_CYCLES = 6;

/**
 * Whether lower-chance days may be shown. Calendar bounds are only as good as the measured spread, so
 * they stay hidden while the rhythm is still learning: fewer than LOW_CHANCE_MIN_CYCLES measured cycles.
 * `missing` is how many more measured cycles are needed (0 when ready).
 */
export function lowChanceReady(cycle: CycleSettings): { ready: boolean; measured: number; missing: number } {
  const measured = cycleStats(cycle).gaps.length;
  const missing = Math.max(0, LOW_CHANCE_MIN_CYCLES - measured);
  return { ready: cycle.enabled && missing === 0, measured, missing };
}

/** The logged period (start and end, logged or estimated) that contains this date, if any. */
export function periodContaining(cycle: CycleSettings, ds: string) {
  const starts = sortedStarts(cycle.starts);
  const stats = cycleStats(cycle);
  for (let index = starts.length - 1; index >= 0; index -= 1) {
    const start = starts[index];
    if (start > ds) continue;
    const limit = addDays(start, MAX_PERIOD - 1);
    const next = starts[index + 1];
    if (ds > limit || (next && ds >= next)) return null;
    const end = cycle.ends[start] ?? null;
    return { start, end, estimatedEnd: end ?? addDays(start, stats.period - 1) };
  }
  return null;
}

/* ── Sessions and symptoms by phase ─────────────────────────────────────── */

export function sessionsByPhase(cycle: CycleSettings, dates: string[], today: string) {
  const counts: Record<CyclePhase, number> = { period: 0, fertile: 0, ovulation: 0, quiet: 0 };
  const starts = sortedStarts(cycle.starts);
  if (!cycle.enabled || starts.length === 0) return counts;
  const last = dates.reduce((max, date) => (date > max ? date : max), today);
  const map = cycleMarks(cycle, starts[0], last < today ? today : last, today);
  for (const date of dates) {
    if (date < starts[0] || date > today) continue;
    counts[actualPhase(map[date], date, today)] += 1;
  }
  return counts;
}

/** How often high / low libido was logged in each phase (only days up to today, after the first start). */
export function libidoByPhase(cycle: CycleSettings, today: string) {
  const out = {
    high: { period: 0, fertile: 0, ovulation: 0, quiet: 0 } as Record<CyclePhase, number>,
    low: { period: 0, fertile: 0, ovulation: 0, quiet: 0 } as Record<CyclePhase, number>,
    total: 0,
  };
  const starts = sortedStarts(cycle.starts);
  // Partner mode never reads the day log (it stays stored, just hidden).
  if (!cycle.enabled || cycle.perspective === "partner" || !starts.length) return out;
  const dates = Object.keys(cycle.days).filter((ds) => ds >= starts[0] && ds <= today);
  if (!dates.length) return out;
  const map = cycleMarks(cycle, starts[0], today, today);
  for (const ds of dates) {
    const symptoms = cycle.days[ds].symptoms ?? [];
    const phase = actualPhase(map[ds], ds, today);
    if (symptoms.includes("libidoHigh")) {
      out.high[phase] += 1;
      out.total += 1;
    }
    if (symptoms.includes("libidoLow")) {
      out.low[phase] += 1;
      out.total += 1;
    }
  }
  return out;
}

/* ── Mutations (pure; the store wraps them) ─────────────────────────────── */

/**
 * Two starts closer than this are usually one period logged twice, so a new start this close MOVES the old one
 * (Nov 1 2026: a wrong start re-logged 3 days later should move it). It is also the shortest gap counted as a
 * cycle in stats and past cycles, so a start kept exactly 14 days later always counts.
 */
export const START_MERGE_DAYS = 14;

/**
 * The existing start (at most one) that a new start on `date` would replace. Lets the UI warn first.
 * - Only a start within 14 days, the nearest one (a tie goes to the earlier start: the re-logged-later case).
 * - Never one whose period already has a logged end before `date`: that is a separate period, so the new
 *   start begins a new (short) cycle instead.
 * - Never a newer start that has its own logged end (backfilling history must not erase a real period).
 */
export function startsReplacedBy(cycle: Pick<CycleSettings, "starts" | "ends">, date: string): string[] {
  if (cycle.starts.includes(date)) return [];
  const ends = cycle.ends ?? {};
  const candidates = cycle.starts.filter((item) => {
    if (Math.abs(daysBetween(item, date)) >= START_MERGE_DAYS) return false;
    const end = ends[item];
    if (item < date) return !end || end >= date;
    return !end;
  });
  candidates.sort((a, b) => Math.abs(daysBetween(a, date)) - Math.abs(daysBetween(b, date)) || a.localeCompare(b));
  return candidates.slice(0, 1);
}

export function withStart(cycle: CycleSettings, date: string): CycleSettings {
  const ends = { ...cycle.ends };
  const near = startsReplacedBy(cycle, date);
  let carried: string | undefined;
  for (const old of near) {
    if (ends[old] && ends[old] >= date) carried = ends[old];
    delete ends[old];
  }
  if (carried && !ends[date]) ends[date] = carried;
  const starts = cycle.starts.filter((item) => !near.includes(item));
  return cleanCycle({ ...cycle, enabled: true, starts: sortedStarts([...starts, date]), ends });
}

export function withoutStart(cycle: CycleSettings, date: string): CycleSettings {
  const ends = { ...cycle.ends };
  delete ends[date];
  return cleanCycle({ ...cycle, starts: cycle.starts.filter((item) => item !== date), ends });
}

/** Sets (or clears, with end = null) the last day of the period that started on `start`. */
export function withEnd(cycle: CycleSettings, start: string, end: string | null): CycleSettings {
  const ends = { ...cycle.ends };
  if (end) ends[start] = end;
  else delete ends[start];
  return cleanCycle({ ...cycle, ends });
}

export function withDayLog(cycle: CycleSettings, date: string, log: Partial<DayLog> | null): CycleSettings {
  const days = { ...cycle.days };
  const clean = cleanLog(log);
  if (clean) days[date] = clean;
  else delete days[date];
  return cleanCycle({ ...cycle, days });
}

/* ── Any single day ─────────────────────────────────────────────────────── */

export type DayInfo = {
  phase: CyclePhase;
  stage: CycleStage;
  predicted: boolean;
  /** Day of the cycle (1 = first day of the period that day belongs to), or null before the first start. */
  cycleDay: number | null;
};

/** Phase, stage and cycle day for any date (past or future), judged against the real today. */
export function dayInfo(cycle: CycleSettings, ds: string, today: string): DayInfo | null {
  const starts = sortedStarts(cycle.starts);
  if (!cycle.enabled || !starts.length || ds < starts[0]) return null;
  if (ds === today) {
    const snap = cycleSnapshot(cycle, today);
    return { phase: snap.phase, stage: snap.stage, predicted: false, cycleDay: snap.day };
  }
  // The scan must reach back to the start of this day's cycle and ahead to the next period, even when a
  // cycle ran long (a very late period, or months with no start logged).
  let before = starts[0];
  for (const start of starts) if (start <= ds) before = start;
  const after = starts.find((start) => start > ds) ?? (ds < today ? today : ds);
  const span = Math.max(60, cycleStats(cycle).cycle + 20, daysBetween(before, ds) + 2, daysBetween(ds, after) + 2);
  const marks = cycleMarks(cycle, addDays(ds, -span), addDays(ds, span), today);
  const mark = marks[ds];
  let cycleDay: number | null = null;
  for (let back = 0; back <= span; back += 1) {
    const day = addDays(ds, -back);
    const here = marks[day];
    const before = marks[addDays(day, -1)];
    if (here?.phase === "period" && (here.start || before?.phase !== "period")) {
      cycleDay = back + 1;
      break;
    }
  }
  let stage: CycleStage = "follicular";
  if (mark && mark.phase !== "quiet") stage = mark.phase === "period" ? "period" : mark.phase;
  else {
    for (let ahead = 1; ahead <= span; ahead += 1) {
      const next = marks[addDays(ds, ahead)];
      if (!next) continue;
      stage = next.phase === "period" ? "luteal" : "follicular";
      break;
    }
  }
  return { phase: mark?.phase ?? "quiet", stage, predicted: Boolean(mark?.predicted) || ds > today, cycleDay };
}
