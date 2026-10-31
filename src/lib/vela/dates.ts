import type { Lang } from "./copy";
import type { WeekStart } from "./catalog";

export function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function nowTime(d = new Date()) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function parseDate(ds: string) {
  const [y, m, d] = ds.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(ds: string, n: number) {
  const d = parseDate(ds);
  d.setDate(d.getDate() + n);
  return todayStr(d);
}

export function iso(year: number, month: number, day: number) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

export function localeOf(lang: Lang) {
  return lang === "es" ? "es-ES" : "en-US";
}

export function fmtDate(ds: string, lang: Lang) {
  try {
    return parseDate(ds).toLocaleDateString(localeOf(lang), {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return ds;
  }
}

export function fmtShort(ds: string, lang: Lang) {
  return parseDate(ds).toLocaleDateString(localeOf(lang), { month: "short", day: "numeric" });
}

export function fmtTime(tm: string, lang: Lang) {
  const [hs, ms] = (tm || "21:00").split(":");
  let h = Number(hs);
  const m = ms || "00";
  if (lang === "es") return `${pad(h)}:${m}`;
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
}

export function fmtDuration(mins: number, compact = false) {
  const n = Math.max(0, Math.round(Number(mins) || 0));
  if (n < 60) return compact ? `${n}m` : `${n} min`;
  const hours = Math.floor(n / 60);
  const rest = n % 60;
  if (rest === 0) return compact ? `${hours}h` : `${hours} h`;
  return compact ? `${hours}h ${rest}m` : `${hours} h ${rest} min`;
}

export function monthTitle(year: number, month: number, lang: Lang) {
  const raw = new Date(year, month, 1).toLocaleDateString(localeOf(lang), {
    month: "long",
    year: "numeric",
  });
  return raw.replace(/\p{L}+/gu, (word) => word.charAt(0).toUpperCase() + word.slice(1));
}

export function monthHeading(year: number, month: number, lang: Lang) {
  const name = new Date(year, month, 1).toLocaleDateString(localeOf(lang), { month: "long" });
  const pretty = name.charAt(0).toLocaleUpperCase(localeOf(lang)) + name.slice(1);
  return `${pretty} ${year}`;
}

export function weekdayHeads(weekStart: WeekStart, lang: Lang) {
  const heads: string[] = [];
  for (let i = 0; i < 7; i++) {
    const idx = weekStart === "monday" ? i : (i + 6) % 7;
    const label = new Date(2024, 0, 1 + idx)
      .toLocaleDateString(localeOf(lang), { weekday: "short" })
      .replace(".", "");
    heads.push(label.slice(0, 3).toUpperCase());
  }
  return heads;
}

export function monthMeta(year: number, month: number, weekStart: WeekStart) {
  const first = new Date(year, month, 1);
  let lead = first.getDay();
  if (weekStart === "monday") lead = (lead + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  return { lead, days };
}

export function startOfWeek(ds: string, weekStart: WeekStart) {
  const d = parseDate(ds);
  const dow = d.getDay();
  const off = weekStart === "monday" ? (dow + 6) % 7 : dow;
  d.setDate(d.getDate() - off);
  return todayStr(d);
}
