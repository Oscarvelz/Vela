/* Wave 6 fences — merge armor (Prejudice Round 2: RT2-H1 B1/B2/B4,
 * RT2-H3 01/03/04/05, RT2-H4 B2/B3, RT2-H6 1). The disease: removals
 * without armor at the merge gate — what a user deletes, wipes,
 * un-archives, un-mutes or answers on one device, a stale sync
 * resurrects from the other. Every specimen drives the REAL store
 * actions, the REAL merge and the REAL gate, with fake data only
 * (Ana / Lucía / Sofía / Marco; Cabin / Hotel; Marta).
 * Every BREAK line below was watched failing on 2.2.28 before the fix. */
const g = globalThis as Record<string, unknown>;
if (typeof g.window === "undefined") g.window = g;
const { journalFromUnknown, mergeJournals, useJournal } = await import("../src/lib/vela/store");
const { wipedJournal } = await import("../src/lib/vela/wipe");
const { mergeTracker } = await import("../src/lib/vela/cycle-trackers");
import type { Journal } from "../src/lib/vela/types";

process.on("unhandledRejection", () => undefined);

let breaks = 0;
let holds = 0;
function hold(name: string) { holds += 1; console.log(`HOLD ${name}`); }
function brk(name: string, extra = "") { breaks += 1; console.log(`BREAK ${name}${extra ? " — " + extra : ""}`); }
function check(name: string, ok: boolean, extra = "") { if (ok) hold(name); else brk(name, extra); }

const DAY = 86400000;
const T0 = Date.now();
const S = () => useJournal.getState();
const J = () => S().journal;

function rawRich(at: number): Record<string, unknown> {
  return {
    profile: { displayName: "Ana", createdAt: at - 30 * DAY },
    updatedAt: at - DAY,
    settings: {
      language: "en",
      coupleMode: { sharedFrom: "2026-10-01", enabledAt: at - 30 * DAY },
      defaultPartner: "Lucía",
      cycles: [
        { id: "c1", starts: ["2026-10-05"], ends: {}, days: {}, reasons: {}, stamps: {}, enabled: true, updatedAt: at - 20 * DAY, metaAt: at - 20 * DAY },
        { id: "t-lucia", partnerName: "Lucía", partnerLink: "Lucía", perspective: "partner", starts: ["2026-10-07"], ends: {}, days: {}, reasons: {}, stamps: {}, enabled: true, updatedAt: at - 20 * DAY, metaAt: at - 20 * DAY },
      ],
      cycleSelected: "c1",
      anniversaries: [{ id: "a1", label: "First trip", monthDay: "06-01", year: 2025, personName: "Lucía", kind: "custom", milestone: false, createdAt: at - 20 * DAY }],
      children: [{ id: "k1", name: "Marta", birthdate: "2024-03-01", refAs: "daughter", createdAt: at - 20 * DAY }],
      archivedPeople: [{ name: "Sofía", archivedAt: at - 20 * DAY, showInHistory: false, countInStats: false, resurface: false }],
      storiesMuted: { people: ["Marco"], days: ["2026-10-11"] },
      customPlaces: ["Cabin"],
      customPositions: ["Lotus"],
      customProblems: ["Back pain"],
      batchDraft: { text: "Oct 25 with Lucía, twice", picked: "", typed: "", edits: {}, open: null, at: at - DAY },
    },
    partners: ["Lucía"],
    sessions: [
      { id: "s1", date: "2026-11-02", time: "21:00", partnerName: "Lucía", place: "Cabin", durationMins: 40, positions: [], intensity: 4, connection: 4, satisfaction: 4, energy: 4, overall: 4, notes: "", ownWords: "", sessionNumber: 1, encounterId: "e1", createdAt: at - 10 * DAY },
    ],
    encounters: [
      { id: "e1", partnerName: "Lucía", title: "Cabin", startDate: "2026-11-02", endDate: "2026-11-02", notes: "", createdAt: at - 10 * DAY },
    ],
    people: [
      { id: "p-owner", name: "Ana", role: "owner", createdAt: at - 30 * DAY, updatedAt: at - 30 * DAY },
      { id: "p-lucia", name: "Lucía", role: "partner", pin: { salt: "c2FsdA==", hash: "aGFzaA==", iterations: 150000 }, createdAt: at - 30 * DAY, updatedAt: at - 30 * DAY },
    ],
    proposals: [
      { id: "pr1", kind: "delete-session", targetId: "s1", proposedBy: "p-owner", proposedAt: at - 5 * DAY, expiresAt: at + 2 * DAY, state: "pending" },
    ],
    quietDays: [{ id: "q1", from: "2026-10-10", to: "2026-10-12", reason: "travel", source: "manual", createdAt: at - 20 * DAY, updatedAt: at - 20 * DAY }],
    pregnancyTests: [{ id: "pt1", date: "2026-11-01", result: "positive", count: 1, evidence: "the pregnancy test was positive", createdAt: at - 9 * DAY }],
  };
}
function rich(at: number): Journal {
  return journalFromUnknown(rawRich(at), "en");
}
function seed(at: number): Journal {
  const j = rich(at);
  useJournal.setState({ journal: j, unlocked: true });
  return j;
}

