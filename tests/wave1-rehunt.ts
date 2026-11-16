/* Wave 1 re-hunt — a fresh prejudice pass over the NEW machinery, written
 * after the wave's fences went green. Fake data only. */
import { journalFromUnknown, mergeJournals, useJournal } from "../src/lib/vela/store";
import type { Journal } from "../src/lib/vela/types";

process.on("unhandledRejection", () => undefined);

let breaks = 0;
let holds = 0;
function hold(name: string) { holds += 1; console.log(`HOLD ${name}`); }
function brk(name: string, extra = "") { breaks += 1; console.log(`BREAK ${name}${extra ? " — " + extra : ""}`); }

const DAY = 86400000;
const T = 1_760_000_000_000;

function rawJournal(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    profile: { displayName: "Ana", createdAt: T - 30 * DAY },
    settings: { language: "en" },
    partners: ["Lucía", "Marco"],
    sessions: [],
    encounters: [],
    updatedAt: T,
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

/* ── R1. Forever-delete vs the merge: her anniversary and archive entry
 *        must not resurrect from a stale device ── */
{
  seed({
    people: [
      { id: "p-owner", name: "Ana", role: "owner", createdAt: T - 30 * DAY, updatedAt: T - 30 * DAY },
      { id: "p-lucia", name: "Lucía", role: "partner", createdAt: T - 30 * DAY, updatedAt: T - 30 * DAY },
    ],
    settings: { language: "en",
      anniversaries: [{ id: "a-lucia", label: "First trip", monthDay: "06-01", kind: "custom", milestone: false, personName: "Lucía", createdAt: T - 20 * DAY }],
      archivedPeople: [{ name: "Lucía", archivedAt: T - 20 * DAY, showInHistory: false, countInStats: false, resurface: false }] },
  });
  S().deletePersonForever("Lucía");
  const after = J();
  const stale = journalFromUnknown(rawJournal({
    updatedAt: T + 5000,
    settings: { language: "en",
      anniversaries: [{ id: "a-lucia", label: "First trip", monthDay: "06-01", kind: "custom", milestone: false, personName: "Lucía", createdAt: T - 20 * DAY }],
      archivedPeople: [{ name: "Lucía", archivedAt: T - 20 * DAY, showInHistory: false, countInStats: false, resurface: false }] },
  }), "en");
  const m = mergeJournals(after, stale);
  const annivBack = (m.settings.anniversaries ?? []).some((a) => a.id === "a-lucia");
  const archBack = (m.settings.archivedPeople ?? []).some((p) => p.name === "Lucía");
  if (!annivBack && !archBack) hold("R1 the forever-delete is merge-proof for anniversaries and the archive");
  else brk("R1 the merge resurrected forever-deleted settings data", `anniversary=${annivBack} archived=${archBack}`);
}

/* ── R2. The gate honors a person tombstone before resolving the couple ── */
{
  const j = journalFromUnknown(rawJournal({
    people: [
      { id: "p-owner", name: "Ana", role: "owner", createdAt: 100, updatedAt: 100 },
      { id: "p-sofia", name: "Sofía", role: "partner", createdAt: 150, updatedAt: 150 },
      { id: "p-lucia", name: "Lucía", role: "partner", createdAt: 200, updatedAt: 200 },
    ],
    deleted: { "p-sofia": T },
  }), "en");
  const ids = (j.people ?? []).map((p) => p.id).join();
  if (ids === "p-owner,p-lucia") hold("R2 a tombstoned person loses her seat at the gate; the next in ceremony order takes it");
  else brk("R2 the gate seated a tombstoned person", ids);
}

/* ── R3. Stamps stay monotone when the journal's max lives in `deleted` ── */
{
  seed({
    deleted: { "some-old-id": T + 5000 },
    settings: { language: "en", cycles: [{ id: "c1", enabled: true, starts: ["2026-01-05"], ends: {}, days: {}, stamps: { "s:2026-01-05": T }, updatedAt: T, metaAt: T }] },
  });
  const realNow = Date.now;
  Date.now = () => T - 100000;
  try { S().removePeriodStart("2026-01-05", "c1"); } finally { Date.now = realNow; }
  const stamp = J().settings.cycles[0].stamps["s:2026-01-05"] ?? 0;
  if (stamp > T + 5000) hold("R3 the removal stamp clears even a max that lives only in the tombstones");
  else brk("R3 stamp minted below the journal's own maximum", String(stamp));
}

/* ── R4. Forever-delete of a name-only partner (no Person record) ── */
{
  seed({
    sessions: [{ id: "s-1", date: "2026-11-02", time: "21:00", partnerName: "Lucía", place: "Cabin", durationMins: 40, positions: [], intensity: 4, connection: 4, satisfaction: 4, energy: 4, overall: 4, notes: "", ownWords: "", sessionNumber: 1, encounterId: "", createdAt: T - 10 * DAY }],
    settings: { language: "en", cycles: [{ id: "t-name", enabled: true, perspective: "partner", partnerName: "Lucía", partnerLink: "", starts: ["2026-10-07"], ends: {}, days: {}, stamps: {}, updatedAt: T, metaAt: T }] },
  });
  S().deletePersonForever("Lucía");
  const j = J();
  if (!j.partners.includes("Lucía") && !j.sessions.length && !j.settings.cycles.some((t) => t.id === "t-name"))
    hold("R4 the cascade works without a Person record (name-keyed data still goes)");
  else brk("R4 name-only cascade left residue", `partners=${j.partners} sessions=${j.sessions.length}`);
}

console.log(`\nWAVE1-REHUNT: ${breaks} breaks, ${holds} holds`);
if (breaks > 0) process.exitCode = 1;
