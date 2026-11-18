import {
  cleanCycle,
  cycleMarks,
  defaultCycle,
  sessionsByPhase,
  type CyclePhase,
  type CycleReason,
  type CycleSettings,
  type DayLog,
} from "./cycle";
import { isRealDate } from "./dates";

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
  /** The Person (2.2) this cycle belongs to, bound at couple-mode turn-on.
   *  Absent = legacy name resolution, exactly as before. */
  ownerId?: string;
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
const META_KEYS = ["enabled", "perspective", "partnerName", "partnerLink", "ownerId", "periodDays", "cycleDays", "lutealDays", "fertileDays"] as const;

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
      if (/^[sedr]:/.test(key) && isRealDate(key.slice(2)) && num(at)) stamps[key] = at as number;
      /* The mute's stamp rides its own key (Round 3, RT3-H3-01): the
       * date-shaped whitelist above dropped "q:mute" at every load, so
       * any post-reload merge met two unstamped copies and the legacy
       * one-way-door branch revived a mute the user had lifted. */
      else if (key === "q:mute" && num(at)) stamps[key] = at as number;
    }
  }
  const partnerLink = cycle.perspective === "partner" && typeof value.partnerLink === "string" ? value.partnerLink.trim().slice(0, 60) : "";
  // Day logs and ends in date order, so two devices holding the same history serialise it identically.
  const sorted = <T,>(map: Record<string, T>) => Object.fromEntries(Object.entries(map).sort(([x], [y]) => (x < y ? -1 : 1)));
  const ownerId = typeof value.ownerId === "string" && value.ownerId ? value.ownerId.slice(0, 40) : undefined;
  return {
    ...cycle,
    ends: sorted(cycle.ends),
    days: sorted(cycle.days),
    id,
    partnerLink,
    // Only present once bound (2.2), so unbound trackers serialise byte-identically to before.
    ...(ownerId ? { ownerId } : {}),
    updatedAt: num(value.updatedAt),
    metaAt: num(value.metaAt),
    stamps,
  };
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
    const tracker = cleanTracker(item, index === 0 ? FIRST_TRACKER_ID : `c${index + 1}`);
    // Duplicates are renamed INSIDE the validity band: the old "x"
    // suffix pushed a 40-char id to 41, the next gate pass rejected
    // it and renamed by index — ids and order shifted between passes
    // and the cleaner was not idempotent (RT2-H6-8). Truncating the
    // base to fit the suffix keeps every pass stable.
    let id = tracker.id;
    for (let n = 1; seen.has(id); n += 1) {
      const suffix = n === 1 ? "x" : `x${n}`;
      id = tracker.id.slice(0, 40 - suffix.length) + suffix;
    }
    seen.add(id);
    out.push(id === tracker.id ? tracker : { ...tracker, id });
  });
  // No slice here: the gate carries what it is given. The cap is a product
  // rule enforced where data is written (the store refuses a 9th tracker)
  // and where two devices merge (mergeJournals resolves the overflow with
  // tombstones and a notice) — never by silent amputation at load, which
  // cost real histories their trackers (prejudice hunt V3-10).
  /* Gate-born twins share their testimony HERE (Round 3, RT3-H3-03):
   * the merge shares it, but an import or a backup restore never passes
   * through the merge — without this, a dismissed question returned at
   * every restore until the next sync. Sharing is idempotent, so the
   * gate's own stability is untouched. */
  return shareReasonsAcrossTwins(out);
}

/** Valid selection: the remembered id if it still exists, else the first visible tracker, else the first. */
export function selectedId(trackers: CycleTracker[], wanted: unknown): string {
  const live = trackers.filter((tracker) => tracker.enabled);
  if (typeof wanted === "string" && live.some((tracker) => tracker.id === wanted)) return wanted;
  return (live[0] ?? trackers[0])?.id ?? FIRST_TRACKER_ID;
}

/** The tracker the card, header pill and calendar show. Paused trackers are skipped while others are on. */
/* The empty journal's active tracker is ONE stored shape (RT3-H5
 * L4): minting a fresh default per read made selectActiveCycle a new
 * object on every call, which zustand's identity check reads as a
 * change — the wiped journal (cycles: []) was the one state that hit
 * it on every render, rescued only by the wipe's synchronous lock. */
const EMPTY_ACTIVE = defaultTracker();

