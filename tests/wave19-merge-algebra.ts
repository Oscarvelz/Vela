/* WAVE19-MERGE-ALGEBRA — Round 4 Wave 3 (2.2.42): caps, ties, bases
 * (RT4-H3 B1/B3–B7, RT4-H6 B2–B7/B9, RT4-H1 B5, RT4-H4 L-B/L-C).
 * The merge was not an algebra: the tracker cap amputated by list
 * order, ties resolved by argument order (two devices could hold
 * different truths forever), anniversaries/children judged their
 * tombstones by birth instead of edit stamps, duplicate ids passed
 * every id-keyed gate, and the cycle gate admitted non-finite
 * numerics its siblings refuse. Laws: the cap selects by activity,
 * then id; every tie resolves by a content key; tombstones judge
 * the edit stamp; one id seats one record; numerics are finite.
 * Fake data only.
 * Run: node ../run-ts-test.mjs tests/wave19-merge-algebra.ts */
import { journalFromUnknown, mergeJournals, useJournal } from "../src/lib/vela/store";
import { mergeTrackerLists, mergeTracker, shareReasonsAcrossTwins } from "../src/lib/vela/cycle-trackers";
import { cleanCycle } from "../src/lib/vela/cycle";
import { cleanArchived } from "../src/lib/vela/anniversaries";
import type { Journal } from "../src/lib/vela/types";
import type { CycleTracker } from "../src/lib/vela/cycle-trackers";

process.on("unhandledRejection", () => undefined);

let breaks = 0;
let holds = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) { holds += 1; console.log(`HOLD ${name}`); }
  else { breaks += 1; console.log(`BREAK ${name}${detail ? ` — ${detail}` : ""}`); }
}

const DAY = 86400000;
const now = Date.now();
const T0 = now - 90 * DAY;
const OWNER = { id: "p-owner", name: "Ana", role: "owner", createdAt: T0, updatedAt: T0 };
function gate(raw: Record<string, unknown>): Journal {
  return journalFromUnknown({ profile: { displayName: "Ana", createdAt: T0 }, settings: { language: "en", weekStart: "mon" }, partners: [], sessions: [], encounters: [], updatedAt: T0 + 1000, ...raw }, "en");
}
function tracker(id: string, at: number, extra: Partial<CycleTracker> = {}): CycleTracker {
  return {
    id, enabled: true, perspective: "partner", partnerName: `P-${id}`, partnerLink: `P-${id}`,
    periodDays: 5, cycleDays: 28, lutealDays: 14, fertileDays: 5,
    starts: [], ends: {}, days: {}, reasons: {}, stamps: {}, muteReasonAsks: false,
    createdAt: at, updatedAt: at, metaAt: at, ...extra,
  } as CycleTracker;
}

/* ——— S1: the cap selects deterministically ——— */
{
  const mk = (ids: string[], base: number) => ids.map((id, i) => tracker(id, base + i * 1000));
  const aList = mk(["c1", "a2", "a3", "a4", "a5"], T0);
  const bList = mk(["c1", "b2", "b3", "b4", "b5"], T0 + 500);
  const ab = mergeTrackerLists(aList, bList, {}).map((t) => t.id).sort().join(",");
  const ba = mergeTrackerLists(bList, aList, {}).map((t) => t.id).sort().join(",");
  check("S1 the capped survivor set is the same in both argument orders", ab === ba, `ab=${ab} ba=${ba}`);
  check("S1 the cap still holds at 8", ab.split(",").length === 8);
}

/* ——— S2: twin testimony ties resolve by content ——— */
{
  const start = "2026-10-05";
  const t1 = tracker("t1", T0, { starts: [start], reasons: { [start]: { id: "stress", at: 500 } }, stamps: { [`r:${start}`]: 500 } });
  const t2 = tracker("t2", T0, { starts: [start], reasons: { [start]: { id: "travel", at: 500 } }, stamps: { [`r:${start}`]: 500 }, partnerName: "P-t1", partnerLink: "P-t1" });
  const fwd = shareReasonsAcrossTwins([t1, t2]);
  const rev = shareReasonsAcrossTwins([t2, t1]);
  const w1 = fwd.find((t) => t.id === "t1")?.reasons?.[start]?.id;
  const w2 = rev.find((t) => t.id === "t1")?.reasons?.[start]?.id;
  check("S2 equal-at testimony picks the same winner in both list orders", w1 === w2 && !!w1, `fwd=${w1} rev=${w2}`);
  check("S2 the winner reaches both twins", fwd.every((t) => t.reasons?.[start]?.id === w1));
}

/* ——— S3: mergeTracker entry ties resolve by content ——— */
{
  const start = "2026-10-05";
  const a = tracker("c1", T0, { starts: [start], reasons: { [start]: { id: "stress", at: 500 } }, stamps: { [`r:${start}`]: 500 } });
  const b = tracker("c1", T0, { starts: [start], reasons: { [start]: { id: "travel", at: 500 } }, stamps: { [`r:${start}`]: 500 } });
  const ab = mergeTracker(a, b).reasons?.[start]?.id;
  const ba = mergeTracker(b, a).reasons?.[start]?.id;
  check("S3 a reason tie inside mergeTracker is argument-order free", ab === ba && !!ab, `ab=${ab} ba=${ba}`);
}

