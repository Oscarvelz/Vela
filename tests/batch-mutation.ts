/* Wave 3 fence — batch reader mutation battery.
 * Every specimen from RT-V2 (B1–B18) and RT-V2M (M8, M10–M31) as an
 * expectation, plus the hunts' controls. Fake data only.
 * now = Sun 2026-11-15 12:00, the hunts' fixed clock. */
import { parseBatch, type BatchContext, type BatchEntry } from "../src/lib/vela/batch";
import { readPregnancy } from "../src/lib/vela/pregnancy";

const NOW = new Date(2026, 10, 15, 12, 0);
const EN: BatchContext = { lang: "en", partners: ["Ana", "Lucía", "Sofía", "Marco"] };
const ES: BatchContext = { lang: "es", partners: ["Ana", "Lucía", "Sofía", "Marco"] };

let breaks = 0;
let holds = 0;
function hold(name: string) { holds += 1; console.log(`HOLD ${name}`); }
function brk(name: string, extra = "") { breaks += 1; console.log(`BREAK ${name}${extra ? " — " + extra : ""}`); }

type Expect = {
  entries?: number;
  date?: string;
  endDate?: string;
  count?: number;
  partner?: string;
  solo?: boolean;
  place?: string;
  duration?: number;
  overall?: number;
  intensity?: number;
  connection?: number;
  satisfaction?: number;
  energy?: number;
  methods?: string[];
  problems?: string[];
  positions?: string[];
  problemsNot?: string[];
  positionsNot?: string[];
  notesHas?: string;
  dateUnreadable?: boolean;
};
type Case = { name: string; text: string; ctx?: BatchContext; expect: Expect };

