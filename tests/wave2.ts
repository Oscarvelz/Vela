/* Wave 2 fences — the gate tells the truth. Every specimen from RT-V1 B-3/
 * B-6, RT-V3 V3-01/07/12/13/14 (+ L-3) and RT-V4 B12/B13, watched failing on
 * the 2.2.23 build before the fix. Fake data only. */
import { cleanCycle, cycleSnapshot } from "../src/lib/vela/cycle";
import { cleanTrackers } from "../src/lib/vela/cycle-trackers";
import { cleanQuietMarks, episodes, markedDays } from "../src/lib/vela/quiet";
import { cleanAnniversaries } from "../src/lib/vela/anniversaries";
import { cleanPregnancyTests } from "../src/lib/vela/pregnancy";
import { cleanPeople, verifyPin } from "../src/lib/vela/people";
import { asEnvelope } from "../src/lib/vela/vault-crypto";
import { journalFromUnknown } from "../src/lib/vela/store";
import type { CycleSettings } from "../src/lib/vela/types";

process.on("unhandledRejection", () => undefined);

let breaks = 0;
let holds = 0;
function hold(name: string) { holds += 1; console.log(`HOLD ${name}`); }
function brk(name: string, extra = "") { breaks += 1; console.log(`BREAK ${name}${extra ? " — " + extra : ""}`); }

const T = 1_760_000_000_000;

/* ── Impossible dates die at every gate (V3-01, V3-13) ── */
{
  const c = cleanCycle({ starts: ["2026-02-30", "2026-13-01", "2023-02-29", "2024-02-29", "2026-01-05"] });
  if (c.starts.join() === "2024-02-29,2026-01-05") hold("D1 cleanCycle drops impossible starts, keeps the leap day");
  else brk("D1 impossible starts survived cleanCycle", c.starts.join());

  const t = cleanTrackers([{ id: "c1", starts: ["2026-01-05"], stamps: { "s:2026-02-30": 5, "s:2026-01-05": 5, "r:2026-01-05": 5 } }], undefined);
  const keys = Object.keys(t[0].stamps).sort().join();
  if (keys === "r:2026-01-05,s:2026-01-05") hold("D2 tracker stamps keyed to impossible dates are dropped");
  else brk("D2 an impossible-date stamp survived", keys);

  const q = cleanQuietMarks([{ id: "q1", from: "2026-02-30", to: "2026-03-03", reason: "travel", source: "manual", createdAt: 1 }]);
  if (q.length === 0) hold("D3 a quiet mark starting on an impossible day is dropped whole");
  else brk("D3 the impossible quiet mark survived");

  const j = journalFromUnknown({
    profile: { displayName: "Ana", createdAt: T },
    settings: { language: "en" },
    partners: [],
    sessions: [
      { id: "s-bad", date: "2026-02-30", partnerName: "Marco" },
      { id: "s-ok", date: "2026-02-27", partnerName: "Marco" },
    ],
    encounters: [
      { id: "e-bad", startDate: "2026-02-30", endDate: "2026-03-02" },
      { id: "e-ok", startDate: "2026-03-01", endDate: "2026-03-02" },
    ],
    updatedAt: T,
  }, "en");
  // (attachOrphans legitimately adds a holder encounter for the surviving
  // session — what must never appear is the impossible-dated record itself.)
  if (j.sessions.map((s) => s.id).join() === "s-ok" && !j.encounters.some((e) => e.id === "e-bad") && j.encounters.some((e) => e.id === "e-ok"))
    hold("D4 sessions and encounters dated on impossible days never reach the journal");
  else brk("D4 impossible-dated records reached the journal", `${j.sessions.map((s) => s.id)} / ${j.encounters.map((e) => e.id)}`);

  const a = cleanAnniversaries([
    { id: "a-bad", label: "X", monthDay: "02-30", kind: "custom", milestone: false, createdAt: 1 },
    { id: "a-leap", label: "Y", monthDay: "02-29", kind: "custom", milestone: false, createdAt: 1 },
    { id: "a-apr", label: "Z", monthDay: "04-31", kind: "custom", milestone: false, createdAt: 1 },
  ]);
  if (a.map((x) => x.id).join() === "a-leap") hold("D5 anniversary month-days must exist (Feb 29 lives, Feb 30 and Apr 31 die)");
  else brk("D5 impossible month-days survived", a.map((x) => x.id).join());

  const p = cleanPregnancyTests([
    { id: "t-bad", date: "2026-02-30", result: "negative", count: 1, evidence: "", createdAt: 1 },
    { id: "t-ok", date: "2026-02-27", result: "negative", count: 1, evidence: "", createdAt: 1 },
  ]);
  if (p.map((x) => x.id).join() === "t-ok") hold("D6 a pregnancy test dated on an impossible day is dropped");
  else brk("D6 the impossible test survived");
}

