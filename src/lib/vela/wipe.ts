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
