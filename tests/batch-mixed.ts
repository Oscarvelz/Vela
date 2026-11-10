// Batch reader: English, Spanish and code-switched (mid-sentence) entries, long diary paragraphs,
// numbered items with several dates/names. FAKE names and FAKE text only (Ana, Lucia, Marta).
// Run: node tests/run-batch-mixed.mjs
import { parseBatch, type BatchEntry } from "../src/lib/vela/batch";

const NOW = new Date(2026, 10, 6, 18, 0); // Fri Nov 6 2026
const KNOWN = { partners: ["Ana", "Lucia"] };
let pass = 0;
let fail = 0;
const all: BatchEntry[] = [];

type Want = Partial<{
  n: number;
  date: string;
  time: string;
  count: number;
  partner: string;
  unsure: boolean;
  place: string;
  positions: string[];
  contraception: string[];
  problems: string[];
  solo: boolean;
  minIntensity: number;
  minConnection: number;
  minSatisfaction: number;
  minEnergy: number;
  intensity: number;
  energy: number;
  overall: number;
  duration: number;
  noteIsWhole: boolean;
  noteHas: string[];
  noteNot: string[];
  alts: string[];
}>;

const same = (a: string[], b: string[]) => a.length === b.length && a.every((v) => b.includes(v));

function check(name: string, text: string, want: Want, ctx: object = {}, index = 0) {
  const got = parseBatch(text, NOW, ctx);
  all.push(...got);
  const e = got[index];
  const bad: string[] = [];
  if (want.n !== undefined && got.length !== want.n) bad.push(`n ${got.length}≠${want.n}`);
  if (!e) bad.push("no entry");
  else {
    const eq = (k: string, g: unknown, w: unknown) => {
      if (w !== undefined && JSON.stringify(g) !== JSON.stringify(w)) bad.push(`${k} ${JSON.stringify(g)}≠${JSON.stringify(w)}`);
    };
    eq("date", e.date, want.date);
    eq("solo", e.solo, want.solo);
    eq("time", e.time, want.time);
    eq("count", e.count, want.count);
    eq("partner", e.partnerName, want.partner);
    eq("unsure", Boolean(e.partnerUnsure), want.unsure);
    eq("place", e.place, want.place);
    eq("intensity", e.intensity, want.intensity);
    eq("energy", e.energy, want.energy);
    eq("overall", e.overall, want.overall);
    eq("duration", e.durationMins, want.duration);
    if (want.positions && !same(e.positions, want.positions)) bad.push(`positions ${JSON.stringify(e.positions)}≠${JSON.stringify(want.positions)}`);
    if (want.contraception && !same(e.contraception, want.contraception)) bad.push(`contra ${JSON.stringify(e.contraception)}≠${JSON.stringify(want.contraception)}`);
    if (want.problems && !same(e.problems, want.problems)) bad.push(`problems ${JSON.stringify(e.problems)}≠${JSON.stringify(want.problems)}`);
    if (want.alts && !want.alts.every((a) => (e.partnerAlts ?? []).includes(a))) bad.push(`alts ${JSON.stringify(e.partnerAlts)}`);
    if (want.minIntensity && e.intensity < want.minIntensity) bad.push(`intensity ${e.intensity}<${want.minIntensity}`);
    if (want.minConnection && e.connection < want.minConnection) bad.push(`connection ${e.connection}<${want.minConnection}`);
    if (want.minSatisfaction && e.satisfaction < want.minSatisfaction) bad.push(`satisfaction ${e.satisfaction}<${want.minSatisfaction}`);
    if (want.minEnergy && e.energy < want.minEnergy) bad.push(`energy ${e.energy}<${want.minEnergy}`);
    if (want.noteIsWhole && e.notes !== e.source.replace(/\s+/g, " ").trim()) bad.push(`note not whole: ${JSON.stringify(e.notes.slice(0, 60))}`);
    for (const frag of want.noteHas ?? []) if (!e.notes.includes(frag)) bad.push(`note lacks ${JSON.stringify(frag)}`);
    for (const frag of want.noteNot ?? []) if (e.notes.includes(frag)) bad.push(`note still has ${JSON.stringify(frag)}`);
  }
  if (bad.length) {
    fail += 1;
    console.log(`FAIL ${name}: ${bad.join("; ")}`);
  } else pass += 1;
}

const ITEM34 =
  "34. Sept 21. I met Ana 2 years ago. 9:16 de la noche, esperando por Lucia. Este ha sido quizás uno de los días más esperados, puesto que ella estuvo en su periodo menstrual y estuvimos intercambiando mensajes muy sugestivos en el chat. Twice, no difficulties to get an erection. The first time was full in intensity and full of a burning desire. The second time was more pleasurable to me, with the orgasm.";
