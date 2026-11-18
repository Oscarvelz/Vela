/* The pregnancy reader (2.2.7; rebuilt 2.2.25 under the prejudice cure,
   Wave 3) — Oscar's order: the app becomes really good at spotting when
   her own words already state a pregnancy or a pregnancy test, in the
   first person or the third ("she got pregnant", "she did a pregnancy
   test — two were negative and one was positive"), English and Spanish.
   What it finds is never written silently: the batch door shows it as a
   proposal with the exact clause as evidence (the 2.2.4 law), and
   keeping it records the cycle's reason, so the end-of-cycle question —
   which exists to ask what the journal does not know — never needs to
   ask what she already said. Wishes, fears and tries are not statements:
   "trying to get pregnant", "afraid she might be", "not pregnant" all
   read as silence here.
 *
 * The rebuild's laws, learned specimen by specimen (RT-V2/V2M):
 * - Every pattern is written against FOLDED text, so a pattern that
 *   names a curly apostrophe can never match anything (M1): negations
 *   use the straight form fold() produces.
 * - A veto (negation, wish, fear, condition) reaches only its own
 *   proposition: it is judged in the segment before the match, bounded
 *   by commas and scope-break words — a fear at the end of a sentence
 *   no longer erases a fact stated at its start (M4).
 * - A result word counts only inside a result frame — a copula or a
 *   count ("was", "came back", "two were", "both") — so an attitude
 *   ("she stayed positive") is never a test (M6).
 * - Tests are events, not clauses: a result stated in the next sentence
 *   belongs to the test it follows or precedes (M5), counts stated at a
 *   distance distribute over a single result (M7), a test the words
 *   date is recorded on its own date (M9), and a test about somebody
 *   else (her sister) is not hers at all (P4).
 * - Findings carry a `clean` flag: stated directly, in one clause, with
 *   nothing inferred. The batch door saves clean findings with the
 *   import; the rest are shown, never saved (Decision 1). */
import { fold } from "./batch";
import { MONTHS, NUMBER_WORDS } from "./batch-lexicon";
import { finiteStamp, isRealDate } from "./dates";
import type { PregnancyTestEvent } from "./types";
import { ANIMALS, CORRECTION_SRC, DETERMINERS_SRC, RELATION_WORDS, RELATIONS_SRC, TITLES } from "./kinship";