export function activeTracker(trackers: CycleTracker[], wanted: unknown): CycleTracker {
  const id = selectedId(trackers, wanted);
  return trackers.find((tracker) => tracker.id === id) ?? trackers[0] ?? EMPTY_ACTIVE;
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
 *  3. Otherwise, when exactly one tracker is on and it is a partner's cycle with no name or link, that one
 *     for any session with a partner (it can't tell whose it is). Never for a solo session, and never when
 *     the only tracker is named for a different partner (audit M9, Nov 2 2026).
 *  4. Otherwise none: the session has no phase.
 */
export function trackerForPartner(trackers: CycleTracker[], partnerName: string): CycleTracker | null {
  const live = visibleTrackers(trackers);
  if (!live.length) return null;
  const own = live.find((tracker) => followsPartner(tracker, partnerName));
  if (own) return own;
  const self = live.find((tracker) => tracker.perspective === "self");
  if (self) return self;
  const sole = live.length === 1 ? live[0] : null;
  if (sole && partnerName.trim() && sole.perspective === "partner" && !trackerName(sole)) return sole;
  return null;
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
  for (const [start, reason] of Object.entries(tracker.reasons ?? {})) map.set(`r:${start}`, JSON.stringify(reason));
  /* "Don't ask again" is an entry like any other (Round 2, RT2-H3-01):
   * outside entries() and META_KEYS it minted no stamp at all, so a
   * sync merge revoked it in both orders while reason answers — real
   * entries — survived. */
  map.set("q:mute", tracker.muteReasonAsks ? "1" : "0");
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
  const reasons: Record<string, CycleReason> = {};
  const stamps: Record<string, number> = {};
  let muteAsks = false;
  for (const key of keys) {
    const sa = a.stamps[key] ?? 0;
    const sb = b.stamps[key] ?? 0;
    if (sa || sb) stamps[key] = Math.max(sa, sb);
    let value: string | undefined;
    if (sa !== sb) value = sa > sb ? ea.get(key) : eb.get(key);
    else if (key.startsWith("q:") && sa === 0 && sb === 0) {
      // Never stamped on either side (legacy): a mute is a one-way
      // door — if either copy carries it, it stands. The branch is
      // scoped to UNSTAMPED copies (Round 3, RT3-H3-01): it used to
      // fire on any tie, so two stamped copies that happened to share
      // a stamp also fell into the one-way door and a deliberate
      // un-mute lost. Stamped ties resolve by the newer side below.
      value = ea.get(key) === "1" || eb.get(key) === "1" ? "1" : "0";
    } else if (key.startsWith("r:")) {
      // A reason carries its own testimony stamp (`at`). When neither side
      // stamped the entry (legacy data from before r: stamps survived the
      // gate), the newer TESTIMONY wins — never whichever tracker happened
      // to be touched last for an unrelated edit (RT-V3 B4's residue).
      const va = ea.get(key);
      const vb = eb.get(key);
      if (va && vb) {
        try {
          const ra = (JSON.parse(va) as CycleReason).at ?? 0;
          const rb = (JSON.parse(vb) as CycleReason).at ?? 0;
          value = ra !== rb ? (ra > rb ? va : vb) : newerSide === a ? va : vb;
        } catch {
          value = newerSide === a ? va : vb;
        }
      } else value = va ?? vb;
    } else value = (newerSide === a ? ea.get(key) : eb.get(key)) ?? ea.get(key) ?? eb.get(key);
    if (value === undefined) continue;
    const date = key.slice(2);
    if (key.startsWith("q:")) muteAsks = value === "1";
    else if (key.startsWith("s:")) starts.push(date);
    else if (key.startsWith("e:")) ends[date] = value;
    else if (key.startsWith("r:")) {
      try {
        reasons[date] = JSON.parse(value) as CycleReason;
      } catch {
        /* skip */
      }
    } else {
      try {
        days[date] = JSON.parse(value) as DayLog;
      } catch {
        /* skip */
      }
    }
  }
  const meta = b.metaAt > a.metaAt ? b : b.metaAt < a.metaAt ? a : newerSide;
  const merged = cleanTracker({ ...meta, id: a.id, starts, ends, days, reasons, stamps, muteReasonAsks: muteAsks });
  return { ...merged, updatedAt: Math.max(a.updatedAt, b.updatedAt), metaAt: Math.max(a.metaAt, b.metaAt) };
}

/**
 * Merges two devices' tracker lists by id. A tracker removed on either device (deletion marker newer than
 * its last change) stays removed. Order follows `newer`, then trackers only `older` has.
 */
export function mergeTrackerLists(newer: CycleTracker[], older: CycleTracker[], deleted: Record<string, number> = {}, wipeStamp = 0): CycleTracker[] {
  /* Under a wipe, a tracker the wiping device never saw has no tombstone
   * (Round 3, RT3-H1 B1): its birth witness — the EARLIEST stamp it
   * carries — decides. A tracker born before the wipe keeps at least
   * one pre-wipe stamp however often it was edited afterwards; a
   * tracker born after the wipe carries nothing but post-wipe stamps.
   * A tracker carrying no stamps at all predates the stamp economy and
   * is the wipe's. The emptied result still materializes the default
   * tracker below, as always. */
  const bornAfterWipe = (tracker: CycleTracker) => {
    const stamps = [tracker.updatedAt, tracker.metaAt, ...Object.values(tracker.stamps)];
    return stamps.length > 0 && Math.min(...stamps) > wipeStamp;
  };
  const pool = wipeStamp > 0 ? [...newer, ...older].filter(bornAfterWipe) : [...newer, ...older];
  const byId = new Map<string, CycleTracker>();
  for (const tracker of pool) {
    const prev = byId.get(tracker.id);
    byId.set(tracker.id, prev ? mergeTracker(prev, tracker) : tracker);
  }
  const order = [...new Set(pool.map((tracker) => tracker.id))];
  const out = order
    .map((id) => byId.get(id)!)
    .filter((tracker) => !(deleted[`cycle:${tracker.id}`] && deleted[`cycle:${tracker.id}`] >= tracker.updatedAt));
  if (out.length) return shareReasonsAcrossTwins(out).slice(0, MAX_TRACKERS);
  const id = deleted[`cycle:${FIRST_TRACKER_ID}`] ? newTrackerId() : FIRST_TRACKER_ID;
  return [defaultTracker(id)];
}

/* Two trackers for the same person, born on two devices before they ever
 * synced, survive the merge as separate data — which tracker she meant
 * is unknowable (Round 1, L-1). But a reason is testimony about a PERSON
 * and a cycle, not about a tracker (Round 2, RT2-H3-07): a dismissal
 * recorded on one twin left the other free to re-ask the very question
 * she had dismissed — same person, same start, same cycle. So for
 * starts the twins share, the winning testimony — the later `at`, a
 * dismissal standing on a tie — is written to every twin, with its
 * stamp, so the question is answered once, for the person. Reasons for
 * starts a twin does not carry stay home. */
/* Every key under which a tracker names its person. A tracker carries
 * its name AND, once bound, its ownerId — both name the same person, so
 * grouping reads both (Round 3, RT3-H3-03): the old single-key rule
 * filed a bound tracker under its id alone, and testimony recorded on
 * it after the binding never reached the name twin it was born with. */
function personGroupKeys(tracker: CycleTracker): string[] {
  if (tracker.perspective === "self") return ["self"];
  const keys: string[] = [];
  if (tracker.ownerId) keys.push(`id:${tracker.ownerId}`);
  const name = (tracker.partnerLink || tracker.partnerName || "").trim().toLocaleLowerCase();
  if (name) keys.push(`name:${name}`);
  return keys;
}

export function shareReasonsAcrossTwins(trackers: CycleTracker[]): CycleTracker[] {
  /* Twins are the connected components of the key graph: two trackers
   * are one person's when they share ANY key, directly or through a
   * third that shares one with each. */
  const parent = trackers.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const byKey = new Map<string, number>();
  trackers.forEach((tracker, i) => {
    for (const key of personGroupKeys(tracker)) {
      const first = byKey.get(key);
      if (first === undefined) byKey.set(key, i);
      else parent[find(i)] = find(first);
    }
  });
  const groups = new Map<number, CycleTracker[]>();
  trackers.forEach((tracker, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), tracker]);
  });
  const changed = new Map<string, CycleTracker>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const shared = group[0].starts.filter((start) => group.every((tracker) => tracker.starts.includes(start)));
    for (const start of shared) {
      const candidates = group
        .map((tracker) => tracker.reasons?.[start])
        .filter((reason): reason is CycleReason => !!reason);
      if (!candidates.length) continue;
      const winner = candidates.reduce((best, reason) => {
        if (reason.at !== best.at) return reason.at > best.at ? reason : best;
        return reason.id === "dismissed" ? reason : best;
      });
      const stamp = Math.max(...group.map((tracker) => tracker.stamps[`r:${start}`] ?? 0));
      for (const tracker of group) {
        if (tracker.reasons?.[start]?.id === winner.id && tracker.reasons?.[start]?.at === winner.at) continue;
        const current = changed.get(tracker.id) ?? tracker;
        changed.set(tracker.id, {
          ...current,
          reasons: { ...(current.reasons ?? {}), [start]: winner },
          ...(stamp ? { stamps: { ...current.stamps, [`r:${start}`]: Math.max(stamp, current.stamps[`r:${start}`] ?? 0) } } : {}),
        });
      }
    }
  }
  if (!changed.size) return trackers;
  return trackers.map((tracker) => changed.get(tracker.id) ?? tracker);
}

/** Deletion-marker key used in journal.deleted for a removed tracker. */
export function trackerTombstone(id: string) {
  return `cycle:${id}`;
}
