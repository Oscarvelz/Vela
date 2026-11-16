/* Wave 3 re-hunt — fresh prejudice against the NEW reader machinery:
 * clause-scoped negation, per-sentence counts, tests as events,
 * domain-guarded lexicon, honest dates, clause solo, proposal posture.
 * Fake data only. now = Sun 2026-11-15 12:00, the hunts' clock. */
import { readFileSync } from "node:fs";
import { parseBatch, type BatchContext, type BatchEntry } from "../src/lib/vela/batch";
import { readPregnancy } from "../src/lib/vela/pregnancy";

const NOW = new Date(2026, 10, 15, 12, 0);
const EN: BatchContext = { lang: "en", partners: ["Ana", "Lucía", "Sofía", "Marco"] };
const ES: BatchContext = { lang: "es", partners: ["Ana", "Lucía", "Sofía", "Marco"] };

let breaks = 0;
let holds = 0;
function hold(name: string) { holds += 1; console.log(`HOLD ${name}`); }
function brk(name: string, extra = "") { breaks += 1; console.log(`BREAK ${name}${extra ? " — " + extra : ""}`); }

function one(text: string, ctx: BatchContext = EN): BatchEntry | undefined {
  return parseBatch(text, NOW, ctx)[0];
}

/* RH1 — the fold invariant: no pattern in the reader sources may carry
 * a curly apostrophe. fold() straightens the TEXT's apostrophes, so a
 * pattern written with one is dead code that looks alive (RT-V2M M1). */
{
  const bad: string[] = [];
  for (const file of ["src/lib/vela/pregnancy.ts", "src/lib/vela/batch-lexicon.ts", "src/lib/vela/batch.ts"]) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (!/(re:|r\(|RegExp|\/[^/]*[nt]'[^/]*\/)/.test(line)) return;
      if (/[\u2018\u2019]/.test(line) && /(re:|r\(|RegExp)/.test(line)) bad.push(`${file}:${i + 1}`);
    });
  }
  if (bad.length === 0) hold("RH1 no curly apostrophe in any reader pattern line");
  else brk("RH1 fold invariant", bad.join(", "));
}

/* RH2 — uncertainty in an earlier clause does not veto a later,
 * cleanly framed result (scope is the segment, not the sentence). */
{
  const r = readPregnancy([{ date: "2026-11-10", source: "She took a pregnancy test, at home, I think, and it was positive", notes: "" }]);
  const t = r.tests[0];
  if (t && t.result === "positive" && t.clean) hold("RH2 hedge before the break word does not veto the result");
  else brk("RH2 scope segments", JSON.stringify(r.tests));
}

/* RH3 — composed negation in Spanish resolves positive. */
{
  const e = one("Oct 25 con Ana, nunca lo hicimos sin condon, dos veces", ES);
  if (e && e.contraception.includes("condom") && !e.contraception.includes("none")) hold("RH3 nunca…sin keeps the condom, files no none");
  else brk("RH3 composed negation ES", JSON.stringify(e?.contraception));
}

/* RH4 — additive ordinal survives a foreign sentence in between. */
{
  const e = one("Oct 25 with Ana once. Her sister visited twice that week. And then a second round at midnight.");
  if (e && e.count === 2) hold("RH4 additive second round across a foreign sentence");
  else brk("RH4 additive ordinal", `count=${e?.count}`);
}

/* RH5 — tests counted in words distribute over stated results
 * (events carry counts: the sums are the stated totals). */
{
  const r = readPregnancy([{ date: "2026-11-10", source: "She took pregnancy tests three times, two negative and one positive", notes: "" }]);
  const sum = (kind: string) => r.tests.filter((t) => t.result === kind).reduce((a, t) => a + t.count, 0);
  if (sum("negative") + sum("positive") === 3 && sum("negative") === 2 && sum("positive") === 1)
    hold("RH5 three stated tests distribute two negative, one positive");
  else brk("RH5 test distribution", JSON.stringify(r.tests));
}

/* RH6 — a stated test date never lands after the entry that states
 * it, and the day number inside it is not a test count. */
{
  const r = readPregnancy([{ date: "2026-11-10", source: "The pregnancy test on Dec 25 was positive", notes: "" }]);
  const t = r.tests[0];
  if (t && t.date === "2025-12-25" && t.count === 1) hold("RH6 future stated date rolls back a year; its day is not a count");
  else brk("RH6 stated date ceiling", JSON.stringify(t));
}

/* RH7 — a function-word partner, capitalised and cued, is the partner. */
{
  const e = one("Oct 25 with May, twice at the hotel", { lang: "en", partners: ["May", "Ana"] });
  if (e && e.partnerName === "May") hold("RH7 cued capitalised May is the partner");
  else brk("RH7 function-name cue", e?.partnerName);
}

/* RH8 — a solo marker followed by a partner who arrives and acts:
 * the encounter is hers, the solo moment its prelude. (An absent,
 * merely mentioned partner still does not veto — B10/M27 stand.) */
{
  const out = parseBatch("Oct 25 solo at home, then Ana came over at ten and we did it twice", NOW, EN);
  const e = out[0];
  if (out.length === 1 && e && !e.solo && e.partnerName === "Ana" && e.count === 2)
    hold("RH8 an arriving, acting partner outvotes the earlier solo marker");
  else brk("RH8 solo vs arrival", JSON.stringify(out.map((x) => [x.solo, x.partnerName, x.count])));
}

/* RH9 — a named declaration is a clean proposal. */
{
  const r = readPregnancy([{ date: "2026-11-10", source: "Ana is pregnant, we found out today", notes: "" }]);
  if (r.reason && r.reason.clean) hold("RH9 named declaration proposes clean");
  else brk("RH9 named declaration", JSON.stringify(r.reason));
}

/* RH10 — Spanish self-correction: the last count stated wins. */
{
  const e = one("Oct 25 con Ana tres veces, mejor dicho dos veces", ES);
  if (e && e.count === 2) hold("RH10 mejor dicho replaces the count");
  else brk("RH10 ES self-correction", `count=${e?.count}`);
}

/* RH11 — durations: a meeting after "after the" is not a session;
 * a plainly stated duration still is. */
{
  const a = one("Oct 25 with Ana, after the 2 hour meeting we stayed in bed, twice");
  const b = one("Oct 25 with Ana for 2 hours, twice");
  if (a && a.durationMins === 0 && b && b.durationMins === 120) hold("RH11 meeting duration refused, stated duration kept");
  else brk("RH11 duration frames", `a=${a?.durationMins} b=${b?.durationMins}`);
}

/* RH12 — the verdict guard does not eat a verdict about the night. */
{
  const e = one("Oct 25 with Ana twice, perfect night");
  if (e && e.overall === 5) hold("RH12 perfect night still scores the night");
  else brk("RH12 verdict control", `overall=${e?.overall}`);
}

/* RH13 — came-from place plus a real scene: the scene wins. */
{
  const e = one("Oct 25 with Ana, back from the hotel, then in bed at home, twice");
  if (e && e.place === "Bedroom") hold("RH13 the scene, not the origin, is the place");
  else brk("RH13 place origin vs scene", e?.place);
}

/* RH14 — the erection frames survive the death of bare "ed". */
{
  const e = one("Oct 25 with Ana, he had trouble getting an erection, twice", { lang: "en", partners: ["Ana", "Ed"] });
  if (e && e.problems.includes("erection")) hold("RH14 difficulty frame still files erection");
  else brk("RH14 erection frame control", JSON.stringify(e?.problems));
}

/* RH15 — the possessive period frame survives the span blocks. */
{
  const e = one("Oct 25 with Ana, she was on her period, twice");
  if (e && e.problems.includes("period")) hold("RH15 on her period still files period");
  else brk("RH15 period control", JSON.stringify(e?.problems));
}

/* RH16 — the proposal posture, both directions: a suspicion files
 * NO reason at all (the fence's own M3d law), and a test result
 * assembled from a separate clause is proposed UNCLEAN — shown at
 * the batch door, never auto-saved (Decision 1). */
{
  const hedged = readPregnancy([{ date: "2026-11-10", source: "I suspect she is pregnant, we will see", notes: "" }]);
  const assembled = readPregnancy([{ date: "2026-11-10", source: "She bought a pregnancy test on Monday. It was positive.", notes: "" }]);
  const t = assembled.tests[0];
  if (hedged.reason === null && t && t.result === "positive" && !t.clean)
    hold("RH16 suspicion files nothing; a cross-clause result proposes unclean");
  else brk("RH16 proposal posture", `reason=${JSON.stringify(hedged.reason)} test=${JSON.stringify(t)}`);
}

/* RH17 — found by the acceptance probe re-run, not the fences: the
 * Spanish total negation "ninguna" opened the clause and the reader
 * filed the positive it denied (its English twin "no test was
 * positive" already filed nothing). */
{
  const es = readPregnancy([{ date: "2026-11-10", source: "ninguna prueba de embarazo salio positiva", notes: "" }]);
  const en = readPregnancy([{ date: "2026-11-10", source: "none of the pregnancy tests were positive", notes: "" }]);
  if (es.tests.length === 0 && es.reason === null && en.tests.length === 0 && en.reason === null)
    hold("RH17 ninguna/none veto the result they deny");
  else brk("RH17 total negation", `es=${JSON.stringify(es.tests)} en=${JSON.stringify(en.tests)}`);
}

console.log(`WAVE3-REHUNT: ${breaks} breaks, ${holds} holds`);
if (breaks > 0) process.exitCode = 1;