export function newTestId(): string {
  return `pt-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

/* The bare Spanish test nouns join (Round 4, P4-9): "el test dio
 * positivo" and "salio positivo el examen" opened no event — the
 * noun list demanded the full "prueba de embarazo" while the
 * result frames were already listening. The article keeps the
 * English school-test reading out. */
const TEST_NOUN_SRC = "pregnancy tests?|tests? for pregnancy|pruebas? de embarazo|tests? de embarazo|pruebas? caseras? de embarazo|tests? caseros? de embarazo|(?:el|la|un|una)\\s+tests?\\b|examen(?:es)?";
const TEST_NOUN = new RegExp(`\\b(${TEST_NOUN_SRC})\\b`);
/* Negation before the fact kills it ("I'm not pregnant", "no estoy…").
 * Straight apostrophe only: fold() straightens the text's apostrophes,
 * so a curly one here would be dead code (RT-V2M M1). Round 2 added
 * tampoco (the "not either" the list was missing — "tampoco salio
 * positiva" filed a clean positive) and the nobody/nadie subjects. */
/* Denial rides with negation (Round 3, P3-6): "she denies she is
 * pregnant" states the opposite of the fact, more strongly than a
 * doubt — a veto list without a denial verb filed it CLEAN. */
/* The contraction family rides as whole words, the way the batch
 * lexicon lists them: the bare "n't" this list used to carry can
 * never match — no word boundary stands before the n of "didn't" —
 * so every contracted negation ("she didn't take a test", "she isn't
 * pregnant") passed the veto unseen until Round 3's fence pressed it
 * (P3-7's root). */
const NEGATED = /\b(no|not|never|none|nobody|nunca|jamas|sin|ninguna?|ninguno|nadie|tampoco|didnt|didn't|dont|don't|doesnt|doesn't|wasnt|wasn't|werent|weren't|isnt|isn't|arent|aren't|hadnt|hadn't|havent|haven't|couldnt|couldn't|wouldnt|wouldn't|cant|can't|wont|won't|denies|denied|denying|niega|niegan|nego|desmiente|desmintio)\b/;
/* Wishes, fears, tries, suspicions and beliefs state no fact. Judged
 * only in the match's own segment (see scopeBefore), never clause-wide.
 * Round 2: the veto knew the first person ("espero", "temo") and the
 * bare stems ("hope", "fear") but not the third-person shapes people
 * actually write about her — hopes, fears, guess, espera, teme — nor
 * "me pregunto si", whose si sits mid-segment where the if-veto
 * cannot see it. */
/* Round 3 (P3-5): the ring beyond the pinned verbs — doubt, assumption,
 * seeming and wondering, in both languages, file CLEAN without these.
 * "feels" belongs here only as the belief shape ("she feels she is
 * pregnant"); the veto reaches a declaration in its own segment, which
 * is where that shape lives. */
/* Round 4 (P4-6): reported speech joins the uncertainty family —
 * "dicen que esta embarazada" is a rumor, and it filed as fact. */
const UNCERTAIN = /\b(trying|try|hope|hopes|hoping|wish|wishes|afraid|scared|fear|fears|guess|guesses|maybe|might|perhaps|suspect|suspects|suspected|thinks|believes|doubts?|assumes?|assumed|wonders?|wondered|reckons?|feels?|supposedly|dicen|se dice|se rumora|they say|rumored|tratando|intentando|buscando|espero|espera|esperan|esperanza|ojala|miedo|temo|teme|temen|pregunto|preguntaba|se pregunta|quizas|tal vez|puede que|sospech\w*|piensa|cree|dudas?|dudan|asume|asumen|supuestamente|al parecer|parece|parecen)\b/;
/* A test about somebody else is not the journal owner's test (P4).
 * Round 3 rebuilt the list as determiner × relation (P3-1/P3-2): the
 * enumerative phrases were the disease — "mi hermana", "my mother",
 * the niece, the roommate and the neighbor were never written, phrase
 * by phrase, while their listed twins were refused. Round 4: the
 * vocabulary itself moved to kinship.ts, where the batch reader
 * reads the same words — two lists claiming to be one was the next
 * disease (P4-1/B4-1). */
const OTHER_SUBJECT = new RegExp(`\\b(?:${DETERMINERS_SRC})\\s+(?:${RELATIONS_SRC})\\b`);
/* The recipient named AFTER the noun (Round 4, P4-5): a test bought
 * FOR the sister is the sister's, though the segment before the noun
 * names nobody. */
const RECIPIENT_AFTER = new RegExp(`\\b(?:for|para|a)\\s+(?:${DETERMINERS_SRC})\\s+(?:${RELATIONS_SRC})\\b`);

const DECLARATIONS: RegExp[] = [
  /\bi(?:'m| am) pregnant\b/,
  /\bshe(?:'s| is| got| became| fell) pregnant\b/,
  /\bi fell pregnant\b/,
  /\bmy (?:wife|partner|girlfriend) (?:is|got|became) pregnant\b/,
  /\bmy (?:wife|partner|girlfriend) (?:is|'s) expecting\b/,
  /\bwe(?:'re| are) pregnant\b/,
  /\bwe(?:'re| are) expecting\b/,
  /\bi(?:'m| am) expecting\b/,
  /\bshe(?:'s| is) expecting\b/,
  /\bestoy embarazada\b/,
  /* The Spanish expecting form (Round 4, P4-9): "estoy esperando
   * un bebe" stated the fact and the declarations never heard it. */
  /\b(?:estoy|estamos) esperando un bebe\b/,
  /\bi(?:'m| am) expecting a baby\b/,
  /\bquedo embarazada\b/,
  /\bquede embarazada\b/,
  /\bse embarazo\b/,
  /\bsalio embarazada\b/,
  /\bsali embarazada\b/,
  /\bestamos embarazadas?\b/,
];
/* The bare Spanish declaration ("esta embarazada") carries no subject
 * of its own, so it is judged separately, against the subject the
 * segment actually names (P3-11). */
const BARE_ESTA = /\besta embarazada\b/;
/* A named third person ("Ana is pregnant", "Lucía got pregnant"): any
 * subject word that is not a thing or a pronoun already covered above. */
const NAMED_DECLARATION = /\b(?!it\b|this\b|that\b|test\b|result\b|she\b|he\b|what\b)([a-z]+) (?:is|got|became) pregnant\b/;

const RESULT_OF = (word: string): "positive" | "negative" => (word.startsWith("pos") ? "positive" : "negative");
/* A result clause that may attach to a test event across a sentence
 * break must be ABOUT a test: it opens with a pronoun standing for the
 * test, the test/result noun, a count, or — in Spanish — the bare
 * result verb. A clause that opens by naming something else ("her
 * attitude was positive", "her covid test was negative") states that
 * thing's result, not a pregnancy test's (Round 2). */
const TEST_SHAPED = /^\s*(it|that|this|they|the tests?|the results?|the second|result|la prueba|el resultado|los resultados|las|los|se|fue|fueron|salio|salieron|dio|dieron|resulto|resultaron|era|eran|positiv|negativ|one|two|three|four|five|both|all|una|dos|tres|cuatro|cinco|ambas|ambos|todas|todos)\b/;
/* A result word speaks only inside a result frame: a copula or result
 * verb just before it, a count or totality word just before it, a label
 * colon, or the adjective place right before the test noun ("a positive
 * pregnancy test"). "She stayed positive" has none of these (M6). */
/* Round 3 (P3-9): the display verbs joined the frame — "it showed
 * positive", "it read positive", "marcó positivo" were silence. */
const RESULT_FRAME = /(?:was|were|is|are|came|turned|result|showed|read|fue|fueron|era|eran|salio|salieron|resulto|resultaron|dio|dieron|quedo|quedaron|marco)\s+(?:back\s+|out\s+)?$|(?:one|two|three|four|five|both|all|una?|dos|tres|cuatro|cinco|ambas|ambos|todas|todos|las|los)\s+$|[:—-]\s*$/;
const TOTALITY_FOR_RESULT = /\b(both|all|todas|todos|ambas|ambos|las dos|los dos)\s+(?:were\s+|fueron\s+|salieron\s+|eran\s+|fue\s+|was\s+|came\s+back\s+)?(positiv|negativ)|\b(positiv|negativ)[a-z]*\s+(?:both|all|todas|todos|ambas|ambos)\b/;

/** The match's own segment: the text since the last comma or
 * scope-break word. A veto lives and dies inside it (M4). */
function scopeBefore(folded: string, index: number) {
  const before = folded.slice(0, index);
  let start = Math.max(before.lastIndexOf(","), before.lastIndexOf(";"), before.lastIndexOf("(")) + 1;
  for (const m of before.matchAll(/\b(but|pero|and|y|e|though|although|aunque|while|mientras|because|porque|then|entonces)\b/g)) {
    start = Math.max(start, (m.index ?? 0) + m[0].length);
  }
  return before.slice(start);
}

function vetoed(folded: string, index: number) {
  const scope = scopeBefore(folded, index);
  /* "Not only" is an emphasis, not a negation (Round 4, P4-10):
   * batch's NOT_NEGATION has carried the exception for rounds; the
   * veto judges the scope with the phrase lifted out. */
  const negScope = scope.replace(/\bnot only\b/g, " ");
  if (NEGATED.test(negScope) || UNCERTAIN.test(scope)) return true;
  if (/\bif\b/.test(scope)) return true; // a conditional governs its segment
  if (/\bwhether\b/.test(scope)) return true; // "wonders whether she is…" — a question, not a statement (P3-5)
  if (/^\s*si\b/.test(scope)) return true; // "si esta embarazada, …" — si as the segment's first word is "if"
  return false;
}

const SEGMENT_BREAK = /\b(but|pero|and|y|e|though|although|aunque|while|mientras|because|porque|then|entonces)\b/g;

/** The whole segment a match lives in — scopeBefore's start, and the
 * next comma or scope-break word after the match as its end. A
 * declaration is judged against its segment: "her sister is pregnant"
 * is a statement about the sister, and the reader used to file it as
 * hers because declarations never consulted OTHER_SUBJECT (Round 2). */
function segmentBounds(folded: string, index: number, length: number): [number, number] {
  const before = folded.slice(0, index);
  let start = Math.max(before.lastIndexOf(","), before.lastIndexOf(";"), before.lastIndexOf("(")) + 1;
  for (const m of before.matchAll(SEGMENT_BREAK)) start = Math.max(start, (m.index ?? 0) + m[0].length);
  let end = folded.length;
  const rest = folded.slice(index + length);
  const comma = rest.search(/[,;(]/);
  if (comma >= 0) end = Math.min(end, index + length + comma);
  for (const m of rest.matchAll(SEGMENT_BREAK)) { end = Math.min(end, index + length + (m.index ?? 0)); break; }
  return [start, end];
}

function segmentAround(folded: string, index: number, length: number) {
  const [start, end] = segmentBounds(folded, index, length);
  return folded.slice(start, end);
}

/* Subjects that can never carry a named declaration: the relation
 * vocabulary and the animals are common nouns, not names — and at the
 * START of a sentence the capital witness cannot tell them apart
 * (Round 3, P3-4: "Sister is pregnant", "Cow is pregnant" filed as
 * named people). One shared table judges every subject door. */
const COMMON_SUBJECT = new Set([...RELATION_WORDS, ...ANIMALS, ...TITLES, "nobody", "nadie"]);

/** A named declaration ("Ana is pregnant") names a person: the subject
 * must stand capitalized in the words as written — fold() erases case,
 * so the raw clause is the witness. A lowercase common noun in subject
 * place ("my dog is pregnant", "sister is pregnant") is not a name. */
function nameShaped(rawClause: string, foldedSubject: string) {
  if (COMMON_SUBJECT.has(foldedSubject)) return false;
  const m = rawClause.match(/\b([A-Za-zÀ-ÿ]+)\s+(?:is|got|became)\s+pregnant\b/i);
  if (!m) return false;
  return m[1].toLocaleLowerCase() === foldedSubject && /^[A-ZÀ-Þ]/.test(m[1]);
}

/** The subject a bare "esta embarazada" actually names: the HEAD of
 * its noun phrase — the first content word before it in its segment,
 * articles, possessives and the de-phrase skipped. The old reading
 * took the LAST content word (Round 4, P4-4): "la gata del vecino
 * esta embarazada" judged "vecino" and filed the cat as the partner.
 * The head noun is the subject; what follows a "de" only possesses
 * it. */
function animalSubject(folded: string, index: number) {
  const words = scopeBefore(folded, index).split(/\s+/).filter(Boolean);
  const skip = new Set(["la", "el", "una", "un", "su", "mi", "tu", "esa", "ese", "the", "a", "an", "her", "his", "my", "their", "las", "los", "sus", "nuestra", "nuestro", "our"]);
  for (const word of words) {
    if (skip.has(word)) continue;
    return ANIMALS.includes(word);
  }
  return false;
}

function countValue(token: string): number {
  if (/^\d+$/.test(token)) return Math.max(1, Math.min(9, parseInt(token, 10)));
  return NUMBER_WORDS[token] ?? 1;
}

function countBefore(clause: string, index: number): number {
  const before = clause.slice(0, index);
  const m = before.match(/(\d+|one|two|three|four|five|six|seven|eight|nine|ten|una?|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+(?:were\s+|was\s+|fueron\s+|salieron\s+|eran\s+|fue\s+|es\s+|all\s+were\s+|both\s+were\s+)?$/);
  if (!m) return 1;
  // A day number inside a stated date is not a count: "the pregnancy
  // test on Dec 25 was positive" files ONE test (Wave 3 re-hunt RH6).
  // Neither is a year: "on Nov 3, 2024 was positive" filed NINE tests
  // dated this year — the count clamp read the year as a quantity
  // (Round 2).
  if (/^\d{4}$/.test(m[1])) return 1;
  if (/^\d+$/.test(m[1])) {
    const numStart = before.length - m[0].length + m[0].indexOf(m[1]);
    const pre = before.slice(Math.max(0, numStart - 16), numStart);
    if (new RegExp(`(?:${Object.keys(MONTHS).join("|")})\\s+$`).test(pre)) return 1;
  }
  return countValue(m[1]);
}

function countAfter(clause: string, index: number, wordLength: number): number | null {
  const after = clause.slice(index + wordLength, index + wordLength + 16);
  const m = after.match(/^\s*(twice|one time|two times|three times|four times|una vez|dos veces|tres veces|cuatro veces)\b/);
  if (!m) return null;
  if (m[1] === "twice") return 2;
  return countValue(m[1].split(" ")[0]);
}

/** The count the words give the test event itself ("a pregnancy test
 * twice", "two pregnancy tests", "tres pruebas"). */
function eventCount(text: string): number {
  const twice = text.match(/\b(?:tests?|pruebas?)\s+twice\b/);
  if (twice) return 2;
  const after = text.match(/\b(?:tests?|pruebas?)\b[^.;]{0,24}?(\d+|one|two|three|four|five|six|una?|dos|tres|cuatro|cinco|seis)\s+(?:times|veces)\b/);
  if (after) return countValue(after[1]);
  const before = text.match(/(\d+|one|two|three|four|five|una?|dos|tres|cuatro|cinco)\s+(?:pregnancy\s+)?(?:tests?|pruebas?)\b/);
  if (before) return countValue(before[1]);
  return 1;
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* Days are not test counts: "20 days ago" is twenty days. The count
 * clamp (at most nine) belongs to quantities of tests; a span of days
 * gets its own reading, bounded by a year (Round 2 — both relative
 * specimens landed on the same wrong day, nine back). */
function dayCount(token: string): number {
  if (/^\d+$/.test(token)) return Math.max(0, Math.min(366, parseInt(token, 10)));
  return NUMBER_WORDS[token] ?? 1;
}

/** A date the words themselves give the test ("last week", "hace tres
 * días", "on Nov 3") — never later than the entry that reports it (M9).
 * A year the words state is honored ("Nov 3, 2024", "3 de noviembre de
 * 2024"): the reader used to drop it and file the test in the entry's
 * year (Round 2). */
function shiftMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T12:00:00`);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function statedDate(text: string, entryDate: string): string {
  if (/\blast week\b|\bla semana pasada\b/.test(text)) return shiftDate(entryDate, -7);
  if (/\byesterday\b|\bayer\b/.test(text)) return shiftDate(entryDate, -1);
  /* Month frames (Round 4, P4-8): "last month", "hace un mes" and
   * "a week ago" were unheard, so real tests were dated to the
   * entry day. Judged before the week/day spans. */
  if (/\blast month\b|\bel mes pasado\b/.test(text)) return shiftMonths(entryDate, -1);
  const months = text.match(/\b(\d+|one|two|three|four|five|six|una?|dos|tres|cuatro|cinco|seis)\s+months?\s+ago\b|\bhace\s+(\d+|one|two|three|four|five|six|una?|dos|tres|cuatro|cinco|seis)\s+mes(?:es)?\b/);
  if (months) return shiftMonths(entryDate, -dayCount(months[1] || months[2]));
  if (/\ba week ago\b|\bhace una semana\b/.test(text)) return shiftDate(entryDate, -7);
  /* Week-spans are dates too (Round 3, P3-12): "two weeks ago" fell
   * back to the entry date while "last week" was heard. */
  const weeks = text.match(/\b(\d+|one|two|three|four|five|six|seven|una?|dos|tres|cuatro|cinco|seis|siete)\s+weeks?\s+ago\b|\bhace\s+(\d+|one|two|three|four|five|six|seven|una?|dos|tres|cuatro|cinco|seis|siete)\s+semanas?\b/);
  if (weeks) return shiftDate(entryDate, -7 * dayCount(weeks[1] || weeks[2]));
  const days = text.match(/\b(\d+|one|two|three|four|five|six|seven|una?|dos|tres|cuatro|cinco|seis|siete)\s+days?\s+ago\b|\bhace\s+(\d+|one|two|three|four|five|six|seven|una?|dos|tres|cuatro|cinco|seis|siete)\s+dias?\b/);
  if (days) return shiftDate(entryDate, -dayCount(days[1] || days[2]));
  const entryYear = Number(entryDate.slice(0, 4));
  const named = text.match(new RegExp(`\\b(${Object.keys(MONTHS).join("|")})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b|\\b(\\d{1,2})\\s+(?:de\\s+)?(${Object.keys(MONTHS).join("|")})\\b`));
  if (named) {
    const month = MONTHS[named[1] ?? named[4]];
    const day = Number(named[2] ?? named[3]);
    const yearTail = text.slice((named.index ?? 0) + named[0].length, (named.index ?? 0) + named[0].length + 12);
    const statedYear = yearTail.match(/^\s*,?\s*(?:de\s+|del\s+)?((?:19|20)\d{2})\b/);
    if (statedYear) {
      const iso = `${statedYear[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (isRealDate(iso) && iso <= entryDate) return iso;
    }
    for (const year of [entryYear, entryYear - 1]) {
      const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (isRealDate(iso) && iso <= entryDate) return iso;
    }
  }
  return entryDate;
}

export type PregnancyReading = {
  /** The earliest stated pregnancy (declaration or positive test), if any. */
  reason: { date: string; evidence: string; clean: boolean } | null;
  /** Test events in her words, counts as stated. `clean` = stated
   * directly in one clause; the batch door saves only clean findings. */
  tests: (Omit<PregnancyTestEvent, "id" | "createdAt"> & { clean: boolean })[];
};

type ClauseResult = { result: "positive" | "negative"; count: number };

/* A correction inside the clause ("it was positive, no wait, it was
 * negative", "salio positiva, mejor dicho, salio negativa"): the last
 * word is the testimony. The reader used to save both (Round 2).
 * Round 3 (P3-8): the marker list reached parity with the batch
 * reader — "i mean" and the bare "wait" correct here too. */
const CORRECTION = new RegExp(`\\b(${CORRECTION_SRC})\\b`, "g");
/* A result word directly before one of these nouns is that noun's
 * adjective, not a test's verdict: "it was positive news all week"
 * waited in the orphan slot and the next test noun adopted it
 * (Round 3, P3-14). */
const ATTRIBUTIVE_AFTER = new Set(["news", "attitude", "energy", "vibes", "outlook", "thoughts", "thinking", "feeling", "feelings", "day", "week", "month", "year", "time", "morning", "night"]);

/** The valid results one clause states, each with its count. */
function clauseResults(folded: string): ClauseResult[] {
  const found: (ClauseResult & { index: number; framed: boolean })[] = [];
  for (const r of folded.matchAll(/(positiv|negativ)([a-z]*)/g)) {
    const index = r.index ?? 0;
    if (vetoed(folded, index)) continue;
    const afterWord = folded.slice(index + r[0].length).match(/^\s+([a-z]+)/)?.[1];
    if (afterWord && ATTRIBUTIVE_AFTER.has(afterWord)) continue;
    const segment = scopeBefore(folded, index);
    const afterNoun = new RegExp(`^\\s*(?:${TEST_NOUN_SRC})\\b`).test(folded.slice(index + r[0].length, index + r[0].length + 24));
    /* The inverted copula (Round 4, P4-10): "not only WAS THE
     * PREGNANCY TEST positive" — the emphasis puts the copula
     * before the noun, so no frame stands adjacent to the result.
     * The copula + article + test noun closing the segment is the
     * frame, read backwards. */
    const inverted = new RegExp(`\\b(?:was|were|fue|era|es)\\s+(?:the|a|an|el|la|una?)\\s+(?:${TEST_NOUN_SRC})\\s*$`).test(segment);
    const result = RESULT_OF(r[1]);
    const count = countAfter(folded, index, r[0].length) ?? countBefore(folded, index);
    found.push({ result, count, index, framed: RESULT_FRAME.test(segment) || inverted || afterNoun });
  }
  // Last word wins: a result stated before a correction marker is the
  // sentence she took back — it survives only if nothing follows it.
  let lastCorrection = -1;
  for (const m of folded.matchAll(CORRECTION)) lastCorrection = m.index ?? -1;
  const kept = lastCorrection >= 0 && found.some((r) => r.index > lastCorrection)
    ? found.filter((r) => r.index > lastCorrection)
    : found;
  /* A corrected result inherits the frame of the result it corrects
   * (Round 3, P3-8's seam): "it was positive, i mean negative" — the
   * marker ate the copula, so the corrected word stands frameless in
   * its own segment while the frame sits behind the marker. When only
   * a correction marker (and at most a fresh copula) lies between the
   * two results, the second speaks in the first's frame. */
  const out: ClauseResult[] = [];
  for (const r of kept) {
    if (r.framed) { out.push({ result: r.result, count: r.count }); continue; }
    const prev = found.filter((p) => p.index < r.index && p.framed).pop();
    if (prev) {
      const between = folded.slice(prev.index, r.index).replace(/(positiv|negativ)[a-z]*/g, " ");
      if (/^[\s,]*(no wait|i mean|wait|actually|mejor dicho|digo|correction|perdon)?[\s,]*$/.test(between)) {
        out.push({ result: r.result, count: r.count });
        continue;
      }
    }
    // Unframed and uncorrected: not a verdict (the M6 law stands).
  }
  return out;
}

/** Reads the parsed entries' original text, entry by entry, so every
 *  statement carries the date of the entry it was found in — or the
 *  date the words give it. */
export function readPregnancy(entries: { date: string; source: string; notes: string }[]): PregnancyReading {
  let reason: PregnancyReading["reason"] = null;
  const tests: PregnancyReading["tests"] = [];
  const noteReason = (date: string, evidence: string, clean: boolean) => {
    if (!reason || date < reason.date) reason = { date, evidence, clean };
  };
  for (const entry of entries) {
    const raw = entry.source || entry.notes || "";
    if (!raw) continue;
    const clauses = raw.split(/[.;\n]+/).map((c) => c.trim()).filter(Boolean);
    // Test events: a noun clause plus the result clauses that belong to
    // it, in either order (M5). Orphan results wait for their noun.
    type Event = { text: string; results: (ClauseResult & { clean: boolean })[]; evidence: string };
    let open: Event | null = null;
    let orphans: (ClauseResult & { clean: boolean })[] = [];
    let orphanText = "";
    /* A test that belonged to somebody else leaves a dead event behind:
     * the results that trail it are hers (the sister's), and the next
     * live test must not adopt them (Round 2 — "her sister took a
     * pregnancy test. it was positive. she took a pregnancy test."
     * filed the sister's positive as the owner's). */
    let dead = false;
    /* Events close into a per-entry buffer and flush at the entry's
     * end (Round 3, P3-8): a correction stated in its own clause —
     * "no wait, it was negative" — reaches back and replaces the
     * results of the event it corrects, which may already be closed.
     * Distribution and dating judge the final results, at the flush. */
    const entryEvents: Event[] = [];
    const closeEvent = () => {
      if (!open) return;
      const ev = open;
      open = null;
      if (ev.results.length) entryEvents.push(ev);
    };
    const flushEntry = () => {
      for (const ev of entryEvents) {
        const date = statedDate(fold(ev.text), entry.date);
        // A count the words give the whole event distributes over a
        // single stated result ("test twice, both negative") (M7). The
        // totality word must belong to the result: "both times in the
        // morning" is a totality of times, not of outcomes, and the
        // reader used to distribute over it (Round 2).
        const text = fold(ev.text);
        const totalityMatch = text.match(TOTALITY_FOR_RESULT);
        const totalityCount = totalityMatch && /\b(both|ambas|ambos|las dos|los dos)\b/.test(totalityMatch[0]) ? 2 : 1;
        const total = Math.max(eventCount(text), totalityCount);
        const kinds = new Set(ev.results.map((r) => r.result));
        /* Round 3 (P3-10): a plural RESULT frame distributes too —
         * "two tests, they were positive", "salieron positivas" state
         * the pair's verdict without a totality word, and the Round 2
         * narrowing filed them as one test. */
        const pluralFrame = /\b(they were|the results? (?:were|fueron)|fueron|salieron|resultaron|eran)\s+(positiv|negativ)/.test(text);
        const distribute = total > 1 && kinds.size === 1 && (totalityMatch !== null || pluralFrame || totalityCount > 1);
        for (const r of ev.results) {
          // A totality-backed distribution ("twice, both negative") is
          // fully stated by the words, so the finding stays clean; only
          // cross-clause assembly makes a finding less direct.
          const count = distribute ? Math.max(r.count, total) : r.count;
          tests.push({ date, result: r.result, count, evidence: ev.evidence, clean: r.clean });
          if (r.result === "positive") noteReason(date, ev.evidence, r.clean);
        }
      }
      entryEvents.length = 0;
    };
    for (const clause of clauses) {
      const folded = fold(clause);
      const evidence = clause.slice(0, 160);
      // Declarations: her statement of the fact itself. A declaration
      // is judged in its segment like everything else (Round 2): a
      // veto before it kills it, and another subject inside the
      // segment owns it — "her sister is pregnant" is the sister's
      // news, however the sentence is built.
      const declaredAt = (m: RegExpMatchArray) => {
        const index = m.index ?? 0;
        if (vetoed(folded, index)) return false;
        return !OTHER_SUBJECT.test(segmentAround(folded, index, m[0].length));
      };
      let declared = false;
      for (const re of DECLARATIONS) {
        const m = folded.match(re);
        if (m && declaredAt(m)) { declared = true; break; }
      }
      if (!declared) {
        const m = folded.match(BARE_ESTA);
        if (m && declaredAt(m) && !animalSubject(folded, m.index ?? 0)) declared = true;
      }
      if (!declared) {
        const m = folded.match(NAMED_DECLARATION);
        if (m && declaredAt(m) && nameShaped(clause, m[1])) declared = true;
      }
      if (declared) noteReason(entry.date, evidence, true);
      // Tests.
      const nounMatch = folded.match(TEST_NOUN);
      const hasNoun = nounMatch !== null;
      const results = clauseResults(folded);
      /* A correction in its own clause (Round 3, P3-8): the marker —
       * or a clause-initial "no," — before the clause's first result
       * makes these results a REPLACEMENT for the event they follow,
       * not a new finding. The retracted result used to be the one
       * filed, because the correction clause is not test-shaped and
       * the assembly never heard it. */
      const firstResultAt = folded.search(/(positiv|negativ)/);
      const corrects = !hasNoun && results.length > 0 && firstResultAt >= 0 &&
        (/^\s*no\s*,/.test(folded) || new RegExp(`\\b(${CORRECTION_SRC})\\b`).test(folded.slice(0, firstResultAt)));
      if (corrects) {
        const replacement = results.map((r) => ({ ...r, clean: false }));
        if (open) { open.results = replacement; open.text = `${open.text}. ${clause}`; }
        else if (orphans.length) { orphans = replacement; orphanText = clause; }
        else if (entryEvents.length) {
          const last = entryEvents[entryEvents.length - 1];
          last.results = replacement;
          last.text = `${last.text}. ${clause}`;
        }
      } else if (hasNoun) {
        closeEvent();
        /* The other-subject judgment lives in the segment BEFORE the
         * noun (Round 3, P3-3): the declaration path's discipline,
         * which the test path never got. A sister who merely attends
         * ("with her sister there", "at her sister's house") or who
         * telephoned in an earlier segment does not own the test; a
         * sister who governs it ("her sister took a pregnancy test",
         * "her sister's pregnancy test") does. And a negated noun
         * opens no event at all (P3-7): "she didn't take a pregnancy
         * test" leaves nothing for the next result to adopt. */
        const nounIndex = nounMatch.index ?? 0;
        const [segStart, segEnd] = segmentBounds(folded, nounIndex, nounMatch[0].length);
        const beforeNoun = folded.slice(segStart, nounIndex);
        /* The recipient after the noun owns it too (Round 4, P4-5):
         * "a pregnancy test for her sister" names its owner after
         * the noun, where the Round 3 discipline never looked. */
        const afterNoun = folded.slice(nounIndex + nounMatch[0].length, segEnd);
        /* A compound subject defeats the segment window (Round 4,
         * P4-1's residue): "nuestro hijo y su novia se hicieron una
         * prueba" — the conjunction is a segment break, so the
         * segment before the noun names only the novia. When the
         * CLAUSE opens with a relation and no comma intervenes
         * before the noun, the relation is the clause's subject and
         * governs the test. The comma guard keeps the pinned shape
         * safe: "her sister called during dinner, she took a
         * pregnancy test" — there a comma stands between the sister
         * and the test, and the test is hers. */
        const headBefore = folded.slice(0, nounIndex);
        const clauseSubject = !headBefore.includes(",") && new RegExp(`^\\s*(?:${DETERMINERS_SRC})\\s+(?:${RELATIONS_SRC})\\b`).test(headBefore);
        if (OTHER_SUBJECT.test(beforeNoun) || clauseSubject || RECIPIENT_AFTER.test(afterNoun) || vetoed(folded, nounIndex)) { orphans = []; orphanText = ""; dead = true; continue; }
        dead = false;
        open = { text: clause, results: results.map((r) => ({ ...r, clean: true })), evidence };
        if (!open.results.length && orphans.length) {
          open.results = orphans;
          open.text = `${orphanText}. ${clause}`;
          orphans = [];
          orphanText = "";
        }
      } else if (results.length && TEST_SHAPED.test(folded)) {
        if (open && !open.results.length) {
          for (const r of results) open.results.push({ ...r, clean: false });
          open.text = `${open.text}. ${clause}`;
        } else if (!open && !dead) {
          orphans = results.map((r) => ({ ...r, clean: false }));
          orphanText = clause;
        }
      }
    }
    closeEvent();
    flushEntry();
  }
  return { reason, tests };
}

/** Defensive cleaner for the journal gate: unknown shapes become nothing,
 *  counts clamp to what words can state, evidence stays a short quote. */
export function cleanPregnancyTests(raw: unknown): PregnancyTestEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: PregnancyTestEvent[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const t = item as Partial<PregnancyTestEvent>;
    if (typeof t.id !== "string" || !t.id) continue;
    if (!isRealDate(t.date)) continue;
    if (t.result !== "positive" && t.result !== "negative") continue;
    out.push({
      id: t.id,
      date: t.date,
      result: t.result,
      count: typeof t.count === "number" && Number.isFinite(t.count) ? Math.max(1, Math.min(9, Math.round(t.count))) : 1,
      evidence: typeof t.evidence === "string" ? t.evidence.slice(0, 160) : "",
      createdAt: finiteStamp(t.createdAt) ?? 0,
    });
  }
  /* One id seats one test (Round 4, RT4-H6 B5): the later birth
   * stamp wins a duplicate; a tie resolves by content. */
  const byId = new Map<string, PregnancyTestEvent>();
  for (const t of out) {
    const prev = byId.get(t.id);
    if (!prev || t.createdAt > prev.createdAt || (t.createdAt === prev.createdAt && JSON.stringify(t) > JSON.stringify(prev))) byId.set(t.id, t);
  }
  return [...byId.values()].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
}
