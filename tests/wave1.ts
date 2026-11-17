/* Wave 1 fences — testimony and identity survive (prejudice hunt V1 B-1/B-2/
 * B-4/B-4-M, V3-02/03/04/08/09/10/11, V4 B3/B4/B7/B10/B11).
 * Every BREAK below was watched failing on 2.2.22 before the fix.
 * Fake data only (Ana / Lucía / Sofía / Marco; Cabin / Beach house / Hotel). */
import { readFileSync } from "node:fs";
import { pregnancyNoted, withStart } from "../src/lib/vela/cycle";
import { cleanTracker, mergeTracker } from "../src/lib/vela/cycle-trackers";
import { cleanPeople, mergePeople } from "../src/lib/vela/people";
import { journalFromUnknown, mergeJournals, partnerRemoved, useJournal } from "../src/lib/vela/store";
import type { Journal, Person } from "../src/lib/vela/types";

process.on("unhandledRejection", () => undefined);

let breaks = 0;
let holds = 0;
function hold(name: string) { holds += 1; console.log(`HOLD ${name}`); }
function brk(name: string, extra = "") { breaks += 1; console.log(`BREAK ${name}${extra ? " — " + extra : ""}`); }

const DAY = 86400000;
const T = 1_760_000_000_000;
const now = Date.now();

