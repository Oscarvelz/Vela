/* WAVE9-BATCH — Round 2 Wave 5 (2.2.32): the batch reader families,
 * carried verbatim from RT2-H2's verified probe.
 * Fake data only. now = Sun 2026-11-15 12:00 (the Round 1 clock).
 * Each case encodes the LAW-ABIDING expectation.
 * Run: node ../run-ts-test.mjs tests/wave9-batch.ts */
import { parseBatch, type BatchContext } from "../src/lib/vela/batch";

const NOW = new Date(2026, 10, 15, 12, 0);
const EN: BatchContext = { lang: "en", partners: ["Ana", "Lucía", "Sofía", "Marco"] };
const ES: BatchContext = { lang: "es", partners: ["Ana", "Lucía", "Sofía", "Marco"] };

type Expect = {
  entries?: number; count?: number; partner?: string; solo?: boolean; place?: string;
  duration?: number; overall?: number; intensity?: number; connection?: number;
  satisfaction?: number; energy?: number;
  methodsNot?: string[]; problemsNot?: string[]; positionsNot?: string[];
};
type Case = { name: string; text: string; ctx?: BatchContext; expect: Expect };
const CASES: Case[] = [
  // ——— controls (must hold) ———
  { name: "CTL genuine entry", text: "Oct 25 with Ana, twice, condom", expect: { entries: 1, count: 2, partner: "Ana" } },
  { name: "CTL standing in line (pin M19b)", text: "Oct 25 with Ana, standing in line for an hour at the fair, twice", expect: { positionsNot: ["Standing"] } },
  { name: "CTL front desk at hotel", text: "Oct 25 with Ana at the hotel, the front desk gave us a late checkout, twice", expect: { place: "Hotel" } },

  // ——— lexicon domain guards: the unguarded twins ———
  { name: "LEX stood in line", text: "Oct 25 with Ana, we stood in line for an hour at the fair, twice", expect: { positionsNot: ["Standing"] } },
  { name: "LEX baby shower", text: "Oct 25 with Ana, baby shower gifts still on the table, twice, at the hotel", expect: { place: "Hotel" } },
  { name: "LEX oral exam", text: "Oct 25 with Ana, she had an oral exam at the dentist, twice, condom", expect: { positionsNot: ["Oral"] } },
  { name: "LEX route 69", text: "Oct 25 with Ana, we drove route 69 to the cabin, twice", ctx: { lang: "en", partners: ["Ana"], customPlaces: ["Cabin"] }, expect: { positionsNot: ["69"] } },
  { name: "LEX 69 dollars", text: "Oct 25 with Ana, we paid 69 dollars for the room, twice", expect: { positionsNot: ["69"] } },
  { name: "LEX rubber band (singular)", text: "Oct 25 with Ana, she wore a rubber band on her wrist, twice", expect: { methodsNot: ["condom"] } },
  { name: "LEX vitamin pills", text: "Oct 25 with Ana, she takes vitamin pills every morning, twice", expect: { methodsNot: ["pill"] } },
  { name: "LEX came outside and smoked", text: "Oct 25 with Ana, we came outside and smoked on the porch, twice", expect: { methodsNot: ["pullout"] } },
  { name: "LEX sore throat", text: "Oct 25 with Ana, she had a sore throat, twice, condom", expect: { problemsNot: ["pain"] } },
  { name: "LEX upset stomach", text: "Oct 25 with Ana, she had an upset stomach, twice, condom", expect: { problemsNot: ["mood"] } },
  { name: "LEX blood moon", text: "Oct 25 with Ana, we watched the blood moon from the porch, twice", expect: { problemsNot: ["bleeding"] } },
  { name: "LEX burning the midnight oil", text: "Oct 25 with Ana, burning the midnight oil at work all week, twice, condom", expect: { problemsNot: ["irritation"] } },
  { name: "LEX stress test (bank)", text: "Oct 25 with Ana, the bank ran a stress test on our loan, twice, condom", expect: { problemsNot: ["stress"] } },
  { name: "LEX dry cleaning", text: "Oct 25 with Ana, we picked up the dry cleaning on the way, twice", expect: { problemsNot: ["dryness"] } },
  { name: "LEX third period of the game (control)", text: "Oct 25 with Ana, we watched the third period of the game, twice", expect: { problemsNot: ["period"] } },
  { name: "LEX third period, no of", text: "Oct 25 with Ana, we watched the third period, twice", expect: { problemsNot: ["period"] } },
  { name: "LEX class period ended", text: "Oct 25 with Ana, her class period ended early, twice", expect: { problemsNot: ["period"] } },
  { name: "LEX came early to dinner", text: "Oct 25 with Ana, she came early to dinner, twice, condom", expect: { problemsNot: ["timing"] } },
  { name: "LEX sin ganas de hablar", text: "Oct 25 con Ana, sin ganas de hablar con nadie, dos veces, condon", ctx: ES, expect: { problemsNot: ["desire"] } },
  { name: "LEX hot springs", text: "Oct 25 with Ana, at the hot springs all afternoon, once", expect: { intensity: 0 } },
  { name: "LEX rough draft", text: "Oct 25 with Ana, she showed me the rough draft of her novel, twice", expect: { intensity: 0 } },
  { name: "LEX wild flowers", text: "Oct 25 with Ana, wild flowers on the table, once", expect: { energy: 0 } },
  { name: "LEX crazy traffic", text: "Oct 25 with Ana, crazy traffic on the way over, twice", expect: { energy: 0 } },
  { name: "LEX slow traffic", text: "Oct 25 with Ana, slow traffic on the way over, once", expect: { intensity: 0 } },
  { name: "LEX sweet tea", text: "Oct 25 with Ana, sweet tea on the porch, once", expect: { connection: 0 } },
  { name: "LEX close to midnight", text: "Oct 25 with Ana, close to midnight, once", expect: { connection: 0 } },
  { name: "LEX she came running", text: "Oct 25 with Ana, she came running when the baby cried, once", expect: { satisfaction: 0 } },
  { name: "LEX cuarto dia (fourth day)", text: "Oct 25 con Ana, era el cuarto dia del viaje, dos veces", ctx: ES, expect: { place: "" } },
  { name: "LEX se rio (she laughed)", text: "Oct 25 con Ana, se rio mucho toda la noche, dos veces", ctx: ES, expect: { place: "" } },
  { name: "LEX sala de cine", text: "Oct 25 con Ana, la sala de cine estaba llena, dos veces, luego en el hotel", ctx: ES, expect: { place: "Hotel" } },
  { name: "LEX met at the office", text: "Oct 25 with Ana, met at the office, then the hotel, twice", expect: { place: "Hotel" } },

  // ——— phantoms: problem-only lines are substance ———
  { name: "PHA mood line only", text: "Oct 25, exhausted and stressed all day, early night in", expect: { entries: 0 } },
  { name: "PHA pain line only", text: "Oct 25, terrible back pain all day", expect: { entries: 0 } },

  // ——— verdicts & numeric ratings aimed at other things ———
  { name: "VER amazing view", text: "Oct 25 with Ana, amazing view from the balcony, twice", expect: { overall: 0 } },
  { name: "VER great conversation", text: "Oct 25 with Ana, great conversation all night, twice", expect: { overall: 0 } },
  { name: "VER gave the hotel 5 stars", text: "Oct 25 with Ana, we gave the hotel 5 stars online, twice", expect: { overall: 0 } },
  { name: "VER the movie was 10/10", text: "Oct 25 with Ana, the movie was 10/10, twice", expect: { overall: 0 } },

  // ——— counts: foreign sentences beyond food ———
  { name: "CNT worked 3 times that week", text: "Oct 25 with Ana once. She had worked 3 times that week.", expect: { count: 1 } },
  { name: "CNT team won 3 times", text: "Oct 25 with Ana once. The team had won 3 times in a row.", expect: { count: 1 } },
  { name: "CNT two rounds of drinks", text: "Oct 25 with Ana once, we had two rounds of drinks at the bar", expect: { count: 1 } },
  { name: "CNT dos rondas de tragos", text: "Oct 25 con Ana una vez, pedimos dos rondas de tragos", ctx: ES, expect: { count: 1 } },
  { name: "CNT round two of the fight", text: "Oct 25 with Ana once. We watched round two of the boxing match.", expect: { count: 1 } },
  { name: "CNT segunda ronda del partido", text: "Oct 25 con Ana una vez. Vimos la segunda ronda del partido.", ctx: ES, expect: { count: 1 } },
  { name: "CNT the second one on the menu", text: "Oct 25 with Ana, we ordered the second one on the menu, condom", expect: { count: 1 } },

  // ——— again / corrections: new un-happened & correction shapes ———
  { name: "AGN couldn't do it again", text: "Oct 25 with Ana once. We couldn't do it again, she had to leave.", expect: { count: 1 } },
  { name: "COR I mean correction", text: "Oct 25 with Ana, three times, I mean, twice", expect: { count: 2 } },

  // ——— solo / partner seams ———
  { name: "SOL solo dos veces con Ana (control)", text: "Oct 25, solo dos veces, con Ana, condon", ctx: ES, expect: { partner: "Ana", solo: false, count: 2 } },
  { name: "SOL solo un rato con Ana", text: "Oct 25, solo un rato, con Ana, condon", ctx: ES, expect: { partner: "Ana", solo: false } },
  { name: "SOL solo esta noche con Ana", text: "Oct 25, solo esta noche, con Ana, dos veces, condon", ctx: ES, expect: { partner: "Ana", solo: false } },
  { name: "SOL partner named Solo (dos veces)", text: "Oct 25, solo dos veces, condon", ctx: ES, expect: { partner: "" } },
  { name: "SOL partner named Solo (una vez)", text: "Oct 25, solo una vez, condon", ctx: ES, expect: { partner: "" } },
  { name: "PAR partner named April", text: "Oct 25, back in April we laughed a lot, twice, condom", ctx: { lang: "en", partners: ["April", "Ana"] }, expect: { partner: "" } },

  // ——— duration guards: new prepositions ———
  { name: "DUR during a 2 hour meeting", text: "Oct 25 with Ana, during a 2 hour meeting at work, twice", expect: { duration: 0 } },
  { name: "DUR a 2 hour drive", text: "Oct 25 with Ana, a 2 hour drive to the cabin, twice", ctx: { lang: "en", partners: ["Ana"], customPlaces: ["Cabin"] }, expect: { duration: 0 } },
];

