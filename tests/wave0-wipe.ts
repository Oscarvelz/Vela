/* Wave 0 fences — the inventory and the wiped journal (RT-V4 B2).
 * Unit-level: wipedJournal against a maximal fake journal, plus the
 * coverage fence — every field of Journal and Settings in types.ts must
 * be classified in wipe.ts (data / structural / furniture), so a future
 * data class cannot be born invisible to the erasure ceremonies. */
import { readFileSync } from "node:fs";
import { JOURNAL_DATA_KEYS, JOURNAL_STRUCTURAL_KEYS, SETTINGS_DATA_KEYS, SETTINGS_FURNITURE_KEYS, wipedJournal } from "../src/lib/vela/wipe";
import type { Journal } from "../src/lib/vela/types";

let breaks = 0;
let holds = 0;
function hold(name: string) { holds += 1; console.log(`HOLD ${name}`); }
function brk(name: string, extra = "") { breaks += 1; console.log(`BREAK ${name}${extra ? " — " + extra : ""}`); }

const DAY = 86400000;
const now = Date.now();

const maximal = {
  profile: { displayName: "Ana", createdAt: now - 30 * DAY, speakAs: "she" },
  settings: {
    theme: "velvet", mode: "day", weekStart: "monday", discreet: true, autoLockMins: 15, ratingStyle: "stars", language: "es", themeVersion: 2,
    customPlaces: ["Hotel"], customPositions: ["Lotus"], customProblems: ["mood"], defaultPartner: "Lucía",
    cycle: { starts: ["2026-10-05"] }, cycles: [{ id: "c1", starts: ["2026-10-05"] }], cycleSelected: "c1",
    batchDraft: { text: "Oct 25 with Lucía", at: now - DAY },
    storiesMuted: { people: ["Sofía"], days: [] },
    anniversaries: [{ id: "a1", label: "First trip", date: "2025-06-01", partnerName: "Lucía" }],
    children: [{ id: "k1", name: "Marta", birthDate: "2024-03-01" }],
    archivedPeople: [{ name: "Sofía", prefs: { showInHistory: false, showInStats: false, showInStories: false } }],
    coupleMode: { sharedFrom: "2026-10-01", enabledAt: now - 30 * DAY },
  },
  partners: ["Lucía", "Sofía"],
  sessions: [{ id: "s1" }],
  encounters: [{ id: "e1" }],
  updatedAt: now - DAY,
  deleted: { "s-old": now - 5 * DAY },
  migrations: ["enc-split-1"],
  people: [{ id: "p-owner", name: "Ana", role: "owner" }, { id: "p-lucia", name: "Lucía", role: "partner" }],
  proposals: [{ id: "w-legit", kind: "wipe-vault" }, { id: "d-other", kind: "delete-session" }],
  quietDays: [{ id: "q1", from: "2026-10-10", to: "2026-10-12" }],
  pregnancyTests: [{ id: "pt1", date: "2026-11-01", result: "positive", count: 1 }],
} as unknown as Journal;

{
  const w = wipedJournal(maximal, now);
  const residue: string[] = [];
  if (w.profile) residue.push("profile");
  if (w.partners.length) residue.push("partners");
  if (w.sessions.length) residue.push("sessions");
  if (w.encounters.length) residue.push("encounters");
  if ((w.people ?? []).length) residue.push("people");
  if ((w.proposals ?? []).length) residue.push("proposals");
  if ((w.quietDays ?? []).length) residue.push("quietDays");
  if ((w.pregnancyTests ?? []).length) residue.push("pregnancyTests");
  if (w.settings.cycles.length) residue.push("cycles");
  if (w.settings.cycle.starts?.length) residue.push("legacy cycle mirror");
  if (w.settings.customPlaces.length) residue.push("customPlaces");
  if (w.settings.customPositions.length) residue.push("customPositions");
  if (w.settings.customProblems.length) residue.push("customProblems");
  if (w.settings.defaultPartner) residue.push("defaultPartner");
  if (w.settings.batchDraft) residue.push("batchDraft");
  if (w.settings.storiesMuted) residue.push("storiesMuted");
  if ((w.settings.anniversaries ?? []).length) residue.push("anniversaries");
  if ((w.settings.children ?? []).length) residue.push("children");
  if ((w.settings.archivedPeople ?? []).length) residue.push("archivedPeople");
  if (w.settings.coupleMode) residue.push("coupleMode");
  if (residue.length === 0) hold("W1 wipedJournal empties every data class in the inventory");
  else brk("W1 wipedJournal left residue", residue.join(", "));

  const s = w.settings;
  if (s.language === "es" && s.theme === "velvet" && s.weekStart === "monday" && s.discreet === true && s.autoLockMins === 15 && s.themeVersion === 2)
    hold("W2 the furniture survives the wipe untouched");
  else brk("W2 the wipe disturbed the furniture", JSON.stringify({ language: s.language, theme: s.theme, weekStart: s.weekStart }));

  if (w.deleted?.["s-old"] === now - 5 * DAY && w.deleted?.["w-legit"] === now && w.deleted?.["d-other"] === now)
    hold("W3 tombstones are kept and every consumed proposal is tombstoned");
  else brk("W3 tombstone handling wrong", JSON.stringify(w.deleted));
  if (w.clearedAt === now && w.sessionsClearedAt === now && w.encountersClearedAt === now && w.partnersClearedAt === now && (w.migrations ?? []).includes("enc-split-1"))
    hold("W4 clearedAt stamps set; migrations (bookkeeping) kept");
  else brk("W4 clearedAt/migrations wrong");
}

/* ── Coverage: types.ts fields vs the inventory lists ── */
function typeFields(src: string, typeName: string): string[] {
  const start = src.indexOf(`export type ${typeName} = {`);
  if (start < 0) return [];
  const end = src.indexOf("\n};", start);
  const block = src.slice(start, end);
  const fields = new Set<string>();
  for (const line of block.split("\n")) {
    const m = /^  (\w+)\??:/.exec(line);
    if (m) fields.add(m[1]);
  }
  return [...fields];
}
{
  const src = readFileSync("src/lib/vela/types.ts", "utf8");
  const journalFields = typeFields(src, "Journal");
  const settingsFields = typeFields(src, "Settings");
  const journalClassified = new Set<string>([...JOURNAL_DATA_KEYS, ...JOURNAL_STRUCTURAL_KEYS]);
  const settingsClassified = new Set<string>([...SETTINGS_DATA_KEYS, ...SETTINGS_FURNITURE_KEYS]);
  const missingJ = journalFields.filter((f) => !journalClassified.has(f));
  const missingS = settingsFields.filter((f) => !settingsClassified.has(f));
  const phantomJ = [...journalClassified].filter((f) => !journalFields.includes(f));
  const phantomS = [...settingsClassified].filter((f) => !settingsFields.includes(f));
  if (missingJ.length === 0 && missingS.length === 0 && phantomJ.length === 0 && phantomS.length === 0)
    hold(`W5 inventory covers types.ts exactly (Journal ${journalFields.length} fields, Settings ${settingsFields.length} fields)`);
  else brk("W5 inventory drifted from types.ts", `unclassified Journal: ${missingJ}; unclassified Settings: ${missingS}; phantom Journal: ${phantomJ}; phantom Settings: ${phantomS}`);
}

console.log(`\nWAVE0-WIPE: ${breaks} breaks, ${holds} holds`);
if (breaks > 0) process.exitCode = 1;