/* ── S1. The wipe survives the merge, in both directions ── */
{
  const stale = rich(T0);
  const TW = T0 + 10 * DAY;
  const wiped = wipedJournal(stale, TW);
  for (const [label, m] of [["wiped×stale", mergeJournals(wiped, stale)], ["stale×wiped", mergeJournals(stale, wiped)]] as const) {
    const s = m.settings;
    const dead: [string, boolean][] = [
      ["profile", m.profile === null],
      ["sessions", m.sessions.length === 0],
      ["encounters", m.encounters.length === 0],
      ["partners", m.partners.length === 0],
      ["people", (m.people ?? []).length === 0],
      ["proposals", (m.proposals ?? []).length === 0],
      ["quietDays", (m.quietDays ?? []).length === 0],
      ["pregnancyTests", (m.pregnancyTests ?? []).length === 0],
      ["anniversaries", (s.anniversaries ?? []).length === 0],
      ["children", (s.children ?? []).length === 0],
      ["archivedPeople", (s.archivedPeople ?? []).length === 0],
      ["customPlaces", s.customPlaces.length === 0],
      ["customPositions", s.customPositions.length === 0],
      ["customProblems", s.customProblems.length === 0],
      ["mutedPeople", (s.storiesMuted?.people ?? []).length === 0],
      ["mutedDays", (s.storiesMuted?.days ?? []).length === 0],
      ["batchDraft", !s.batchDraft],
      ["coupleMode", !s.coupleMode],
      ["defaultPartner", s.defaultPartner === ""],
      ["trackerStarts", s.cycles.every((c) => c.starts.length === 0)],
      ["trackerNames", s.cycles.every((c) => !c.partnerName)],
    ];
    const alive = dead.filter(([, ok]) => !ok).map(([k]) => k);
    check(`S1 wipe armor (${label})`, alive.length === 0, `resurrected: ${alive.join(", ")}`);
  }
  /* S2. Life after the wipe is not eaten by the armor. */
  const wiped2 = wipedJournal(stale, TW);
  const reborn: Journal = {
    ...wiped2,
    updatedAt: TW + 2 * DAY,
    profile: { displayName: "Ana", createdAt: TW + DAY },
    sessions: [{ id: "s-new", date: "2026-11-15", time: "21:00", partnerName: "", place: "", durationMins: 30, positions: [], contraception: [], problems: [], intensity: 0, connection: 0, satisfaction: 0, energy: 0, overall: 0, notes: "", ownWords: "", sessionNumber: 1, encounterId: "", createdAt: TW + DAY, updatedAt: TW + DAY }],
  };
  const m2 = mergeJournals(reborn, stale);
  check("S2 post-wipe session survives", m2.sessions.some((x) => x.id === "s-new") && m2.sessions.length === 1, `sessions=${m2.sessions.map((x) => x.id).join(",")}`);
  check("S2 post-wipe profile survives", m2.profile?.displayName === "Ana", `profile=${JSON.stringify(m2.profile)}`);
}

