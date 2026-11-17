/* WAVE7-CONSENT-CYCLE — Round 2 Wave 3 (2.2.30): consent is membership,
 * not arithmetic; the pregnancy note anchors like the forecast; the
 * tracker doors see identity the way the delete cascade does.
 *
 * Specimens (parent-verified in the Round 2 hunt):
 *  - RT2-H1 B3: with `people` EMPTY, the membership guard in
 *    decideProposal/executeWipe was conditional on people.length > 0 —
 *    a fabricated third id approved a session deletion and a full wipe.
 *    cleanProposals waved a ghost-approved proposal through the gate.
 *  - RT2-H3-02: pregnancyNoted indexed the RAW tail of the starts list,
 *    so one future-dated start un-noted a pregnancy and the snapshot
 *    read a period LATE against it (lateInfo was anchored in V3-07;
 *    this reader was not).
 *  - RT2-H3-06: addTracker's duplicate check read names only — an
 *    ownerId-bound tracker with cleared name/link was invisible to it
 *    and the door minted a twin.
 *  - RT2-H3-07: a dismissal recorded on one merge-born twin did not
 *    cover the other: same person, same start, same cycle — the
 *    question returned. Dismissals are keyed by person + start.
 *
 * Fake data only. Run: node ../run-ts-test.mjs tests/wave7-consent-cycle.ts */
const g = globalThis as Record<string, unknown>;
if (typeof g.window === "undefined") g.window = g;
process.on("unhandledRejection", () => undefined);

const { journalFromUnknown, useJournal } = await import("../src/lib/vela/store");
const { cleanCycle, cycleSnapshot, pregnancyNoted } = await import("../src/lib/vela/cycle");
const { cleanTracker, mergeTrackerLists } = await import("../src/lib/vela/cycle-trackers");
const { cleanProposals } = await import("../src/lib/vela/people");
const { cycleAsk } = await import("../src/lib/vela/cycle");
import type { Journal } from "../src/lib/vela/types";

let breaks = 0;
let holds = 0;
const brk = (name: string, extra = "") => { breaks += 1; console.log(`BREAK ${name}${extra ? " — " + extra : ""}`); };
const hold = (name: string) => { holds += 1; console.log(`HOLD  ${name}`); };
const judge = (name: string, ok: boolean, extra = "") => (ok ? hold(name) : brk(name, extra));

const DAY = 86400000;
const now = Date.now();
const T0 = now - 30 * DAY;

function rawJournal(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    profile: { displayName: "Ana", createdAt: T0 },
    settings: {
      language: "en",
      cycles: [{ id: "c1", enabled: true, starts: [], ends: {}, days: {}, reasons: {}, stamps: {} }],
      anniversaries: [], children: [], archivedPeople: [],
      customPlaces: [], customPositions: [], customProblems: [],
    },
    partners: ["Ana", "Lucía"],
    sessions: [{ id: "s1", partner: "Ana", date: "2026-10-10", count: 1, createdAt: T0, updatedAt: T0 }],
    encounters: [],
    people: [
      { id: "p-owner", name: "Ana", role: "owner", createdAt: T0, updatedAt: T0 },
      { id: "p-partner", name: "Lucía", role: "partner", createdAt: T0, updatedAt: T0 },
    ],
    proposals: [
      { id: "prop-del", kind: "delete-session", targetId: "s1", proposedBy: "p-owner", proposedAt: now - DAY, state: "pending", expiresAt: now + 6 * DAY },
      { id: "prop-wipe", kind: "wipe-vault", proposedBy: "p-owner", proposedAt: now - 8 * DAY, state: "approved", decidedBy: "p-ghost-third", decidedAt: now - 8 * DAY, expiresAt: now + 6 * DAY },
    ],
    quietDays: [],
    ...extra,
  };
}
function seed(extra: Record<string, unknown> = {}): Journal {
  const j = journalFromUnknown(rawJournal(extra), "en");
  useJournal.setState({ journal: j, unlocked: true });
  return j;
}
const S = () => useJournal.getState();
const J = () => S().journal;

