/* WAVE23-WITNESS2 — Round 5 Wave 1 (2.2.46): the witness, repaired
 * (RT5-H1 B1/B2/B6, RT5-H6 B3/B4). Round 4's direction proof was a
 * partner-off stamp: roster acts mint it too, so a roster removal
 * crossed with a foreign session tombstone EXECUTED her person
 * record (B1); and the flat map's max-merge could outgrow it, so a
 * later bare tombstone made (A⋈B)⋈C resurrect a forever-deleted
 * woman while (A⋈C)⋈B killed her (B2). The witness is now a
 * dedicated key — `person-:<id>` — minted only by person deletions
 * (deletePersonForever, merge displacement) and proven by
 * PRESENCE. Direction B re-seats EVERY record carrying the id
 * (B3); displacement mints the witness, or the displaced returned
 * at the next merge (B4); the wipe's tombstone writes go through
 * setStamp, so a "__proto__" proposal stays wiped (B6).
 * Fake data only.
 * Run: node ../run-ts-test.mjs tests/wave23-witness2.ts */
import { journalFromUnknown, mergeJournals } from "../src/lib/vela/store";
import { wipedJournal } from "../src/lib/vela/wipe";
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
const LUCIA = { id: "shared-1", name: "Lucía", role: "partner" as const, createdAt: T0 + 10, updatedAt: T0 + 10 };
const SOFIA = { id: "p-sofia", name: "Sofía", role: "partner" as const, createdAt: T0 + 20, updatedAt: T0 + 20 };

function side(over: Partial<Journal>): Journal {
  return journalFromUnknown(
    {
      profile: { displayName: "Ana", createdAt: T0 },
      settings: { language: "en", weekStart: "mon" },
      partners: ["Lucía"],
      sessions: [],
      encounters: [],
      people: [OWNER],
      proposals: [],
      updatedAt: T0 + 30,
      ...over,
    },
    "en",
  );
}
const session = (id: string, date: string, at: number) => ({
  id, date, partnerName: "Sofía", count: 1, durationMins: 0, positions: [], contraception: [], problems: [],
  intensity: 0, connection: 0, satisfaction: 0, energy: 0, overall: 0, createdAt: at, source: "manual" as const,
});

/* ——— B1: a roster act no longer arms a foreign tombstone ——— */
{
  // Side A: Lucía's PERSON record (foreign id) + a roster removal of
  // her name (partner-off only — what removePartner/eraseAll mint).
  const a = side({ people: [OWNER, LUCIA], deleted: { "partner-:lucía": T0 + 40 } });
  // Side B: a session carrying her id, deleted there.
  const b = side({ sessions: [session("shared-1", "2026-11-01", T0 + 10)], deleted: { "shared-1": T0 + 40 } });
  const m = mergeJournals(a, b);
  check("B1 she survives the merge, re-seated", (m.people ?? []).some((p) => p.name === "Lucía" && p.id !== "shared-1"), JSON.stringify((m.people ?? []).map((p) => p.id)));
  check("B1 the session dies by its own tombstone", !m.sessions.some((s) => s.id === "shared-1"));
  const g = journalFromUnknown(
    { profile: { displayName: "Ana", createdAt: T0 }, settings: { language: "en" }, partners: ["Lucía"], sessions: [session("shared-1", "2026-11-01", T0 + 10)], encounters: [], people: [OWNER, LUCIA], proposals: [], updatedAt: T0 + 30, deleted: { "shared-1": T0 + 40, "partner-:lucía": T0 + 40 } },
    "en",
  );
  check("B1 the gate agrees: she is re-seated, not executed", (g.people ?? []).some((p) => p.name === "Lucía" && p.id !== "shared-1"));
}

/* ——— B2: the verdict no longer depends on merge grouping ——— */
{
  // X: her forever-deletion (witnessed). Y: her record + the foreign
  // session, both alive. Z: a later BARE tombstone for the shared id
  // (a session deletion on a device that never held her record).
  // Under the stamp-witness, Z's tombstone outgrew the witness in
  // the assembled map: (X⋈Y)⋈Z resurrected her, (X⋈Z)⋈Y killed her.
  const x = side({ deleted: { "shared-1": T0 + 40, "person-:shared-1": T0 + 40 } });
  const y = side({ people: [OWNER, LUCIA], sessions: [session("shared-1", "2026-11-01", T0 + 10)] });
  const z = side({ deleted: { "shared-1": T0 + 90 } });
  const g1 = mergeJournals(mergeJournals(x, y), z);
  const g2 = mergeJournals(mergeJournals(x, z), y);
  check("B2 (X⋈Y)⋈Z: she stays deleted", !(g1.people ?? []).some((p) => p.name === "Lucía"));
  check("B2 (X⋈Z)⋈Y: she stays deleted", !(g2.people ?? []).some((p) => p.name === "Lucía"));
  check("B2 the foreign session is re-seated in both groupings", g1.sessions.length === 1 && g1.sessions[0].id !== "shared-1" && g2.sessions.length === 1 && g2.sessions[0].id !== "shared-1", `${g1.sessions.length}/${g2.sessions.length}`);
}

