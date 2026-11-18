/* WAVE20-PREGNANCY-PARITY — Round 4 Wave 4 (2.2.43): the pregnancy
 * families P4-1..P4-11. One vocabulary now lives in kinship.ts; the
 * determiner list reaches "our/nuestra", the relations reach the
 * blended family, kinship titles are common subjects, the animal
 * check reads the noun phrase's head, the recipient AFTER the noun
 * is judged, hearsay is uncertainty, "sorry"/"en realidad" correct,
 * statedDate hears month frames, bare test nouns open events,
 * "not only" is emphasis, and plural results attach across clauses.
 * Entry date for all specimens: 2026-11-10. Fake data only.
 * Run: node ../run-ts-test.mjs tests/wave20-pregnancy-parity.ts */
import { readPregnancy } from "../src/lib/vela/pregnancy";
import { fold } from "../src/lib/vela/batch";

let breaks = 0;
let holds = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) { holds += 1; console.log(`HOLD ${name}`); }
  else { breaks += 1; console.log(`BREAK ${name}${detail ? ` — ${detail}` : ""}`); }
}

const ENTRY = { date: "2026-11-10" };
type Case = { name: string; text: string; tests: [string, number][]; clean?: boolean[]; reason: boolean; testDate?: string };
const CASES: Case[] = [
  /* P4-1 — our/nuestra */
  { name: "P4-1 our daughter", text: "Our daughter took a pregnancy test. It was positive.", tests: [], reason: false },
  { name: "P4-1 nuestra hija", text: "Nuestra hija se hizo una prueba de embarazo. Salio positiva.", tests: [], reason: false },
  { name: "P4-1 our sister", text: "Our sister took a pregnancy test. It was positive.", tests: [], reason: false },
  { name: "P4-1 nuestro hijo y su novia", text: "Nuestro hijo y su novia se hicieron una prueba de embarazo. Salio positiva.", tests: [], reason: false },
  /* P4-2 — blended family */
  { name: "P4-2 stepdaughter", text: "Her stepdaughter took a pregnancy test. It was positive.", tests: [], reason: false },
  { name: "P4-2 stepsister", text: "Her stepsister took a pregnancy test. It was positive.", tests: [], reason: false },
  { name: "P4-2 hermanastra", text: "Su hermanastra se hizo una prueba de embarazo. Salio positiva.", tests: [], reason: false },
  { name: "P4-2 madrastra", text: "Su madrastra se hizo una prueba de embarazo. Salio positiva.", tests: [], reason: false },
  { name: "P4-2 half sister", text: "Her half sister took a pregnancy test. It was positive.", tests: [], reason: false },
  { name: "P4-2 godmother", text: "Her godmother took a pregnancy test. It was positive.", tests: [], reason: false },
  /* P4-3 — kinship titles */
  { name: "P4-3 Mom", text: "Mom is pregnant again.", tests: [], reason: false },
  { name: "P4-3 Auntie", text: "Auntie is pregnant.", tests: [], reason: false },
  { name: "P4-3 Nana", text: "Nana is pregnant.", tests: [], reason: false },
  /* P4-4 — the possessor after the animal */
  { name: "P4-4 gata del vecino", text: "La gata del vecino esta embarazada.", tests: [], reason: false },
  { name: "P4-4 perra de Juan", text: "La perra de Juan esta embarazada.", tests: [], reason: false },
  /* P4-5 — the recipient after the noun */
  { name: "P4-5 test for her sister", text: "She bought a pregnancy test for her sister. It was positive.", tests: [], reason: false },
  { name: "P4-5 regalo a su hermana", text: "Le regalo una prueba de embarazo a su hermana. Salio positiva.", tests: [], reason: false },
  /* P4-6 — hearsay */
  { name: "P4-6 dicen que", text: "Dicen que esta embarazada.", tests: [], reason: false },
  /* P4-7 — correction parity */
  { name: "P4-7 sorry", text: "She took a pregnancy test, it was positive, sorry, it was negative.", tests: [["negative", 1]], clean: [true], reason: false },
  { name: "P4-7 en realidad", text: "Su prueba de embarazo salio positiva, en realidad salio negativa.", tests: [["negative", 1]], clean: [true], reason: false },
  /* P4-8 — stated dates */
  { name: "P4-8 last month", text: "She took a pregnancy test last month. It was positive.", tests: [["positive", 1]], clean: [false], reason: true, testDate: "2026-10-10" },
  { name: "P4-8 a week ago", text: "She took a pregnancy test a week ago. It was positive.", tests: [["positive", 1]], clean: [false], reason: true, testDate: "2026-11-03" },
  { name: "P4-8 hace un mes", text: "Se hizo una prueba de embarazo hace un mes. Salio positiva.", tests: [["positive", 1]], clean: [false], reason: true, testDate: "2026-10-10" },
  /* P4-9 — statements the lists never heard */
  { name: "P4-9 el test dio positivo", text: "El test dio positivo.", tests: [["positive", 1]], clean: [true], reason: true },
  { name: "P4-9 came out positive", text: "She took a pregnancy test. It came out positive.", tests: [["positive", 1]], clean: [false], reason: true },
  { name: "P4-9 estoy esperando un bebe", text: "Estoy esperando un bebe.", tests: [], reason: true },
  /* P4-10 — not only */
  { name: "P4-10 not only", text: "Not only was the pregnancy test positive, she cried with relief.", tests: [["positive", 1]], clean: [true], reason: true },
  /* P4-11 — plurals across clauses */
  { name: "P4-11 they were positive", text: "She took two pregnancy tests. They were positive.", tests: [["positive", 2]], clean: [false], reason: true },
  { name: "P4-11 the second one", text: "She took two pregnancy tests. The second one was positive.", tests: [["positive", 1]], clean: [false], reason: true },
  { name: "P4-11 the results were", text: "She took two pregnancy tests. The results were positive.", tests: [["positive", 2]], clean: [false], reason: true },
  { name: "P4-11 both came back", text: "She took two pregnancy tests. Both came back negative.", tests: [["negative", 2]], clean: [false], reason: false },
  /* Controls — the standing pins */
  { name: "C1 her own clean positive", text: "She took a pregnancy test, it was positive.", tests: [["positive", 1]], clean: [true], reason: true },
  { name: "C2 her sister's test stays silent", text: "Her sister did a pregnancy test, it was positive.", tests: [], reason: false },
  { name: "C3 the cat", text: "The cat is pregnant.", tests: [], reason: false },
  { name: "C4 la perra", text: "La perra esta embarazada.", tests: [], reason: false },
  { name: "C5 Ana is pregnant", text: "Ana is pregnant.", tests: [], reason: true },
  { name: "C6 hopes", text: "She hopes she is pregnant.", tests: [], reason: false },
  { name: "C7 both times in the morning", text: "She took a pregnancy test twice, both times in the morning it was positive.", tests: [["positive", 1]], clean: [true], reason: true },
  { name: "C8 she is pregnant, her sister too", text: "She is pregnant, her sister is too.", tests: [], reason: true },
];

for (const c of CASES) {
  const r = readPregnancy([{ ...ENTRY, source: c.text, notes: "" }], fold);
  const got = r.tests.map((t) => [t.result, t.count] as [string, number]);
  const okTests = JSON.stringify(got) === JSON.stringify(c.tests);
  const okReason = (r.reason !== null) === c.reason;
  const okClean = !c.clean || JSON.stringify(r.tests.map((t) => t.clean)) === JSON.stringify(c.clean);
  const okDate = !c.testDate || r.tests[0]?.date === c.testDate;
  check(c.name, okTests && okReason && okClean && okDate,
    `tests=${JSON.stringify(got)} reason=${r.reason !== null} clean=${JSON.stringify(r.tests.map((t) => t.clean))} date=${r.tests[0]?.date}`);
}

console.log(`WAVE20-PREGNANCY-PARITY: ${breaks} break(s), ${holds} hold(s)`);
if (breaks > 0) process.exitCode = 1;