/* ── The gate loads without rewriting (B-3) and clamps the dials (B12) ── */
{
  const j = journalFromUnknown({
    profile: { displayName: "Ana", createdAt: T },
    settings: { language: "en" },
    partners: [],
    sessions: [
      { id: "s-zero", date: "2026-11-02", partnerName: "Marco", overall: 0, durationMins: 0 },
      { id: "s-absent", date: "2026-11-03", partnerName: "Marco" },
      { id: "s-wild", date: "2026-11-04", partnerName: "Marco", overall: 4, durationMins: 45, intensity: 9, satisfaction: -3 },
    ],
    encounters: [],
    updatedAt: T,
  }, "en");
  const zero = j.sessions.find((s) => s.id === "s-zero");
  const absent = j.sessions.find((s) => s.id === "s-absent");
  const wild = j.sessions.find((s) => s.id === "s-wild");
  if (zero && zero.overall === 0 && zero.durationMins === 0) hold("S1 a stored 0 loads as 0 — unrated stays unrated, a 0-minute session stays 0");
  else brk("S1 the gate rewrote stored zeros", `overall=${zero?.overall} duration=${zero?.durationMins}`);
  if (absent && absent.overall === 5 && absent.durationMins === 30) hold("S2 absent fields still take the historical defaults (5 / 30)");
  else brk("S2 absent-field defaults changed", `overall=${absent?.overall} duration=${absent?.durationMins}`);
  if (wild && wild.intensity === 5 && wild.satisfaction === 0) hold("S3 owner dials clamp to 0..5 at the gate, like the partner's voice");
  else brk("S3 wild dials passed the gate unclamped", `intensity=${wild?.intensity} satisfaction=${wild?.satisfaction}`);
}

/* ── The envelope states its version (B-6) ── */
{
  const base = { kdf: { name: "PBKDF2", hash: "SHA-256", iterations: 600000 }, salt: "AAAA", iv: "AAAA", ciphertext: "AAAA" };
  const v999 = asEnvelope({ ...base, v: 999 });
  const v1 = asEnvelope({ ...base, v: 1 });
  const vNone = asEnvelope({ ...base });
  if (v999 === null && v1 !== null && vNone !== null && vNone.v === 1)
    hold("E1 an envelope from an unknown version is refused; v1 and legacy no-v open as v1");
  else brk("E1 envelope version handling", `v999=${v999} v1=${v1?.v} none=${vNone?.v}`);
}

/* ── The PIN work factor has a band (B13) ── */
{
  const mk = (id: string, iterations: number) => ({
    id, name: id, role: "partner" as const, createdAt: 1, updatedAt: 1,
    pin: { salt: "AAAA", hash: "AAAA", iterations },
  });
  // One partner per call — the couple resolution keeps two records total.
  const owner = { id: "p-owner", name: "Ana", role: "owner" as const, createdAt: 0, updatedAt: 0 };
  const low = cleanPeople([owner, mk("p-low", 1)]).find((p) => p.id === "p-low");
  const high = cleanPeople([owner, mk("p-high", 10_000_000)]).find((p) => p.id === "p-high");
  const okP = cleanPeople([owner, mk("p-ok", 150_000)]).find((p) => p.id === "p-ok");
  if (low && !low.pin && high && !high.pin && okP?.pin)
    hold("P1 a stored PIN outside the work-factor band loses its PIN at the gate (the person stays)");
  else brk("P1 out-of-band PINs survived the gate", `low=${low?.pin?.iterations} high=${high?.pin?.iterations} ok=${okP?.pin?.iterations}`);
}