let breaks = 0;
let holds = 0;
for (const c of CASES) {
  const entries = parseBatch(c.text, NOW, c.ctx ?? EN);
  const x = c.expect;
  const problems: string[] = [];
  if (x.entries !== undefined && entries.length !== x.entries) problems.push(`entries=${entries.length}`);
  const e = entries[0];
  if (x.entries !== 0) {
    if (!e) { problems.push("no entry"); }
    else {
      if (x.count !== undefined && e.count !== x.count) problems.push(`count=${e.count}`);
      if (x.partner !== undefined && e.partnerName !== x.partner) problems.push(`partner=${e.partnerName || "∅"}`);
      if (x.solo !== undefined && e.solo !== x.solo) problems.push(`solo=${e.solo}`);
      if (x.place !== undefined && e.place !== x.place) problems.push(`place=${e.place || "∅"}`);
      if (x.duration !== undefined && e.durationMins !== x.duration) problems.push(`duration=${e.durationMins}`);
      if (x.overall !== undefined && e.overall !== x.overall) problems.push(`overall=${e.overall}`);
      if (x.intensity !== undefined && e.intensity !== x.intensity) problems.push(`intensity=${e.intensity}`);
      if (x.connection !== undefined && e.connection !== x.connection) problems.push(`connection=${e.connection}`);
      if (x.satisfaction !== undefined && e.satisfaction !== x.satisfaction) problems.push(`satisfaction=${e.satisfaction}`);
      if (x.energy !== undefined && e.energy !== x.energy) problems.push(`energy=${e.energy}`);
      for (const p of x.methodsNot ?? []) if (e.contraception.includes(p)) problems.push(`methods has ${p}`);
      for (const p of x.problemsNot ?? []) if (e.problems.includes(p)) problems.push(`problems has ${p}`);
      for (const p of x.positionsNot ?? []) if (e.positions.includes(p)) problems.push(`positions has ${p}`);
    }
  }
  if (problems.length) { breaks += 1; console.log(`BREAK ${c.name} — ${problems.join("; ")}`); }
  else { holds += 1; console.log(`HOLD  ${c.name}`); }
}
console.log(`\nWAVE9-BATCH: ${breaks} break(s), ${holds} hold(s)`);
process.exitCode = breaks ? 1 : 0;