/* ── S3. A removed partner does not return as the default ── */
{
  const a = rich(T0);
  const removed: Journal = {
    ...a,
    partners: [],
    settings: { ...a.settings, defaultPartner: "" },
    deleted: { ...(a.deleted ?? {}), "partner-:lucía": T0 },
    updatedAt: T0,
  };
  const m = mergeJournals(removed, rich(T0));
  check("S3 defaultPartner stays cleared", m.settings.defaultPartner === "", `default=${m.settings.defaultPartner}`);
  check("S3 partner stays removed", !m.partners.includes("Lucía"), `partners=${m.partners.join(",")}`);
}

/* ── S4. A union emptied by tombstones stays empty ── */
{
  const base = rich(T0);
  const emptied: Journal = {
    ...base,
    quietDays: [],
    proposals: [],
    pregnancyTests: [],
    deleted: { ...(base.deleted ?? {}), q1: T0, pr1: T0, pt1: T0 },
    updatedAt: T0 - DAY,
  };
  const carrier: Journal = { ...rich(T0), updatedAt: T0 };
  const m = mergeJournals(emptied, carrier);
  check("S4 quietDays stay empty", (m.quietDays ?? []).length === 0, `n=${(m.quietDays ?? []).length}`);
  check("S4 proposals stay empty", (m.proposals ?? []).length === 0, `n=${(m.proposals ?? []).length}`);
  check("S4 pregnancyTests stay empty", (m.pregnancyTests ?? []).length === 0, `n=${(m.pregnancyTests ?? []).length}`);
}

/* ── S5. Deleted anniversaries and children stay deleted ── */
{
  seed(T0);
  S().deleteAnniversary("a1");
  const afterA = J();
  check("S5 anniversary deleted locally", (afterA.settings.anniversaries ?? []).length === 0);
  const mA = mergeJournals(afterA, rich(T0));
  check("S5 anniversary stays deleted after merge", (mA.settings.anniversaries ?? []).length === 0, `n=${(mA.settings.anniversaries ?? []).length}`);
  seed(T0);
  S().deleteChild("k1");
  const mK = mergeJournals(J(), rich(T0));
  check("S5 child stays deleted after merge", (mK.settings.children ?? []).length === 0, `n=${(mK.settings.children ?? []).length}`);
}

/* ── S6. Un-archiving and archive prefs survive the merge ── */
{
  seed(T0);
  S().unarchivePerson("Sofía");
  const mU = mergeJournals(J(), rich(T0));
  check("S6 unarchive survives merge", (mU.settings.archivedPeople ?? []).length === 0, `n=${(mU.settings.archivedPeople ?? []).length}`);
  seed(T0);
  S().setArchivedPref("Sofía", "countInStats", true);
  const mP = mergeJournals(J(), rich(T0));
  const sofia = (mP.settings.archivedPeople ?? []).find((p) => p.name === "Sofía");
  check("S6 pref flip survives merge tie", sofia?.countInStats === true, `countInStats=${sofia?.countInStats}`);
}

/* ── S7. Custom values: removal, the wipe ceremony, and re-adding ── */
{
  seed(T0);
  S().removeCustom("places", "Cabin");
  const mR = mergeJournals(J(), rich(T0));
  check("S7 removed custom stays removed", !mR.settings.customPlaces.includes("Cabin"), `places=${mR.settings.customPlaces.join(",")}`);
  seed(T0);
  S().eraseAll({ sessions: false, encounters: false, partners: false, places: true, positions: false, problems: false });
  const mE = mergeJournals(J(), rich(T0));
  check("S7 eraseAll custom stays removed", !mE.settings.customPlaces.includes("Cabin"), `places=${mE.settings.customPlaces.join(",")}`);
  seed(T0);
  S().removeCustom("places", "Cabin");
  const removedState = J();
  S().addCustom("places", "Cabin");
  const mA = mergeJournals(J(), removedState);
  check("S7 re-added custom survives", mA.settings.customPlaces.includes("Cabin"), `places=${mA.settings.customPlaces.join(",")}`);
}

