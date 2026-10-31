import {
  cleanCycle,
  cycleMarks,
  defaultCycle,
  sessionsByPhase,
  type CyclePhase,
  type CycleSettings,
  type DayLog,
} from "./cycle";

/**
 * Several cycle trackers: the user's own cycle and/or the cycles of partners they follow, each with its
 * own history and settings. Pure functions only; the store wraps them.
 *
 * Storage (inside the encrypted journal settings):
 *   settings.cycles        CycleTracker[]  (the source of truth)
 *   settings.cycleSelected tracker id shown on the card, header and calendar (remembered)
 *   settings.cycle         legacy mirror of the first tracker, so older builds and old code paths still read a
 *                          valid single cycle.
 * A journal without `cycles` (every vault before this change) migrates its single `cycle` into tracker
 * "c1". The id is fixed so two devices that migrate the same journal on their own produce the same tracker
 * and merge into one instead of two.
 */

export type CycleTracker = CycleSettings & {
  id: string;
  /** Saved partner (journal.partners entry) this tracker follows; "" when only a typed name is known. */
  partnerLink: string;
  /** Last change of anything in this tracker (ms). 0 = migrated and never touched since. */
  updatedAt: number;
  /** Last change of its settings (perspective, name, link, lengths, enabled). */
  metaAt: number;
  /**
   * Last change per history entry, so two devices merge entry by entry and a removal on one device is not
   * revived by the other: "s:<start>" period starts, "e:<start>" period ends, "d:<date>" day logs.
   */
  stamps: Record<string, number>;
};

export const FIRST_TRACKER_ID = "c1";
export const MAX_TRACKERS = 8;
const META_KEYS = ["enabled", "perspective", "partnerName", "partnerLink", "periodDays", "cycleDays", "lutealDays", "fertileDays"] as const;

