/* WAVE12-CONSENT-SETTINGS — Round 3 Wave 2 (2.2.35): consent's other
 * signature and the settings seams (RT3-H1 B5/B8/B10, RT3-H6 B2).
 * Wave 3 of Round 2 checked the DECIDER's membership at every door and
 * the proposer's at exactly one: a wipe nobody in the diary proposed
 * still executed, and an approved wipe survived its proposer's
 * forever-deletion. Couple mode switched OFF minted no stamp, so any
 * merge switched it back on. The stale-window fold-in discarded the
 * merged settings wholesale. And anniversaries/children carried no
 * per-item edit stamp, so any later save on another device reverted
 * their edits at the merge. Fake data only.
 * Run: node ../run-ts-test.mjs tests/wave12-consent-settings.ts */
const g = globalThis as Record<string, unknown>;
if (typeof g.window === "undefined") g.window = g;
const { journalFromUnknown, mergeJournals, useJournal } = await import("../src/lib/vela/store");
import type { Journal } from "../src/lib/vela/types";
import { readFileSync } from "node:fs";

process.on("unhandledRejection", () => undefined);

let breaks = 0;
let holds = 0;
function hold(name: string) { holds += 1; console.log(`HOLD ${name}`); }
function brk(name: string, extra = "") { breaks += 1; console.log(`BREAK ${name}${extra ? " — " + extra : ""}`); }
function check(name: string, ok: boolean, extra = "") { if (ok) hold(name); else brk(name, extra); }

const DAY = 86400000;
const T0 = Date.now();
const S = () => useJournal.getState();
const J = () => S().journal;

function base(at: number): Journal {
  return journalFromUnknown({
    profile: { displayName: "Ana", createdAt: at - 30 * DAY },
    updatedAt: at - DAY,
    settings: { language: "en" },
    partners: ["Lucía"],
    sessions: [
      { id: "s1", date: "2026-11-02", time: "21:00", partnerName: "Lucía", place: "Cabin", durationMins: 40, positions: [], intensity: 4, connection: 4, satisfaction: 4, energy: 4, overall: 4, notes: "", ownWords: "", sessionNumber: 1, encounterId: "", createdAt: at - 10 * DAY },
    ],
    encounters: [],
    people: [
      { id: "p-owner", name: "Ana", role: "owner", createdAt: at - 30 * DAY, updatedAt: at - 30 * DAY },
      { id: "p-lucia", name: "Lucía", role: "partner", createdAt: at - 30 * DAY, updatedAt: at - 30 * DAY },
    ],
    proposals: [],
    quietDays: [],
    pregnancyTests: [],
  }, "en");
}
const wipeProposal = (id: string, proposedBy: string, decidedBy: string) => ({
  id, kind: "wipe-vault" as const, proposedBy, proposedAt: T0 - 40 * DAY,
  decidedBy, decidedAt: T0 - 30 * DAY, expiresAt: T0 + 300 * DAY, state: "approved" as const,
});

/* ── S1. The gate checks the proposer's signature too (B5a) ── */
{
  const raw = (proposedBy: string) => ({
    profile: { displayName: "Ana", createdAt: T0 - 30 * DAY },
    updatedAt: T0,
    settings: { language: "en" },
    partners: [], sessions: [], encounters: [],
    people: [
      { id: "p-owner", name: "Ana", role: "owner", createdAt: T0 - 30 * DAY, updatedAt: T0 - 30 * DAY },
      { id: "p-lucia", name: "Lucía", role: "partner", createdAt: T0 - 30 * DAY, updatedAt: T0 - 30 * DAY },
    ],
    proposals: [wipeProposal("pw", proposedBy, "p-lucia")],
    quietDays: [], pregnancyTests: [],
  });
  const ghost = journalFromUnknown(raw("p-ghost-third"), "en");
  check("S1 gate drops the ghost-proposed approved wipe", !(ghost.proposals ?? []).some((p) => p.id === "pw"));
  const honest = journalFromUnknown(raw("p-owner"), "en");
  check("S1 gate keeps the member-proposed approved wipe", (honest.proposals ?? []).some((p) => p.id === "pw"));
}

/* ── S2. The merge checks the proposer's signature too (B5a) ── */
{
  const a = base(T0);
  a.proposals = [wipeProposal("pw", "p-ghost-third", "p-lucia")];
  const b = base(T0);
  const m = mergeJournals(a, b);
  check("S2 merge drops the ghost-proposed approved wipe", !(m.proposals ?? []).some((p) => p.id === "pw"));
  const c = base(T0);
  c.proposals = [wipeProposal("pw2", "p-owner", "p-lucia")];
  const m2 = mergeJournals(c, b);
  check("S2 merge keeps the member-proposed approved wipe", (m2.proposals ?? []).some((p) => p.id === "pw2"));
}

/* ── S3. executeWipe voids a ghost-proposed wipe (B5a) ── */
{
  const j = base(T0);
  j.proposals = [wipeProposal("pw", "p-ghost-third", "p-lucia")];
  useJournal.setState({ journal: j, unlocked: true });
  S().executeWipe("pw");
  check("S3 ghost-proposed wipe burns nothing", J().sessions.length === 1);
  check("S3 ghost-proposed wipe is cancelled, not left armed", !(J().proposals ?? []).some((p) => p.id === "pw"));
}