/* ——— S4/S5/S6: union ties — quiet, pregnancy, proposals ——— */
{
  const mark = (reason: string) => ({ id: "q1", from: "2026-10-01", to: "2026-10-02", reason, source: "manual", createdAt: T0 + 10, updatedAt: T0 + 50 });
  const ja = gate({ people: [OWNER], quietDays: [mark("travel")] });
  const jb = gate({ people: [OWNER], quietDays: [mark("stress")] });
  const m1 = mergeJournals(ja, jb).quietDays?.[0]?.reason;
  const m2 = mergeJournals(jb, ja).quietDays?.[0]?.reason;
  check("S4 a quiet-mark tie resolves the same in both merge orders", m1 === m2 && !!m1, `${m1} vs ${m2}`);

  const test = (result: string, createdAt: number) => ({ id: "t1", date: "2026-10-05", result, source: "a test", notes: "", createdAt });
  const ta = gate({ people: [OWNER], pregnancyTests: [test("negative", T0 + 10)] });
  const tb = gate({ people: [OWNER], pregnancyTests: [test("positive", T0 + 90)] });
  const p1 = mergeJournals(ta, tb).pregnancyTests?.[0]?.result;
  const p2 = mergeJournals(tb, ta).pregnancyTests?.[0]?.result;
  check("S5 the later-stamped pregnancy test wins in both orders", p1 === "positive" && p2 === "positive", `${p1} vs ${p2}`);
  const tc = gate({ people: [OWNER], pregnancyTests: [test("negative", T0 + 90)] });
  const p3 = mergeJournals(tb, tc).pregnancyTests?.[0]?.result;
  const p4 = mergeJournals(tc, tb).pregnancyTests?.[0]?.result;
  check("S5 an equal-stamp test tie resolves by content in both orders", p3 === p4 && !!p3, `${p3} vs ${p4}`);

  const prop = (state: string) => ({ id: "prop-1", kind: "delete-session", targetId: "s1", proposedBy: "p-owner", proposedAt: T0 + 10, state, ...(state === "approved" ? { decidedBy: "p-lucia", decidedAt: T0 + 10 } : {}), expiresAt: now + 7 * DAY });
  const LUCIA = { id: "p-lucia", name: "Lucía", role: "partner", createdAt: T0, updatedAt: T0 };
  const pa = gate({ people: [OWNER, LUCIA], proposals: [prop("pending")] });
  const pb = gate({ people: [OWNER, LUCIA], proposals: [prop("approved")] });
  const s1 = mergeJournals(pa, pb).proposals?.[0]?.state;
  const s2 = mergeJournals(pb, pa).proposals?.[0]?.state;
  check("S6 a proposal tie keeps the decided copy in both orders", s1 === "approved" && s2 === "approved", `${s1} vs ${s2}`);
}

/* ——— S7: mergePeople ties — the PIN survives ——— */
{
  const withPin = { ...OWNER, id: "p-lucia", name: "Lucía", role: "partner", pin: { salt: "s", hash: "h", iterations: 150000 } };
  const noPin = { id: "p-lucia", name: "Lucía", role: "partner", createdAt: T0, updatedAt: T0 };
  const ja = gate({ people: [OWNER, withPin] });
  const jb = gate({ people: [OWNER, noPin] });
  const w1 = mergeJournals(ja, jb).people?.find((p) => p.id === "p-lucia");
  const w2 = mergeJournals(jb, ja).people?.find((p) => p.id === "p-lucia");
  check("S7 an equal-stamp people tie keeps the PIN copy in both orders", !!w1?.pin && !!w2?.pin, JSON.stringify([w1?.pin, w2?.pin]));
}

/* ——— S8: tombstones judge the edit stamp (anniversaries) ——— */
{
  const ann = (createdAt: number, updatedAt: number) => ({ id: "a1", label: "Trip", monthDay: "03-04", kind: "trip", milestone: false, createdAt, updatedAt });
  const edited = gate({ people: [OWNER], settings: { language: "en", weekStart: "mon", anniversaries: [ann(T0 + 10, T0 + 90)] } });
  const tomb = gate({ people: [OWNER], deleted: { a1: T0 + 50 } });
  const m = mergeJournals(edited, tomb);
  check("S8 an anniversary edited after its tombstone survives the merge", (m.settings.anniversaries ?? []).some((a) => a.id === "a1"));
  const g = gate({ people: [OWNER], settings: { language: "en", weekStart: "mon", anniversaries: [ann(T0 + 10, T0 + 90)] }, deleted: { a1: T0 + 50 } });
  check("S8 the gate judges by the same basis", (g.settings.anniversaries ?? []).some((a) => a.id === "a1"));
}