function rawJournal(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    profile: { displayName: "Ana", createdAt: T - 30 * DAY },
    settings: { language: "en" },
    partners: ["Lucía"],
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
const session = (id: string, partnerName: string, extra: Record<string, unknown> = {}) => ({
  id, date: "2026-11-02", time: "21:00", partnerName, place: "Cabin", durationMins: 40, positions: [],
  intensity: 4, connection: 4, satisfaction: 4, energy: 4, overall: 4, notes: "", ownWords: "",
  sessionNumber: 1, encounterId: "", createdAt: T - 10 * DAY, ...extra,
});

/* ── S1. The r: stamp survives the gate (V1 B-1) ── */
{
  const tr = cleanTracker({
    id: "c1", enabled: true, starts: ["2026-01-05"], ends: {}, days: {},
    reasons: { "2026-01-05": { id: "stress", at: T } },
    stamps: { "s:2026-01-05": T, "r:2026-01-05": T }, updatedAt: T, metaAt: T,
  });
  if (tr.stamps["r:2026-01-05"] === T) hold("S1a cleanTracker admits the r: stamp");
  else brk("S1a cleanTracker strips the r: stamp", JSON.stringify(tr.stamps));
  const j = seed({ settings: { language: "en", cycles: [{
    id: "c1", enabled: true, starts: ["2026-01-05"], ends: {}, days: {},
    reasons: { "2026-01-05": { id: "stress", at: T } },
    stamps: { "s:2026-01-05": T, "r:2026-01-05": T }, updatedAt: T, metaAt: T,
  }] } });
  const loaded = j.settings.cycles[0];
  if (loaded.stamps["r:2026-01-05"] === T && loaded.reasons?.["2026-01-05"]?.id === "stress")
    hold("S1b a full reload keeps the reason AND its stamp");
  else brk("S1b reload lost the reason or its stamp", JSON.stringify(loaded.stamps));
}

/* ── S2. Reasons resolve by their own stamp (V3-06) ── */
{
  const base = { id: "c1", enabled: true, starts: ["2026-01-05"], ends: {}, days: {} };
  const a = cleanTracker({ ...base, reasons: { "2026-01-05": { id: "stress", at: 9000 } }, stamps: { "s:2026-01-05": 1000, "r:2026-01-05": 9000 }, updatedAt: 2000, metaAt: 2000 });
  const b = cleanTracker({ ...base, reasons: { "2026-01-05": { id: "dismissed", at: 2000 } }, stamps: { "s:2026-01-05": 1000, "r:2026-01-05": 2000 }, updatedAt: 9000, metaAt: 9000 });
  const m = mergeTracker(a, b);
  if (m.reasons?.["2026-01-05"]?.id === "stress" && m.stamps["r:2026-01-05"] === 9000)
    hold("S2 the newer answer wins by its own stamp, and the stamp survives the merge");
  else brk("S2 the older dismissal beat the newer answer", `reason=${m.reasons?.["2026-01-05"]?.id} stamp=${m.stamps["r:2026-01-05"]}`);
}

/* ── S3. Reasons travel with their start (V3-02/03) ── */
{
  const cyc = { enabled: true, perspective: "self" as const, partnerName: "", periodDays: 5, cycleDays: 28, lutealDays: 14, fertileDays: 5,
    starts: ["2026-09-21"], ends: { "2026-09-21": "2026-09-26" }, days: {}, reasons: { "2026-09-21": { id: "pregnant" as const, at: T } } };
  const moved = withStart(cyc, "2026-09-24");
  if (moved.reasons?.["2026-09-24"]?.id === "pregnant" && pregnancyNoted(moved, "2026-09-24"))
    hold("S3a a corrected start carries its pregnancy reason — the projection still knows");
  else brk("S3a correcting a start killed its reason", JSON.stringify(moved.reasons));
  if (moved.ends["2026-09-24"] === "2026-09-26") hold("S3b the end still carries (pre-existing behavior)");
  else brk("S3b the end carry regressed");
  const dis = withStart({ ...cyc, reasons: { "2026-09-21": { id: "dismissed" as const, at: T } } }, "2026-09-24");
  if (dis.reasons?.["2026-09-24"]?.id === "dismissed") hold("S3c a dismissal travels too — the question does not resurrect");
  else brk("S3c the dismissal died with the replaced start");
}

/* ── S4. Undo restores testimony (V3-04) ── */
{
  seed({ settings: { language: "en", cycles: [{ id: "c1", enabled: true, starts: ["2026-09-21"], ends: {}, days: {}, reasons: { "2026-09-21": { id: "pregnant", at: T } }, stamps: {}, updatedAt: T, metaAt: T }] } });
  S().logPeriodStart("2026-09-24");
  S().restoreCycleDates({ id: "c1", starts: ["2026-09-21"], ends: {}, reasons: { "2026-09-21": { id: "pregnant", at: T } } });
  const tr = J().settings.cycles[0];
  if (tr.starts.includes("2026-09-21") && tr.reasons?.["2026-09-21"]?.id === "pregnant")
    hold("S4 Undo restores the reason with the starts");
  else brk("S4 Undo restored the dates but not the testimony", `starts=${tr.starts} reasons=${JSON.stringify(tr.reasons)}`);
}

/* ── S5. Monotone stamps: a back-set clock cannot un-remove (V3-08) ── */
{
  seed({ settings: { language: "en", cycles: [{ id: "c1", enabled: true, starts: ["2026-01-05"], ends: {}, days: {}, stamps: { "s:2026-01-05": T }, updatedAt: T, metaAt: T }] } });
  const before = J().settings.cycles[0];
  const realNow = Date.now;
  Date.now = () => T - 100000;
  try { S().removePeriodStart("2026-01-05", "c1"); } finally { Date.now = realNow; }
  const after = J().settings.cycles[0];
  const merged = mergeTracker(before, after);
  if (!merged.starts.includes("2026-01-05") && (after.stamps["s:2026-01-05"] ?? 0) > T)
    hold("S5 the removal was stamped newer than the addition, clock or no clock");
  else brk("S5 the back-set clock resurrected a removed start", `removal stamp=${after.stamps["s:2026-01-05"]} merged starts=${merged.starts}`);
}

/* ── S6. Settings-borne classes merge per item (V1 B-4) ── */
{
  const older = journalFromUnknown(rawJournal({
    updatedAt: T,
    settings: { language: "en",
      anniversaries: [{ id: "a-old", label: "First trip", monthDay: "06-01", kind: "custom", milestone: false, createdAt: T }],
      children: [{ id: "k-old", name: "Marta", birthdate: "2024-03-01", refAs: "daughter", createdAt: T }],
      customPlaces: ["Beach house"], storiesMuted: { people: ["Sofía"], days: [] },
      archivedPeople: [{ name: "Sofía", archivedAt: T, showInHistory: false, countInStats: false, resurface: false }] },
  }), "en");
  const newer = journalFromUnknown(rawJournal({
    updatedAt: T + 1000,
    settings: { language: "en",
      anniversaries: [{ id: "a-new", label: "Wedding", monthDay: "09-15", kind: "married", milestone: true, createdAt: T + 1000 }],
      children: [{ id: "k-new", name: "Lucas", birthdate: "2026-01-20", refAs: "son", createdAt: T + 1000 }],
      customPlaces: ["Hotel"], storiesMuted: { people: ["Marco"], days: [] },
      archivedPeople: [{ name: "Marco", archivedAt: T + 1000, showInHistory: false, countInStats: false, resurface: false }] },
  }), "en");
  const m = mergeJournals(older, newer);
  const checks: [string, boolean][] = [
    ["anniversaries union", (m.settings.anniversaries ?? []).map((a) => a.id).sort().join() === "a-new,a-old"],
    ["children union", (m.settings.children ?? []).map((c) => c.id).sort().join() === "k-new,k-old"],
    ["customPlaces union", [...m.settings.customPlaces].sort().join() === "Beach house,Hotel"],
    ["storiesMuted union", [...(m.settings.storiesMuted?.people ?? [])].sort().join() === "Marco,Sofía"],
    ["archivedPeople union", (m.settings.archivedPeople ?? []).map((p) => p.name).sort().join() === "Marco,Sofía"],
  ];
  const failed = checks.filter(([, ok]) => !ok).map(([n]) => n);
  if (!failed.length) hold("S6 every settings-borne class survives a merge from both sides");
  else brk("S6 merge lost settings-borne data", failed.join(", "));
}

/* ── S7. importBackup restores the MERGED settings (V1 B-4-M, source fence) ── */
{
  const src = readFileSync("src/lib/vela/store.ts", "utf8");
  const start = src.indexOf("importBackup: async");
  const body = src.slice(start, src.indexOf("shiftMonth:", start));
  if (!body.includes("settings: current.settings") && body.includes("profile: current.profile"))
    hold("S7 importBackup commits the merged settings; only the profile is forced");
  else brk("S7 importBackup still overrides the merged settings with the current ones");
}

/* ── S8. mergeJournals never zeroes a side (V1 B-2) ── */
{
  const local = journalFromUnknown(rawJournal({ profile: undefined, updatedAt: T + 1000, sessions: [session("s-local", "Lucía")] }), "en");
  const remote = journalFromUnknown(rawJournal({ updatedAt: T, sessions: [session("s-remote", "Lucía")] }), "en");
  const m = mergeJournals(local, remote);
  const ids = m.sessions.map((s) => s.id).sort().join();
  if (m.profile?.displayName === "Ana" && ids === "s-local,s-remote")
    hold("S8 a profile-less side contributes everything; the profile comes from the side that has one");
  else brk("S8 the profile-less side was zeroed", `profile=${m.profile?.displayName} sessions=${ids}`);
}

/* ── S9. The delete cascade learns ids (V4 B3/B4/B10/B11, V3-11) ── */
{
  seed({
    partners: ["Lucía", "Marco"],
    people: [
      { id: "p-owner", name: "Ana", role: "owner", createdAt: T - 30 * DAY, updatedAt: T - 30 * DAY },
      { id: "p-lucia", name: "Lucía", role: "partner", pin: { salt: "c2FsdA==", hash: "aGFzaA==", iterations: 150000 }, createdAt: T - 30 * DAY, updatedAt: T - 30 * DAY },
    ],
    sessions: [
      session("s-lucia", "Lucía"),
      session("s-marco", "Marco", { partnerVoice: { intensity: 3, connection: 3, satisfaction: 3, energy: 3, overall: 3, ownWords: "her words", notes: "n", by: "p-lucia", at: T } }),
    ],
    proposals: [{ id: "prop-hers", kind: "delete-session", targetId: "s-marco", proposedBy: "p-lucia", proposedAt: now - DAY, expiresAt: now + 6 * DAY, state: "pending" }],
    settings: { language: "en", defaultPartner: "Lucía", cycles: [
      { id: "c1", enabled: true, starts: [], ends: {}, days: {}, stamps: {}, updatedAt: T, metaAt: T },
      { id: "t-bound", enabled: true, perspective: "partner", partnerName: "", partnerLink: "", ownerId: "p-lucia", starts: ["2026-10-07"], ends: {}, days: {}, stamps: {}, updatedAt: T, metaAt: T },
    ] },
  });
  S().deletePersonForever("Lucía");
  const j = J();
  const residue: string[] = [];
  if ((j.people ?? []).some((p) => p.id === "p-lucia")) residue.push("Person record + PIN");
  if (!partnerRemoved("Lucía", j.deleted)) residue.push("no partner-off tombstone (merge will resurrect her)");
  if (j.settings.cycles.some((tr) => tr.ownerId === "p-lucia")) residue.push("ownerId-bound tracker");
  if (j.sessions.some((s) => s.partnerVoice?.by === "p-lucia")) residue.push("her voice on Marco's session");
  if ((j.proposals ?? []).some((p) => p.proposedBy === "p-lucia")) residue.push("her pending proposal");
  if (j.partners.includes("Lucía")) residue.push("partners list");
  if (residue.length === 0) hold("S9a after the cascade, nothing in the journal resolves her name, her id, or her words");
  else brk("S9a the cascade left residue", residue.join(", "));
  const stale = journalFromUnknown(rawJournal({ updatedAt: T + 5000, partners: ["Lucía", "Marco"] }), "en");
  const merged = mergeJournals(j, stale);
  if (!merged.partners.includes("Lucía")) hold("S9b a stale device cannot resurrect her as a partner");
  else brk("S9b the merge resurrected the deleted partner");
}

/* ── S10. The tracker cap resolves with tombstones (V3-09/10) ── */
{
  const mk = (prefix: string, at: number) => Array.from({ length: 8 }, (_, i) => ({
    id: `${prefix}${i + 1}`, enabled: true, starts: [], ends: {}, days: {}, stamps: {}, updatedAt: at, metaAt: at,
  }));
  const a = journalFromUnknown(rawJournal({ updatedAt: T, settings: { language: "en", cycles: mk("L", T) } }), "en");
  const b = journalFromUnknown(rawJournal({ updatedAt: T + 1000, settings: { language: "en", cycles: mk("R", T + 1000) } }), "en");
  const m1 = mergeJournals(a, b);
  const m2 = mergeJournals(b, a);
  const kept1 = m1.settings.cycles.map((t) => t.id).sort().join();
  const kept2 = m2.settings.cycles.map((t) => t.id).sort().join();
  const all = [...mk("L", T), ...mk("R", T)].map((t) => t.id);
  const dropped = all.filter((id) => !kept1.split(",").includes(id));
  const untombstoned = dropped.filter((id) => !(m1.deleted?.[`cycle:${id}`]));
  if (m1.settings.cycles.length <= 8 && kept1 === kept2 && untombstoned.length === 0)
    hold("S10 the cap holds, the same trackers survive on both devices, and every drop is tombstoned");
  else brk("S10 the cap amputated silently", `kept=${m1.settings.cycles.length} deterministic=${kept1 === kept2} untombstoned=${untombstoned.join(",")}`);
  const ten = journalFromUnknown(rawJournal({ settings: { language: "en", cycles: [...mk("L", T), ...mk("R", T)].slice(0, 10) } }), "en");
  if (ten.settings.cycles.length === 10) hold("S10b the load gate no longer amputates trackers silently");
  else brk("S10b the gate sliced the tracker list", `loaded=${ten.settings.cycles.length}/10`);
}

/* ── S11/S12. People resolve deterministically (V4 B7) ── */
{
  const ana: Person = { id: "p-owner", name: "Ana", role: "owner", createdAt: 100, updatedAt: 100 };
  const lucia: Person = { id: "p-lucia", name: "Lucía", role: "partner", createdAt: 200, updatedAt: 200 };
  const sofia: Person = { id: "p-sofia", name: "Sofía", role: "partner", createdAt: 300, updatedAt: 300 };
  const m1 = mergePeople([ana, lucia], [ana, sofia]) ?? [];
  const m2 = mergePeople([ana, sofia], [ana, lucia]) ?? [];
  const ids = (list: Person[]) => list.map((p) => p.id).sort().join();
  if (m1.length === 2 && ids(m1) === "p-lucia,p-owner" && ids(m2) === ids(m1))
    hold("S11 a three-person union resolves owner-first, earliest ceremony — identical on both devices");
  else brk("S11 the people cap resolved by argument order", `m1=${ids(m1)} m2=${ids(m2)}`);
  const g1 = cleanPeople([sofia, ana, lucia]).map((p) => p.id).join();
  const g2 = cleanPeople([lucia, sofia, ana]).map((p) => p.id).join();
  if (g1 === g2 && g1 === "p-owner,p-lucia") hold("S12 the gate keeps the same two people regardless of array order");
  else brk("S12 the gate's slice depends on array order", `g1=${g1} g2=${g2}`);
  const a = journalFromUnknown(rawJournal({ updatedAt: T, people: [ana, lucia] }), "en");
  const b = journalFromUnknown(rawJournal({ updatedAt: T + 1000, people: [ana, sofia] }), "en");
  const m = mergeJournals(a, b);
  if ((m.people ?? []).length === 2 && (m.deleted?.["p-sofia"] ?? 0) > 0)
    hold("S13 the displaced partner is tombstoned by the merge, so the other device resolves identically");
  else brk("S13 the displaced partner vanished without a tombstone", `people=${(m.people ?? []).length} deleted=${JSON.stringify(m.deleted?.["p-sofia"])}`);
}

console.log(`\nWAVE1: ${breaks} breaks, ${holds} holds`);
if (breaks > 0) process.exitCode = 1;
