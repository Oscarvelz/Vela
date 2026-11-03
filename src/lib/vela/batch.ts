/*
 * Natural-language batch reader. Turns a free-form paste (English, Spanish,
 * Spanglish, typos) into encounters with the same fields the session form
 * fills: date, time, count, place, positions, contraception, problems,
 * partner, duration, the four feelings and the overall rating. Bubbles are
 * matched against the built-in catalog AND the user's own bubbles from
 * Settings. Anything that was not turned into a bubble stays in the note.
 * Nothing is invented: a field the text does not speak to stays empty (0).
 */
import { NAMED_PLACES } from "./catalog";
import {
  FILLER,
  FUZZY_STOP,
  FUZZY_WORDS,
  INSTEAD,
  METHOD_RULES,
  MONTHS,
  MULTI_RULES,
  NEGATORS,
  NOT_NEGATION,
  NUMBER_WORDS,
  OVERALL_RULES,
  PLACE_RULES,
  POSITION_RULES,
  PROBLEM_RULES,
  RATING_RULES,
  SCOPE_BREAK,
  WEEKDAYS,
  type Rule,
} from "./batch-lexicon";

export type BatchEntry = {
  title: string;
  /** Local date, YYYY-MM-DD. */
  date: string;
  /** False when the text gave no date and today was assumed. */
  dateStated: boolean;
  /** HH:MM, 24 h. */
  time: string;
  /** False when the text gave no time and 21:00 was assumed. */
  timeStated: boolean;
  /** Every clock time the text gave, in order (used for the rounds of one encounter). */
  times: string[];
  place: string;
  count: number;
  nextDay: boolean;
  /** The part of the text that was not turned into bubbles or fields. */
  notes: string;
  contraception: string[];
  problems: string[];
  partnerName: string;
  /** 0 = not stated. */
  durationMins: number;
  positions: string[];
  intensity: number;
  connection: number;
  satisfaction: number;
  energy: number;
  /** 1–5, 0 = not stated. */
  overall: number;
  /** The original text this entry was read from. */
  source: string;
  /** Last day of a stated range ("Oct 1-3", "del 1 al 3"); same as `date` otherwise. */
  endDate: string;
  /** The text says it was a solo moment (solo, alone, por mi cuenta…): never given the batch partner. */
  solo: boolean;
};

export type BatchContext = {
  /** App language: "es" reads an ambiguous 2/11 as 2 Nov (a Spanish line does too, whatever the app language). */
  lang?: "en" | "es";
  partners?: string[];
  customPlaces?: string[];
  customPositions?: string[];
  customProblems?: string[];
};

type Span = { start: number; end: number };
type Hit = Span & { rule: Rule; negated: boolean };

// ------------------------------------------------------------------ helpers

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function isoOf(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function shift(base: Date, days: number) {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

/** Lower case, accents off, one output char per input UTF-16 unit, so indices line up with the original. */
export function fold(text: string) {
  let out = "";
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const code = ch.charCodeAt(0);
    if (code >= 0xd800 && code <= 0xdfff) {
      out += " ";
      continue;
    }
    if (ch === "’" || ch === "‘" || ch === "´" || ch === "`") {
      out += "'";
      continue;
    }
    let f = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (f.length !== 1) f = f ? f[0] : " ";
    out += f;
  }
  return out;
}

function escapeRe(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function overlaps(a: Span, b: Span) {
  return a.start < b.end && b.start < a.end;
}

function freeOf(spans: Span[], span: Span) {
  return !spans.some((s) => overlaps(s, span));
}

function* matches(re: RegExp, text: string) {
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[0].length === 0) {
      re.lastIndex += 1;
      continue;
    }
    yield m;
  }
}

// ------------------------------------------------------------------ negation

function clauseBefore(folded: string, index: number) {
  const before = folded.slice(Math.max(0, index - 80), index);
  const cut = Math.max(before.lastIndexOf(","), before.lastIndexOf("."), before.lastIndexOf(";"), before.lastIndexOf("!"), before.lastIndexOf("?"), before.lastIndexOf("\n"), before.lastIndexOf(":"), before.lastIndexOf("("));
  let clause = cut >= 0 ? before.slice(cut + 1) : before;
  for (const re of NOT_NEGATION) {
    clause = clause.replace(re, (all) => " ".repeat(all.length));
  }
  return clause;
}

