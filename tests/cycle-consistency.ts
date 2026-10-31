// Cross-surface consistency sweep for the cycle engine. Fake data only.
// For many fake histories and every "today" across ~4 months it checks that the dial, header pill,
// week strip, calendar month marks, session chip / history dot (dayInfo), insights counts
// (sessionsByPhase), history filter (phaseOn) and the low-chance arcs all agree on the same day.
// Run: node tests/run-cycle-check.mjs (runs cycle-check.ts, then this file).
import {
  cleanCycle, cycleSnapshot, cycleMarks, cycleStats, dayInfo, phaseOn, sessionsByPhase, lowChanceDays, withEnd,
  type CycleSettings, type CyclePhase,
} from "../src/lib/vela/cycle";
import { addDays } from "../src/lib/vela/dates";

let fails = 0;
let checks = 0;
const failures = new Map<string, string>();
const ok = (scenario: string, name: string, cond: boolean, extra: unknown = "") => {
  checks += 1;
  if (cond) return;
  fails += 1;
  const key = `${scenario} · ${name}`;
  if (!failures.has(key)) failures.set(key, JSON.stringify(extra));
};

function series(first: string, gaps: number[]) {
  const out = [first];
  for (const gap of gaps) out.push(addDays(out[out.length - 1], gap));
  return out;
}

const scenarios: Record<string, CycleSettings> = {
  regular28: cleanCycle({ enabled: true, starts: series("2026-01-04", [28, 29, 27, 28]) }),
  regular28ends: (() => {
    let c = cleanCycle({ enabled: true, starts: series("2026-01-04", [28, 29, 27, 28]) });
    c = withEnd(c, c.starts[0], addDays(c.starts[0], 4));
    c = withEnd(c, c.starts[1], addDays(c.starts[1], 3));
    c = withEnd(c, c.starts[4], addDays(c.starts[4], 1)); // last period ended on day 2
    return c;
  })(),
  short21: cleanCycle({ enabled: true, periodDays: 6, starts: series("2026-01-04", [21, 22, 21, 21]) }),
  long35: cleanCycle({ enabled: true, starts: series("2025-12-01", [35, 34, 36, 35]) }),
  long45: cleanCycle({ enabled: true, starts: series("2025-10-01", [44, 45, 46]) }),
  irregular: cleanCycle({ enabled: true, starts: series("2025-11-20", [24, 38, 26, 39, 30]) }),
  spread7regular: cleanCycle({ enabled: true, starts: series("2026-01-01", [25, 28, 32]) }),
  oneStart: cleanCycle({ enabled: true, starts: ["2026-03-01"] }),
  twoStarts: cleanCycle({ enabled: true, starts: ["2026-02-01", "2026-03-02"] }),
  closeStarts: cleanCycle({ enabled: true, starts: ["2026-01-05", "2026-02-02", "2026-02-05", "2026-03-05"] }),
  hugeGap: cleanCycle({ enabled: true, starts: ["2025-09-01", "2026-01-10", "2026-02-07"] }),
  tunedLuteal10Fertile7: cleanCycle({ enabled: true, lutealDays: 10, fertileDays: 7, starts: series("2026-01-04", [28, 28, 28]) }),
  short21luteal18: cleanCycle({ enabled: true, lutealDays: 18, periodDays: 7, starts: series("2026-01-04", [21, 21, 21]) }),
};

const actual = (phase: CyclePhase | undefined, predicted: boolean | undefined, ds: string, today: string): CyclePhase =>
  !phase ? "quiet" : phase === "period" && predicted && ds <= today ? "quiet" : phase;