/* ── S1 · ghost decider, people EMPTY: nothing is signed ─────────────── */
{
  seed({ people: [] });
  S().decideProposal("prop-del", "p-ghost-third", true);
  const j = J();
  judge("S1 empty-people ghost decision executes nothing",
    j.sessions.some((s) => s.id === "s1") && (j.proposals ?? []).some((p) => p.id === "prop-del" && p.state === "pending"),
    `sessions=${j.sessions.length} proposals=${JSON.stringify((j.proposals ?? []).map((p) => p.state))}`);
}

/* ── S2 · control: the partner, a member, approves — the deletion runs ── */
{
  seed();
  S().decideProposal("prop-del", "p-partner", true);
  judge("S2 member approval executes the deletion", !J().sessions.some((s) => s.id === "s1"), `sessions=${J().sessions.length}`);
}

/* ── S3 · control: ghost decider, people present — refused (held pre-fix) */
{
  seed();
  S().decideProposal("prop-del", "p-ghost-third", true);
  judge("S3 ghost refused when people exist", J().sessions.some((s) => s.id === "s1"));
}

/* ── S4 · ghost proposer: a member's yes cannot animate it ────────────── */
{
  seed({ proposals: [{ id: "prop-ghost", kind: "delete-session", targetId: "s1", proposedBy: "p-ghost-third", proposedAt: now - DAY, state: "pending", expiresAt: now + 6 * DAY }] });
  S().decideProposal("prop-ghost", "p-partner", true);
  judge("S4 a proposal nobody in the diary made cannot be decided", J().sessions.some((s) => s.id === "s1"), `sessions=${J().sessions.length}`);
}

/* ── S5 · ghost-approved wipe, people EMPTY: executeWipe burns nothing ── */
{
  const j0 = seed({ people: [] });
  const before = j0.sessions.length + (j0.partners?.length ?? 0);
  try { S().executeWipe("prop-wipe"); } catch { /* the lock may complain in node; the journal is the evidence */ }
  const j = J();
  judge("S5 ghost-approved wipe never executes",
    j.sessions.length + (j.partners?.length ?? 0) === before && !(j.proposals ?? []).some((p) => p.id === "prop-wipe"),
    `sessions=${j.sessions.length} partners=${(j.partners ?? []).length} proposal=${(j.proposals ?? []).some((p) => p.id === "prop-wipe")}`);
}

/* ── S6 · gate: a ghost-approved proposal is dropped at load ──────────── */
{
  const cleaned = cleanProposals(rawJournal().proposals, [
    { id: "p-owner", name: "Ana", role: "owner", createdAt: T0, updatedAt: T0 },
    { id: "p-partner", name: "Lucía", role: "partner", createdAt: T0, updatedAt: T0 },
  ] as never);
  judge("S6 gate drops the ghost-approved wipe", !cleaned.some((p) => p.id === "prop-wipe") && cleaned.some((p) => p.id === "prop-del"),
    `kept=${cleaned.map((p) => p.id).join(",")}`);
  const legit = cleanProposals(
    [{ id: "prop-ok", kind: "wipe-vault", proposedBy: "p-owner", proposedAt: now - 8 * DAY, state: "approved", decidedBy: "p-partner", decidedAt: now - 8 * DAY, expiresAt: now + 6 * DAY }],
    [
      { id: "p-owner", name: "Ana", role: "owner", createdAt: T0, updatedAt: T0 },
      { id: "p-partner", name: "Lucía", role: "partner", createdAt: T0, updatedAt: T0 },
    ] as never,
  );
  judge("S6 gate keeps a member-approved wipe", legit.some((p) => p.id === "prop-ok"));
}