/* ——— S9: one id seats one record at the gate ——— */
{
  const j = gate({
    people: [OWNER],
    sessions: [
      { id: "s1", date: "2026-10-20", partnerName: "Ana", createdAt: T0 + 10, updatedAt: T0 + 10 },
      { id: "s1", date: "2026-10-21", partnerName: "Ana", createdAt: T0 + 10, updatedAt: T0 + 80 },
    ],
    settings: { language: "en", weekStart: "mon", anniversaries: [
      { id: "a1", label: "One", monthDay: "03-04", kind: "trip", milestone: false, createdAt: T0 + 10 },
      { id: "a1", label: "Two", monthDay: "05-06", kind: "trip", milestone: false, createdAt: T0 + 10 },
    ] },
  });
  check("S9 duplicate session ids seat once", j.sessions.filter((s) => s.id === "s1").length === 1, JSON.stringify(j.sessions.map((s) => s.id)));
  check("S9 the surviving session is the later-stamped copy", j.sessions.find((s) => s.id === "s1")?.date === "2026-10-21");
  check("S9 duplicate anniversary ids seat once", (j.settings.anniversaries ?? []).filter((a) => a.id === "a1").length === 1);
  check("S9 no duplicate encounter ids are minted", new Set(j.encounters.map((e) => e.id)).size === j.encounters.length);
}

/* ——— S10: cycle numerics are finite at the gate ——— */
{
  const c = cleanCycle({ periodDays: Number.NaN, cycleDays: Number.POSITIVE_INFINITY, lutealDays: 14, fertileDays: 5, starts: ["2026-10-05"], reasons: { "2026-10-05": { id: "stress", at: Number.POSITIVE_INFINITY } } });
  check("S10 NaN/Infinity lengths fall back to the defaults", c.periodDays === 5 && c.cycleDays === 28, `period=${c.periodDays} cycle=${c.cycleDays}`);
  check("S10 a reason's at is finite", Number.isFinite(c.reasons?.["2026-10-05"]?.at ?? Number.NaN), `at=${c.reasons?.["2026-10-05"]?.at}`);
  const j = gate({ people: [OWNER], settings: { language: "en", weekStart: "mon", autoLockMins: Number.POSITIVE_INFINITY } });
  check("S10 autoLockMins Infinity falls back", j.settings.autoLockMins === 5, `autoLock=${j.settings.autoLockMins}`);
}

/* ——— S11: couple re-enable re-seats the existing partner ——— */
{
  const base = gate({ people: [], partners: ["Lucía"], settings: { language: "en", weekStart: "mon", cycles: [tracker("c1", T0, { perspective: "partner", partnerName: "Lucía", partnerLink: "Lucía" })] } });
  useJournal.setState({ journal: { ...base, profile: { displayName: "Ana", createdAt: T0 } }, unlocked: true });
  const pinA = { salt: "sa", hash: "ha", iterations: 1000 };
  const pinB = { salt: "sb", hash: "hb", iterations: 1000 };
  useJournal.getState().enableCoupleMode({ partnerName: "Lucía", sharedFrom: "2026-10-01", ownerPinHash: pinA, partnerPinHash: pinB });
  const first = useJournal.getState().journal;
  const partnerId = first.people?.find((p) => p.role === "partner")?.id ?? "";
  check("S11 first enable binds her tracker", !!partnerId && first.settings.cycles[0]?.ownerId === partnerId, JSON.stringify(first.settings.cycles[0]?.ownerId));
  useJournal.getState().disableCoupleMode();
  useJournal.getState().enableCoupleMode({ partnerName: "Lucía", sharedFrom: "2026-10-01", ownerPinHash: pinA, partnerPinHash: pinB });
  const second = useJournal.getState().journal;
  const partner2 = second.people?.find((p) => p.role === "partner");
  check("S11 re-enable keeps her person id", partner2?.id === partnerId, `${partnerId} vs ${partner2?.id}`);
  check("S11 re-enable keeps her PIN", partner2?.pin?.hash === "hb");
  check("S11 her tracker stays bound to the same id", second.settings.cycles[0]?.ownerId === partnerId);
}

/* ——— S12: the archive tie resolves by content ——— */
{
  const row = (show: boolean) => ({ name: "Lucía", archivedAt: T0 + 10, showInHistory: show, countInStats: false, resurface: false });
  const fwd = cleanArchived([row(true), row(false)]);
  const rev = cleanArchived([row(false), row(true)]);
  check("S12 an equal-stamp archive tie picks the same row in both orders", fwd.length === 1 && rev.length === 1 && fwd[0].showInHistory === rev[0].showInHistory, JSON.stringify([fwd[0]?.showInHistory, rev[0]?.showInHistory]));
}

console.log(`WAVE19-MERGE-ALGEBRA: ${breaks} break(s), ${holds} hold(s)`);
if (breaks > 0) process.exitCode = 1;
