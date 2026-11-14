/* Vela's advisor — ONE reading of the journal (2.1.22), computed here and nowhere else.
   The statistics below the Advisor card are its receipts: every line this reading produces
   carries its own evidence (a count, a date, an average taken from the journal at render
   time), and a line whose evidence falls below its threshold simply does not exist.
   The advisor never invents a number, never rounds a correlation into a cause, and never
   speaks about bodies or medicine — it reads what was written down and says what it sees. */
import { addDays, parseDate, todayStr } from "./dates";
import {
  cycleSnapshot,
  cycleStats,
  lowChanceDays,
  lowChanceReady,
  phaseOn,
  type CyclePhase,
  type DayRange,
  type Regularity,
} from "./cycle";
import { trackerForPartner, visibleTrackers, type CycleTracker } from "./cycle-trackers";
import { firstOccurrences, longestStreak, sessionsSorted, timeBuckets, topCounts } from "./stats";
import type { Session } from "./types";

export type AdvisorPerson = {
  tracker: CycleTracker;
  fertileStart: string | null;
  ovulation: string | null;
  nextPeriod: string | null;
  daysToPeriod: number | null;
  late: number;
  regularity: Regularity;
  window: number;
  lowReady: boolean;
  lowMissing: number;
  /** Lower-chance stretches as DATES (the dial speaks in ring indices; the advisor speaks in days). */
  low: { early: { start: string; end: string } | null; low: { start: string; end: string } | null };
};

export type AdvisorLine =
  | { kind: "problemBucket"; problem: string; bucket: number; n: number; m: number }
  | { kind: "bestShare"; via: "position" | "place" | "bucket"; value: string; bucket: number; n: number; m: number }
  | { kind: "phaseBest"; name: string; phase: CyclePhase; avg: number; n: number }
  | { kind: "rhythm"; since: number; usual: number }
  | { kind: "methodNote"; method: string; avg: number; n: number };

export type AdvisorFact =
  | { kind: "newPosition"; position: string; date: string; partner: string }
  | { kind: "streak"; days: number }
  | { kind: "firmer"; tracker: CycleTracker; missing: number };

export type AdvisorReading = {
  basis: { sessions: number; cycles: number };
  people: AdvisorPerson[];
  last: { session: Session; phase: CyclePhase | null } | null;
  lines: AdvisorLine[];
  fact: AdvisorFact | null;
};

function dayDiff(from: string, to: string) {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86400000);
}

