/* WAVE18-COLLISION — Round 4 Wave 2 (2.2.41): the id collision,
 * whole (RT4-H1 B2/B6, RT4-H4 B1, RT4-H5 B1, RT4-H6 B1/B8, RT4-H4
 * L-A). One flat tombstone namespace serves every class; the Round 3
 * repair guarded two doors and two classes. Now: the merge repairs
 * collisions on both sides before resolving (the person re-seated
 * under a DETERMINISTIC fresh id, references incl. proposal targetId
 * re-pointed); when the partner-off witness proves the tombstone is
 * the person's own, the OTHER record is re-seated instead; every
 * deletion action guards its tombstone; the gate applies tombstones
 * to every class, not only people, and clears a ghost default the
 * roster does not hold; "__proto__" is a tombstoneable id.
 * Fake data only.
 * Run: node ../run-ts-test.mjs tests/wave18-collision.ts */
import { journalFromUnknown, mergeJournals, useJournal } from "../src/lib/vela/store";
import type { Journal } from "../src/lib/vela/types";

process.on("unhandledRejection", () => undefined);

let breaks = 0;
let holds = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) { holds += 1; console.log(`HOLD ${name}`); }
  else { breaks += 1; console.log(`BREAK ${name}${detail ? ` — ${detail}` : ""}`); }
}

const DAY = 86400000;
const now = Date.now();
const T0 = now - 60 * DAY;
const OWNER = { id: "p-owner", name: "Ana", role: "owner", createdAt: T0, updatedAt: T0 };

function gate(raw: Record<string, unknown>): Journal {
  return journalFromUnknown({ profile: { displayName: "Ana", createdAt: T0 }, settings: { language: "en", weekStart: "mon" }, partners: [], sessions: [], encounters: [], updatedAt: T0 + 1000, ...raw }, "en");
}
function drive(journal: Journal) {
  useJournal.setState({ journal, unlocked: true });
  return useJournal.getState();
}
const LUCIA = { id: "shared-1", name: "Lucía", role: "partner", createdAt: T0 + 10, updatedAt: T0 + 20 };

/* ——— S1: the merge repairs direction A (her id = a session's) ——— */
{
  const sideA = gate({
    people: [OWNER, LUCIA],
    sessions: [{ id: "shared-1", date: "2026-10-20", partnerName: "Sofía", createdAt: T0 + 30, updatedAt: T0 + 30 }],
    deleted: { "shared-1": T0 + 40 },
  });
  const sideB = gate({
    people: [OWNER, LUCIA],
    sessions: [{ id: "shared-1", date: "2026-10-20", partnerName: "Sofía", createdAt: T0 + 30, updatedAt: T0 + 30 }],
  });
  for (const [a, b, tag] of [[sideA, sideB, "A,B"], [sideB, sideA, "B,A"]] as const) {
    const m = mergeJournals(a, b);
    const her = (m.people ?? []).find((p) => p.name === "Lucía");
    check(`S1 (${tag}) she survives the merge under a fresh id`, !!her && her.id !== "shared-1", JSON.stringify(m.people));
    check(`S1 (${tag}) the tombstone keeps its own class: the session dies`, !m.sessions.some((s) => s.id === "shared-1"));
  }
}

/* ——— S2: direction B — the witness proves the tombstone is hers ——— */
{
  const deletedHer = gate({
    people: [OWNER],
    quietDays: [{ id: "shared-1", from: "2026-10-01", to: "2026-10-03", reason: "travel", source: "manual", createdAt: T0 + 15, updatedAt: T0 + 15 }],
    deleted: { "shared-1": T0 + 40, "partner-:lucía": T0 + 40 },
  });
  const staleHer = gate({
    people: [OWNER, LUCIA],
    quietDays: [{ id: "shared-1", from: "2026-10-01", to: "2026-10-03", reason: "travel", source: "manual", createdAt: T0 + 15, updatedAt: T0 + 15 }],
  });
  const m = mergeJournals(deletedHer, staleHer);
  check("S2 she stays deleted", !(m.people ?? []).some((p) => p.name === "Lucía"));
  check("S2 the quiet mark survives, re-seated", (m.quietDays ?? []).length === 1 && (m.quietDays ?? [])[0].id !== "shared-1", JSON.stringify(m.quietDays));
  const m2 = mergeJournals(staleHer, deletedHer);
  check("S2 same verdict, arguments swapped", !(m2.people ?? []).some((p) => p.name === "Lucía") && (m2.quietDays ?? []).length === 1);
}

