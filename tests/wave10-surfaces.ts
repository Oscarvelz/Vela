/* WAVE10-SURFACES — Round 2 Wave 6 (2.2.33): the surfaces, the gate and
 * the doors. One identity law (partnerKey) at every roster door; the gate
 * loads facts and never rewrites them; exports are safe to open; the
 * statistics read through the Archive selectors on every surface; the
 * manual's doors land and its where-lines name places that exist.
 *
 * Specimens (parent-verified in the Round 2 hunt):
 *  - RT2-H4 B1: InsightsView read journal.encounters RAW (bars, years,
 *    spans) and CycleStats ran sessionsByPhaseFor over raw cycles and
 *    sessions — an archived person with Statistics OFF still counted.
 *  - RT2-H4 B5: roster identity ignored partnerKey at addPartner, the
 *    load gate and the merge — "Lucía" + "lucía" = two permanent rows
 *    (case variants; the accent law is untouched: Lucia ≠ Lucía).
 *  - RT2-H4 B6: proposal dedupe compared raw labels — the same session
 *    proposed from an EN phone and an ES phone duplicated in Decisions.
 *  - RT2-H4 B7: csvText emitted formula-leading cells verbatim.
 *  - RT2-H6-4: cleanPeople deduped on the raw id but stored
 *    id.slice(0, 40) — two ids sharing a 40-char prefix collapsed to
 *    one stored id; the merge then kept one person and lost the other.
 *  - RT2-H6-5: cleanChildren never validated dates ("2021-13-40"
 *    stored, later served as an upcoming birthday).
 *  - RT2-H6-6: the load gate re-derived a session's place from its
 *    notes on every unlock ("Cabin" + notes mention "the trailer" →
 *    place became "Trailer"; the user edits it back, the gate rewrites
 *    it again). The encounter-comment inheritance had the same shape.
 *  - RT2-H6-7: asSession stringified junk positions ("[object Object]").
 *  - RT2-H6-8: cleanTrackers was not idempotent under duplicate ids
 *    (the "x" suffix pushed ids past the 40-char validity band, so the
 *    next gate pass renamed them again — ids and order shifted).
 *  - RT2-H5 B2'/B3': SpotFocus kill() could not cancel the in-flight
 *    poll/settle intervals (rings resurrected after dismissal), and the
 *    settle loop's cap never fired while measure() returned null.
 *  - RT2-H5 B4': the registrar's door never raised the log form
 *    (goToGo raised the batch card but not showForm) — the ring's
 *    target sat hidden behind its toggle.
 *  - RT2-H5 B5': [[Settings]]/[[Home]]/[[Calendar]] name-ref doors
 *    could never ring: the link's own spot-less go shadowed the
 *    destination topic's go in manual-view's onLink.
 *  - RT2-H5 B6': manual where-lines named a "Data & sync" section that
 *    no longer exists (it is "Data & Backup" / "Datos y copias"), a
 *    "Privacy" section (it is "Privacy & Security"), and a bare
 *    "Settings → Manual" path (tray Help & the app → User manual).
 *
 * Fake data only. Run: node ../run-ts-test.mjs tests/wave10-surfaces.ts */
const g = globalThis as Record<string, unknown>;
if (typeof g.window === "undefined") g.window = g;
process.on("unhandledRejection", () => undefined);

import { readFileSync } from "node:fs";
const { journalFromUnknown, mergeJournals, useJournal, csvText } = await import("../src/lib/vela/store");
const { cleanChildren } = await import("../src/lib/vela/anniversaries");
const { cleanPeople } = await import("../src/lib/vela/people");
const { cleanTrackers } = await import("../src/lib/vela/cycle-trackers");
import type { Journal } from "../src/lib/vela/types";

let breaks = 0;
let holds = 0;
const brk = (name: string, extra = "") => { breaks += 1; console.log(`BREAK ${name}${extra ? " — " + extra : ""}`); };
const hold = (name: string) => { holds += 1; console.log(`HOLD  ${name}`); };
const judge = (name: string, ok: boolean, extra = "") => (ok ? hold(name) : brk(name, extra));

