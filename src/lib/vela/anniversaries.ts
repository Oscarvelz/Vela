/* Anniversaries, birthdays and the Archive (2.1.24) — the dates a user chose
   never to forget, and the people at rest. One engine serves both lists in
   History and, later, the Advisor's voice: every date recurs yearly, carries
   a counter in the biggest honest unit, and sorts by what comes next.
   The Archive law lives here too: an archived person is honored and kept,
   and the user alone decides where their traces still appear. */
import type { CycleTracker } from "./cycle-trackers";
import { finiteStamp, isRealDate, iso, parseDate, todayStr } from "./dates";
import type { Anniversary, AnniversaryKind, ArchivedPerson, ChildEntry, ChildRef, Encounter, Journal, Session, Settings } from "./types";

const KINDS: AnniversaryKind[] = ["met", "married", "first", "custom"];
const REFS: ChildRef[] = ["son", "daughter", "child"];
const MD = /^(\d{2})-(\d{2})$/;
const DS = /^\d{4}-\d{2}-\d{2}$/;

function cleanMonthDay(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const m = MD.exec(raw);
  if (!m) return "";
  const mm = Number(m[1]);
  const dd = Number(m[2]);
  // The day must exist in its month (Feb 29 lives — the date recurs yearly
  // and leap years carry it; Feb 30 and Apr 31 never happen).
  const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mm - 1] ?? 0;
  if (mm < 1 || mm > 12 || dd < 1 || dd > daysInMonth) return "";
  return raw;
}

export function cleanAnniversaries(raw: unknown): Anniversary[] {
  if (!Array.isArray(raw)) return [];
  const out: Anniversary[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const a = item as Partial<Anniversary>;
    const monthDay = cleanMonthDay(a.monthDay);
    if (!monthDay || typeof a.label !== "string" || !a.label.trim() || typeof a.id !== "string" || !a.id) continue;
    out.push({
      id: a.id,
      label: a.label.trim(),
      monthDay,
      year: typeof a.year === "number" && a.year > 1900 && a.year < 2200 ? Math.floor(a.year) : undefined,
      personName: typeof a.personName === "string" && a.personName.trim() ? a.personName.trim() : undefined,
      kind: KINDS.includes(a.kind as AnniversaryKind) ? (a.kind as AnniversaryKind) : "custom",
      milestone: a.milestone === true,
      note: typeof a.note === "string" && a.note.trim() ? a.note.trim() : undefined,
      createdAt: finiteStamp(a.createdAt) ?? 0,
      ...(finiteStamp(a.updatedAt) !== undefined ? { updatedAt: a.updatedAt } : {}),
    });
  }
  return out;
}

export function cleanChildren(raw: unknown): ChildEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: ChildEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const c = item as Partial<ChildEntry>;
    if (typeof c.id !== "string" || !c.id || typeof c.name !== "string" || !c.name.trim()) continue;
    // Shape is not enough: "2021-13-40" matches the pattern and was
    // stored, then served back as an upcoming birthday (RT2-H6-5).
    // A child's birthdate must be a date that exists.
    if (typeof c.birthdate !== "string" || !DS.test(c.birthdate) || !isRealDate(c.birthdate)) continue;
    out.push({
      id: c.id,
      name: c.name.trim(),
      birthdate: c.birthdate,
      refAs: REFS.includes(c.refAs as ChildRef) ? (c.refAs as ChildRef) : "child",
      createdAt: finiteStamp(c.createdAt) ?? 0,
      ...(finiteStamp(c.updatedAt) !== undefined ? { updatedAt: c.updatedAt } : {}),
    });
  }
  return out;
}

export function cleanArchived(raw: unknown): ArchivedPerson[] {
  if (!Array.isArray(raw)) return [];
  const out: ArchivedPerson[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const p = item as Partial<ArchivedPerson>;
    if (typeof p.name !== "string" || !p.name.trim()) continue;
    const record: ArchivedPerson = {
      name: p.name.trim(),
      archivedAt: finiteStamp(p.archivedAt) ?? 0,
      showInHistory: p.showInHistory === true,
      countInStats: p.countInStats === true,
      resurface: p.resurface === true,
    };
    /* One row per person, by the archive's own identity (RT3-H4 B2):
     * the merge has keyed this list since Round 2, but the gate let
     * foreign twins ("Lucía" all-off, "lucía" all-on) seat two rows,
     * and the surfaces took whichever the blob's order put first.
     * The later archive stamp wins the row, as at the merge. */
    const key = record.name.toLowerCase();
    const at = out.findIndex((q) => q.name.toLowerCase() === key);
    if (at >= 0) {
      if (record.archivedAt >= out[at].archivedAt) out[at] = record;
      continue;
    }
    out.push(record);
  }
  return out;
}

/* ---------- the recurring-day engine ---------- */

function daysInMonth(year: number, month1: number) {
  return new Date(year, month1, 0).getDate();
}

/** The recurring day in a given year; Feb 29 keeps Feb 28 in common years. */
export function occurrenceInYear(monthDay: string, year: number): string {
  const [, mm, dd] = MD.exec(monthDay) ?? ["", "1", "1"];
  const month = Number(mm);
  return iso(year, month - 1, Math.min(Number(dd), daysInMonth(year, month)));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86400000);
}

/** The next time the day comes, today included. */
export function nextOccurrence(monthDay: string, today: string): { date: string; year: number } {
  const y = parseDate(today).getFullYear();
  const thisYear = occurrenceInYear(monthDay, y);
  return thisYear >= today ? { date: thisYear, year: y } : { date: occurrenceInYear(monthDay, y + 1), year: y + 1 };
}

