/* Wave 0 re-hunt — a fresh prejudice pass over the solemn promises AFTER
 * the fix, attacking the new machinery itself (not the old specimens):
 * clock tampering, type confusion at the gate, consent outliving its
 * signer, and the cooling clock's edges. Fake data only. */
import { cleanProposals } from "../src/lib/vela/people";
import { journalFromUnknown, useJournal } from "../src/lib/vela/store";
import type { Journal, Proposal } from "../src/lib/vela/types";

process.on("unhandledRejection", () => undefined);

let breaks = 0;
let holds = 0;
function hold(name: string) { holds += 1; console.log(`HOLD ${name}`); }
function brk(name: string, extra = "") { breaks += 1; console.log(`BREAK ${name}${extra ? " — " + extra : ""}`); }

const DAY = 86400000;
const now = Date.now();

function rawJournal(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    profile: { displayName: "Ana", createdAt: now - 30 * DAY },
    settings: { language: "en", coupleMode: { sharedFrom: "2026-10-01", enabledAt: now - 30 * DAY } },
    partners: ["Lucía"],
    sessions: [
      { id: "s1", date: "2026-11-02", time: "21:00", partnerName: "Lucía", place: "Cabin", durationMins: 40, positions: [], intensity: 4, connection: 4, satisfaction: 4, energy: 4, overall: 4, notes: "", ownWords: "", sessionNumber: 1, encounterId: "", createdAt: now - 10 * DAY },
    ],
    encounters: [],
    people: [
      { id: "p-owner", name: "Ana", role: "owner", createdAt: now - 30 * DAY, updatedAt: now - 30 * DAY },
      { id: "p-lucia", name: "Lucía", role: "partner", createdAt: now - 30 * DAY, updatedAt: now - 30 * DAY },
    ],
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
function seedWipe(proposal: Proposal, peopleOverride?: unknown): void {
  const j = seed();
  useJournal.setState({ journal: { ...j, proposals: [proposal], ...(peopleOverride ? { people: peopleOverride } : {}) }, unlocked: true });
}

/* R1 — decidedAt in the future (clock set back on the deciding device):
 * the cooling clock must not be cheated into firing early. */
{
  seedWipe({ id: "w-future", kind: "wipe-vault", proposedBy: "p-owner", proposedAt: now - DAY, expiresAt: now + 6 * DAY, state: "approved", decidedBy: "p-lucia", decidedAt: now + 30 * DAY });
  S().executeWipe("w-future");
  if (J().sessions.length === 1) hold("R1 a future-dated approval cannot fire early");
  else brk("R1 a future-dated approval fired the wipe");
}

/* R2 — type confusion at the gate: decidedBy as a non-string, decidedAt
 * as a string — the gate must drop both, not coerce them. */
{
  const a = cleanProposals([{ id: "w-t1", kind: "wipe-vault", proposedBy: "p-owner", proposedAt: now - 9 * DAY, expiresAt: now + DAY, state: "approved", decidedBy: 42, decidedAt: now - 8 * DAY } as unknown as Proposal]);
  const b = cleanProposals([{ id: "w-t2", kind: "wipe-vault", proposedBy: "p-owner", proposedAt: now - 9 * DAY, expiresAt: now + DAY, state: "approved", decidedBy: "p-lucia", decidedAt: "yesterday" } as unknown as Proposal]);
  if (a.length === 0 && b.length === 0) hold("R2 the gate drops type-confused approvals");
  else brk("R2 a type-confused approval survived the gate", `a=${a.length} b=${b.length}`);
}

/* R3 — the signer is gone: the approval was real, but the person who gave
 * it no longer exists in the diary (record removed after signing). A wipe
 * must not execute on the signature of someone who is no longer a person
 * of the diary — void is the safe direction. */
{
  seedWipe(
    { id: "w-orphan", kind: "wipe-vault", proposedBy: "p-owner", proposedAt: now - 9 * DAY, expiresAt: now - 2 * DAY, state: "approved", decidedBy: "p-lucia", decidedAt: now - 8 * DAY },
    [{ id: "p-owner", name: "Ana", role: "owner", createdAt: now - 30 * DAY, updatedAt: now - 30 * DAY }],
  );
  S().executeWipe("w-orphan");
  if (J().sessions.length === 1) hold("R3 a wipe signed by a person no longer in the diary is void");
  else brk("R3 an orphaned signature executed the wipe");
}

/* R4 — AMENDED IN ROUND 3 (RT3-H1 B5), doctrine correction, declared:
 * this specimen once read the proposer's identity as irrelevant ("the
 * second signature is the law") and expected the wipe to FIRE. Round 3
 * convicted the same shape: an approved record naming a proposer who
 * is nobody in the diary can only have arrived as foreign data —
 * decideProposal, the app's only mint of approvals, refuses to decide
 * a proposal nobody in the diary made, so the "genuine approval" on
 * such a record is unverifiable by construction. The older doctrine
 * sentence in decideProposal itself states both halves: a proposal
 * nobody in the diary made cannot be decided, and an approval no
 * member gave is not an approval. Consent is TWO signatures, both of
 * them members'. The specimen now expects the void; the honest
 * two-member wipe still fires (wave7-consent-cycle carries it). */
{
  seedWipe({ id: "w-stranger-proposer", kind: "wipe-vault", proposedBy: "p-nobody", proposedAt: now - 9 * DAY, expiresAt: now - 2 * DAY, state: "approved", decidedBy: "p-lucia", decidedAt: now - 8 * DAY });
  S().executeWipe("w-stranger-proposer");
  if (J().sessions.length === 1) hold("R4 a stranger-proposed wipe is void however it is signed");
  else brk("R4 a stranger-proposed wipe executed", `sessions=${J().sessions.length} unlocked=${S().unlocked}`);
}

/* R5 — double execution: firing the same wipe twice (the second call lands
 * on the locked shell) must be a silent no-op, never an error or a
 * resurrection. */
{
  seedWipe({ id: "w-twice", kind: "wipe-vault", proposedBy: "p-owner", proposedAt: now - 9 * DAY, expiresAt: now - 2 * DAY, state: "approved", decidedBy: "p-lucia", decidedAt: now - 8 * DAY });
  S().executeWipe("w-twice");
  let threw = false;
  try { S().executeWipe("w-twice"); } catch { threw = true; }
  if (!threw && S().unlocked === false) hold("R5 a second firing is a silent no-op");
  else brk("R5 the second firing threw or unlocked", `threw=${threw} unlocked=${S().unlocked}`);
}

/* R6 — a wipe proposal approved by the other person, then CANCELLED by the
 * proposer during cooling, then re-decided by nobody: the tombstone must
 * keep it dead through a reload (the gate sees the blob without it). */
{
  seed();
  const pid = S().proposeDeletion({ kind: "wipe-vault" }, "p-owner");
  S().decideProposal(pid, "p-lucia", true);
  S().cancelProposal(pid);
  const reloaded = journalFromUnknown(JSON.parse(JSON.stringify(J())), "en");
  if (!(reloaded.proposals ?? []).some((p) => p.id === pid)) hold("R6 a cancelled wipe stays dead across a reload");
  else brk("R6 a cancelled wipe resurrected at the gate");
}

console.log(`\nWAVE0-REHUNT: ${breaks} breaks, ${holds} holds`);
if (breaks > 0) process.exitCode = 1;
