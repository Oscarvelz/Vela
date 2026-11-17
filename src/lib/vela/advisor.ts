/* Vela's advisor — ONE reading of the journal (2.1.22), computed here and nowhere else.
   The statistics below the Advisor card are its receipts: every line this reading produces
   carries its own evidence (a count, a date, an average taken from the journal at render
   time), and a line whose evidence falls below its threshold simply does not exist.
   The advisor never invents a number, never rounds a correlation into a cause, and never
   speaks about bodies or medicine — it reads what was written down and says what it sees. */
import { addDays, parseDate, todayStr } from "./dates";
import {
  cycleOutlier,
  cycleSnapshot,
  cycleStats,
  lowChanceDays,
  lowChanceReady,
  pastCycles,
  phaseOn,
  pregnancyNoted,
  type CyclePhase,
  type CycleReasonId,
  type DayRange,
  type Regularity,
} from "./cycle";
import { trackerForPartner, trackerName, visibleTrackers, type CycleTracker } from "./cycle-trackers";
import { firstOccurrences, longestStreak, sessionsSorted, timeBuckets, topCounts } from "./stats";
import type { QuietMark, QuietThemeId, RatingKey, Session } from "./types";
import { episodes, explanationFor } from "./quiet";
import { voiceReading } from "./voices";
import type { UpcomingDate } from "./anniversaries";

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
  | { kind: "explained"; days: number; reason: QuietThemeId | "custom"; custom?: string }
  | { kind: "cycleNote"; days: number; low: number; high: number; reasonId: CycleReasonId; noteText?: string; name: string; self: boolean }
  | { kind: "cycleProjected" }
  | { kind: "methodNote"; method: string; avg: number; n: number };

export type AdvisorFact =
  | { kind: "newPosition"; position: string; date: string; partner: string }
  | { kind: "streak"; days: number }
  | { kind: "pattern"; n: number; reason: QuietThemeId | "custom"; custom?: string }
  | { kind: "cyclePattern"; n: number; reasonId: CycleReasonId; noteText?: string; name: string; self: boolean }
  | { kind: "firmer"; tracker: CycleTracker; missing: number };

export type AdvisorReading = {
  basis: { sessions: number; cycles: number };
  people: AdvisorPerson[];
  last: { session: Session; phase: CyclePhase | null } | null;
  lines: AdvisorLine[];
  fact: AdvisorFact | null;
  /** The dates the user chose never to forget (2.1.25): today's outrank the
   *  rotating fact; the week's get a warm warning among the next-time lines.
   *  The Advisor congratulates the time — never the quality of the years. */
  dates: { today: UpcomingDate[]; soon: UpcomingDate[] };
  /** The two voices (2.2.2, couple mode only): how the two readings of the
   *  same moments compare — a distribution, never a grade. The Advisor never
   *  arbitrates between them and never reports on a person's behavior. */
  voices: {
    paired: number;
    sameOverall: number;
    partnerName: string;
    gap: { dial: RatingKey | "overall"; his: number; hers: number } | null;
  } | null;
};

function dayDiff(from: string, to: string) {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86400000);
}

