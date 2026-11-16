/* Wave 2 re-hunt — fresh prejudice against the NEW gate machinery.
 * Fake data only. */
import { cycleSnapshot } from "../src/lib/vela/cycle";
import { cleanTracker, mergeTracker } from "../src/lib/vela/cycle-trackers";
import { episodes, cleanQuietMarks } from "../src/lib/vela/quiet";
import { cleanPeople, pinIterationsInBand } from "../src/lib/vela/people";
import { asEnvelope } from "../src/lib/vela/vault-crypto";
import { journalFromUnknown } from "../src/lib/vela/store";
import type { CycleSettings, Session } from "../src/lib/vela/types";

process.on("unhandledRejection", () => undefined);

let breaks = 0;
let holds = 0;
function hold(name: string) { holds += 1; console.log(`HOLD ${name}`); }
function brk(name: string, extra = "") { breaks += 1; console.log(`BREAK ${name}${extra ? " — " + extra : ""}`); }

const T = 1_760_000_000_000;

/* RH1 — the honest-default edge cases of the new asSession */
{
  const j = journalFromUnknown({
    profile: { displayName: "Ana", createdAt: T },
    settings: { language: "en" },
    partners: [],
    sessions: [
      { id: "s-neg", date: "2026-11-02", partnerName: "Marco", overall: 3, durationMins: -5 },
      { id: "s-str", date: "2026-11-03", partnerName: "Marco", overall: "4", durationMins: "45" },
    ],
    encounters: [],
    updatedAt: T,
  }, "en");
  const neg = j.sessions.find((s) => s.id === "s-neg");
  const str = j.sessions.find((s) => s.id === "s-str");
  if (neg && neg.durationMins === 0 && str && str.overall === 4 && str.durationMins === 45)
    hold("RH1 negative durations floor at 0; numeric strings still coerce as before");
  else brk("RH1 asSession edges", `neg=${neg?.durationMins} str=${str?.overall}/${str?.durationMins}`);
}

/* RH2 — episodes subtract session DAYS, not sessions */
{
  const marks = cleanQuietMarks([{ id: "q1", from: "2026-01-01", to: "2026-01-10", reason: "travel", source: "manual", createdAt: 1 }]);
  const sessions = [
    { id: "s1", date: "2026-01-03" },
    { id: "s2", date: "2026-01-03" },
    { id: "s3", date: "2026-01-05" },
  ] as Session[];
  const eps = episodes(marks, sessions, "2026-01-10");
  if (eps.length === 1 && eps[0].days === 8 && eps[0].firstDay === "2026-01-01")
    hold("RH2 two sessions on one day break the silence once, not twice");
  else brk("RH2 episode arithmetic double-subtracted", eps.map((e) => `${e.days}@${e.firstDay}`).join());
}

/* RH3 — a start logged today still opens its period with a future start present */
{
  const cycle: CycleSettings = {
    enabled: true, perspective: "self", partnerName: "", periodDays: 5, cycleDays: 28, lutealDays: 14, fertileDays: 5,
    starts: ["2026-05-28", "2027-01-05"], ends: {}, days: {},
  };
  const snap = cycleSnapshot(cycle, "2026-06-01");
  if (snap.periodOpen === true && snap.day === 5)
    hold("RH3 'period ended?' is offered for the real open period, not disarmed by the future start");
  else brk("RH3 periodOpen disarmed by the future start", `open=${snap.periodOpen} day=${snap.day}`);

  const todayStart: CycleSettings = { ...cycle, starts: ["2026-06-01", "2027-01-05"] };
  const snap2 = cycleSnapshot(todayStart, "2026-06-01");
  if (snap2.day === 1 && snap2.startedToday) hold("RH4 a start logged today is day 1, future start notwithstanding");
  else brk("RH4 today's start miscounted", `day=${snap2.day}`);
}

/* RH5 — the PIN band's edges are inclusive, and only just */
{
  if (pinIterationsInBand(10_000) && pinIterationsInBand(600_000) && !pinIterationsInBand(9_999) && !pinIterationsInBand(600_001))
    hold("RH5 the band [10000, 600000] is exact at both edges");
  else brk("RH5 band edges off");
  const owner = { id: "p-owner", name: "Ana", role: "owner" as const, createdAt: 0, updatedAt: 0 };
  const edge = cleanPeople([owner, { id: "p-e", name: "E", role: "partner" as const, createdAt: 1, updatedAt: 1, pin: { salt: "AAAA", hash: "AAAA", iterations: 600_000 } }]);
  if (edge.find((p) => p.id === "p-e")?.pin) hold("RH6 a PIN at the band's top edge survives the gate");
  else brk("RH6 the top-edge PIN was dropped");
}

/* RH7 — envelope versions that are not the number 1 are foreign */
{
  const base = { kdf: { name: "PBKDF2", hash: "SHA-256", iterations: 600000 }, salt: "AAAA", iv: "AAAA", ciphertext: "AAAA" };
  if (asEnvelope({ ...base, v: "1" }) === null && asEnvelope({ ...base, v: 0 }) === null && asEnvelope({ ...base, v: 2 }) === null)
    hold("RH7 string, zero and future envelope versions are all refused");
  else brk("RH7 a non-1 envelope version slipped through");
}

/* RH8 — legacy reasons without r: stamps resolve by their own `at` */
{
  const base = {
    enabled: true, perspective: "self" as const, partnerName: "", periodDays: 5, cycleDays: 28, lutealDays: 14, fertileDays: 5,
    starts: ["2026-01-01"], ends: {}, days: {}, stamps: {}, partnerLink: "",
  };
  const a = cleanTracker({ ...base, id: "c1", updatedAt: 1000, metaAt: 1000, reasons: { "2026-01-01": { id: "stress", at: 9000 } } });
  const b = cleanTracker({ ...base, id: "c1", updatedAt: 5000, metaAt: 5000, reasons: { "2026-01-01": { id: "dismissed", at: 2000 } } });
  const m1 = mergeTracker(a, b);
  const m2 = mergeTracker(b, a);
  if (m1.reasons?.["2026-01-01"]?.id === "stress" && m2.reasons?.["2026-01-01"]?.id === "stress")
    hold("RH8 an unstamped reason resolves by its own testimony time, on both argument orders");
  else brk("RH8 the older dismissal still wins on touch time", `${m1.reasons?.["2026-01-01"]?.id} / ${m2.reasons?.["2026-01-01"]?.id}`);
}

console.log(`\nWAVE2-REHUNT: ${breaks} breaks, ${holds} holds`);
if (breaks > 0) process.exitCode = 1;
