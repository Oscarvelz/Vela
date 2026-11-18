import { create } from "zustand";
import { PLACES, POSITIONS, PROBLEMS, namedPlace, type Mode, type RatingStyle, type ThemeId, type WeekStart } from "./catalog";
import { coverDates, coveringEncounter, partnerKey, samePartner, spanDays } from "./encounters";
import { MIN_PASSPHRASE, asEnvelope, newVaultKey, open, openWithCandidates, randomBytes, seal, toB64, type Envelope, type VaultKey } from "./vault-crypto";
import { deleteSync, deleteVault, readUi, readVault, writeUi, writeVault } from "./vault-db";
import { addDays, finiteStamp, isRealDate, nowTime, pad, todayStr } from "./dates";
import type { BatchEntry } from "./batch";
import { composedNote } from "./notes";
import { renumber, sessionsSorted, type CompareMode } from "./stats";
import { cleanMuted } from "./stories";
import { cleanAnniversaries, cleanArchived, cleanChildren } from "./anniversaries";
import { cleanPeople, cleanProposals, mergePeople, newPersonId, newProposalId, PROPOSAL_TTL_MS, WIPE_COOLING_MS } from "./people";
import { cleanQuietMarks, newQuietId } from "./quiet";
import { cleanPregnancyTests, newTestId } from "./pregnancy";
import { runMigrations } from "./migrations";
import type { Anniversary, ChildEntry, Draft, Encounter, Journal, JournalWipe, Person, PregnancyTestEvent, Profile, Proposal, QuietMark, Session, Settings, SpeakAs, TabId } from "./types";
import { wipedJournal } from "./wipe";
import { STR, type Lang } from "./copy";
import { claimGrace, dropGrace, parkKey } from "./grace";
import { appLockOn, clearSeen, gateAsking, gateReady, gateUnavailable, lockAfterMs, markSeen, migrateLock, pickerJustOpened, quietResume } from "./app-lock";
import { lastUser } from "./cloud";
import { cleanCycle, withDayLog, withEnd, withStart, withoutStart, type CycleReason, type CycleSettings, type DayLog } from "./cycle";
import {
  MAX_TRACKERS,
  activeTracker,
  asLegacyCycle,
  cleanTracker,
  cleanTrackers,
  defaultTracker,
  followsPartner,
  mergeTrackerLists,
  newTrackerId,
  restamp,
  selectedId,
  trackerTombstone,
  type CycleTracker,
} from "./cycle-trackers";
import { bioForUser, bioIsStale, clearFingerprint, keepStorage, rememberPass, resetFingerprintPrompt, rewrapFingerprint, setBioStale } from "./fingerprint";
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
    batchDraft: asBatchDraft(s.batchDraft),
    ...cycleFields(s),
    // The optional lists (2.1.23/2.1.24) ride through the same gate as everything
    // else — a field asSettings does not name is stripped at every unlock, and
    // the next save makes the loss permanent (the 2.1.27 lesson: every bench
    // before this fix worked inside one session and never saw it).
    ...(cleanMuted(s.storiesMuted).people.length || cleanMuted(s.storiesMuted).days.length
      ? { storiesMuted: cleanMuted(s.storiesMuted) }
      : {}),
    ...(Array.isArray(s.anniversaries) && s.anniversaries.length ? { anniversaries: cleanAnniversaries(s.anniversaries) } : {}),
    ...(Array.isArray(s.children) && s.children.length ? { children: cleanChildren(s.children) } : {}),
    ...(Array.isArray(s.archivedPeople) && s.archivedPeople.length ? { archivedPeople: cleanArchived(s.archivedPeople) } : {}),
    ...(s.coupleMode && typeof s.coupleMode === "object" && typeof s.coupleMode.sharedFrom === "string"
      ? { coupleMode: { sharedFrom: s.coupleMode.sharedFrom, enabledAt: finiteStamp(s.coupleMode.enabledAt) ?? 0 } }
      : {}),
  };
}

/** The batch work-in-progress rides inside the journal; keep only a well-shaped one. */
function asBatchDraft(raw: unknown): Settings["batchDraft"] {
  if (!raw || typeof raw !== "object") return undefined;
  const d = raw as Partial<import("./types").BatchDraft>;
  if (typeof d.text !== "string" || d.text.length > 200_000) return undefined;
  return {
    text: d.text,
    picked: typeof d.picked === "string" ? d.picked : "",
    typed: typeof d.typed === "string" ? d.typed : "",
    edits: d.edits && typeof d.edits === "object" && !Array.isArray(d.edits) ? d.edits : {},
    open: typeof d.open === "string" ? d.open : null,
    at: finiteStamp(d.at) ?? 0,
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

/** The second voice (2.2) is cleaned like everything else at the gate: a
 *  voice that isn't well-shaped never reaches the journal. */
function asVoice(raw: unknown): Session["partnerVoice"] {
  if (!raw || typeof raw !== "object") return undefined;
  const v = raw as Partial<import("./types").Voice>;
  if (typeof v.by !== "string" || !v.by) return undefined;
  const dial = (n: unknown) => Math.min(5, Math.max(0, Number(n) || 0));
  return {
    intensity: dial(v.intensity),
    connection: dial(v.connection),
    satisfaction: dial(v.satisfaction),
    energy: dial(v.energy),
    overall: dial(v.overall),
    ownWords: typeof v.ownWords === "string" ? v.ownWords.slice(0, 4000) : "",
    notes: typeof v.notes === "string" ? v.notes.slice(0, 4000) : "",
    by: v.by,
    updatedAt: finiteStamp(v.updatedAt) ?? 0,
  };
}

function asSession(raw: unknown, index: number): Session | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<Session>;
  if (!isRealDate(s.date)) return null;
  // The gate loads; it does not rewrite. A stored 0 is a fact — unrated
  // (overall 0) or a session logged without a duration — and only a truly
  // ABSENT field takes the historical default (prejudice hunt RT-V1 B-3).
  // Dials clamp to the same 0..5 the partner's voice already obeys (B12).
  const dial = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(5, Math.max(0, n)) : 0;
  };
  const overall = s.overall === undefined || s.overall === null || !Number.isFinite(Number(s.overall)) ? 5 : dial(s.overall);
  const duration = s.durationMins === undefined || s.durationMins === null || !Number.isFinite(Number(s.durationMins)) ? 30 : Math.max(0, Number(s.durationMins));
  return {
    id: typeof s.id === "string" ? s.id : `s${Date.now().toString(36)}${index}`,
    createdAt: finiteStamp(s.createdAt) ?? Date.now() + index,
    partnerName: typeof s.partnerName === "string" ? s.partnerName : "",
    date: s.date,
    time: typeof s.time === "string" ? s.time : "21:00",
    place: typeof s.place === "string" ? s.place : "Bedroom",
    durationMins: duration,
    // Strings only, like contraception and problems below: String()
    // used to file "[object Object]" and "7" as positions (RT2-H6-7).
    positions: Array.isArray(s.positions) ? s.positions.filter((item) => typeof item === "string") : [],
    intensity: dial(s.intensity),
    connection: dial(s.connection),
    satisfaction: dial(s.satisfaction),
    energy: dial(s.energy),
    overall,
    notes: typeof s.notes === "string" ? s.notes : "",
    ownWords: typeof s.ownWords === "string" ? s.ownWords : "",
    contraception: Array.isArray(s.contraception) ? s.contraception.filter((item) => typeof item === "string") : [],
    problems: Array.isArray(s.problems) ? s.problems.filter((item) => typeof item === "string") : [],
    sessionNumber: Number(s.sessionNumber) || 0,
    encounterId: typeof s.encounterId === "string" ? s.encounterId : "",
    updatedAt: finiteStamp(s.updatedAt),
    // Without this line, every reload would strip the partner's voice from
    // every session — the 2.1.27 trap at session level.
    ...(asVoice(s.partnerVoice) ? { partnerVoice: asVoice(s.partnerVoice) } : {}),
  };
}

