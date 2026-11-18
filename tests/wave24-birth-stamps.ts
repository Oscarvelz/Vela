/* WAVE24-BIRTH-STAMPS — Round 5 Wave 2 (2.2.47): honest birth
 * stamps and writers on the journal's clock (RT5-H6 B6/B7/B9,
 * RT5-H4 B3/B4, RT5-H1 B3/B4 + lead). Four builders invented
 * `createdAt = Date.now()` for stamp-less records — a legacy
 * record was born at load and crossed temporal cuts its
 * stated-stamp twins could not; id-less records minted
 * clock-based ids per device and duplicated at the merge; the
 * reseat seat hashed the raw record at the gate and the cleaned
 * one in the repair; encounter writers (bindEncounter, addRound)
 * and proposeDeletion minted from the raw clock. Now: a missing
 * birth stamp reads as 0, id-less records get content ids, the
 * seat hashes the cleaner's own shape, and every writer rides
 * stampNow. attachOrphans no longer files a session into a
 * stranger's encounter that merely carries its shell id, and a
 * shell is born with updatedAt = createdAt.
 * Fake data only.
 * Run: node ../run-ts-test.mjs tests/wave24-birth-stamps.ts */
import { journalFromUnknown, mergeJournals, repairPersonIdCollision, useJournal } from "../src/lib/vela/store";
import type { Journal } from "../src/lib/vela/types";

process.on("unhandledRejection", () => undefined);

let breaks = 0;
let holds = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) { holds += 1; console.log(`HOLD ${name}`); }
  else { breaks += 1; console.log(`BREAK ${name}${detail ? ` — ${detail}` : ""}`); }
}

const T0 = 1_700_000_000_000;
const OWNER = { id: "p-owner", name: "Ana", role: "owner" as const, createdAt: T0, updatedAt: T0 };
const raw = (over: Record<string, unknown>) => ({
  profile: { displayName: "Ana", createdAt: T0 },
  settings: { language: "en", weekStart: "mon" },
  partners: ["Lucía"],
  sessions: [],
  encounters: [],
  people: [OWNER],
  proposals: [],
  updatedAt: T0 + 30,
  ...over,
});
const gate = (over: Record<string, unknown>) => journalFromUnknown(raw(over), "en");

/* ——— B6: a stamp-less record is born at 0, not at load ——— */
{
  const legacy = gate({ people: [OWNER, { id: "p-old", name: "Lucía", role: "partner", updatedAt: T0 + 5 }] });
  check("B6 a stamp-less person reads createdAt 0", (legacy.people ?? []).find((p) => p.id === "p-old")?.createdAt === 0);
  const wipedSide = gate({ people: [OWNER], clearedAt: T0 + 100, updatedAt: T0 + 100 });
  const m = mergeJournals(wipedSide, legacy);
  check("B6 she does not cross the wipe screen", !(m.people ?? []).some((p) => p.id === "p-old"));
  const born = gate({ people: [OWNER, { id: "p-new", name: "Lucía", role: "partner", createdAt: T0 + 200, updatedAt: T0 + 200 }] });
  const m2 = mergeJournals(wipedSide, born);
  check("B6 control: a person born after the wipe crosses", (m2.people ?? []).some((p) => p.id === "p-new"));
  const s = gate({ sessions: [{ id: "s-old", date: "2026-10-05", partnerName: "Lucía", count: 1 }] });
  check("B6 a stamp-less session reads createdAt 0", s.sessions[0]?.createdAt === 0);
  const p = gate({ profile: { displayName: "Ana" } });
  check("B6 a stamp-less profile reads createdAt 0", p.profile?.createdAt === 0);
}

/* ——— B7: id-less records get the same content id everywhere ——— */
{
  const blob = raw({ sessions: [{ date: "2026-10-05", partnerName: "Lucía", count: 1, createdAt: T0 + 10 }] });
  const g1 = journalFromUnknown(JSON.parse(JSON.stringify(blob)), "en");
  const g2 = journalFromUnknown(JSON.parse(JSON.stringify(blob)), "en");
  check("B7 two gates mint the same id", g1.sessions[0]?.id === g2.sessions[0]?.id && !!g1.sessions[0]?.id, `${g1.sessions[0]?.id} vs ${g2.sessions[0]?.id}`);
  const m = mergeJournals(g1, g2);
  check("B7 the merge keeps ONE copy", m.sessions.length === 1, `${m.sessions.length}`);
}