/* ——— S3: the gate repairs direction A for every class ——— */
{
  for (const [tag, extra] of [
    ["anniversary", { settings: { language: "en", weekStart: "mon", anniversaries: [{ id: "shared-1", label: "First trip", monthDay: "03-04", kind: "trip", milestone: false, createdAt: T0 + 15 }] } }],
    ["pregnancy test", { pregnancyTests: [{ id: "shared-1", date: "2026-10-05", result: "positive", source: "a test", notes: "", createdAt: T0 + 15 }] }],
    ["quiet mark", { quietDays: [{ id: "shared-1", from: "2026-10-01", to: "2026-10-02", reason: "travel", source: "manual", createdAt: T0 + 15, updatedAt: T0 + 15 }] }],
  ] as const) {
    const j = gate({ people: [OWNER, LUCIA], deleted: { "shared-1": T0 + 40 }, ...extra });
    check(`S3 (${tag}) she survives the gate`, (j.people ?? []).some((p) => p.name === "Lucía" && p.id !== "shared-1"), JSON.stringify(j.people));
  }
}

/* ——— S4: the gate repairs direction B ——— */
{
  const j = gate({
    people: [OWNER, LUCIA],
    quietDays: [{ id: "shared-1", from: "2026-10-01", to: "2026-10-03", reason: "travel", source: "manual", createdAt: T0 + 15, updatedAt: T0 + 15 }],
    deleted: { "shared-1": T0 + 40, "partner-:lucía": T0 + 40 },
  });
  check("S4 she stays out at the gate", !(j.people ?? []).some((p) => p.name === "Lucía"));
  check("S4 the mark survives the gate, re-seated", (j.quietDays ?? []).length === 1 && (j.quietDays ?? [])[0].id !== "shared-1", JSON.stringify(j.quietDays));
}

/* ——— S5: the gate applies tombstones to every class ——— */
{
  const j = gate({
    people: [OWNER, { id: "p-lucia", name: "Lucía", role: "partner", createdAt: T0, updatedAt: T0 }],
    sessions: [
      { id: "s-dead", date: "2026-10-20", partnerName: "Ana", createdAt: T0 + 10, updatedAt: T0 + 10 },
      { id: "s-live", date: "2026-10-21", partnerName: "Ana", createdAt: T0 + 10, updatedAt: T0 + 10 },
    ],
    proposals: [
      { id: "prop-dead", kind: "wipe-vault", proposedBy: "p-owner", proposedAt: T0 + 10, state: "approved", decidedBy: "p-lucia", decidedAt: T0 + 12, expiresAt: now + 7 * DAY },
      { id: "prop-live", kind: "delete-session", targetId: "s-live", proposedBy: "p-owner", proposedAt: T0 + 10, state: "pending", expiresAt: now + 7 * DAY },
    ],
    quietDays: [{ id: "q-dead", from: "2026-10-01", to: "2026-10-02", reason: "travel", source: "manual", createdAt: T0 + 10, updatedAt: T0 + 10 }],
    pregnancyTests: [{ id: "t-dead", date: "2026-10-05", result: "positive", source: "a test", notes: "", createdAt: T0 + 10 }],
    deleted: { "s-dead": T0 + 20, "prop-dead": T0 + 20, "q-dead": T0 + 20, "t-dead": T0 + 20 },
  });
  check("S5 the tombstoned session does not load", !j.sessions.some((s) => s.id === "s-dead") && j.sessions.some((s) => s.id === "s-live"));
  check("S5 the tombstoned proposal does not load", !(j.proposals ?? []).some((p) => p.id === "prop-dead") && (j.proposals ?? []).some((p) => p.id === "prop-live"));
  check("S5 the tombstoned quiet mark does not load", !(j.quietDays ?? []).some((m) => m.id === "q-dead"));
  check("S5 the tombstoned pregnancy test does not load", !(j.pregnancyTests ?? []).some((t) => t.id === "t-dead"));
}

/* ——— S6: deletion actions guard their tombstones ——— */
{
  const withProp = gate({
    people: [OWNER, LUCIA],
    proposals: [{ id: "shared-1", kind: "delete-session", targetId: "s-x", proposedBy: "p-owner", proposedAt: T0 + 30, state: "pending", expiresAt: now + 7 * DAY }],
  });
  const st = drive(withProp);
  st.cancelProposal("shared-1");
  const after = useJournal.getState().journal;
  check("S6 cancelProposal re-seats her", (after.people ?? []).some((p) => p.name === "Lucía" && p.id !== "shared-1"), JSON.stringify(after.people));
  const withMark = gate({
    people: [OWNER, LUCIA],
    quietDays: [{ id: "shared-1", from: "2026-10-01", to: "2026-10-02", reason: "travel", source: "manual", createdAt: T0 + 15, updatedAt: T0 + 15 }],
  });
  const st2 = drive(withMark);
  st2.deleteQuietMark("shared-1");
  const after2 = useJournal.getState().journal;
  check("S6 deleteQuietMark re-seats her", (after2.people ?? []).some((p) => p.name === "Lucía" && p.id !== "shared-1"));
  check("S6 the mark itself is gone", !(after2.quietDays ?? []).length);
}