const CASES: Case[] = [
  // B1 — counts bind to the encounter; corrections replace
  { name: "B1a self-correction", text: "Oct 25 with Ana, three times, no wait, twice", expect: { count: 2 } },
  { name: "B1b foreign count after", text: "Oct 25 with Ana twice. Earlier that day we had eaten out 3 times at that place.", expect: { count: 2 } },
  { name: "B1c foreign count first", text: "We had dinner 2 times that week. Oct 25 with Ana once", expect: { count: 1 } },
  // B2 — again that never happened
  { name: "B2a never again", text: "Oct 25 with Ana once. We never did it again that night.", expect: { count: 1 } },
  { name: "B2b too tired again", text: "Oct 25 with Ana, once, too tired to do it again", expect: { count: 1 } },
  { name: "B2c didn't again", text: "Oct 25 with Ana once, she wanted more but we didn't do it again", expect: { count: 1 } },
  // M15/M16 — un-happened rounds, guard synonyms
  { name: "M15a almost again", text: "Oct 25 with Ana once. We almost did it again but fell asleep.", expect: { count: 1 } },
  { name: "M15b wanted again", text: "Oct 25 with Ana once, she wanted to do it again but we fell asleep", expect: { count: 1 } },
  { name: "M15c going to again", text: "Oct 25 with Ana once, we were going to do it again but the baby woke up", expect: { count: 1 } },
  { name: "M15d no second round", text: "Oct 25 with Ana once, there was no second round", expect: { count: 1 } },
  { name: "M15e casi otra vez", text: "Oct 25 con Ana, una vez, casi lo hicimos otra vez", ctx: ES, expect: { count: 1 } },
  { name: "M15f no hubo segunda ronda", text: "Oct 25 con Ana, una vez, no hubo segunda ronda", ctx: ES, expect: { count: 1 } },
  { name: "M16a a single time", text: "Oct 25 with Ana, a single time, too tired to do it again", expect: { count: 1 } },
  { name: "M16b una unica vez", text: "Oct 25 con Ana, una unica vez, no hubo segunda ronda", ctx: ES, expect: { count: 1 } },
  // M17 — Spanish second-round verbs
  { name: "M17a volvimos a hacerlo", text: "Oct 25 con Ana, una vez, y luego volvimos a hacerlo", ctx: ES, expect: { count: 2 } },
  { name: "M17b repetimos", text: "Oct 25 con Ana, una vez, despues repetimos", ctx: ES, expect: { count: 2 } },
  // M18 — additive ordinals
  { name: "M18a and a second time", text: "Oct 25 with Ana once, and a second time before sleep", expect: { count: 2 } },
  { name: "M18b y una segunda vez", text: "Oct 25 con Ana una vez, y una segunda vez antes de dormir", ctx: ES, expect: { count: 2 } },
  // B6 — the number parser
  { name: "B6a eleven times", text: "Oct 25 with Ana, eleven times", expect: { count: 11 } },
  { name: "B6b five rounds", text: "Oct 25 with Ana, five rounds", expect: { count: 5 } },
  { name: "B6c 100 times (ceiling 12)", text: "Oct 25 with Ana, 100 times", expect: { count: 12 } },
  { name: "B6d twcie", text: "Oct 25 with Ana, twcie, condom", expect: { count: 2 } },
  { name: "B6e trhee times", text: "Oct 25 with Ana, trhee times", expect: { count: 3 } },
  { name: "B6f tres vecse", text: "Oct 25 con Ana, tres vecse", ctx: ES, expect: { count: 3 } },
  // B7 — a stated zero is no session
  { name: "B7 zero times", text: "Oct 25 with Ana, 0 times, we just talked", expect: { entries: 0 } },
  // B8 — a bare range is one encounter spanning it
  { name: "B8a range no count", text: "Oct 30 - Nov 2 with Ana", expect: { entries: 1, count: 1, date: "2026-10-30", endDate: "2026-11-02" } },
  { name: "B8b short range", text: "Oct 1-3 with Ana, condom", expect: { entries: 1, count: 1, endDate: "2026-10-03" } },
  // B3 — carried years move forward only
  { name: "B3a Dec to Jan", text: "Dec 28, 2023 with Ana, twice\nJan 3 with Ana, once", expect: { entries: 2, date: "2023-12-28" } },
  { name: "B3b second entry year", text: "Oct 25 with Ana\nNov 2, 2025 with Ana\nOct 26 with Ana", expect: { entries: 3 } },
  // B5 — impossible dates are flagged, never filed under today
  { name: "B5a Feb 29", text: "Feb 29 with Ana, twice, condom", expect: { date: "2026-02-28", dateUnreadable: true } },
  { name: "B5b Feb 30", text: "Feb 30 with Ana, twice", expect: { date: "2026-02-28", dateUnreadable: true } },
  { name: "B5c April 31", text: "April 31 with Ana, twice", expect: { date: "2026-04-30", dateUnreadable: true } },
  { name: "B5d 13/13", text: "13/13/2026 with Ana, twice", expect: { dateUnreadable: true, notesHas: "13/13" } },
  { name: "B5e 31/2", text: "31/2/2026 con Ana, dos veces", ctx: ES, expect: { date: "2026-02-28", dateUnreadable: true } },
  // M29 — plural weeks
  { name: "M29a two weeks ago", text: "two weeks ago with Ana, twice", expect: { date: "2026-11-01" } },
  { name: "M29b hace dos semanas", text: "hace dos semanas con Ana, dos veces", ctx: ES, expect: { date: "2026-11-01" } },
  // M30 — between … and …
  { name: "M30 between range", text: "between Oct 25 and Oct 27 with Ana, twice", expect: { entries: 1, date: "2026-10-25", endDate: "2026-10-27", count: 2, partner: "Ana" } },
  // B9/M10 — phantoms
  { name: "B9a bare date line", text: "Oct 25 with Ana twice\nOct 27", expect: { entries: 1 } },
  { name: "B9b date alone", text: "Oct 25", expect: { entries: 0 } },
  { name: "B9c name alone", text: "Ana", expect: { entries: 0 } },
  { name: "M10 period sentence stays a note", text: "Nov 10 with Ana, twice. Her period started Nov 1.", expect: { entries: 1, date: "2026-11-10", count: 2, notesHas: "period started" } },
  // B10/M26/M27 — solo
  { name: "B10a solo, Ana away", text: "Oct 25 solo, Ana was out of town", expect: { solo: true, partner: "" } },
  { name: "B10b solo, phone we", text: "Oct 25 solo, we had talked on the phone earlier", expect: { solo: true } },
  { name: "M26a alone at the cabin", text: "Oct 25 alone at the cabin, twice, condom", expect: { solo: true } },
  { name: "M26b alone all night", text: "Oct 25 alone all night, twice", expect: { solo: true } },
  { name: "M26c solo night", text: "Oct 25, solo night, twice, condom", expect: { solo: true } },
  { name: "M26d solo en el hotel", text: "Oct 25 solo en el hotel, dos veces", ctx: ES, expect: { solo: true, place: "Hotel" } },
  { name: "M26e solo por la noche", text: "Oct 25, solo por la noche, dos veces", ctx: ES, expect: { solo: true } },
  { name: "M27a her book", text: "Oct 25 solo, her book was still on my nightstand, twice", expect: { solo: true } },
  { name: "M27b dinner we then solo", text: "Oct 25, we had dinner with friends early, then solo at home that night, twice", expect: { solo: true } },
  // B11 — function-word partners
  { name: "B11a May the verb", text: "Oct 25, may try the cabin next time, solo night", ctx: { lang: "en", partners: ["May", "Ana"] }, expect: { partner: "", solo: true } },
  { name: "B11b una the article", text: "Oct 25 una noche tranquila, dos veces", ctx: { lang: "es", partners: ["Una", "Lucía"] }, expect: { partner: "", count: 2 } },
  // B14/M28 — names
  { name: "B14a ALL CAPS Diego", text: "OCT 25 WITH DIEGO TWICE, CONDOM, AMAZING", expect: { partner: "Diego" } },
  { name: "B14b lowercase diego", text: "oct 25 diego twice hotel condom amazing", expect: { partner: "Diego" } },
  { name: "M28a Diego subject", text: "Oct 25 Diego twice at the hotel, condom", expect: { partner: "Diego" } },
  { name: "M28b Diego y yo", text: "Oct 25, Diego y yo, dos veces en el hotel", ctx: ES, expect: { partner: "Diego" } },
  // B4 — Ed / sex ed
  { name: "B4a partner Ed", text: "Oct 25 with Ed, twice, amazing night", ctx: { lang: "en", partners: ["Ana", "Ed"] }, expect: { partner: "Ed", problemsNot: ["erection"] } },
  { name: "B4b sex ed class", text: "Oct 25 with Ana, we laughed about sex ed class back in school, twice", expect: { problemsNot: ["erection"] } },
  // B12/M23 — overall verdicts judge the encounter or nothing
  { name: "B12a good night farewell", text: "Oct 25 with Ana twice, then we said good night and slept", expect: { overall: 0 } },
  { name: "B12b good morning kiss", text: "Oct 25 with Ana, good morning kiss, then coffee", expect: { overall: 0 } },
  { name: "B12c regular condom", text: "Oct 25 with Ana, used a regular condom, twice", expect: { overall: 0 } },
  { name: "B12d back to normal", text: "Oct 25 with Ana, back to normal after the fight, twice", expect: { overall: 0 } },
  { name: "B12e she looked fine", text: "Oct 25 with Ana, she looked fine in that dress, twice", expect: { overall: 0 } },
  { name: "B12f condom ok quality", text: "Oct 25 with Ana, the condom was ok quality, twice", expect: { overall: 0 } },
  { name: "B12g 5 stars hotel", text: "Oct 25 with Ana, 5 stars hotel, twice", expect: { overall: 0 } },
  { name: "M23a insane traffic", text: "Oct 25 with Ana, insane traffic on the way over, twice", expect: { overall: 0 } },
  { name: "M23b best pizza", text: "Oct 25 with Ana, we ordered the best pizza in town, twice", expect: { overall: 0 } },
  { name: "M23c perfect weather", text: "Oct 25 with Ana, perfect weather at the cabin, twice", expect: { overall: 0 } },
  // M31 — a negated verdict files nothing (flip-to-number deleted)
  { name: "M31a not amazing", text: "Oct 25 with Ana, honestly it was not amazing, twice", expect: { overall: 0 } },
  { name: "M31b not terrible", text: "Oct 25 with Ana, it was not terrible, twice", expect: { overall: 0 } },
  // B13 — period as a time span
  { name: "B13a rough period", text: "Oct 25 with Ana, we were in a rough period, felt distant", expect: { problems: ["connection"] } },
  { name: "B13b during that period", text: "Oct 25 with Ana, during that period we barely talked, twice", expect: { problemsNot: ["period"] } },
  // B15/B16/M25 — rooms, movies, shifts
  { name: "B15 room 69", text: "Oct 25, room 69 at the hotel, with Ana, twice", expect: { place: "Hotel", positionsNot: ["69"] } },
  { name: "B16 after a movie", text: "Oct 25 with Ana once, after a 2 hour movie", expect: { duration: 0 } },
  { name: "M25a works 8 hours", text: "Oct 25 with Ana, she works 8 hours a day, twice", expect: { duration: 0 } },
  { name: "M25b following a drive", text: "Oct 25 with Ana, following a 2 hour drive, twice", expect: { duration: 0 } },
  // B17/M13/M14 — negation composition & near-miss
  { name: "B17 not without", text: "Oct 25 with Ana, not without a condom, twice", expect: { methods: ["condom"] } },
  { name: "M13 almost forgot", text: "Oct 25 with Ana, she almost forgot the condom but grabbed one, twice", expect: { methods: ["condom"] } },
  { name: "M14a never without", text: "Oct 25 with Ana, we never go out without a condom, twice", expect: { methods: ["condom"] } },
  { name: "M14b nunca sin", text: "Oct 25 con Ana, nunca salimos sin condon, dos veces", ctx: ES, expect: { methods: ["condom"] } },
  // M11/M12 — negation reach
  { name: "M11a long denial EN", text: "Oct 25 with Ana, we did not at any point during the night use a condom, twice", expect: { methods: [] } },
  { name: "M11b long denial pill", text: "Oct 25 with Ana, she did not on any of those days take the pill, twice", expect: { methods: [] } },
  { name: "M11c long denial ES", text: "Oct 25 con Ana, no usamos en ningun momento de la noche un condon, dos veces", ctx: ES, expect: { methods: [] } },
  { name: "M12 denial after", text: "Oct 25 with Ana, a condom was there but not used, twice", expect: { methods: [] } },
  // M19 — positions from other domains
  { name: "M19a missionary work", text: "Oct 25 with Ana, she told me about the missionary work at her church, twice", expect: { positionsNot: ["Missionary"] } },
  { name: "M19b standing in line", text: "Oct 25 with Ana, standing in line for an hour at the fair, twice", expect: { positionsNot: ["Standing"] } },
  { name: "M19c cherry on top", text: "Oct 25 with Ana, she put the cherry on top, twice", expect: { positionsNot: ["Cowgirl"] } },
  { name: "M19d spoon utensil", text: "Oct 25 with Ana, ice cream with a spoon after dinner, twice", expect: { positionsNot: ["Spooning"] } },
  { name: "M19e perrito puppy", text: "Oct 25 con Ana, el perrito de la vecina no paraba de ladrar, dos veces", ctx: ES, expect: { positionsNot: ["Doggy"] } },
  { name: "M19f sun went down", text: "Oct 25 with Ana, the sun went down on the lake, twice", expect: { positionsNot: ["Oral"] } },
  { name: "M19g reversa car", text: "Oct 25 con Ana, metio reversa en el parqueadero, dos veces", ctx: ES, expect: { positionsNot: ["Reverse Cowgirl"] } },
  // M20 — methods from other domains
  { name: "M20a dental implant", text: "Oct 25 with Ana, she showed me her new dental implant, twice", expect: { methods: [] } },
  { name: "M20b coil spring", text: "Oct 25 with Ana, the coil spring in the mattress squeaked, twice", expect: { methods: [] } },
  { name: "M20c withdrew cash", text: "Oct 25 with Ana, I withdrew cash from the atm earlier, twice", expect: { methods: [] } },
  { name: "M20d came outside porch", text: "Oct 25 with Ana, we came outside to the porch for some air, twice", expect: { methods: [] } },
  { name: "M20e rubber boots", text: "Oct 25 with Ana, she wore rubber boots for the rain, twice", expect: { methods: [] } },
  { name: "M20f pill, for headache", text: "Oct 25 with Ana, she took a pill, for her headache, twice", expect: { methods: [] } },
  { name: "M20g pastilla, para dolor", text: "Oct 25 con Ana, se tomo una pastilla, para el dolor de cabeza, dos veces", ctx: ES, expect: { methods: [], problemsNot: ["pain"] } },
  { name: "M20h pastilla contra", text: "Oct 25 con Ana, tomo una pastilla contra el dolor, dos veces", ctx: ES, expect: { methods: [] } },
  { name: "M20i sin nada de ropa", text: "Oct 25 con Ana, sin nada de ropa, dos veces", ctx: ES, expect: { methods: [] } },
  { name: "M20j eaten nothing", text: "Oct 25 with Ana, we had eaten nothing at all that day, twice", expect: { methods: [] } },
  // M21 — problems from other domains
  { name: "M21a finish the movie", text: "Oct 25 with Ana, we didn't finish the movie, twice", expect: { problemsNot: ["climax"] } },
  { name: "M21b sister never came", text: "Oct 25 with Ana, her sister never came to the party, twice", expect: { problemsNot: ["climax"] } },
  { name: "M21c no termine el informe", text: "Oct 25 con Ana, no termine el informe hasta las diez, dos veces", ctx: ES, expect: { problemsNot: ["climax"] } },
  { name: "M21d came early to help", text: "Oct 25 with Ana, she came early to help set up, twice", expect: { problemsNot: ["timing"] } },
  { name: "M21e wifi was down", text: "Oct 25 with Ana, the wifi was down all evening, twice", expect: { problemsNot: ["mood"] } },
  { name: "M21f sad movie", text: "Oct 25 with Ana, we watched a sad movie first, twice", expect: { problemsNot: ["mood"] } },
  { name: "M21g blood pressure", text: "Oct 25 with Ana, her blood pressure was low, twice", expect: { problemsNot: ["bleeding"] } },
  { name: "M21h drank water", text: "Oct 25 with Ana, she drank two liters of water, twice", expect: { problemsNot: ["alcohol"] } },
  { name: "M21i burning candles", text: "Oct 25 with Ana, burning candles everywhere, twice", expect: { problemsNot: ["irritation"] } },
  { name: "M21j con mucho ardor", text: "Oct 25 con Ana, con mucho ardor, dos veces", ctx: ES, expect: { problemsNot: ["irritation"] } },
  { name: "M21k drained the pasta", text: "Oct 25 with Ana, she drained the pasta while I cooked, twice", expect: { problemsNot: ["fatigue"] } },
  { name: "M21l sick and tired idiom", text: "Oct 25 with Ana, sick and tired of her landlord, twice", expect: { problemsNot: ["fatigue"] } },
  { name: "M21m distant cousin", text: "Oct 25 with Ana, her distant cousin was visiting, twice", expect: { problemsNot: ["connection"], connection: 0 } },
  { name: "M21n mood for cooking", text: "Oct 25 with Ana, not in the mood for cooking so we ordered in, twice", expect: { problemsNot: ["desire"] } },
  { name: "M21o sin ganas de cocinar", text: "Oct 25 con Ana, sin ganas de cocinar, pedimos pizza, dos veces", ctx: ES, expect: { problemsNot: ["desire"] } },
  { name: "M21p rompimos la regla", text: "Oct 25 con Ana, rompimos la regla de la casa, dos veces", ctx: ES, expect: { problemsNot: ["period"] } },
  { name: "M21q dry wine", text: "Oct 25 with Ana, a bottle of dry wine with dinner, twice", expect: { problemsNot: ["dryness"] } },
  { name: "M21r pastillas garganta", text: "Oct 25 con Ana, tomo pastillas para la garganta, dos veces", ctx: ES, expect: { problemsNot: ["medication"] } },
  // M22 — ratings from other domains
  { name: "M22a she came home", text: "Oct 25 with Ana, she came home at nine, once", expect: { satisfaction: 0 } },
  { name: "M22b finished work", text: "Oct 25 with Ana, we both finished work late, once", expect: { satisfaction: 0 } },
  { name: "M22c wifi connected", text: "Oct 25 with Ana, the wifi finally connected, once", expect: { connection: 0 } },
  { name: "M22d close to her office", text: "Oct 25 with Ana, at a hotel close to her office, once", expect: { connection: 0, place: "Hotel" } },
  { name: "M22e hot chocolate", text: "Oct 25 with Ana, hot chocolate before bed, once", expect: { intensity: 0 } },
  { name: "M22f chocolate caliente", text: "Oct 25 con Ana, chocolate caliente antes de dormir, una vez", ctx: ES, expect: { intensity: 0 } },
  { name: "M22g rough day at work", text: "Oct 25 with Ana, rough day at work but a lovely night, once", expect: { intensity: 0, place: "" } },
  { name: "M22h wild rice", text: "Oct 25 with Ana, wild rice for dinner, once", expect: { energy: 0 } },
  { name: "M22i sister came twice", text: "Oct 25 with Ana once. Her sister came twice that week to visit.", expect: { satisfaction: 0, count: 1 } },
  // M24 — places
  { name: "M24a played pool", text: "Oct 25 with Ana, we played pool at the bar first, twice", expect: { place: "" } },
  { name: "M24b office party then hotel", text: "Oct 25 with Ana, the office party ran late, then the hotel, twice", expect: { place: "Hotel" } },
  // B18 — raw desire reaches its rule
  { name: "B18 raw desire", text: "Oct 25 with Ana, raw desire, twice", expect: { intensity: 4 } },
  // Controls — the hunts' holds
  { name: "C1 genuine again", text: "Oct 25 with Ana at 10pm, then we did it again at 1am", expect: { count: 2 } },
  { name: "C2 item37 canonical", text: "Oct 25 with Ana, only once, too tired to attempt a second round", expect: { count: 1 } },
  { name: "C3 went again", text: "Oct 25 with Ana once, then later we went again", expect: { count: 2 } },
  { name: "C4 ordinal restatement", text: "Oct 25 with Ana twice, the second time was slower", expect: { count: 2 } },
  { name: "C5 short denial", text: "Oct 25 with Ana, we did not use a condom, twice", expect: { methods: [] } },
  { name: "C6 label denial", text: "Oct 25 with Ana, condom: no, twice", expect: { methods: [] } },
  { name: "C7 forgot truly", text: "Oct 25 with Ana, forgot the condom again, twice", expect: { methods: [] } },
  { name: "C8 no condom, pill free", text: "Oct 25 with Ana, no condom and she is on the pill, twice", expect: { methods: ["pill"] } },
  { name: "C9 condom, not the pill", text: "Oct 25 with Ana, we used a condom and not the pill, twice", expect: { methods: ["condom"] } },
  { name: "C10 sin condon y sin pastilla", text: "Oct 25 con Ana, sin condon y sin pastilla, dos veces", ctx: ES, expect: { methods: [] } },
  { name: "C11 not only", text: "Oct 25 with Ana, not only did we use a condom, twice", expect: { methods: ["condom"] } },
  { name: "C12 positions genuine", text: "Oct 25 with Ana, missionary and then she rode me, twice", expect: { positions: ["Missionary", "Cowgirl"] } },
  { name: "C13 condom and pill", text: "Oct 25 with Ana, condom and she is on the pill, twice", expect: { methods: ["condom", "pill"] } },
  { name: "C14 period and tired", text: "Oct 25 with Ana, she was on her period and we were both tired, twice", expect: { problems: ["period", "fatigue"] } },
  { name: "C15 intense connected", text: "Oct 25 with Ana, intense and deeply connected, once", expect: { intensity: 4, connection: 4 } },
  { name: "C16 amazing night", text: "Oct 25 with Ana, an amazing night, once", expect: { overall: 5 } },
  { name: "C17 at the hotel", text: "Oct 25 with Ana, at the hotel, once", expect: { place: "Hotel" } },
  { name: "C18 back from office", text: "Oct 25 with Ana, back from the office, then the hotel, once", expect: { place: "Hotel" } },
  { name: "C19 lasted 2 hours", text: "Oct 25 with Ana, it lasted 2 hours, once", expect: { duration: 120 } },
  { name: "C20 solo en casa", text: "Oct 25 solo en casa, dos veces", ctx: ES, expect: { solo: true } },
  { name: "C21 by myself", text: "Oct 25 by myself at home, twice", expect: { solo: true } },
  { name: "C22 con Diego", text: "Oct 25 con Diego, dos veces", ctx: { lang: "es", partners: ["Ana"] }, expect: { partner: "Diego" } },
  { name: "C23 10 days ago", text: "10 days ago with Ana, twice", expect: { date: "2026-11-05" } },
  { name: "C24 to range", text: "Oct 25 to Oct 27 with Ana, twice", expect: { entries: 1, endDate: "2026-10-27", count: 2 } },
];

