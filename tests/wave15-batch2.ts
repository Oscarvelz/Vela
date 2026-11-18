/* WAVE15-BATCH2 — Round 3 Wave 5 (2.2.38): the batch reader's next
 * ring (RT3-H2, families B3-1..B3-14). Round 2's guards hold at their
 * own doors; every family here is a sibling the specimen lists never
 * named — "on line" beside "in line", the aunt beside the mother, the
 * tournament beside the fight, the movie beside the drive. The case
 * table is RT3-H2's probe, carried verbatim (now = Sun 2026-11-15
 * 12:00), plus its named controls. Fake data only.
 * Run: node ../run-ts-test.mjs tests/wave15-batch2.ts */
import { parseBatch, type BatchContext } from "../src/lib/vela/batch";

const NOW = new Date(2026, 10, 15, 12, 0);
const EN: BatchContext = { lang: "en", partners: ["Ana", "Lucía", "Sofía", "Marco"] };
const ES: BatchContext = { lang: "es", partners: ["Ana", "Lucía", "Sofía", "Marco"] };
const CABIN: BatchContext = { lang: "en", partners: ["Ana"], customPlaces: ["Cabin"] };

type Expect = {
  entries?: number; count?: number; partner?: string; solo?: boolean; place?: string;
  duration?: number; overall?: number; intensity?: number; connection?: number;
  satisfaction?: number; energy?: number;
  methodsNot?: string[]; problemsNot?: string[]; positionsNot?: string[];
};
type Case = { name: string; text: string; ctx?: BatchContext; expect: Expect };
const CASES: Case[] = [
  // ——— controls (must hold) ———
  { name: "CTL genuine", text: "Oct 25 with Ana, twice, condom", expect: { entries: 1, count: 2, partner: "Ana" } },
  { name: "CTL i mean pin", text: "Oct 25 with Ana, we did it three times, I mean, twice, condom", expect: { count: 2 } },
  { name: "CTL met at office pin", text: "Oct 25 with Ana, met at the office, then the hotel, twice", expect: { place: "Hotel" } },
  { name: "CTL April month pin", text: "Oct 25, back in April we laughed a lot, twice, condom", ctx: { lang: "en", partners: ["April", "Ana"] }, expect: { partner: "" } },
  { name: "CTL awful headache phantom", text: "Oct 25, awful headache all day, early night in", expect: { entries: 0 } },
  { name: "CTL mother called (foreign pin)", text: "Oct 25 with Ana once. Her mother called 3 times that evening.", expect: { count: 1 } },

  // ——— B3-1 lexicon guard siblings ———
  { name: "B3-1 stood on line", text: "Oct 25 with Ana, we stood on line for tickets at the fair, twice", expect: { positionsNot: ["Standing"] } },
  { name: "B3-1 standing room", text: "Oct 25 with Ana, standing room only at the concert, then the hotel, twice", expect: { positionsNot: ["Standing"], place: "Hotel" } },
  { name: "B3-1 bridal shower", text: "Oct 25 with Ana, her bridal shower was that morning, then the hotel, twice", expect: { place: "Hotel" } },
  { name: "B3-1 oral medication", text: "Oct 25 with Ana, she takes oral medication every morning, twice", expect: { positionsNot: ["Oral"] } },
  { name: "B3-1 exit 69", text: "Oct 25 with Ana, we took exit 69 to the cabin, twice", ctx: CABIN, expect: { positionsNot: ["69"] } },
  { name: "B3-1 $69 room", text: "Oct 25 with Ana, the room cost $69 that night, twice", expect: { positionsNot: ["69"] } },
  { name: "B3-1 rubber duck", text: "Oct 25 with Ana, a rubber duck in the bathtub, twice", expect: { methodsNot: ["condom"] } },
  { name: "B3-1 sleeping pills", text: "Oct 25 with Ana, she takes sleeping pills every night, twice", expect: { methodsNot: ["pill"] } },
  { name: "B3-1 came outside when", text: "Oct 25 with Ana, we came outside when the fire alarm rang, twice", expect: { methodsNot: ["pullout"] } },
  { name: "B3-1 blood orange", text: "Oct 25 with Ana, blood orange juice with breakfast, twice", expect: { problemsNot: ["bleeding"] } },
  { name: "B3-1 burning calories", text: "Oct 25 with Ana, burning calories at the gym all morning, twice", expect: { problemsNot: ["irritation"] } },
  { name: "B3-1 stress ball", text: "Oct 25 with Ana, she squeezed a stress ball at her desk, twice", expect: { problemsNot: ["stress"] } },
  { name: "B3-1 dry cough", text: "Oct 25 with Ana, she had a dry cough all week, twice", expect: { problemsNot: ["dryness"] } },
  { name: "B3-1 temporada seca", text: "Oct 25 con Ana, en plena temporada seca, dos veces en el hotel", ctx: ES, expect: { problemsNot: ["dryness"] } },
  { name: "B3-1 second period at school", text: "Oct 25 with Ana, we left during second period at school, twice", expect: { problemsNot: ["period"] } },
  { name: "B3-1 came early to the wedding", text: "Oct 25 with Ana, she came early to the wedding, twice, condom", expect: { problemsNot: ["timing"] } },
  { name: "B3-1 sin ganas de dormir", text: "Oct 25 con Ana, sin ganas de dormir temprano, dos veces, condon", ctx: ES, expect: { problemsNot: ["desire"] } },
  { name: "B3-1 cuarto de hora", text: "Oct 25 con Ana, esperamos un cuarto de hora en el hotel, dos veces", ctx: ES, expect: { place: "Hotel" } },
  { name: "B3-1 sala de urgencias", text: "Oct 25 con Ana, estuvimos en la sala de urgencias hasta tarde, dos veces, luego en el hotel", ctx: ES, expect: { place: "Hotel" } },
  { name: "B3-1 ella rio", text: "Oct 25 con Ana, ella rio toda la noche, dos veces en el hotel", ctx: ES, expect: { place: "Hotel" } },

  // ——— B3-2 rating fabrication siblings ———
  { name: "B3-2 hot yoga", text: "Oct 25 with Ana, hot yoga class in the morning, once", expect: { intensity: 0 } },
  { name: "B3-2 rough seas", text: "Oct 25 with Ana, rough seas on the ferry ride over, once", expect: { intensity: 0 } },
  { name: "B3-2 slow cooker", text: "Oct 25 with Ana, a slow cooker stew for dinner, once", expect: { intensity: 0 } },
  { name: "B3-2 wild horses", text: "Oct 25 with Ana, wild horses on the ranch, once", expect: { energy: 0 } },
  { name: "B3-2 crazy socks", text: "Oct 25 with Ana, crazy socks at the party, once", expect: { energy: 0 } },
  { name: "B3-2 sweet sixteen", text: "Oct 25 with Ana, her sweet sixteen party, once", expect: { connection: 0 } },
  { name: "B3-2 came prepared", text: "Oct 25 with Ana, she came prepared with snacks and wine, once", expect: { satisfaction: 0 } },
  { name: "B3-2 warm evening", text: "Oct 25 with Ana, a warm evening on the porch, once", expect: { intensity: 0 } },
  { name: "B3-2 close to the beach", text: "Oct 25 with Ana, the cabin was close to the beach, once", ctx: CABIN, expect: { connection: 0 } },

  // ——— B3-3 verdict siblings ———
  { name: "B3-3 great news", text: "Oct 25 with Ana, great news at work that day, twice", expect: { overall: 0 } },
  { name: "B3-3 perfect score", text: "Oct 25 with Ana, she got a perfect score on the exam, twice", expect: { overall: 0 } },
  { name: "B3-3 concert 10/10", text: "Oct 25 with Ana, the concert was 10/10, twice", expect: { overall: 0 } },
  { name: "B3-3 gave concert 5 stars", text: "Oct 25 with Ana, we gave the concert 5 stars in the review, twice", expect: { overall: 0 } },
  { name: "B3-3 10/10 the date", text: "Oct 25 with Ana, we first met back on 10/10, once, condom", expect: { overall: 0 } },

  // ——— B3-4 foreign counts ———
  { name: "B3-4 aunt visited 3 times", text: "Oct 25 with Ana once. Her aunt had visited 3 times that month.", expect: { count: 1 } },
  { name: "B3-4 su tia llamo tres veces", text: "Oct 25 con Ana una vez. Su tia llamo tres veces esa noche.", ctx: ES, expect: { count: 1 } },
  { name: "B3-4 daughter called 3 times", text: "Oct 25 with Ana once. Her daughter called 3 times that evening.", expect: { count: 1 } },
  { name: "B3-4 running 3 times that month", text: "Oct 25 with Ana once. She had gone running 3 times that month.", expect: { count: 1 } },

  // ——— B3-5 event rounds ———
  { name: "B3-5 round two of the tournament", text: "Oct 25 with Ana once. We watched round two of the tournament.", expect: { count: 1 } },
  { name: "B3-5 segunda ronda del torneo", text: "Oct 25 con Ana una vez. Vimos la segunda ronda del torneo.", ctx: ES, expect: { count: 1 } },
  { name: "B3-5 second round of the playoffs", text: "Oct 25 with Ana, we watched the second round of the playoffs, condom", expect: { count: 1 } },
  { name: "B3-5 another round of drinks", text: "Oct 25 with Ana once, we ordered another round of drinks at the bar", expect: { count: 1 } },
  { name: "B3-5 otra ronda de tragos", text: "Oct 25 con Ana una vez, pedimos otra ronda de tragos", ctx: ES, expect: { count: 1 } },

  // ——— B3-6 unhappened ———
  { name: "B3-6 weren't able to do it again", text: "Oct 25 with Ana once. We weren't able to do it again, she had to leave.", expect: { count: 1 } },

  // ——— B3-7 correction parity ———
  { name: "B3-7 actually correction", text: "Oct 25 with Ana, we did it three times, actually twice, condom", expect: { count: 2 } },
  { name: "B3-7 perdon correction", text: "Oct 25 con Ana, lo hicimos tres veces, perdon, dos veces, condon", ctx: ES, expect: { count: 2 } },

  // ——— B3-8 ordinal menu guard ———
  { name: "B3-8 second one on the table", text: "Oct 25 with Ana, we picked the second one on the table, condom", expect: { count: 1 } },

  // ——— B3-9 the feelings door's foreign list ———
  { name: "B3-9 aunt came twice (multi)", text: "Oct 25 with Ana once. Her aunt came twice to visit.", expect: { satisfaction: 0, count: 1 } },

  // ——— B3-10 duration subjects ———
  { name: "B3-10 3 hour movie", text: "Oct 25 with Ana, a 3 hour movie at home, twice", expect: { duration: 0 } },
  { name: "B3-10 2 hour class", text: "Oct 25 with Ana, a 2 hour class at the gym, twice", expect: { duration: 0 } },
  { name: "B3-10 slept 8 hours", text: "Oct 25 with Ana, she finally slept 8 hours straight, twice", expect: { duration: 0 } },

  // ——— B3-11 phantom doors ———
  { name: "B3-11 office day", text: "Oct 25, endless meetings at the office, home late", expect: { entries: 0 } },
  { name: "B3-11 parents visited twice", text: "Oct 25, my parents visited twice this month", expect: { entries: 0 } },
  { name: "B3-11 sister aftermath", text: "Oct 25, her sister had terrible back pain afterwards", expect: { entries: 0 } },

  // ——— B3-12 month governor ———
  { name: "B3-12 after August", text: "Oct 25, after August ended we laughed a lot, twice, condom", ctx: { lang: "en", partners: ["August", "Ana"] }, expect: { partner: "" } },

  // ——— B3-13 / B3-14 ———
  { name: "B3-13 guitar solo", text: "Oct 25, el solo de guitarra fue lo mejor de la noche, dos veces, condon", ctx: ES, expect: { solo: false } },
  { name: "B3-14 saw at the office", text: "Oct 25 with Ana, we saw her at the office, then the hotel, twice", expect: { place: "Hotel" } },
];