export function readAdvisor(
  sessions: Session[],
  cycles: CycleTracker[],
  today = todayStr(),
  dates: UpcomingDate[] = [],
  couple?: { partnerName: string },
  quiet: QuietMark[] = [],
): AdvisorReading {
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
    const since = Math.max(0, dayDiff(dates[0], today));
    // Explained silence (2.2.4): when the current stretch is mostly named
    // and the naming reaches today, the rhythm line steps aside for the
    // explanation — stated once, in the journal's own word, never as a
    // lament and never as reassurance.
    const explainedNow =
      since >= 3
        ? explanationFor(quiet, list, addDays(dates[0], 1), today)
        : { cover: 0, mark: null as QuietMark | null };
    if (explainedNow.mark && explainedNow.cover >= 0.5 && explainedNow.mark.to >= addDays(today, -1)) {
      lines.push({
        kind: "explained",
        days: since,
        reason: explainedNow.mark.reason,
        ...(explainedNow.mark.reason === "custom" ? { custom: explainedNow.mark.custom ?? "" } : {}),
      });
    } else {
      // The usual rhythm stops drinking from explained gaps, silently: a
      // gap the journal has named is not evidence of the couple's rhythm.
      const gaps: number[] = [];
      for (let i = 0; i + 1 < dates.length; i++) {
        const gap = dayDiff(dates[i + 1], dates[i]);
        const span = explanationFor(quiet, list, addDays(dates[i + 1], 1), addDays(dates[i], -1));
        if (gap >= 14 && span.cover >= 0.5) continue;
        gaps.push(gap);
      }
      gaps.sort((a, b) => a - b);
      const usual = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
      if (usual > 0) lines.push({ kind: "rhythm", since, usual });
    }
  }

  /* ── The cycle reasons, read back (2.2.6): the Advisor watches changes,
     so it does not stay silent about the notes the changed cycles carry.
     It counts and quotes notes — it never turns one into a cause, and a
     dismissal or an "I don't know" is the absence of a note, never one. */
  type NotedCycle = { start: string; closedAt: string; id: CycleReasonId; note?: string };
  const notedOf = (tracker: CycleTracker): NotedCycle[] => {
    const starts = [...tracker.starts].sort();
    const out: NotedCycle[] = [];
    for (const row of pastCycles(tracker, 12)) {
      const reason = tracker.reasons?.[row.start];
      if (!reason || reason.id === "dismissed" || reason.id === "unknown") continue;
      if (!cycleOutlier(tracker, row.start)) continue;
      const idx = starts.indexOf(row.start);
      out.push({
        start: row.start,
        closedAt: starts[idx + 1] ?? row.start,
        id: reason.id as CycleReasonId,
        ...(reason.note ? { note: reason.note } : {}),
      });
    }
    return out.sort((a, b) => a.closedAt.localeCompare(b.closedAt));
  };

  let cycleNote: Extract<AdvisorLine, { kind: "cycleNote" }> | null = null;
  let cycleNoteClosedAt = "";
  for (const tracker of live) {
    const rows = pastCycles(tracker, 12);
    const lastRow = rows[rows.length - 1];
    if (!lastRow) continue;
    const reason = tracker.reasons?.[lastRow.start];
    if (!reason || reason.id === "dismissed" || reason.id === "unknown" || reason.id === "pregnant") continue;
    const band = cycleOutlier(tracker, lastRow.start);
    if (!band) continue;
    const starts = [...tracker.starts].sort();
    const closedAt = starts[starts.indexOf(lastRow.start) + 1] ?? lastRow.start;
    if (cycleNote && closedAt <= cycleNoteClosedAt) continue;
    cycleNoteClosedAt = closedAt;
    cycleNote = {
      kind: "cycleNote",
      days: band.length,
      low: band.low,
      high: band.high,
      reasonId: reason.id as CycleReasonId,
      ...(reason.note ? { noteText: reason.note } : {}),
      name: trackerName(tracker),
      self: tracker.perspective !== "partner",
    };
  }
  if (cycleNote) lines.push(cycleNote);
  // The one Advisor sentence about a noted pregnancy (Oscar's no-silence
  // word, 2026-11-14): it speaks of the journal and the calendar — the
  // projection the note set in motion — never of the person herself.
  if (live.some((tracker) => pregnancyNoted(tracker, today))) lines.push({ kind: "cycleProjected" });

  const cyclePatternOf = (): Extract<AdvisorFact, { kind: "cyclePattern" }> | null => {
    let best: Extract<AdvisorFact, { kind: "cyclePattern" }> | null = null;
    let bestClosedAt = "";
    for (const tracker of live) {
      const noted = notedOf(tracker).filter((n) => n.id !== "pregnant" && n.id !== "pregnancyEnd");
      if (noted.length < 2) continue;
      const keyOf = (n: NotedCycle) => (n.id === "other" ? `other:${(n.note ?? "").trim().toLowerCase()}` : n.id);
      const groups = new Map<string, NotedCycle[]>();
      for (const n of noted) groups.set(keyOf(n), [...(groups.get(keyOf(n)) ?? []), n]);
      for (const group of groups.values()) {
        if (group.length < 2) continue;
        if (!group.some((n) => n.start === noted[noted.length - 1].start)) continue;
        const latest = group[group.length - 1];
        if (dayDiff(latest.closedAt, today) > 183) continue;
        if (best && latest.closedAt <= bestClosedAt) continue;
        bestClosedAt = latest.closedAt;
        best = {
          kind: "cyclePattern",
          n: group.length,
          reasonId: latest.id,
          ...(latest.note ? { noteText: latest.note } : {}),
          name: trackerName(tracker),
          self: tracker.perspective !== "partner",
        };
      }
    }
    return best;
  };

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
      // The pattern line (2.2.4): the recent quiet stretches keep naming the
      // same cause. All four gates must hold — at least three EPISODES (one
      // long trip is one voice, never three), the latest ended within six
      // months, the most recent episode is one of them, and "we argued" is
      // categorically excluded: no surface in Vela counts arguments. The
      // template carries no consequence, no trend and no advice.
      const recent = episodes(quiet, list, today)
        .filter((ep) => ep.mark.reason !== "argued")
        .sort((a, b) => b.mark.from.localeCompare(a.mark.from))
        .slice(0, 6);
      let pattern: Extract<AdvisorFact, { kind: "pattern" }> | null = null;
      if (recent.length >= 3) {
        const keyOf = (ep: (typeof recent)[number]) =>
          ep.mark.reason === "custom" ? `custom:${(ep.mark.custom ?? "").trim().toLowerCase()}` : ep.mark.reason;
        const groups = new Map<string, typeof recent>();
        for (const ep of recent) groups.set(keyOf(ep), [...(groups.get(keyOf(ep)) ?? []), ep]);
        for (const group of groups.values()) {
          if (group.length < 3) continue;
          if (!group.some((ep) => ep.mark.id === recent[0].mark.id)) continue;
          const latestEnd = group.map((ep) => ep.mark.to).sort().reverse()[0];
          if (dayDiff(latestEnd, today) > 183) continue;
          const head = group[0].mark;
          pattern = {
            kind: "pattern",
            n: group.length,
            reason: head.reason,
            ...(head.reason === "custom" ? { custom: head.custom ?? "" } : {}),
          };
          break;
        }
      }
      if (pattern) {
        fact = pattern;
      } else {
        // The cycle-note pattern (2.2.6): changed cycles that keep carrying
        // the same note. Two is the gate — cycles are monthly events, rarer
        // than quiet stretches — and pregnancies and losses never group:
        // a "pattern" of them would imply a significance the Advisor is
        // forbidden to construct.
        const cyclePattern = cyclePatternOf();
        if (cyclePattern) {
          fact = cyclePattern;
        } else {
          const learning = live
            .map((tracker) => ({ tracker, missing: lowChanceReady(tracker).missing }))
            .filter((row) => row.missing > 0)
            .sort((a, b) => a.missing - b.missing);
          if (learning.length) fact = { kind: "firmer", tracker: learning[0].tracker, missing: learning[0].missing };
        }
      }
    }
  }

  /* ── The two voices: only in couple mode, only above real evidence ────── */
  let voices: AdvisorReading["voices"] = null;
  if (couple) {
    const reading = voiceReading(list);
    if (reading && reading.paired >= 4) {
      voices = {
        paired: reading.paired,
        sameOverall: reading.sameOverall,
        partnerName: couple.partnerName,
        gap: reading.gap ? { dial: reading.gap.dial, his: reading.gap.his, hers: reading.gap.hers } : null,
      };
    }
  }

  return {
    basis: { sessions: list.length, cycles: live.length },
    people,
    last,
    lines,
    fact,
    dates: {
      today: dates.filter((d) => d.daysUntil === 0),
      soon: dates.filter((d) => d.daysUntil >= 1 && d.daysUntil <= 7),
    },
    voices,
  };
}