function asEncounter(raw: unknown, index: number): Encounter | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Partial<Encounter>;
  if (!isRealDate(e.startDate) || !isRealDate(e.endDate)) return null;
  const start = e.startDate <= e.endDate ? e.startDate : e.endDate;
  const end = e.startDate <= e.endDate ? e.endDate : e.startDate;
  return {
    id: typeof e.id === "string" ? e.id : `e${Date.now().toString(36)}${index}`,
    createdAt: finiteStamp(e.createdAt) ?? Date.now() + index,
    title: typeof e.title === "string" ? e.title : "",
    startDate: start,
    endDate: end,
    partnerName: typeof e.partnerName === "string" ? e.partnerName : "",
    comment: typeof e.comment === "string" ? e.comment : "",
    problems: Array.isArray(e.problems) ? e.problems.filter((item) => typeof item === "string") : [],
    updatedAt: finiteStamp(e.updatedAt),
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
    const deletedMarks = cleanDeleted(data.deleted);
    // One row per person, by the roster's own identity (partnerKey):
    // "Lucía", "lucía" and "LUCÍA" in a stored list used to seat three
    // rows for one person at every unlock (RT2-H4 B5). The first
    // spelling wins; sessions keep their own spellings as facts.
    const partners: string[] = [];
    const rosterKeys = new Set<string>();
    if (Array.isArray(data.partners)) {
      for (const p of data.partners) {
        if (typeof p !== "string" || partnerRemoved(p, deletedMarks)) continue;
        const key = partnerKey(p);
        if (!key || rosterKeys.has(key)) continue;
        rosterKeys.add(key);
        partners.push(p);
      }
    }
    const partnersClearedAt = Math.max(
      finiteStamp(data.partnersClearedAt) ?? 0,
      finiteStamp(data.clearedAt) ?? 0,
    );
    for (const s of sessions) {
      if (s.createdAt <= partnersClearedAt) continue;
      if (s.partnerName && !rosterKeys.has(partnerKey(s.partnerName)) && !partnerRemoved(s.partnerName, deletedMarks)) {
        rosterKeys.add(partnerKey(s.partnerName));
        partners.push(s.partnerName);
      }
    }
    const profileRaw = data.profile;
    const profile: Profile | null =
      profileRaw && typeof profileRaw === "object"
        ? {
            displayName: typeof profileRaw.displayName === "string" ? profileRaw.displayName : "",
            createdAt: finiteStamp(profileRaw.createdAt) ?? Date.now(),
            // speakAs (2.1.24) survives the gate like every other field.
            ...((profileRaw as Partial<Profile>).speakAs === "man" ||
            (profileRaw as Partial<Profile>).speakAs === "woman" ||
            (profileRaw as Partial<Profile>).speakAs === "neutral"
              ? { speakAs: (profileRaw as Partial<Profile>).speakAs }
              : {}),
          }
        : null;
    const encounters = (Array.isArray(data.encounters) ? data.encounters : [])
      .map(asEncounter)
      .filter((e): e is Encounter => Boolean(e));
    const known = new Set(encounters.map((e) => e.id));
    for (const session of sessions) {
      if (session.encounterId && !known.has(session.encounterId)) session.encounterId = "";
    }
    // The gate loads; it does not rewrite. It used to re-derive every
    // session's place from its notes (and from its encounter's comment)
    // on EVERY unlock: "Cabin" with a note mentioning the trailer came
    // back as "Trailer", the user set it back, the gate rewrote it
    // again — a fact the user could never win (RT2-H6-6). Place
    // spotting still happens where it belongs: at save time, on the
    // words being saved (see the session-save path), never at load.
    const encounterCut = Math.max(
      finiteStamp(data.encountersClearedAt) ?? 0,
      finiteStamp(data.clearedAt) ?? 0,
    );
    const housed = attachOrphans(sessions, encounters, encounterCut);
    const deletedMap = cleanDeleted(data.deleted);
    // A tombstoned person never takes a seat at the gate: the filter runs
    // BEFORE cleanPeople resolves the couple, so the next person in
    // ceremony order takes the seat instead (wave 1 re-hunt R2).
    const peopleRaw = Array.isArray(data.people)
      ? data.people.filter((item) => {
          if (!item || typeof item !== "object") return true;
          const p = item as { id?: unknown; updatedAt?: unknown };
          if (typeof p.id !== "string") return true;
          const at = deletedMap[p.id] ?? 0;
          const upd = finiteStamp(p.updatedAt) ?? 0;
          return !(at > 0 && at >= upd);
        })
      : data.people;
    return {
      profile,
      settings,
      partners,
      sessions,
      encounters: housed,
      updatedAt: finiteStamp(data.updatedAt) ?? 0,
      clearedAt: finiteStamp(data.clearedAt) ?? 0,
      sessionsClearedAt: finiteStamp(data.sessionsClearedAt) ?? 0,
      encountersClearedAt: finiteStamp(data.encountersClearedAt) ?? 0,
      partnersClearedAt: finiteStamp(data.partnersClearedAt) ?? 0,
      deleted: deletedMap,
      migrations: Array.isArray(data.migrations) ? data.migrations.filter((m): m is string => typeof m === "string") : [],
      ...(cleanPeople(peopleRaw).length ? { people: cleanPeople(peopleRaw) } : {}),
      ...(cleanProposals(data.proposals, cleanPeople(peopleRaw)).length ? { proposals: cleanProposals(data.proposals, cleanPeople(peopleRaw)) } : {}),
      ...(cleanQuietMarks(data.quietDays).length ? { quietDays: cleanQuietMarks(data.quietDays) } : {}),
      ...(cleanPregnancyTests(data.pregnancyTests).length ? { pregnancyTests: cleanPregnancyTests(data.pregnancyTests) } : {}),
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

/**
 * The next stamp this journal may mint: never older than one it has already
 * seen. A device whose clock was set back must not mint a removal older
 * than the addition it removes — stamp merges would resurrect the entry
 * (prejudice hunt V3-08). Every stamp the store writes goes through here.
 */
export function stampNow(journal: Journal): number {
  let max = journal.updatedAt ?? 0;
  for (const at of Object.values(journal.deleted ?? {})) if (at > max) max = at;
  for (const tracker of journal.settings.cycles) {
    if (tracker.updatedAt > max) max = tracker.updatedAt;
    if (tracker.metaAt > max) max = tracker.metaAt;
    for (const at of Object.values(tracker.stamps)) if (at > max) max = at;
  }
  /* The scan covers every stamp the journal carries, not only the
   * trackers' (Round 2, RT2-H3-05's root): a removal minted below a
   * future-dated copy it removes — written by a clock that had been
   * set forward — loses to that copy at the merge. A stamp this
   * journal mints outranks every stamp this journal has seen. */
  for (const s of journal.sessions) {
    if (s.createdAt > max) max = s.createdAt;
    if ((s.updatedAt ?? 0) > max) max = s.updatedAt ?? 0;
  }
  for (const e of journal.encounters) if (e.createdAt > max) max = e.createdAt;
  for (const p of journal.people ?? []) if (p.updatedAt > max) max = p.updatedAt;
  for (const m of journal.quietDays ?? []) {
    if (m.createdAt > max) max = m.createdAt;
    if ((m.updatedAt ?? 0) > max) max = m.updatedAt ?? 0;
  }
  for (const t of journal.pregnancyTests ?? []) if (t.createdAt > max) max = t.createdAt;
  for (const p of journal.proposals ?? []) {
    if (p.proposedAt > max) max = p.proposedAt;
    if ((p.decidedAt ?? 0) > max) max = p.decidedAt ?? 0;
  }
  for (const a of journal.settings.anniversaries ?? []) {
    if (a.createdAt > max) max = a.createdAt;
    if ((a.updatedAt ?? 0) > max) max = a.updatedAt ?? 0;
  }
  for (const c of journal.settings.children ?? []) {
    if (c.createdAt > max) max = c.createdAt;
    if ((c.updatedAt ?? 0) > max) max = c.updatedAt ?? 0;
  }
  for (const p of journal.settings.archivedPeople ?? []) if (p.archivedAt > max) max = p.archivedAt;
  if ((journal.settings.batchDraft?.at ?? 0) > max) max = journal.settings.batchDraft?.at ?? 0;
  if ((journal.settings.coupleMode?.enabledAt ?? 0) > max) max = journal.settings.coupleMode?.enabledAt ?? 0;
  return Math.max(Date.now(), max + 1);
}

function tombstone(journal: Journal, ids: string[]) {
  const deleted = { ...(journal.deleted ?? {}) };
  const at = stampNow(journal);
  for (const id of ids) deleted[id] = at;
  return deleted;
}

/**
 * A partner removed in Settings stays removed (audit M3): removal writes `partner-:<key>` into `deleted`, a
 * later re-add (typing the name again, logging with it) writes `partner+:<key>`. The newer one wins, on every
 * device, because `deleted` merges by max. Sessions keep the name; it is only no longer offered as a partner.
 */
const PARTNER_OFF = "partner-:";
const PARTNER_ON = "partner+:";
/* Couple mode switched OFF mints this stamp (Round 3, RT3-H1 B8):
 * without it, the merge's mode rule could not tell a deliberate off
 * from a device that simply had not heard yet, and any merge with a
 * stale still-on copy switched the mode back on. */
const COUPLE_OFF = "couple-:mode";
export function partnerRemoved(name: string, deleted: Record<string, number> | undefined) {
  const key = partnerKey(name);
  const off = deleted?.[PARTNER_OFF + key] ?? 0;
  return off > 0 && off > (deleted?.[PARTNER_ON + key] ?? 0);
}

/* The same off/on stamp law for the string classes the merge unions —
 * custom values and story mutes (Round 2, RT2-H1 B2): a union can only
 * add, so a removal survives only as a stamp the union reads. Removing
 * writes the off stamp, re-adding writes the on stamp; the newer one
 * wins on every device because `deleted` merges by max. A value nobody
 * ever stamped (it predates the stamps) is kept — the law removes only
 * what a removal actually named. */
const CUSTOM_OFF = "custom-:";
const CUSTOM_ON = "custom+:";
export function customKey(kind: "places" | "positions" | "problems", value: string) {
  return `${kind}:${value}`;
}
export function customRemoved(kind: "places" | "positions" | "problems", value: string, deleted: Record<string, number> | undefined) {
  const key = customKey(kind, value);
  return (deleted?.[CUSTOM_OFF + key] ?? 0) > (deleted?.[CUSTOM_ON + key] ?? 0);
}
const MUTE_OFF = "mute-:";
const MUTE_ON = "mute+:";
export function muteKey(kind: "person" | "day", value: string) {
  return kind === "person" ? `person:${partnerKey(value)}` : `day:${value}`;
}
export function muteRemoved(kind: "person" | "day", value: string, deleted: Record<string, number> | undefined) {
  const key = muteKey(kind, value);
  return (deleted?.[MUTE_OFF + key] ?? 0) > (deleted?.[MUTE_ON + key] ?? 0);
}

/** Trackers the cap left behind in a merge: ids present on either side but absent from the result.
    A merge that drops a followed cycle must say so (the audit's silence rule, Nov 14 2026). */
export function mergeDroppedCycles(a: Journal, b: Journal, merged: Journal): number {
  const kept = new Set(merged.settings.cycles.map((tracker) => tracker.id));
  const seen = new Set<string>();
  let dropped = 0;
  for (const tracker of [...a.settings.cycles, ...b.settings.cycles]) {
    if (seen.has(tracker.id)) continue;
    seen.add(tracker.id);
    if (!kept.has(tracker.id)) dropped += 1;
  }
  return dropped;
}

export function mergeJournals(local: Journal, remote: Journal): Journal {
  const older = local.updatedAt >= remote.updatedAt ? remote : local;
  const newer = older === local ? remote : local;
  // No early returns: a profile-less side still contributes its sessions,
  // partners and classes, and the merged profile is whichever side has one
  // (prejudice hunt V1 B-2 — the unguarded call site was passphrase adoption).
  const sessionCut = Math.max(local.sessionsClearedAt ?? 0, remote.sessionsClearedAt ?? 0, local.clearedAt ?? 0, remote.clearedAt ?? 0);
  const encounterCut = Math.max(local.encountersClearedAt ?? 0, remote.encountersClearedAt ?? 0, local.clearedAt ?? 0, remote.clearedAt ?? 0);
  const partnerCut = Math.max(local.partnersClearedAt ?? 0, remote.partnersClearedAt ?? 0, local.clearedAt ?? 0, remote.clearedAt ?? 0);
  const deleted = { ...(older.deleted ?? {}) };
  for (const [id, at] of Object.entries(newer.deleted ?? {})) deleted[id] = Math.max(deleted[id] ?? 0, at);
  /* The wipe's high-water mark (Round 2, RT2-H1 B1): a side journaled
   * at or before it predates a deliberate erasure, so what it alone
   * carries — a profile, people, a couple mode switched on before the
   * wipe — is the wipe's target, not news. Classes with their own cuts
   * or tombstones resolve below; this stamp guards the wholesale
   * riders. Life journaled AFTER the mark is untouched by it. */
  const wipeStamp = Math.max(local.clearedAt ?? 0, remote.clearedAt ?? 0);
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
  // One row per person across the merge too, keyed by partnerKey —
  // two devices holding "Lucía" and "lucía" used to merge into two
  // permanent rows (RT2-H4 B5). The older side's spelling wins; a
  // session's own spelling is a fact and stays in the session.
  const livePartnerMap = new Map<string, string>();
  const offerPartner = (name: string) => {
    const key = partnerKey(name);
    if (key && !livePartnerMap.has(key)) livePartnerMap.set(key, name);
  };
  for (const side of [older, newer]) {
    if (side.updatedAt <= partnerCut) continue;
    for (const name of side.partners) offerPartner(name);
  }
  if (partnerCut === 0) {
    for (const session of sessions) {
      if (session.partnerName) offerPartner(session.partnerName);
    }
  }
  for (const [key, name] of [...livePartnerMap]) if (partnerRemoved(name, deleted)) livePartnerMap.delete(key);
  const livePartners = new Set(livePartnerMap.values());
  const cycles = mergeTrackerLists(newer.settings.cycles, older.settings.cycles, deleted, wipeStamp);
  // Trackers the cap left behind are tombstoned, never silently vanished:
  // the other device resolves the same way next merge, and the call sites
  // surface the count (mergeDroppedCycles → the cyMergeFull notice).
  {
    const keptIds = new Set(cycles.map((tracker) => tracker.id));
    const stamp = Math.max(local.updatedAt, remote.updatedAt);
    for (const tracker of [...local.settings.cycles, ...remote.settings.cycles]) {
      if (!keptIds.has(tracker.id)) {
        const key = trackerTombstone(tracker.id);
        deleted[key] = Math.max(deleted[key] ?? 0, stamp, tracker.updatedAt);
      }
    }
  }
  // Settings-borne data classes merge per item, like journal data — they
  // are data, not furniture (prejudice hunt V1 B-4). Stated scalars (theme,
  // defaultPartner…) still ride the newer settings wholesale.
  const byId = <T extends { id: string; createdAt?: number; updatedAt?: number }>(a: T[] | undefined, b: T[] | undefined): T[] => {
    const map = new Map<string, T>();
    const stampOf = (x: T) => x.updatedAt ?? x.createdAt ?? 0;
    for (const item of [...(a ?? []), ...(b ?? [])]) {
      // A tombstoned item never resurfaces through the union (re-hunt R1).
      const goneAt = deleted[item.id] ?? 0;
      if (goneAt > 0 && goneAt >= (item.createdAt ?? 0)) continue;
      /* The wipe cuts TIME for the union classes too (Round 3, RT3-H1
       * B1): the tombstones above name only the ids the wiping device
       * held, so a divergent stale device's pre-wipe anniversary or
       * child — never seen by the wiper, carrying no tombstone — walked
       * straight back in. What was born at or before the wipe is the
       * wipe's, whoever holds it; life born after it is untouched. */
      if (wipeStamp > 0 && (item.createdAt ?? 0) <= wipeStamp) continue;
      /* Two copies of one item resolve by the ITEM's edit stamp, never
       * by which journal was saved last (Round 3, RT3-H6 B2): an
       * unrelated later save on the other device used to revert the
       * edit wholesale. Unstamped copies fall back to their birth
       * stamp; a tie keeps the newer side's copy, as before. */
      const prev = map.get(item.id);
      if (!prev || stampOf(item) >= stampOf(prev)) map.set(item.id, item);
    }
    return [...map.values()];
  };
  const unionList = (a: string[] | undefined, b: string[] | undefined) => [...new Set([...(b ?? []), ...(a ?? [])])];
  const archivedByKey = new Map<string, NonNullable<Settings["archivedPeople"]>[number]>();
  for (const person of [...(older.settings.archivedPeople ?? []), ...(newer.settings.archivedPeople ?? [])]) {
    const goneAt = deleted[`archived:${partnerKey(person.name)}`] ?? 0;
    if (goneAt > 0 && goneAt >= person.archivedAt) continue;
    const prev = archivedByKey.get(partnerKey(person.name));
    if (!prev || person.archivedAt >= prev.archivedAt) archivedByKey.set(partnerKey(person.name), person);
  }
  const mutedOlder = cleanMuted(older.settings.storiesMuted);
  const mutedNewer = cleanMuted(newer.settings.storiesMuted);
  const draftOlder = older.settings.batchDraft;
  const draftNewer = newer.settings.batchDraft;
  const settings: Settings = {
    ...newer.settings,
    cycles,
    cycle: asLegacyCycle(cycles[0]),
    cycleSelected: selectedId(cycles, newer.settings.cycleSelected),
    anniversaries: byId(older.settings.anniversaries, newer.settings.anniversaries),
    children: byId(older.settings.children, newer.settings.children),
    /* The value classes ride the same temporal law (RT3-H1 B1): under a
     * wipe, a custom or a mute survives only if its ON stamp postdates
     * the wipe — an unstamped or pre-wipe value is the wipe's, whoever
     * holds it. Outside a wipe the union is untouched. */
    customPlaces: unionList(older.settings.customPlaces, newer.settings.customPlaces).filter((v) => !customRemoved("places", v, deleted) && (wipeStamp === 0 || (deleted[CUSTOM_ON + customKey("places", v)] ?? 0) > wipeStamp)),
    customPositions: unionList(older.settings.customPositions, newer.settings.customPositions).filter((v) => !customRemoved("positions", v, deleted) && (wipeStamp === 0 || (deleted[CUSTOM_ON + customKey("positions", v)] ?? 0) > wipeStamp)),
    customProblems: unionList(older.settings.customProblems, newer.settings.customProblems).filter((v) => !customRemoved("problems", v, deleted) && (wipeStamp === 0 || (deleted[CUSTOM_ON + customKey("problems", v)] ?? 0) > wipeStamp)),
    archivedPeople: [...archivedByKey.values()],
    storiesMuted: {
      people: unionList(mutedOlder.people, mutedNewer.people).filter((v) => !muteRemoved("person", v, deleted) && (wipeStamp === 0 || (deleted[MUTE_ON + muteKey("person", v)] ?? 0) > wipeStamp)),
      days: unionList(mutedOlder.days, mutedNewer.days).filter((v) => !muteRemoved("day", v, deleted) && (wipeStamp === 0 || (deleted[MUTE_ON + muteKey("day", v)] ?? 0) > wipeStamp)),
    },
    /* The default partner is a claim about the roster: it survives
     * only if the merged roster still holds her (RT2-H1 B4 — a removed
     * partner rode the newer settings back in as the default). */
    defaultPartner: livePartners.has(newer.settings.defaultPartner)
      ? newer.settings.defaultPartner
      : livePartners.has(older.settings.defaultPartner)
        ? older.settings.defaultPartner
        : "",
    ...(() => {
      const draftCut = deleted["batchDraft"] ?? 0;
      const live = [draftOlder, draftNewer].filter((d) => d && d.at > draftCut);
      return live.length ? { batchDraft: live.reduce((a, b) => (b!.at >= a!.at ? b : a)) } : { batchDraft: undefined };
    })(),
    ...(() => {
      /* A mode survives only if its enable stamp beats both the wipe
       * and the OFF stamp (RT3-H1 B8): switched off is a decision with
       * a stamp of its own, not an absence the stale side can fill. */
      const modeFloor = Math.max(wipeStamp, deleted[COUPLE_OFF] ?? 0);
      const modes = [local.settings.coupleMode, remote.settings.coupleMode].filter((m) => m && m.enabledAt > modeFloor);
      return modes.length ? { coupleMode: modes.reduce((a, b) => (b!.enabledAt >= a!.enabledAt ? b : a)) } : { coupleMode: undefined };
    })(),
  };
  // People resolve through mergePeople; whoever the resolution displaces is
  // tombstoned so the other device resolves identically (V4 B7). A person
  // whose record predates a wipe is filtered before the resolution —
  // mergePeople's own tombstone filter covers the wiped side's ids, and
  // this covers the stale side's (RT2-H1 B1).
  /* The screen reads the person's BIRTH stamp, not their last edit
   * (Round 3, RT3-H1 B3): a PIN change on the stale device after the
   * wipe is an edit to her record, not a re-joining ceremony — sessions
   * are cut by createdAt and people now are too. A person born after
   * the wipe is new life and crosses freely. */
  const peopleSide = (list: Journal["people"]) => (wipeStamp > 0 ? (list ?? []).filter((p) => p.createdAt > wipeStamp) : list);
  const people = mergePeople(peopleSide(local.people), peopleSide(remote.people), deleted);
  if (people) {
    const keptIds = new Set(people.map((person) => person.id));
    const stamp = Math.max(local.updatedAt, remote.updatedAt);
    for (const person of [...(local.people ?? []), ...(remote.people ?? [])]) {
      if (!keptIds.has(person.id)) deleted[person.id] = Math.max(deleted[person.id] ?? 0, stamp, person.updatedAt);
    }
  }
  return {
    ...newer,
    /* A profile journaled after the wipe is a new life; one that only
     * predates it was erased on purpose (RT2-H1 B1). The screen reads
     * the PROFILE's own birth stamp, not the journal's (Round 3,
     * RT3-H1 B2): commit bumps the journal's updatedAt on every edit,
     * so a stale diary merely touched after the wipe read as "newer
     * than the wipe" and its erased profile walked back in. */
    profile: [newer, older].find((side) => side.profile && (wipeStamp === 0 || side.profile.createdAt > wipeStamp))?.profile ?? null,
    settings,
    partners: [...livePartners],
    sessions: renumber(sessions),
    encounters,
    clearedAt: Math.max(local.clearedAt ?? 0, remote.clearedAt ?? 0),
    sessionsClearedAt: Math.max(local.sessionsClearedAt ?? 0, remote.sessionsClearedAt ?? 0),
    encountersClearedAt: Math.max(local.encountersClearedAt ?? 0, remote.encountersClearedAt ?? 0),
    partnersClearedAt: Math.max(local.partnersClearedAt ?? 0, remote.partnersClearedAt ?? 0),
    deleted,
    migrations: [...new Set([...(local.migrations ?? []), ...(remote.migrations ?? [])])],
    // People merge by id, per person (2.2) — never wholesale like settings.
    // mergePeople returns undefined for two empty lists; after a wipe that
    // emptiness is the answer, not a gap the spread may fill (RT2-H1 B1).
    ...(people ? { people } : wipeStamp > 0 ? { people: [] } : {}),
    // Proposals union by id (2.2.3): the copy that knows more about a
    // proposal (decided beats proposed) wins; a tombstoned proposal — one
    // already decided, declined, cancelled or executed — never resurfaces.
    ...(() => {
      const byId = new Map<string, Proposal>();
      for (const p of [...(local.proposals ?? []), ...(remote.proposals ?? [])]) {
        const prev = byId.get(p.id);
        if (!prev || (p.decidedAt ?? p.proposedAt) >= (prev.decidedAt ?? prev.proposedAt)) byId.set(p.id, p);
      }
      /* The merge applies the gate's consent law too (RT2-H1 B3): an
       * approved proposal whose decider is none of the merged people
       * does not cross — a ghost signature gains nothing by arriving
       * through sync instead of through the load gate. BOTH signatures
       * are checked (Round 3, RT3-H1 B5): the proposer's membership
       * rides the same filter, not only decideProposal's. */
      const memberIds = new Set((people ?? []).map((person) => person.id));
      const merged = [...byId.values()].filter(
        (p) => !(deleted[p.id] >= p.proposedAt) && (p.state !== "approved" || (p.decidedBy !== undefined && memberIds.has(p.decidedBy) && memberIds.has(p.proposedBy))),
      );
      return { proposals: merged };
    })(),
    // Quiet marks union by id (2.2.4): the later writing wins; a tombstoned
    // mark — one that was removed — never resurfaces.
    ...(() => {
      const byId = new Map<string, QuietMark>();
      for (const m of [...(local.quietDays ?? []), ...(remote.quietDays ?? [])]) {
        const prev = byId.get(m.id);
        if (!prev || (m.updatedAt ?? m.createdAt) >= (prev.updatedAt ?? prev.createdAt)) byId.set(m.id, m);
      }
      const merged = [...byId.values()].filter((m) => !(deleted[m.id] >= (m.updatedAt ?? m.createdAt)) && !(wipeStamp > 0 && m.createdAt <= wipeStamp));
      return { quietDays: merged };
    })(),
    // Pregnancy tests union by id (2.2.7): stated events never edit each
    // other, so the union is the whole merge; a tombstone still wins.
    ...(() => {
      const byId = new Map<string, PregnancyTestEvent>();
      for (const t of [...(local.pregnancyTests ?? []), ...(remote.pregnancyTests ?? [])]) byId.set(t.id, t);
      const merged = [...byId.values()].filter((t) => !(deleted[t.id] >= t.createdAt) && !(wipeStamp > 0 && t.createdAt <= wipeStamp));
      return { pregnancyTests: cleanPregnancyTests(merged) };
    })(),
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
/** Salt of the envelope this tab last read or wrote on disk. A different salt on disk means another
    window re-keyed the journal: this tab's key is stale and must never write over it. */
let diskSalt = "";
/** Time of the last unlock (passphrase, fingerprint gate or parked key). */
let unlockedAt = 0;
/** When the page was hidden while the journal was open (0: not counting, e.g. a picker or the prompt). */
let hiddenAt = 0;
/** A hide this soon after opening is the fingerprint sheet closing, not leaving (loop guard). */
const PROMPT_SETTLE_MS = 2_000;
let staleHandler: () => void = () => undefined;

/* Other windows of Vela on this device (installed app + a browser tab). */
type KeyMsg = { t: "lock" } | { t: "rekey"; vaultId: string; salt: string };
let channel: BroadcastChannel | null = null;
function keyChannel() {
  if (!channel && typeof BroadcastChannel !== "undefined") {
    try {
      channel = new BroadcastChannel("vela-keys");
    } catch {
      channel = null;
    }
  }
  return channel;
}
function tell(msg: KeyMsg) {
  try {
    keyChannel()?.postMessage(msg);
  } catch {
    /* ignore */
  }
}
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
        const cur = await readVault().catch(() => null);
        if (cur && cur.envelope?.salt !== vk.salt && (cur.vaultId !== vaultIdMem || cur.envelope?.salt !== diskSalt)) {
          // Another window changed the passphrase (or replaced the journal) after we opened it.
          // Writing now would put the journal back under the old passphrase: stop and lock instead.
          queued = null;
          staleHandler();
          break;
        }
        const envelope = await seal(vk, next);
        await writeVault({ vaultId: vaultIdMem, envelope, savedAt: Date.now() });
        diskSalt = vk.salt;
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

/**
 * Gives every session without a (known) encounter one: the same partner's encounter covering its day, else a
 * new one. The new id comes from the session id, so two devices housing the same orphan agree; it is created
 * after any encounters wipe (`cut`), so a sync merge doesn't drop it and bring it back on every unlock.
 */
function attachOrphans(sessions: Session[], encounters: Encounter[], cut = 0) {
  const next = encounters.slice();
  const known = new Set(next.map((encounter) => encounter.id));
  for (const session of sessions) {
    if (session.encounterId && known.has(session.encounterId)) continue;
    const cover = next.find(
      (encounter) =>
        encounter.startDate <= session.date &&
        session.date <= encounter.endDate &&
        samePartner(encounter.partnerName, session.partnerName),
    );
    if (cover) {
      session.encounterId = cover.id;
      continue;
    }
    const id = `eo-${session.id}`;
    next.push({
      id,
      createdAt: Math.max(session.createdAt || 0, cut + 1),
      updatedAt: Date.now(),
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
  const existing = coveringEncounter(journal.encounters, date, partner);
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
  const members = journal.sessions.filter((session) => session.encounterId === current.id);
  // An encounter belongs to one partner (or solo). A session with someone else never joins it;
  // linkedOrCover then finds or makes the right one. An encounter with no other sessions follows its session.
  if (!samePartner(current.partnerName, partner) && members.length > 0) return { encounters, encounterId: "" };
  const span = coverDates([...chosen, ...members.map((session) => session.date)]);
  encounters[index] = {
    ...current,
    title: draft.encounterTitle.trim() || current.title,
    partnerName: members.length > 0 ? current.partnerName || partner : partner,
    startDate: span.startDate,
    endDate: span.endDate,
    problems: draft.encounterProblems.slice(),
    updatedAt: Date.now(),
  };
  return { encounters, encounterId: current.id };
}

/** Drop encounters (from `ids`) that no longer hold any session; they get a tombstone so sync agrees. */
function pruneEmpty(journal: Journal, ids: string[]): Journal {
  const empty = new Set(
    ids.filter((id) => id && journal.encounters.some((e) => e.id === id) && !journal.sessions.some((s) => s.encounterId === id)),
  );
  if (empty.size === 0) return journal;
  return {
    ...journal,
    encounters: journal.encounters.filter((e) => !empty.has(e.id)),
    deleted: tombstone(journal, [...empty]),
  };
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
  /** The user manual layer: null = closed, "" = cover, a topic id = that entry. UI only — never persisted. */
  manualTopic: string | null;
  /** Where the manual was opened from ("settings" or a TabId), for its back chip. */
  manualFrom: string;
  showForm: boolean;
  /** Home's batch card: raised by the hero tile, and by the Manual's
   * doors — a door must be able to open the card it rings (RT-V5 B3).
   * UI only — never persisted. */
  showBatch: boolean;
  editingId: string | null;
  confirmDeleteId: string | null;
  confirmErase: boolean;
  composeEncounterId: string | null;
  sections: Record<string, boolean>;
  /** Settings clusters (2.2.9): which named area is open. UI only — never persisted. */
  clusters: Record<string, boolean>;
  calY: number;
  calM: number;
  calSel: string;
  histQ: string;
  histPartner: string;
  histFrom: string;
  histTo: string;
  histPhase: "" | "period" | "fertile" | "ovulation" | "quiet";
  histLayout: "list" | 2 | 3 | 4;
  compare: CompareMode;
  toast: string | null;
  /** An action offered inside the toast (Undo after a quick count); the toast then stays 8 s. */
  toastAction: { label: string; run: () => void } | null;
  lastActivity: number;
  /** "none": no journal on this device yet · "locked": there is an encrypted journal on this device. */
  vault: "loading" | "none" | "locked" | "unavailable";
  /** The passphrase was typed on this device in this session (unlock or opening the account copy). */
  passTyped: boolean;
  /** The journal key is parked on this device: the lock screen only needs the app lock, never the passphrase. */
  keyParked: boolean;
  vaultId: string;
  keyEpoch: number;
  legacy: Journal | null;
  /** `resume`: reopen without the app lock (another window changed the key while this one was open). */
  hydrate: (opts?: { resume?: boolean }) => Promise<void>;
  touch: () => void;
  /** The page came back into view: lock if it was away longer than this device's "lock after leaving". */
  noteVisible: () => void;
  /** Opens the journal with the key parked on this device (after the app lock said yes). */
  openParked: () => Promise<"ok" | "missing" | "invalid">;
  lock: () => void;
  _lockHere: (opts: { drop: boolean; broadcast: boolean }) => void;
  replaceJournal: (raw: unknown) => void;
  setLanguage: (language: Lang) => void;
  cloudPhase: CloudPhase;
  setCloudPhase: (phase: CloudPhase) => void;
  createJournal: (name: string, passphrase: string, importLegacy: boolean) => Promise<"short" | "ok">;
  adoptJournal: (raw: unknown, key: VaultKey) => Promise<void>;
  rekey: (key: VaultKey, passphrase?: string) => Promise<void>;
  unlock: (passphrase: string) => Promise<boolean>;
  verifyPassphrase: (passphrase: string) => Promise<boolean>;
  /** The spelling of `passphrase` that opens this device's journal (see passphraseCandidates), or null. */
  matchPassphrase: (passphrase: string) => Promise<string | null>;
  /** Why the lock screen is showing, when it isn't the usual reason. */
  lockNote: "" | "stale";
  noteHidden: () => void;
  changePassphrase: (current: string, next: string) => Promise<"short" | "bad" | "ok">;
  importLegacy: () => Promise<number>;
  discardLegacy: () => void;
  forgetDevice: () => Promise<void>;
  setTab: (tab: TabId) => void;
  setSettingsOpen: (open: boolean) => void;
  openManual: (id: string | null) => void;
  toggleSection: (id: string) => void;
  toggleCluster: (id: string) => void;
  openCluster: (id: string) => void;
  setShowForm: (open: boolean) => void;
  setShowBatch: (open: boolean) => void;
  beginSession: (encounterId: string) => void;
  clearCompose: () => void;
  openEdit: (id: string) => void;
  closeEdit: () => void;
  saveNew: (draft: Draft) => void;
  saveMany: (drafts: Draft[]) => void;
  saveBatch: (entries: BatchEntry[], partnerName: string) => void;
  saveEdit: (id: string, draft: Draft) => void;
  /** Counts one bare session now and returns its id (for Undo). */
  quickLog: () => string;
  addRound: (id: string) => string | null;
  deleteSession: (id: string) => void;
  removeEncounter: (id: string) => void;
  setConfirmDelete: (id: string | null) => void;
  setConfirmErase: (open: boolean) => void;
  saveDisplayName: (name: string) => void;
  setTheme: (theme: ThemeId) => void;
  toggleMode: () => void;
  setRatingStyle: (style: RatingStyle) => void;
  muteStoryDay: (date: string) => void;
  muteStoryPerson: (name: string) => void;
  unmuteStory: (kind: "person" | "day", value: string) => void;
  saveAnniversary: (a: Anniversary) => void;
  deleteAnniversary: (id: string) => void;
  saveChild: (c: ChildEntry) => void;
  deleteChild: (id: string) => void;
  setSpeakAs: (v: SpeakAs) => void;
  /** Couple mode (2.2): the ceremony seeds the two people with their PINs,
   *  binds the partner's cycle trackers to her, and stamps the shared start. */
  enableCoupleMode: (args: { partnerName: string; sharedFrom: string; ownerPinHash: Person["pin"]; partnerPinHash: Person["pin"] }) => void;
  disableCoupleMode: () => void;
  /** The partner writes (or rewrites) her voice on a session. Composing her
   *  note from her dials happens here, with the same writer as the owner's. */
  savePartnerVoice: (sessionId: string, voice: Omit<import("./types").Voice, "notes" | "updatedAt">) => void;
  /** Her voice is hers: she (or the hand holding her PIN) may erase it alone. */
  deletePartnerVoice: (sessionId: string) => void;
  /** The shared-erasure government (2.2.3): propose, decide, cancel, and —
   *  for an approved wipe whose cooling-off has passed — carry out. */
  proposeDeletion: (input: { kind: Proposal["kind"]; targetId?: string; targetLabel?: string }, by: string) => string;
  decideProposal: (id: string, by: string, approve: boolean) => void;
  cancelProposal: (id: string) => void;
  executeWipe: (id: string) => void;
  /** Quiet days (2.2.4): name a stretch, or take a name back. Saving over an
   *  existing mark replaces the overlapped portion — the newest word wins
   *  and the user never arbitrates geometry. */
  saveQuietMark: (mark: Omit<QuietMark, "id" | "createdAt" | "updatedAt"> & { id?: string }) => void;
  /** Pregnancy tests her words stated (2.2.7): kept from the batch door,
   *  appended as events — the journal learns what she said, verbatim. */
  addPregnancyTests: (events: Omit<PregnancyTestEvent, "id" | "createdAt">[]) => void;
  deleteQuietMark: (id: string) => void;
  archivePerson: (name: string) => void;
  unarchivePerson: (name: string) => void;
  setArchivedPref: (name: string, key: "showInHistory" | "countInStats" | "resurface", value: boolean) => void;
  deletePersonForever: (name: string) => void;
  setWeekStart: (weekStart: WeekStart) => void;
  setDiscreet: (discreet: boolean) => void;
  setAutoLock: (mins: number) => void;
  setBatchDraft: (draft: import("./types").BatchDraft | undefined) => void;
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
  restoreCycleDates: (snap: { id: string; starts: string[]; ends: Record<string, string>; reasons?: Record<string, CycleReason> }, after?: { id: string; starts: string[]; ends: Record<string, string>; reasons?: Record<string, CycleReason> }) => void;
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
  openHistPhase: (phase: "period" | "fertile" | "ovulation" | "quiet") => void;
  clearHistRange: () => void;
  setCompare: (mode: CompareMode) => void;
  showToast: (message: string, action?: { label: string; run: () => void }) => void;
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
  | "conflict"
  | "other-account";

let toastTimer: ReturnType<typeof setTimeout> | null = null;

/** The CSV export, as a pure function of the journal. Her voice has
 * its own columns (Decision 3): her five dials, her own words and her
 * note sit beside his, so the export stops being a one-voice record
 * of a two-voice diary. */
export function csvText(journal: Journal): string {
  const rows: string[][] = [
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
      "partner_intensity",
      "partner_connection",
      "partner_satisfaction",
      "partner_energy",
      "partner_overall",
      "partner_own_words",
      "partner_notes",
      "contraception",
      "problems",
    ],
  ];
  const nameOf = new Map(journal.encounters.map((encounter) => [encounter.id, encounter.title]));
  sessionsSorted(journal.sessions)
    .slice()
    .reverse()
    .forEach((s) => {
      const v = s.partnerVoice;
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
        v ? String(v.intensity) : "",
        v ? String(v.connection) : "",
        v ? String(v.satisfaction) : "",
        v ? String(v.energy) : "",
        v ? String(v.overall) : "",
        v?.ownWords ?? "",
        v?.notes ?? "",
        (s.contraception ?? []).join("; "),
        (s.problems ?? []).join("; "),
      ]);
    });
  // A cell whose text opens with =, +, - or @ wakes as a FORMULA when
  // the file is opened in a spreadsheet — a partner named "=2+5" or a
  // note opening "@SUM(…)" would execute, not display (RT2-H4 B7).
  // The leading apostrophe is the spreadsheet world's own "read this
  // as text" mark; it changes nothing the user sees in the cell.
  const safeCell = (cell: unknown) => {
    const text = String(cell ?? "");
    return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  };
  return rows
    .map((row) => row.map((cell) => `"${safeCell(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

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
    const prev = get().journal;
    let next = { ...journal, updatedAt: Date.now() };
    // A name back in the partner list after it was removed (re-added, or logged with again) is live again.
    const back = next.partners.filter((name) => !prev.partners.includes(name) && partnerRemoved(name, next.deleted));
    if (back.length) {
      const deleted = { ...(next.deleted ?? {}) };
      /* The re-add stamp goes through stampNow, not the raw clock
       * (Round 3, RT3-H1 B7): removePartner mints the OFF stamp through
       * stampNow, so a re-add under a set-back clock minted an ON stamp
       * older than the removal — and the merge un-added her again. */
      const onAt = stampNow(prev);
      for (const name of back) deleted[PARTNER_ON + partnerKey(name)] = onAt;
      next = { ...next, deleted };
    }
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
    const now = stampNow(get().journal);
    const cycles = settings.cycles.map((tracker) => {
      if (tracker.id !== target) return tracker;
      const link = extra && "partnerLink" in extra ? { partnerLink: extra.partnerLink ?? "" } : {};
      return restamp(tracker, cleanTracker({ ...tracker, ...change(tracker), ...link, id: tracker.id }, tracker.id), now);
    });
    patchSettings({ cycles, cycle: asLegacyCycle(cycles[0]), cycleSelected: selectedId(cycles, settings.cycleSelected) });
  };

  /** After unlock: one-time migrations (split mixed-partner encounters) + empty-encounter tidy, saved if changed. */
  const migrated = (journal: Journal): Journal => {
    const result = runMigrations(journal);
    if (!result.changed) return journal;
    const next = { ...result.journal, updatedAt: Date.now() };
    void persist(next);
    return next;
  };

  /** Opens the journal on disk with `vk` (the parked key). False when that key doesn't open it. */
  const openWith = async (vk: VaultKey, env: Envelope): Promise<boolean> => {
    try {
      const data = await open(vk, env);
      sessionKey = vk;
      diskSalt = env.salt;
      unlockedAt = Date.now();
      hiddenAt = 0;
      const language = get().journal.settings.language;
      const loaded = journalFromUnknown(data, language);
      loaded.settings.language = language;
      if (!loaded.profile) loaded.profile = { displayName: "", createdAt: Date.now() };
      const journal = migrated(loaded);
      rememberUi(journal);
      set({ journal, legacy: readLegacyJournal(), vault: "locked", vaultId: vaultIdMem, unlocked: true, keyParked: true, lastActivity: Date.now(), lockNote: "" });
      markSeen();
      return true;
    } catch {
      return false;
    }
  };

  return {
    ready: false,
    journal: lockedShell(),
    unlocked: false,
    lockNote: "",
    keyParked: false,
    vault: "loading",
    passTyped: false,
    vaultId: "",
    keyEpoch: 0,
    legacy: null,
    tab: "home",
    settingsOpen: false,
    manualTopic: null,
    manualFrom: "",
    showForm: true,
    showBatch: false,
    editingId: null,
    confirmDeleteId: null,
    confirmErase: false,
    composeEncounterId: null,
    cloudPhase: "off",
    sections: openSections,
    clusters: {},
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
    toastAction: null,
    lastActivity: Date.now(),
    hydrate: async (opts) => {
      // A failed read is never "no journal": that would show the setup screen to someone who has one.
      // Retry a few times (a phone can refuse IndexedDB for a moment right after launch or an update),
      // then say the journal couldn't be opened yet and offer to try again.
      let stored = null;
      let readOk = false;
      for (let attempt = 0; attempt < 4 && !readOk; attempt += 1) {
        try {
          stored = await readVault();
          readOk = true;
        } catch {
          await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
        }
      }
      if (!readOk) {
        set({ journal: lockedShell(), vault: "unavailable", keyParked: false, ready: true, unlocked: false });
        return;
      }
      vaultIdMem = stored?.vaultId ?? "";
      // The journal and its key must never be evicted under storage pressure.
      if (stored) void keepStorage();
      migrateLock(vaultIdMem, lastUser()?.id ?? null);
      const env0 = stored ? asEnvelope(stored.envelope) : null;
      const parked = stored && env0 ? await claimGrace(stored.vaultId) : null;
      // Every fresh launch asks for the app lock, except the silent reload that installs an update.
      if (parked && gateReady() && !opts?.resume && !quietResume()) {
        set({ journal: lockedShell(), legacy: readLegacyJournal(), vault: "locked", vaultId: vaultIdMem, keyParked: true, ready: true, unlocked: false, lastActivity: Date.now() });
        return;
      }
      // Android app: the lock was set up but the phone's prompt can't run now → the passphrase, never an open journal.
      if (parked && gateUnavailable() && !opts?.resume && !quietResume()) {
        set({ journal: lockedShell(), legacy: readLegacyJournal(), vault: "locked", vaultId: vaultIdMem, keyParked: false, ready: true, unlocked: false, lastActivity: Date.now() });
        return;
      }
      if (parked && stored && env0 && (await openWith(parked.vk, env0))) {
        set({ ready: true });
        return;
      }
      set({
        journal: lockedShell(),
        legacy: readLegacyJournal(),
        vault: stored && env0 ? "locked" : "none",
        vaultId: vaultIdMem,
        keyParked: false,
        ready: true,
        unlocked: false,
        lastActivity: Date.now(),
      });
    },
    openParked: async () => {
      const stored = await readVault().catch(() => null);
      const env = stored ? asEnvelope(stored.envelope) : null;
      if (!stored || !env) return "missing";
      vaultIdMem = stored.vaultId;
      const parked = await claimGrace(stored.vaultId);
      if (!parked) {
        set({ keyParked: false });
        return "missing";
      }
      if (await openWith(parked.vk, env)) return "ok";
      // The parked key no longer opens this journal (passphrase changed on another device): ask once.
      await dropGrace();
      set({ keyParked: false });
      return "invalid";
    },
    touch: () => {
      set({ lastActivity: Date.now() });
    },
    noteHidden: () => {
      if (hiddenAt) return; // already away
      const now = Date.now();
      if (!get().unlocked) return;
      markSeen();
      // Only a hide while the journal is open counts as leaving. The fingerprint sheet hides the page while
      // locked, and a file picker opened from inside Vela is not leaving.
      if (gateAsking() || pickerJustOpened(now)) return;
      hiddenAt = now;
      // "Immediately": lock now, unless this is the fingerprint sheet closing right after it opened Vela.
      if (lockAfterMs() === 0 && gateReady() && now - unlockedAt > PROMPT_SETTLE_MS) get().lock();
    },
    noteVisible: () => {
      const left = hiddenAt;
      hiddenAt = 0;
      if (!get().unlocked || !left) return;
      const now = Date.now();
      markSeen();
      const awayMs = now - left;
      // The sheet flickering as it closes (hidden for a moment right after unlocking) is not leaving.
      const settling = left - unlockedAt < PROMPT_SETTLE_MS && awayMs < PROMPT_SETTLE_MS;
      if ((gateReady() || gateUnavailable()) && awayMs > lockAfterMs() && !settling) get().lock();
    },
    // Locking hides the journal behind the app lock; the key stays parked, so coming back needs no passphrase.
    // With the app lock on but no fingerprint / screen lock usable here, the passphrase is the only lock left:
    // then (and only then) Lock wipes the key, as before.
    lock: () => get()._lockHere({ drop: appLockOn() && !gateReady(), broadcast: true }),
    _lockHere: (opts: { drop: boolean; broadcast: boolean }) => {
      const wasOpen = get().unlocked;
      resetFingerprintPrompt();
      if (opts.drop) void dropGrace();
      if (opts.broadcast && wasOpen) tell({ t: "lock" });
      const language = get().journal.settings.language;
      // Pending writes already captured their key; drop ours so memory no longer holds it.
      void flushSaves();
      const hadKey = Boolean(sessionKey);
      sessionKey = null;
      hiddenAt = 0;
      clearSeen();
      set({
        journal: lockedShell(language),
        vault: vaultIdMem ? "locked" : get().vault,
        keyParked: opts.drop ? false : hadKey || get().keyParked,
        tab: "home",
        histQ: "",
        histPartner: "",
        toast: null,
        toastAction: null,
        unlocked: false,
        settingsOpen: false,
        editingId: null,
        confirmDeleteId: null,
        confirmErase: false,
        cycleDay: null,
        cycleSheet: false,
        lockNote: "",
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
      unlockedAt = Date.now();
      diskSalt = vk.salt;
      set({ journal, unlocked: true, vault: "locked", vaultId: vaultIdMem, keyParked: true, lastActivity: Date.now(), lockNote: "" });
      markSeen();
      await persist(journal);
      void parkKey(vk, vaultIdMem, unlockedAt);
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
      unlockedAt = Date.now();
      diskSalt = vk.salt;
      set({ journal, unlocked: true, vault: "locked", vaultId: vaultIdMem, keyParked: true, lastActivity: Date.now(), lockNote: "" });
      markSeen();
      await persist(journal);
      void parkKey(vk, vaultIdMem, unlockedAt);
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
      await parkKey(vk, vaultIdMem, unlockedAt || Date.now());
      // Other windows still hold the old key: they reopen with the one just parked.
      if (sessionKey === vk) tell({ t: "rekey", vaultId: vaultIdMem, salt: vk.salt });
    },
    unlock: async (passphrase) => {
      const stored = await readVault().catch(() => null);
      const env = stored ? asEnvelope(stored.envelope) : null;
      if (!stored || !env) return false;
      try {
        const { vk, data, used } = await openWithCandidates(passphrase, env);
        sessionKey = vk;
        diskSalt = env.salt;
        unlockedAt = Date.now();
        vaultIdMem = stored.vaultId;
        const language = get().journal.settings.language;
        const loaded = journalFromUnknown(data, language);
        loaded.settings.language = language;
        if (!loaded.profile) loaded.profile = { displayName: "", createdAt: Date.now() };
        const journal = migrated(loaded);
        rememberUi(journal);
        rememberPass(used);
        set({ journal, unlocked: true, vaultId: vaultIdMem, keyParked: true, passTyped: true, lastActivity: Date.now(), lockNote: "" });
        markSeen();
        void parkKey(vk, vaultIdMem, unlockedAt);
        // The fingerprint held an older passphrase (changed in another window/device): seal this one.
        if (bioIsStale() && bioForUser(vaultIdMem)) {
          const vid = vaultIdMem;
          void rewrapFingerprint(used, vid).then((r) => {
            setBioStale(false);
            useBioUi.getState().bump();
            if (r === "ok") get().showToast(bioText("rewrapped"));
          });
        }
        return true;
      } catch {
        return false;
      }
    },
    verifyPassphrase: async (passphrase) => (await get().matchPassphrase(passphrase)) !== null,
    matchPassphrase: async (passphrase) => {
      const stored = await readVault().catch(() => null);
      const env = stored ? asEnvelope(stored.envelope) : null;
      if (!env) return null;
      try {
        return (await openWithCandidates(passphrase, env)).used;
      } catch {
        return null;
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
      const mine = get().journal;
      const merged = mergeJournals(mine, { ...legacy, profile: get().journal.profile });
      const droppedCycles = mergeDroppedCycles(mine, legacy, merged);
      commit({ ...merged, profile: get().journal.profile });
      if (droppedCycles > 0) get().showToast(STR[get().journal.settings.language].cyMergeFull);
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
      // Every copy of the diary leaves the device — the encrypted vault
      // below AND the pre-vault plaintext journal, which is the most
      // sensitive copy that exists. (RT-V1 B-5: this call was missing,
      // and the plaintext diary survived the forget byte-identical.)
      removeLegacyJournal();
      clearSeen();
      sessionKey = null;
      vaultIdMem = "";
      diskSalt = "";
      tell({ t: "lock" });
      clearFingerprint();
      void dropGrace();
      await deleteVault().catch(() => undefined);
      await deleteSync().catch(() => undefined);
      set({ journal: lockedShell(get().journal.settings.language), unlocked: false, vault: "none", vaultId: "", keyParked: false });
    },
    setTab: (tab) => set({ tab }),
    setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
    openManual: (id) =>
      set((st) => (id === null ? { manualTopic: null } : { manualTopic: id, manualFrom: st.settingsOpen ? "settings" : st.tab })),
    toggleSection: (id) => {
      const current = get().sections;
      const next = !current[id];
      const sections: Record<string, boolean> = {};
      for (const key of Object.keys(current)) sections[key] = false;
      sections[id] = next;
      set({ sections });
    },
    // Clusters hold the sections' roof: one open at a time, like the
    // sections themselves. Sections keep their own state underneath, so
    // returning to a cluster finds the section you left open still open.
    toggleCluster: (id) => {
      const current = get().clusters;
      const next = !current[id];
      const clusters: Record<string, boolean> = {};
      for (const key of Object.keys(current)) clusters[key] = false;
      clusters[id] = next;
      set({ clusters });
    },
    openCluster: (id) => {
      const clusters: Record<string, boolean> = {};
      for (const key of Object.keys(get().clusters)) clusters[key] = false;
      clusters[id] = true;
      set({ clusters });
    },
    setShowForm: (showForm) => set({ showForm }),
    setShowBatch: (showBatch) => set({ showBatch }),
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
      if (session.partnerName && !partners.some((p) => samePartner(p, session.partnerName))) partners.push(session.partnerName);
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
        if (data.partnerName && !partners.some((p) => samePartner(p, data.partnerName))) partners.push(data.partnerName);
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
      // A solo entry is saved with no partner (never the batch partner); others need a name from the text or the batch.
      const list = entries.filter((entry) => entry.date && entry.count > 0 && (entry.solo || entry.partnerName?.trim() || fallback));
      if (list.length === 0) return;
      const journal = get().journal;
      const lang = journal.settings.language;
      const partners = journal.partners.slice();
      const encounters = journal.encounters.slice();
      const sessions = journal.sessions.slice();
      const stamp = Date.now();
      list.forEach((entry, index) => {
        const partner = entry.solo ? "" : entry.partnerName?.trim() || fallback;
        if (partner && !partners.some((p) => samePartner(p, partner))) partners.push(partner);
        const encounterId = `e${stamp.toString(36)}${index.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
        const rangeEnd = entry.endDate && entry.endDate > entry.date ? entry.endDate : entry.date;
        const days = spanDays(entry.date, rangeEnd);
        const [hourText0, minuteText0] = (entry.time || "21:00").split(":");
        const startMins0 = (Number(hourText0) || 0) * 60 + (Number(minuteText0) || 0);
        // Rounds 30 min apart that run past midnight land on the next day (audit L2).
        const spill = days === 1 && !entry.nextDay && entry.count > 1 && startMins0 + (entry.count - 1) * 30 >= 1440 && !(entry.times?.length >= entry.count);
        const end = days > 1 ? rangeEnd : entry.nextDay || spill ? addDays(entry.date, 1) : entry.date;
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
          const raw = startMins + sessionIndex * 30;
          const mins = raw % 1440;
          // A range spreads its rounds over its days (one per day when the count matches the days).
          const dayIndex = days > 1 ? (entry.count === 1 ? 0 : Math.round((sessionIndex * (days - 1)) / (entry.count - 1))) : 0;
          const date = days > 1 ? addDays(entry.date, Math.min(days - 1, dayIndex)) : onNext ? end : raw >= 1440 && spill ? end : entry.date;
          sessions.push({
            id: newId() + index.toString(36) + sessionIndex.toString(36),
            createdAt: stamp + index * 20 + sessionIndex,
            partnerName: partner,
            date,
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
      const before = journal.sessions.find((session) => session.id === id);
      const others = journal.sessions.filter((session) => session.id !== id);
      let target = draft;
      const current = draft.encounterId && draft.encounterId !== "new" ? journal.encounters.find((e) => e.id === draft.encounterId) : undefined;
      if (current) {
        const spanUntouched =
          (draft.encounterStart || current.startDate) === current.startDate && (draft.encounterEnd || current.endDate) === current.endDate;
        const outside = data.date < current.startDate || data.date > current.endDate;
        const alone = !others.some((session) => session.encounterId === current.id);
        const partnerMoved = !samePartner(current.partnerName, data.partnerName);
        if (spanUntouched && alone && partnerMoved && coveringEncounter(journal.encounters, data.date, data.partnerName)) {
          // Its own encounter would be left empty and the new partner already has one that day: join that one.
          target = { ...draft, encounterId: "", encounterTitle: "", encounterStart: "", encounterEnd: "", encounterProblems: [] };
        } else if (spanUntouched && outside) {
          // The date moved out of its encounter: re-home it if others stay behind, else the encounter follows it.
          target = others.some((session) => session.encounterId === current.id)
            ? { ...draft, encounterId: "", encounterTitle: "", encounterStart: "", encounterEnd: "", encounterProblems: [] }
            : { ...draft, encounterStart: data.date, encounterEnd: data.date };
        }
      }
      const linked = linkedOrCover({ ...journal, sessions: others }, target, data.partnerName, data.date);
      const sessions = journal.sessions.map((session) =>
        session.id === id ? { ...session, ...data, encounterId: linked.encounterId, updatedAt: Date.now() } : session,
      );
      const partners = journal.partners.slice();
      if (data.partnerName && !partners.some((p) => samePartner(p, data.partnerName))) partners.push(data.partnerName);
      commit(
        pruneEmpty({ ...journal, partners, encounters: linked.encounters, sessions: renumber(sessions) }, [before?.encounterId ?? ""]),
      );
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
      return session.id;
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
      // A new round is a new moment: the partner's voice belongs to the moment
      // she spoke about and is never copied into another one (2.2).
      delete copy.partnerVoice;
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
      const gone = journal.sessions.find((s) => s.id === id);
      commit(
        pruneEmpty(
          { ...journal, sessions: renumber(journal.sessions.filter((s) => s.id !== id)), deleted: tombstone(journal, [id]) },
          [gone?.encounterId ?? ""],
        ),
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
    muteStoryDay: (date) => {
      const journal = get().journal;
      const m = cleanMuted(journal.settings.storiesMuted);
      if (m.days.includes(date)) return;
      commit({
        ...journal,
        settings: { ...journal.settings, storiesMuted: { ...m, days: [...m.days, date] } },
        deleted: { ...(journal.deleted ?? {}), [MUTE_ON + muteKey("day", date)]: stampNow(journal) },
      });
    },
    muteStoryPerson: (name) => {
      const journal = get().journal;
      const m = cleanMuted(journal.settings.storiesMuted);
      if (m.people.some((p) => p.toLowerCase() === name.toLowerCase())) return;
      commit({
        ...journal,
        settings: { ...journal.settings, storiesMuted: { ...m, people: [...m.people, name] } },
        deleted: { ...(journal.deleted ?? {}), [MUTE_ON + muteKey("person", name)]: stampNow(journal) },
      });
    },
    unmuteStory: (kind, value) => {
      const journal = get().journal;
      const m = cleanMuted(journal.settings.storiesMuted);
      /* Un-muting mints the off stamp (RT2-H1 B2): the merge unions
       * the mute lists, so only the stamp keeps the un-mute true. */
      commit({
        ...journal,
        settings: {
          ...journal.settings,
          storiesMuted:
            kind === "person"
              ? { ...m, people: m.people.filter((p) => p.toLowerCase() !== value.toLowerCase()) }
              : { ...m, days: m.days.filter((d) => d !== value) },
        },
        deleted: { ...(journal.deleted ?? {}), [MUTE_OFF + muteKey(kind, value)]: stampNow(journal) },
      });
    },
    saveAnniversary: (a) => {
      const journal = get().journal;
      const list = cleanAnniversaries(journal.settings.anniversaries);
      patchSettings({ anniversaries: [...list.filter((x) => x.id !== a.id), { ...a, updatedAt: stampNow(journal) }] });
    },
    deleteAnniversary: (id) => {
      const journal = get().journal;
      const list = cleanAnniversaries(journal.settings.anniversaries);
      /* A deletion without a tombstone is a suggestion the next merge
       * overrules (RT2-H6-1): the byId union honors `deleted[id]`, so
       * the removal mints one. */
      commit({ ...journal, settings: { ...journal.settings, anniversaries: list.filter((x) => x.id !== id) }, deleted: tombstone(journal, [id]) });
    },
    saveChild: (c) => {
      const journal = get().journal;
      const list = cleanChildren(journal.settings.children);
      patchSettings({ children: [...list.filter((x) => x.id !== c.id), { ...c, updatedAt: stampNow(journal) }] });
    },
    deleteChild: (id) => {
      const journal = get().journal;
      const list = cleanChildren(journal.settings.children);
      commit({ ...journal, settings: { ...journal.settings, children: list.filter((x) => x.id !== id) }, deleted: tombstone(journal, [id]) });
    },
    setSpeakAs: (speakAs) => {
      const journal = get().journal;
      if (!journal.profile) return;
      commit({ ...journal, profile: { ...journal.profile, speakAs } });
    },
    enableCoupleMode: ({ partnerName, sharedFrom, ownerPinHash, partnerPinHash }) => {
      const journal = get().journal;
      if (!journal.profile || journal.settings.coupleMode) return;
      const now = stampNow(journal);
      const owner: Person = {
        id: "p-owner",
        name: journal.profile.displayName || "Me",
        role: "owner",
        ...(journal.profile.speakAs ? { speakAs: journal.profile.speakAs } : {}),
        ...(ownerPinHash ? { pin: ownerPinHash } : {}),
        createdAt: now,
        updatedAt: now,
      };
      const partner: Person = {
        id: newPersonId(),
        name: partnerName.trim(),
        role: "partner",
        ...(partnerPinHash ? { pin: partnerPinHash } : {}),
        createdAt: now,
        updatedAt: now,
      };
      // Her cycle trackers become hers in fact: bind by the same name matching
      // the app already uses to assign phases (followsPartner), never by guess.
      const key = partnerKey(partner.name);
      const cycles = (journal.settings.cycles ?? []).map((tracker) =>
        !tracker.ownerId && (partnerKey(tracker.partnerLink || "") === key || partnerKey(tracker.partnerName || "") === key)
          ? { ...tracker, ownerId: partner.id, metaAt: now, updatedAt: now }
          : tracker,
      );
      commit({
        ...journal,
        people: [owner, partner],
        settings: { ...journal.settings, cycles, coupleMode: { sharedFrom, enabledAt: now } },
      });
    },
    disableCoupleMode: () => {
      // The people and their voices stay — history is not unwritten. Only the
      // mode turns off: no new voices are asked for until it is on again.
      // The whole settings object is committed: patchSettings merges, and a
      // merge can never delete a key.
      const journal = get().journal;
      const settings = { ...journal.settings };
      delete settings.coupleMode;
      commit({ ...journal, settings, deleted: { ...(journal.deleted ?? {}), [COUPLE_OFF]: stampNow(journal) } });
    },
    savePartnerVoice: (sessionId, voice) => {
      const journal = get().journal;
      const lang = journal.settings.language;
      const sessions = journal.sessions.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              partnerVoice: {
                ...voice,
                ownWords: voice.ownWords.slice(0, 4000),
                notes: composedNote(voice, lang),
                updatedAt: Date.now(),
              },
              updatedAt: Date.now(),
            }
          : s,
      );
      commit({ ...journal, sessions });
    },
    deletePartnerVoice: (sessionId) => {
      const journal = get().journal;
      const sessions = journal.sessions.map((s) => {
        if (s.id !== sessionId || !s.partnerVoice) return s;
        const next = { ...s, updatedAt: Date.now() };
        delete next.partnerVoice;
        return next;
      });
      commit({ ...journal, sessions });
    },
    proposeDeletion: (input, by) => {
      const journal = get().journal;
      // A duplicate ask is the same ask. For a person, sameness is the
      // person, not the label's casing (Decision 4): "Lucía" and
      // "lucía" are one pending question, not two.
      const existing = (journal.proposals ?? []).find((p) => {
        if (p.state !== "pending" || p.kind !== input.kind) return false;
        if (input.kind === "delete-person" && input.targetLabel && p.targetLabel)
          return partnerKey(p.targetLabel) === partnerKey(input.targetLabel);
        // Sameness is the target's ID, never its label: the label is
        // composed in the proposer's language ("Oct 25 · Ana" on one
        // phone, "25 de oct · Ana" on the other), so label equality
        // filed the same session twice in the Decisions tray
        // (RT2-H4 B6). Label comparison remains only for proposals
        // that carry no ID at all.
        if (input.targetId) return p.targetId === input.targetId;
        return p.targetLabel === input.targetLabel;
      });
      if (existing) return existing.id;
      const now = Date.now();
      const proposal: Proposal = {
        id: newProposalId(),
        kind: input.kind,
        ...(input.targetId ? { targetId: input.targetId } : {}),
        ...(input.targetLabel ? { targetLabel: input.targetLabel } : {}),
        proposedBy: by,
        proposedAt: now,
        state: "pending",
        expiresAt: now + PROPOSAL_TTL_MS,
      };
      commit({ ...journal, proposals: [...(journal.proposals ?? []), proposal] });
      return proposal.id;
    },
    decideProposal: (id, by, approve) => {
      const journal = get().journal;
      const proposal = (journal.proposals ?? []).find((p) => p.id === id);
      // Consent comes from the other person — never from the proposer.
      if (!proposal || proposal.state !== "pending" || proposal.proposedBy === by) return;
      const now = Date.now();
      // Caducity is enforced at the act too, not only at the load gate: a
      // proposal whose week lapsed inside a live session dies here,
      // silently, exactly as the gate would kill it at the next unlock.
      if (now > proposal.expiresAt) {
        commit({
          ...journal,
          proposals: (journal.proposals ?? []).filter((p) => p.id !== id),
          deleted: tombstone(journal, [id]),
        });
        return;
      }
      // Consent comes from a person of the diary — unconditionally
      // (Round 2, RT2-H1 B3): the guard used to apply only when the
      // diary HAD people, so an empty people list let a fabricated id
      // sign. Nobody home means nobody signs; and a proposal nobody in
      // the diary made cannot be decided either — both signatures must
      // belong to the diary's people.
      const people = journal.people ?? [];
      if (!people.some((person) => person.id === by) || !people.some((person) => person.id === proposal.proposedBy)) return;
      if (approve && proposal.kind === "wipe-vault") {
        // The second consent starts the cooling-off; the wipe itself is a
        // separate, later act either partner can still cancel.
        commit({
          ...journal,
          proposals: (journal.proposals ?? []).map((p) =>
            p.id === id ? { ...p, state: "approved" as const, decidedBy: by, decidedAt: stampNow(journal) } : p,
          ),
        });
        return;
      }
      // Declined, or approved for a single shared thing: the proposal leaves
      // no scar — it is removed and tombstoned so no other device can
      // resurrect it as pending. Execution reuses the standing engines, so
      // the erasure itself tombstones and survives merges exactly like a
      // deletion made by hand.
      commit({
        ...journal,
        proposals: (journal.proposals ?? []).filter((p) => p.id !== id),
        deleted: tombstone(journal, [id]),
      });
      if (!approve) return;
      if (proposal.kind === "delete-session" && proposal.targetId) get().deleteSession(proposal.targetId);
      else if (proposal.kind === "delete-encounter" && proposal.targetId) get().removeEncounter(proposal.targetId);
      else if (proposal.kind === "delete-person" && proposal.targetLabel) get().deletePersonForever(proposal.targetLabel);
    },
    cancelProposal: (id) => {
      const journal = get().journal;
      if (!(journal.proposals ?? []).some((p) => p.id === id)) return;
      commit({
        ...journal,
        proposals: (journal.proposals ?? []).filter((p) => p.id !== id),
        deleted: tombstone(journal, [id]),
      });
    },
    executeWipe: (id) => {
      const journal = get().journal;
      const proposal = (journal.proposals ?? []).find((p) => p.id === id);
      if (!proposal || proposal.kind !== "wipe-vault" || proposal.state !== "approved" || !proposal.decidedAt) return;
      // The government of two is enforced at the act itself, not only in
      // the inbox that displays it: an approval the proposer gave himself,
      // or one from outside the diary's people, is void — the proposal is
      // cancelled (tombstoned, so it cannot resurface as approved) and
      // nothing burns.
      const people = journal.people ?? [];
      if (!proposal.decidedBy || proposal.decidedBy === proposal.proposedBy || !people.some((person) => person.id === proposal.decidedBy) || !people.some((person) => person.id === proposal.proposedBy)) {
        get().cancelProposal(id);
        return;
      }
      if (Date.now() < proposal.decidedAt + WIPE_COOLING_MS) return;
      // "Erase the whole diary" erases the whole diary: the inventory in
      // wipe.ts, not the category eraser's six flags. The commit seals the
      // emptied journal; the lock then flushes that seal before the key
      // drops, and the diary wakes to its door, empty.
      commit(wipedJournal(journal, stampNow(journal)));
      get().lock();
    },
    addPregnancyTests: (events) => {
      if (!events.length) return;
      const journal = get().journal;
      const now = Date.now();
      const fresh = events.map((e, i) => ({ ...e, id: newTestId(), createdAt: now + i }));
      commit({ ...journal, pregnancyTests: cleanPregnancyTests([...(journal.pregnancyTests ?? []), ...fresh]) });
    },
    saveQuietMark: (input) => {
      const journal = get().journal;
      const now = Date.now();
      const from = input.from <= input.to ? input.from : input.to;
      const to = input.from <= input.to ? input.to : input.from;
      const mark: QuietMark = {
        id: input.id ?? newQuietId(),
        from,
        to,
        reason: input.reason,
        ...(input.reason === "custom" && input.custom?.trim() ? { custom: input.custom.trim().slice(0, 80) } : {}),
        ...(input.note?.trim() ? { note: input.note.trim().slice(0, 160) } : {}),
        source: input.source,
        ...(input.themeText?.trim() ? { themeText: input.themeText.trim().slice(0, 160) } : {}),
        createdAt: now,
        updatedAt: now,
      };
      // One day, one name: the new mark replaces whatever it overlaps —
      // covered marks are trimmed or split, never left to argue.
      const kept: QuietMark[] = [];
      for (const old of journal.quietDays ?? []) {
        if (old.id === mark.id) continue;
        if (old.to < from || old.from > to) {
          kept.push(old);
          continue;
        }
        if (old.from < from) kept.push({ ...old, to: addDays(from, -1), updatedAt: now });
        if (old.to > to) kept.push({ ...old, id: newQuietId(), from: addDays(to, 1), createdAt: old.createdAt, updatedAt: now });
      }
      commit({ ...journal, quietDays: cleanQuietMarks([...kept, mark]) });
    },
    deleteQuietMark: (id) => {
      const journal = get().journal;
      if (!(journal.quietDays ?? []).some((m) => m.id === id)) return;
      commit({
        ...journal,
        quietDays: (journal.quietDays ?? []).filter((m) => m.id !== id),
        /* stampNow, not the raw clock (RT2-H3-05): this was the one
         * tombstone that never got the monotone stamp, so a set-back
         * clock minted a removal older than the mark it removed. */
        deleted: tombstone(journal, [id]),
      });
    },
    archivePerson: (name) => {
      const journal = get().journal;
      const list = cleanArchived(journal.settings.archivedPeople);
      if (list.some((p) => p.name.toLowerCase() === name.trim().toLowerCase())) return;
      patchSettings({
        archivedPeople: [...list, { name: name.trim(), archivedAt: stampNow(journal), showInHistory: false, countInStats: false, resurface: false }],
      });
    },
    unarchivePerson: (name) => {
      const journal = get().journal;
      const list = cleanArchived(journal.settings.archivedPeople);
      /* Un-archiving is a removal too (RT2-H4 B2): it mints the
       * `archived:` tombstone the merge's archive union reads, or the
       * other device's copy re-archives her at the next sync. */
      commit({
        ...journal,
        settings: { ...journal.settings, archivedPeople: list.filter((p) => p.name.toLowerCase() !== name.trim().toLowerCase()) },
        deleted: { ...(journal.deleted ?? {}), [`archived:${partnerKey(name)}`]: stampNow(journal) },
      });
    },
    setArchivedPref: (name, key, value) => {
      const journal = get().journal;
      const list = cleanArchived(journal.settings.archivedPeople);
      /* A pref flip is a change to the entry, so the entry's stamp
       * moves (RT2-H4 B3): the merge resolves equal-stamp copies by
       * side order, and an unmoved archivedAt lost flips it won. */
      patchSettings({
        archivedPeople: list.map((p) => (p.name.toLowerCase() === name.trim().toLowerCase() ? { ...p, [key]: value, archivedAt: stampNow(journal) } : p)),
      });
    },
    /* The Deletion Law: a person deleted is deleted whole — every session,
       encounter, cycle, anniversary and trace that names them, without return.
       The typed-name door in Settings is what stands before this action. */
    deletePersonForever: (name) => {
      const journal = get().journal;
      const key = name.trim().toLowerCase();
      if (!key) return;
      const match = (n: string) => n.trim().toLowerCase() === key;
      const goneEncounters = journal.encounters.filter((e) => match(e.partnerName));
      const goneEncIds = new Set(goneEncounters.map((e) => e.id));
      const sessions = journal.sessions.filter((s) => !match(s.partnerName) && !goneEncIds.has(s.encounterId));
      const removedSessionIds = journal.sessions.filter((s) => !sessions.includes(s)).map((s) => s.id);
      const settings = journal.settings;
      // Her identity lives in the diary by id as much as by name, and the
      // cascade follows both (prejudice hunt V4 B3/B10/B11, V3-11).
      const person = (journal.people ?? []).find((p) => match(p.name));
      const herId = person?.id;
      const removedTrackers = settings.cycles.filter(
        (tr) =>
          followsPartner(tr, name) ||
          (tr.partnerName ?? "").trim().toLowerCase() === key ||
          (herId !== undefined && tr.ownerId === herId),
      );
      const keptCycles = settings.cycles.filter((tr) => !removedTrackers.includes(tr));
      const cycles = keptCycles.length ? keptCycles : [defaultTracker()];
      const muted = cleanMuted(settings.storiesMuted);
      // Her words come off other people's sessions too: a partnerVoice she
      // authored does not survive her on anyone's session.
      const keptSessions = sessions.map((s) =>
        herId && s.partnerVoice?.by === herId ? { ...s, partnerVoice: undefined } : s,
      );
      // Her proposals die with her — pending AND approved (Round 3,
      // RT3-H1 B5): an approved wipe used to survive its proposer's
      // erasure and execute on a signature the diary no longer contains.
      // All are tombstoned below, so a merge cannot bring them (or her)
      // back.
      const herProposals = (journal.proposals ?? []).filter(
        (p) => herId !== undefined && p.proposedBy === herId,
      );
      // Her anniversaries and her archive entry go too — tombstoned below,
      // because the settings unions would otherwise resurrect them from a
      // stale device (wave 1 re-hunt R1).
      const allAnniversaries = cleanAnniversaries(settings.anniversaries);
      const goneAnniversaries = allAnniversaries.filter((a) => a.personName && match(a.personName));
      const keptAnniversaries = allAnniversaries.filter((a) => !goneAnniversaries.includes(a));
      const allArchived = cleanArchived(settings.archivedPeople);
      const goneArchived = allArchived.filter((p) => match(p.name));
      const keptArchived = allArchived.filter((p) => !goneArchived.includes(p));
      commit({
        ...journal,
        sessions: renumber(keptSessions),
        encounters: journal.encounters.filter((e) => !goneEncIds.has(e.id)),
        partners: journal.partners.filter((p) => !match(p)),
        ...(journal.people ? { people: journal.people.filter((p) => p.id !== herId) } : {}),
        ...(journal.proposals ? { proposals: journal.proposals.filter((p) => !herProposals.includes(p)) } : {}),
        settings: {
          ...settings,
          cycles,
          cycle: asLegacyCycle(cycles[0]),
          cycleSelected: selectedId(cycles, settings.cycleSelected),
          defaultPartner: match(settings.defaultPartner) ? "" : settings.defaultPartner,
          anniversaries: keptAnniversaries,
          archivedPeople: keptArchived,
          storiesMuted: { ...muted, people: muted.people.filter((p) => !match(p)) },
        },
        deleted: tombstone(journal, [
          ...removedSessionIds,
          ...goneEncounters.map((e) => e.id),
          ...removedTrackers.map((tr) => trackerTombstone(tr.id)),
          ...herProposals.map((p) => p.id),
          ...goneAnniversaries.map((a) => a.id),
          ...goneArchived.map((p) => `archived:${partnerKey(p.name)}`),
          // The partner-off tombstone: without it, the next merge with a
          // device that still lists her brings her straight back (V4 B4).
          // Her person id is tombstoned too, so her record (and PIN) can
          // never merge back either (V4 B3).
          PARTNER_OFF + partnerKey(name),
          ...(herId ? [herId] : []),
        ]),
      });
    },
    setWeekStart: (weekStart) => patchSettings({ weekStart }),
    setDiscreet: (discreet) => patchSettings({ discreet }),
    setAutoLock: (autoLockMins) => patchSettings({ autoLockMins }),
    setBatchDraft: (batchDraft) => {
      if (batchDraft) {
        patchSettings({ batchDraft });
        return;
      }
      /* Clearing the draft mints its tombstone (RT2-H1 B2): the merge
       * prefers any surviving copy, so only the stamp makes the
       * clearing stick on the other device. */
      const journal = get().journal;
      commit({ ...journal, settings: { ...journal.settings, batchDraft: undefined }, deleted: tombstone(journal, ["batchDraft"]) });
    },
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
    restoreCycleDates: (snap, after) => {
      // Undo: put back exactly the starts, ends and reasons the tracker had
      // before the change — testimony is part of the dates (V3-04).
      if (!get().journal.settings.cycles.some((tracker) => tracker.id === snap.id)) return;
      patchTracker(
        (cycle) => {
          const starts = snap.starts.slice();
          const ends = { ...snap.ends };
          const reasons = { ...(snap.reasons ?? {}) };
          if (after) {
            /* A sync merge may have landed between the change and the
             * undo (RT2-H3-03): entries the current tracker carries
             * that belong to NEITHER the before-state nor the change
             * itself are the other device's, and the undo does not own
             * them — they stay. Everything the change touched returns
             * to the before-state, and the restamp makes that win. */
            const owned = new Set<string>([
              ...snap.starts.map((d) => `s:${d}`),
              ...Object.keys(snap.ends).map((d) => `e:${d}`),
              ...Object.keys(snap.reasons ?? {}).map((d) => `r:${d}`),
              ...after.starts.map((d) => `s:${d}`),
              ...Object.keys(after.ends).map((d) => `e:${d}`),
              ...Object.keys(after.reasons ?? {}).map((d) => `r:${d}`),
            ]);
            for (const d of cycle.starts) if (!owned.has(`s:${d}`) && !starts.includes(d)) starts.push(d);
            for (const [d, e] of Object.entries(cycle.ends)) if (!owned.has(`e:${d}`)) ends[d] = e;
            for (const [d, r] of Object.entries(cycle.reasons ?? {})) if (!owned.has(`r:${d}`)) reasons[d] = r;
          }
          return cleanCycle({ ...cycle, starts, ends, reasons });
        },
        snap.id,
      );
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
      // One tracker per person, enforced at the door (RT-V3 L-1): a
      // second tracker for someone already followed would shadow the
      // first in every resolver. The answer is the existing tracker —
      // the caller surfaces it, which is the redirect the plan asks
      // for, never a silent twin.
      const existing =
        spec.perspective === "self"
          ? settings.cycles.find((tracker) => tracker.perspective === "self")
          : settings.cycles.find((tracker) => followsPartner(tracker, spec.partnerLink || spec.partnerName || ""));
      if (existing) return existing.id;
      // The id binding is identity too (Round 2, RT2-H3-06): a tracker
      // bound to a person by ownerId whose name and link were cleared is
      // invisible to followsPartner, and the door minted a twin for the
      // very person it already follows. The delete cascade reads
      // ownerId (V3-11); the add door now reads it the same way.
      if (spec.perspective === "partner") {
        const wanted = partnerKey(spec.partnerLink || spec.partnerName || "");
        const person = (get().journal.people ?? []).find((p) => partnerKey(p.name) === wanted && wanted !== "");
        const bound = person ? settings.cycles.find((tracker) => tracker.ownerId === person.id) : undefined;
        if (bound) return bound.id;
      }
      if (settings.cycles.length >= MAX_TRACKERS) return "";
      const now = stampNow(get().journal);
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
      // The roster's identity is partnerKey (the comparison
      // removePartner already used): adding "lucía" beside "Lucía"
      // used to twin the row (RT2-H4 B5).
      if (!trimmed || journal.partners.some((p) => samePartner(p, trimmed))) return;
      commit({ ...journal, partners: [...journal.partners, trimmed] });
    },
    removePartner: (name) => {
      const journal = get().journal;
      // The default clears by the same comparison the roster uses:
      // removing "lucía" removes the default "Lucía" (RT-V4 B14).
      const settings =
        journal.settings.defaultPartner && samePartner(journal.settings.defaultPartner, name)
          ? { ...journal.settings, defaultPartner: "" }
          : journal.settings;
      commit({
        ...journal,
        settings,
        partners: journal.partners.filter((p) => !samePartner(p, name)),
        deleted: { ...(journal.deleted ?? {}), [PARTNER_OFF + partnerKey(name)]: stampNow(journal) },
      });
    },
    addCustom: (kind, value) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      const journal = get().journal;
      const key = kind === "places" ? "customPlaces" : kind === "positions" ? "customPositions" : "customProblems";
      const builtins = kind === "places" ? PLACES : kind === "positions" ? POSITIONS : PROBLEMS.map((item) => item[0]);
      if (journal.settings[key].includes(trimmed) || (builtins as readonly string[]).includes(trimmed)) return;
      commit({
        ...journal,
        settings: { ...journal.settings, [key]: [...journal.settings[key], trimmed] },
        deleted: { ...(journal.deleted ?? {}), [CUSTOM_ON + customKey(kind, trimmed)]: stampNow(journal) },
      });
    },
    removeCustom: (kind, value) => {
      const journal = get().journal;
      const key = kind === "places" ? "customPlaces" : kind === "positions" ? "customPositions" : "customProblems";
      /* The off stamp is what the merge's union reads (RT2-H1 B2). */
      commit({
        ...journal,
        settings: { ...journal.settings, [key]: journal.settings[key].filter((item) => item !== value) },
        deleted: { ...(journal.deleted ?? {}), [CUSTOM_OFF + customKey(kind, value)]: stampNow(journal) },
      });
    },
    eraseAll: (choice) => {
      const journal = get().journal;
      /* The cuts are stamps like any other (Round 3, RT3-H1 B4): minted
       * from the raw clock, a session recorded on a set-forward clock
       * sat above the cut and the first merge restored it. */
      const now = stampNow(journal);
      const settings = { ...journal.settings };
      if (choice.places) settings.customPlaces = [];
      if (choice.positions) settings.customPositions = [];
      if (choice.problems) settings.customProblems = [];
      if (choice.partners) settings.defaultPartner = "";
      // Encounters can't outlive their sessions: a sessions wipe removes every encounter too. An encounters-only
      // wipe drops names, notes and spans, and regroups the kept sessions right away (one encounter per day and
      // partner, created after the cut), so what you see now is what you see after the next unlock and on sync.
      const dropEncounters = choice.sessions || choice.encounters;
      const sessions = choice.sessions
        ? []
        : journal.sessions.map((session) => (choice.encounters ? { ...session, encounterId: "", updatedAt: now } : session));
      const encounters = choice.sessions ? [] : choice.encounters ? attachOrphans(sessions, [], now) : journal.encounters;
      /* Customs erased here get the same off stamps removeCustom mints
       * (RT2-H1 B2): the ceremony is a removal like any other. */
      const erasedStamps: Record<string, number> = {};
      if (choice.places) for (const v of journal.settings.customPlaces) erasedStamps[CUSTOM_OFF + customKey("places", v)] = stampNow(journal);
      if (choice.positions) for (const v of journal.settings.customPositions) erasedStamps[CUSTOM_OFF + customKey("positions", v)] = stampNow(journal);
      if (choice.problems) for (const v of journal.settings.customProblems) erasedStamps[CUSTOM_OFF + customKey("problems", v)] = stampNow(journal);
      commit({
        ...journal,
        settings,
        partners: choice.partners ? [] : journal.partners,
        sessions,
        encounters,
        ...(Object.keys(erasedStamps).length ? { deleted: { ...(journal.deleted ?? {}), ...erasedStamps } } : {}),
        sessionsClearedAt: choice.sessions ? now : journal.sessionsClearedAt,
        encountersClearedAt: dropEncounters ? now : journal.encountersClearedAt,
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
      download(`vela-${todayStr()}.csv`, csvText(get().journal), "text/csv");
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
            if (typeof partner === "string" && partner && !partners.some((p) => samePartner(p, partner))) partners.push(partner);
          }
        }
        for (const session of added) {
          if (session.partnerName && !partners.some((p) => samePartner(p, session.partnerName))) partners.push(session.partnerName);
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
          inner = (await openWithCandidates<{ journal?: unknown }>(passphrase, env)).data;
        } catch {
          return { ok: false, reason: "bad-pass" };
        }
      }
      const restored = journalFromUnknown(inner?.journal, get().journal.settings.language);
      const current = get().journal;
      const before = new Set(current.sessions.map((s) => s.id));
      const merged = mergeJournals(current, { ...restored, profile: current.profile });
      const droppedCycles = mergeDroppedCycles(current, restored, merged);
      // The restore commits the MERGED journal — settings included. Only the
      // profile is forced from the current journal (prejudice hunt V1 B-4-M:
      // the old settings override silently discarded everything the merge
      // had just rescued from the backup).
      commit({ ...merged, profile: current.profile });
      if (droppedCycles > 0) get().showToast(STR[get().journal.settings.language].cyMergeFull);
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
    showToast: (message, action) => {
      if (toastTimer) clearTimeout(toastTimer);
      set({ toast: message, toastAction: action ?? null });
      toastTimer = setTimeout(() => set({ toast: null, toastAction: null }), action ? 8000 : 3200);
    },
  };
});

/* ---- other Vela windows on this device ----
   Lock in one window locks the others. A passphrase change in one window makes the others' keys
   stale: they lock (without wiping the new parked key), reopen with the new key when this device's
   choice allows it, and fold in any edit they were holding so nothing is lost. */
function reopenAfterStale() {
  const st = useJournal.getState();
  const pending = st.unlocked ? st.journal : null;
  st._lockHere({ drop: false, broadcast: false });
  useJournal.setState({ lockNote: "stale" });
  void st.hydrate({ resume: true }).then(() => {
    const now = useJournal.getState();
    if (!now.unlocked) {
      useJournal.setState({ lockNote: "stale" });
      return;
    }
    /* The fold-in keeps the MERGED settings (Round 3, RT3-H1 B10): the
     * override that used to ride here discarded them wholesale — the
     * held window's anniversary additions, custom removals and tracker
     * work were silently dropped, the very losses this function exists
     * to prevent. Only the profile is taken from the fresh read: it is
     * the identity the new key just proved. */
    if (pending?.profile) now.replaceJournal({ ...mergeJournals(now.journal, pending), profile: now.journal.profile });
  });
}
staleHandler = reopenAfterStale;
if (typeof window !== "undefined") {
  keyChannel()?.addEventListener("message", (event: MessageEvent) => {
    const msg = event.data as KeyMsg;
    const st = useJournal.getState();
    if (!msg || !st.unlocked) return;
    if (msg.t === "lock") st._lockHere({ drop: false, broadcast: false });
    else if (msg.t === "rekey" && msg.vaultId === vaultIdMem && sessionKey && sessionKey.salt !== msg.salt) reopenAfterStale();
  });
}

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