/* ——— S7: deletePersonForever re-seats the colliding record ——— */
{
  const j = gate({
    people: [OWNER, LUCIA],
    partners: ["Lucía"],
    quietDays: [{ id: "shared-1", from: "2026-10-01", to: "2026-10-03", reason: "travel", source: "manual", createdAt: T0 + 15, updatedAt: T0 + 15 }],
  });
  const st = drive(j);
  st.deletePersonForever("Lucía");
  const after = useJournal.getState().journal;
  check("S7 she is gone", !(after.people ?? []).some((p) => p.name === "Lucía") && !after.partners.includes("Lucía"));
  check("S7 the mark survives her erasure, re-seated", (after.quietDays ?? []).length === 1 && (after.quietDays ?? [])[0].id !== "shared-1", JSON.stringify(after.quietDays));
}

/* ——— S8: "__proto__" is a tombstoneable id ——— */
{
  const j = gate({
    people: [OWNER],
    sessions: [{ id: "__proto__", date: "2026-10-20", partnerName: "Ana", createdAt: T0 + 10, updatedAt: T0 + 10 }],
  });
  const st = drive(j);
  st.deleteSession("__proto__");
  const after = useJournal.getState().journal;
  check("S8 the tombstone is recorded as data", Object.prototype.hasOwnProperty.call(after.deleted ?? {}, "__proto__"), JSON.stringify(Object.keys(after.deleted ?? {})));
  const restored = { ...(JSON.parse(JSON.stringify(after)) as Record<string, unknown>), sessions: [{ id: "__proto__", date: "2026-10-20", partnerName: "Ana", createdAt: T0 + 10, updatedAt: T0 + 10 }] };
  const roundTripped = gate(restored);
  check("S8 the tombstone survives a save/load round trip", Object.prototype.hasOwnProperty.call(roundTripped.deleted ?? {}, "__proto__") && !roundTripped.sessions.some((s) => s.id === "__proto__"));
  const stale = gate({ people: [OWNER], sessions: [{ id: "__proto__", date: "2026-10-20", partnerName: "Ana", createdAt: T0 + 10, updatedAt: T0 + 10 }] });
  const m = mergeJournals(after, stale);
  check("S8 the session stays dead at the merge", !m.sessions.some((s) => s.id === "__proto__"));
}

/* ——— S9: the gate clears a ghost default ——— */
{
  const ghost = gate({ people: [OWNER], partners: ["Ana"], settings: { language: "en", weekStart: "mon", defaultPartner: "Nobody" } });
  check("S9 a default naming nobody is cleared at the gate", ghost.settings.defaultPartner === "", ghost.settings.defaultPartner);
  const real = gate({ people: [OWNER], partners: ["Ana"], settings: { language: "en", weekStart: "mon", defaultPartner: "Ana" } });
  check("S9 control: a default naming a roster member survives", real.settings.defaultPartner === "Ana");
}

/* ——— S10: the repair is deterministic — gate and merge agree ——— */
{
  const raw = {
    people: [OWNER, LUCIA],
    sessions: [{ id: "shared-1", date: "2026-10-20", partnerName: "Sofía", createdAt: T0 + 30, updatedAt: T0 + 30 }],
    deleted: { "shared-1": T0 + 40 },
  };
  const atGate = gate(raw);
  const gateId = (atGate.people ?? []).find((p) => p.name === "Lucía")?.id;
  const m = mergeJournals(gate({ people: [OWNER, LUCIA], sessions: raw.sessions }), gate({ people: [OWNER, LUCIA], sessions: raw.sessions, deleted: raw.deleted }));
  const mergeId = (m.people ?? []).find((p) => p.name === "Lucía")?.id;
  check("S10 gate and merge re-seat her under the same fresh id", !!gateId && gateId === mergeId, `gate=${gateId} merge=${mergeId}`);
}

/* ——— S11: the colliding record is already gone (RT4-H1's shape) ——— */
{
  const a = gate({ people: [OWNER, LUCIA] });
  const b = gate({ people: [OWNER], deleted: { "shared-1": T0 + 40 } });
  const m = mergeJournals(a, b);
  check("S11 a bare tombstone from a session long deleted cannot execute her", (m.people ?? []).some((p) => p.name === "Lucía" && p.id !== "shared-1"), JSON.stringify(m.people));
  const m2 = mergeJournals(b, a);
  check("S11 same verdict, arguments swapped", (m2.people ?? []).some((p) => p.name === "Lucía"));
  const g = gate({ people: [OWNER, LUCIA], deleted: { "shared-1": T0 + 40 } });
  check("S11 the gate agrees: she is re-seated, not executed", (g.people ?? []).some((p) => p.name === "Lucía" && p.id !== "shared-1"));
  const gw = gate({ people: [OWNER, LUCIA], deleted: { "shared-1": T0 + 40, "partner-:lucía": T0 + 40 } });
  check("S11 control: with the witness, the same tombstone removes her", !(gw.people ?? []).some((p) => p.name === "Lucía"));
}

console.log(`WAVE18-COLLISION: ${breaks} break(s), ${holds} hold(s)`);
if (breaks > 0) process.exitCode = 1;
