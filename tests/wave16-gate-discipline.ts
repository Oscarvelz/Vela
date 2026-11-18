/* WAVE16-GATE-DISCIPLINE — Round 3 Wave 6 (2.2.39): surfaces and gate
 * discipline (RT3-H4 B1/B2, RT3-H5 B1″/B2″, RT3-H6 B3/B4/B5, RT3-H5
 * L4). The default partner is a claim about the roster and is judged
 * by partnerKey at every door; the archive gate dedupes by key like
 * the merge; empty ids are refused like every sibling class; a
 * tombstone written for one class can no longer execute a person who
 * shares its foreign id; a truncated-id collision keeps the owner;
 * the wiped journal's active tracker is one stored shape; and the
 * manual names only controls that exist, with a last-resort landing
 * behind every tab door. Fake data only.
 * Run: node ../run-ts-test.mjs tests/wave16-gate-discipline.ts */
import { readFileSync } from "node:fs";
import { journalFromUnknown, mergeJournals, useJournal } from "../src/lib/vela/store";
import { cleanPeople } from "../src/lib/vela/people";
import { cleanArchived } from "../src/lib/vela/anniversaries";
import { selectActiveCycle } from "../src/lib/vela/store";
import { wipedJournal } from "../src/lib/vela/wipe";
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
const OWNER = { id: "p-owner", name: "Ana", role: "owner", createdAt: now - 60 * DAY, updatedAt: now - 60 * DAY };

function side(roster: string[], def: string, updatedAt: number): Journal {
  return journalFromUnknown(
    {
      profile: { displayName: "Ana", createdAt: now - 60 * DAY },
      settings: { language: "en", weekStart: "mon", defaultPartner: def },
      partners: roster,
      sessions: [],
      encounters: [],
      people: [OWNER],
      updatedAt,
    },
    "en",
  );
}

/* ——— B1: the default partner, judged by key ——— */
{
  const m1 = mergeJournals(side(["Lucía"], "", 10_000), side(["lucía"], "lucía", 20_000));
  check("B1 M1 merge keeps the default in the winning spelling", m1.settings.defaultPartner === "Lucía", `default=${JSON.stringify(m1.settings.defaultPartner)} roster=${JSON.stringify(m1.partners)}`);
  const m2 = mergeJournals(side(["Lucía"], "", 10_000), side(["lucía"], "Lucía", 20_000));
  check("B1 M2 control (winning spelling stated)", m2.settings.defaultPartner === "Lucía");
  const m3 = mergeJournals(side(["Lucía"], "Lucía", 10_000), side(["lucía"], "", 20_000));
  check("B1 M3 control (older side's default)", m3.settings.defaultPartner === "Lucía");
  const g = side(["Lucía"], "lucía", 30_000);
  check("B1 G1 gate canonicalizes the default to the roster spelling", g.settings.defaultPartner === "Lucía", `default=${JSON.stringify(g.settings.defaultPartner)}`);
  const form = readFileSync("src/components/vela/session-form.tsx", "utf8");
  check("B1 form preselect is keyed (source)", !form.includes("partners.includes(defaultPartner)") && !form.includes("journal.partners.includes(defaultPartner)"), "raw includes() guard still present");
  const settings = readFileSync("src/components/vela/settings-view.tsx", "utf8");
  check("B1 settings chip is keyed (source)", settings.includes("samePartner(defaultPartner, partner)"), "chip comparison is exact-string");
}

/* ——— B2: the archive gate dedupes by key ——— */
{
  const twins = cleanArchived([
    { name: "Lucía", archivedAt: 100, showInHistory: false, countInStats: false, resurface: false },
    { name: "lucía", archivedAt: 200, showInHistory: true, countInStats: true, resurface: false },
  ]);
  check("B2 foreign twins seat one row", twins.length === 1, `rows=${twins.length}`);
  check("B2 the later archive stamp wins the row", twins[0]?.archivedAt === 200 && twins[0]?.showInHistory === true);
}

/* ——— B3: empty ids refused ——— */
{
  const j = journalFromUnknown(
    {
      profile: { displayName: "Ana", createdAt: now - 60 * DAY },
      settings: { language: "en", weekStart: "mon" },
      partners: ["Ana"],
      sessions: [
        { id: "", date: "2026-10-25", partnerName: "Ana" },
        { id: "", date: "2026-10-26", partnerName: "Lucía" },
      ],
      encounters: [{ id: "", startDate: "2026-10-25", endDate: "2026-10-25" }],
      people: [OWNER],
      updatedAt: 5_000,
    },
    "en",
  );
  check("B3 two empty-id sessions survive as two records", j.sessions.length === 2 && j.sessions[0].id !== "" && j.sessions[0].id !== j.sessions[1].id, `sessions=${JSON.stringify(j.sessions.map((s) => s.id))}`);
  check("B3 empty-id encounter is re-id'd", j.encounters.length >= 1 && j.encounters.every((e) => e.id !== ""), JSON.stringify(j.encounters.map((e) => e.id)));
}