export function newTrackerId() {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function defaultTracker(id = FIRST_TRACKER_ID): CycleTracker {
  return { ...defaultCycle(), id, partnerLink: "", updatedAt: 0, metaAt: 0, stamps: {} };
}

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/** Normalises one tracker (any input). Idempotent. */
export function cleanTracker(raw: unknown, fallbackId = FIRST_TRACKER_ID): CycleTracker {
  const value = (raw && typeof raw === "object" ? raw : {}) as Partial<CycleTracker>;
  const cycle = cleanCycle(value);
  const id = typeof value.id === "string" && /^[\w-]{1,40}$/.test(value.id) ? value.id : fallbackId;
  const stamps: Record<string, number> = {};
  if (value.stamps && typeof value.stamps === "object") {
    // Sorted so equal trackers serialise identically (merges compare by content).
    for (const [key, at] of Object.entries(value.stamps as Record<string, unknown>).sort(([x], [y]) => (x < y ? -1 : 1))) {
      if (/^[sed]:\d{4}-\d{2}-\d{2}$/.test(key) && num(at)) stamps[key] = at as number;
    }
  }
  const partnerLink = cycle.perspective === "partner" && typeof value.partnerLink === "string" ? value.partnerLink.trim().slice(0, 60) : "";
  // Day logs and ends in date order, so two devices holding the same history serialise it identically.
  const sorted = <T,>(map: Record<string, T>) => Object.fromEntries(Object.entries(map).sort(([x], [y]) => (x < y ? -1 : 1)));
  return { ...cycle, ends: sorted(cycle.ends), days: sorted(cycle.days), id, partnerLink, updatedAt: num(value.updatedAt), metaAt: num(value.metaAt), stamps };
}

/** Plain single-cycle view of a tracker (what the legacy `settings.cycle` field holds). */
export function asLegacyCycle(tracker: CycleSettings): CycleSettings {
  return cleanCycle(tracker);
}

/**
 * The trackers of a settings object, old or new. A missing or empty `cycles` list migrates the single
 * legacy `cycle` losslessly into tracker "c1". Always returns at least one tracker. Idempotent.
 */
export function cleanTrackers(rawCycles: unknown, rawLegacy: unknown): CycleTracker[] {
  const list = Array.isArray(rawCycles) ? rawCycles.filter((item) => item && typeof item === "object") : [];
  if (!list.length) return [{ ...cleanTracker(rawLegacy, FIRST_TRACKER_ID), id: FIRST_TRACKER_ID }];
  const seen = new Set<string>();
  const out: CycleTracker[] = [];
  list.forEach((item, index) => {
    let tracker = cleanTracker(item, index === 0 ? FIRST_TRACKER_ID : `c${index + 1}`);
    while (seen.has(tracker.id)) tracker = { ...tracker, id: `${tracker.id}x` };
    seen.add(tracker.id);
    out.push(tracker);
  });
  return out.slice(0, MAX_TRACKERS);
}

/** Valid selection: the remembered id if it still exists, else the first visible tracker, else the first. */
export function selectedId(trackers: CycleTracker[], wanted: unknown): string {
  const live = trackers.filter((tracker) => tracker.enabled);
  if (typeof wanted === "string" && live.some((tracker) => tracker.id === wanted)) return wanted;
  return (live[0] ?? trackers[0])?.id ?? FIRST_TRACKER_ID;
}

/** The tracker the card, header pill and calendar show. Paused trackers are skipped while others are on. */
export function activeTracker(trackers: CycleTracker[], wanted: unknown): CycleTracker {
  const id = selectedId(trackers, wanted);
  return trackers.find((tracker) => tracker.id === id) ?? trackers[0] ?? defaultTracker();
}

/** Trackers that are switched on (paused ones keep their history but are hidden everywhere but settings). */
export function visibleTrackers(trackers: CycleTracker[]) {
  return trackers.filter((tracker) => tracker.enabled);
}

/** Name shown for a partner tracker ("" for the user's own). */
export function trackerName(tracker: CycleSettings & { partnerLink?: string }) {
  if (tracker.perspective !== "partner") return "";
  return (tracker.partnerLink || tracker.partnerName || "").trim();
}

const norm = (value: string) => value.trim().toLocaleLowerCase();

/** Whether a partner tracker follows this partner (by saved-partner link, else by its typed name). */
export function followsPartner(tracker: CycleTracker, partnerName: string) {
  if (tracker.perspective !== "partner" || !partnerName.trim()) return false;
  const name = trackerName(tracker);
  return Boolean(name) && norm(name) === norm(partnerName);
}

/**
 * Which tracker gives a session its phase. Only switched-on trackers count.
 *  1. A partner tracker that follows the session's partner.
 *  2. Otherwise the user's own (self) tracker: their own cycle applies to any session, whoever it was with.
 *  3. Otherwise, when exactly one tracker is on, that one (the single-tracker behaviour before trackers
 *     existed: one cycle colours every session).
 *  4. Otherwise none: the session has no phase (2+ partner trackers, none of them this partner's).
 */
export function trackerForPartner(trackers: CycleTracker[], partnerName: string): CycleTracker | null {
  const live = visibleTrackers(trackers);
  if (!live.length) return null;
  const own = live.find((tracker) => followsPartner(tracker, partnerName));
  if (own) return own;
  const self = live.find((tracker) => tracker.perspective === "self");
  if (self) return self;
  return live.length === 1 ? live[0] : null;
}

type Dated = { date: string; partnerName?: string };

/** Sessions by phase, each session judged against its own tracker (see trackerForPartner). */
export function sessionsByPhaseFor(trackers: CycleTracker[], sessions: Dated[], today: string) {
  const counts: Record<CyclePhase, number> = { period: 0, fertile: 0, ovulation: 0, quiet: 0 };
  const groups = new Map<CycleTracker, string[]>();
  for (const session of sessions) {
    const tracker = trackerForPartner(trackers, session.partnerName ?? "");
    if (!tracker) continue;
    const list = groups.get(tracker) ?? [];
    list.push(session.date);
    groups.set(tracker, list);
  }
  for (const [tracker, dates] of groups) {
    const part = sessionsByPhase(tracker, dates, today);
    for (const phase of Object.keys(counts) as CyclePhase[]) counts[phase] += part[phase];
  }
  return counts;
}

/** Phase of one session (null when no tracker applies or the date is before that tracker's first start). */
export function sessionPhase(trackers: CycleTracker[], session: Dated, today: string): CyclePhase | null {
  const tracker = trackerForPartner(trackers, session.partnerName ?? "");
  if (!tracker || !tracker.starts.length) return null;
  const first = [...tracker.starts].sort()[0];
  if (session.date < first || session.date > today) return null;
  const mark = cycleMarks(tracker, session.date, session.date, today)[session.date];
  if (!mark) return "quiet";
  if (mark.phase === "period" && mark.predicted) return "quiet";
  return mark.phase;
}

/* ── Stamping: record what changed, entry by entry ─────────────────────── */

function entries(tracker: CycleSettings) {
  const map = new Map<string, string>();
  for (const start of tracker.starts) map.set(`s:${start}`, "1");
  for (const [start, end] of Object.entries(tracker.ends)) map.set(`e:${start}`, end);
  for (const [date, log] of Object.entries(tracker.days)) map.set(`d:${date}`, JSON.stringify(log));
  return map;
}

/** Stamps every history entry and setting that differs between `prev` and `next` with `now`. */
export function restamp(prev: CycleTracker, next: CycleTracker, now: number): CycleTracker {
  const before = entries(prev);
  const after = entries(next);
  const stamps = { ...prev.stamps, ...next.stamps };
  let changed = false;
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    if (before.get(key) !== after.get(key)) {
      stamps[key] = now;
      changed = true;
    }
  }
  const metaChanged = META_KEYS.some((key) => prev[key] !== next[key]);
  if (!changed && !metaChanged) return { ...next, stamps };
  return { ...next, stamps, updatedAt: now, metaAt: metaChanged ? now : prev.metaAt };
}

