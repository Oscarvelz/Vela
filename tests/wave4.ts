/* Wave 4 fences — surfaces obey the laws already written (RT-V4 B8/B9/B14,
 * RT-V3 L-1/L-4/L-6, Decisions 2/3/4). Drives the REAL store actions, the
 * REAL load gate and the new shared selectors with fake data only
 * (Ana / Lucía / Sofía / Marco; Cabin / Hotel; Marta). */
import type { Journal } from "../src/lib/vela/types";

const g = globalThis as Record<string, unknown>;
if (typeof g.window === "undefined") g.window = g;
const { journalFromUnknown, useJournal, csvText } = await import("../src/lib/vela/store");
const { visibleSessions, visibleEncounters, countedTrackers } = await import("../src/lib/vela/anniversaries");
const { weekCount } = await import("../src/lib/vela/stats");
const { todayStr, addDays } = await import("../src/lib/vela/dates");

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
      defaultPartner: "Lucía",
      cycles: [
        { id: "c1", starts: ["2026-10-05"], ends: {}, days: {}, reasons: {}, stamps: {}, enabled: true },
        { id: "t-lucia", perspective: "partner", partnerName: "Lucía", starts: ["2026-10-07"], ends: {}, days: {}, reasons: {}, stamps: {}, enabled: true },
        { id: "t-sofia", perspective: "partner", partnerName: "Sofía", starts: ["2026-10-09"], ends: {}, days: {}, reasons: {}, stamps: {}, enabled: true },
      ],
      archivedPeople: [
        { name: "Lucía", archivedAt: now - 5 * DAY, showInHistory: false, countInStats: false, resurface: false },
      ],
    },
    partners: ["Lucía", "Sofía", "Ana"],
    sessions: [
      { id: "s-lucia", date: TODAY, time: "21:00", partnerName: "Lucía", place: "Cabin", durationMins: 40, positions: [], intensity: 4, connection: 4, satisfaction: 4, energy: 4, overall: 4, notes: "", ownWords: "", sessionNumber: 1, encounterId: "e-lucia", createdAt: now - DAY },
      { id: "s-sofia", date: TODAY, time: "22:00", partnerName: "Sofía", place: "Hotel", durationMins: 30, positions: [], intensity: 5, connection: 5, satisfaction: 5, energy: 5, overall: 5, notes: "", ownWords: "", sessionNumber: 1, encounterId: "e-sofia", createdAt: now - DAY,
        partnerVoice: { intensity: 5, connection: 4, satisfaction: 5, energy: 3, overall: 5, ownWords: "her own words", notes: "her note", by: "p-sofia", at: now - DAY } },
    ],
    encounters: [
      { id: "e-lucia", partnerName: "Lucía", title: "Cabin", startDate: TODAY, endDate: TODAY, notes: "", createdAt: now - DAY },
      { id: "e-sofia", partnerName: "Sofía", title: "Hotel", startDate: TODAY, endDate: TODAY, notes: "", createdAt: now - DAY },
    ],
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

/* ── S1 · B8/B9 — one selector, every surface: all switches off means
 * the diary goes quiet about her, in History's own glance included. */
{
  const j = seed();
  const hist = visibleSessions(j, "history");
  const stats = visibleSessions(j, "stats");
  const stories = visibleSessions(j, "resurface");
  const enc = visibleEncounters(j, "history");
  if (hist.length === 1 && hist[0].partnerName === "Sofía" && stats.length === 1 && stories.length === 1 && enc.length === 1 && enc[0].partnerName === "Sofía")
    hold("S1 all-off archive hides her sessions and encounters on every surface");
  else brk("S1 visibleSessions", `hist=${hist.map((s) => s.partnerName)} stats=${stats.length} stories=${stories.length} enc=${enc.map((e) => e.partnerName)}`);
}
{
  const j = seed({
    settings: {
      language: "en",
      cycles: [],
      archivedPeople: [{ name: "Lucía", archivedAt: now - 5 * DAY, showInHistory: true, countInStats: false, resurface: false }],
    },
  });
  const hist = visibleSessions(j, "history");
  const stats = visibleSessions(j, "stats");
  if (hist.length === 2 && stats.length === 1 && stats[0].partnerName === "Sofía")
    hold("S1b each switch governs only its own surface");
  else brk("S1b per-surface switches", `hist=${hist.length} stats=${stats.map((s) => s.partnerName)}`);
}

