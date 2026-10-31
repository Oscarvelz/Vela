// Sanity checks for the cycle engine. Fake data only. Run: node tests/run-cycle-check.mjs
import {
  cleanCycle, cycleStats, cycleSnapshot, cycleMarks, pastCycles, withStart, withEnd, withDayLog, withoutStart,
  libidoByPhase, sessionsByPhase, periodContaining, defaultCycle, dayInfo, lowChanceDays, lowChanceReady, LOW_CHANCE_MIN_CYCLES, phaseOn,
} from "../src/lib/vela/cycle";
import { addDays } from "../src/lib/vela/dates";

let fails = 0;
const ok = (name: string, cond: boolean, extra: unknown = "") => {
  if (!cond) fails += 1;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra !== "" ? "  — " + JSON.stringify(extra) : ""}`);
};

// 1. Migration of an old-shape cycle (no ends/days) and junk.
const old = cleanCycle({ enabled: true, periodDays: 5, cycleDays: 28, lutealDays: 14, fertileDays: 5, starts: ["2026-01-01", "bad", "2026-01-29"] });
ok("old data migrates: ends {}", JSON.stringify(old.ends) === "{}");
ok("old data migrates: days {}", JSON.stringify(old.days) === "{}");
ok("bad start dropped", old.starts.length === 2);
ok("null → default", JSON.stringify(cleanCycle(null)) === JSON.stringify(defaultCycle()));
const junk = cleanCycle({ enabled: true, starts: ["2026-01-01", "2026-01-29"], ends: { "2026-01-01": "2026-01-30", "2026-01-29": "2026-02-02", "x": "y" }, days: { "2026-01-02": { flow: "medium", symptoms: ["cramps", "nope"], mood: "calm", note: "  fake  " }, "2026-01-03": {}, bad: { flow: "heavy" } } });
ok("end past next start dropped", !junk.ends["2026-01-01"]);
ok("valid end kept", junk.ends["2026-01-29"] === "2026-02-02");
ok("day log cleaned", JSON.stringify(junk.days) === JSON.stringify({ "2026-01-02": { flow: "medium", symptoms: ["cramps"], mood: "calm", note: "fake" } }), junk.days);

// 2. Regular history: 28/29/27/28 days, periods of 5/4/5 days.
const today = "2026-06-10";
let c = cleanCycle({ enabled: true, starts: ["2026-03-01", "2026-03-29", "2026-04-27", "2026-05-24", "2026-06-21"].slice(0, 4) });
c = withEnd(c, "2026-03-01", "2026-03-05");
c = withEnd(c, "2026-03-29", "2026-04-01");
c = withEnd(c, "2026-04-27", "2026-05-01");
const st = cycleStats(c);
ok("avg cycle ≈ 28", st.cycle === 28, st);
ok("avg period from ends = 5 (4.67→5)", st.period === 5 && st.periodFromLogs, st.period);
ok("regular", st.regularity === "regular" && st.window === 0);
const snap = cycleSnapshot(c, today);
ok("cycle day 18 on Jun 10 (start May 24)", snap.day === 18, snap.day);
ok("next period Jun 21", snap.nextPeriod === "2026-06-21", snap.nextPeriod);
ok("ovulation Jun 7", snap.ovulation === "2026-06-07", snap.ovulation);
ok("stage luteal", snap.stage === "luteal", snap.stage);
ok("not late", snap.late === 0);
const marks = cycleMarks(c, "2026-05-20", "2026-07-10", today);
ok("May 24 logged start", marks["2026-05-24"]?.start === true && marks["2026-05-24"].predicted === false);
ok("May 28 period (estimated end, logged cycle)", marks["2026-05-28"]?.phase === "period" && !marks["2026-05-28"].predicted);
ok("Jun 21 predicted period", marks["2026-06-21"]?.phase === "period" && marks["2026-06-21"].predicted);
ok("Jun 7 ovulation", marks["2026-06-07"]?.phase === "ovulation");
ok("Jun 3 fertile", marks["2026-06-03"]?.phase === "fertile");
ok("Jun 15 quiet", !marks["2026-06-15"]);
ok("past cycles = 3", pastCycles(c).length === 3, pastCycles(c));

ok("dayInfo Jun 3 fertile, day 11", dayInfo(c, "2026-06-03", today)?.stage === "fertile" && dayInfo(c, "2026-06-03", today)?.cycleDay === 11, dayInfo(c, "2026-06-03", today));
ok("dayInfo May 30 follicular", dayInfo(c, "2026-05-30", today)?.stage === "follicular");
ok("dayInfo Jun 15 luteal predicted", dayInfo(c, "2026-06-15", today)?.stage === "luteal" && dayInfo(c, "2026-06-15", today)?.predicted === true);
ok("dayInfo before first start null", dayInfo(c, "2026-01-01", today) === null);

// 3. Late detection.
const lateSnap = cycleSnapshot(c, "2026-06-24");
ok("late by 3", lateSnap.late === 3 && lateSnap.stage === "late", lateSnap);
ok("late: day 32", lateSnap.day === 32, lateSnap.day);
ok("late: ring grows", lateSnap.ringLength >= 32);
ok("late: next = today", lateSnap.nextPeriod === "2026-06-24");
const lateMarks = cycleMarks(c, "2026-06-20", "2026-06-30", "2026-06-24");
ok("late: past days not painted as period", !lateMarks["2026-06-22"] || lateMarks["2026-06-22"].phase !== "period", lateMarks["2026-06-22"]);
ok("late: tomorrow predicted period", lateMarks["2026-06-25"]?.phase === "period" && lateMarks["2026-06-25"].predicted);

// 4. Irregular → window.
const irr = cleanCycle({ enabled: true, starts: ["2026-01-01", "2026-01-25", "2026-03-04", "2026-03-30", "2026-05-08"] });
const ist = cycleStats(irr);
ok("irregular", ist.regularity === "irregular" && ist.window >= 2, ist);
ok("learning with 2 starts", cycleStats(cleanCycle({ enabled: true, starts: ["2026-01-01", "2026-01-29"] })).regularity === "learning");

// 5. Period open / end, day log, removal.
let p = cleanCycle({ enabled: true, starts: ["2026-05-01", "2026-05-29"] });
const open = cycleSnapshot(p, "2026-05-31");
ok("period open on day 3", open.periodOpen && open.periodDay === 3 && open.stage === "period", open);
p = withEnd(p, "2026-05-29", "2026-05-31");
ok("ended → not open", !cycleSnapshot(p, "2026-05-31").periodOpen);
ok("periodContaining", periodContaining(p, "2026-05-30")?.start === "2026-05-29");
p = withDayLog(p, "2026-05-30", { flow: "heavy", symptoms: ["cramps", "libidoLow"], mood: "low" });
p = withDayLog(p, "2026-06-12", { symptoms: ["libidoHigh"] });
const lib = libidoByPhase(p, "2026-06-20");
ok("libido counts", lib.low.period === 1 && lib.high.fertile + lib.high.ovulation === 1 && lib.total === 2, lib);
p = withDayLog(p, "2026-06-12", null);
ok("empty log removed", !p.days["2026-06-12"]);
p = withoutStart(p, "2026-05-29");
ok("removing start drops its end", !p.ends["2026-05-29"] && p.starts.length === 1);
p = withStart(p, "2026-05-29");
ok("re-add start", p.starts.length === 2);
const sbp = sessionsByPhase(c, ["2026-05-25", "2026-06-05", "2026-06-07", "2026-06-09"], today);
ok("sessions by phase", sbp.period === 1 && sbp.fertile === 1 && sbp.ovulation === 1 && sbp.quiet === 1, sbp);

// 5b. Perspective.
ok("old data defaults to self", old.perspective === "self" && old.partnerName === "");
const partner = cleanCycle({ ...p, perspective: "partner", partnerName: "  Fakena  ", days: { "2026-06-01": { symptoms: ["libidoHigh"] } } });
ok("partner mode kept + name trimmed", partner.perspective === "partner" && partner.partnerName === "Fakena");
ok("partner: day log stays stored", Boolean(partner.days["2026-06-01"]));
ok("partner: libido hidden", libidoByPhase(partner, "2026-06-20").total === 0);
ok("bad perspective → self", cleanCycle({ perspective: "x" }).perspective === "self");


// 8. Audit fixes (2026-10-31).
// 8a. Due day: the predicted day itself is not "cycle day 1 / period day 1" until a start is logged.
{
  const due = cycleSnapshot(c, "2026-06-21"); // predicted next = Jun 21 (28-day average)
  ok("due day: cycle day continues (29), not 1", due.day === 29 && due.cycleStart === "2026-05-24", due);
  ok("due day: not a period stage / period day", due.stage === "luteal" && due.periodDay === null && due.phase === "quiet", due);
  ok("due day: next period = today, not late", due.nextPeriod === "2026-06-21" && due.daysToPeriod === 0 && due.late === 0);
  ok("due day: ring grows to 29", due.ringLength === 29);
  const dm = cycleMarks(c, "2026-06-19", "2026-06-25", "2026-06-21");
  ok("due day: today shown as predicted period", dm["2026-06-21"]?.phase === "period" && dm["2026-06-21"].predicted);
  ok("due day: session today not counted as period", sessionsByPhase(c, ["2026-06-21"], "2026-06-21").quiet === 1);
  ok("due day: dayInfo(today) matches snapshot", JSON.stringify(dayInfo(c, "2026-06-21", "2026-06-21")) === JSON.stringify({ phase: "quiet", stage: "luteal", predicted: false, cycleDay: 29 }));
  ok("late: today's unconfirmed period is not a period day (phaseOn)", phaseOn(c, "2026-06-24", "2026-06-24") === "quiet");
}
// 8b. The day after ovulation is fertile (ACOG: 5 days before to 1 day after ovulation).
ok("ov+1 (Jun 8) fertile", marks["2026-06-08"]?.phase === "fertile", marks["2026-06-08"]);
ok("ov+2 (Jun 9) not fertile", !marks["2026-06-09"]);
ok("dayInfo ov+1 stage fertile", dayInfo(c, "2026-06-08", today)?.stage === "fertile");
// 8c. Lower-chance arcs: rhythm-method bounds (shortest − 18 / longest − 11), never on fertile days.
{
  const reg = lowChanceDays(c, today); // gaps 28/29/27 → regular; start May 24, ov Jun 7 (index 14)
  ok("regular: low from ov+3 / longest−10 (index 18)", reg.low?.from === 18 && reg.low.to === 28, reg);
  ok("regular: early after period, ends by shortest−19 (indices 5–7)", reg.early?.from === 5 && reg.early.to === 8, reg);
  const irr2 = lowChanceDays(irr, "2026-05-20"); // gaps 24/38/26/39 → first fertile day 6, last fertile day 28
  ok("irregular: no early arc (shortest 24 → fertile from day 6)", irr2.early === null, irr2);
  ok("irregular: low arc starts at day 29 (longest 39 − 10)", irr2.low?.from === 28, irr2);
  const short = cleanCycle({ enabled: true, periodDays: 6, starts: ["2026-04-01", "2026-04-22", "2026-05-13", "2026-06-03"] });
  ok("21-day cycles: no early arc over fertile days hidden by the period", lowChanceDays(short, "2026-06-05").early === null);
  const one = cleanCycle({ enabled: true, starts: ["2026-06-01"] });
  const oneLow = lowChanceDays(one, "2026-06-10");
  ok("learning (1 start): one extra day of margin each side", oneLow.low?.from === 18 && oneLow.early?.to === 8, oneLow);
}
// 8c2. Lower-chance days stay hidden while learning: they need LOW_CHANCE_MIN_CYCLES measured cycles.
{
  ok("min cycles is 6", LOW_CHANCE_MIN_CYCLES === 6);
  const startsN = (n: number) => Array.from({ length: n }, (_, i) => addDays("2026-01-01", i * 28));
  ok("1 start: not ready, 6 missing", JSON.stringify(lowChanceReady(cleanCycle({ enabled: true, starts: startsN(1) }))) === JSON.stringify({ ready: false, measured: 0, missing: 6 }));
  ok("4 starts (3 cycles, regular): still hidden", lowChanceReady(c).ready === false && lowChanceReady(c).missing === 3, lowChanceReady(c));
  ok("6 starts (5 cycles): not ready", !lowChanceReady(cleanCycle({ enabled: true, starts: startsN(6) })).ready);
  ok("7 starts (6 cycles): ready", lowChanceReady(cleanCycle({ enabled: true, starts: startsN(7) })).ready);
  ok("disabled: never ready", !lowChanceReady(cleanCycle({ enabled: false, starts: startsN(9) })).ready);
  const gappy = cleanCycle({ enabled: true, starts: ["2026-01-01", "2026-01-05", "2026-02-02", "2026-03-02", "2026-03-30", "2026-04-27", "2026-05-25"] });
  ok("implausible gaps (<15 days) do not count as measured cycles", !lowChanceReady(gappy).ready && lowChanceReady(gappy).measured === 5, lowChanceReady(gappy));
}
// 8d. A cycle left open for months (no new start): the calendar day panel still counts days right.
{
  const longToday = "2026-09-01"; // 100 days after May 24
  const snapL = cycleSnapshot(c, longToday);
  ok("long-open cycle: snapshot day 101", snapL.day === 101, snapL.day);
  ok("long-open cycle: dayInfo yesterday = day 100", dayInfo(c, "2026-08-31", longToday)?.cycleDay === 100, dayInfo(c, "2026-08-31", longToday));
  ok("long-open cycle: day 20 is luteal (after ovulation)", dayInfo(c, "2026-06-12", longToday)?.stage === "luteal");
}

// 6. Disabled → nothing.
ok("disabled → no marks", Object.keys(cycleMarks({ ...c, enabled: false }, "2026-01-01", "2026-12-31", today)).length === 0);
// 7. Perf: a year of marks is fast.
const t0 = Date.now();
for (let i = 0; i < 200; i += 1) cycleMarks(c, "2026-01-01", "2026-12-31", addDays(today, i % 30));
ok("perf 200 year-maps < 1500ms", Date.now() - t0 < 1500, Date.now() - t0);

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