function negatedAt(folded: string, start: number, end: number) {
  const clause = clauseBefore(folded, start);
  if (INSTEAD.test(clause)) return true;
  let scope = clause;
  let lastBreak = -1;
  for (const m of matches(SCOPE_BREAK, clause)) lastBreak = (m.index ?? 0) + m[0].length;
  if (lastBreak >= 0) scope = clause.slice(lastBreak);
  const words = scope.split(/[^a-z0-9'/]+/).filter(Boolean).slice(-5);
  if (words.some((w) => NEGATORS.has(w))) return true;
  // "condom: no", "pain? none"
  return /^\s*[:\-=?]+\s*(?:no|none|nope|nada|ninguno|ninguna|0)\b/.test(folded.slice(end, end + 14));
}

// ------------------------------------------------------------------ dates & times

type Anchor = Span & { date: string; stated: "explicit" | "relative"; year?: number; yearGiven?: boolean; to?: string; weak?: boolean };

/** Longest stated range read as one encounter (days). */
const MAX_RANGE_DAYS = 14;

const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");
const WEEKDAY_ABBR = "mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday|sun|sunday|lun|lunes|mar|martes|mie|miercoles|jue|jueves|vie|viernes|sab|sabado|dom|domingo";
const WEEKDAY_FULL = Object.keys(WEEKDAYS).join("|");
const NUM_WORD_RE = "\\d+|one|two|three|four|five|six|seven|eight|nine|ten|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|a couple of|a couple|couple of|un par de";

function fullYear(value: string) {
  if (value.length === 4) return Number(value);
  const n = Number(value);
  return n <= 50 ? 2000 + n : 1900 + n;
}

function validDay(year: number, month: number, day: number) {
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(year, month, 0).getDate();
}

type YearState = { carried: number | null; dayFirst?: boolean };

const ES_WORDS = /\b(?:con|ayer|anoche|antier|hoy|veces|vez|noche|semana|finde|despues|fue|fuimos|hicimos|estuvo|muy|pero|cama|sofa|ducha|carro|coche|sin|el dia|la|las|los|del|al|en la|en el|mi|nos|que|y)\b/g;
const EN_WORDS = /\b(?:with|yesterday|last|night|today|times|twice|once|week|weekend|after|was|we|very|but|bed|couch|shower|car|without|the|and|on|in|at|my|her|his|that)\b/g;

/** Whether a piece of text reads as Spanish (more Spanish function words than English ones). */
export function looksSpanish(folded: string) {
  const es = folded.match(ES_WORDS)?.length ?? 0;
  const en = folded.match(EN_WORDS)?.length ?? 0;
  return es > en;
}

/** The most recent past day `day` of a month (today counts): "el 28" on Nov 2 → Oct 28. */
function recentDay(day: number, now: Date) {
  let month = now.getMonth() + 1;
  let year = now.getFullYear();
  if (day > now.getDate()) {
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  return { month, year };
}

function settleYear(month: number, day: number, now: Date, state: YearState, given: number | null) {
  if (given) {
    state.carried = given;
    return given;
  }
  if (state.carried) return state.carried;
  let year = now.getFullYear();
  const candidate = new Date(year, month - 1, day);
  if (candidate.getTime() - shift(now, 1).getTime() > 0) year -= 1;
  return year;
}

/** Finds every date mention. Ratings like 8/10 must already be in `blocked`. */
function findAnchors(folded: string, now: Date, state: YearState, blocked: Span[]): Anchor[] {
  const found: (Anchor & { month?: number; day?: number; givenYear?: number | null; month2?: number; day2?: number })[] = [];
  const push = (a: (typeof found)[number]) => {
    if (freeOf(blocked, a)) found.push(a);
  };
  const monthFirst = new RegExp(
    `(?:\\b(?:${WEEKDAY_ABBR})\\b[,.]?\\s+)?\\b(${MONTH_RE})\\b\\.?,?\\s*(\\d{1,2})(?:st|nd|rd|th)?\\b(?!\\s*(?:veces|times|x\\b|rounds|rondas|min|mins|minutes|minutos|hours?|horas?|hrs?)\\b)\\.?(?:,?\\s*((?:19|20)\\d{2})\\b)?`,
    "g",
  );
  const dayFirst = new RegExp(
    `(?:\\b(?:${WEEKDAY_ABBR})\\b[,.]?\\s+)?\\b(?:the\\s+|el\\s+)?(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(?:de|of))?\\s+(${MONTH_RE})\\b\\.?(?:,?\\s*(?:de(?:l)?\\s+)?((?:19|20)\\d{2})\\b)?`,
    "g",
  );
  for (const m of matches(monthFirst, folded)) {
    const month = MONTHS[m[1]];
    const day = Number(m[2]);
    if (/^(?:mar|may|sat|sun)$/.test(m[1]) && !/\d/.test(m[0])) continue;
    push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, date: "", stated: "explicit", month, day, givenYear: m[3] ? Number(m[3]) : null });
  }
  for (const m of matches(dayFirst, folded)) {
    const month = MONTHS[m[2]];
    const day = Number(m[1]);
    push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, date: "", stated: "explicit", month, day, givenYear: m[3] ? Number(m[3]) : null });
  }
  for (const m of matches(/(?<![\d/.])\b(\d{1,4})([./-])(\d{1,2})\2(\d{2,4})\b/g, folded)) {
    const first = m[1];
    const sep = m[2];
    let month = 0;
    let day = 0;
    let year = 0;
    if (first.length === 4) {
      year = Number(first);
      month = Number(m[3]);
      day = Number(m[4]);
    } else {
      const a = Number(first);
      const b = Number(m[3]);
      year = fullYear(m[4]);
      if (a > 12 && b <= 12) [day, month] = [a, b];
      else if (b > 12 && a <= 12) [month, day] = [a, b];
      else if (sep === "." || state.dayFirst) [day, month] = [a, b];
      else [month, day] = [a, b];
    }
    push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, date: "", stated: "explicit", month, day, givenYear: year });
  }
  // 10/29 (no year). 8/10-style ratings are blocked before this runs.
  for (const m of matches(/(?<![\d/.:])\b(\d{1,2})\/(\d{1,2})\b(?![\d/])/g, folded)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    let month = a;
    let day = b;
    if (a > 12 && b <= 12) [day, month] = [a, b];
    // Spanish writes day/month: 2/11 = 2 Nov (when both readings are valid).
    else if (state.dayFirst && b <= 12 && a <= 31) [day, month] = [a, b];
    push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, date: "", stated: "explicit", month, day, givenYear: null });
  }
  // on the 28th / el dia 28 / el 28 (the most recent past 28th)
  for (const m of matches(/\b(?:on the|the|el dia|el)\s+(\d{1,2})(?:st|nd|rd|th)\b|\bel dia (\d{1,2})\b|\bel (\d{1,2})\b(?!\s*(?:de|del|of|veces|vez|times|x|rondas?|rounds?|min|mins|minutos?|horas?|hrs?|h|am|pm|estrellas?|stars?|%)\b)(?![\d/:.,]\d)/g, folded)) {
    const day = Number(m[1] || m[2] || m[3]);
    const { month, year } = recentDay(day, now);
    push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, date: "", stated: "explicit", month, day, givenYear: year });
  }
  // Ranges: "Oct 1-3", "Oct 25 - Oct 26", "Oct 31 to Nov 2", "1-3 de octubre", "del 1 al 3 (de octubre)".
  const NOT_COUNT = "(?!\\s*(?:veces|vez|times|x\\b|rounds|rondas|min|mins|minutes|minutos|hours?|horas?|hrs?|am|pm|a\\.m|p\\.m)\\b)";
  const DASH = "\\s*(?:-|–|—|to|thru|through|until|till|hasta|al)\\s*";
  const ranges: [RegExp, (m: RegExpExecArray) => [number, number, number, number]][] = [
    [new RegExp(`\\b(${MONTH_RE})\\b\\.?\\s*(\\d{1,2})(?:st|nd|rd|th)?${DASH}(?:(${MONTH_RE})\\b\\.?\\s*)?(\\d{1,2})(?:st|nd|rd|th)?\\b${NOT_COUNT}`, "g"),
      (m) => [MONTHS[m[1]], Number(m[2]), m[3] ? MONTHS[m[3]] : MONTHS[m[1]], Number(m[4])]],
    [new RegExp(`\\b(?:del?\\s+|from\\s+(?:the\\s+)?)?(\\d{1,2})(?:st|nd|rd|th)?${DASH}(?:el\\s+|the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:de\\s+|of\\s+)?(${MONTH_RE})\\b`, "g"),
      (m) => [MONTHS[m[3]], Number(m[1]), MONTHS[m[3]], Number(m[2])]],
    [/\bdel\s+(\d{1,2})\s+al\s+(\d{1,2})\b(?!\s*(?:de|of)\b)/g,
      (m) => { const b = recentDay(Number(m[2]), now); return [b.month, Number(m[1]), b.month, Number(m[2])]; }],
  ];
  for (const [re, read] of ranges) {
    for (const m of matches(re, folded)) {
      const [m1, d1, m2, d2] = read(m);
      if (!m1 || !m2) continue;
      push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, date: "", stated: "explicit", month: m1, day: d1, givenYear: null, month2: m2, day2: d2 });
    }
  }
  // the weekend / el finde / este fin de semana → that weekend's Saturday; "last weekend" on a weekend → the one before.
  for (const m of matches(/\b(?:(last|this past|past|this|the|over the|on the|el|este|ese|del)\s+)?(weekend|finde|fin de semana)(\s+pasado)?\b/g, folded)) {
    if (!m[1] && !m[3]) continue; // a bare "weekend" ("weekend getaway") isn't a date by itself
    const day = now.getDay();
    let back = (day - 6 + 7) % 7; // days since the most recent Saturday (today counts)
    if ((m[1] === "last" || Boolean(m[3])) && (day === 6 || day === 0)) back += 7;
    push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, date: isoOf(shift(now, -back)), stated: "relative", weak: true });
  }
  const rel = (re: RegExp, days: (m: RegExpExecArray) => number | null) => {
    for (const m of matches(re, folded)) {
      const n = days(m);
      if (n === null) continue;
      push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, date: isoOf(shift(now, n)), stated: "relative" });
    }
  };
  rel(/\b(?:the )?day before yesterday\b|\bantier\b|\banteayer\b|\bantes de ayer\b|\bantier en la noche\b/g, () => -2);
  rel(/\byesterday\b|\blast night\b|\blate last night\b|\bayer\b|\banoche\b/g, () => -1);
  rel(/\btoday\b|\btonight\b|\bthis (?:morning|afternoon|evening)\b|\bearlier today\b|\bhoy\b|\besta (?:manana|tarde|noche|madrugada)\b/g, () => 0);
  rel(new RegExp(`\\b(${NUM_WORD_RE}) days? ago\\b|\\bhace (${NUM_WORD_RE}) dias?\\b`, "g"), (m) => {
    const word = m[1] || m[2];
    const n = /^\d+$/.test(word) ? Number(word) : NUMBER_WORDS[word] ?? null;
    return n && n < 400 ? -n : null;
  });
  rel(/\b(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\.?(?=\s+(?:night|morning|afternoon|evening|am|pm|noche|manana|tarde)\b)/g, (m) => {
    const full: Record<string, number> = { mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6, sun: 0 };
    let back = (now.getDay() - full[m[1]] + 7) % 7;
    if (back === 0) back = 7;
    return -back;
  });
  rel(/\b(?:a|one) week ago\b|\bhace una semana\b/g, () => -7);
  rel(new RegExp(`\\b(?:(?:last|this past|past|on|el|este)\\s+)?(${WEEKDAY_FULL})(?:\\s+pasado)?\\b`, "g"), (m) => {
    const target = WEEKDAYS[m[1]];
    let back = (now.getDay() - target + 7) % 7;
    if (back === 0) back = 7;
    return -back;
  });
  found.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const kept: Anchor[] = [];
  let end = -1;
  for (const item of found) {
    if (item.start < end) continue;
    if (item.stated === "explicit") {
      const month = item.month ?? 0;
      const day = item.day ?? 0;
      const year = item.givenYear && item.givenYear > 1900 ? item.givenYear : null;
      if (item.month2) {
        // A range: both ends valid, in order, under two weeks; the year follows the end day.
        const m2 = item.month2;
        const d2 = item.day2 ?? 0;
        const y2 = settleYear(m2, d2, now, { ...state }, year);
        const y1 = m2 < month ? y2 - 1 : y2;
        if (!validDay(y1, month, day) || !validDay(y2, m2, d2)) continue;
        const from = `${y1}-${pad(month)}-${pad(day)}`;
        const to = `${y2}-${pad(m2)}-${pad(d2)}`;
        const days = Math.round((new Date(y2, m2 - 1, d2).getTime() - new Date(y1, month - 1, day).getTime()) / 86_400_000);
        if (to <= from || days >= MAX_RANGE_DAYS) continue;
        settleYear(m2, d2, now, state, year);
        kept.push({ start: item.start, end: item.end, date: from, stated: "explicit", to });
        end = item.end;
        continue;
      }
      const settled = settleYear(month, day, now, state, year);
      if (!validDay(settled, month, day)) continue;
      item.date = `${settled}-${pad(month)}-${pad(day)}`;
    }
    kept.push({ start: item.start, end: item.end, date: item.date, stated: item.stated, weak: item.weak });
    end = item.end;
  }
  // "the weekend" only dates a piece that names no other day ("Oct 24, the weekend at the cabin" is Oct 24).
  return kept.some((a) => !a.weak) ? kept.filter((a) => !a.weak) : kept;
}

