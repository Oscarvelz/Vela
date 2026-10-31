import { namedPlace } from "./catalog";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export type BatchEntry = {
  title: string;
  date: string;
  time: string;
  place: string;
  count: number;
  nextDay: boolean;
  notes: string;
  contraception: string[];
  problems: string[];
};

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, ene: 1, enero: 1,
  feb: 2, february: 2, febrero: 2,
  mar: 3, march: 3, marzo: 3,
  apr: 4, april: 4, abr: 4, abril: 4,
  may: 5, mayo: 5,
  jun: 6, june: 6, junio: 6,
  jul: 7, july: 7, julio: 7,
  aug: 8, august: 8, ago: 8, agosto: 8,
  sep: 9, sept: 9, september: 9, septiembre: 9, setiembre: 9,
  oct: 10, october: 10, octubre: 10,
  nov: 11, november: 11, noviembre: 11,
  dec: 12, december: 12, dic: 12, diciembre: 12,
};

const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");

const PROBLEM_RES: { id: string; re: RegExp }[] = [
  { id: "erection", re: /\b(?:erections?|erectile|couldn'?t get (?:hard|it up)|no erection|erecci[oó]n|no se me levant\w*)\b/gi },
  { id: "climax", re: /\b(?:couldn'?t (?:finish|come|cum|orgasm)|hard to (?:finish|climax)|didn'?t (?:finish|climax)|no pude terminar|sin orgasmo|cuesta terminar)\b/gi },
  { id: "timing", re: /\b(?:too soon|premature|finished (?:too )?early|muy pronto|eyaculaci[oó]n precoz)\b/gi },
  { id: "pain", re: /\b(?:pain|painful|hurt|hurts|dolor|doli[oó])\b/gi },
  { id: "dryness", re: /\b(?:dryness|too dry|sequedad|reseca)\b/gi },
  { id: "fatigue", re: /\b(?:fatigue|exhausted|too tired|cansancio|cansad[oa]s?)\b/gi },
  { id: "connection", re: /\b(?:weak connection|no connection|disconnected|poca conexi[oó]n|sin conexi[oó]n)\b/gi },
  { id: "mood", re: /\b(?:low mood|bad mood|mal humor|mal [aá]nimo)\b/gi },
  { id: "stress", re: /\b(?:stress|stressed|estr[eé]s)\b/gi },
  { id: "distraction", re: /\b(?:distract(?:ed|ion)|distracci[oó]n|distra[ií]d[oa]s?)\b/gi },
  { id: "privacy", re: /\b(?:no privacy|little privacy|poca privacidad|sin privacidad)\b/gi },
  { id: "desire", re: /\b(?:low desire|no desire|poco deseo|sin ganas|sin deseo)\b/gi },
  { id: "period", re: /\b(?:period|menstruat\w*|periodo|regla)\b/gi },
  { id: "anxiety", re: /\b(?:anxiety|anxious|ansiedad|ansios[oa]s?)\b/gi },
  { id: "alcohol", re: /\b(?:alcohol|drunk|borrach[oa]s?)\b/gi },
  { id: "medication", re: /\b(?:medication|meds|medicaci[oó]n|medicamento)\b/gi },
  { id: "interruption", re: /\b(?:interrupt(?:ed|ion)|interrupci[oó]n|nos interrump\w*)\b/gi },
  { id: "bleeding", re: /\b(?:bleeding|bled|sangrad[oa]?)\b/gi },
  { id: "irritation", re: /\b(?:irritat(?:ed|ion|ing)|irritaci[oó]n|irritad[oa]s?)\b/gi },
];

const METHODS: { id: string; re: RegExp }[] = [
  { id: "pullout", re: /\b(?:pull[\s-]?out|withdrawal|marcha atr[aá]s|coito interrumpido)\b/gi },
  { id: "pill", re: /\b(?:the pill|pill|pills|pastilla|p[ií]ldora)\b/gi },
  { id: "condom", re: /\b(?:condom|condoms|cond[oó]n|condones)\b/gi },
  { id: "iud", re: /\b(?:iud|diu)\b/gi },
  { id: "implant", re: /\b(?:implant|implante)\b/gi },
  { id: "none", re: /\b(?:no method|none|ninguno|ninguna)\b/gi },
];

const TIMES: { re: RegExp; time: string }[] = [
  { re: /\b(?:early morning|(?:de\s+)?madrugada)\b/i, time: "05:30" },
  { re: /\b(?:late night)\b/i, time: "00:30" },
  { re: /\b(?:(?:in the\s+)?morning|(?:de\s+)?(?:mañana|manana))\b/i, time: "09:00" },
  { re: /\b(?:(?:in the\s+)?afternoon|(?:de\s+)?tarde)\b/i, time: "15:00" },
  { re: /\b(?:(?:at\s+)?night|(?:de\s+)?noche|(?:in the\s+)?evening)\b/i, time: "21:00" },
];

const COUNT_WORDS: { re: RegExp; n: number }[] = [
  { re: /\b(?:once|one time|una vez|1 vez)\b/i, n: 1 },
  { re: /\b(?:twice|two times|dos veces)\b/i, n: 2 },
  { re: /\b(?:thrice|three times|tres veces)\b/i, n: 3 },
  { re: /\b(?:four times|cuatro veces)\b/i, n: 4 },
  { re: /\b(?:five times|cinco veces)\b/i, n: 5 },
  { re: /\b(?:six times|seis veces)\b/i, n: 6 },
];

function mentionedYear(text: string) {
  const match = text.match(/\b((?:19|20)\d{2})\b/);
  return match ? Number(match[1]) : null;
}

function iso(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

const WEEKDAY_RE =
  "mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday|sun|sunday";

function fullYear(value: string, fallback: number) {
  const year = Number(value);
  if (!value) return fallback;
  if (value.length === 4) return year;
  return year <= 30 ? 2000 + year : 1900 + year;
}

function dateSpans(text: string, year: number) {
  const found: { index: number; raw: string; month: number; day: number; year: number }[] = [];
  const monthFirst = new RegExp(
    `(?:\\b(?:${WEEKDAY_RE})\\b[,.]?\\s+)?\\b(${MONTH_RE})\\b\\.?[,]?\\s*(\\d{1,2})(?:st|nd|rd|th)?\\.?(?:,\\s*(\\d{4}|\\d{2})|\\s+(\\d{4}))?`,
    "gi",
  );
  const dayFirst = new RegExp(
    `\\b(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(?:de|of))?\\s+(${MONTH_RE})\\b\\.?[,]?\\s*((?:19|20)\\d{2})?`,
    "gi",
  );
  const numeric = /\b(\d{1,4})([./-])(\d{1,2})\2(\d{2,4})\b/g;
  for (const match of text.matchAll(monthFirst)) {
    const month = MONTHS[match[1].toLowerCase()];
    const day = Number(match[2]);
    if (!month || day < 1 || day > 31) continue;
    found.push({
      index: match.index ?? 0,
      raw: match[0],
      month,
      day,
      year: fullYear(match[3] || match[4] || "", year),
    });
  }
  for (const match of text.matchAll(dayFirst)) {
    const month = MONTHS[match[2].toLowerCase()];
    const day = Number(match[1]);
    if (!month || day < 1 || day > 31) continue;
    found.push({
      index: match.index ?? 0,
      raw: match[0],
      month,
      day,
      year: match[3] ? fullYear(match[3], year) : year,
    });
  }
  for (const match of text.matchAll(numeric)) {
    const first = match[1];
    const sep = match[2];
    const second = Number(match[3]);
    const third = match[4];
    let month = 0;
    let day = 0;
    let used = year;
    if (first.length === 4) {
      used = Number(first);
      month = second;
      day = Number(third);
    } else {
      const a = Number(first);
      const b = second;
      used = fullYear(third, year);
      if (a > 12 && b <= 12) {
        day = a;
        month = b;
      } else if (b > 12 && a <= 12) {
        month = a;
        day = b;
      } else if (sep === ".") {
        day = a;
        month = b;
      } else {
        month = a;
        day = b;
      }
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    found.push({ index: match.index ?? 0, raw: match[0], month, day, year: used });
  }
  found.sort((left, right) => left.index - right.index || right.raw.length - left.raw.length);
  const kept: typeof found = [];
  let end = -1;
  for (const item of found) {
    if (item.index < end) continue;
    kept.push(item);
    end = item.index + item.raw.length;
  }
  return kept;
}

function findDate(text: string, year: number) {
  return dateSpans(text, year)[0] ?? null;
}

function findCount(text: string) {
  const numeric = [...text.matchAll(/\b(\d+)\s*(?:times|veces|x)\b/gi)];
  if (numeric.length) return Math.min(12, Math.max(1, Number(numeric[numeric.length - 1][1])));
  for (const word of COUNT_WORDS) if (word.re.test(text)) return word.n;
  return 0;
}

function findProblems(text: string) {
  const found: string[] = [];
  for (const problem of PROBLEM_RES) {
    if (problem.re.test(text)) found.push(problem.id);
    problem.re.lastIndex = 0;
  }
  return found;
}

function findMethods(text: string) {
  const found: string[] = [];
  for (const method of METHODS) {
    if (method.re.test(text)) found.push(method.id);
    method.re.lastIndex = 0;
  }
  return found;
}

function stripMethods(text: string) {
  let next = text;
  for (const method of METHODS) {
    next = next.replace(method.re, " ");
    method.re.lastIndex = 0;
  }
  return next
    .replace(/\b(?:and|y)\b(?=\s*(?:[.,;)]|$))/gi, " ")
    .replace(/(?:^|[.,;(]\s*)\b(?:and|y)\b/gi, " ");
}

function cleanNotes(text: string) {
  return text
    .replace(/\b(?:once|twice|thrice|one time|two times|three times|four times|five times|six times|\d+\s*(?:times|veces|x)|una vez|dos veces|tres veces|cuatro veces|cinco veces|seis veces|\d+\s*vez)\b/gi, " ")
    .replace(/\b(?:the\s+)?next day\b|\bfollowing day\b|\bal d[ií]a siguiente\b/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*([,;])\s*/g, "$1 ")
    .replace(/(?:[;,]\s*){2,}/g, "; ")
    .replace(/^[\s,;.\-]+|[\s,;.\-]+$/g, "")
    .trim();
}

function parseEntry(raw: string, year: number): { entry: BatchEntry; year: number } | null {
  let text = raw.trim();
  const titleMatch = text.match(
    /^(?:(\d+)(?:st|nd|rd|th)\s+time|(\d+)\.?\s*(?:ª|º|a)?\s*vez|(primera|segunda|tercera|cuarta|quinta)\s+vez)\b\.?\s*/i,
  );
  const title = titleMatch ? titleMatch[0].replace(/[.\s]+$/g, "") : "";
  if (titleMatch) text = text.slice(titleMatch[0].length);
  const date = findDate(text, mentionedYear(text) ?? year);
  if (!date) return null;
  text = text.replace(date.raw, " ").replace(/\b(?:19|20)\d{2}\b/g, " ");
  let time = "21:00";
  for (const slot of TIMES) {
    const found = text.match(slot.re);
    if (!found) continue;
    time = slot.time;
    text = text.replace(found[0], " ");
    break;
  }
  const parens = [...text.matchAll(/\(([^)]*)\)/g)].map((match) => match[1]);
  text = text.replace(/\([^)]*\)/g, " ");
  let details = parens.join("; ");
  const contraception = findMethods(`${text} ${details}`);
  const problems = findProblems(`${raw}`);
  text = stripMethods(text);
  details = stripMethods(details);
  const count = findCount(details) || findCount(raw) || 1;
  const nextDay = /\b(?:the\s+)?next day\b|\bfollowing day\b|\bal d[ií]a siguiente\b/i.test(`${details} ${text}`);
  const clauses = text
    .split(/(?<=\.)\s+/)
    .map((clause) =>
      clause
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^(?:(?:at|en(?:\s+el|\s+la)?|de|in(?:\s+the)?)\s+)+/i, "")
        .replace(/[()]/g, " ")
        .replace(/\s{2,}/g, " ")
        .replace(/^(?:and|y)\s+/i, "")
        .replace(/\s+(?:and|y)$/i, "")
        .replace(/^[.\s,;]+|[.\s,;]+$/g, "")
        .trim(),
    )
    .filter((clause) => clause && !/^(?:and|y)$/i.test(clause));
  const spotted = namedPlace(raw);
  const place = spotted || clauses[0] || "";
  const notes = [cleanNotes(details), ...clauses.slice(1).map((clause) => cleanNotes(clause))]
    .filter(Boolean)
    .join(". ")
    .replace(/\.\s*\./g, ".")
    .trim();
  return {
    year: date.year,
    entry: {
      title,
      date: iso(date.year, date.month, date.day),
      time,
      place,
      count,
      nextDay,
      notes,
      contraception,
      problems,
    },
  };
}

export function parseBatch(text: string, now = new Date()): BatchEntry[] {
  const chunks = text
    .split(/\n+|(?=\b\d+(?:st|nd|rd|th)\s+time\b)|(?=\b\d+\.?\s*(?:ª|º|a)\s*vez\b)|(?=\b(?:primera|segunda|tercera|cuarta|quinta)\s+vez\b)/i)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  let year = now.getFullYear();
  const entries: BatchEntry[] = [];
  for (const chunk of chunks.flatMap(splitLaterDates)) {
    const stated = mentionedYear(chunk);
    if (stated) year = stated;
    const parsed = parseEntry(chunk, year);
    if (!parsed) {
      const last = entries[entries.length - 1];
      if (last) foldExtra(last, chunk);
      continue;
    }
    year = parsed.year;
    entries.push(parsed.entry);
  }
  return entries;
}

function splitLaterDates(chunk: string) {
  const marks = dateSpans(chunk, 2000)
    .slice(1)
    .map((span) => span.index);
  if (marks.length === 0) return [chunk];
  const parts: string[] = [];
  let cursor = 0;
  for (const index of marks) {
    const before = chunk.slice(cursor, index).trim();
    if (before) parts.push(before);
    cursor = index;
  }
  const rest = chunk.slice(cursor).trim();
  if (rest) parts.push(rest);
  return parts.length ? parts : [chunk];
}

function foldExtra(entry: BatchEntry, extra: string) {
  const extraCount = findCount(extra);
  if (extraCount > entry.count) entry.count = extraCount;
  if (/\b(?:the\s+)?next day\b|\bfollowing day\b|\bal d[ií]a siguiente\b/i.test(extra)) entry.nextDay = true;
  for (const id of findMethods(extra)) {
    if (!entry.contraception.includes(id)) entry.contraception.push(id);
  }
  for (const id of findProblems(extra)) {
    if (!entry.problems.includes(id)) entry.problems.push(id);
  }
  const spotted = namedPlace(extra);
  if (spotted) entry.place = spotted;
  const note = cleanNotes(stripMethods(extra).replace(/\b(?:19|20)\d{2}\b/g, " "));
  if (note) entry.notes = [entry.notes, note].filter(Boolean).join(". ");
}
