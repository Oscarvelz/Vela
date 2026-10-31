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

export function coveringEncounter(encounters: Encounter[], date: string) {
  return (
    encounters
      .filter((encounter) => encounter.startDate <= date && encounter.endDate >= date)
      .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null
  );
}