export type Elapsed = { n: number; unit: "days" | "months" | "years" };

/** Time since the start date, in the biggest honest unit. Null before it begins. */
export function counterSince(year: number, monthDay: string, today: string): Elapsed | null {
  const start = occurrenceInYear(monthDay, year);
  if (today < start) return null;
  const t = parseDate(today);
  const ty = t.getFullYear();
  let years = ty - year;
  if (occurrenceInYear(monthDay, ty) > today) years -= 1;
  if (years >= 1) return { n: years, unit: "years" };
  const [, mm] = MD.exec(monthDay) ?? ["", "1"];
  let months = (ty - year) * 12 + (t.getMonth() + 1 - Number(mm));
  const startDay = Math.min(Number(monthDay.slice(3)), daysInMonth(ty, t.getMonth() + 1));
  if (t.getDate() < startDay) months -= 1;
  if (months >= 1) return { n: months, unit: "months" };
  return { n: daysBetween(start, today), unit: "days" };
}

/* ---------- the unified list History shows ---------- */

export type UpcomingDate = {
  key: string;
  source: "anniversary" | "birthday";
  id: string;
  label: string;
  personName?: string;
  kind: AnniversaryKind | "birthday";
  milestone: boolean;
  date: string;
  daysUntil: number;
  turning?: number;
  origin?: string;
  elapsed?: Elapsed | null;
};

export function upcomingDates(
  settings: Pick<Settings, "anniversaries" | "children" | "archivedPeople">,
  today: string,
): UpcomingDate[] {
  const archived = cleanArchived(settings.archivedPeople);
  const hidden = (name?: string) =>
    Boolean(name) && archived.some((p) => p.name.toLowerCase() === (name as string).toLowerCase() && !p.resurface);
  const out: UpcomingDate[] = [];
  for (const a of cleanAnniversaries(settings.anniversaries)) {
    if (hidden(a.personName)) continue;
    const next = nextOccurrence(a.monthDay, today);
    out.push({
      key: `a-${a.id}`,
      source: "anniversary",
      id: a.id,
      label: a.label,
      personName: a.personName,
      kind: a.kind,
      milestone: a.milestone,
      date: next.date,
      daysUntil: daysBetween(today, next.date),
      turning: a.year ? next.year - a.year : undefined,
      origin: a.year ? occurrenceInYear(a.monthDay, a.year) : undefined,
      elapsed: a.year ? counterSince(a.year, a.monthDay, today) : null,
    });
  }
  for (const c of cleanChildren(settings.children)) {
    const monthDay = c.birthdate.slice(5);
    const birthYear = Number(c.birthdate.slice(0, 4));
    const next = nextOccurrence(monthDay, today);
    out.push({
      key: `b-${c.id}`,
      source: "birthday",
      id: c.id,
      label: c.name,
      kind: "birthday",
      milestone: false,
      date: next.date,
      daysUntil: daysBetween(today, next.date),
      turning: next.year - birthYear,
      origin: c.birthdate,
      elapsed: counterSince(birthYear, monthDay, today),
    });
  }
  return out.sort((x, y) => x.daysUntil - y.daysUntil || Number(y.milestone) - Number(x.milestone) || x.label.localeCompare(y.label));
}

/* ---------- the Archive ---------- */

export function archivedIn(rawArchived: unknown, name: string): ArchivedPerson | undefined {
  const key = name.trim().toLowerCase();
  return cleanArchived(rawArchived).find((p) => p.name.toLowerCase() === key);
}

export type ArchiveSurface = "history" | "stats" | "resurface";

/** True when this person's traces must stay quiet on the given surface. */
export function hiddenIn(rawArchived: unknown, name: string, surface: ArchiveSurface): boolean {
  if (!name.trim()) return false;
  const a = archivedIn(rawArchived, name);
  if (!a) return false;
  return surface === "history" ? !a.showInHistory : surface === "stats" ? !a.countInStats : !a.resurface;
}

/* The Archive law, resolved in exactly one place (Wave 4, RT-V4 B8/B9):
 * every surface that shows the diary's record reads its sessions and
 * encounters through these selectors, so a person archived with a
 * surface's switch off is quiet there — History's own glance card,
 * Home's recent list and the Calendar included. The manual's sentence
 * is the spec: with every switch off, the diary goes quiet about her. */
export function visibleSessions(journal: Journal, surface: ArchiveSurface): Session[] {
  const archived = journal.settings.archivedPeople;
  return journal.sessions.filter((s) => !hiddenIn(archived, s.partnerName, surface));
}

export function visibleEncounters(journal: Journal, surface: ArchiveSurface): Encounter[] {
  const archived = journal.settings.archivedPeople;
  return journal.encounters.filter((e) => !hiddenIn(archived, e.partnerName, surface));
}

/** The trackers a counting surface may count (Decision 2, RT-V3 L-4):
 * an archived person's cycle tracker follows her Statistics switch —
 * off, and the Advisor and Statistics stop counting her cycle. The
 * tracker itself is untouched: it stays in Settings, selectable, and
 * switching Statistics back on counts it again. */
export function countedTrackers(journal: Journal): CycleTracker[] {
  const archived = journal.settings.archivedPeople;
  return (journal.settings.cycles ?? []).filter(
    (tr) =>
      !(tr.partnerName && hiddenIn(archived, tr.partnerName, "stats")) &&
      !(tr.partnerLink && hiddenIn(archived, tr.partnerLink, "stats")),
  );
}

export function newDateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export { todayStr };
