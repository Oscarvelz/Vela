// One-time split of mixed-partner encounters ("enc-split-1"). Fake data only.
// Run: node tests/run-enc-split.mjs
import "./node-shim";
import { ENC_SPLIT, linksOnly, pruneEmptyEncounters, runMigrations, splitEncounterId, splitMixedEncounters } from "../src/lib/vela/migrations";
import { journalFromUnknown, mergeJournals } from "../src/lib/vela/store";
import { partnerKey } from "../src/lib/vela/encounters";
import type { Journal, Session, Encounter } from "../src/lib/vela/types";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra: unknown = "") => {
  if (cond) pass += 1; else fail += 1;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}  ${typeof extra === "string" ? extra : JSON.stringify(extra)}`);
};
let seq = 1000;
const S = (o: Partial<Session>): Session => ({
  id: `s${seq}`, createdAt: 1_700_000_000_000 + seq++, partnerName: "", date: "2026-10-10", time: "21:00", place: "Bedroom",
  durationMins: 30, positions: ["Missionary"], intensity: 3, connection: 4, satisfaction: 4, energy: 3, overall: 4,
  notes: "n", ownWords: "w", contraception: [], problems: [], sessionNumber: 0, encounterId: "", ...o,
});
const E = (o: Partial<Encounter>): Encounter => ({
  id: "e1", createdAt: 1_700_000_000_000, title: "", startDate: "2026-10-10", endDate: "2026-10-10", partnerName: "",
  comment: "", problems: [], ...o,
});
const J = (sessions: Session[], encounters: Encounter[], extra: Partial<Journal> = {}): Journal =>
  journalFromUnknown({ profile: { displayName: "T", createdAt: 1 }, settings: {}, partners: [], sessions, encounters, updatedAt: 5, ...extra }, "en");
const own = (s: Session) => { const { encounterId, updatedAt, sessionNumber, ...rest } = s; return JSON.stringify(rest); };
const sameOwn = (a: Journal, b: Journal) => a.sessions.length === b.sessions.length && a.sessions.every((s) => own(s) === own(b.sessions.find((x) => x.id === s.id)!));
const members = (j: Journal, id: string) => j.sessions.filter((s) => s.encounterId === id);
const NOW = 1_800_000_000_000;

// 1) partner + partner (Fakeana ×2, Fakelu ×1 in Fakeana's encounter)
{
  const j0 = J([S({ id: "a1", partnerName: "Fakeana", encounterId: "e1" }), S({ id: "a2", partnerName: "Fakeana", encounterId: "e1" }), S({ id: "l1", partnerName: "Fakelu", encounterId: "e1" })],
    [E({ id: "e1", partnerName: "Fakeana", title: "Night with Fakeana", comment: "at the cabin", problems: ["Stress"] })]);
  const r = runMigrations(j0, NOW);
  const j = r.journal;
  const luId = splitEncounterId("e1", "fakelu");
  ok("pp: migration ran and marked", r.changed && (j.migrations ?? []).includes(ENC_SPLIT));
  ok("pp: original keeps Fakeana's 2", members(j, "e1").length === 2 && members(j, "e1").every((s) => s.partnerName === "Fakeana"));
  ok("pp: Fakelu moved to the derived id", members(j, luId).length === 1 && j.sessions.find((s) => s.id === "l1")!.encounterId === luId);
  const lu = j.encounters.find((e) => e.id === luId)!;
  ok("pp: new encounter is Fakelu's, comment+problems copied, title naming Fakeana dropped", lu.partnerName === "Fakelu" && lu.comment === "at the cabin" && lu.problems.join() === "Stress" && lu.title === "", lu);
  ok("pp: original title kept", j.encounters.find((e) => e.id === "e1")!.title === "Night with Fakeana");
  ok("pp: session count and own fields unchanged", sameOwn(j0, j));
  ok("pp: moved session + both encounters stamped", j.sessions.find((s) => s.id === "l1")!.updatedAt === NOW && lu.updatedAt === NOW && j.encounters.find((e) => e.id === "e1")!.updatedAt === NOW);
  ok("pp: kept sessions not restamped", j.sessions.find((s) => s.id === "a1")!.updatedAt === undefined);
  // rerun: no change
  const again = runMigrations(j, NOW + 5);
  ok("pp: rerun with marker does nothing", !again.changed && again.journal === j);
  const forced = splitMixedEncounters({ ...j, migrations: [] }, NOW + 5);
  ok("pp: split itself is idempotent (nothing mixed left)", forced.report.split === 0 && forced.journal.encounters.length === j.encounters.length);
  // reload persistence through serialize → journalFromUnknown
  const reloaded = journalFromUnknown(JSON.parse(JSON.stringify(j)), "en");
  ok("pp: reload keeps the split + marker", members(reloaded, luId).length === 1 && members(reloaded, "e1").length === 2 && (reloaded.migrations ?? []).includes(ENC_SPLIT));
  ok("pp: reload → second run is a no-op", !runMigrations(reloaded, NOW + 9).changed);
  // case/space-insensitive grouping
  const j2 = J([S({ id: "c1", partnerName: "Fakeana", encounterId: "e1" }), S({ id: "c2", partnerName: " fakeana ", encounterId: "e1" })], [E({ id: "e1", partnerName: "Fakeana" })]);
  ok("pp: 'Fakeana' and ' fakeana ' are one partner (no split)", !splitMixedEncounters(j2, NOW).report.split);
}

// 2) partner + solo
{
  const j0 = J([S({ id: "p1", partnerName: "Fakemar", encounterId: "e1" }), S({ id: "o1", partnerName: "", encounterId: "e1" }), S({ id: "o2", partnerName: "", encounterId: "e1" })],
    [E({ id: "e1", partnerName: "Fakemar" })]);
  const j = runMigrations(j0, NOW).journal;
  const soloId = splitEncounterId("e1", "");
  ok("ps: original stays Fakemar's even though solo is larger", members(j, "e1").map((s) => s.id).join() === "p1" && j.encounters.find((e) => e.id === "e1")!.partnerName === "Fakemar");
  ok("ps: solo sessions get a solo encounter", members(j, soloId).length === 2 && j.encounters.find((e) => e.id === soloId)!.partnerName === "");
  ok("ps: count unchanged", sameOwn(j0, j));
}

// 3) encounter whose own partner matches no group → largest keeps the original
{
  const j0 = J([S({ id: "x1", partnerName: "Fakelu", encounterId: "e1" }), S({ id: "x2", partnerName: "Fakelu", encounterId: "e1" }), S({ id: "x3", partnerName: "Fakemar", encounterId: "e1" })],
    [E({ id: "e1", partnerName: "Fakeana" })]);
  const j = runMigrations(j0, NOW).journal;
  ok("largest: Fakelu (2) keeps the original, renamed to Fakelu", members(j, "e1").length === 2 && j.encounters.find((e) => e.id === "e1")!.partnerName === "Fakelu");
  ok("largest: Fakemar gets the new one", members(j, splitEncounterId("e1", "fakemar")).length === 1);
}

// 4) multi-day encounter (Fri–Sun): Fakeana Sat+Sun, Fakelu Sun only, solo Fri
{
  const j0 = J([
    S({ id: "m1", partnerName: "Fakeana", date: "2026-10-24", encounterId: "w" }),
    S({ id: "m2", partnerName: "Fakeana", date: "2026-10-25", encounterId: "w" }),
    S({ id: "m3", partnerName: "Fakelu", date: "2026-10-25", encounterId: "w" }),
    S({ id: "m4", partnerName: "", date: "2026-10-23", encounterId: "w" }),
  ], [E({ id: "w", partnerName: "Fakeana", startDate: "2026-10-23", endDate: "2026-10-25", title: "Weekend" })]);
  const j = runMigrations(j0, NOW).journal;
  const w = j.encounters.find((e) => e.id === "w")!;
  const lu = j.encounters.find((e) => e.id === splitEncounterId("w", "fakelu"))!;
  const solo = j.encounters.find((e) => e.id === splitEncounterId("w", ""))!;
  ok("multi-day: Fakeana keeps 24–25 (Fri dropped: only the solo session put it there)", w.startDate === "2026-10-24" && w.endDate === "2026-10-25", w);
  ok("multi-day: Fakelu 25–25, title 'Weekend' copied", lu.startDate === "2026-10-25" && lu.endDate === "2026-10-25" && lu.title === "Weekend", lu);
  ok("multi-day: solo 23–23", solo.startDate === "2026-10-23" && solo.endDate === "2026-10-23", solo);
  ok("multi-day: 4 sessions before and after", sameOwn(j0, j) && j.sessions.length === 4);
}

// 5) clean journal: no change (only the marker is added)
{
  const j0 = J([S({ id: "k1", partnerName: "Fakeana", encounterId: "e1" }), S({ id: "k2", partnerName: "Fakelu", date: "2026-10-11", encounterId: "e2" })],
    [E({ id: "e1", partnerName: "Fakeana" }), E({ id: "e2", partnerName: "Fakelu", startDate: "2026-10-11", endDate: "2026-10-11" })]);
  const r = runMigrations(j0, NOW);
  ok("clean: encounters and sessions identical", JSON.stringify(r.journal.sessions) === JSON.stringify(j0.sessions) && JSON.stringify(r.journal.encounters) === JSON.stringify(j0.encounters));
  ok("clean: only the marker is new", (r.journal.migrations ?? []).join() === ENC_SPLIT);
}

// 6) two devices both migrate, then sync → no duplicates, split kept
{
  const raw = {
    profile: { displayName: "T", createdAt: 1 }, settings: {}, partners: [], updatedAt: 5,
    sessions: [S({ id: "d1", partnerName: "Fakeana", encounterId: "e9" }), S({ id: "d2", partnerName: "Fakelu", encounterId: "e9" }), S({ id: "d3", partnerName: "", encounterId: "e9" })],
    encounters: [E({ id: "e9", partnerName: "Fakeana" })],
  };
  const devA = { ...runMigrations(journalFromUnknown(JSON.parse(JSON.stringify(raw)), "en"), NOW).journal, updatedAt: NOW };
  const devB = { ...runMigrations(journalFromUnknown(JSON.parse(JSON.stringify(raw)), "es"), NOW + 777).journal, updatedAt: NOW + 777 };
  const m = mergeJournals(devA, devB);
  ok("2 devices: same ids on both", JSON.stringify(devA.encounters.map((e) => e.id).sort()) === JSON.stringify(devB.encounters.map((e) => e.id).sort()));
  ok("2 devices: merged has 3 encounters, 3 sessions, no dup", m.encounters.length === 3 && m.sessions.length === 3, m.encounters.map((e) => e.id));
  ok("2 devices: each encounter one partner", m.encounters.every((e) => new Set(members(m, e.id).map((s) => partnerKey(s.partnerName))).size === 1));
  ok("2 devices: marker unioned", (m.migrations ?? []).includes(ENC_SPLIT));
  // A migrated device syncs with a device that has NOT migrated yet: the split survives
  const old = { ...journalFromUnknown(JSON.parse(JSON.stringify(raw)), "en"), updatedAt: NOW + 999 };
  const m2 = mergeJournals(devA, old);
  ok("old device syncs later: split survives (no re-merge)", m2.encounters.length === 3 && new Set(m2.sessions.map((s) => s.encounterId)).size === 3);
  const m3 = mergeJournals(old, devA);
  ok("…either direction", m3.encounters.length === 3 && new Set(m3.sessions.map((s) => s.encounterId)).size === 3);
  ok("…and after it the marker is set, so nothing runs again", !runMigrations(journalFromUnknown(JSON.parse(JSON.stringify(m2)), "en"), NOW + 2000).changed);
}

// 7) Safety: if anything would change a session's own fields or count, abort and keep the data untouched
{
  const a = [S({ id: "z1", partnerName: "Fakeana" }), S({ id: "z2", partnerName: "Fakelu" })];
  ok("safety: links-only change passes", linksOnly(a, a.map((s) => ({ ...s, encounterId: "x", updatedAt: 9 }))) === null);
  ok("safety: a lost session is caught", linksOnly(a, a.slice(0, 1)) === "count");
  ok("safety: a changed own field is caught", linksOnly(a, a.map((s) => ({ ...s, overall: 1 }))) === "fields");
}

// 8) Empty-encounter tidy: tombstoned, sessions untouched
{
  const j0 = J([S({ id: "t1", partnerName: "Fakeana", encounterId: "e1" })], [E({ id: "e1", partnerName: "Fakeana" }), E({ id: "e0", partnerName: "Fakelu" })]);
  const r = pruneEmptyEncounters(j0, NOW);
  ok("tidy: empty encounter dropped with a tombstone", r.removed === 1 && !r.journal.encounters.some((e) => e.id === "e0") && r.journal.deleted?.e0 === NOW);
  const synced = mergeJournals({ ...r.journal, updatedAt: NOW }, { ...j0, updatedAt: 6 });
  ok("tidy: a sync with the old copy doesn't bring it back", !synced.encounters.some((e) => e.id === "e0"));
}

// 9) Orphan sessions get a deterministic encounter id (two devices agree) created after an encounters wipe
{
  const raw = { profile: { displayName: "T", createdAt: 1 }, settings: {}, updatedAt: 5, encountersClearedAt: 1_750_000_000_000, sessions: [S({ id: "o9", partnerName: "Fakeana", encounterId: "" })], encounters: [] };
  const a = journalFromUnknown(JSON.parse(JSON.stringify(raw)), "en");
  const b = journalFromUnknown(JSON.parse(JSON.stringify(raw)), "en");
  ok("orphans: same id on two loads", a.encounters[0]?.id === b.encounters[0]?.id && a.encounters[0]?.id === "eo-o9");
  ok("orphans: created after the wipe cut", (a.encounters[0]?.createdAt ?? 0) > 1_750_000_000_000);
  const m = mergeJournals({ ...a, updatedAt: 10 }, { ...b, updatedAt: 11 });
  ok("orphans: merge keeps exactly one", m.encounters.length === 1);
}

console.log(`\nenc-split: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