function check(c: Case) {
  const entries = parseBatch(c.text, NOW, c.ctx ?? EN);
  const x = c.expect;
  const problems: string[] = [];
  if (x.entries !== undefined && entries.length !== x.entries) problems.push(`entries=${entries.length}`);
  const e: BatchEntry | undefined = entries[0];
  if (x.entries !== 0) {
    if (!e) { brk(c.name, "no entry"); return; }
    if (x.date !== undefined && e.date !== x.date) problems.push(`date=${e.date}`);
    if (x.endDate !== undefined && e.endDate !== x.endDate) problems.push(`endDate=${e.endDate}`);
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
    if (x.methods !== undefined && JSON.stringify(e.contraception) !== JSON.stringify(x.methods)) problems.push(`methods=${JSON.stringify(e.contraception)}`);
    if (x.problems !== undefined && JSON.stringify(e.problems) !== JSON.stringify(x.problems)) problems.push(`problems=${JSON.stringify(e.problems)}`);
    if (x.positions !== undefined && JSON.stringify(e.positions) !== JSON.stringify(x.positions)) problems.push(`positions=${JSON.stringify(e.positions)}`);
    for (const p of x.problemsNot ?? []) if (e.problems.includes(p)) problems.push(`problems has ${p}`);
    for (const p of x.positionsNot ?? []) if (e.positions.includes(p)) problems.push(`positions has ${p}`);
    if (x.notesHas !== undefined && !e.notes.toLowerCase().includes(x.notesHas)) problems.push(`notes="${e.notes}"`);
    if (x.dateUnreadable !== undefined && Boolean(e.dateUnreadable) !== x.dateUnreadable) problems.push(`dateUnreadable=${e.dateUnreadable}`);
  }
  if (problems.length) brk(c.name, problems.join("; "));
  else hold(c.name);
}

