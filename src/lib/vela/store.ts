import { create } from "zustand";
import { PLACES, POSITIONS, PROBLEMS, namedPlace, type Mode, type RatingStyle, type ThemeId, type WeekStart } from "./catalog";
import { coverDates, coveringEncounter } from "./encounters";
import { MIN_PASSPHRASE, asEnvelope, newVaultKey, open, openWithPassphrase, randomBytes, seal, toB64, type VaultKey } from "./vault-crypto";
import { deleteSync, deleteVault, readUi, readVault, writeUi, writeVault } from "./vault-db";
import { addDays, nowTime, pad, todayStr } from "./dates";
import type { BatchEntry } from "./batch";
import { composedNote } from "./notes";
import { renumber, sessionsSorted, type CompareMode } from "./stats";
import type { Draft, Encounter, Journal, JournalWipe, Profile, Session, Settings, TabId } from "./types";
import type { Lang } from "./copy";
import { bumpGrace, claimGrace, dropGrace, parkKey } from "./grace";
import { cleanCycle, withDayLog, withEnd, withStart, withoutStart, type CycleSettings, type DayLog } from "./cycle";
import {
  MAX_TRACKERS,
  activeTracker,
  asLegacyCycle,
  cleanTracker,
  cleanTrackers,
  defaultTracker,
  mergeTrackerLists,
  newTrackerId,
  restamp,
  selectedId,
  trackerTombstone,
  type CycleTracker,
} from "./cycle-trackers";
import { clearFingerprint, rememberPass, resetFingerprintPrompt, rewrapFingerprint } from "./fingerprint";
import { useBioUi } from "./bio-offer";
import { bioText } from "./bio-copy";

/** Old plaintext journal key (Grok build). Only read for the one-time migration. */
export const DB_KEY = "afterglow_pwa_v1";
export const LANG_KEY = "vela_pwa_lang";

const THEME_IDS: ThemeId[] = ["firmament", "velvet", "noir", "rose", "ocean", "emerald"];

function readLang(): Lang {
  if (typeof localStorage === "undefined") return "en";
  const ui = readUi();
  if (ui.language === "es" || ui.language === "en") return ui.language;
  if (localStorage.getItem(LANG_KEY) === "es") return "es";
  return typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("es") ? "es" : "en";
}

export function defaultSettings(language: Lang = "en"): Settings {
  return {
    theme: "firmament",
    mode: "night",
    weekStart: "monday",
    discreet: false,
    autoLockMins: 5,
    ratingStyle: "flame",
    language,
    customPlaces: [],
    customPositions: [],
    customProblems: [],
    defaultPartner: "",
    cycle: asLegacyCycle(defaultTracker()),
    cycles: [defaultTracker()],
    cycleSelected: defaultTracker().id,
    themeVersion: 2,
  };
}

function asSettings(raw: unknown, language: Lang): Settings {
  const base = defaultSettings(language);
  if (!raw || typeof raw !== "object") return base;
  const s = raw as Partial<Settings>;
  return {
    // Firmament became the signature theme: journals still on the old default (Velvet) move to it once.
    theme:
      s.themeVersion !== 2 && (s.theme === "velvet" || !s.theme)
        ? "firmament"
        : THEME_IDS.includes(s.theme as ThemeId)
          ? (s.theme as ThemeId)
          : base.theme,
    themeVersion: 2,
    mode: s.mode === "day" ? "day" : "night",
    weekStart: s.weekStart === "sunday" ? "sunday" : "monday",
    discreet: Boolean(s.discreet),
    autoLockMins: typeof s.autoLockMins === "number" && s.autoLockMins >= 0 ? s.autoLockMins : 5,
    ratingStyle: s.ratingStyle === "star" || s.ratingStyle === "heart" ? s.ratingStyle : "flame",
    language: s.language === "es" ? "es" : s.language === "en" ? "en" : language,
    customPlaces: Array.isArray(s.customPlaces) ? s.customPlaces.filter((x) => typeof x === "string") : [],
    customPositions: Array.isArray(s.customPositions)
      ? s.customPositions.filter((x) => typeof x === "string")
      : [],
    customProblems: Array.isArray(s.customProblems) ? s.customProblems.filter((x) => typeof x === "string") : [],
    defaultPartner: typeof s.defaultPartner === "string" ? s.defaultPartner : "",
    ...cycleFields(s),
  };
}

/** Cycle trackers of any settings object (old single-cycle journals migrate into tracker "c1"). */
function cycleFields(s: Partial<Settings>) {
  const cycles = cleanTrackers(s.cycles, s.cycle);
  return { cycle: asLegacyCycle(cycles[0]), cycles, cycleSelected: selectedId(cycles, s.cycleSelected) };
}

/** The tracker the cycle card, header pill and calendar show. */
export function selectActiveCycle(state: { journal: Journal }): CycleTracker {
  const settings = state.journal.settings;
  return activeTracker(settings.cycles, settings.cycleSelected);
}

function asSession(raw: unknown, index: number): Session | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<Session>;
  if (typeof s.date !== "string") return null;
  return {
    id: typeof s.id === "string" ? s.id : `s${Date.now().toString(36)}${index}`,
    createdAt: typeof s.createdAt === "number" ? s.createdAt : Date.now() + index,
    partnerName: typeof s.partnerName === "string" ? s.partnerName : "",
    date: s.date,
    time: typeof s.time === "string" ? s.time : "21:00",
    place: typeof s.place === "string" ? s.place : "Bedroom",
    durationMins: Number(s.durationMins) || 30,
    positions: Array.isArray(s.positions) ? s.positions.map(String) : [],
    intensity: Number(s.intensity) || 0,
    connection: Number(s.connection) || 0,
    satisfaction: Number(s.satisfaction) || 0,
    energy: Number(s.energy) || 0,
    overall: Number(s.overall) || 5,
    notes: typeof s.notes === "string" ? s.notes : "",
    ownWords: typeof s.ownWords === "string" ? s.ownWords : "",
    contraception: Array.isArray(s.contraception) ? s.contraception.filter((item) => typeof item === "string") : [],
    problems: Array.isArray(s.problems) ? s.problems.filter((item) => typeof item === "string") : [],
    sessionNumber: Number(s.sessionNumber) || 0,
    encounterId: typeof s.encounterId === "string" ? s.encounterId : "",
    updatedAt: typeof s.updatedAt === "number" ? s.updatedAt : undefined,
  };
}

function asEncounter(raw: unknown, index: number): Encounter | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Partial<Encounter>;
  if (typeof e.startDate !== "string" || typeof e.endDate !== "string") return null;
  const start = e.startDate <= e.endDate ? e.startDate : e.endDate;
  const end = e.startDate <= e.endDate ? e.endDate : e.startDate;
  return {
    id: typeof e.id === "string" ? e.id : `e${Date.now().toString(36)}${index}`,
    createdAt: typeof e.createdAt === "number" ? e.createdAt : Date.now() + index,
    title: typeof e.title === "string" ? e.title : "",
    startDate: start,
    endDate: end,
    partnerName: typeof e.partnerName === "string" ? e.partnerName : "",
    comment: typeof e.comment === "string" ? e.comment : "",
    problems: Array.isArray(e.problems) ? e.problems.filter((item) => typeof item === "string") : [],
    updatedAt: typeof e.updatedAt === "number" ? e.updatedAt : undefined,
  };
}