export function readAdvisor(sessions: Session[], cycles: CycleTracker[], today = todayStr()): AdvisorReading {
  const list = sessionsSorted(sessions);
  const live = visibleTrackers(cycles).filter((tracker) => tracker.starts.length > 0);

  /* ── The days ahead, one block per followed person ─────────────────────── */
  const people: AdvisorPerson[] = live
    .map((tracker) => {
      const snap = cycleSnapshot(tracker, today);
      const ready = lowChanceReady(tracker);
      const ring = ready.ready ? lowChanceDays(tracker, today) : { early: null, low: null };
      const toDates = (range: DayRange | null) =>
        range && snap.cycleStart ? { start: addDays(snap.cycleStart, range.from), end: addDays(snap.cycleStart, range.to - 1) } : null;
      return {
        tracker,
        fertileStart: snap.fertileStart,
        ovulation: snap.ovulation,
        nextPeriod: snap.nextPeriod,
        daysToPeriod: snap.daysToPeriod,
        late: snap.late,
        regularity: cycleStats(tracker).regularity,
        window: snap.window,
        lowReady: ready.ready,
        lowMissing: ready.missing,
        low: { early: toDates(ring.early), low: toDates(ring.low) },
      };
    })
    .sort((a, b) => (a.fertileStart ?? "9999-99-99").localeCompare(b.fertileStart ?? "9999-99-99"));

  /* ── Last time ─────────────────────────────────────────────────────────── */
  const lastSession = list[0] ?? null;
  let last: AdvisorReading["last"] = null;
  if (lastSession) {
    const tracker = trackerForPartner(cycles, lastSession.partnerName);
    last = { session: lastSession, phase: tracker ? phaseOn(tracker, lastSession.date, today) : null };
  }

  /* ── For next time: pattern lines, each with its threshold ─────────────── */
  const lines: AdvisorLine[] = [];

  const topProblem = topCounts(list.flatMap((session) => session.problems))[0];
  if (topProblem && topProblem[1] >= 3) {
    const carriers = list.filter((session) => session.problems.includes(topProblem[0]));
    const buckets = timeBuckets(carriers);
    const bucket = buckets.indexOf(Math.max(...buckets));
    lines.push({ kind: "problemBucket", problem: topProblem[0], bucket, n: buckets[bucket], m: carriers.length });
  }

  const best = list.filter((session) => session.overall >= 4.5);
  if (best.length >= 5) {
    const byPosition = topCounts(best.flatMap((session) => session.positions))[0];
    const byPlace = topCounts(best.map((session) => session.place))[0];
    const buckets = timeBuckets(best);
    const bucket = buckets.indexOf(Math.max(...buckets));
    const candidates: Extract<AdvisorLine, { kind: "bestShare" }>[] = [];
    if (byPosition) candidates.push({ kind: "bestShare", via: "position", value: byPosition[0], bucket: -1, n: byPosition[1], m: best.length });
    if (byPlace) candidates.push({ kind: "bestShare", via: "place", value: byPlace[0], bucket: -1, n: byPlace[1], m: best.length });
    candidates.push({ kind: "bestShare", via: "bucket", value: "", bucket, n: buckets[bucket], m: best.length });
    candidates.sort((a, b) => b.n - a.n);
    if (candidates[0] && candidates[0].n >= 2) lines.push(candidates[0]);
  }

  const phaseGroups = new Map<string, { name: string; tracker: CycleTracker; sessions: Session[] }>();
  for (const session of list) {
    if (!session.partnerName) continue;
    const tracker = trackerForPartner(cycles, session.partnerName);
    if (!tracker) continue;
    const key = tracker.id;
    const group = phaseGroups.get(key) ?? { name: session.partnerName, tracker, sessions: [] };
    group.sessions.push(session);
    phaseGroups.set(key, group);
  }
  let phaseBest: Extract<AdvisorLine, { kind: "phaseBest" }> | null = null;
  for (const group of phaseGroups.values()) {
    const perPhase = new Map<CyclePhase, { sum: number; n: number }>();
    for (const session of group.sessions) {
      if (session.overall <= 0) continue;
      const phase = phaseOn(group.tracker, session.date, today);
      const cell = perPhase.get(phase) ?? { sum: 0, n: 0 };
      cell.sum += session.overall;
      cell.n += 1;
      perPhase.set(phase, cell);
    }
    for (const [phase, cell] of perPhase) {
      if (phase === "quiet") continue; // quiet is the absence of a phase — never a phase headline
      if (cell.n < 3) continue;
      const avg = cell.sum / cell.n;
      if (!phaseBest || avg > phaseBest.avg || (avg === phaseBest.avg && cell.n > phaseBest.n)) {
        phaseBest = { kind: "phaseBest", name: group.name, phase, avg, n: cell.n };
      }
    }
  }
  if (phaseBest) lines.push(phaseBest);

  if (list.length >= 6) {
    const dates = Array.from(new Set(list.map((session) => session.date))).sort().reverse();
    const gaps: number[] = [];
    for (let i = 0; i + 1 < dates.length; i++) gaps.push(dayDiff(dates[i + 1], dates[i]));
    gaps.sort((a, b) => a - b);
    const usual = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
    if (usual > 0) lines.push({ kind: "rhythm", since: Math.max(0, dayDiff(dates[0], today)), usual });
  }

  const methodGroups = new Map<string, { sum: number; n: number }>();
  for (const session of list) {
    if (session.overall <= 0) continue;
    for (const method of session.contraception) {
      if (!method || method === "none") continue;
      const cell = methodGroups.get(method) ?? { sum: 0, n: 0 };
      cell.sum += session.overall;
      cell.n += 1;
      methodGroups.set(method, cell);
    }
  }
  let methodBest: { method: string; avg: number; n: number } | null = null;
  for (const [method, cell] of methodGroups) {
    if (cell.n < 4) continue;
    const avg = cell.sum / cell.n;
    if (!methodBest || avg > methodBest.avg || (avg === methodBest.avg && cell.n > methodBest.n)) methodBest = { method, avg, n: cell.n };
  }
  if (methodBest) lines.push({ kind: "methodNote", method: methodBest.method, avg: methodBest.avg, n: methodBest.n });

  /* ── Good to know: one fact, the first that is true ────────────────────── */
  let fact: AdvisorFact | null = null;
  const fresh = Array.from(firstOccurrences(list).entries())
    .filter(([, session]) => dayDiff(session.date, today) >= 0 && dayDiff(session.date, today) <= 30)
    .sort((a, b) => b[1].date.localeCompare(a[1].date));
  if (fresh.length) {
    fact = { kind: "newPosition", position: fresh[0][0], date: fresh[0][1].date, partner: fresh[0][1].partnerName };
  } else {
    const streak = longestStreak(list);
    if (streak >= 7) {
      fact = { kind: "streak", days: streak };
    } else {
      const learning = live
        .map((tracker) => ({ tracker, missing: lowChanceReady(tracker).missing }))
        .filter((row) => row.missing > 0)
        .sort((a, b) => a.missing - b.missing);
      if (learning.length) fact = { kind: "firmer", tracker: learning[0].tracker, missing: learning[0].missing };
    }
  }

  return { basis: { sessions: list.length, cycles: live.length }, people, last, lines, fact };
}
