/* WAVE8-PREGNANCY — Round 2 Wave 4 (2.2.31): the pregnancy reader's
 * families, from RT2-H2's verified specimens. The reader proposes, it
 * never asserts — so a fabrication is the worst thing it can do, and a
 * statement it cannot hear is the second worst.
 *
 * Families: declarations about somebody else filed as hers (sister,
 * cousin, friend, aunt, daughter, vecina, nobody, the dog); belief
 * verbs escaping the veto in their third-person shapes (hopes, fears,
 * guess, espera, teme, pregunto si); tampoco outside NEGATED; a
 * one-clause self-correction saving both results; orphan results
 * adopted from an attitude, a COVID test, and a sister's test; a
 * totality word read off a time phrase ("both times in the morning");
 * a stated year read as a count of nine; stated years ignored by the
 * date; relative days clamped at nine; home-test nouns unheard; and
 * "we're expecting" unheard.
 *
 * The case table is RT2-H2's probe, carried verbatim (entry date
 * 2026-11-10), plus the year-count specimens. Fake data only.
 * Run: node ../run-ts-test.mjs tests/wave8-pregnancy.ts */
import { readPregnancy } from "../src/lib/vela/pregnancy";

const D = "2026-11-10";
type Case = {
  name: string;
  text: string;
  date?: string;
  reason?: boolean;
  tests?: [string, number][];
  testDate?: string;
};
const CASES: Case[] = [
  // ——— controls (must hold) ———
  { name: "CTL she is pregnant", text: "she is pregnant", reason: true },
  { name: "CTL might be", text: "she might be pregnant", reason: false, tests: [] },
  { name: "CTL P4 sister test", text: "her sister did a pregnancy test, it was positive", reason: false, tests: [] },
  { name: "CTL wonder if (EN if veto)", text: "i wonder if she is pregnant", reason: false, tests: [] },
  { name: "CTL home pregnancy test", text: "she took a home pregnancy test, it was positive", reason: true, tests: [["positive", 1]] },
  { name: "CTL result before sister noun", text: "it was positive. her sister took a pregnancy test.", reason: false, tests: [] },
  { name: "CTL cree que (ES belief veto)", text: "ella cree que esta embarazada", reason: false, tests: [] },

  // ——— belief verbs, third-person shapes ———
  { name: "HOPES she hopes she is pregnant", text: "she hopes she is pregnant", reason: false, tests: [] },
  { name: "FEARS she fears she got pregnant", text: "she fears she got pregnant", reason: false, tests: [] },
  { name: "GUESS i guess she's pregnant", text: "i guess she's pregnant", reason: false, tests: [] },
  { name: "ESPERA ella espera que Ana esta embarazada", text: "ella espera que Ana esta embarazada", reason: false, tests: [] },
  { name: "TEME ella teme que esta embarazada", text: "ella teme que esta embarazada", reason: false, tests: [] },
  { name: "SI-MID me pregunto si esta embarazada", text: "me pregunto si esta embarazada", reason: false, tests: [] },

  // ——— declarations about somebody else ———
  { name: "DECL sister: her sister is pregnant", text: "her sister is pregnant", reason: false, tests: [] },
  { name: "DECL hermana: su hermana esta embarazada", text: "su hermana esta embarazada", reason: false, tests: [] },
  { name: "DECL cousin: my cousin got pregnant", text: "my cousin got pregnant", reason: false, tests: [] },
  { name: "DECL friend: my friend Ana is pregnant", text: "my friend Ana is pregnant", reason: false, tests: [] },
  { name: "DECL nobody: nobody is pregnant", text: "nobody is pregnant, relax", reason: false, tests: [] },
  { name: "DECL nadie: nadie esta embarazada", text: "nadie esta embarazada, tranquilo", reason: false, tests: [] },
  { name: "DECL dog: my dog is pregnant", text: "my dog is pregnant", reason: false, tests: [] },

  // ——— tampoco ———
  { name: "TAMPOCO tampoco salio positiva", text: "se hizo una prueba de embarazo, tampoco salio positiva", reason: false, tests: [] },

  // ——— clause assembly ———
  { name: "SELFCORR EN one clause", text: "she did a pregnancy test, it was positive, no wait, it was negative", reason: false, tests: [["negative", 1]] },
  { name: "SELFCORR ES mejor dicho", text: "se hizo una prueba de embarazo, salio positiva, mejor dicho, salio negativa", reason: false, tests: [["negative", 1]] },
  { name: "ORPHAN attitude was positive", text: "her attitude was positive all week. she took a pregnancy test.", reason: false, tests: [] },
  { name: "ORPHAN covid test negative", text: "her covid test was negative. she took a pregnancy test.", reason: false, tests: [] },
  { name: "ORPHAN sister result adopted by her test", text: "her sister took a pregnancy test. it was positive. she took a pregnancy test.", reason: false, tests: [] },
  { name: "TOTALITY both times in the morning", text: "she took a pregnancy test twice, both times in the morning. it was negative.", tests: [["negative", 1]] },

  // ——— OTHER_SUBJECT gaps (tests) ———
  { name: "OTHER aunt EN", text: "her aunt did a pregnancy test, it was positive", reason: false, tests: [] },
  { name: "OTHER tia ES", text: "su tia se hizo una prueba de embarazo, salio positiva", reason: false, tests: [] },
  { name: "OTHER daughter EN", text: "her daughter did a pregnancy test, it was positive", reason: false, tests: [] },
  { name: "OTHER vecina ES", text: "la vecina se hizo una prueba de embarazo, salio positiva", reason: false, tests: [] },

  // ——— dates ———
  { name: "DATE 20 days ago", text: "she took a pregnancy test 20 days ago, it was positive", reason: true, tests: [["positive", 1]], testDate: "2026-10-21" },
  { name: "DATE hace 15 dias", text: "se hizo una prueba de embarazo hace 15 dias, salio positiva", reason: true, tests: [["positive", 1]], testDate: "2026-10-26" },
  { name: "DATE stated year 2024", text: "her pregnancy test on Nov 3, 2024 was positive", reason: true, tests: [["positive", 1]], testDate: "2024-11-03" },
  { name: "DATE Nov 3 no year (control)", text: "her pregnancy test on Nov 3 was positive", reason: true, tests: [["positive", 1]], testDate: "2026-11-03" },
  { name: "DATE ano 2024 ES", text: "su prueba de embarazo del 3 de noviembre de 2024 fue positiva", reason: true, tests: [["positive", 1]], testDate: "2024-11-03" },
  { name: "COUNT a year is not nine tests", text: "she took a pregnancy test on Nov 3, 2024, it was positive", reason: true, tests: [["positive", 1]], testDate: "2024-11-03" },

  // ——— nouns & declarations the reader could not hear ———
  { name: "MISS prueba casera", text: "se hizo una prueba casera de embarazo, salio positiva", reason: true, tests: [["positive", 1]] },
  { name: "MISS test casero", text: "se hizo un test casero de embarazo, salio positivo", reason: true, tests: [["positive", 1]] },
  { name: "MISS we're expecting", text: "we're expecting", reason: true },
  { name: "MISS i'm expecting", text: "i'm expecting", reason: true },
];

let breaks = 0;
let holds = 0;
for (const c of CASES) {
  const r = readPregnancy([{ date: c.date ?? D, source: c.text, notes: "" }]);
  const problems: string[] = [];
  if (c.reason !== undefined && Boolean(r.reason) !== c.reason) problems.push(`reason=${r.reason ? `stated(${r.reason.clean ? "clean" : "unclean"})` : "none"}`);
  if (c.tests !== undefined) {
    const got = r.tests.map((t) => [t.result, t.count] as [string, number]);
    if (JSON.stringify(got) !== JSON.stringify(c.tests)) problems.push(`tests=${JSON.stringify(r.tests.map((t) => [t.result, t.count, t.clean ? "clean" : "unclean"]))}`);
  }
  if (c.testDate !== undefined && r.tests[0]?.date !== c.testDate) problems.push(`testDate=${r.tests[0]?.date}`);
  if (problems.length) { breaks += 1; console.log(`BREAK ${c.name} — ${problems.join("; ")}`); }
  else { holds += 1; console.log(`HOLD  ${c.name}`); }
}
console.log(`\nWAVE8-PREGNANCY: ${breaks} break(s), ${holds} hold(s)`);
process.exitCode = breaks ? 1 : 0;