/* ── S8. Story mutes: un-muting survives; muting survives ── */
{
  seed(T0);
  S().unmuteStory("person", "Marco");
  S().unmuteStory("day", "2026-10-11");
  const mU = mergeJournals(J(), rich(T0));
  check("S8 unmuted person stays unmuted", !(mU.settings.storiesMuted?.people ?? []).includes("Marco"));
  check("S8 unmuted day stays unmuted", !(mU.settings.storiesMuted?.days ?? []).includes("2026-10-11"));
  const bareSeed = journalFromUnknown({ ...rawRich(T0), settings: { ...(rawRich(T0).settings as Record<string, unknown>), storiesMuted: { people: [], days: [] } } }, "en");
  useJournal.setState({ journal: bareSeed, unlocked: true });
  S().muteStoryPerson("Marco");
  const mM = mergeJournals(J(), bareSeed);
  check("S8 muted person stays muted", (mM.settings.storiesMuted?.people ?? []).includes("Marco"));
}

/* ── S9. The batch draft: clearing it survives; a newer draft wins ── */
{
  seed(T0);
  S().setBatchDraft(undefined);
  const mC = mergeJournals(J(), rich(T0));
  check("S9 cleared draft stays cleared", !mC.settings.batchDraft, `draft=${JSON.stringify(mC.settings.batchDraft?.text)}`);
  seed(T0);
  S().setBatchDraft({ text: "Nov 3 with Lucía, once", picked: "", typed: "", edits: {}, open: null, at: T0 + DAY });
  const mN = mergeJournals(J(), rich(T0));
  check("S9 newer draft survives", mN.settings.batchDraft?.text === "Nov 3 with Lucía, once", `draft=${JSON.stringify(mN.settings.batchDraft?.text)}`);
}

/* ── S10. A quiet mark's tombstone outranks a future-dated copy ── */
{
  const raw = rawRich(T0);
  raw.quietDays = [{ id: "q1", from: "2026-10-10", to: "2026-10-12", reason: "travel", source: "manual", createdAt: T0 - 20 * DAY, updatedAt: T0 + 200 * DAY }];
  const j = journalFromUnknown(raw, "en");
  useJournal.setState({ journal: j, unlocked: true });
  S().deleteQuietMark("q1");
  const after = J();
  const carrier = journalFromUnknown(raw, "en");
  const m = mergeJournals(after, carrier);
  check("S10 quiet tombstone beats the future-dated copy", (m.quietDays ?? []).length === 0, `n=${(m.quietDays ?? []).length} tombstone=${after.deleted?.q1} markUpdatedAt=${T0 + 200 * DAY}`);
}

/* ── S11. "Don't ask again" survives the tracker merge, both orders ── */
{
  seed(T0);
  const before = J().settings.cycles[0];
  S().setCycle({ muteReasonAsks: true });
  const muted = J().settings.cycles[0];
  check("S11 mute set locally", muted.muteReasonAsks === true);
  const m1 = mergeTracker(muted, before);
  const m2 = mergeTracker(before, muted);
  check("S11 mute survives merge (muted first)", m1.muteReasonAsks === true, `mute=${m1.muteReasonAsks}`);
  check("S11 mute survives merge (muted second)", m2.muteReasonAsks === true, `mute=${m2.muteReasonAsks}`);
}

/* ── S12. Undo after a merge keeps the merged-in start ── */
{
  seed(T0);
  const before = { id: "c1", starts: ["2026-10-05"], ends: {}, reasons: {} };
  const afterChange = { id: "c1", starts: ["2026-10-05", "2026-11-02"], ends: {}, reasons: {} };
  const j = J();
  useJournal.setState({
    journal: {
      ...j,
      settings: {
        ...j.settings,
        cycles: j.settings.cycles.map((c) => (c.id === "c1" ? { ...c, starts: ["2026-10-05", "2026-11-02", "2026-11-20"] } : c)),
      },
    },
    unlocked: true,
  });
  S().restoreCycleDates(before, afterChange);
  const tracker = J().settings.cycles.find((c) => c.id === "c1");
  const starts = [...(tracker?.starts ?? [])].sort();
  check("S12 undo removes its own start, keeps the merged-in one", JSON.stringify(starts) === JSON.stringify(["2026-10-05", "2026-11-20"]), `starts=${starts.join(",")}`);
}

console.log(`WAVE6-ARMOR: ${breaks} break(s), ${holds} hold(s)`);
if (breaks > 0) process.exitCode = 1;