/* ── Merging two devices ───────────────────────────────────────────────── */

/**
 * Merges two copies of one tracker without losing either device's history.
 * Per entry: the copy with the newer stamp wins (that includes a removal); entries nobody stamped (legacy
 * data) are united. Settings come from the copy whose settings changed last.
 */
export function mergeTracker(a: CycleTracker, b: CycleTracker): CycleTracker {
  const ea = entries(a);
  const eb = entries(b);
  const keys = [...new Set([...ea.keys(), ...eb.keys(), ...Object.keys(a.stamps), ...Object.keys(b.stamps)])].sort();
  const newerSide = b.updatedAt > a.updatedAt ? b : a;
  const starts: string[] = [];
  const ends: Record<string, string> = {};
  const days: Record<string, DayLog> = {};
  const stamps: Record<string, number> = {};
  for (const key of keys) {
    const sa = a.stamps[key] ?? 0;
    const sb = b.stamps[key] ?? 0;
    if (sa || sb) stamps[key] = Math.max(sa, sb);
    let value: string | undefined;
    if (sa !== sb) value = sa > sb ? ea.get(key) : eb.get(key);
    else value = (newerSide === a ? ea.get(key) : eb.get(key)) ?? ea.get(key) ?? eb.get(key);
    if (value === undefined) continue;
    const date = key.slice(2);
    if (key.startsWith("s:")) starts.push(date);
    else if (key.startsWith("e:")) ends[date] = value;
    else {
      try {
        days[date] = JSON.parse(value) as DayLog;
      } catch {
        /* skip */
      }
    }
  }
  const meta = b.metaAt > a.metaAt ? b : b.metaAt < a.metaAt ? a : newerSide;
  const merged = cleanTracker({ ...meta, id: a.id, starts, ends, days, stamps });
  return { ...merged, updatedAt: Math.max(a.updatedAt, b.updatedAt), metaAt: Math.max(a.metaAt, b.metaAt) };
}

/**
 * Merges two devices' tracker lists by id. A tracker removed on either device (deletion marker newer than
 * its last change) stays removed. Order follows `newer`, then trackers only `older` has.
 */
export function mergeTrackerLists(newer: CycleTracker[], older: CycleTracker[], deleted: Record<string, number> = {}): CycleTracker[] {
  const byId = new Map<string, CycleTracker>();
  for (const tracker of [...newer, ...older]) {
    const prev = byId.get(tracker.id);
    byId.set(tracker.id, prev ? mergeTracker(prev, tracker) : tracker);
  }
  const order = [...new Set([...newer, ...older].map((tracker) => tracker.id))];
  const out = order
    .map((id) => byId.get(id)!)
    .filter((tracker) => !(deleted[`cycle:${tracker.id}`] && deleted[`cycle:${tracker.id}`] >= tracker.updatedAt));
  if (out.length) return out.slice(0, MAX_TRACKERS);
  const id = deleted[`cycle:${FIRST_TRACKER_ID}`] ? newTrackerId() : FIRST_TRACKER_ID;
  return [defaultTracker(id)];
}

/** Deletion-marker key used in journal.deleted for a removed tracker. */
export function trackerTombstone(id: string) {
  return `cycle:${id}`;
}