const session = (over: Record<string, unknown> = {}) => ({
  id: "s1", createdAt: 100, partnerName: "Ana", date: "2026-10-25", time: "21:00",
  place: "Cabin", durationMins: 30, positions: [], intensity: 0, connection: 0,
  satisfaction: 0, energy: 0, overall: 0, notes: "", ownWords: "",
  contraception: [], problems: [], sessionNumber: 1, encounterId: "",
  ...over,
});

/* S1 — the gate does not re-derive place from notes (H6-6) */
{
  const j = journalFromUnknown({ sessions: [session({ notes: "we parked the trailer by the lake" })], encounters: [] });
  judge("S1 gate keeps the stored place against the notes", j.sessions[0]?.place === "Cabin", `place=${j.sessions[0]?.place}`);
}
/* S1b — nor from an encounter's comment */
{
  const j = journalFromUnknown({
    sessions: [session({ encounterId: "e1" })],
    encounters: [{ id: "e1", createdAt: 90, title: "Trip", startDate: "2026-10-24", endDate: "2026-10-26", partnerName: "Ana", comment: "the trailer by the lake", problems: [] }],
  });
  judge("S1b gate keeps the stored place against the encounter comment", j.sessions[0]?.place === "Cabin", `place=${j.sessions[0]?.place}`);
}
/* S2 — children dates are real dates (H6-5) */
{
  const kids = cleanChildren([
    { id: "k1", name: "Marta", birthdate: "2021-13-40", refAs: "daughter", createdAt: 1 },
    { id: "k2", name: "Fake", birthdate: "2021-02-30", refAs: "child", createdAt: 2 },
    { id: "k3", name: "Real", birthdate: "2021-03-04", refAs: "son", createdAt: 3 },
  ]);
  judge("S2 impossible birthdates are dropped, real ones kept", kids.length === 1 && kids[0].id === "k3", JSON.stringify(kids.map((k) => k.id)));
}
/* S3 — people ids never collide at the truncation line (H6-4) */
{
  const prefix = "p" + "a".repeat(39); // 40 chars
  const raw = [
    { id: prefix + "1", name: "Ana", role: "owner", createdAt: 1, updatedAt: 1 },
    { id: prefix + "2", name: "Lucía", role: "partner", createdAt: 2, updatedAt: 2 },
  ];
  const once = cleanPeople(raw);
  const ids = once.map((p) => p.id);
  judge("S3 stored people ids are unique", new Set(ids).size === ids.length, JSON.stringify(ids));
  const twice = cleanPeople(once);
  judge("S3b cleanPeople is idempotent", JSON.stringify(twice) === JSON.stringify(once));
}
/* S4 — trackers: duplicate ids resolve inside the validity band (H6-8) */
{
  const long = "t".repeat(40);
  const rawCycles: unknown[] = [];
  for (let i = 0; i < 45; i++) rawCycles.push({ id: "twin", starts: [], ends: {}, days: {} });
  for (let i = 0; i < 3; i++) rawCycles.push({ id: long, starts: [], ends: {}, days: {} });
  const once = cleanTrackers(rawCycles, undefined);
  const ids = once.map((t) => t.id);
  judge("S4 tracker ids unique and within the band", new Set(ids).size === ids.length && ids.every((id) => id.length <= 40), `${ids.length} trackers`);
  const twice = cleanTrackers(once, undefined);
  judge("S4b cleanTrackers is idempotent", JSON.stringify(twice.map((t) => t.id)) === JSON.stringify(ids),
    `pass1 last=${ids[ids.length - 1]} pass2 last=${twice[twice.length - 1]?.id}`);
}
/* S5 — junk positions are filtered, not stringified (H6-7) */
{
  const j = journalFromUnknown({ sessions: [session({ positions: [{ x: 1 }, "Lotus", 7, null, "Butterfly"] })], encounters: [] });
  judge("S5 positions keep only real strings", JSON.stringify(j.sessions[0]?.positions) === JSON.stringify(["Lotus", "Butterfly"]),
    JSON.stringify(j.sessions[0]?.positions));
}
/* S6 — CSV cells cannot wake as formulas (H4-B7) */
{
  const j = journalFromUnknown({
    sessions: [session({ partnerName: "=2+5", notes: "@SUM(A1:A9)", ownWords: "+cmd", partnerVoice: { intensity: 1, connection: 1, satisfaction: 1, energy: 1, overall: 1, ownWords: "-2+3", notes: "", by: "p-owner", at: 5 } })],
    encounters: [],
  });
  const csv = csvText(j);
  judge("S6 formula-leading cells are neutralized",
    !csv.includes('"=2+5"') && !csv.includes('"@SUM') && !csv.includes('"+cmd"') && !csv.includes('"-2+3"') && csv.includes("'=2+5"),
    csv.split("\n")[1]?.slice(0, 60) ?? "");
}
/* S7 — proposal dedupe is the target's id, never its label (H4-B6) */
{
  const base = journalFromUnknown({});
  const j: Journal = { ...base, partners: ["Ana"], people: [{ id: "p-owner", name: "Ana", role: "owner", createdAt: 1, updatedAt: 1 }], proposals: [] };
  useJournal.setState({ journal: j });
  const a = useJournal.getState().proposeDeletion({ kind: "delete-session", targetId: "s1", targetLabel: "Oct 25 · Ana" }, "p-owner");
  const b = useJournal.getState().proposeDeletion({ kind: "delete-session", targetId: "s1", targetLabel: "25 de oct · Ana" }, "p-owner");
  const pending = (useJournal.getState().journal.proposals ?? []).filter((p) => p.state === "pending");
  judge("S7 the same session proposed in two languages is one proposal", a === b && pending.length === 1, `a=${a} b=${b} pending=${pending.length}`);
}
/* S8 — addPartner speaks partnerKey (H4-B5) */
{
  const base = journalFromUnknown({});
  useJournal.setState({ journal: { ...base, partners: ["Lucía"] } });
  useJournal.getState().addPartner("lucía");
  const partners = useJournal.getState().journal.partners;
  judge("S8 a case variant does not twin the roster", partners.length === 1 && partners[0] === "Lucía", JSON.stringify(partners));
}
/* S9 — the gate roster speaks partnerKey too */
{
  const j = journalFromUnknown({ partners: ["Lucía", "lucía", "LUCÍA"], sessions: [session({ partnerName: "lucía" })], encounters: [] });
  judge("S9 gate roster holds one row per person", j.partners.length === 1, JSON.stringify(j.partners));
}
/* S10 — and the merge */
{
  const a = journalFromUnknown({ partners: ["Lucía"], updatedAt: 10 });
  const b = journalFromUnknown({ partners: ["lucía"], updatedAt: 20 });
  const merged = mergeJournals(a, b);
  judge("S10 merge roster holds one row per person", merged.partners.filter((p) => p.toLocaleLowerCase() === "lucía").length === 1, JSON.stringify(merged.partners));
}
/* S11–S16 — surface shapes (static fences, the wave5-hooks precedent) */
const read = (p: string) => readFileSync(p, "utf8");
{
  const insights = read("src/components/vela/insights-view.tsx");
  judge("S11 Insights reads encounters through the Archive selector", insights.includes('visibleEncounters(journal, "stats")'));
  const card = read("src/components/vela/cycle-card.tsx");
  judge("S12 CycleStats reads through the Archive selectors", card.includes("countedTrackers(journal)") && card.includes('visibleSessions(journal, "stats")'));
  const nav = read("src/lib/vela/manual-nav.ts");
  judge("S13 the registrar's door raises the log form", nav.includes('go.spot === "log-form"') && nav.includes("setShowForm(true)"));
  const manual = read("src/lib/vela/manual.ts");
  judge("S14 where-lines name sections that exist",
    !manual.includes("Data & sync") && !manual.includes("Datos y sincronización") && manual.includes("Data & Backup") && manual.includes("Datos y copias") && manual.includes("Privacy & Security") && manual.includes("Help & the app → User manual"));
  const view = read("src/components/vela/manual-view.tsx");
  judge("S15 name-ref doors inherit the topic's spot on the same surface", view.includes("sameSurface"));
  const spot = read("src/components/vela/spot-focus.tsx");
  judge("S16 SpotFocus kill cancels the poll and the settle", spot.includes("pollRef") && spot.includes("settleRef"));
}

console.log(`WAVE10-SURFACES: ${breaks} break(s), ${holds} hold(s)`);
if (breaks) process.exitCode = 1;