/* ── S4. An approved wipe dies with its proposer (B5b) ── */
{
  const j = base(T0);
  j.proposals = [{
    id: "pw", kind: "wipe-vault", proposedBy: "p-lucia", proposedAt: T0 - 2 * DAY,
    expiresAt: T0 + 5 * DAY, state: "pending",
  }];
  useJournal.setState({ journal: j, unlocked: true });
  S().decideProposal("pw", "p-owner", true);
  check("S4 approval lands (precondition)", (J().proposals ?? []).some((p) => p.id === "pw" && p.state === "approved"));
  S().deletePersonForever("Lucía");
  check("S4 her approved wipe dies with her", !(J().proposals ?? []).some((p) => p.id === "pw"));
  const carrier = base(T0);
  carrier.proposals = [wipeProposal("pw", "p-lucia", "p-owner")];
  const m = mergeJournals(J(), carrier);
  check("S4 the merge cannot resurrect her wipe", !(m.proposals ?? []).some((p) => p.id === "pw"));
}

/* ── S5. Couple mode OFF carries a stamp (B8) ── */
{
  const on = base(T0);
  on.settings.coupleMode = { sharedFrom: "2026-10-01", enabledAt: T0 - 10 * DAY };
  useJournal.setState({ journal: on, unlocked: true });
  S().disableCoupleMode();
  const off = J();
  check("S5 mode is off locally (precondition)", off.settings.coupleMode === undefined);
  const m1 = mergeJournals(off, on);
  const m2 = mergeJournals(on, off);
  check("S5 merge does not switch the mode back on (off x on)", m1.settings.coupleMode === undefined);
  check("S5 merge does not switch the mode back on (on x off)", m2.settings.coupleMode === undefined);
  // Re-enable: the fresh enable stamp must beat the off stamp.
  useJournal.setState({ journal: off, unlocked: true });
  S().enableCoupleMode({ partnerName: "Lucía", sharedFrom: "2026-10-01", ownerPinHash: undefined, partnerPinHash: undefined });
  const reOn = J();
  check("S5 re-enable lands locally (precondition)", reOn.settings.coupleMode !== undefined);
  const m3 = mergeJournals(reOn, off);
  check("S5 re-enabled mode survives the merge with the off journal", m3.settings.coupleMode !== undefined);
}

/* ── S6. The stale-window fold-in keeps the merged settings (B10) ── */
{
  const src = readFileSync("src/lib/vela/store.ts", "utf8");
  const fn = src.slice(src.indexOf("function reopenAfterStale"), src.indexOf("staleHandler = reopenAfterStale"));
  check("S6 reopenAfterStale no longer overrides the merged settings", !fn.includes("settings: now.journal.settings"));
  // The machinery the fold-in relies on: the merge itself keeps the held
  // window's settings-borne work (H1's X1 precondition, as a hold).
  const now = base(T0);
  const held = base(T0);
  held.settings.anniversaries = [{ id: "a-held", label: "Held window", monthDay: "06-01", kind: "custom", milestone: false, createdAt: T0 - DAY }];
  held.settings.customPlaces = [];
  now.settings.customPlaces = ["Cabin"];
  const m = mergeJournals(now, held);
  check("S6 merge keeps the held window's anniversary", m.settings.anniversaries.some((a) => a.id === "a-held"));
}

/* ── S7. Anniversary and child edits carry their own stamp (RT3-H6 B2) ── */
{
  const j = base(T0 - 30 * DAY);
  j.settings.anniversaries = [{ id: "a1", label: "First trip", monthDay: "06-01", kind: "custom", milestone: false, createdAt: T0 - 30 * DAY }];
  j.settings.children = [{ id: "k1", name: "Marta", birthdate: "2024-03-01", refAs: "daughter", createdAt: T0 - 30 * DAY }];
  useJournal.setState({ journal: j, unlocked: true });
  S().saveAnniversary({ id: "a1", label: "Edited label", monthDay: "06-01", kind: "custom", milestone: false, createdAt: T0 - 30 * DAY });
  S().saveChild({ id: "k1", name: "Marta Edited", birthdate: "2024-03-01", refAs: "daughter", createdAt: T0 - 30 * DAY });
  const edited = J();
  check("S7 the edit stamps the anniversary", (edited.settings.anniversaries[0]?.updatedAt ?? 0) > T0 - 30 * DAY);
  check("S7 the edit stamps the child", (edited.settings.children[0]?.updatedAt ?? 0) > T0 - 30 * DAY);
  // The other device saved something unrelated LATER; its copies are stale.
  const stale = base(T0 + 10 * DAY);
  stale.settings.anniversaries = [{ id: "a1", label: "First trip", monthDay: "06-01", kind: "custom", milestone: false, createdAt: T0 - 30 * DAY }];
  stale.settings.children = [{ id: "k1", name: "Marta", birthdate: "2024-03-01", refAs: "daughter", createdAt: T0 - 30 * DAY }];
  const m = mergeJournals(edited, stale);
  check("S7 the edited anniversary label survives the merge", m.settings.anniversaries.find((a) => a.id === "a1")?.label === "Edited label");
  check("S7 the edited child name survives the merge", m.settings.children.find((c) => c.id === "k1")?.name === "Marta Edited");
  // The stamp survives the gate (persisted-fields law: reload or it did not happen).
  const round = journalFromUnknown(JSON.parse(JSON.stringify(edited)), "en");
  check("S7 anniversary stamp survives a reload", (round.settings.anniversaries[0]?.updatedAt ?? 0) > T0 - 30 * DAY);
  check("S7 child stamp survives a reload", (round.settings.children[0]?.updatedAt ?? 0) > T0 - 30 * DAY);
}

console.log(`WAVE12-CONSENT-SETTINGS: ${breaks} break(s), ${holds} hold(s)`);
if (breaks > 0) process.exitCode = 1;