/* ——— B4: a displaced person stays displaced ——— */
{
  const a = side({ people: [OWNER, LUCIA] });
  const b = side({ people: [OWNER, SOFIA] });
  const m = mergeJournals(a, b);
  const seated = (m.people ?? []).filter((p) => p.role === "partner").map((p) => p.name);
  check("B4 the merge seats exactly one partner", seated.length === 1, seated.join(","));
  const displacedName = seated[0] === "Lucía" ? "Sofía" : "Lucía";
  const displacedId = displacedName === "Lucía" ? "shared-1" : "p-sofia";
  check("B4 the displacement mints the witness", ((m.deleted ?? {})[`person-:${displacedId}`] ?? 0) > 0, JSON.stringify(Object.keys(m.deleted ?? {})));
  const holder = displacedName === "Lucía" ? a : b;
  const m2 = mergeJournals(m, holder);
  check("B4 she stays displaced at the next merge", !(m2.people ?? []).some((p) => p.name === displacedName), JSON.stringify((m2.people ?? []).map((p) => p.name)));
}

/* ——— B3: direction B re-seats EVERY twin ——— */
{
  const twins = [session("shared-1", "2026-11-01", T0 + 10), session("shared-1", "2026-11-03", T0 + 12)];
  const g = journalFromUnknown(
    { profile: { displayName: "Ana", createdAt: T0 }, settings: { language: "en" }, partners: ["Lucía"], sessions: twins, encounters: [], people: [OWNER, LUCIA], proposals: [], updatedAt: T0 + 30, deleted: { "shared-1": T0 + 40, "person-:shared-1": T0 + 40 } },
    "en",
  );
  check("B3 she dies by her witnessed tombstone", !(g.people ?? []).some((p) => p.name === "Lucía"));
  check("B3 both twin sessions survive", g.sessions.length === 2, `${g.sessions.length}`);
  check("B3 the twins seat distinctly", g.sessions.length === 2 && g.sessions[0].id !== g.sessions[1].id, g.sessions.map((s) => s.id).join(","));
  // At the merge the twins arrive on separate sides (one journal's
  // gate dedupes same-id records by law, so they can only meet here).
  const a = side({ deleted: { "shared-1": T0 + 40, "person-:shared-1": T0 + 40 }, sessions: [twins[0]] });
  const b = side({ people: [OWNER, LUCIA], sessions: [twins[1]] });
  const m = mergeJournals(a, b);
  check("B3 merge: both twins survive, distinctly seated", m.sessions.length === 2 && m.sessions[0].id !== m.sessions[1].id, m.sessions.map((s) => s.id).join(","));
}

/* ——— B6: a wiped "__proto__" proposal stays wiped ——— */
{
  const j = side({
    people: [OWNER, LUCIA],
    proposals: [{ id: "__proto__", kind: "delete-session", targetId: "s-x", proposedBy: "p-owner", proposedAt: T0 + 10, state: "pending", expiresAt: Date.now() + 90_000_000 }],
  });
  const wiped = wipedJournal(j, T0 + 50);
  check("B6 the wipe records the tombstone", Object.prototype.hasOwnProperty.call(wiped.deleted ?? {}, "__proto__") && (wiped.deleted ?? {})["__proto__"] === T0 + 50);
  const m = mergeJournals(wiped, j);
  check("B6 it stays wiped at the merge", !(m.proposals ?? []).some((p) => p.id === "__proto__"));
}

/* ——— B6b: a displaced "__proto__" person leaves both stamps ——— */
{
  // The hunter probe's crowd fixture displaced her at its own gate
  // (one partner seat), so she never reached the merge; the true
  // merge shape is two sides, one partner each, hers the later.
  const a = side({ people: [OWNER, { id: "__proto__", name: "Lucía", role: "partner" as const, createdAt: T0 + 25, updatedAt: T0 + 25 }] });
  const b = side({ people: [OWNER, SOFIA] });
  const m = mergeJournals(a, b);
  check("B6b she is displaced at the merge", !(m.people ?? []).some((p) => p.id === "__proto__"));
  check("B6b her tombstone is an own property", Object.prototype.hasOwnProperty.call(m.deleted ?? {}, "__proto__") && typeof (m.deleted ?? {})["__proto__"] === "number");
  check("B6b her witness is an own property", Object.prototype.hasOwnProperty.call(m.deleted ?? {}, "person-:__proto__"));
}

/* ——— Controls: the honest cases did not move ——— */
{
  const a = side({ deleted: { "shared-1": T0 + 40, "person-:shared-1": T0 + 40 } });
  const b = side({ people: [OWNER, LUCIA] });
  check("C1 a witnessed deletion executes at the merge", !(mergeJournals(a, b).people ?? []).some((p) => p.name === "Lucía"));
  const bare = side({ people: [OWNER, LUCIA], sessions: [session("shared-1", "2026-11-01", T0 + 10)], deleted: { "shared-1": T0 + 40 } });
  const g = journalFromUnknown(JSON.parse(JSON.stringify(bare)), "en");
  check("C2 a bare tombstone still cannot execute her at the gate", (g.people ?? []).some((p) => p.name === "Lucía" && p.id !== "shared-1"));
}

console.log(`WAVE23-WITNESS2: ${breaks} break(s), ${holds} hold(s)`);
if (breaks > 0) process.exitCode = 1;
