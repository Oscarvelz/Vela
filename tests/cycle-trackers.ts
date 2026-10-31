// Multi-person cycle trackers: migration, isolation, session → tracker mapping, two-device merge.
// Fake data only. Run: node tests/run-cycle-check.mjs
import "./node-shim";
import { cleanCycle, cycleSnapshot, sessionsByPhase, withDayLog, withEnd, withStart, withoutStart } from "../src/lib/vela/cycle";
import {
  FIRST_TRACKER_ID,
  activeTracker,
  cleanTrackers,
  mergeTracker,
  mergeTrackerLists,
  restamp,
  sessionPhase,
  sessionsByPhaseFor,
  trackerForPartner,
  trackerTombstone,
  visibleTrackers,
  type CycleTracker,
} from "../src/lib/vela/cycle-trackers";
import { journalFromUnknown, mergeJournals, selectActiveCycle } from "../src/lib/vela/store";

let fails = 0;
const ok = (name: string, cond: boolean, extra: unknown = "") => {
  if (!cond) fails += 1;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra !== "" ? "  — " + JSON.stringify(extra) : ""}`);
};
const today = "2026-06-10";
const json = (value: unknown) => JSON.stringify(value);

/* 1. Migration of a legacy single cycle */
const legacyCycle = {
  enabled: true,
  perspective: "partner",
  partnerName: "Ana",
  periodDays: 6,
  cycleDays: 30,
  lutealDays: 13,
  fertileDays: 4,
  starts: ["2026-03-01", "2026-03-30", "2026-04-28", "2026-05-27"],
  ends: { "2026-03-01": "2026-03-05" },
  days: { "2026-03-02": { flow: "medium", mood: "calm" } },
};
const legacyJournal = {
  profile: { displayName: "Test", createdAt: 1 },
  settings: { theme: "firmament", themeVersion: 2, cycle: legacyCycle },
  partners: ["Ana"],
  sessions: [],
  encounters: [],
  updatedAt: 100,
};
const migrated = journalFromUnknown(legacyJournal, "en");
const t1 = migrated.settings.cycles[0];
ok("legacy vault loads with one tracker", migrated.settings.cycles.length === 1);
ok("tracker #1 id is fixed (c1)", t1.id === FIRST_TRACKER_ID);
ok("migration is lossless", json(cleanCycle(t1)) === json(cleanCycle(legacyCycle)), cleanCycle(t1));
ok("legacy mirror equals tracker #1", json(migrated.settings.cycle) === json(cleanCycle(legacyCycle)));
ok("selected = tracker #1", migrated.settings.cycleSelected === "c1" && selectActiveCycle({ journal: migrated }).id === "c1");
const again = journalFromUnknown(JSON.parse(json(migrated)), "en");
ok("migration is idempotent (load → save → load)", json(again.settings) === json(migrated.settings));
ok("cleanTrackers idempotent", json(cleanTrackers(cleanTrackers(undefined, legacyCycle), undefined)) === json(cleanTrackers(undefined, legacyCycle)));
const empty = journalFromUnknown({ profile: null, settings: {} }, "en");
ok("no cycle at all → one disabled tracker", empty.settings.cycles.length === 1 && !empty.settings.cycles[0].enabled);
ok("junk cycles entries ignored", cleanTrackers([null, 3, { id: "x y", starts: ["bad"] }], undefined).length === 1);
ok("duplicate ids are separated", new Set(cleanTrackers([{ id: "a" }, { id: "a" }], undefined).map((t) => t.id)).size === 2);
ok("two devices migrating alone get the same id", journalFromUnknown(legacyJournal, "es").settings.cycles[0].id === t1.id);

/* 2. Per-tracker isolation */
const mk = (over: Partial<CycleTracker>): CycleTracker => cleanTrackers([over], undefined)[0];
const self = mk({ id: "me", enabled: true, perspective: "self", starts: ["2026-05-01", "2026-05-29"] });
const ana = mk({ id: "ana", enabled: true, perspective: "partner", partnerLink: "Ana", starts: ["2026-05-15"] });
const bea = mk({ id: "bea", enabled: true, perspective: "partner", partnerName: "Bea", starts: ["2026-05-20"] });
const anaMore = restamp(ana, { ...ana, ...withStart(ana, "2026-06-09") }, 1000);
ok("adding a start to one tracker leaves the others", anaMore.starts.length === 2 && self.starts.length === 2 && bea.starts.length === 1);
ok("restamp records the change", anaMore.stamps["s:2026-06-09"] === 1000 && anaMore.updatedAt === 1000 && anaMore.metaAt === 0);
ok("snapshots differ per tracker", cycleSnapshot(self, today).day !== cycleSnapshot(ana, today).day, [cycleSnapshot(self, today).day, cycleSnapshot(ana, today).day]);
const renamed = restamp(bea, { ...bea, partnerName: "Beatriz" }, 2000);
ok("rename stamps settings (metaAt)", renamed.metaAt === 2000 && Object.keys(renamed.stamps).length === 0);
const paused = { ...bea, enabled: false };
ok("paused tracker hidden", visibleTrackers([self, ana, paused]).length === 2);
ok("selected paused → falls back to a visible one", activeTracker([paused, ana], "bea").id === "ana");
ok("selection remembered", activeTracker([self, ana, bea], "bea").id === "bea");
ok("unknown selection → first visible", activeTracker([paused, self], "zzz").id === "me");

/* 3. Session → tracker */
const all = [self, ana, bea];
ok("partner tracker by saved-partner link", trackerForPartner(all, "Ana")?.id === "ana");
ok("partner tracker by typed name, any case", trackerForPartner(all, " bea ")?.id === "bea");
ok("unknown partner → self tracker", trackerForPartner(all, "Cleo")?.id === "me");
ok("no partner → self tracker", trackerForPartner(all, "")?.id === "me");
ok("no self, unknown partner → none", trackerForPartner([ana, bea], "Cleo") === null);
ok("single tracker applies to everyone (old behaviour)", trackerForPartner([ana], "Cleo")?.id === "ana" && trackerForPartner([ana], "")?.id === "ana");
ok("paused partner tracker → falls to self", trackerForPartner([self, { ...ana, enabled: false }], "Ana")?.id === "me");
ok("nothing on → none", trackerForPartner([{ ...self, enabled: false }], "Ana") === null);
const sessions = [
  { date: "2026-05-16", partnerName: "Ana" }, // Ana day 2 → period
  { date: "2026-05-02", partnerName: "Cleo" }, // self day 2 → period
  { date: "2026-05-22", partnerName: "Bea" }, // Bea day 3 → period
];
ok("session phase uses its own tracker", sessions.every((s) => sessionPhase(all, s, today) === "period"), sessions.map((s) => sessionPhase(all, s, today)));
const counts = sessionsByPhaseFor(all, sessions, today);
ok("sessionsByPhaseFor counts each session once by its tracker", counts.period === 3 && counts.quiet + counts.fertile + counts.ovulation === 0, counts);
const one = cleanTrackers(undefined, { ...legacyCycle, perspective: "self" });
const legacyCounts = sessionsByPhase(cleanCycle(legacyCycle), ["2026-03-02", "2026-04-10", "2026-05-01"], today);
ok("single tracker: same counts as before", json(sessionsByPhaseFor(one, ["2026-03-02", "2026-04-10", "2026-05-01"].map((date) => ({ date, partnerName: "X" })), today)) === json(legacyCounts));
ok("session before the tracker's first start → no phase", sessionPhase(all, { date: "2026-01-01", partnerName: "Ana" }, today) === null);

/* 4. Merge of two devices */
// Device A logs a start for Ana and removes an old self start; device B logs a day for self and adds a tracker.
const base = [self, ana];
const aSelf = restamp(self, { ...self, ...withoutStart(self, "2026-05-01") }, 3000);
const aAna = restamp(ana, { ...ana, ...withEnd(withStart(ana, "2026-06-09"), "2026-05-15", "2026-05-19") }, 3100);
const bSelf = restamp(self, { ...self, ...withDayLog(self, "2026-05-30", { flow: "light" }) }, 3200);
const bNew = mk({ id: "cleo", enabled: true, perspective: "partner", partnerName: "Cleo", starts: ["2026-06-01"], updatedAt: 3300, metaAt: 3300, stamps: { "s:2026-06-01": 3300 } });
const merged = mergeTrackerLists([bSelf, ana, bNew], [aSelf, aAna]);
const mSelf = merged.find((t) => t.id === "me")!;
const mAna = merged.find((t) => t.id === "ana")!;
ok("merge keeps every tracker", merged.length === 3 && merged.some((t) => t.id === "cleo"), merged.map((t) => t.id));
ok("merge: A's removal wins over B's untouched copy", !mSelf.starts.includes("2026-05-01") && mSelf.starts.includes("2026-05-29"), mSelf.starts);
ok("merge: B's day log kept", mSelf.days["2026-05-30"]?.flow === "light");
ok("merge: A's Ana start and end kept", mAna.starts.includes("2026-06-09") && mAna.ends["2026-05-15"] === "2026-05-19", mAna);
ok("merge is symmetric", json(mergeTrackerLists([aSelf, aAna], [bSelf, ana, bNew]).map((t) => cleanCycle(t)).sort((x, y) => json(x).localeCompare(json(y)))) === json(merged.map((t) => cleanCycle(t)).sort((x, y) => json(x).localeCompare(json(y)))));
ok("merge is idempotent", json(mergeTracker(mSelf, mSelf)) === json(mSelf));
const readded = restamp(aSelf, { ...aSelf, ...withStart(aSelf, "2026-05-01") }, 4000);
ok("re-adding after removal wins (newer stamp)", mergeTracker(readded, aSelf).starts.includes("2026-05-01"));
const renameA = restamp(bea, { ...bea, partnerName: "Beatriz" }, 5000);
const logB = restamp(bea, { ...bea, ...withStart(bea, "2026-06-15") }, 6000);
const mBea = mergeTracker(renameA, logB);
ok("merge: A's rename + B's newer log both survive", mBea.partnerName === "Beatriz" && mBea.starts.includes("2026-06-15"), mBea);
ok("merge: removed tracker stays removed", mergeTrackerLists([self], [self, ana], { [trackerTombstone("ana")]: 9999 }).length === 1);
ok("merge: tracker changed after removal comes back", mergeTrackerLists([self], [self, { ...ana, updatedAt: 10000 }], { [trackerTombstone("ana")]: 9999 }).length === 2);
// Legacy (no stamps) on one side, multi-tracker on the other: union, nothing lost.
const oldDevice = journalFromUnknown({ ...legacyJournal, updatedAt: 50, settings: { ...legacyJournal.settings, cycle: { ...legacyCycle, starts: [...legacyCycle.starts, "2026-06-25"] } } }, "en");
const newDevice = journalFromUnknown(legacyJournal, "en");
const addB = restamp(newDevice.settings.cycles[0], { ...newDevice.settings.cycles[0], ...withDayLog(newDevice.settings.cycles[0], "2026-05-28", { mood: "happy" }) }, 7000);
newDevice.settings = { ...newDevice.settings, cycles: [addB, bNew] };
newDevice.updatedAt = 7000;
const mj = mergeJournals(newDevice, oldDevice);
const mc1 = mj.settings.cycles.find((t) => t.id === "c1")!;
ok("journal merge: legacy device's new start kept", mc1.starts.includes("2026-06-25"), mc1.starts);
ok("journal merge: new device's day log kept", mc1.days["2026-05-28"]?.mood === "happy");
ok("journal merge: extra tracker kept", mj.settings.cycles.some((t) => t.id === "cleo"));
ok("journal merge: legacy mirror = first tracker", json(mj.settings.cycle) === json(cleanCycle(mj.settings.cycles[0])));
const mj2 = mergeJournals(oldDevice, newDevice);
ok("journal merge symmetric for c1 history", json(cleanCycle(mj2.settings.cycles.find((t) => t.id === "c1")!)) === json(cleanCycle(mc1)));
const reloaded = journalFromUnknown(JSON.parse(json(mj)), "en");
ok("merged journal survives save/load", json(reloaded.settings.cycles) === json(mj.settings.cycles));

console.log(fails ? `\n${fails} FAILED` : "\nTRACKERS ALL PASS");
process.exit(fails ? 1 : 0);