export function journalFromUnknown(raw: unknown, language: Lang = readLang()): Journal {
  const empty: Journal = {
    profile: null,
    settings: defaultSettings(language),
    partners: [],
    sessions: [],
    encounters: [],
    updatedAt: 0,
    clearedAt: 0,
  };
  if (!raw || typeof raw !== "object") return empty;
  try {
    const data = raw as Partial<Journal>;
    const settings = asSettings(data.settings, language);
    const sessions = renumber(
      (Array.isArray(data.sessions) ? data.sessions : [])
        .map(asSession)
        .filter((s): s is Session => Boolean(s)),
    );
    const partners = Array.isArray(data.partners) ? data.partners.filter((p) => typeof p === "string") : [];
    const partnersClearedAt = Math.max(
      typeof data.partnersClearedAt === "number" ? data.partnersClearedAt : 0,
      typeof data.clearedAt === "number" ? data.clearedAt : 0,
    );
    for (const s of sessions) {
      if (s.createdAt <= partnersClearedAt) continue;
      if (s.partnerName && !partners.includes(s.partnerName)) partners.push(s.partnerName);
    }
    const profileRaw = data.profile;
    const profile: Profile | null =
      profileRaw && typeof profileRaw === "object"
        ? {
            displayName: typeof profileRaw.displayName === "string" ? profileRaw.displayName : "",
            createdAt: typeof profileRaw.createdAt === "number" ? profileRaw.createdAt : Date.now(),
          }
        : null;
    const encounters = (Array.isArray(data.encounters) ? data.encounters : [])
      .map(asEncounter)
      .filter((e): e is Encounter => Boolean(e));
    const known = new Set(encounters.map((e) => e.id));
    for (const session of sessions) {
      if (session.encounterId && !known.has(session.encounterId)) session.encounterId = "";
      const spotted = namedPlace([session.place, session.notes, session.ownWords].filter(Boolean).join(". "));
      if (spotted) session.place = spotted;
    }
    for (const encounter of encounters) {
      const spotted = namedPlace(encounter.comment);
      if (!spotted) continue;
      for (const session of sessions) {
        if (session.encounterId === encounter.id && !namedPlace(session.place)) session.place = spotted;
      }
    }
    const housed = attachOrphans(sessions, encounters);
    return {
      profile,
      settings,
      partners,
      sessions,
      encounters: housed,
      updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : 0,
      clearedAt: typeof data.clearedAt === "number" ? data.clearedAt : 0,
      sessionsClearedAt: typeof data.sessionsClearedAt === "number" ? data.sessionsClearedAt : 0,
      encountersClearedAt: typeof data.encountersClearedAt === "number" ? data.encountersClearedAt : 0,
      partnersClearedAt: typeof data.partnersClearedAt === "number" ? data.partnersClearedAt : 0,
      deleted: cleanDeleted(data.deleted),
    };
  } catch {
    return empty;
  }
}

function cleanDeleted(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, at] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof at === "number" && Number.isFinite(at)) out[id] = at;
  }
  return out;
}

function stamp(item: { createdAt: number; updatedAt?: number }) {
  return item.updatedAt ?? item.createdAt;
}

function tombstone(journal: Journal, ids: string[]) {
  const deleted = { ...(journal.deleted ?? {}) };
  const at = Date.now();
  for (const id of ids) deleted[id] = at;
  return deleted;
}

export function mergeJournals(local: Journal, remote: Journal): Journal {
  const older = local.updatedAt >= remote.updatedAt ? remote : local;
  const newer = older === local ? remote : local;
  if (!local.profile && remote.profile) return remote;
  if (local.profile && !remote.profile) return local;
  const sessionCut = Math.max(local.sessionsClearedAt ?? 0, remote.sessionsClearedAt ?? 0, local.clearedAt ?? 0, remote.clearedAt ?? 0);
  const encounterCut = Math.max(local.encountersClearedAt ?? 0, remote.encountersClearedAt ?? 0, local.clearedAt ?? 0, remote.clearedAt ?? 0);
  const partnerCut = Math.max(local.partnersClearedAt ?? 0, remote.partnersClearedAt ?? 0, local.clearedAt ?? 0, remote.clearedAt ?? 0);
  const deleted = { ...(older.deleted ?? {}) };
  for (const [id, at] of Object.entries(newer.deleted ?? {})) deleted[id] = Math.max(deleted[id] ?? 0, at);
  // Per item: the copy with the newer updatedAt wins; a deletion marker newer than the item removes it.
  const keep = <T extends { id: string; createdAt: number; updatedAt?: number }>(items: T[], cut: number) => {
    const map = new Map<string, T>();
    for (const item of items) {
      if (item.createdAt <= cut) continue;
      const gone = deleted[item.id];
      if (gone && gone >= stamp(item)) continue;
      const prev = map.get(item.id);
      if (prev && stamp(prev) > stamp(item)) continue;
      map.set(item.id, item);
    }
    return [...map.values()];
  };
  const sessions = keep([...older.sessions, ...newer.sessions], sessionCut);
  const encounters = keep([...older.encounters, ...newer.encounters], encounterCut);
  const livePartners = new Set<string>();
  for (const side of [older, newer]) {
    if (side.updatedAt <= partnerCut) continue;
    for (const name of side.partners) livePartners.add(name);
  }
  if (partnerCut === 0) {
    for (const session of sessions) {
      if (session.partnerName) livePartners.add(session.partnerName);
    }
  }
  const cycles = mergeTrackerLists(newer.settings.cycles, older.settings.cycles, deleted);
  const settings: Settings = {
    ...newer.settings,
    cycles,
    cycle: asLegacyCycle(cycles[0]),
    cycleSelected: selectedId(cycles, newer.settings.cycleSelected),
  };
  return {
    ...newer,
    settings,
    partners: [...livePartners],
    sessions: renumber(sessions),
    encounters,
    clearedAt: Math.max(local.clearedAt ?? 0, remote.clearedAt ?? 0),
    sessionsClearedAt: Math.max(local.sessionsClearedAt ?? 0, remote.sessionsClearedAt ?? 0),
    encountersClearedAt: Math.max(local.encountersClearedAt ?? 0, remote.encountersClearedAt ?? 0),
    partnersClearedAt: Math.max(local.partnersClearedAt ?? 0, remote.partnersClearedAt ?? 0),
    deleted,
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
  };
}

/** Reads the old plaintext journal (Grok build), if this device still has one. */
export function readLegacyJournal(): Journal | null {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return null;
    const journal = journalFromUnknown(JSON.parse(raw), readLang());
    return journal.profile || journal.sessions.length ? journal : null;
  } catch {
    return null;
  }
}

export function removeLegacyJournal() {
  try {
    localStorage.removeItem(DB_KEY);
    localStorage.removeItem(LANG_KEY);
  } catch {
    /* ignore */
  }
}