/* ── S7 · pregnancyNoted anchors on past starts (RT2-H3-02) ───────────── */
{
  const withFuture = cleanCycle({ enabled: true, starts: ["2026-01-01", "2026-01-29", "2027-06-01"], reasons: { "2026-01-01": { id: "pregnant", at: 100 } } });
  const without = cleanCycle({ enabled: true, starts: ["2026-01-01", "2026-01-29"], reasons: { "2026-01-01": { id: "pregnant", at: 100 } } });
  judge("S7 pregnancy stays noted with a future start present",
    pregnancyNoted(withFuture, "2026-03-05") === true && pregnancyNoted(without, "2026-03-05") === true,
    `with=${pregnancyNoted(withFuture, "2026-03-05")} without=${pregnancyNoted(without, "2026-03-05")}`);
  const snap = cycleSnapshot(withFuture, "2026-03-05");
  judge("S7 no lateness is claimed against the noted pregnancy", snap.late === 0, `late=${snap.late}`);
  const poisoned = cleanCycle({ enabled: true, starts: ["2026-01-05", "2027-01-05"] });
  const snapLate = cycleSnapshot(poisoned, "2026-06-01");
  judge("S7 control: a genuinely late period still reads late", snapLate.late === 119, `late=${snapLate.late}`);
}

/* ── S8 · addTracker sees the ownerId binding (RT2-H3-06) ─────────────── */
{
  seed({
    settings: {
      language: "en",
      cycles: [
        { id: "c1", enabled: true, starts: [], ends: {}, days: {}, reasons: {}, stamps: {} },
        { id: "t-ana", enabled: true, perspective: "partner", partnerName: "", partnerLink: "", ownerId: "p-owner", starts: ["2026-10-07"], ends: {}, days: {}, reasons: {}, stamps: {} },
      ],
      anniversaries: [], children: [], archivedPeople: [], customPlaces: [], customPositions: [], customProblems: [],
    },
  });
  const before = J().settings.cycles.length;
  const returned = S().addTracker({ perspective: "partner", partnerName: "Ana" });
  judge("S8 addTracker resolves the ownerId-bound tracker", returned === "t-ana" && J().settings.cycles.length === before,
    `returned=${returned} cycles=${J().settings.cycles.length} before=${before}`);
  const fresh = S().addTracker({ perspective: "partner", partnerName: "Sofía" });
  judge("S8 control: a new partner still gets a tracker", !!fresh && fresh !== "t-ana" && J().settings.cycles.length === before + 1,
    `fresh=${fresh} cycles=${J().settings.cycles.length}`);
}

/* ── S9 · a dismissal covers the merge-born twin (RT2-H3-07) ──────────── */
{
  const mkTwin = (id: string, reasons: Record<string, unknown>) =>
    cleanTracker({ id, enabled: true, perspective: "partner", partnerName: "Ana", starts: ["2026-01-01", "2026-02-14"], ends: {}, days: {}, reasons, stamps: {}, updatedAt: 100, metaAt: 100 }, id);
  const twinA = mkTwin("ca", { "2026-01-01": { id: "dismissed", at: 100 } });
  const twinB = mkTwin("cb", {});
  const merged = mergeTrackerLists([twinA], [twinB]);
  const asks = merged.map((t) => cycleAsk(t));
  judge("S9 the dismissal covers both twins after the merge",
    merged.length === 2 && merged.every((t) => t.reasons?.["2026-01-01"]?.id === "dismissed") && asks.every((a) => a === null),
    `merged=${merged.length} reasons=${JSON.stringify(merged.map((t) => t.reasons))} asks=${JSON.stringify(asks)}`);
  // Conflict: the later testimony wins on BOTH twins; an unshared start
  // keeps its reason at home.
  const twinC = mkTwin("cc", { "2026-01-01": { id: "stress", at: 500 } });
  const twinD = mkTwin("cd", { "2026-01-01": { id: "dismissed", at: 100 } });
  const merged2 = mergeTrackerLists([twinC], [twinD]);
  judge("S9 conflicting testimony resolves by its own time, on both twins",
    merged2.every((t) => t.reasons?.["2026-01-01"]?.id === "stress"),
    `reasons=${JSON.stringify(merged2.map((t) => t.reasons))}`);
}

console.log(`\nWAVE7-CONSENT-CYCLE: ${breaks} break(s), ${holds} hold(s)`);
process.exitCode = breaks ? 1 : 0;