// The note is the whole diary text EXCEPT its bare opening date sentence: since Nov 9 2026 the
// captured date is not restated in the note (Oscar's echo rule). Every story sentence survives.
const item34 = { n: 1, date: "2026-09-21", time: "21:16", count: 2, partner: "Lucia", minIntensity: 4, minSatisfaction: 3, noteHas: ["I met Ana 2 years ago", "esperando por Lucia", "Este ha sido quizás", "The second time was more pleasurable"], noteNot: ["Sept 21"], alts: ["Ana"] } as const;

// ---- the reported item, with and without saved partners
check("item 34, nobody saved", ITEM34, { ...item34 });
check("item 34, Ana+Lucia saved", ITEM34, { ...item34, unsure: false }, KNOWN);
check("item 34, only Ana saved", ITEM34, { ...item34 }, { partners: ["Ana"] });
{
  const e = parseBatch(ITEM34, NOW, KNOWN)[0];
  const ok = e && !e.problems.includes("erection") && !e.problems.includes("irritation");
  if (ok) pass += 1; else { fail += 1; console.log("FAIL item 34: erection/irritation should not be problems", e?.problems); }
}
// ---- inside a list of three
check(
  "item 34 inside a list",
  `33. Sept 19 con Ana en la cama, una vez.\n${ITEM34}\n35. Set. 23, 10:30 pm with Lucia, dos veces, misionero y doggy, con condón.`,
  { n: 3, date: "2026-09-21", time: "21:16", count: 2, partner: "Lucia" },
  {},
  1,
);
check(
  "item 35 Set. abbreviation",
  `33. Sept 19 con Ana en la cama, una vez.\n${ITEM34}\n35. Set. 23, 10:30 pm with Lucia, dos veces, misionero y doggy, con condón.`,
  { n: 3, date: "2026-09-23", time: "22:30", count: 2, partner: "Lucia", positions: ["Missionary", "Doggy"], contraception: ["condom"] },
  {},
  2,
);
check(
  "item 33 es",
  `33. Sept 19 con Ana en la cama, una vez.\n${ITEM34}`,
  { n: 2, date: "2026-09-19", count: 1, partner: "Ana", place: "Bedroom" },
);

// ---- months and times, both languages and mixes
check("Sept. + de la mañana", "Sept. 5, 7:40 de la mañana con Lucia en la ducha", { date: "2026-09-05", time: "07:40", partner: "Lucia", place: "Shower" });
check("de set. + 3 de la tarde, en words", "5 de set., a las 3 de la tarde, with Ana on the couch, three times", { date: "2026-09-05", time: "15:00", partner: "Ana", place: "Living room", count: 3 });
check("9.30 pm, came over, mixed positions", "Oct 2 9.30 pm, Ana came over, once, she rode me then cucharita", { date: "2026-10-02", time: "21:30", partner: "Ana", count: 1, positions: ["Cowgirl", "Spooning"] });
check("bare 9 de la noche", "Oct 3, 9 de la noche, con Lucia", { date: "2026-10-03", time: "21:00", partner: "Lucia" });
check("6:20 de la tarde, sin protección, de pie", "16 de octubre, 6:20 de la tarde, with Ana, sin protección, de pie contra la pared", { date: "2026-10-16", time: "18:20", partner: "Ana", contraception: ["none"], positions: ["Standing"] });
check("1 in the morning", "Oct 17 at 1 in the morning con Lucia", { date: "2026-10-17", time: "01:00", partner: "Lucia" });
check("mañana without accent", "Oct 21 manana temprano con Ana", { date: "2026-10-21", time: "06:00", partner: "Ana" });
check("ago guard keeps the date and the time", "Oct 25, 4 years ago we met; con Lucia at 10:15 pm", { n: 1, date: "2026-10-25", time: "22:15", partner: "Lucia" });
check("ago 9 is still August", "ago 9 con Ana", { date: "2026-08-09", partner: "Ana" });
check("set the mood is not September", "Oct 24 we set the mood with candles, with Ana", { n: 1, date: "2026-10-24", partner: "Ana" });

