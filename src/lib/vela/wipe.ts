/* The diary's inventory — every class of data a journal holds, named in one
 * place, so the solemn ceremonies erase from ONE list instead of each
 * remembering (and forgetting) its own: the couple wipe below, the device
 * forget and the forever-delete in store.ts. A data class added to types.ts
 * without being classified here fails the coverage fence in
 * tests/wave0-wipe.ts — the 2.1.27 lesson, generalized: what the inventory
 * does not name, an erasure silently leaves behind. */
import { defaultCycle } from "./cycle";
import type { Journal, Settings } from "./types";

/** Journal-level data: the recorded life. A wipe empties every one. */
export const JOURNAL_DATA_KEYS = [
  "profile",
  "partners",
  "sessions",
  "encounters",
  "people",
  "proposals",
  "quietDays",
  "pregnancyTests",
] as const;

/** Journal-level structure: bookkeeping that protects the erasure itself —
 * the tombstones keep deleted things deleted across merges, and the
 * clearedAt stamps tell a merge the emptiness is deliberate. Never wiped. */
export const JOURNAL_STRUCTURAL_KEYS = [
  "settings",
  "updatedAt",
  "clearedAt",
  "sessionsClearedAt",
  "encountersClearedAt",
  "partnersClearedAt",
  "deleted",
  "migrations",
] as const;

/** Settings that are diary data: they name people, places and days. */
export const SETTINGS_DATA_KEYS = [
  "customPlaces",
  "customPositions",
  "customProblems",
  "defaultPartner",
  "cycle",
  "cycles",
  "cycleSelected",
  "batchDraft",
  "storiesMuted",
  "anniversaries",
  "children",
  "archivedPeople",
  "coupleMode",
] as const;

/** Settings that are furniture: how the app looks and behaves on this
 * device. Erasing the diary leaves them standing. */
export const SETTINGS_FURNITURE_KEYS = [
  "theme",
  "mode",
  "weekStart",
  "discreet",
  "autoLockMins",
  "ratingStyle",
  "language",
  "themeVersion",
] as const;

/** The journal a fired wipe leaves behind: every data class in the
 * inventory emptied, the furniture untouched, the erasure itself armed
 * against resurrection — every proposal the wipe consumes is tombstoned,
 * and the clearedAt stamps are set so a later merge reads the emptiness
 * as a decision, not as missing data. */
export function wipedJournal(journal: Journal, now: number): Journal {
  const s = journal.settings;
  const settings: Settings = {
    theme: s.theme,
    mode: s.mode,
    weekStart: s.weekStart,
    discreet: s.discreet,
    autoLockMins: s.autoLockMins,
    ratingStyle: s.ratingStyle,
    language: s.language,
    ...(s.themeVersion !== undefined ? { themeVersion: s.themeVersion } : {}),
    customPlaces: [],
    customPositions: [],
    customProblems: [],
    defaultPartner: "",
    cycle: defaultCycle(),
    cycles: [],
    cycleSelected: "",
    anniversaries: [],
    children: [],
    archivedPeople: [],
  };
  const deleted: Record<string, number> = { ...(journal.deleted ?? {}) };
  for (const proposal of journal.proposals ?? []) deleted[proposal.id] = now;
  /* Every other class the merge unions by id or by value gets its
   * tombstone too (Round 2, RT2-H1 B1): without one, a stale device's
   * copy walks straight back in — trackers (the `cycle:` key format is
   * trackerTombstone's, cycle-trackers.ts), quiet marks, pregnancy
   * tests, anniversaries, children, people, the archive (`archived:`
   * + partnerKey), and the value classes the merge unions as strings
   * (customs and story mutes ride the off/on stamp pairs the store's
   * merge reads: `custom-:` / `mute-:`, keyed exactly as the actions
   * mint them). The clearedAt stamps in the return below remain the
   * armor for the cut classes (sessions, encounters, partners). */
  for (const tracker of journal.settings.cycles ?? []) deleted[`cycle:${tracker.id}`] = now;
  for (const mark of journal.quietDays ?? []) deleted[mark.id] = now;
  for (const test of journal.pregnancyTests ?? []) deleted[test.id] = now;
  for (const item of journal.settings.anniversaries ?? []) deleted[item.id] = now;
  for (const item of journal.settings.children ?? []) deleted[item.id] = now;
  for (const person of journal.people ?? []) deleted[person.id] = now;
  for (const person of journal.settings.archivedPeople ?? []) deleted[`archived:${person.name.trim().toLocaleLowerCase()}`] = now;
  for (const value of journal.settings.customPlaces ?? []) deleted[`custom-:places:${value}`] = now;
  for (const value of journal.settings.customPositions ?? []) deleted[`custom-:positions:${value}`] = now;
  for (const value of journal.settings.customProblems ?? []) deleted[`custom-:problems:${value}`] = now;
  for (const value of journal.settings.storiesMuted?.people ?? []) deleted[`mute-:person:${value.trim().toLocaleLowerCase()}`] = now;
  for (const value of journal.settings.storiesMuted?.days ?? []) deleted[`mute-:day:${value}`] = now;
  if (journal.settings.batchDraft) deleted["batchDraft"] = now;
  return {
    profile: null,
    settings,
    partners: [],
    sessions: [],
    encounters: [],
    updatedAt: now,
    clearedAt: now,
    sessionsClearedAt: now,
    encountersClearedAt: now,
    partnersClearedAt: now,
    deleted,
    ...(journal.migrations ? { migrations: journal.migrations } : {}),
    people: [],
    proposals: [],
    quietDays: [],
    pregnancyTests: [],
  };
}
