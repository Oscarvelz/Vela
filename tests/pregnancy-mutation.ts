/* Wave 3 fence — pregnancy reader mutation battery.
 * Every specimen from RT-V2 (P1–P5) and RT-V2M (M1–M7, M9) as an
 * expectation, plus the hunts' own controls, which must keep holding.
 * Fake data only. now is irrelevant here (entries carry their dates). */
import { readPregnancy } from "../src/lib/vela/pregnancy";

let breaks = 0;
let holds = 0;
function hold(name: string) { holds += 1; console.log(`HOLD ${name}`); }
function brk(name: string, extra = "") { breaks += 1; console.log(`BREAK ${name}${extra ? " — " + extra : ""}`); }

type Case = {
  name: string;
  text: string;
  date?: string;
  reason?: boolean; // a pregnancy reason is stated
  tests?: [string, number][]; // [result, count] in order
  testDate?: string; // date of the first test
};
const D = "2026-11-10";
const CASES: Case[] = [
  // M1 — contracted negations (the dead curly apostrophe)
  { name: "M1a wasn't positive", text: "the pregnancy test wasn't positive", reason: false, tests: [] },
  { name: "M1b isn't positive", text: "the pregnancy test isn't positive", reason: false, tests: [] },
  { name: "M1c didn't turn out positive", text: "the pregnancy test didn't turn out positive", reason: false, tests: [] },
  { name: "M1d curly wasn't positive", text: "the pregnancy test wasn’t positive", reason: false, tests: [] },
  { name: "M1e wasn't negative", text: "the pregnancy test wasn't negative", reason: false, tests: [] },
  // P2 — negation outside the 14-char window
  { name: "P2a no test was positive", text: "no pregnancy test was positive", reason: false, tests: [] },
  { name: "P2b not at all positive", text: "the pregnancy test she took yesterday was not at all positive", reason: false, tests: [] },
  // P1 — plural test nouns
  { name: "P1a plural tests", text: "she took two pregnancy tests, both negative", tests: [["negative", 2]] },
  { name: "P1b pruebas plural", text: "se hizo dos pruebas de embarazo, las dos negativas", tests: [["negative", 2]] },
  // M2 — declaration subjects
  { name: "M2a named subject", text: "Ana is pregnant", reason: true },
  { name: "M2b named got", text: "Ana got pregnant", reason: true },
  { name: "M2c wife got", text: "my wife got pregnant", reason: true },
  { name: "M2d we're pregnant", text: "we're pregnant", reason: true },
  { name: "M2e we are expecting", text: "we are expecting", reason: true },
  // M3 — conditionals & suspicion
  { name: "M3a if she's", text: "if she's pregnant, the wedding moves to june", reason: false, tests: [] },
  { name: "M3b if she is", text: "if she is pregnant we will need a bigger car", reason: false, tests: [] },
  { name: "M3c si esta", text: "si esta embarazada, nos mudamos en junio", reason: false, tests: [] },
  { name: "M3d suspect", text: "we suspect she's pregnant", reason: false, tests: [] },
  { name: "M3e piensa (P3)", text: "she thinks she's pregnant", reason: false, tests: [] },
  // M4 — suppression scoped to its proposition
  { name: "M4a first try", text: "she got pregnant on the first try", reason: true },
  { name: "M4b after trying", text: "after months of trying, she got pregnant", reason: true },
  { name: "M4c pregnant and hope", text: "she is pregnant and we hope for a girl", reason: true },
  { name: "M4d embarazada y miedo", text: "esta embarazada y tiene miedo", reason: true },
  { name: "M4e test then afraid", text: "she did a pregnancy test, it was positive, and she was afraid", reason: true, tests: [["positive", 1]] },
  { name: "M4f no one knew", text: "no one knew yet, but she is pregnant", reason: true },
  { name: "M4g never thought", text: "we never thought it would happen, but she got pregnant", reason: true },
  { name: "M4h sin planearlo before", text: "sin planearlo, quedo embarazada", reason: true },
  // M5 — results in the next sentence
  { name: "M5a two sentences positive", text: "She did a pregnancy test. It came back positive.", reason: true, tests: [["positive", 1]] },
  { name: "M5b two sentences negative", text: "She did a pregnancy test. It was negative.", tests: [["negative", 1]] },
  { name: "M5c result first", text: "the result came back positive. she had done a pregnancy test that morning.", reason: true, tests: [["positive", 1]] },
  // M6 — result words doing another job
  { name: "M6a stayed positive", text: "she did a pregnancy test, it was negative, but she stayed positive", reason: false, tests: [["negative", 1]] },
  // M7 — counts at a distance
  { name: "M7a three times all positive", text: "she took a pregnancy test three times, all were positive", reason: true, tests: [["positive", 3]] },
  { name: "M7b positive two times", text: "she did a pregnancy test, it was positive two times", reason: true, tests: [["positive", 2]] },
  { name: "M7c tres veces todas", text: "hizo una prueba de embarazo tres veces, todas positivas", reason: true, tests: [["positive", 3]] },
  // M9 — the test's own stated date
  { name: "M9 last week", text: "Her pregnancy test last week was negative.", date: D, tests: [["negative", 1]], testDate: "2026-11-03" },
  // P4 — a third person's test is not hers
  { name: "P4 sister's test", text: "her sister did a pregnancy test, it was positive", reason: false, tests: [] },
  // Controls — the hunts' holds, which must keep holding
  { name: "C1 was not positive", text: "the pregnancy test was not positive", reason: false, tests: [] },
  { name: "C2 no fue positiva", text: "la prueba de embarazo no fue positiva", reason: false, tests: [] },
  { name: "C3 she is pregnant", text: "she is pregnant", reason: true },
  { name: "C4 my wife is pregnant", text: "my wife is pregnant", reason: true },
  { name: "C5 doctor confirmed", text: "the doctor confirmed she is pregnant", reason: true },
  { name: "C6 might be", text: "she might be pregnant", reason: false, tests: [] },
  { name: "C7 could be", text: "she could be pregnant", reason: false, tests: [] },
  { name: "C8 quedo sin planearlo", text: "quedo embarazada sin planearlo", reason: true },
  { name: "C9 no quedo", text: "no quedo embarazada", reason: false, tests: [] },
  { name: "C10 one clause positive", text: "she did a pregnancy test, it came back positive", reason: true, tests: [["positive", 1]] },
  { name: "C11 module example", text: "she did a pregnancy test — two were negative and one was positive", reason: true, tests: [["negative", 2], ["positive", 1]] },
  { name: "C12 not pregnant", text: "I'm not pregnant", reason: false, tests: [] },
  { name: "C13 trying is silence", text: "we are trying to get pregnant", reason: false, tests: [] },
];

for (const c of CASES) {
  const r = readPregnancy([{ date: c.date ?? D, source: c.text, notes: "" }]);
  const problems: string[] = [];
  if (c.reason !== undefined && Boolean(r.reason) !== c.reason) problems.push(`reason=${r.reason ? "stated" : "none"}`);
  if (c.tests !== undefined) {
    const got = r.tests.map((t) => [t.result, t.count] as [string, number]);
    if (JSON.stringify(got) !== JSON.stringify(c.tests)) problems.push(`tests=${JSON.stringify(got)}`);
  }
  if (c.testDate !== undefined && r.tests[0]?.date !== c.testDate) problems.push(`testDate=${r.tests[0]?.date}`);
  if (problems.length) brk(c.name, problems.join("; "));
  else hold(c.name);
}

console.log(`\nPREGNANCY-MUTATION: ${breaks} breaks, ${holds} holds`);
if (breaks > 0) process.exitCode = 1;