/* The derived key lives only in this module's memory while unlocked. */
let sessionKey: VaultKey | null = null;
let vaultIdMem = "";
let writing: Promise<void> = Promise.resolve();
let queued: Journal | null = null;

export function currentKey() {
  return sessionKey;
}

function rememberUi(journal: Journal) {
  writeUi({
    theme: journal.settings.theme,
    mode: journal.settings.mode,
    language: journal.settings.language,
    discreet: journal.settings.discreet,
  });
}

/** Encrypts and writes the newest journal. Writes are serialized; only the latest is kept. */
function persist(journal: Journal): Promise<void> {
  rememberUi(journal);
  if (!sessionKey || !journal.profile) return writing;
  const first = queued === null;
  queued = journal;
  if (!first) return writing;
  writing = writing.then(async () => {
    while (queued && sessionKey) {
      const next = queued;
      const vk = sessionKey;
      try {
        const envelope = await seal(vk, next);
        await writeVault({ vaultId: vaultIdMem, envelope, savedAt: Date.now() });
      } catch {
        /* keep working in memory; the next change retries */
      }
      if (queued === next) queued = null;
    }
    queued = null;
  });
  return writing;
}

export function flushSaves() {
  return writing;
}

function lockedShell(language: Lang = readLang()): Journal {
  const ui = readUi();
  const settings = defaultSettings(language);
  if (THEME_IDS.includes(ui.theme as ThemeId)) settings.theme = ui.theme as ThemeId;
  if (ui.mode === "day") settings.mode = "day";
  settings.discreet = Boolean(ui.discreet);
  return { profile: null, settings, partners: [], sessions: [], encounters: [], updatedAt: 0 };
}