/* ——— B4: the gate's seat is the repair's seat ——— */
{
  const blob = raw({
    people: [OWNER, { id: "shared-1", name: "  Lucía  ", role: "partner", createdAt: T0 + 10, updatedAt: T0 + 10 }],
    sessions: [{ id: "shared-1", date: "2026-10-05", partnerName: "Sofía", count: 1, createdAt: T0 + 10 }],
    deleted: { "shared-1": T0 + 40 },
  });
  const g = journalFromUnknown(JSON.parse(JSON.stringify(blob)), "en");
  const gateSeat = (g.people ?? []).find((p) => p.name === "Lucía")?.id;
  const cleaned = journalFromUnknown({ ...blob, deleted: {} }, "en");
  const repaired = repairPersonIdCollision(cleaned, "shared-1");
  const repairSeat = (repaired.people ?? []).find((p) => p.name === "Lucía")?.id;
  check("B4 gate seat == repair seat", gateSeat !== undefined && gateSeat === repairSeat, `${gateSeat} vs ${repairSeat}`);
}

/* ——— B4-writers: proposals and rounds ride stampNow ——— */
{
  const BIG = Date.now() + 1_000_000_000;
  const base = gate({
    people: [OWNER, { id: "p-lucia", name: "Lucía", role: "partner", createdAt: T0, updatedAt: T0 }],
    sessions: [{ id: "s1", date: "2026-10-05", partnerName: "Lucía", count: 1, createdAt: T0 + 10, encounterId: "e1" }],
    encounters: [{ id: "e1", createdAt: T0 + 10, title: "", startDate: "2026-10-05", endDate: "2026-10-05", partnerName: "Lucía", comment: "", problems: [] }],
    deleted: { "some-old-id": BIG },
    updatedAt: T0 + 30,
  });
  useJournal.setState({ journal: base, unlocked: true });
  const pid = useJournal.getState().proposeDeletion({ kind: "delete-session", targetId: "s1" }, "p-owner");
  const after1 = useJournal.getState().journal;
  const proposal = (after1.proposals ?? []).find((p) => p.id === pid);
  check("W1 a proposal is born at the journal's clock", (proposal?.proposedAt ?? 0) >= BIG, `${proposal?.proposedAt} vs ${BIG}`);
  useJournal.getState().addRound("s1");
  const after2 = useJournal.getState().journal;
  const enc = after2.encounters.find((e) => e.id === "e1");
  check("W2 addRound's encounter write rides stampNow", (enc?.updatedAt ?? 0) >= BIG, `${enc?.updatedAt}`);
  const copy = after2.sessions.find((s) => s.id !== "s1");
  check("W2 the new round is born at the journal's clock", (copy?.createdAt ?? 0) >= BIG, `${copy?.createdAt}`);
}

/* ——— B9: attachOrphans respects a foreign eo- encounter ——— */
{
  const foreign = gate({
    sessions: [{ id: "s1", date: "2026-10-05", partnerName: "Lucía", count: 1, createdAt: T0 + 10, encounterId: "" }],
    encounters: [{ id: "eo-s1", createdAt: T0 + 5, title: "Trip", startDate: "2026-10-01", endDate: "2026-10-09", partnerName: "Sofía", comment: "", problems: [] }],
  });
  check("B9 the session does not file into the stranger's encounter", foreign.sessions[0]?.encounterId !== "eo-s1", `${foreign.sessions[0]?.encounterId}`);
  check("B9 it gets its own shell", foreign.encounters.some((e) => e.id !== "eo-s1" && foreign.sessions[0]?.encounterId === e.id));
  const plain = gate({ sessions: [{ id: "s1", date: "2026-10-05", partnerName: "Lucía", count: 1, createdAt: T0 + 10, encounterId: "" }] });
  check("B9 control: an ordinary orphan gets the eo- shell", plain.sessions[0]?.encounterId === "eo-s1");
}

/* ——— Shell stamps: born consistent ——— */
{
  const FUT = Date.now() + 100_000_000;
  const g = gate({ sessions: [{ id: "s1", date: "2027-01-05", partnerName: "Lucía", count: 1, createdAt: FUT, encounterId: "" }] });
  const shell = g.encounters.find((e) => e.id === "eo-s1");
  check("S7 the shell's updatedAt is its createdAt", !!shell && shell.updatedAt === shell.createdAt && shell.createdAt >= FUT, JSON.stringify(shell));
}

console.log(`WAVE24-BIRTH-STAMPS: ${breaks} break(s), ${holds} hold(s)`);
if (breaks > 0) process.exitCode = 1;
