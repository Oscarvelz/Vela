/* Wave 4 re-hunt — fresh prejudice against the NEW surface machinery:
 * the shared selectors, the tracker door, the dedupe, the CSV voice.
 * Fake data only. */
import type { Journal } from "../src/lib/vela/types";

const g = globalThis as Record<string, unknown>;
if (typeof g.window === "undefined") g.window = g;
const { journalFromUnknown, useJournal, csvText } = await import("../src/lib/vela/store");
const { visibleSessions, countedTrackers } = await import("../src/lib/vela/anniversaries");
const { weekCount } = await import("../src/lib/vela/stats");
const { todayStr, addDays, startOfWeek } = await import("../src/lib/vela/dates");

process.on("unhandledRejection", () => undefined);

let breaks = 0;
let holds = 0;
function hold(name: string) { holds += 1; console.log(`HOLD ${name}`); }
function brk(name: string, extra = "") { breaks += 1; console.log(`BREAK ${name}${extra ? " — " + extra : ""}`); }

const DAY = 86400000;
const now = Date.now();
const TODAY = todayStr();

function rawJournal(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    profile: { displayName: "Ana", createdAt: now - 30 * DAY },
    settings: {
      language: "en",
      cycles: [
        { id: "c1", starts: ["2026-10-05"], ends: {}, days: {}, reasons: {}, stamps: {}, enabled: true },
        { id: "t-lucia", perspective: "partner", partnerName: "Lucía", partnerLink: "Lucía", starts: ["2026-10-07"], ends: {}, days: {}, reasons: {}, stamps: {}, enabled: true },
      ],
      archivedPeople: [{ name: "Lucía", archivedAt: now - 5 * DAY, showInHistory: false, countInStats: false, resurface: false }],
    },
    partners: ["Lucía", "Sofía"],
    sessions: [
      { id: "s1", date: TODAY, time: "21:00", partnerName: "Lucia", place: "Cabin", durationMins: 40, positions: [], intensity: 4, connection: 4, satisfaction: 4, energy: 4, overall: 4, notes: "", ownWords: "", sessionNumber: 1, encounterId: "", createdAt: now - DAY },
      { id: "s2", date: TODAY, time: "22:00", partnerName: "Sofía", place: "Hotel", durationMins: 30, positions: [], intensity: 5, connection: 5, satisfaction: 5, energy: 5, overall: 5, notes: "", ownWords: "", sessionNumber: 1, encounterId: "", createdAt: now - DAY,
        partnerVoice: { intensity: 5, connection: 4, satisfaction: 5, energy: 3, overall: 5, ownWords: "she said \"yes, twice\"", notes: "", by: "p-sofia", at: now - DAY } },
    ],
    encounters: [],
    people: [{ id: "p-owner", name: "Ana", role: "owner", createdAt: now - 30 * DAY, updatedAt: now - 30 * DAY }],
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

/* RH1 — the archive knows her by the app's own sameness: identity in
 * the journal is case-insensitive (partnerKey), so a session logged
 * "LUCÍA" is hers, archived as "Lucía". (Accent variants — "Lucia" —
 * are a different spelling by that same law everywhere in the app;
 * widening identity itself is a product decision, recorded as a lead
 * in the wave report, not silently taken here.) */
{
  const j = seed({
    sessions: [
      { id: "s1", date: TODAY, time: "21:00", partnerName: "LUCÍA", place: "Cabin", durationMins: 40, positions: [], intensity: 4, connection: 4, satisfaction: 4, energy: 4, overall: 4, notes: "", ownWords: "", sessionNumber: 1, encounterId: "", createdAt: now - DAY },
      { id: "s2", date: TODAY, time: "22:00", partnerName: "Sofía", place: "Hotel", durationMins: 30, positions: [], intensity: 5, connection: 5, satisfaction: 5, energy: 5, overall: 5, notes: "", ownWords: "", sessionNumber: 1, encounterId: "", createdAt: now - DAY },
    ],
  });
  const hist = visibleSessions(j, "history");
  if (hist.length === 1 && hist[0].partnerName === "Sofía") hold("RH1 case-variant spellings are the same archived person");
  else brk("RH1 archive sameness", `visible=${hist.map((s) => s.partnerName)}`);
}

/* RH2 — the week bound holds at both week starts and both edges. */
{
  const mk = (date: string) => ({ id: date, date, partnerName: "Ana" }) as never;
  const startMon = startOfWeek(TODAY, "monday");
  const n = weekCount([mk(startMon), mk(addDays(TODAY, 1)), mk(addDays(startMon, -1))], "monday");
  if (n === 1) hold("RH2 weekCount: first day in, tomorrow and last week out");
  else brk("RH2 weekCount edges", `count=${n} start=${startMon} today=${TODAY}`);
}

/* RH3 — the tracker door dedupes by link as well as by name. */
{
  seed();
  const id = S().addTracker({ perspective: "partner", partnerName: "", partnerLink: "Lucía" });
  if (id === "t-lucia" && J().settings.cycles.length === 2) hold("RH3 duplicate by partnerLink redirects too");
  else brk("RH3 link duplicate", `id=${id} cycles=${J().settings.cycles.length}`);
}

/* RH4 — dedupe never merges different questions: a delete-person ask
 * and a delete-session ask about her stay two asks. */
{
  seed();
  const a = S().proposeDeletion({ kind: "delete-person", targetLabel: "Lucía" }, "p-owner");
  const b = S().proposeDeletion({ kind: "delete-session", targetId: "s2", targetLabel: "Lucía" }, "p-owner");
  if (a !== b && (J().proposals ?? []).length === 2) hold("RH4 different kinds are different asks");
  else brk("RH4 kind separation", `a=${a} b=${b} n=${(J().proposals ?? []).length}`);
}

/* RH5 — her words survive CSV quoting: commas and quotes in her own
 * words stay inside her cell. */
{
  const j = seed();
  const csv = csvText(j);
  const sofia = csv.split("\n").find((r) => r.includes("Sofía")) ?? "";
  if (sofia.includes('"she said ""yes, twice"""')) hold("RH5 her quoted words are CSV-escaped in her column");
  else brk("RH5 CSV escaping", sofia);
}

/* RH6 — an archived tracker bound by LINK only (no name) still obeys
 * the Statistics switch. */
{
  const j = seed({
    settings: {
      language: "en",
      cycles: [
        { id: "c1", starts: ["2026-10-05"], ends: {}, days: {}, reasons: {}, stamps: {}, enabled: true },
        { id: "t-link", perspective: "partner", partnerName: "", partnerLink: "Lucía", starts: ["2026-10-07"], ends: {}, days: {}, reasons: {}, stamps: {}, enabled: true },
      ],
      archivedPeople: [{ name: "Lucía", archivedAt: now - 5 * DAY, showInHistory: false, countInStats: false, resurface: false }],
    },
  });
  if (!countedTrackers(j).some((tr) => tr.id === "t-link")) hold("RH6 link-bound trackers obey the Statistics switch");
  else brk("RH6 countedTrackers link binding");
}

console.log(`WAVE4-REHUNT: ${breaks} breaks, ${holds} holds`);
if (breaks > 0) process.exitCode = 1;