function newId() {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function blankDraft(): Draft {
  return {
    date: todayStr(),
    time: nowTime(),
    partnerName: "",
    newPartner: "",
    place: "Bedroom",
    customPlace: "",
    durationMins: 30,
    positions: [],
    intensity: 0,
    connection: 0,
    satisfaction: 0,
    energy: 0,
    overall: 5,
    ownWords: "",
    prevNote: "",
    contraception: [],
    problems: [],
    encounterId: "",
    encounterTitle: "",
    encounterStart: "",
    encounterEnd: "",
    encounterProblems: [],
  };
}

function attachOrphans(sessions: Session[], encounters: Encounter[]) {
  const next = encounters.slice();
  const known = new Set(next.map((encounter) => encounter.id));
  for (const session of sessions) {
    if (session.encounterId && known.has(session.encounterId)) continue;
    const cover = next.find(
      (encounter) =>
        encounter.startDate <= session.date &&
        session.date <= encounter.endDate &&
        (!encounter.partnerName || !session.partnerName || encounter.partnerName === session.partnerName),
    );
    if (cover) {
      session.encounterId = cover.id;
      if (!cover.partnerName && session.partnerName) cover.partnerName = session.partnerName;
      continue;
    }
    const id = `e${(session.createdAt || Date.now()).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    next.push({
      id,
      createdAt: session.createdAt || Date.now(),
      title: "",
      startDate: session.date,
      endDate: session.date,
      partnerName: session.partnerName,
      comment: "",
      problems: [],
    });
    known.add(id);
    session.encounterId = id;
  }
  return next;
}

function ensureCovering(journal: Journal, date: string, partner: string) {
  const existing = coveringEncounter(journal.encounters, date);
  if (existing) return { encounters: journal.encounters, encounterId: existing.id };
  const id = `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return {
    encounters: [
      ...journal.encounters,
      { id, createdAt: Date.now(), title: "", startDate: date, endDate: date, partnerName: partner, comment: "", problems: [] },
    ],
    encounterId: id,
  };
}

function bindEncounter(journal: Journal, draft: Draft, partner: string) {
  const encounters = journal.encounters.slice();
  if (!draft.encounterId) return { encounters, encounterId: "" };
  const start = draft.encounterStart || draft.date;
  const end = draft.encounterEnd || draft.date;
  const chosen = [start, end, draft.date];
  if (draft.encounterId === "new") {
    const span = coverDates(chosen);
    const id = `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    encounters.push({
      id,
      createdAt: Date.now(),
      title: draft.encounterTitle.trim(),
      startDate: span.startDate,
      endDate: span.endDate,
      partnerName: partner,
      comment: "",
      problems: draft.encounterProblems.slice(),
    });
    return { encounters, encounterId: id };
  }
  const index = encounters.findIndex((item) => item.id === draft.encounterId);
  if (index < 0) return { encounters, encounterId: "" };
  const current = encounters[index];
  const span = coverDates([
    ...chosen,
    ...journal.sessions.filter((session) => session.encounterId === current.id).map((session) => session.date),
  ]);
  encounters[index] = {
    ...current,
    title: draft.encounterTitle.trim() || current.title,
    partnerName: current.partnerName || partner,
    startDate: span.startDate,
    endDate: span.endDate,
    problems: draft.encounterProblems.slice(),
    updatedAt: Date.now(),
  };
  return { encounters, encounterId: current.id };
}

function linkedOrCover(journal: Journal, draft: Draft, partner: string, date: string) {
  const linked = bindEncounter(journal, draft, partner);
  if (linked.encounterId) return linked;
  return ensureCovering({ ...journal, encounters: linked.encounters }, date, partner);
}

function payloadFromDraft(draft: Draft, lang: Lang) {
  const partner = draft.newPartner.trim() || draft.partnerName || "";
  const placeText =
    (draft.place === "Other" || draft.place === "Map") && draft.customPlace.trim()
      ? draft.customPlace.trim()
      : draft.place;
  const spotted = namedPlace([placeText, draft.customPlace, draft.ownWords].filter(Boolean).join(". "));
  const place = spotted || placeText;
  return {
    partnerName: partner,
    date: draft.date,
    time: draft.time || "21:00",
    place,
    durationMins: Math.min(240, Math.max(5, draft.durationMins || 30)),
    positions: draft.positions.slice(),
    intensity: draft.intensity,
    connection: draft.connection,
    satisfaction: draft.satisfaction,
    energy: draft.energy,
    overall: draft.overall || 5,
    notes: composedNote(draft, lang),
    ownWords: draft.ownWords.trim(),
    contraception: draft.contraception.slice(),
    problems: draft.problems.slice(),
  };
}

const now = new Date();

type Store = {
  ready: boolean;
  journal: Journal;
  unlocked: boolean;
  tab: TabId;
  settingsOpen: boolean;
  showForm: boolean;
  editingId: string | null;
  confirmDeleteId: string | null;
  confirmErase: boolean;
  composeEncounterId: string | null;
  sections: Record<string, boolean>;
  calY: number;
  calM: number;
  calSel: string;
  histQ: string;
  histPartner: string;
  histFrom: string;
  histTo: string;
  histPhase: "" | "period" | "fertile" | "quiet";
  histLayout: "list" | 2 | 3 | 4;
  compare: CompareMode;
  toast: string | null;
  lastActivity: number;
  /** "none": no journal on this device yet · "locked": an encrypted journal waits for the passphrase. */
  vault: "loading" | "none" | "locked";
  vaultId: string;
  keyEpoch: number;
  legacy: Journal | null;
  hydrate: () => Promise<void>;
  touch: () => void;
  maybeLock: () => void;
  lock: () => void;
  replaceJournal: (raw: unknown) => void;
  setLanguage: (language: Lang) => void;
  cloudPhase: CloudPhase;
  setCloudPhase: (phase: CloudPhase) => void;
  createJournal: (name: string, passphrase: string, importLegacy: boolean) => Promise<"short" | "ok">;
  adoptJournal: (raw: unknown, key: VaultKey) => Promise<void>;
  rekey: (key: VaultKey, passphrase?: string) => Promise<void>;
  unlock: (passphrase: string) => Promise<boolean>;
  verifyPassphrase: (passphrase: string) => Promise<boolean>;
  changePassphrase: (current: string, next: string) => Promise<"short" | "bad" | "ok">;
  importLegacy: () => Promise<number>;
  discardLegacy: () => void;
  forgetDevice: () => Promise<void>;
  setTab: (tab: TabId) => void;
  setSettingsOpen: (open: boolean) => void;
  toggleSection: (id: string) => void;
  setShowForm: (open: boolean) => void;
  beginSession: (encounterId: string) => void;
  clearCompose: () => void;
  openEdit: (id: string) => void;
  closeEdit: () => void;
  saveNew: (draft: Draft) => void;
  saveMany: (drafts: Draft[]) => void;
  saveBatch: (entries: BatchEntry[], partnerName: string) => void;
  saveEdit: (id: string, draft: Draft) => void;
  quickLog: () => void;
  addRound: (id: string) => string | null;
  deleteSession: (id: string) => void;
  removeEncounter: (id: string) => void;
  setConfirmDelete: (id: string | null) => void;
  setConfirmErase: (open: boolean) => void;
  saveDisplayName: (name: string) => void;
  setTheme: (theme: ThemeId) => void;
  toggleMode: () => void;
  setRatingStyle: (style: RatingStyle) => void;
  setWeekStart: (weekStart: WeekStart) => void;
  setDiscreet: (discreet: boolean) => void;
  setAutoLock: (mins: number) => void;
  setDefaultPartner: (name: string) => void;
  /** Changes the shown tracker, or tracker `id` (settings fields, enabled = on / paused, name, link). */
  setCycle: (partial: Partial<CycleTracker>, id?: string) => void;
  selectCycle: (id: string) => void;
  /** Adds a tracker and shows it; returns its id ("" at the limit). */
  addTracker: (spec: { perspective: "self" | "partner"; partnerName?: string; partnerLink?: string }) => string;
  /** Removes a tracker and its history (never the last one). */
  removeTracker: (id: string) => void;
  logPeriodStart: (date: string) => void;
  removePeriodStart: (date: string, id?: string) => void;
  setPeriodEnd: (start: string, end: string | null) => void;
  logCycleDay: (date: string, log: Partial<DayLog> | null) => void;
  /** Date whose cycle day log sheet is open. */
  cycleDay: string | null;
  openCycleDay: (date: string | null) => void;
  cycleSheet: boolean;
  setCycleSheet: (open: boolean) => void;
  addPartner: (name: string) => void;
  removePartner: (name: string) => void;
  addCustom: (kind: "places" | "positions" | "problems", value: string) => void;
  removeCustom: (kind: "places" | "positions" | "problems", value: string) => void;
  eraseAll: (choice: JournalWipe) => void;
  exportJSON: () => Promise<void>;
  exportCSV: () => void;
  importJSON: (text: string) => { ok: true; n: number } | { ok: false };
  importBackup: (
    text: string,
    passphrase?: string,
  ) => Promise<{ ok: true; n: number } | { ok: false; reason: "invalid" | "needs-pass" | "bad-pass" }>;
  shiftMonth: (delta: number) => void;
  goToToday: () => void;
  pickDay: (ds: string) => void;
  setHistQ: (q: string) => void;
  setHistPartner: (partner: string) => void;
  setHistList: () => void;
  cycleHistGrid: () => void;
  openHistRange: (from: string, to: string) => void;
  openHistPhase: (phase: "period" | "fertile" | "quiet") => void;
  clearHistRange: () => void;
  setCompare: (mode: CompareMode) => void;
  showToast: (message: string) => void;
};

export type CloudPhase =
  | "off"
  | "unconfigured"
  | "signed-out"
  | "saving"
  | "saved"
  | "offline"
  | "error"
  | "needs-pass"
  | "other-account";

let toastTimer: ReturnType<typeof setTimeout> | null = null;

function download(name: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 400);
}

const openSections = {
  language: false,
  profile: false,
  appearance: false,
  partners: false,
  places: false,
  privacy: false,
  data: false,
  prefs: false,
  cycle: false,
};

export const BACKUP_KIND = "vela-encrypted-backup";

export const useJournal = create<Store>((set, get) => {
  const commit = (journal: Journal, extra?: Partial<Store>) => {
    if (!get().unlocked) {
      // Locked: only display preferences (language on the lock screen) may change.
      rememberUi(journal);
      set({ journal, ...extra });
      return;
    }
    const next = { ...journal, updatedAt: Date.now() };
    void persist(next);
    set({ journal: next, ...extra });
  };

  const patchSettings = (partial: Partial<Settings>) => {
    const journal = get().journal;
    commit({ ...journal, settings: { ...journal.settings, ...partial } });
  };
  /** Changes one cycle tracker (the shown one unless `id` is given), stamping what changed for sync. */
  const patchTracker = (change: (cycle: CycleTracker) => CycleSettings, id?: string, extra?: Partial<CycleTracker>) => {
    const settings = get().journal.settings;
    const target = id ?? activeTracker(settings.cycles, settings.cycleSelected).id;
    const now = Date.now();
    const cycles = settings.cycles.map((tracker) => {
      if (tracker.id !== target) return tracker;
      const link = extra && "partnerLink" in extra ? { partnerLink: extra.partnerLink ?? "" } : {};
      return restamp(tracker, cleanTracker({ ...tracker, ...change(tracker), ...link, id: tracker.id }, tracker.id), now);
    });
    patchSettings({ cycles, cycle: asLegacyCycle(cycles[0]), cycleSelected: selectedId(cycles, settings.cycleSelected) });
  };

  return {
    ready: false,
    journal: lockedShell(),
    unlocked: false,
    vault: "loading",
    vaultId: "",
    keyEpoch: 0,
    legacy: null,
    tab: "home",
    settingsOpen: false,
    showForm: true,
    editingId: null,
    confirmDeleteId: null,
    confirmErase: false,
    composeEncounterId: null,
    cloudPhase: "off",
    sections: openSections,
    calY: now.getFullYear(),
    calM: now.getMonth(),
    calSel: todayStr(now),
    histQ: "",
    histPartner: "",
    histLayout: "list",
    histFrom: "",
    histTo: "",
    histPhase: "",
    compare: "months",
    toast: null,
    lastActivity: Date.now(),
    hydrate: async () => {
      let stored = null;
      try {
        stored = await readVault();
      } catch {
        stored = null;
      }
      vaultIdMem = stored?.vaultId ?? "";
      const env0 = stored ? asEnvelope(stored.envelope) : null;
      if (stored && env0) {
        const vk = await claimGrace(stored.vaultId);
        if (vk) {
          try {
            const data = await open(vk, env0);
            sessionKey = vk;
            const language = readLang();
            const journal = journalFromUnknown(data, language);
            if (!journal.profile) journal.profile = { displayName: "", createdAt: Date.now() };
            rememberUi(journal);
            set({ journal, legacy: readLegacyJournal(), vault: "locked", vaultId: vaultIdMem, ready: true, unlocked: true, lastActivity: Date.now() });
            void parkKey(vk, vaultIdMem, journal.settings.autoLockMins);
            return;
          } catch {
            await dropGrace();
          }
        }
      }
      set({
        journal: lockedShell(),
        legacy: readLegacyJournal(),
        vault: stored && asEnvelope(stored.envelope) ? "locked" : "none",
        vaultId: vaultIdMem,
        ready: true,
        unlocked: false,
        lastActivity: Date.now(),
      });
    },
    touch: () => {
      set({ lastActivity: Date.now() });
      if (get().unlocked) bumpGrace(get().journal.settings.autoLockMins);
    },
    maybeLock: () => {
      const { unlocked, journal, lastActivity } = get();
      const mins = journal.settings.autoLockMins;
      if (!unlocked || mins <= 0) return;
      if (Date.now() - lastActivity > mins * 60_000) get().lock();
    },
    lock: () => {
      resetFingerprintPrompt();
      void dropGrace();
      const language = get().journal.settings.language;
      // Pending writes already captured their key; drop ours so memory no longer holds it.
      void flushSaves();
      sessionKey = null;
      set({
        journal: lockedShell(language),
        vault: vaultIdMem ? "locked" : get().vault,
        tab: "home",
        histQ: "",
        histPartner: "",
        toast: null,
        unlocked: false,
        settingsOpen: false,
        editingId: null,
        confirmDeleteId: null,
        confirmErase: false,
        cycleDay: null,
        cycleSheet: false,
      });
    },
    replaceJournal: (raw) => {
      if (!get().unlocked) return;
      const journal = journalFromUnknown(raw, get().journal.settings.language);
      void persist(journal);
      set({ journal });
    },
    setCloudPhase: (cloudPhase) => set({ cloudPhase }),
    setLanguage: (language) => {
      commit({ ...get().journal, settings: { ...get().journal.settings, language } });
    },
    createJournal: async (name, passphrase, importLegacy) => {
      if (passphrase.length < MIN_PASSPHRASE) return "short";
      clearFingerprint();
      const vk = await newVaultKey(passphrase);
      sessionKey = vk;
      vaultIdMem = toB64(randomBytes(12)).replace(/[^a-zA-Z0-9]/g, "");
      const legacy = importLegacy ? get().legacy : null;
      const language = get().journal.settings.language;
      const base = legacy ?? { ...lockedShell(language), partners: [], sessions: [], encounters: [] };
      const profile: Profile = { displayName: name.trim() || legacy?.profile?.displayName || "", createdAt: Date.now() };
      const journal: Journal = { ...base, settings: { ...base.settings, language }, profile, updatedAt: Date.now() };
      rememberPass(passphrase);
      set({ journal, unlocked: true, vault: "locked", vaultId: vaultIdMem, lastActivity: Date.now() });
      await persist(journal);
      void parkKey(vk, vaultIdMem, journal.settings.autoLockMins);
      if (legacy) {
        removeLegacyJournal();
        set({ legacy: null });
      }
      return "ok";
    },
    adoptJournal: async (raw, vk) => {
      sessionKey = vk;
      if (!vaultIdMem) vaultIdMem = toB64(randomBytes(12)).replace(/[^a-zA-Z0-9]/g, "");
      const language = get().journal.settings.language;
      const journal = journalFromUnknown(raw, language);
      journal.settings.language = language;
      if (!journal.profile) journal.profile = { displayName: "", createdAt: Date.now() };
      set({ journal, unlocked: true, vault: "locked", vaultId: vaultIdMem, lastActivity: Date.now() });
      await persist(journal);
      void parkKey(vk, vaultIdMem, journal.settings.autoLockMins);
    },
    rekey: async (vk, passphrase) => {
      if (!get().unlocked) return;
      sessionKey = vk;
      if (passphrase) {
        // Keep fingerprint unlock: seal the new passphrase with the same fingerprint.
        rememberPass(passphrase);
        const vid = vaultIdMem;
        void rewrapFingerprint(passphrase, vid).then((r) => {
          useBioUi.getState().bump();
          if (r === "ok") get().showToast(bioText("rewrapped"));
          if (r === "cleared") {
            get().showToast(bioText("rewrapLost"));
            useBioUi.getState().setOffer(true);
          }
        });
      } else {
        clearFingerprint();
      }
      set({ keyEpoch: get().keyEpoch + 1 });
      await persist(get().journal);
      void parkKey(vk, vaultIdMem, get().journal.settings.autoLockMins);
    },
    unlock: async (passphrase) => {
      const stored = await readVault().catch(() => null);
      const env = stored ? asEnvelope(stored.envelope) : null;
      if (!stored || !env) return false;
      try {
        const { vk, data } = await openWithPassphrase(passphrase, env);
        sessionKey = vk;
        vaultIdMem = stored.vaultId;
        const language = get().journal.settings.language;
        const journal = journalFromUnknown(data, language);
        journal.settings.language = language;
        if (!journal.profile) journal.profile = { displayName: "", createdAt: Date.now() };
        rememberUi(journal);
        rememberPass(passphrase);
        set({ journal, unlocked: true, vaultId: vaultIdMem, lastActivity: Date.now() });
        void parkKey(vk, vaultIdMem, journal.settings.autoLockMins);
        return true;
      } catch {
        return false;
      }
    },
    verifyPassphrase: async (passphrase) => {
      const stored = await readVault().catch(() => null);
      const env = stored ? asEnvelope(stored.envelope) : null;
      if (!env) return false;
      try {
        await openWithPassphrase(passphrase, env);
        return true;
      } catch {
        return false;
      }
    },
    changePassphrase: async (current, next) => {
      if (!get().unlocked) return "bad";
      if (next.length < MIN_PASSPHRASE) return "short";
      if (!(await get().verifyPassphrase(current))) return "bad";
      const vk = await newVaultKey(next);
      await get().rekey(vk, next);
      return "ok";
    },
    importLegacy: async () => {
      const legacy = get().legacy;
      if (!legacy || !get().unlocked) return 0;
      const before = new Set(get().journal.sessions.map((s) => s.id));
      const merged = mergeJournals(get().journal, { ...legacy, profile: get().journal.profile });
      commit({ ...merged, profile: get().journal.profile });
      await flushSaves();
      removeLegacyJournal();
      set({ legacy: null });
      return get().journal.sessions.filter((s) => !before.has(s.id)).length;
    },
    discardLegacy: () => {
      removeLegacyJournal();
      set({ legacy: null });
    },
    forgetDevice: async () => {
      sessionKey = null;
      vaultIdMem = "";
      clearFingerprint();
      void dropGrace();
      await deleteVault().catch(() => undefined);
      await deleteSync().catch(() => undefined);
      set({ journal: lockedShell(get().journal.settings.language), unlocked: false, vault: "none", vaultId: "" });
    },
    setTab: (tab) => set({ tab }),
    setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
    toggleSection: (id) => {
      const current = get().sections;
      const next = !current[id];
      const sections: Record<string, boolean> = {};
      for (const key of Object.keys(current)) sections[key] = false;
      sections[id] = next;
      set({ sections });
    },
    setShowForm: (showForm) => set({ showForm }),
    beginSession: (encounterId) =>
      set({
        composeEncounterId: encounterId,
        tab: "home",
        showForm: true,
        settingsOpen: false,
        editingId: null,
      }),
    clearCompose: () => set({ composeEncounterId: null }),
    openEdit: (editingId) => set({ editingId, confirmDeleteId: null }),
    closeEdit: () => set({ editingId: null }),
    saveNew: (draft) => {
      const journal = get().journal;
      const data = payloadFromDraft(draft, journal.settings.language);
      const linked = linkedOrCover(journal, draft, data.partnerName, data.date);
      const session: Session = {
        id: newId(),
        createdAt: Date.now(),
        sessionNumber: 0,
        encounterId: linked.encounterId,
        ...data,
      };
      const partners = journal.partners.slice();
      if (session.partnerName && !partners.includes(session.partnerName)) partners.push(session.partnerName);
      commit({
        ...journal,
        partners,
        encounters: linked.encounters,
        sessions: renumber([...journal.sessions, session]),
      });
    },
    saveMany: (drafts) => {
      const list = drafts.filter(Boolean);
      if (list.length === 0) return;
      if (list.length === 1) {
        get().saveNew(list[0]);
        return;
      }
      const journal = get().journal;
      const lang = journal.settings.language;
      const dates = list.map((item) => item.date);
      const span = {
        ...list[0],
        encounterStart: [list[0].encounterStart || list[0].date, ...dates].sort()[0],
        encounterEnd: [list[0].encounterEnd || list[0].date, ...dates].sort().at(-1) || list[0].date,
      };
      const linked = linkedOrCover(journal, span, list[0].newPartner.trim() || list[0].partnerName || "", span.encounterEnd || list[0].date);
      const partners = journal.partners.slice();
      const created = list.map((item, index) => {
        const data = payloadFromDraft(
          { ...item, encounterId: linked.encounterId, encounterStart: span.encounterStart, encounterEnd: span.encounterEnd },
          lang,
        );
        if (data.partnerName && !partners.includes(data.partnerName)) partners.push(data.partnerName);
        return {
          id: newId() + index.toString(36),
          createdAt: Date.now() + index,
          sessionNumber: 0,
          encounterId: linked.encounterId,
          ...data,
        } satisfies Session;
      });
      commit({
        ...journal,
        partners,
        encounters: linked.encounters,
        sessions: renumber([...journal.sessions, ...created]),
      });
    },
    saveBatch: (entries, partnerName) => {
      const fallback = partnerName.trim();
      const list = entries.filter((entry) => entry.date && entry.count > 0 && (entry.partnerName?.trim() || fallback));
      if (list.length === 0) return;
      const journal = get().journal;
      const lang = journal.settings.language;
      const partners = journal.partners.slice();
      const encounters = journal.encounters.slice();
      const sessions = journal.sessions.slice();
      const stamp = Date.now();
      list.forEach((entry, index) => {
        const partner = entry.partnerName?.trim() || fallback;
        if (!partners.includes(partner)) partners.push(partner);
        const encounterId = `e${stamp.toString(36)}${index.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
        const end = entry.nextDay ? addDays(entry.date, 1) : entry.date;
        encounters.push({
          id: encounterId,
          createdAt: stamp + index,
          title: entry.title,
          startDate: entry.date <= end ? entry.date : end,
          endDate: entry.date <= end ? end : entry.date,
          partnerName: partner,
          comment: entry.notes,
          problems: entry.problems.slice(),
        });
        const [hourText, minuteText] = (entry.time || "21:00").split(":");
        const startMins = (Number(hourText) || 0) * 60 + (Number(minuteText) || 0);
        const ratings = {
          intensity: entry.intensity || 0,
          connection: entry.connection || 0,
          satisfaction: entry.satisfaction || 0,
          energy: entry.energy || 0,
        };
        const roundTimes = entry.times?.length >= entry.count ? entry.times : [];
        for (let sessionIndex = 0; sessionIndex < entry.count; sessionIndex += 1) {
          const onNext = entry.nextDay && sessionIndex === entry.count - 1 && entry.count > 1;
          const mins = (startMins + sessionIndex * 30) % 1440;
          sessions.push({
            id: newId() + index.toString(36) + sessionIndex.toString(36),
            createdAt: stamp + index * 20 + sessionIndex,
            partnerName: partner,
            date: onNext ? end : entry.date,
            time: roundTimes[sessionIndex] || `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`,
            place: entry.place || "Other",
            durationMins: Math.min(240, Math.max(5, entry.durationMins || 30)),
            positions: (entry.positions ?? []).slice(),
            ...ratings,
            overall: entry.overall || 5,
            notes: composedNote(ratings, lang),
            ownWords: entry.notes,
            contraception: entry.contraception.slice(),
            problems: entry.problems.slice(),
            sessionNumber: 0,
            encounterId,
          });
        }
      });
      commit({ ...journal, partners, encounters, sessions: renumber(sessions) });
    },
    saveEdit: (id, draft) => {
      const journal = get().journal;
      const data = payloadFromDraft(draft, journal.settings.language);
      const linked = linkedOrCover(
        { ...journal, sessions: journal.sessions.filter((session) => session.id !== id) },
        draft,
        data.partnerName,
        data.date,
      );
      const sessions = journal.sessions.map((session) =>
        session.id === id ? { ...session, ...data, encounterId: linked.encounterId, updatedAt: Date.now() } : session,
      );
      const partners = journal.partners.slice();
      if (data.partnerName && !partners.includes(data.partnerName)) partners.push(data.partnerName);
      commit({ ...journal, partners, encounters: linked.encounters, sessions: renumber(sessions) });
    },
    quickLog: () => {
      const journal = get().journal;
      const date = todayStr();
      const linked = ensureCovering(journal, date, "");
      const session: Session = {
        id: newId(),
        createdAt: Date.now(),
        partnerName: "",
        date,
        time: nowTime(),
        place: "Bedroom",
        durationMins: 30,
        positions: [],
        intensity: 0,
        connection: 0,
        satisfaction: 0,
        energy: 0,
        overall: 5,
        notes: "",
        ownWords: "",
        contraception: [],
        problems: [],
        sessionNumber: 0,
        encounterId: linked.encounterId,
      };
      commit({ ...journal, encounters: linked.encounters, sessions: renumber([...journal.sessions, session]) });
    },
    addRound: (id) => {
      const journal = get().journal;
      const src = journal.sessions.find((s) => s.id === id);
      if (!src) return null;
      const copy: Session = {
        ...src,
        positions: src.positions.slice(),
        problems: (src.problems ?? []).slice(),
        id: newId(),
        createdAt: Date.now(),
      };
      let encounters = journal.encounters;
      if (copy.encounterId) {
        encounters = encounters.map((encounter) =>
          encounter.id === copy.encounterId
            ? { ...encounter, ...(() => {
                const span = coverDates([encounter.startDate, encounter.endDate, copy.date]);
                return { startDate: span.startDate, endDate: span.endDate, updatedAt: Date.now() };
              })() }
            : encounter,
        );
      }
      commit({ ...journal, encounters, sessions: renumber([...journal.sessions, copy]) });
      return "added";
    },
    deleteSession: (id) => {
      const journal = get().journal;
      commit(
        { ...journal, sessions: renumber(journal.sessions.filter((s) => s.id !== id)), deleted: tombstone(journal, [id]) },
        { confirmDeleteId: null },
      );
    },
    removeEncounter: (id) => {
      const journal = get().journal;
      commit({
        ...journal,
        encounters: journal.encounters.filter((encounter) => encounter.id !== id),
        sessions: renumber(journal.sessions.filter((session) => session.encounterId !== id)),
        deleted: tombstone(journal, [id, ...journal.sessions.filter((session) => session.encounterId === id).map((session) => session.id)]),
      });
    },
    setConfirmDelete: (confirmDeleteId) => set({ confirmDeleteId }),
    setConfirmErase: (confirmErase) => set({ confirmErase }),
    saveDisplayName: (name) => {
      const journal = get().journal;
      if (!journal.profile) return;
      commit({ ...journal, profile: { ...journal.profile, displayName: name.trim() } });
    },
    setTheme: (theme) => patchSettings({ theme }),
    toggleMode: () => patchSettings({ mode: get().journal.settings.mode === "night" ? "day" : "night" }),
    setRatingStyle: (ratingStyle) => patchSettings({ ratingStyle }),
    setWeekStart: (weekStart) => patchSettings({ weekStart }),
    setDiscreet: (discreet) => patchSettings({ discreet }),
    setAutoLock: (autoLockMins) => patchSettings({ autoLockMins }),
    setDefaultPartner: (defaultPartner) => patchSettings({ defaultPartner: defaultPartner.trim() }),
    setCycle: (partial, id) => {
      patchTracker((cycle) => cleanCycle({ ...cycle, ...partial }), id, partial);
    },
    logPeriodStart: (date) => {
      patchTracker((cycle) => withStart(cycle, date));
    },
    removePeriodStart: (date, id) => {
      patchTracker((cycle) => withoutStart(cycle, date), id);
    },
    setPeriodEnd: (start, end) => {
      patchTracker((cycle) => withEnd(cycle, start, end));
    },
    logCycleDay: (date, log) => {
      patchTracker((cycle) => withDayLog(cycle, date, log));
    },
    selectCycle: (cycleSelected) => {
      const settings = get().journal.settings;
      if (settings.cycleSelected === cycleSelected || !settings.cycles.some((tracker) => tracker.id === cycleSelected)) return;
      patchSettings({ cycleSelected });
    },
    addTracker: (spec) => {
      const settings = get().journal.settings;
      if (settings.cycles.length >= MAX_TRACKERS) return "";
      const now = Date.now();
      const id = newTrackerId();
      const tracker = cleanTracker(
        {
          ...defaultTracker(id),
          enabled: true,
          perspective: spec.perspective,
          partnerName: spec.partnerName ?? "",
          partnerLink: spec.partnerLink ?? "",
          updatedAt: now,
          metaAt: now,
        },
        id,
      );
      const cycles = [...settings.cycles, tracker];
      patchSettings({ cycles, cycle: asLegacyCycle(cycles[0]), cycleSelected: id });
      return id;
    },
    removeTracker: (id) => {
      const journal = get().journal;
      const settings = journal.settings;
      if (settings.cycles.length < 2 || !settings.cycles.some((tracker) => tracker.id === id)) return;
      const cycles = settings.cycles.filter((tracker) => tracker.id !== id);
      commit({
        ...journal,
        settings: { ...settings, cycles, cycle: asLegacyCycle(cycles[0]), cycleSelected: selectedId(cycles, settings.cycleSelected) },
        deleted: tombstone(journal, [trackerTombstone(id)]),
      });
    },
    cycleDay: null,
    openCycleDay: (cycleDay) => set({ cycleDay }),
    cycleSheet: false,
    setCycleSheet: (cycleSheet) => set({ cycleSheet }),
    addPartner: (name) => {
      const trimmed = name.trim();
      const journal = get().journal;
      if (!trimmed || journal.partners.includes(trimmed)) return;
      commit({ ...journal, partners: [...journal.partners, trimmed] });
    },
    removePartner: (name) => {
      const journal = get().journal;
      const settings =
        journal.settings.defaultPartner === name
          ? { ...journal.settings, defaultPartner: "" }
          : journal.settings;
      commit({ ...journal, settings, partners: journal.partners.filter((p) => p !== name) });
    },
    addCustom: (kind, value) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      const journal = get().journal;
      const key = kind === "places" ? "customPlaces" : kind === "positions" ? "customPositions" : "customProblems";
      const builtins = kind === "places" ? PLACES : kind === "positions" ? POSITIONS : PROBLEMS.map((item) => item[0]);
      if (journal.settings[key].includes(trimmed) || (builtins as readonly string[]).includes(trimmed)) return;
      patchSettings({ [key]: [...journal.settings[key], trimmed] });
    },
    removeCustom: (kind, value) => {
      const journal = get().journal;
      const key = kind === "places" ? "customPlaces" : kind === "positions" ? "customPositions" : "customProblems";
      patchSettings({ [key]: journal.settings[key].filter((item) => item !== value) });
    },
    eraseAll: (choice) => {
      const journal = get().journal;
      const now = Date.now();
      const settings = { ...journal.settings };
      if (choice.places) settings.customPlaces = [];
      if (choice.positions) settings.customPositions = [];
      if (choice.problems) settings.customProblems = [];
      if (choice.partners) settings.defaultPartner = "";
      const sessions = choice.sessions
        ? []
        : journal.sessions.map((session) => (choice.encounters ? { ...session, encounterId: "" } : session));
      commit({
        ...journal,
        settings,
        partners: choice.partners ? [] : journal.partners,
        sessions,
        encounters: choice.encounters ? [] : journal.encounters,
        sessionsClearedAt: choice.sessions ? now : journal.sessionsClearedAt,
        encountersClearedAt: choice.encounters ? now : journal.encountersClearedAt,
        partnersClearedAt: choice.partners ? now : journal.partnersClearedAt,
      });
      set({
        confirmErase: false,
        editingId: choice.sessions ? null : get().editingId,
        confirmDeleteId: null,
        histQ: "",
        histPartner: choice.partners ? "" : get().histPartner,
        histFrom: "",
        histTo: "",
        histPhase: "",
      });
    },
    exportJSON: async () => {
      const { journal } = get();
      if (!journal.profile || !sessionKey) return;
      const envelope = await seal(sessionKey, { app: "vela", version: 2, exportedAt: new Date().toISOString(), journal });
      const file = { app: "vela", kind: BACKUP_KIND, createdAt: new Date().toISOString(), ...envelope };
      download(`vela-backup-${todayStr()}.json`, JSON.stringify(file), "application/json");
    },
    exportCSV: () => {
      const rows = [
        [
          "date",
          "time",
          "partner",
          "place",
          "duration_mins",
          "positions",
          "intensity",
          "connection",
          "satisfaction",
          "energy",
          "overall",
          "session_number",
          "encounter",
          "notes",
          "own_words",
          "contraception",
          "problems",
        ],
      ];
      const { journal } = get();
      const nameOf = new Map(journal.encounters.map((encounter) => [encounter.id, encounter.title]));
      sessionsSorted(journal.sessions)
        .slice()
        .reverse()
        .forEach((s) =>
          rows.push([
            s.date,
            s.time,
            s.partnerName,
            s.place,
            String(s.durationMins),
            s.positions.join("; "),
            String(s.intensity),
            String(s.connection),
            String(s.satisfaction),
            String(s.energy),
            String(s.overall),
            String(s.sessionNumber),
            nameOf.get(s.encounterId) || "",
            s.notes,
            s.ownWords,
            (s.contraception ?? []).join("; "),
            (s.problems ?? []).join("; "),
          ]),
        );
      const csv = rows
        .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
        .join("\n");
      download(`vela-${todayStr()}.csv`, csv, "text/csv");
    },
    importJSON: (text) => {
      try {
        const data = JSON.parse(text) as {
          app?: string;
          sessions?: unknown[];
          partners?: unknown[];
          encounters?: unknown[];
        };
        if (!data || data.app !== "vela" || !Array.isArray(data.sessions)) return { ok: false };
        const journal = get().journal;
        const idMap = new Map<string, string>();
        const addedEncounters: Encounter[] = [];
        (Array.isArray(data.encounters) ? data.encounters : []).forEach((raw, index) => {
          const encounter = asEncounter(raw, index);
          if (!encounter) return;
          const nextId = newId();
          idMap.set(encounter.id, nextId);
          encounter.id = nextId;
          addedEncounters.push(encounter);
        });
        const added: Session[] = [];
        data.sessions.forEach((raw, index) => {
          const session = asSession(raw, index);
          if (!session) return;
          session.id = newId() + index;
          session.encounterId = idMap.get(session.encounterId) || "";
          added.push(session);
        });
        const partners = journal.partners.slice();
        if (Array.isArray(data.partners)) {
          for (const partner of data.partners) {
            if (typeof partner === "string" && partner && !partners.includes(partner)) partners.push(partner);
          }
        }
        for (const session of added) {
          if (session.partnerName && !partners.includes(session.partnerName)) partners.push(session.partnerName);
        }
        commit({
          ...journal,
          partners,
          encounters: [...journal.encounters, ...addedEncounters],
          sessions: renumber([...journal.sessions, ...added]),
        });
        return { ok: true, n: added.length };
      } catch {
        return { ok: false };
      }
    },
    importBackup: async (text, passphrase) => {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(text) as Record<string, unknown>;
      } catch {
        return { ok: false, reason: "invalid" };
      }
      if (!data || data.app !== "vela") return { ok: false, reason: "invalid" };
      if (data.kind !== BACKUP_KIND) {
        const plain = get().importJSON(text);
        return plain.ok ? plain : { ok: false, reason: "invalid" };
      }
      const env = asEnvelope(data);
      if (!env) return { ok: false, reason: "invalid" };
      let inner: { journal?: unknown } | null = null;
      if (sessionKey && sessionKey.salt === env.salt) {
        inner = await open<{ journal?: unknown }>(sessionKey, env).catch(() => null);
      }
      if (!inner) {
        if (!passphrase) return { ok: false, reason: "needs-pass" };
        try {
          inner = (await openWithPassphrase<{ journal?: unknown }>(passphrase, env)).data;
        } catch {
          return { ok: false, reason: "bad-pass" };
        }
      }
      const restored = journalFromUnknown(inner?.journal, get().journal.settings.language);
      const current = get().journal;
      const before = new Set(current.sessions.map((s) => s.id));
      const merged = mergeJournals(current, { ...restored, profile: current.profile });
      commit({ ...merged, profile: current.profile, settings: current.settings });
      return { ok: true, n: get().journal.sessions.filter((s) => !before.has(s.id)).length };
    },
    shiftMonth: (delta) => {
      let month = get().calM + delta;
      let year = get().calY;
      if (month < 0) {
        month = 11;
        year -= 1;
      }
      if (month > 11) {
        month = 0;
        year += 1;
      }
      set({ calM: month, calY: year });
    },
    goToToday: () => {
      const now = new Date();
      set({ calY: now.getFullYear(), calM: now.getMonth(), calSel: todayStr(now) });
    },
    pickDay: (calSel) => set({ calSel }),
    setHistQ: (histQ) => set({ histQ }),
    setHistPartner: (histPartner) => set({ histPartner }),
    setHistList: () => set({ histLayout: "list" }),
    cycleHistGrid: () => {
      const current = get().histLayout;
      set({ histLayout: current === 2 ? 3 : current === 3 ? 4 : 2 });
    },
    openHistRange: (histFrom, histTo) =>
      set({
        histFrom,
        histTo,
        histPhase: "",
        histQ: "",
        histPartner: "",
        tab: "history",
        settingsOpen: false,
      }),
    openHistPhase: (histPhase) =>
      set({
        histPhase,
        histFrom: "",
        histTo: "",
        histQ: "",
        histPartner: "",
        tab: "history",
        settingsOpen: false,
      }),
    clearHistRange: () => set({ histFrom: "", histTo: "", histPhase: "" }),
    setCompare: (compare) => set({ compare }),
    showToast: (message) => {
      if (toastTimer) clearTimeout(toastTimer);
      set({ toast: message });
      toastTimer = setTimeout(() => set({ toast: null }), 3200);
    },
  };
});

export function sessionToDraft(session: Session, knownPlaces: string[], encounter?: Encounter | null): Draft {
  const known = knownPlaces.includes(session.place);
  return {
    date: session.date,
    time: session.time,
    partnerName: session.partnerName,
    newPartner: "",
    place: known ? session.place : "Other",
    customPlace: known ? "" : session.place,
    durationMins: session.durationMins,
    positions: session.positions.slice(),
    intensity: session.intensity,
    connection: session.connection,
    satisfaction: session.satisfaction,
    energy: session.energy,
    overall: session.overall || 5,
    ownWords: session.ownWords || "",
    prevNote: session.notes || "",
    contraception: session.contraception?.slice() ?? [],
    problems: session.problems?.slice() ?? [],
    encounterId: encounter?.id || "",
    encounterTitle: encounter?.title || "",
    encounterStart: encounter?.startDate || "",
    encounterEnd: encounter?.endDate || "",
    encounterProblems: encounter?.problems?.slice() ?? [],
  };
}

export type { Mode };