type TimeHit = Span & { time: string; exact: boolean };

const SLOTS: { re: RegExp; time: string; part: "night" | "morning" | "afternoon" | "late" }[] = [
  { re: /\b(?:de |en la |esta |la )?madrugada\b|\bin the middle of the night\b/g, time: "02:00", part: "late" },
  { re: /\blate (?:last )?night\b|\blate at night\b|\btarde en la noche\b|\bya tarde\b/g, time: "00:30", part: "late" },
  { re: /\bearly (?:this )?morning\b|\btemprano en la manana\b|\bat dawn\b|\bal amanecer\b/g, time: "06:00", part: "morning" },
  { re: /\bmidnight\b|\bmedianoche\b/g, time: "00:00", part: "late" },
  { re: /\bnoon\b|\bmidday\b|\bmediodia\b/g, time: "12:00", part: "afternoon" },
  { re: /\blunch(?: ?break| time)?\b|\b(?:hora del )?almuerzo\b/g, time: "13:00", part: "afternoon" },
  { re: /\bmornings?\b|\b(?:en|por|de|esta|la) manana\b/g, time: "09:00", part: "morning" },
  { re: /\bafternoon\b|\b(?:en|por|de|esta) (?:la )?tarde\b|\bla tarde\b/g, time: "15:00", part: "afternoon" },
  { re: /\bevening\b|\bnight\b|\btonight\b|\banoche\b|\b(?:en|por|de|esta) (?:la )?noche\b|\bla noche\b|\bafter dinner\b|\bdespues de (?:cenar|la cena)\b/g, time: "21:00", part: "night" },
];

function partOfDay(folded: string): "night" | "morning" | "afternoon" | "late" | null {
  let best: { index: number; part: "night" | "morning" | "afternoon" | "late" } | null = null;
  for (const slot of SLOTS) {
    for (const m of matches(slot.re, folded)) {
      if (!best || (m.index ?? 0) < best.index) best = { index: m.index ?? 0, part: slot.part };
      break;
    }
  }
  return best?.part ?? null;
}

function resolveHour(hour: number, minute: number, mer: string | null, context: string, wholeContext: string | null) {
  let h = hour;
  if (mer) {
    const pm = mer.startsWith("p");
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
    return `${pad(h)}:${pad(minute)}`;
  }
  if (h >= 13 || h === 0) return `${pad(h % 24)}:${pad(minute)}`;
  const local = /^\s*(?:de la |in the |at )?(noche|night|evening|tarde|afternoon|manana|morning|madrugada)\b/.exec(context);
  const part = local ? local[1] : wholeContext;
  if (part === "manana" || part === "morning") return `${pad(h === 12 ? 12 : h)}:${pad(minute)}`;
  if (part === "madrugada" || part === "late") return `${pad(h === 12 ? 0 : h)}:${pad(minute)}`;
  if (part === "noche" || part === "night" || part === "evening") {
    if (h === 12) return `00:${pad(minute)}`;
    if (h <= 4) return `${pad(h)}:${pad(minute)}`;
    return `${pad(h + 12)}:${pad(minute)}`;
  }
  // afternoon or nothing said: 1–11 read as p.m. (most entries are evenings)
  return `${pad(h === 12 ? 12 : h + 12)}:${pad(minute)}`;
}

