import { addDays, parseDate } from "./dates";
import type { Encounter } from "./types";

export function weekendOf(date: string) {
  const day = parseDate(date).getDay();
  const start = addDays(date, day === 0 ? -2 : 5 - day);
  return { start, end: addDays(start, 2) };
}

export function spanDays(start: string, end: string) {
  const ms = parseDate(end).getTime() - parseDate(start).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

export function coverDates(dates: string[]) {
  const sorted = dates.filter(Boolean).slice().sort();
  return { startDate: sorted[0] ?? "", endDate: sorted[sorted.length - 1] ?? "" };
}

/** Partner key: an encounter belongs to one partner, or to solo (""). Case and spaces don't matter. */
export function partnerKey(name: string | undefined | null) {
  return (name ?? "").trim().toLocaleLowerCase();
}

export function samePartner(a: string | undefined | null, b: string | undefined | null) {
  return partnerKey(a) === partnerKey(b);
}

/** The newest encounter that covers `date` AND belongs to the same partner (solo only matches solo). */
export function coveringEncounter(encounters: Encounter[], date: string, partner: string) {
  return (
    encounters
      .filter(
        (encounter) =>
          encounter.startDate <= date && encounter.endDate >= date && samePartner(encounter.partnerName, partner),
      )
      .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null
  );
}
