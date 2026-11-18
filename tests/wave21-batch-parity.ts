/* WAVE21-BATCH-PARITY — Round 4 Wave 5 (2.2.44): the batch families
 * B4-1..B4-15. The case table is RT4-H2's probe, carried verbatim
 * (now = Sun 2026-11-15 12:00), plus its named controls. One
 * vocabulary (kinship.ts) now feeds both readers; the past week
 * frames, the full correction inventory, the next lexicon twins and
 * the remaining guard rings close here. Fake data only.
 * Run: node ../run-ts-test.mjs tests/wave21-batch-parity.ts */
import { parseBatch, type BatchContext } from "../src/lib/vela/batch";

const NOW = new Date(2026, 10, 15, 12, 0);
const EN: BatchContext = { lang: "en", partners: ["Ana", "Lucía", "Sofía", "Marco"] };
const ES: BatchContext = { lang: "es", partners: ["Ana", "Lucía", "Sofía", "Marco"] };
const CABIN: BatchContext = { lang: "en", partners: ["Ana"], customPlaces: ["Cabin"] };
const SOLO_CTX: BatchContext = { lang: "en", partners: ["Ana"] };

type Expect = {
  entries?: number; count?: number; partner?: string; solo?: boolean; place?: string;
  duration?: number; overall?: number; intensity?: number; connection?: number;
  satisfaction?: number; energy?: number;
  methodsNot?: string[]; problemsNot?: string[]; positionsNot?: string[];
  problemsHas?: string[];
};
type Case = { name: string; text: string; ctx?: BatchContext; expect: Expect };
const CASES: Case[] = [
  // ——— controls (must hold) ———
  { name: "CTL genuine", text: "Oct 25 with Ana, twice, condom", expect: { entries: 1, count: 2, partner: "Ana" } },
  { name: "CTL mother pin", text: "Oct 25 with Ana once. Her mother called 3 times that evening.", expect: { count: 1 } },
  { name: "CTL movie duration pin", text: "Oct 25 with Ana, a 3 hour movie first, then home, twice", expect: { duration: 0 } },
  { name: "CTL flight fraction pin", text: "Oct 25 with Ana, the movie was 10/10, twice, condom", expect: { overall: 0 } },
  { name: "CTL verdict genuine", text: "Oct 25 with Ana, it was amazing, twice, condom", expect: { overall: 5 } },
  { name: "CTL warm feeling holds", text: "Oct 25 with Ana, it was warm and close, twice", expect: { intensity: 2, connection: 3 } },
  { name: "CTL picked up Ana", text: "Oct 25, picked up Ana at the airport, twice at home", ctx: SOLO_CTX, expect: { partner: "Ana" } },
  { name: "CTL connected genuine", text: "Oct 25 with Ana, we felt connected, twice", expect: { connection: 3 } },
  { name: "CTL back pain problem holds", text: "Oct 25 with Ana, terrible back pain all day, twice", expect: { problemsHas: ["pain"] } },
  { name: "CTL day at office cameFrom pin", text: "Oct 25, after a long day at the office, with Ana at home, twice", expect: { place: "" } },
  { name: "CTL solo genuine", text: "Oct 25, solo en el hotel, una vez", ctx: ES, expect: { entries: 1, solo: true } },

  // ——— A: FOREIGN_SUBJECT is a second, shorter vocabulary ———
  { name: "A1 our daughter count", text: "Oct 25. Our daughter called three times; with Ana at the hotel, twice", expect: { entries: 1, count: 2 } },
  { name: "A2 nuestra hija count", text: "Oct 25. Nuestra hija llamo tres veces; con Ana en el hotel, dos veces", ctx: ES, expect: { count: 2 } },
  { name: "A3 her grandma count", text: "Oct 25. Her grandma called three times; with Ana at the hotel, twice", expect: { count: 2 } },
  { name: "A4 su abuela count", text: "Oct 25. Su abuela llamo tres veces; con Ana en el hotel, dos veces", ctx: ES, expect: { count: 2 } },
  { name: "A5 su suegra count", text: "Oct 25. Su suegra llamo tres veces; con Ana en el hotel, dos veces", ctx: ES, expect: { count: 2 } },
  { name: "A6 grandma multi door", text: "Oct 25 with Ana, her grandma came twice to visit, condom", expect: { satisfaction: 0 } },
  { name: "A7 her colleague count", text: "Oct 25. Her colleague called three times; with Ana at the hotel, twice", expect: { count: 2 } },

  // ——— B: WEEK_FRAME ends at week/month/year — "last week" is unframed ———
  { name: "B1 last week tally", text: "Oct 25, I called the office three times last week; with Ana at the hotel, twice", expect: { count: 2 } },
  { name: "B2 la semana pasada tally", text: "Oct 25, llame tres veces la semana pasada; con Ana en el hotel, dos veces", ctx: ES, expect: { count: 2 } },
  { name: "B3 last month tally", text: "Oct 25, I drove there three times last month; with Ana at the hotel, twice", expect: { count: 2 } },

  // ——— C: correction parity, third act — sorry / digo / bare wait ———
  { name: "C1 sorry correction", text: "Oct 25 with Ana, three times, sorry, twice, condom", expect: { count: 2 } },
  { name: "C2 digo correction", text: "Oct 25 with Ana, tres veces, digo, dos veces, condon", ctx: ES, expect: { count: 2 } },
  { name: "C3 bare wait correction", text: "Oct 25 with Ana, three times, wait, twice, condom", expect: { count: 2 } },

  // ——— D: event rounds — applause, golf, appetizers, interviews, the dentist ———
  { name: "D1 round of applause", text: "Oct 25 with Ana at the hotel. Another round of applause from the crowd next door", expect: { count: 1 } },
  { name: "D2 round of golf", text: "Oct 25 with Ana, condom, we played another round of golf that morning", expect: { count: 1 } },
  { name: "D3 round of appetizers", text: "Oct 25 with Ana, round two of appetizers arrived, then we went home, condom", expect: { count: 1 } },
  { name: "D4 second round of interviews", text: "Oct 25, the second round of interviews went well; Ana came over that night, condom", expect: { count: 1 } },
  { name: "D5 second time at the dentist", text: "Oct 25, my second time at the dentist this year; home with Ana, condom", expect: { count: 1 } },

  // ——— E: durations — the shift, the lasted frame, the nap ———
  { name: "E1 an 8 hour shift", text: "Oct 25, an 8 hour shift, then with Ana at home, condom", expect: { duration: 0 } },
  { name: "E2 the meeting lasted", text: "Oct 25, the meeting lasted 3 hours, then Ana came over, condom", expect: { duration: 0 } },
  { name: "E3 she napped 2 hours", text: "Oct 25, she napped 2 hours, then Ana came over, condom", expect: { duration: 0 } },
  { name: "E4 the movie lasted", text: "Oct 25, the movie lasted two hours, then Ana came over, condom", expect: { duration: 0 } },

  // ——— F: fraction and star subjects — the flight, the meal ———
  { name: "F1 flight fraction", text: "Oct 25, the flight was 9/10, with Ana, condom", expect: { overall: 0 } },
  { name: "F2 gave the flight stars", text: "Oct 25, we gave the flight 5 stars, with Ana, condom", expect: { overall: 0 } },
  { name: "F3 meal fraction", text: "Oct 25, the meal was 10/10, with Ana at home, condom", expect: { overall: 0 } },

  // ——— G: verdict words aimed at luck, points, failures, hair, ordinary days ———
  { name: "G1 good luck", text: "Oct 25, Ana wished me good luck for tomorrow, condom, at home", expect: { overall: 0 } },
  { name: "G2 good point", text: "Oct 25 with Ana, she made a good point about the budget, twice, condom", expect: { overall: 0 } },
  { name: "G3 epic fail", text: "Oct 25 with Ana, an epic fail at work today, twice, condom", expect: { overall: 0 } },
  { name: "G4 regular day", text: "Oct 25 with Ana, just a regular day, twice at home, condom", expect: { overall: 0 } },
  { name: "G5 bad hair day", text: "Oct 25 with Ana, a bad hair day, but the night was ours, twice, condom", expect: { overall: 0 } },
  { name: "G6 great idea", text: "Oct 25 with Ana, she had a great idea for the weekend, twice, condom", expect: { overall: 0 } },

  // ——— H: arrival and pickup cues name the next word, whatever it is ———
  { name: "H1 llego tarde", text: "Oct 25, llego tarde a casa, dos veces en el cuarto, sin condon", ctx: { lang: "es", partners: ["Ana"] }, expect: { partner: "" } },
  { name: "H2 picked up groceries", text: "Oct 25, I picked up groceries and wine, twice in the bedroom", ctx: SOLO_CTX, expect: { partner: "" } },
  { name: "H3 showed up late", text: "Oct 25, she showed up late, twice at the hotel, condom", ctx: SOLO_CTX, expect: { partner: "" } },

  // ——— I: solo brands loneliness and the adverb "only" ———
  { name: "I1 felt alone all day", text: "Oct 25, I felt alone all day, exhausted", ctx: SOLO_CTX, expect: { entries: 0 } },
  { name: "I2 solo pienso (only)", text: "Oct 25, solo pienso en eso todo el dia", ctx: { lang: "es", partners: ["Ana"] }, expect: { entries: 0 } },

  // ——— J: the rating guard ring, next twins ———
  { name: "J1 noche calida", text: "Oct 25 con Ana, una noche muy calida, dos veces en el hotel", ctx: ES, expect: { intensity: 0 } },
  { name: "J2 close to home", text: "Oct 25 with Ana, the cabin was close to home, twice", ctx: CABIN, expect: { connection: 0 } },
  { name: "J3 wild party", text: "Oct 25 with Ana, a wild party at the hotel, once", expect: { energy: 0 } },
  { name: "J4 rough neighborhood", text: "Oct 25 with Ana, a rough neighborhood around the hotel, twice", expect: { intensity: 0 } },
  { name: "J5 sweet dreams", text: "Oct 25 with Ana, sweet dreams after, twice at home", expect: { connection: 0 } },

  // ——— K: lexicon twins — positions and methods ———
  { name: "K1 standing ovation", text: "Oct 25 with Ana, a standing ovation at the theater, then home, twice", expect: { positionsNot: ["Standing"] } },
  { name: "K2 doggy bag", text: "Oct 25 with Ana, took a doggy bag home from the restaurant, twice", expect: { positionsNot: ["Doggy"] } },
  { name: "K3 the missionary visited", text: "Oct 25, the missionary from the church visited us; with Ana later, twice", expect: { positionsNot: ["Missionary"] } },
  { name: "K4 oral surgery", text: "Oct 25 with Ana, oral surgery in the morning, twice at home", expect: { positionsNot: ["Oral"] } },
  { name: "K5 69 percent", text: "Oct 25 with Ana, the battery was at 69 percent, twice", expect: { positionsNot: ["69"] } },
  { name: "K6 coil of rope", text: "Oct 25 with Ana, a coil of rope in the garage, twice", expect: { methodsNot: ["iud"] } },
  { name: "K7 cash withdrawal", text: "Oct 25, made a cash withdrawal, then Ana at home, twice", expect: { methodsNot: ["pullout"] } },
  { name: "K8 rubber stamp", text: "Oct 25 with Ana, the rubber stamp at the office, twice", expect: { methodsNot: ["condom"] } },
  { name: "K9 en cuatro dias", text: "Oct 25 con Ana, volvemos en cuatro dias a la cabana, dos veces", ctx: ES, expect: { positionsNot: ["Doggy"] } },
  { name: "K10 por detras de la casa", text: "Oct 25, entro por detras de la casa, con Ana, dos veces", ctx: ES, expect: { positionsNot: ["Doggy"] } },
  { name: "K11 pill organizer", text: "Oct 25 with Ana, her pill organizer on the counter, twice", expect: { methodsNot: ["pill"] } },

  // ——— L: lexicon twins — places ———
  { name: "L1 flower bed", text: "Oct 25 with Ana, planted a flower bed at the cabin, twice", ctx: CABIN, expect: { place: "Cabin" } },
  { name: "L2 last resort", text: "Oct 25, as a last resort we stayed in, with Ana, twice", expect: { place: "" } },
  { name: "L3 box office", text: "Oct 25, box office tickets first, then Ana at the hotel, twice", expect: { place: "Hotel" } },
  { name: "L4 meteor shower", text: "Oct 25, the meteor shower was incredible, with Ana at the cabin, twice", ctx: CABIN, expect: { place: "Cabin" } },
  { name: "L5 coche del bebe", text: "Oct 25 con Ana, el coche del bebe se rompio, dos veces en el hotel", ctx: ES, expect: { place: "Hotel" } },
  { name: "L6 outside the box", text: "Oct 25, thinking outside the box all day, with Ana at home, twice", expect: { place: "" } },
  { name: "L7 park the car", text: "Oct 25, had to park the car far away, with Ana at the hotel, twice", expect: { place: "Hotel" } },
  { name: "L8 sala de clases", text: "Oct 25 con Ana, la sala de clases estaba fria, dos veces en el hotel", ctx: ES, expect: { place: "Hotel" } },
  { name: "L9 cuarto de final", text: "Oct 25 con Ana, el cuarto de final del torneo, dos veces en el hotel", ctx: ES, expect: { place: "Hotel" } },

  // ——— M: lexicon twins — problems ———
  { name: "M1 dry run", text: "Oct 25 with Ana, a dry run of the show at the office, twice", expect: { problemsNot: ["dryness"] } },
  { name: "M2 toalla seca", text: "Oct 25 con Ana, la toalla estaba seca, dos veces en el hotel", ctx: ES, expect: { problemsNot: ["dryness"] } },
  { name: "M3 period costume", text: "Oct 25 with Ana, she wore a period costume to the party, twice", expect: { problemsNot: ["period"] } },
  { name: "M4 distant thunder", text: "Oct 25, distant thunder all night, with Ana at the cabin, twice", ctx: CABIN, expect: { problemsNot: ["connection"] } },
  { name: "M5 burning question", text: "Oct 25 with Ana, a burning question all day, twice", expect: { problemsNot: ["irritation"] } },
  { name: "M6 wine glasses", text: "Oct 25 with Ana, the wine glasses were still out, twice", expect: { problemsNot: ["alcohol"] } },

  // ——— N: the fuzzy door — "connector" is one typo from "connected" ———
  { name: "N1 phone connector", text: "Oct 25 with Ana, the phone connector broke, twice at home", expect: { connection: 0 } },

  // ——— O: cameFrom's "day" token refuses real places (miss direction) ———
  { name: "O1 that day at the cabin", text: "Oct 25, that day at the cabin with Ana, twice", ctx: CABIN, expect: { place: "Cabin" } },
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
    for (const p of x.problemsHas ?? []) if (!e.problems.includes(p)) problems.push(`missing problem ${p}`);
  } else if (x.entries === undefined) problems.push("no entry");
  if (problems.length) { breaks += 1; console.log(`BREAK ${c.name} — ${problems.join("; ")}`); }
  else { holds += 1; console.log(`HOLD ${c.name}`); }
}
console.log(`WAVE21-BATCH-PARITY: ${breaks} break(s), ${holds} hold(s)`);
if (breaks > 0) process.exitCode = 1;
