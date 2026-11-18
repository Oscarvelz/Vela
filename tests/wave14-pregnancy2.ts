/* WAVE14-PREGNANCY2 — Round 3 Wave 4 (2.2.37): the pregnancy reader's
 * next ring (RT3-H2, families P3-1..P3-14). Round 2's cures hold at
 * their own doors; the guilt is the enumerative lists inside them —
 * possessives and relatives OTHER_SUBJECT never listed, uncertainty
 * and denial verbs UNCERTAIN/NEGATED never listed, result-frame verbs,
 * correction markers in one reader but not the other, and a test path
 * that never got the declaration path's segment discipline. The case
 * table is RT3-H2's probe, carried verbatim (entry date 2026-11-10),
 * plus its named controls. Fake data only.
 * Run: node ../run-ts-test.mjs tests/wave14-pregnancy2.ts */
import { readPregnancy } from "../src/lib/vela/pregnancy";

const D = "2026-11-10";
type Case = {
  name: string;
  text: string;
  reason?: boolean;
  tests?: [string, number][];
  clean?: boolean[];
  testDate?: string;
};
const CASES: Case[] = [
  // ——— controls (must hold) ———
  { name: "CTL Ana is pregnant", text: "Ana is pregnant", reason: true },
  { name: "CTL the cat is pregnant", text: "the cat is pregnant", reason: false, tests: [] },
  { name: "CTL my mother is pregnant (case witness)", text: "my mother is pregnant", reason: false, tests: [] },
  { name: "CTL segment veto: hers, not her sister's", text: "she is pregnant, her sister is too", reason: true },
  { name: "CTL she hopes", text: "she hopes she is pregnant", reason: false, tests: [] },
  { name: "CTL digo correction", text: "su prueba de embarazo fue positiva, digo, fue negativa", reason: false, tests: [["negative", 1]], clean: [true] },
  { name: "CTL both times in the morning", text: "she took a pregnancy test twice, both times in the morning. it was negative.", reason: false, tests: [["negative", 1]] },
  { name: "CTL yesterday", text: "she took a pregnancy test yesterday, it was positive", reason: true, tests: [["positive", 1]], testDate: "2026-11-09" },

  // ——— P3-1 first-person possessives ———
  { name: "P3-1 mi hermana declaration", text: "mi hermana esta embarazada", reason: false, tests: [] },
  { name: "P3-1 mi hermana test", text: "mi hermana se hizo una prueba de embarazo, salio positiva", reason: false, tests: [] },
  { name: "P3-1 mi madre test", text: "mi madre se hizo una prueba de embarazo, salio positiva", reason: false, tests: [] },
  { name: "P3-1 mi tia test", text: "mi tia se hizo una prueba de embarazo, salio positiva", reason: false, tests: [] },
  { name: "P3-1 mi prima declaration", text: "mi prima esta embarazada", reason: false, tests: [] },
  { name: "P3-1 my mother test", text: "my mother did a pregnancy test, it was positive", reason: false, tests: [] },

  // ——— P3-2 the next ring of others ———
  { name: "P3-2 her niece", text: "her niece did a pregnancy test, it was positive", reason: false, tests: [] },
  { name: "P3-2 her roommate", text: "her roommate took a pregnancy test, it was positive", reason: false, tests: [] },
  { name: "P3-2 her coworker", text: "her coworker did a pregnancy test, it was positive", reason: false, tests: [] },
  { name: "P3-2 the neighbor", text: "the neighbor took a pregnancy test, it was positive", reason: false, tests: [] },
  { name: "P3-2 su sobrina", text: "su sobrina se hizo una prueba de embarazo, salio positiva", reason: false, tests: [] },
  { name: "P3-2 su cunada", text: "su cunada se hizo una prueba de embarazo, salio positiva", reason: false, tests: [] },

  // ——— P3-3 bystanders do not own her test ———
  { name: "P3-3 sister present", text: "she took a pregnancy test with her sister there. it was positive.", reason: true, tests: [["positive", 1]], clean: [false] },
  { name: "P3-3 sister telephoned", text: "her sister called during dinner, she took a pregnancy test, it was positive", reason: true, tests: [["positive", 1]], clean: [true] },
  { name: "P3-3 sister's house", text: "she took a pregnancy test at her sister's house. it was positive.", reason: true, tests: [["positive", 1]], clean: [false] },

  // ——— P3-4 sentence-initial common nouns ———
  { name: "P3-4 Sister is pregnant", text: "Sister is pregnant.", reason: false, tests: [] },
  { name: "P3-4 Cow is pregnant", text: "Cow is pregnant.", reason: false, tests: [] },
  { name: "P3-4 Neighbor is pregnant", text: "Neighbor is pregnant.", reason: false, tests: [] },
  { name: "P3-4 Aunt is pregnant", text: "Aunt is pregnant.", reason: false, tests: [] },

  // ——— P3-5 uncertainty's next ring ———
  { name: "P3-5 doubts", text: "she doubts she is pregnant", reason: false, tests: [] },
  { name: "P3-5 assumes", text: "she assumes she's pregnant", reason: false, tests: [] },
  { name: "P3-5 wonders whether", text: "she wonders whether she is pregnant", reason: false, tests: [] },
  { name: "P3-5 feels", text: "she feels she is pregnant", reason: false, tests: [] },
  { name: "P3-5 reckons", text: "she reckons she's pregnant", reason: false, tests: [] },
  { name: "P3-5 duda", text: "ella duda que esta embarazada", reason: false, tests: [] },
  { name: "P3-5 asume", text: "ella asume que esta embarazada", reason: false, tests: [] },
  { name: "P3-5 supuestamente", text: "supuestamente esta embarazada", reason: false, tests: [] },
  { name: "P3-5 al parecer", text: "al parecer esta embarazada", reason: false, tests: [] },
  { name: "P3-5 le parece", text: "le parece que esta embarazada", reason: false, tests: [] },

  // ——— P3-6 denial ———
  { name: "P3-6 denies", text: "she denies she is pregnant", reason: false, tests: [] },
  { name: "P3-6 niega", text: "ella niega que esta embarazada", reason: false, tests: [] },

  // ——— P3-7 a negated test noun opens nothing ———
  { name: "P3-7 didn't take", text: "she didn't take a pregnancy test. it was positive.", reason: false, tests: [] },
  { name: "P3-7 never took", text: "she never took a pregnancy test. the result was positive.", reason: false, tests: [] },

  // ——— P3-8 correction parity ———
  { name: "P3-8 i mean", text: "she took a pregnancy test, it was positive, i mean negative", reason: false, tests: [["negative", 1]], clean: [true] },
  { name: "P3-8 wait", text: "she took a pregnancy test, it was positive, wait, it was negative", reason: false, tests: [["negative", 1]], clean: [true] },
  { name: "P3-8 cross-clause no wait", text: "she took a pregnancy test. it was positive. no wait, it was negative.", reason: false, tests: [["negative", 1]], clean: [false] },
  { name: "P3-8 ES no, salio negativa", text: "se hizo una prueba de embarazo. salio positiva. no, salio negativa.", reason: false, tests: [["negative", 1]], clean: [false] },
  { name: "P3-8 cross-clause actually", text: "she took a pregnancy test. it was positive. actually, it was negative.", reason: false, tests: [["negative", 1]], clean: [false] },

  // ——— P3-9 result-frame verbs ———
  { name: "P3-9 showed positive", text: "she took a pregnancy test, it showed positive", reason: true, tests: [["positive", 1]], clean: [true] },
  { name: "P3-9 showed negative", text: "she took a pregnancy test, it showed negative", reason: false, tests: [["negative", 1]], clean: [true] },
  { name: "P3-9 read positive", text: "she took a pregnancy test, it read positive", reason: true, tests: [["positive", 1]], clean: [true] },
  { name: "P3-9 marco positivo", text: "se hizo un test de embarazo, marco positivo", reason: true, tests: [["positive", 1]], clean: [true] },

  // ——— P3-10 plural results distribute ———
  { name: "P3-10 two tests, they were positive", text: "she took two pregnancy tests, they were positive", reason: true, tests: [["positive", 2]], clean: [true] },
  { name: "P3-10 dos pruebas, salieron positivas", text: "se hizo dos pruebas de embarazo, salieron positivas", reason: true, tests: [["positive", 2]], clean: [true] },
  { name: "P3-10 both were negative", text: "she took pregnancy tests. both were negative.", reason: false, tests: [["negative", 2]], clean: [false] },

  // ——— P3-11 the bare ES declaration's subject ———
  { name: "P3-11 la perra", text: "la perra esta embarazada", reason: false, tests: [] },
  { name: "P3-11 la gata", text: "la gata esta embarazada", reason: false, tests: [] },

  // ——— P3-12 statedDate's frames ———
  { name: "P3-12 del 2024", text: "su prueba de embarazo del 3 de noviembre del 2024 fue positiva", reason: true, tests: [["positive", 1]], testDate: "2024-11-03" },
  { name: "P3-12 nov 3rd, 2024", text: "her pregnancy test on nov 3rd, 2024 was positive", reason: true, tests: [["positive", 1]], testDate: "2024-11-03" },
  { name: "P3-12 two weeks ago", text: "she took a pregnancy test two weeks ago, it was positive", reason: true, tests: [["positive", 1]], testDate: "2026-10-27" },

  // ——— P3-13 statements unheard ———
  { name: "P3-13 salio embarazada", text: "salio embarazada", reason: true },
  { name: "P3-13 fell pregnant", text: "she fell pregnant last month", reason: true },
  { name: "P3-13 my wife is expecting", text: "my wife is expecting", reason: true },
  { name: "P3-13 test for pregnancy", text: "she took a test for pregnancy, it was positive", reason: true, tests: [["positive", 1]], clean: [true] },
  { name: "P3-13 estamos embarazadas", text: "estamos embarazadas", reason: true },

  // ——— P3-14 the orphan was the news ———
  { name: "P3-14 positive news", text: "it was positive news all week. she took a pregnancy test.", reason: false, tests: [] },
];

let breaks = 0;
let holds = 0;
for (const c of CASES) {
  const r = readPregnancy([{ date: D, source: c.text, notes: "" }]);
  const problems: string[] = [];
  if (c.reason !== undefined && Boolean(r.reason) !== c.reason) problems.push(`reason=${JSON.stringify(r.reason)}`);
  if (c.tests !== undefined) {
    const got = r.tests.map((t) => [t.result, t.count]);
    if (JSON.stringify(got) !== JSON.stringify(c.tests)) problems.push(`tests=${JSON.stringify(got)}`);
    if (c.clean && JSON.stringify(r.tests.map((t) => t.clean)) !== JSON.stringify(c.clean)) problems.push(`clean=${JSON.stringify(r.tests.map((t) => t.clean))}`);
    if (c.testDate && r.tests[0]?.date !== c.testDate) problems.push(`testDate=${r.tests[0]?.date}`);
  }
  if (problems.length) { breaks += 1; console.log(`BREAK ${c.name} — ${problems.join("; ")}`); }
  else { holds += 1; console.log(`HOLD ${c.name}`); }
}
console.log(`WAVE14-PREGNANCY2: ${breaks} break(s), ${holds} hold(s)`);
if (breaks > 0) process.exitCode = 1;