for (const c of CASES) check(c);

// B3's moving parts need per-entry dates.
{
  const es = parseBatch("Dec 28, 2023 with Ana, twice\nJan 3 with Ana, once", NOW, EN);
  if (es.length === 2 && es[1].date === "2024-01-03") hold("B3a Jan rolls forward");
  else brk("B3a Jan rolls forward", es.map((e) => e.date).join(","));
  const es2 = parseBatch("Oct 25 with Ana\nNov 2, 2025 with Ana\nOct 26 with Ana", NOW, EN);
  if (es2.length === 3 && es2[2].date === "2026-10-26") hold("B3b carried year never moves an entry backwards");
  else brk("B3b carried year never moves an entry backwards", es2.map((e) => e.date).join(","));
}

// M8 — the pipeline: a test's repetitions are not sessions; the tests are counted whole.
{
  const entries = parseBatch("Nov 10 with Ana once. She did a pregnancy test twice, both negative.", NOW, EN);
  const reading = readPregnancy(entries);
  const t = reading.tests;
  if (entries.length === 1 && entries[0].count === 1 && t.length === 1 && t[0].result === "negative" && t[0].count === 2)
    hold("M8 test repetitions are not sessions");
  else brk("M8 test repetitions are not sessions", `entries=${entries.length} count=${entries[0]?.count} tests=${JSON.stringify(t)}`);
}

console.log(`\nBATCH-MUTATION: ${breaks} breaks, ${holds} holds`);
if (breaks > 0) process.exitCode = 1;