// ---- pure Spanish / pure English
check(
  "es paragraph",
  "El 3 de octubre, como a las 11 de la noche, estuve con Lucia en el hotel. Lo hicimos tres veces, sin condón, ella toma la pastilla. Muy apasionado y bien conectados.",
  { date: "2026-10-03", time: "23:00", partner: "Lucia", place: "Hotel", count: 3, contraception: ["pill"], minIntensity: 3, minConnection: 4 },
);
check(
  "en paragraph with erection trouble",
  "October 4th around 10pm with Ana in the car. Twice. Had some trouble getting an erection at first, but then it was amazing. Intense orgasm.",
  { date: "2026-10-04", time: "22:00", partner: "Ana", place: "Car", count: 2, problems: ["erection"], minSatisfaction: 4, overall: 5 },
);
check("es erection trouble", "Oct 9 con Ana, me costó tener una erección, pero después todo bien", { date: "2026-10-09", problems: ["erection"] });
check("es no erection problems", "Oct 7 a las 9 at night con Lucia, no tuve problemas con la erección, me vine dos veces", { date: "2026-10-07", time: "21:00", count: 1, problems: [], minSatisfaction: 5 });
check("en/es no climax", "Oct 10 con Lucia: no climax for me, ella sí acabó", { problems: ["climax"] });
check("en didn't have an orgasm", "Oct 19 con Ana, I didn't have an orgasm, ella tampoco", { problems: ["climax"] });
check("período with accent", "Oct 20 con Lucia, ella estaba en su período", { problems: ["period"] });

// ---- rounds: count words and ordinals in both languages
check("dos veces en el sofá, mixed", "Oct 6, we did it dos veces en el sofá with Ana", { count: 2, place: "Living room", partner: "Ana" });
check("tres veces + pulled out", "Oct 14 tres veces with Ana, pulled out", { count: 3, contraception: ["pullout"] });
check("three times + marcha atrás", "Oct 15 three times con Lucia, marcha atrás", { count: 3, contraception: ["pullout"] });
check("dos rounds", "Oct 26 dos rounds con Ana", { count: 2 });
check("un par de veces", "Oct 27 un par de veces con Lucia", { count: 2 });
check("a couple of times", "Oct 27 a couple of times with Lucia", { count: 2 });
check("round 2 was more pleasurable", "Oct 11, 2 rounds con Ana, round 2 was more pleasurable", { count: 2, minSatisfaction: 4 });
check("first/second time, no count", "Oct 13 with Ana, the first time was gentle and slow, the second time was wild", { count: 2, minEnergy: 5 });
check("primera/segunda vez es", "Oct 28 con Ana, la primera vez fue rápida, la segunda vez fue más placentera", { count: 2, minSatisfaction: 4 });
check("for the second time is not a round", "Oct 29 we went to the cabin for the second time with Lucia", { count: 1 });
check("por segunda vez is not a round", "Oct 29 fuimos a la playa por segunda vez con Lucia", { count: 1, place: "Outdoors" });

// ---- feelings, both languages and mixes
check("so connected y muy satisfecho", "Sept 30, 10 pm, una vez con Lucia, felt so connected y muy satisfecho", { minConnection: 4, minSatisfaction: 4 });
check("playa, 45 minutos, 9/10", "Oct 18, en la playa with Ana, una vez, 45 minutos, 9/10", { place: "Outdoors", duration: 45, overall: 5 });
check("deseo ardiente + intensidad máxima", "Oct 30 con Ana, puro deseo ardiente, intensidad máxima", { minIntensity: 5 });
check("so horny / muy cachonda", "Oct 31 Lucia was so horny, muy cachonda, en el carro", { minIntensity: 4, place: "Car" });

// ---- partner cues
check("waiting for (unknown name)", "Oct 22. Waiting for Lucia at 8pm, she arrived late but it was worth it.", { partner: "Lucia", time: "20:00" });
check(
  "numbered, met-remark + esperando a",
  "12. Oct 8. Hace dos años conocí a Ana. Esa noche esperando a Lucia en mi cuarto, she was so horny, full intensity, a couple of times.",
  { n: 1, date: "2026-10-08", partner: "Lucia", count: 2, minIntensity: 5, place: "Bedroom" },
  KNOWN,
);
check("arrival beats a plain mention", "7. Oct 23, Ana texted me, then Lucia came over", { n: 1, partner: "Lucia", unsure: false }, KNOWN);
check("two plain names → pick one, flag it", "7. Oct 23 en el cuarto, Ana, Lucia", { n: 1, partner: "Ana", unsure: true, alts: ["Lucia"] }, KNOWN);
check("only a met-remark → keep her, flag it", "Nov 1. I met Marta a year ago, twice tonight", { n: 1, date: "2026-11-01", partner: "Marta", unsure: true, count: 2 });

// ---- long paragraph: details late, full note kept
const LONG =
  "Oct 12. Después de un día larguísimo en el trabajo y de una cena tranquila con amigos, volvimos a casa caminando y hablando de todo un poco, riéndonos de tonterías, y ya en el cuarto con Lucia, como a las 11:45 pm, lo hicimos twice, first missionary then from behind, with a condom, y fue increíble.";
check("long es/en paragraph", LONG, { n: 1, date: "2026-10-12", time: "23:45", partner: "Lucia", count: 2, place: "Bedroom", positions: ["Missionary", "Doggy"], contraception: ["condom"], overall: 5, noteHas: ["Después de un día larguísimo", "y fue increíble"], noteNot: ["Oct 12"] });
check("short entry keeps a clean note", "Oct 5 con Ana en la cama, una vez, condón", { noteHas: [] });