/* ── A future start cannot poison the forecast (V3-07) ── */
{
  const cycle: CycleSettings = {
    enabled: true, perspective: "self", partnerName: "", periodDays: 5, cycleDays: 28, lutealDays: 14, fertileDays: 5,
    starts: ["2026-01-05", "2027-01-05"], ends: {}, days: {},
  };
  const snap = cycleSnapshot(cycle, "2026-06-01");
  if (snap.late > 0 && snap.nextPeriod === "2026-06-01")
    hold("F1 the forecast anchors on the last start before today; the overdue period reads as due, not 218 days away");
  else brk("F1 the future start still poisons the forecast", `late=${snap.late} next=${snap.nextPeriod} daysTo=${snap.daysToPeriod}`);

  const cleaned = cleanCycle(cycle);
  if (cleaned.starts.includes("2027-01-05")) hold("F2 the future start itself is preserved as data (warned about, never deleted)");
  else brk("F2 the future start was silently deleted");

  const futureOnly: CycleSettings = { ...cycle, starts: ["2027-01-05"] };
  const snap2 = cycleSnapshot(futureOnly, "2026-06-01");
  if (snap2.hasStarts && snap2.nextPeriod === "2027-01-05" && snap2.late === 0)
    hold("F3 a journal whose only start is future-dated still snapshots sanely");
  else brk("F3 all-future snapshot", `next=${snap2.nextPeriod} late=${snap2.late}`);
}

/* ── Quiet spans are ranges, not a 400-day enumeration (V3-12, L-3) ── */
{
  const marks = cleanQuietMarks([{ id: "q1", from: "2025-01-01", to: "2026-12-31", reason: "travel", source: "manual", createdAt: 1 }]);
  const days = markedDays(marks);
  if (days.size === 730 && days.has("2026-12-31")) hold("Q1 a 730-day quiet stretch marks every one of its days");
  else brk("Q1 the quiet stretch truncated", `size=${days.size} last=${days.has("2026-12-31")}`);

  const overlap = cleanQuietMarks([
    { id: "q1", from: "2026-01-01", to: "2026-01-10", reason: "travel", source: "manual", createdAt: 1 },
    { id: "q2", from: "2026-01-05", to: "2026-01-15", reason: "work", source: "manual", createdAt: 2 },
  ]);
  if (markedDays(overlap).size === 15) hold("Q2 overlapping marks union in the count — shared days count once");
  else brk("Q2 overlap double-counted or truncated", String(markedDays(overlap).size));

  const eps = episodes(marks, [], "2026-12-31");
  if (eps.length === 1 && eps[0].days === 730) hold("Q3 the episode counts the whole stretch, not 400 days of it");
  else brk("Q3 episode count truncated", eps.map((e) => e.days).join());
}

/* ── The snapshot never puts ovulation inside the period (V3-14) ── */
{
  const cycle: CycleSettings = {
    enabled: true, perspective: "self", partnerName: "", periodDays: 5, cycleDays: 21, lutealDays: 18, fertileDays: 5,
    starts: ["2026-01-01", "2026-01-22"], ends: {}, days: {},
  };
  const snap = cycleSnapshot(cycle, "2026-01-10");
  if (snap.ovulation !== "2026-01-04")
    hold("N1 the snapshot's ovulation cannot land inside the logged period (the marks' own guard)");
  else brk("N1 the snapshot still ovulates inside the period", String(snap.ovulation));
}

async function pinVerify() {
  // A genuinely VALID pin record — but derived with 1 iteration. On the old
  // code verifyPin happily derives at the stored (absurd) work factor and
  // accepts; the band must refuse it before any derivation happens.
  const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("1234"), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: salt as BufferSource, iterations: 1, hash: "SHA-256" }, key, 256);
  const b64 = (bytes: Uint8Array) => { let bin = ""; for (const b of bytes) bin += String.fromCharCode(b); return btoa(bin); };
  const person = { id: "p-x", name: "X", role: "partner" as const, createdAt: 1, updatedAt: 1, pin: { salt: b64(salt), hash: b64(new Uint8Array(bits)), iterations: 1 } };
  const ok = await verifyPin(person, "1234");
  if (ok === false) hold("P2 verifyPin refuses an out-of-band work factor, even for a valid hash");
  else brk("P2 verifyPin accepted a 1-iteration PIN record");
}

pinVerify().then(() => {
  console.log(`\nWAVE2: ${breaks} breaks, ${holds} holds`);
  if (breaks > 0) process.exitCode = 1;
});