for (const [name, cycle] of Object.entries(scenarios)) {
  const starts = cycle.starts;
  const stats = cycleStats(cycle);
  const shortest = stats.min !== null ? Math.min(stats.min, stats.cycle) : stats.cycle;
  const longest = stats.max !== null ? Math.max(stats.max, stats.cycle) : stats.cycle;
  const from = starts[starts.length - 1];
  for (let step = 0; step < 100; step += 1) {
    const today = addDays(from, step);
    const snap = cycleSnapshot(cycle, today);
    const tag = `${name}@${today}`;
    ok(name, "today has a cycle day", snap.day !== null && snap.day >= 1, { tag, day: snap.day });
    if (!snap.day || !snap.cycleStart) continue;

    // Week strip and calendar month: same mark for today regardless of the window asked for.
    const week = cycleMarks(cycle, addDays(today, -3), addDays(today, 3), today)[today];
    const month = cycleMarks(cycle, today.slice(0, 8) + "01", today.slice(0, 8) + "31", today)[today];
    ok(name, "week strip = calendar mark", JSON.stringify(week ?? null) === JSON.stringify(month ?? null), { tag, week, month });
    const seen = actual(week?.phase, week?.predicted, today, today);

    // Dial: today's ring index and mark.
    const length = Math.max(snap.ringLength, 14);
    const ring = cycleMarks(cycle, snap.cycleStart, addDays(snap.cycleStart, length - 1), today);
    ok(name, "ring index within ring", snap.day <= length, { tag, day: snap.day, length });
    ok(name, "ring mark = week mark", JSON.stringify(ring[today] ?? null) === JSON.stringify(week ?? null), { tag });
    ok(name, "snapshot phase = actual mark phase", snap.phase === seen, { tag, snap: snap.phase, seen });

    // Session chip / history dot / day panel (dayInfo for today), history filter, insights counts.
    const info = dayInfo(cycle, today, today);
    ok(name, "dayInfo(today) = snapshot", info?.phase === snap.phase && info?.stage === snap.stage && info?.cycleDay === snap.day, { tag, info, snap: [snap.phase, snap.stage, snap.day] });
    ok(name, "phaseOn = snapshot", phaseOn(cycle, today, today) === snap.phase, { tag });
    const counts = sessionsByPhase(cycle, [today], today);
    ok(name, "insights count today's session in snapshot phase", counts[snap.phase] === 1, { tag, counts, phase: snap.phase });

    // Stage rules.
    if (snap.late > 0) ok(name, "late → stage late", snap.stage === "late", { tag });
    if (snap.stage === "period") ok(name, "period stage only in a logged period", today <= snap.periodEnd! && snap.periodDay === snap.day, { tag, snap });
    ok(name, "cycle day 1 only on a logged start", snap.day !== 1 || starts.includes(today), { tag });
    ok(name, "next period never before today", snap.nextPeriod! >= today, { tag, next: snap.nextPeriod });

    // Every ring day: dayInfo's cycle day matches the ring number, and stages follow ovulation.
    for (let index = 0; index < length && step % 3 === 0; index += 1) {
      const ds = addDays(snap.cycleStart, index);
      if (ds > today && snap.late + (snap.nextPeriod === today ? 1 : 0) > 0) break; // ring ends today when due/late
      const di = dayInfo(cycle, ds, today);
      ok(name, "ring day number = dayInfo cycle day", di?.cycleDay === index + 1, { tag, ds, got: di?.cycleDay, want: index + 1 });
      if (di && di.phase === "quiet" && snap.ovulation) {
        const want = ds > snap.ovulation ? "luteal" : "follicular";
        ok(name, "quiet stage by side of ovulation", di.stage === want || ds === today, { tag, ds, got: di.stage, want });
      }
    }

    // Fertile window: 5 (setting) days before ovulation, ovulation, and the day after.
    if (snap.ovulation) {
      const after = addDays(snap.ovulation, 1);
      if (after < addDays(snap.cycleStart, snap.ringLength) && after > snap.periodEnd!) ok(name, "day after ovulation is fertile", ring[after]?.phase === "fertile", { tag, after, mark: ring[after] });
    }

    // Low-chance arcs: never on a period / fertile / ovulation day, and within rhythm-method bounds.
    const { early, low } = lowChanceDays(cycle, today, length);
    for (const range of [early, low]) {
      if (!range) continue;
      for (let index = range.from; index < range.to; index += 1) {
        const ds = addDays(snap.cycleStart, index);
        const mark = ring[ds];
        const bad = mark && (mark.phase === "fertile" || mark.phase === "ovulation" || (mark.phase === "period" && !(mark.predicted && ds >= today)));
        ok(name, "low-chance arc avoids period/fertile days", !bad, { tag, ds, mark, range });
      }
    }
    if (early) ok(name, "early arc ends by shortest − 19", early.to <= shortest - 19, { tag, early, shortest });
    if (low) ok(name, "low arc starts at or after longest − 10", low.from + 1 >= longest - 10, { tag, low, longest });
    if (low && snap.ovulation) ok(name, "low arc ≥ ovulation + 3", low.from >= Math.round((Date.parse(snap.ovulation) - Date.parse(snap.cycleStart)) / 86_400_000) + 3, { tag, low });
  }
}

for (const [key, extra] of failures) console.log(`FAIL  ${key}  — ${extra}`);
console.log(`\nconsistency: ${checks} checks, ${fails} failed (${failures.size} distinct)`);
console.log(fails ? "CONSISTENCY FAILED" : "CONSISTENCY ALL PASS");
process.exit(fails ? 1 : 0);
