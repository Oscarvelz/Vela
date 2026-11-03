import { coverDates, partnerKey } from "./encounters";
import type { Encounter, Journal, Session } from "./types";

/**
 * One-time, on-device data migrations. Each runs after unlock, at most once per journal (its id is kept in
 * `journal.migrations`, which a sync merge unions), and is deterministic, so two devices that run it on their
 * own produce the same ids and the same result.
 */
export const ENC_SPLIT = "enc-split-1";

/** Short, stable hash (djb2) so a split encounter's id depends only on the original id + partner key. */
function hash(text: string) {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export function splitEncounterId(originalId: string, key: string) {
  return `${originalId}~${hash(key || "solo")}`;
}

/** Everything a session holds except its encounter link (and the sync stamp). */
function ownFields(session: Session) {
  const { encounterId: _link, updatedAt: _stamp, sessionNumber: _n, ...rest } = session;
  return JSON.stringify(rest);
}

/** null when `after` holds exactly the sessions of `before` with only their encounter links (and stamps) changed. */
export function linksOnly(before: Session[], after: Session[]): string | null {
  if (before.length !== after.length) return "count";
  const own = new Map(before.map((s) => [s.id, ownFields(s)]));
  if (own.size !== after.length) return "count";
  return after.every((s) => own.get(s.id) === ownFields(s)) ? null : "fields";
}

export type SplitReport = { split: number; created: number; moved: number; aborted?: string };

/**
 * Splits encounters whose sessions belong to different partners (solo is its own group; names compared like
 * `partnerKey`). Only session→encounter links change. The original encounter keeps the group matching its own
 * partner (else the largest); each other group gets a new encounter with a deterministic id that copies the
 * encounter-level fields (comment, problems; the title too unless it names the original partner), with its date
 * range taken from its own sessions. Changed items are stamped `now` so a sync merge keeps the split.
 * Aborts (returns the journal untouched) if the session count or any session's own fields would change.
 */
export function splitMixedEncounters(journal: Journal, now: number): { journal: Journal; report: SplitReport } {
  const report: SplitReport = { split: 0, created: 0, moved: 0 };
  const byEncounter = new Map<string, Session[]>();
  for (const session of journal.sessions) {
    if (!session.encounterId) continue;
    const list = byEncounter.get(session.encounterId) ?? [];
    list.push(session);
    byEncounter.set(session.encounterId, list);
  }
  const relink = new Map<string, string>(); // session id → new encounter id
  const encounters: Encounter[] = [];
  const existing = new Set(journal.encounters.map((e) => e.id));
  const added: Encounter[] = [];
  for (const encounter of journal.encounters) {
    const members = byEncounter.get(encounter.id) ?? [];
    const groups = new Map<string, Session[]>();
    for (const session of members) {
      const key = partnerKey(session.partnerName);
      const list = groups.get(key) ?? [];
      list.push(session);
      groups.set(key, list);
    }
    if (groups.size < 2) {
      encounters.push(encounter);
      continue;
    }
    report.split += 1;
    const ordered = [...groups.entries()].map(([key, list]) => ({
      key,
      list: list.slice().sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)),
    }));
    // Largest group first; ties by earliest session, then key (deterministic on every device).
    ordered.sort((a, b) => b.list.length - a.list.length || a.list[0].createdAt - b.list[0].createdAt || a.key.localeCompare(b.key));
    const ownKey = partnerKey(encounter.partnerName);
    const keeper = ordered.find((g) => g.key === ownKey) ?? ordered[0];
    const movedDates = new Set(ordered.filter((g) => g !== keeper).flatMap((g) => g.list.map((s) => s.date)));
    // The original keeps its own sessions' days, plus its own start/end unless only a moved session put them there.
    const keepDates = keeper.list.map((s) => s.date);
    if (!movedDates.has(encounter.startDate)) keepDates.push(encounter.startDate);
    if (!movedDates.has(encounter.endDate)) keepDates.push(encounter.endDate);
    const keepSpan = coverDates(keepDates);
    encounters.push({
      ...encounter,
      partnerName: keeper.key === ownKey ? encounter.partnerName : keeper.list[0].partnerName,
      startDate: keepSpan.startDate,
      endDate: keepSpan.endDate,
      updatedAt: now,
    });
    const named = encounter.partnerName.trim().toLocaleLowerCase();
    for (const group of ordered) {
      if (group === keeper) continue;
      const id = splitEncounterId(encounter.id, group.key);
      for (const session of group.list) relink.set(session.id, id);
      report.moved += group.list.length;
      if (existing.has(id) || added.some((e) => e.id === id)) continue;
      const span = coverDates(group.list.map((s) => s.date));
      const title = named && encounter.title.toLocaleLowerCase().includes(named) ? "" : encounter.title;
      added.push({
        id,
        createdAt: encounter.createdAt,
        title,
        startDate: span.startDate,
        endDate: span.endDate,
        partnerName: group.list[0].partnerName,
        comment: encounter.comment,
        problems: encounter.problems.slice(),
        updatedAt: now,
      });
      report.created += 1;
    }
  }
  if (report.split === 0) return { journal, report };
  const sessions = journal.sessions.map((session) => {
    const id = relink.get(session.id);
    return id ? { ...session, encounterId: id, updatedAt: now } : session;
  });
  // Safety: same sessions, same own fields; only links moved. Otherwise keep the data untouched.
  const allHomed = [...relink.values()].every((id) => added.some((e) => e.id === id) || existing.has(id));
  const problem = linksOnly(journal.sessions, sessions) ?? (allHomed ? null : "home");
  if (problem) return { journal, report: { split: 0, created: 0, moved: 0, aborted: problem } };
  return { journal: { ...journal, sessions, encounters: [...encounters, ...added] }, report };
}

/** Drops encounters that hold no session (left by older builds' deletes and wipes), with tombstones for sync. */
export function pruneEmptyEncounters(journal: Journal, now: number): { journal: Journal; removed: number } {
  const used = new Set(journal.sessions.map((s) => s.encounterId).filter(Boolean));
  const empty = journal.encounters.filter((e) => !used.has(e.id));
  if (empty.length === 0) return { journal, removed: 0 };
  const deleted = { ...(journal.deleted ?? {}) };
  for (const e of empty) deleted[e.id] = Math.max(deleted[e.id] ?? 0, now);
  return { journal: { ...journal, encounters: journal.encounters.filter((e) => used.has(e.id)), deleted }, removed: empty.length };
}

/** Runs every pending migration plus the empty-encounter tidy. `changed` = the caller should persist. */
export function runMigrations(journal: Journal, now = Date.now()): { journal: Journal; changed: boolean; split?: SplitReport } {
  let next = journal;
  let changed = false;
  let split: SplitReport | undefined;
  const done = new Set(journal.migrations ?? []);
  if (!done.has(ENC_SPLIT)) {
    const result = splitMixedEncounters(next, now);
    split = result.report;
    if (!result.report.aborted) {
      next = { ...result.journal, migrations: [...done, ENC_SPLIT] };
      changed = true;
    }
  }
  const tidy = pruneEmptyEncounters(next, now);
  if (tidy.removed > 0) {
    next = tidy.journal;
    changed = true;
  }
  return { journal: next, changed, split };
}