function findTimes(folded: string, blocked: Span[]): TimeHit[] {
  const out: TimeHit[] = [];
  const whole = partOfDay(folded);
  const add = (hit: TimeHit) => {
    if (freeOf(blocked, hit) && freeOf(out, hit)) out.push(hit);
  };
  // 11pm, 11:30 p.m., 1am
  for (const m of matches(/\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s?m\b\.?/g, folded)) {
    const h = Number(m[1]);
    const min = Number(m[2] || 0);
    if (h > 12 || min > 59) continue;
    add({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, time: resolveHour(h, min, m[3], "", null), exact: true });
  }
  // 22:30, 10:30 (+ "de la noche"), 22h
  for (const m of matches(/(?<![\d/])\b(\d{1,2}):(\d{2})\b(?:\s*(?:h|hrs|horas)\b)?/g, folded)) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) continue;
    const after = folded.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 20);
    add({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, time: resolveHour(h, min, null, after, whole), exact: true });
  }
  // at 10 / around 11 / a las 10 (de la noche)
  for (const m of matches(/\b(?:at|around|about|by|like|approx(?:imately)?|como a las|a eso de las|eso de las|alrededor de las|cerca de las|tipo|a las|las)\s+(\d{1,2})(?:\s*(?:o'?clock|en punto|y media|y cuarto|ish))?\b(?!\s*(?:\/|:|de (?:\d|octubre|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|noviembre|diciembre)|times|veces|x\b|min|mins|minutes|minutos|hours?|horas?|hrs?|days?|dias?|people|personas|st\b|nd\b|rd\b|th\b|stars?|estrellas?|out of|de 10|%))/g, folded)) {
    const h = Number(m[1]);
    if (h > 23) continue;
    const min = /y media/.test(m[0]) ? 30 : /y cuarto/.test(m[0]) ? 15 : 0;
    const after = folded.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 20);
    add({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, time: resolveHour(h, min, null, after, whole), exact: true });
  }
  // part-of-day words
  for (const slot of SLOTS) {
    for (const m of matches(slot.re, folded)) {
      add({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, time: slot.time, exact: false });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

// ------------------------------------------------------------------ duration, count, ratings

function numberValue(word: string) {
  const w = word.trim().replace(",", ".");
  if (/^\d+(?:\.\d+)?$/.test(w)) return Number(w);
  return NUMBER_WORDS[w] ?? null;
}

const DUR_NUM = "\\d+(?:[.,]\\d+)?|one|two|three|four|five|ten|fifteen|twenty|thirty|forty[- ]five|forty|sixty|ninety|un|una|uno|dos|tres|cuatro|cinco|diez|quince|veinte|treinta|cuarenta y cinco|cuarenta|sesenta|noventa|a couple of|a couple|couple of|un par de|an|a";
const NOT_DURATION_AFTER = /^\s*(?:later|after|afterwards|before|ago|earlier|despues|antes|mas tarde|from now|de distancia|away)\b/;
const NOT_DURATION_BEFORE = /\b(?:hace|after|within|every|cada|despues de)\s*$/;

function findDuration(folded: string, blocked: Span[]): (Span & { mins: number }) | null {
  const candidates: (Span & { mins: number })[] = [];
  const add = (m: RegExpExecArray, mins: number) => {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (!mins || !freeOf(blocked, { start, end })) return;
    if (NOT_DURATION_AFTER.test(folded.slice(end, end + 16))) return;
    if (NOT_DURATION_BEFORE.test(folded.slice(Math.max(0, start - 14), start))) return;
    candidates.push({ start, end, mins });
  };
  for (const m of matches(/\b(?:an |one |1 |una |1 )?hour and a half\b|\b(?:una )?hora y media\b|\b1\.5 ?(?:hours?|hrs?|horas?)\b/g, folded)) add(m, 90);
  for (const m of matches(/\bhalf an hour\b|\bhalf hour\b|\bmedia hora\b/g, folded)) add(m, 30);
  for (const m of matches(new RegExp(`\\b(${DUR_NUM})\\s*(?:hours?|hrs?|horas?|h)\\b(?:\\s*(?:and\\s*|y\\s*)?(\\d+)\\s*(?:min|mins|minutes|minutos)\\b)?`, "g"), folded)) {
    const n = numberValue(m[1]);
    if (n === null) continue;
    if (/\b(?:a|las)\s*$/.test(folded.slice(Math.max(0, (m.index ?? 0) - 4), m.index ?? 0)) && /h\b/.test(m[0])) continue;
    add(m, Math.round(n * 60 + Number(m[2] || 0)));
  }
  for (const m of matches(new RegExp(`\\b(${DUR_NUM})(?:\\s*(?:-|to|a|o)\\s*(\\d+))?\\s*(?:min|mins|minutes?|minutos?)\\b`, "g"), folded)) {
    const a = numberValue(m[1]);
    if (a === null) continue;
    const b = m[2] ? Number(m[2]) : a;
    add(m, Math.round((a + b) / 2));
  }
  candidates.sort((a, b) => a.start - b.start || b.end - a.end);
  const first = candidates.find((c) => freeOf(candidates.filter((o) => o !== c && o.end - o.start > c.end - c.start), c));
  if (!first) return null;
  return { ...first, mins: Math.min(240, Math.max(5, first.mins)) };
}

const COUNT_WORDS: [RegExp, number][] = [
  [/\b(?:once|one time|una vez|1 vez)\b/g, 1],
  [/\b(?:twice|two times|two rounds|both times|dos veces|dos rondas|2 rounds|2 rondas|ambas veces|las dos veces)\b/g, 2],
  [/\b(?:thrice|three times|three rounds|tres veces|tres rondas|3 rounds|3 rondas)\b/g, 3],
  [/\b(?:four times|four rounds|cuatro veces|cuatro rondas)\b/g, 4],
  [/\b(?:five times|cinco veces)\b/g, 5],
  [/\b(?:six times|seis veces)\b/g, 6],
];
const AGAIN = /\b(?:round (?:two|2)|second round|another round|one more round|(?:did it|do it|went at it|had sex|made love|fucked|we went) again|again (?:later|after|that night|in the morning|(?:the )?(?:next|following) (?:day|morning|night|afternoon))|otra ronda|segunda ronda|lo hicimos (?:otra vez|de nuevo)|otra vez mas tarde|una vez mas|(?:otra vez|de nuevo) (?:al dia siguiente|el dia siguiente|a la manana siguiente|la manana siguiente|al otro dia|en la manana|por la manana))\b/g;
/** "again at 1am" / "otra vez a las 2": a second round at a stated time. */
const AGAIN_AT = /\b(?:again|otra vez|de nuevo)\s+(?:at|around|a las?|como a las?|sobre las?)\s+\d/g;

function findCount(folded: string, blocked: Span[]): { n: number; spans: Span[]; again: boolean } {
  const spans: Span[] = [];
  let n = 0;
  for (const m of matches(/\b(\d{1,2})\s*(?:times|veces|x|rounds|rondas)\b|\bx\s?(\d)\b/g, folded)) {
    const span = { start: m.index ?? 0, end: (m.index ?? 0) + m[0].length };
    if (!freeOf(blocked, span)) continue;
    spans.push(span);
    n = Math.max(n, Number(m[1] || m[2]));
  }
  for (const [re, value] of COUNT_WORDS) {
    for (const m of matches(re, folded)) {
      const span = { start: m.index ?? 0, end: (m.index ?? 0) + m[0].length };
      if (!freeOf(blocked, span) || !freeOf(spans, span)) continue;
      // "una vez" inside "una vez mas" is the again-rule's job
      if (/^\s*mas\b/.test(folded.slice(span.end, span.end + 5))) continue;
      spans.push(span);
      n = Math.max(n, value);
    }
  }
  let again = false;
  for (const m of matches(AGAIN_AT, folded)) {
    const span = { start: m.index ?? 0, end: (m.index ?? 0) + m[0].length - 1 };
    if (!freeOf(blocked, { start: span.start, end: span.start + 5 })) continue;
    again = true;
  }
  for (const m of matches(AGAIN, folded)) {
    const span = { start: m.index ?? 0, end: (m.index ?? 0) + m[0].length };
    // "again the next morning": the time-of-day word inside is fine, only the start must be free
    if (!freeOf(blocked, { start: span.start, end: Math.min(span.end, span.start + 5) })) continue;
    spans.push(span);
    again = true;
  }
  return { n: Math.min(12, n), spans, again };
}

type Numeric = Span & { level: number; dim: keyof typeof DIM_WORDS | "overall" };
const DIM_WORDS = {
  intensity: /\b(?:intensity|intensidad)\b/,
  connection: /\b(?:connection|conexion)\b/,
  satisfaction: /\b(?:satisfaction|satisfaccion|pleasure|placer)\b/,
  energy: /\b(?:energy|energia)\b/,
};

function findNumericRatings(folded: string): Numeric[] {
  const out: Numeric[] = [];
  const add = (start: number, end: number, value: number, scale: number) => {
    if (value < 0 || value > scale || scale <= 0) return;
    const level = Math.max(1, Math.min(5, Math.round((value / scale) * 5)));
    const before = folded.slice(Math.max(0, start - 22), start);
    let dim: Numeric["dim"] = "overall";
    for (const [key, re] of Object.entries(DIM_WORDS)) if (re.test(before)) dim = key as Numeric["dim"];
    out.push({ start, end, level, dim });
  };
  for (const m of matches(/(?<![\d/])\b(\d{1,2}(?:[.,]\d)?)\s*(?:\/|out of|de|over|sobre)\s*(10|5)\b(?![\d/])/g, folded)) {
    const value = Number(m[1].replace(",", "."));
    const scale = Number(m[2]);
    // 10/29-style dates are not ratings; only N/10 and N/5 with N within the scale count.
    if (value > scale) continue;
    add(m.index ?? 0, (m.index ?? 0) + m[0].length, value, scale);
  }
  for (const m of matches(/\b([1-5](?:[.,]5)?)\s*(?:stars?|estrellas?|flames?|llamas?|hearts?|corazones)\b/g, folded)) {
    add(m.index ?? 0, (m.index ?? 0) + m[0].length, Number(m[1].replace(",", ".")), 5);
  }
  for (const m of matches(/\b(?:rated?(?: it)?|rating|score|le doy|le di|un)\s+(10|[1-9])\b(?!\s*(?:\/|de|out|times|veces|min|hours?|horas?|am|pm|:|dias?|days?))/g, folded)) {
    const start = m.index ?? 0;
    if (/^un\b/.test(m[0]) && !/\b(?:fue|estuvo|es|un)\s*$/.test(folded.slice(Math.max(0, start - 8), start))) continue;
    add(start, start + m[0].length, Number(m[1]), 10);
  }
  return out;
}

// ------------------------------------------------------------------ bubbles

function labelRule(kind: Rule["kind"], label: string, prio: number): Rule | null {
  const f = fold(label).trim();
  if (f.length < 2) return null;
  const body = escapeRe(f).replace(/\s+/g, "\\s+");
  return { kind, value: label, prio, re: new RegExp(`(?<![a-z0-9])${body}(?:s|es)?(?![a-z0-9])`, "g") };
}

function editDistance(a: string, b: string) {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

function buildRules(ctx: BatchContext) {
  const bubble: Rule[] = [...METHOD_RULES, ...PROBLEM_RULES, ...POSITION_RULES, ...PLACE_RULES, ...MULTI_RULES];
  for (const place of NAMED_PLACES) {
    bubble.push({ kind: "place", value: place.name, prio: 3, re: new RegExp(place.re.source, "gi") });
  }
  const fuzzy = FUZZY_WORDS.slice();
  const custom: [Rule["kind"], string[] | undefined][] = [
    ["place", ctx.customPlaces],
    ["position", ctx.customPositions],
    ["problem", ctx.customProblems],
  ];
  for (const [kind, list] of custom) {
    for (const label of list ?? []) {
      if (!label || !label.trim()) continue;
      const rule = labelRule(kind, label.trim(), 5);
      if (rule) bubble.push(rule);
      const f = fold(label.trim());
      if (!/\s/.test(f) && f.length >= 6) fuzzy.push({ word: f, kind, value: label.trim() });
    }
  }
  const feeling: Rule[] = [...RATING_RULES, ...OVERALL_RULES, ...MULTI_RULES];
  return { bubble, feeling, fuzzy };
}

function runRules(rules: Rule[], folded: string, blocked: Span[]): Hit[] {
  const all: Hit[] = [];
  for (const rule of rules) {
    for (const m of matches(rule.re, folded)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (!freeOf(blocked, { start, end })) continue;
      all.push({ start, end, rule, negated: false });
    }
  }
  all.sort((a, b) => (b.rule.prio ?? 0) - (a.rule.prio ?? 0) || b.end - b.start - (a.end - a.start) || a.start - b.start);
  const kept: Hit[] = [];
  for (const hit of all) {
    if (!freeOf(kept, hit)) continue;
    kept.push(hit);
  }
  for (const hit of kept) {
    if (!hit.rule.selfNeg && hit.rule.kind !== "block" && hit.rule.kind !== "multi") hit.negated = negatedAt(folded, hit.start, hit.end);
  }
  return kept.sort((a, b) => a.start - b.start);
}

function fuzzyHits(folded: string, fuzzy: ReturnType<typeof buildRules>["fuzzy"], taken: Span[]): Hit[] {
  const hits: Hit[] = [];
  for (const m of matches(/[a-z]{5,}/g, folded)) {
    const word = m[0];
    const start = m.index ?? 0;
    const span = { start, end: start + word.length };
    if (!freeOf(taken, span) || FUZZY_STOP.has(word)) continue;
    let best: (typeof fuzzy)[number] | null = null;
    let bestD = 9;
    for (const item of fuzzy) {
      if (item.word[0] !== word[0] || Math.abs(item.word.length - word.length) > 2) continue;
      const limit = item.word.length >= 9 ? 2 : item.word.length >= 6 ? 1 : 0;
      if (!limit) continue;
      const d = editDistance(word, item.word);
      if (d > 0 && d <= limit && d < bestD) {
        best = item;
        bestD = d;
      }
    }
    if (!best) continue;
    const rule: Rule = { kind: best.kind, value: best.value, dim: best.dim, level: best.level, re: /$^/ };
    hits.push({ ...span, rule, negated: negatedAt(folded, span.start, span.end) });
  }
  return hits;
}

// ------------------------------------------------------------------ partner

/** A solo moment, said in the text. Bare "solo" counts only on its own ("Oct 30 solo"), never "solo una vez"/"solo con". */
const SOLO_RE = /\b(?:masturbat\w*|masturb\w*|jerk(?:ed|ing)? off|jack(?:ed|ing)? off|by myself|on my own|just me|solo (?:session|moment|time)|me toque|me hice una paja|una paja|por mi cuenta|yo sol[oa]|a solas|solit[oa]|en solitario|momento en solitario)\b|\bsol[oa]\b(?=\s*(?:[,.;:!?)]|$|\b(?:tonight|today|yesterday|last night|this morning|hoy|ayer|anoche|en casa|at home|in bed|en la cama|in the shower|en la ducha)\b))|\balone\b(?=\s*(?:[,.;:!?)]|$|\b(?:at home|in bed|tonight|today|en casa)\b))/;
const WE_RE = /\b(?:we|us|our|together|nosotros|juntos|lo hicimos|hicimos|fuimos|estuvimos)\b/;

const NAME_STOP = new Set(
  "the a an my her his him our their your me us it this that el la los las un una mi su sus tu nosotros ella el ellos condom condon lube lubricante protection proteccion nothing nada " +
    "music musica love amor pleasure placer wine vino friends amigos everyone todos".split(" "),
);

function findPartner(text: string, folded: string, partners: string[], bubbleTaken: Span[]): (Span & { name: string }) | null {
  let best: (Span & { name: string }) | null = null;
  for (const name of partners) {
    const f = fold(name).trim();
    if (f.length < 2) continue;
    const re = new RegExp(`(?<![a-z0-9])${escapeRe(f).replace(/\s+/g, "\\s+")}(?![a-z0-9])`, "g");
    for (const m of matches(re, folded)) {
      const start = m.index ?? 0;
      if (!best || start < best.start) best = { start, end: start + m[0].length, name };
      break;
    }
  }
  if (best) return best;
  // "with Laura", "con Laura" — only a capitalised word right after with/con
  for (const m of matches(/\b(?:with|con|w\/)\s+([A-ZÁÉÍÓÚÑÜ][a-záéíóúñü]+(?:\s+[A-ZÁÉÍÓÚÑÜ][a-záéíóúñü]+)?)/g, text)) {
    const raw = m[1].split(/\s+/)[0];
    const fRaw = fold(raw);
    if (NAME_STOP.has(fRaw) || fRaw.length < 2) continue;
    if (MONTHS[fRaw] || WEEKDAYS[fRaw] !== undefined) continue;
    const start = (m.index ?? 0) + m[0].indexOf(raw);
    const span = { start, end: start + raw.length };
    if (!freeOf(bubbleTaken, span)) continue;
    // a nickname or typo of someone already saved ("Sofi" → Sofía, "Ana" ← "Anna")
    const known = partners.find((name) => {
      const f = fold(name).trim();
      return (fRaw.length >= 3 && f.startsWith(fRaw)) || (fRaw.length >= 4 && editDistance(fRaw, f) <= 1);
    });
    return { ...span, name: known ?? raw };
  }
  return null;
}

// ------------------------------------------------------------------ notes

function remainder(text: string, folded: string, taken: Span[]) {
  const mask = folded.split("");
  for (const span of taken) for (let i = span.start; i < span.end; i += 1) mask[i] = " ";
  const masked = mask.join("");
  const pieces: { text: string; delim: string; keep: boolean }[] = [];
  const re = /([^,;.!?\n]+)([,;.!?\n]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (!m[0]) {
      re.lastIndex += 1;
      continue;
    }
    const start = m.index;
    const end = start + m[1].length;
    const words = masked.slice(start, end).split(/[^a-z']+/).filter((w) => w.length >= 2);
    const keep = words.some((w) => !FILLER.has(w.replace(/'/g, "")) && !FILLER.has(w));
    pieces.push({ text: m[1].trim().replace(/^[()\s]+|[()\s]+$/g, (s) => (s.includes("(") && !m![1].includes(")") ? "" : s.trim())), delim: m[2], keep });
  }
  let out = "";
  for (const piece of pieces) {
    const enders = /[.!?;\n]/.test(piece.delim);
    if (piece.keep && piece.text) {
      const clean = piece.text.replace(/\s+/g, " ").replace(/^[\s(]*\)|\(\s*$/g, "").trim();
      if (!clean) continue;
      const atStart = out === "" || /[.!?]\s$/.test(out);
      out += (atStart ? clean.charAt(0).toUpperCase() + clean.slice(1) : clean);
      const d = piece.delim.replace(/\n/g, "").trim();
      out += enders ? `${(d.match(/[.!?]/) || ["."])[0]} ` : ", ";
    } else if (enders && out.endsWith(", ")) {
      out = `${out.slice(0, -2)}. `;
    }
  }
  return out
    .replace(/,\s*$/, "")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ------------------------------------------------------------------ reading one entry

const NEXT_DAY = /\b(?:the )?(?:next|following) (?:day|morning|afternoon|night)\b|\bal dia siguiente\b|\bel dia siguiente\b|\ba la manana siguiente\b|\bla manana siguiente\b|\bal otro dia\b/g;

function readEntry(text: string, title: string, now: Date, ctx: BatchContext, state: YearState, rules: ReturnType<typeof buildRules>): BatchEntry {
  const folded = fold(text);
  const taken: Span[] = [];

  const numeric = findNumericRatings(folded);
  taken.push(...numeric);
  const anchors = findAnchors(folded, now, state, taken);
  taken.push(...anchors);
  const duration = findDuration(folded, taken);
  if (duration) taken.push(duration);
  // "the next morning" says when the last round was, not when the encounter started.
  const nextPhrases = [...matches(NEXT_DAY, folded)].map((m) => ({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));
  const times = findTimes(folded, [...numeric, ...(duration ? [duration] : []), ...anchors.filter((a) => a.stated === "explicit")])
    .filter((t) => t.exact || freeOf(nextPhrases, t));
  taken.push(...times);

  const bubbleHits = runRules(rules.bubble, folded, taken);
  const fuzzy = fuzzyHits(folded, rules.fuzzy, [...taken, ...bubbleHits]);
  const feelingHits = runRules(rules.feeling, folded, [...taken, ...bubbleHits.filter((h) => h.rule.kind !== "multi")]);
  const multi = bubbleHits.filter((h) => h.rule.kind === "multi");
  const count = findCount(folded, [...taken, ...multi]);
  taken.push(...count.spans);
  const nextSpans = [...matches(NEXT_DAY, folded)].map((m) => ({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));
  taken.push(...nextSpans);

  const positive = (kind: Rule["kind"]) => [...bubbleHits, ...fuzzy].filter((h) => h.rule.kind === kind && !h.negated).sort((a, b) => a.start - b.start);
  const unique = (list: string[]) => list.filter((v, i) => list.indexOf(v) === i);

  const placeHit = positive("place")[0];
  const positions = unique(positive("position").map((h) => h.rule.value));
  let contraception = unique(positive("method").map((h) => h.rule.value));
  if (contraception.length > 1) contraception = contraception.filter((id) => id !== "none");
  const problems = unique(positive("problem").map((h) => h.rule.value));

  const levels = { intensity: 0, connection: 0, satisfaction: 0, energy: 0 };
  let overall = 0;
  const feelings = [...feelingHits, ...fuzzy.filter((h) => h.rule.kind === "rating" || h.rule.kind === "overall")].sort((a, b) => a.start - b.start);
  for (const hit of feelings) {
    const rule = hit.rule;
    if ((rule.kind === "rating" || rule.kind === "multi") && rule.dim && rule.level) {
      if (hit.negated) continue;
      levels[rule.dim] = Math.max(levels[rule.dim], rule.level);
    }
  }
  // "distant / disconnected" is the weak-connection problem and, unless something warmer was said, connection level 1
  if (!levels.connection && bubbleHits.some((h) => h.rule.value === "connection" && h.rule.kind === "problem" && !h.negated && /distan|disconnect|desconect/.test(folded.slice(h.start, h.end)))) {
    levels.connection = 1;
  }
  for (const hit of feelings) {
    const rule = hit.rule;
    if (rule.kind !== "overall" || !rule.level) continue;
    let level = rule.level;
    if (hit.negated) level = level >= 4 ? 2 : level <= 2 ? 3 : 2;
    overall = level; // the last verdict in the text wins ("meh at first, then amazing")
  }
  for (const n of numeric) {
    if (n.dim === "overall") {
      overall = n.level;
      break;
    }
  }
  for (const n of numeric) if (n.dim !== "overall") levels[n.dim] = n.level;

  const partner = findPartner(text, folded, ctx.partners ?? [], bubbleHits);
  const claimed: Span[] = [
    ...taken,
    ...bubbleHits.filter((h) => !h.negated && h.rule.kind !== "multi"),
    ...fuzzy.filter((h) => !h.negated),
    ...feelingHits.filter((h) => !h.negated && h.rule.kind !== "multi"),
  ];
  if (partner) claimed.push(partner);

  const firstAnchor = anchors[0];
  const endDate = firstAnchor?.to ?? firstAnchor?.date ?? isoOf(now);
  const rangeDays = firstAnchor?.to ? Math.round((new Date(`${firstAnchor.to}T12:00`).getTime() - new Date(`${firstAnchor.date}T12:00`).getTime()) / 86_400_000) + 1 : 1;
  const solo = !partner && SOLO_RE.test(folded) && !WE_RE.test(folded);
  const exactTimes = times.filter((t) => t.exact).map((t) => t.time);
  // A later round at an earlier clock time ("10pm and again at 1am") ran past midnight.
  const pastMidnight = (count.again || /\b(?:until|till|hasta)\b/.test(folded)) && exactTimes.length >= 2 && exactTimes[exactTimes.length - 1] < exactTimes[0];
  const exact = times.find((t) => t.exact);
  const slot = times.find((t) => !t.exact);
  const time = exact?.time ?? slot?.time ?? "21:00";
  const baseCount = count.n || (rangeDays > 1 ? rangeDays : 1);

  return {
    title,
    date: firstAnchor?.date ?? isoOf(now),
    dateStated: Boolean(firstAnchor),
    time,
    timeStated: Boolean(exact || slot),
    times: times.filter((t) => t.exact).map((t) => t.time),
    place: placeHit?.rule.value ?? "",
    count: count.again ? Math.max(baseCount, 2) : baseCount,
    nextDay: rangeDays === 1 && (nextSpans.length > 0 || pastMidnight),
    notes: remainder(text, folded, claimed),
    contraception,
    problems,
    partnerName: partner?.name ?? "",
    durationMins: duration?.mins ?? 0,
    positions,
    ...levels,
    overall,
    source: text.trim(),
    endDate,
    solo,
  };
}

// ------------------------------------------------------------------ splitting

const TITLE_RE = /^(?:(\d+)(?:st|nd|rd|th)\s+time|(\d+)\.?\s*(?:ª|º|a)?\s*vez|(primera|segunda|tercera|cuarta|quinta)\s+vez)\b\.?\s*/i;
const THROUGH = /\b(?:through|thru|until|till|to|hasta|al)\s*$/;

/** Sentence-ish pieces of one line. Keeps "Oct." "a.m." decimals and (parentheses) together. */
function sentences(line: string) {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "(") depth += 1;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (depth > 0) continue;
    if (ch === ";" || ch === "!" || ch === "?" || ch === ".") {
      if (ch === ".") {
        const before = line.slice(Math.max(0, i - 5), i).toLowerCase();
        const next = line[i + 1] ?? "";
        if (/\d$/.test(before) && /\d/.test(next)) continue;
        if (/\b(?:[ap]|[ap]\.m|oct|sept?|nov|dec|dic|jan|ene|feb|mar|apr|abr|aug|ago|jun|jul|dr|mr|mrs|st|vs|etc)$/.test(before) && next !== "\n") {
          if (/\b(?:[ap]\.m|[ap])$/.test(before) && /^\s*[A-ZÁÉÍÓÚÑ]/.test(line.slice(i + 1))) {
            // "11 p.m. Then" — a real end
          } else continue;
        }
      }
      while (i + 1 < line.length && /[.;!?)]/.test(line[i + 1])) i += 1;
      out.push(line.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < line.length) out.push(line.slice(start));
  return out.map((s) => s.trim()).filter(Boolean);
}

/** Cuts a sentence where a second, different date starts ("Oct 28 ... and Oct 29 ..."). */
function cutAtDates(sentence: string, now: Date, state: YearState) {
  const folded = fold(sentence);
  const blocked = findNumericRatings(folded);
  const anchors = findAnchors(folded, now, { ...state }, blocked);
  if (anchors.length < 2) return [sentence];
  const parts: string[] = [];
  let cursor = 0;
  let current = anchors[0].date;
  for (const anchor of anchors.slice(1)) {
    if (anchor.date === current) continue;
    if (THROUGH.test(folded.slice(Math.max(0, anchor.start - 10), anchor.start))) continue;
    // cut at the nearest clause break before this date, if any
    const lead = folded.slice(cursor, anchor.start);
    const brk = Math.max(lead.lastIndexOf(","), lead.lastIndexOf(" and "), lead.lastIndexOf(" y "), lead.lastIndexOf(" then "), lead.lastIndexOf(" luego "));
    const at = brk > 0 ? cursor + brk : anchor.start;
    const piece = sentence.slice(cursor, at).trim();
    if (piece) parts.push(piece);
    cursor = at;
    current = anchor.date;
  }
  parts.push(sentence.slice(cursor).replace(/^\s*(?:,|and\b|y\b|then\b|luego\b)\s*/i, "").trim());
  return parts.filter(Boolean);
}

/** Words that head a line with a colon but are not a partner ("Notes: …"). */
const HEAD_STOP = new Set("notes note notas nota update today hoy ayer yesterday week semana total recap summary resumen esta this last ultima mood ps".split(" "));

/** Cuts "with Ana, then later with Marco" before the second "with <another known partner>" (a clause break must lead it). */
function cutAtPartners(sentence: string, partners: string[]) {
  const folded = fold(sentence);
  const hits: { at: number; key: string }[] = [];
  for (const name of partners) {
    const key = fold(name).trim();
    if (key.length < 2) continue;
    for (const m of matches(new RegExp(`\\b(?:with|con|w/)\\s+${escapeRe(key)}(?![a-z0-9])`, "g"), folded)) hits.push({ at: m.index ?? 0, key });
  }
  hits.sort((a, b) => a.at - b.at);
  const parts: string[] = [];
  let cursor = 0;
  let current = hits[0]?.key;
  for (const hit of hits.slice(1)) {
    if (hit.key === current) continue;
    const lead = folded.slice(cursor, hit.at);
    const brk = Math.max(lead.lastIndexOf(","), lead.lastIndexOf(" and "), lead.lastIndexOf(" y "), lead.lastIndexOf(" then "), lead.lastIndexOf(" luego "));
    if (brk <= 0) continue;
    parts.push(sentence.slice(cursor, cursor + brk).replace(/[,\s]+$/, "").trim());
    cursor += brk;
    current = hit.key;
  }
  parts.push(sentence.slice(cursor).replace(/^\s*(?:,|and\b|y\b|then\b|luego\b)\s*/i, "").trim());
  return parts.filter(Boolean);
}

/** "1." "2)" "(3)" "#4" "5 -" at the start of a line: a numbered list item. */
const LIST_RE = /^\s*(?:\(\s*(\d{1,2})\s*\)|#\s*(\d{1,2})\b[.):\-–—]?|(\d{1,2})\s*[.)\-–—:](?!\d))\s*/;

/**
 * Splits numbered lists into one line per item. A line that opens with "1." (or "1)" "(1)" "#1") is cut
 * before "2." "3." … in order; a line that does not open with a marker is only cut when it holds a
 * whole run "1) … 2) …" (so "rated it 4. 2 rounds" is never read as a list).
 */
function splitLists(line: string): { text: string; item: boolean }[] {
  const lead = line.match(LIST_RE);
  const markerAt = (n: number, from: number) => {
    const re = new RegExp(`(?:^|[\\s:;,])(\\(\\s*${n}\\s*\\)|#\\s*${n}\\b[.):\\-–—]?|${n}\\s*[.)](?!\\d))\\s`, "g");
    re.lastIndex = from;
    const m = re.exec(line);
    return m ? m.index + m[0].length - m[1].length - 1 : -1;
  };
  let first = -1;
  let n = 1;
  if (lead) {
    first = 0;
    n = Number(lead[1] ?? lead[2] ?? lead[3]);
  } else {
    const one = markerAt(1, 0);
    if (one < 0 || markerAt(2, one + 2) < 0) return [{ text: line, item: false }];
    first = one;
    n = 1;
  }
  const cuts = [first];
  for (let next = n + 1; ; next += 1) {
    const at = markerAt(next, cuts[cuts.length - 1] + 2);
    if (at < 0) break;
    cuts.push(at);
  }
  const out: { text: string; item: boolean }[] = [];
  // Words before the list ("Last week:") lead into the first item rather than standing alone.
  let preamble = first > 0 ? line.slice(0, first).trim() : "";
  cuts.forEach((at, i) => {
    const piece = line.slice(at, cuts[i + 1] ?? line.length).trim().replace(LIST_RE, "").trim();
    if (!piece) return;
    out.push({ text: preamble ? `${preamble} ${piece}` : piece, item: true });
    preamble = "";
  });
  return out;
}

export function parseBatch(text: string, now = new Date(), ctx: BatchContext = {}): BatchEntry[] {
  const rules = buildRules(ctx);
  const state: YearState = { carried: null };
  const source = (text || "").normalize("NFC").replace(/\r\n?/g, "\n");
  // lines, and old-style "2nd time." / "2.ª vez" markers mid-line
  const lines = source
    .split(/\n+|(?=\b\d+(?:st|nd|rd|th)\s+time\b)|(?=\b\d+\.?\s*(?:ª|º)\s*vez\b)|(?=\b(?:primera|segunda|tercera|cuarta|quinta)\s+vez\b\.)/i)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap(splitLists)
    // A heading line ("Esta semana:") right before a numbered list leads into its first item.
    .reduce<{ text: string; item: boolean }[]>((out, line) => {
      const prev = out[out.length - 1];
      if (prev && !prev.item && line.item && /:\s*$/.test(prev.text)) out[out.length - 1] = { text: `${prev.text} ${line.text}`, item: true };
      else out.push(line);
      return out;
    }, []);

  type Draft = { title: string; parts: string[]; date: string | null; dayFirst: boolean; hint: string; partner: string };
  const drafts: Draft[] = [];
  const known = ctx.partners ?? [];
  const partnerOf = (piece: string) => findPartner(piece, fold(piece), known, [])?.name ?? "";

  for (const { text: rawLine, item } of lines) {
    let line = rawLine;
    // Spanish writes day/month (2/11 = 2 Nov): when the app is in Spanish or the line reads as Spanish.
    state.dayFirst = ctx.lang === "es" || looksSpanish(fold(line));
    // "Ana: Oct 25 twice, Oct 27 once" — a partner heading applies to every entry on the line.
    let hint = "";
    const head = line.match(/^\s*([^\s:][^:\n]{0,30}?)\s*:\s+(?=\S)/);
    if (head && !findAnchors(fold(head[1]), now, { ...state }, []).length) {
      const name = known.find((p) => fold(p).trim() === fold(head[1]).trim()) ?? (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñü]{1,20}$/.test(head[1].trim()) && !HEAD_STOP.has(fold(head[1]).trim()) && !MONTHS[fold(head[1]).trim()] && WEEKDAYS[fold(head[1]).trim()] === undefined ? head[1].trim() : "");
      if (name) {
        hint = name;
        line = line.slice(head[0].length);
      }
    }
    const titleMatch = line.match(TITLE_RE);
    const title = titleMatch ? titleMatch[0].replace(/[.\s]+$/g, "") : "";
    if (titleMatch) line = line.slice(titleMatch[0].length);
    if (!line.trim() && !title) continue;
    const pieces = sentences(line).flatMap((s) => cutAtDates(s, now, state)).flatMap((s) => cutAtPartners(s, known));
    let lineStarted = false;
    for (const piece of pieces) {
      const folded = fold(piece);
      const blocked = findNumericRatings(folded);
      const anchor = findAnchors(folded, now, { ...state }, blocked)[0] ?? null;
      const current = drafts[drafts.length - 1];
      const piecePartner = partnerOf(piece);
      const startNew = (date: string | null = anchor?.date ?? null) => {
        drafts.push({ title: lineStarted ? "" : title, parts: [piece], date, dayFirst: Boolean(state.dayFirst), hint, partner: piecePartner });
        lineStarted = true;
      };
      const join = (draft: Draft) => {
        draft.parts.push(piece);
        if (!draft.partner && piecePartner) draft.partner = piecePartner;
      };
      // A different partner on the same day is its own encounter ("Oct 25 with Ana. Oct 25 later with Marco").
      const otherPartner = (draft: Draft | undefined) =>
        Boolean(draft && draft.partner && piecePartner && fold(draft.partner) !== fold(piecePartner) &&
          ((anchor && anchor.date === draft.date) || new RegExp(`\\b(?:with|con|w/|y con|and with)\\s+${escapeRe(fold(piecePartner))}`).test(fold(piece))));
      if (!lineStarted) {
        // A new line opens a new encounter when it carries a date or a title; otherwise it continues the last one.
        if (anchor || title || item || !current || hint) startNew();
        else if (otherPartner(current)) startNew(current.date);
        else {
          join(current);
          lineStarted = true;
        }
        continue;
      }
      const open = drafts[drafts.length - 1];
      if (otherPartner(open)) {
        startNew(anchor?.date ?? open.date);
        continue;
      }
      if (!anchor) {
        join(open);
        continue;
      }
      if (!open.date) {
        open.date = anchor.date;
        join(open);
        continue;
      }
      if (anchor.date === open.date) {
        join(open);
        continue;
      }
      startNew();
    }
  }

  return drafts.map((draft) => {
    state.dayFirst = draft.dayFirst;
    const entry = readEntry(draft.parts.join(" "), draft.title, now, ctx, state, rules);
    if (!entry.partnerName && !entry.solo && draft.hint) entry.partnerName = draft.hint;
    // Split off for another partner without repeating the date: same day as the entry it came from.
    if (!entry.dateStated && draft.date) {
      entry.date = draft.date;
      entry.endDate = draft.date;
      entry.dateStated = true;
    }
    return entry;
  });
}