// ---- sentence-level code-switching, every field
check("mix: a las 10 pm + en la cama + with a condom", "Oct 1 a las 10 pm en la cama with a condom, con Ana", { date: "2026-10-01", time: "22:00", place: "Bedroom", contraception: ["condom"], partner: "Ana" });
check("mix: at 10 de la noche", "Oct 2 at 10 de la noche con Lucia", { time: "22:00", partner: "Lucia" });
check("mix: ella arriba then doggy", "Oct 3 with Ana, ella arriba then doggy style, luego misionero", { positions: ["Cowgirl", "Doggy", "Missionary"] });
check("mix: she rode me y después cucharita", "Oct 4 con Lucia, she rode me y después cucharita", { positions: ["Cowgirl", "Spooning"] });
check("mix: en el hotel at night", "Oct 5 en el hotel at night with Ana", { place: "Hotel", time: "21:00" });
check("mix: in the shower y luego en el sofá", "Oct 6 con Lucia in the shower y luego en el sofá", { place: "Shower" });
check("mix: she's on the pill / toma la pastilla", "Oct 7 con Ana, no condom, she's on la pastilla", { contraception: ["pill"] });
check("mix: DIU", "Oct 8 with Lucia, sin condón porque tiene el DIU", { contraception: ["iud"] });
check("mix: me vine afuera", "Oct 9 with Ana, me vine afuera", { contraception: ["pullout"] });
check("mix: estuve con (es cue) in an en sentence", "Oct 10 estuve con Lucia at her place, twice", { partner: "Lucia", count: 2 });
check("mix: vino Lucia", "Oct 11 at 9pm vino Lucia y lo hicimos once", { partner: "Lucia", time: "21:00", count: 1 });
check("mix: waited for Ana en el carro", "Oct 12 waited for Ana en el carro, dos veces", { partner: "Ana", place: "Car", count: 2 });
check("mix: feelings so intense y muy conectados", "Oct 13 con Ana, so intense y muy conectados, really satisfied", { minIntensity: 4, minConnection: 4, minSatisfaction: 3 });
check("mix: relajados and playful", "Oct 14 with Lucia, relajados and playful", { minEnergy: 3 });
check("mix: 30 min + media hora", "Oct 15 con Ana, media hora, in the bedroom", { duration: 30, place: "Bedroom" });
check("mix: no pude terminar / couldn't finish", "Oct 16 with Lucia, no pude terminar, too tired", { problems: ["climax", "fatigue"] });
check("mix: hard time getting hard", "Oct 17 with Ana, had a hard time getting hard pero luego bien", { problems: ["erection"] });
check("mix: sin problemas de erección + orgasmo intenso", "Oct 18 con Lucia, sin problemas de erección, orgasmo intenso", { problems: [], minSatisfaction: 4 });
check("mix: lunes en la noche twice", "Oct 19, el lunes en la noche with Ana, twice", { date: "2026-10-19", count: 2, time: "21:00" });
check("mix: Oct 20th, a eso de las 11", "Oct 20th, a eso de las 11, con Lucia", { date: "2026-10-20", time: "23:00" });
check("es: 21 de octubre en la madrugada", "21 de octubre en la madrugada con Ana, en el sillón, sin protección", { date: "2026-10-21", time: "02:00", place: "Living room", contraception: ["none"] });
check("en: on Oct 22 at 11:30 p.m.", "On Oct 22 at 11:30 p.m. with Lucia, in the car, condom, 8/10", { time: "23:30", place: "Car", contraception: ["condom"], overall: 4 });

// ---- solo is a conclusion of absence: a solo marker never outvotes another person on stage
check("solo: preliminary act, she takes part", "Oct 23. I masturbated before, at home. In the car. She stimulated me and I made her finish.", { solo: false, place: "Car" });
check("solo: nobody else on stage", "Oct 24. I masturbated at home, alone in bed.", { solo: true });
check("solo: me toque solo", "25 de octubre. Me toque solo en casa.", { solo: true });

// ---- never an empty encounter
const empty = all.filter((e) => !e.notes.trim() && !e.partnerName && !e.place && !e.positions.length && !e.contraception.length && !e.problems.length && !e.overall && !e.intensity && !e.connection && !e.satisfaction && !e.energy && !e.durationMins && !e.timeStated);
if (empty.length) { fail += 1; console.log("FAIL empty encounters:", empty.length, empty.map((e) => e.date)); } else pass += 1;

console.log(`batch-mixed: ${pass}/${pass + fail}`);
if (fail) process.exit(1);