/* ── S2 · B14 — removing a partner by a case-variant name clears the
 * default too: the comparison is the same one the roster uses. */
{
  seed();
  S().removePartner("lucía");
  if (J().settings.defaultPartner === "" && !J().partners.some((p) => p.toLowerCase() === "lucía"))
    hold("S2 removePartner('lucía') clears defaultPartner 'Lucía'");
  else brk("S2 default survives removal", `default=${J().settings.defaultPartner} partners=${J().partners}`);
}

/* ── S3 · L-6 — "this week" has not happened yet: tomorrow is not in it. */
{
  const mk = (date: string) => ({ id: date, date, partnerName: "Ana" }) as never;
  const n = weekCount([mk(TODAY), mk(addDays(TODAY, 1)), mk(addDays(TODAY, 6))], "monday");
  if (n === 1) hold("S3 weekCount counts today, never tomorrow");
  else brk("S3 weekCount upper bound", `count=${n}`);
}

/* ── S4 · L-1 — a second tracker for the same person is refused at the
 * door: the existing tracker is the answer, never a shadow. */
{
  seed();
  const before = J().settings.cycles.length;
  const id = S().addTracker({ perspective: "partner", partnerName: "Lucía", partnerLink: "" });
  const selfId = S().addTracker({ perspective: "self" });
  if (id === "t-lucia" && selfId === "c1" && J().settings.cycles.length === before)
    hold("S4 duplicate trackers redirect to the existing one, creating nothing");
  else brk("S4 duplicate tracker", `id=${id} self=${selfId} cycles=${J().settings.cycles.length} (was ${before})`);
}

/* ── S5 · Decision 4 — duplicate consent asks dedupe on the person,
 * however the label is cased. */
{
  seed();
  const a = S().proposeDeletion({ kind: "delete-person", targetLabel: "Lucía" }, "p-owner");
  const b = S().proposeDeletion({ kind: "delete-person", targetLabel: "lucía" }, "p-owner");
  const c = S().proposeDeletion({ kind: "delete-person", targetLabel: "Sofía" }, "p-owner");
  const mine = (J().proposals ?? []).filter((p) => p.kind === "delete-person");
  if (a === b && a !== c && mine.length === 2) hold("S5 case-variant delete-person asks are one ask");
  else brk("S5 proposal dedupe", `a=${a} b=${b} c=${c} proposals=${mine.length}`);
}

/* ── S6 · Decision 2 / L-4 — her cycle tracker counts only where the
 * Statistics switch lets it; the tracker itself is untouched. */
{
  const j = seed();
  const counted = countedTrackers(j);
  if (!counted.some((tr) => tr.id === "t-lucia") && counted.some((tr) => tr.id === "t-sofia") && counted.some((tr) => tr.id === "c1") && j.settings.cycles.some((tr) => tr.id === "t-lucia" && tr.enabled))
    hold("S6 stats-off archive removes her tracker from the counted set, not from the diary");
  else brk("S6 countedTrackers", counted.map((tr) => tr.id).join(","));
}
{
  const j = seed({
    settings: {
      language: "en",
      cycles: [
        { id: "c1", starts: ["2026-10-05"], ends: {}, days: {}, reasons: {}, stamps: {}, enabled: true },
        { id: "t-lucia", perspective: "partner", partnerName: "Lucía", starts: ["2026-10-07"], ends: {}, days: {}, reasons: {}, stamps: {}, enabled: true },
      ],
      archivedPeople: [{ name: "Lucía", archivedAt: now - 5 * DAY, showInHistory: false, countInStats: true, resurface: false }],
    },
  });
  if (countedTrackers(j).some((tr) => tr.id === "t-lucia")) hold("S6b Statistics on counts her tracker again");
  else brk("S6b countedTrackers with stats on");
}

/* ── S7 · Decision 3 — the CSV carries her voice too: her dials and
 * her own words sit in their own columns, beside his. */
{
  const j = seed();
  const csv = csvText(j);
  const [header, ...rows] = csv.split("\n");
  const sofia = rows.find((r) => r.includes("Sofía")) ?? "";
  if (header.includes("partner_intensity") && header.includes("partner_own_words") && sofia.includes('"her own words"') && sofia.includes('"5","4","5","3","5"'))
    hold("S7 CSV exports her dials and her words in partner columns");
  else brk("S7 CSV second voice", `header=${header} row=${sofia}`);
}

console.log(`WAVE4: ${breaks} breaks, ${holds} holds`);
if (breaks > 0) process.exitCode = 1;