let breaks = 0;
let holds = 0;
for (const c of CASES) {
  const es = parseBatch(c.text, NOW, c.ctx ?? EN);
  const x = c.expect;
  const problems: string[] = [];
  if (x.entries !== undefined && es.length !== x.entries) problems.push(`entries=${es.length}`);
  const e = es[0];
  if (e) {
    if (x.count !== undefined && e.count !== x.count) problems.push(`count=${e.count}`);
    if (x.partner !== undefined && e.partnerName !== x.partner) problems.push(`partner=${e.partnerName || "∅"}`);
    if (x.solo !== undefined && e.solo !== x.solo) problems.push(`solo=${e.solo}`);
    if (x.place !== undefined && e.place !== x.place) problems.push(`place=${e.place || "∅"}`);
    if (x.duration !== undefined && e.durationMins !== x.duration) problems.push(`dur=${e.durationMins}`);
    if (x.overall !== undefined && e.overall !== x.overall) problems.push(`overall=${e.overall}`);
    if (x.intensity !== undefined && e.intensity !== x.intensity) problems.push(`i=${e.intensity}`);
    if (x.connection !== undefined && e.connection !== x.connection) problems.push(`c=${e.connection}`);
    if (x.satisfaction !== undefined && e.satisfaction !== x.satisfaction) problems.push(`s=${e.satisfaction}`);
    if (x.energy !== undefined && e.energy !== x.energy) problems.push(`en=${e.energy}`);
    for (const m of x.methodsNot ?? []) if (e.contraception.includes(m)) problems.push(`method ${m}`);
    for (const p of x.problemsNot ?? []) if (e.problems.includes(p)) problems.push(`problem ${p}`);
    for (const p of x.positionsNot ?? []) if (e.positions.includes(p)) problems.push(`position ${p}`);
  } else if (x.entries === undefined) problems.push("no entry");
  if (problems.length) { breaks += 1; console.log(`BREAK ${c.name} — ${problems.join("; ")}`); }
  else { holds += 1; console.log(`HOLD ${c.name}`); }
}
console.log(`WAVE15-BATCH2: ${breaks} break(s), ${holds} hold(s)`);
if (breaks > 0) process.exitCode = 1;