/* ——— B5: a truncated-id collision keeps the owner ——— */
{
  const long = "x".repeat(45);
  const partnerFirst = cleanPeople([
    { id: `${long}partner`, name: "Lucía", role: "partner", createdAt: 1, updatedAt: 1 },
    { id: `${long}ownerx`, name: "Ana", role: "owner", createdAt: 1, updatedAt: 1 },
  ]);
  check("B5 partner-first order keeps the owner", partnerFirst.length === 1 && partnerFirst[0].role === "owner", JSON.stringify(partnerFirst.map((p) => p.role)));
  const ownerFirst = cleanPeople([
    { id: `${long}ownerx`, name: "Ana", role: "owner", createdAt: 1, updatedAt: 1 },
    { id: `${long}partner`, name: "Lucía", role: "partner", createdAt: 1, updatedAt: 1 },
  ]);
  check("B5 owner-first order keeps the owner (control)", ownerFirst.length === 1 && ownerFirst[0].role === "owner");
}

/* ——— B4: a session's tombstone cannot execute a person ——— */
{
  const raw = {
    profile: { displayName: "Ana", createdAt: now - 60 * DAY },
    settings: { language: "en", weekStart: "mon" },
    partners: ["Lucía"],
    sessions: [{ id: "shared-1", date: "2026-10-25", partnerName: "Lucía" }],
    encounters: [],
    people: [OWNER, { id: "shared-1", name: "Lucía", role: "partner", createdAt: now - 50 * DAY, updatedAt: now - 50 * DAY }],
    updatedAt: 5_000,
  };
  // The gate path: the tombstone arrives already written (sync/restore).
  const gated = journalFromUnknown({ ...raw, deleted: { "shared-1": now } }, "en");
  check("B4 gate: the person survives a foreign collision tombstone", gated.people.some((p) => p.name === "Lucía"), JSON.stringify(gated.people.map((p) => p.name)));
  check("B4 gate: her references were re-seated, not orphaned", gated.people.find((p) => p.name === "Lucía")?.id !== "shared-1");
  // The action path: delete the session through the real store action.
  const loaded = journalFromUnknown(raw, "en");
  useJournal.setState({ journal: loaded, unlocked: true });
  useJournal.getState().deleteSession("shared-1");
  const after = useJournal.getState().journal;
  check("B4 action: the session is deleted", !after.sessions.some((s) => s.id === "shared-1"));
  check("B4 action: the person survives her session's deletion", after.people.some((p) => p.name === "Lucía"), JSON.stringify(after.people.map((p) => p.name)));
  const regated = journalFromUnknown(JSON.parse(JSON.stringify(after)), "en");
  check("B4 action: she survives the re-gate too", regated.people.some((p) => p.name === "Lucía"));
  // Control — AMENDED in Round 4 (2.2.41), correction stated: this
  // specimen originally asserted a person-only tombstone executes.
  // RT4-H1 B2 proved the same bare shape is also a session's
  // tombstone whose session already died on its own device, and a
  // flat stamp cannot tell the two apart. What CAN is the
  // partner-off witness: the app's person-deletion door has minted
  // it beside her id tombstone since 2.2.26, so a tombstone with
  // the witness is provably hers and executes; one without it
  // cannot prove its class, and the tombstone keeps only the
  // meaning it can prove — she is re-seated. A legacy (pre-witness)
  // person deletion is the accepted cost: she returns re-seated
  // and can be deleted again, now with the witness; an execution
  // by a session's tombstone would be silent and final.
  const ctrl = journalFromUnknown({ ...raw, sessions: [], deleted: { "shared-1": now } }, "en");
  check("B4 control (amended): a witness-less person-only tombstone cannot prove its class — she is re-seated", ctrl.people.some((p) => p.name === "Lucía" && p.id !== "shared-1"));
  const ctrlW = journalFromUnknown({ ...raw, sessions: [], deleted: { "shared-1": now, "partner-:lucía": now } }, "en");
  check("B4 control (amended): with the partner-off witness, a person-only tombstone still removes her", !ctrlW.people.some((p) => p.name === "Lucía"));
}

/* ——— L4: the wiped journal's active tracker is a stored shape ——— */
{
  const base = side(["Ana"], "", 1_000);
  const wiped = wipedJournal(base, now);
  const a = selectActiveCycle({ journal: wiped });
  const b = selectActiveCycle({ journal: wiped });
  check("L4 selectActiveCycle returns the same object on a wiped journal", a === b);
}

/* ——— B1″/B2″: manual names and door landings ——— */
{
  const manual = readFileSync("src/lib/vela/manual.ts", "utf8");
  check("B1″ no text names the batch door 'Registrar un lote'", !manual.includes("Registrar un lote"));
  check("B1″ historias names the real section", manual.includes("Hidden memories") && manual.includes("Recuerdos ocultos"));
  const nav = readFileSync("src/lib/vela/manual-nav.ts", "utf8");
  check("B2″ home doors carry a last-resort landing", nav.includes('"home-top"'));
  check("B2″ history doors carry a last-resort landing", nav.includes('"hist-search"'));
  const home = readFileSync("src/components/vela/home-view.tsx", "utf8");
  check("B2″ the home-top spot exists", home.includes('data-spot="home-top"'));
}

console.log(`WAVE16-GATE-DISCIPLINE: ${breaks} break(s), ${holds} hold(s)`);
if (breaks > 0) process.exitCode = 1;
