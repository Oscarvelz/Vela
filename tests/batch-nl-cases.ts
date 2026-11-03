// Fake, hand-written batch entries (English, Spanish, Spanglish, typos) with the
// fields a careful human would fill in. Shared by tests/batch-nl.ts and the
// before/after baseline. "now" for every case: Saturday 2026-10-31 15:31 local.
//
// Expectation rules used by the scorer:
// - list fields (positions, contraception, problems) not given => expected empty
// - ratings / duration not given => expected 0 (= "not stated")
// - partner / place not given => expected "" ; count not given => 1 ; nextDay => false
// - time is only checked when given
// - notesHas: fragments that must survive in the notes (narrative kept)
// - notesNot: fragments that must not be in notes (pure tags, so notes stay clean)

export const NOW = new Date(2026, 9, 31, 15, 31);

export const CTX = {
  partners: ["Ana", "Sofía", "Marco"],
  customPlaces: ["Cabin", "Beach house"],
  customPositions: ["Butterfly", "Tijera"],
  customProblems: ["Back pain", "Calambre"],
};

export type Expect = {
  date: string;
  time?: string;
  count?: number;
  nextDay?: boolean;
  partner?: string;
  place?: string;
  duration?: number;
  positions?: string[];
  contraception?: string[];
  problems?: string[];
  intensity?: number;
  connection?: number;
  satisfaction?: number;
  energy?: number;
  overall?: number;
  notesHas?: string[];
  notesNot?: string[];
};

export type Case = { name: string; text: string; expect: Expect[] };

export const CASES: Case[] = [
  // ---------- English, single encounter ----------
  {
    name: "en explicit date + time + tags",
    text: "Oct 28 around 11pm at the hotel with Ana. Condom. Missionary then doggy. Amazing, 9/10.",
    expect: [{ date: "2026-10-28", time: "23:00", partner: "Ana", place: "Hotel", contraception: ["condom"], positions: ["Missionary", "Doggy"], overall: 5 }],
  },
  {
    name: "en last night, no condom, she's on the pill",
    text: "Last night with Sofía in the bedroom. No condom, she's on the pill. She rode me for a while, then spooning. Felt so connected.",
    expect: [{ date: "2026-10-30", time: "21:00", partner: "Sofía", place: "Bedroom", contraception: ["pill"], positions: ["Cowgirl", "Spooning"], connection: 4, notesHas: ["She rode me for a while"] }],
  },
  {
    name: "en yesterday afternoon twice, duration",
    text: "yesterday afternoon, twice, about 45 minutes each. shower then bed. pulled out.",
    expect: [{ date: "2026-10-30", time: "15:00", count: 2, duration: 45, place: "Shower", contraception: ["pullout"] }],
  },
  {
    name: "en negations: not painful, didn't finish",
    text: "Tuesday night at home. It wasn't painful at all this time, but I didn't finish. Pretty meh honestly.",
    expect: [{ date: "2026-10-27", time: "21:00", problems: ["climax"], overall: 2, notesHas: ["wasn't painful"] }],
  },
  {
    name: "en pain + dryness, nuance kept",
    text: "Oct 26. It hurt a bit at first because she was dry, we needed more lube. After that it got better and slow and tender. 6/10",
    expect: [{ date: "2026-10-26", problems: ["pain", "dryness"], intensity: 1, overall: 3, notesHas: ["it hurt a bit at first", "got better"] }],
  },
  {
    name: "en no protection at all",
    text: "Sunday morning, no protection, oral and 69. She came twice. Wild energy, best sex ever.",
    expect: [{ date: "2026-10-25", time: "09:00", contraception: ["none"], positions: ["Oral", "69"], satisfaction: 5, energy: 5, overall: 5, notesHas: ["She came twice"] }],
  },
  {
    name: "en clock time with minutes, duration in hours",
    text: "10/29 at 10:30pm with Marco, lasted an hour and a half. Standing against the wall then reverse cowgirl. IUD. Passionate, really satisfying.",
    expect: [{ date: "2026-10-29", time: "22:30", partner: "Marco", duration: 90, positions: ["Standing", "Reverse Cowgirl"], contraception: ["iud"], intensity: 3, satisfaction: 3 }],
  },
  {
    name: "en interrupted + stress + tired",
    text: "Wednesday evening. We were both exhausted and stressed from work, then her roommate came home and interrupted us. Quick, 15 min. Not great.",
    expect: [{ date: "2026-10-28", time: "21:00", duration: 15, problems: ["fatigue", "stress", "interruption"], overall: 2, notesHas: ["roommate came home"] }],
  },
  {
    name: "en initiator, mood, lube narrative",
    text: "She initiated this time, which felt really nice. 2 days ago in the car, used lube, cowgirl. Playful and fun, we laughed a lot.",
    expect: [{ date: "2026-10-29", place: "Car", positions: ["Cowgirl"], energy: 3, notesHas: ["She initiated", "laughed a lot"] }],
  },
  {
    name: "en came too fast, couldn't get hard",
    text: "Thursday. I had a few drinks, couldn't get hard at first and then came too fast. Frustrating. 3/10",
    expect: [{ date: "2026-10-29", problems: ["alcohol", "erection", "timing"], overall: 2, notesHas: ["Frustrating"] }],
  },
  {
    name: "en without a condom (negation word 'without')",
    text: "Oct 24 at the cabin, without a condom, pull out. Lotus position, deeply connected, slow and gentle.",
    expect: [{ date: "2026-10-24", place: "Cabin", contraception: ["pullout"], positions: ["Lotus"], connection: 4, intensity: 1 }],
  },
  {
    name: "en forgot the condom",
    text: "Oct 22 night. We forgot the condom so I pulled out. Doggy style, intense.",
    expect: [{ date: "2026-10-22", time: "21:00", contraception: ["pullout"], positions: ["Doggy"], intensity: 4 }],
  },
  {
    name: "en condom broke (still used)",
    text: "Oct 20, the condom broke halfway, she's going to get plan b. Anxious the rest of the night.",
    expect: [{ date: "2026-10-20", contraception: ["condom"], problems: ["anxiety"], notesHas: ["condom broke", "plan b"] }],
  },
  {
    name: "en period + bleeding negated",
    text: "Oct 19, she was on her period, used a towel. No bleeding problems, not painful. Pretty good.",
    expect: [{ date: "2026-10-19", problems: ["period"], overall: 4 }],
  },
  {
    name: "en this morning, 8/10, custom position",
    text: "This morning, butterfly position, she said it was 8/10. Then breakfast.",
    expect: [{ date: "2026-10-31", time: "09:00", positions: ["Butterfly"], overall: 4, notesHas: ["breakfast"] }],
  },
  {
    name: "en custom problem beats preset",
    text: "Oct 18 at 9pm. Back pain again, had to stop and switch to spooning.",
    expect: [{ date: "2026-10-18", time: "21:00", positions: ["Spooning"], problems: ["Back pain"], notesHas: ["had to stop"] }],
  },
  {
    name: "en never felt so close (not a negation)",
    text: "Oct 17. Never felt so close to her, lots of eye contact. Profound.",
    expect: [{ date: "2026-10-17", connection: 5 }],
  },
  {
    name: "en distracted, no privacy, thin walls",
    text: "Oct 16 at her parents house, little privacy, thin walls, I was distracted the whole time. Meh.",
    expect: [{ date: "2026-10-16", problems: ["privacy", "distraction"], overall: 2, notesHas: ["parents house"] }],
  },
  {
    name: "en typos",
    text: "oct 15 misionary and doggie, condum, amaizing",
    expect: [{ date: "2026-10-15", positions: ["Missionary", "Doggy"], contraception: ["condom"], overall: 5 }],
  },
  {
    name: "en low desire, not in the mood, mood",
    text: "Oct 14. She wasn't in the mood, low desire lately, she was in a bad mood after work. We just cuddled, oral only.",
    expect: [{ date: "2026-10-14", positions: ["Oral"], problems: ["desire", "mood"], notesHas: ["cuddled"] }],
  },
  {
    name: "en rating in stars",
    text: "Oct 13 at the beach house, 4 stars, relaxed and sweet.",
    expect: [{ date: "2026-10-13", place: "Beach house", overall: 4, energy: 2, connection: 2 }],
  },
  {
    name: "en medication",
    text: "Oct 12, I took my meds earlier (new antidepressant) and it was hard to finish. Shower sex.",
    expect: [{ date: "2026-10-12", place: "Shower", problems: ["medication", "climax"], notesHas: ["antidepressant"] }],
  },
  {
    name: "en burning / irritation, not tired",
    text: "Oct 11 evening, some burning afterwards, she felt irritated down there. We weren't tired at all.",
    expect: [{ date: "2026-10-11", time: "21:00", problems: ["irritation"], notesHas: ["burning afterwards"] }],
  },
  {
    name: "en 3 times + through next day",
    text: "Oct 9 with Ana at the hotel, 3 times, the last one the next morning.",
    expect: [{ date: "2026-10-09", partner: "Ana", place: "Hotel", count: 3, nextDay: true }],
  },
  // ---------- Spanish ----------
  {
    name: "es anoche, condón, posiciones",
    text: "Anoche con Ana en el cuarto. Usamos condón. Misionero y de perrito. Muy rico, la verdad.",
    expect: [{ date: "2026-10-30", time: "21:00", partner: "Ana", place: "Bedroom", contraception: ["condom"], positions: ["Missionary", "Doggy"], overall: 4 }],
  },
  {
    name: "es sin condón + pastilla",
    text: "El jueves en la noche, sin condón porque ella toma la pastilla. Vaquera y cucharita. Nos sentimos muy conectados.",
    expect: [{ date: "2026-10-29", time: "21:00", contraception: ["pill"], positions: ["Cowgirl", "Spooning"], connection: 4 }],
  },
  {
    name: "es sin acentos, dolio, no termine",
    text: "el martes a las 10 de la noche, me dolio un poco y no termine. regular",
    expect: [{ date: "2026-10-27", time: "22:00", problems: ["pain", "climax"], overall: 2 }],
  },
  {
    name: "es no dolió (negado)",
    text: "28 de octubre, no dolió nada, estuvo increíble, 10/10. Duró como media hora.",
    expect: [{ date: "2026-10-28", duration: 30, overall: 5 }],
  },
  {
    name: "es dos veces + ayer en la tarde",
    text: "Ayer en la tarde dos veces en la ducha, marcha atrás. Muy cansados pero felices.",
    expect: [{ date: "2026-10-30", time: "15:00", count: 2, place: "Shower", contraception: ["pullout"], problems: ["fatigue"], notesHas: ["felices"] }],
  },
  {
    name: "es DIU, de pie, intenso",
    text: "26 oct en la oficina, de pie contra el escritorio, ella tiene DIU. Súper intenso y salvaje.",
    expect: [{ date: "2026-10-26", place: "Office", positions: ["Standing"], contraception: ["iud"], intensity: 4, energy: 5 }],
  },
  {
    name: "es sin protección, 69, oral",
    text: "Antier, sin protección. Hicimos 69 y sexo oral. Delicioso, 9 de 10.",
    expect: [{ date: "2026-10-29", contraception: ["none"], positions: ["69", "Oral"], overall: 5 }],
  },
  {
    name: "es estrés, distraído, interrupción",
    text: "El domingo, yo estaba estresado y distraído, y nos interrumpieron los niños. Fue rapidito, unos 10 minutos.",
    expect: [{ date: "2026-10-25", duration: 10, problems: ["stress", "distraction", "interruption"], notesHas: ["los niños"] }],
  },
  {
    name: "es tomados, sequedad, ardor",
    text: "El miércoles después de la fiesta, estábamos tomados. Ella estaba seca y después tuvo ardor. No fue lo mejor.",
    expect: [{ date: "2026-10-28", problems: ["alcohol", "dryness", "irritation"], overall: 2, notesHas: ["después de la fiesta"] }],
  },
  {
    name: "es custom position + custom problem",
    text: "Lunes en la cabaña. Tijera y misionero. Me dio un calambre en la pierna jaja.",
    expect: [{ date: "2026-10-26", positions: ["Tijera", "Missionary"], problems: ["Calambre"], notesHas: ["pierna"] }],
  },
  {
    name: "es hace 3 días, una hora, mucho placer",
    text: "Hace 3 días con Sofia, como una hora, mucho placer, los dos terminamos. Juguetón y tierno.",
    expect: [{ date: "2026-10-28", partner: "Sofía", duration: 60, satisfaction: 4, energy: 3, intensity: 1 }],
  },
  {
    name: "es la regla, poco deseo",
    text: "3 de octubre, ella tenía la regla y poco deseo, solo cucharita. Tranquilo.",
    expect: [{ date: "2026-10-03", positions: ["Spooning"], problems: ["period", "desire"], energy: 2 }],
  },
  {
    name: "es madrugada, no usamos nada",
    text: "Hoy de madrugada, no usamos nada. Perrito. Brutal 🔥",
    expect: [{ date: "2026-10-31", time: "02:00", contraception: ["none"], positions: ["Doggy"], overall: 5 }],
  },
  // ---------- Spanglish ----------
  {
    name: "spanglish 1",
    text: "anoche con Marco, fue amazing, usamos condom, doggy y missionary, she came twice 🔥",
    expect: [{ date: "2026-10-30", time: "21:00", partner: "Marco", contraception: ["condom"], positions: ["Doggy", "Missionary"], satisfaction: 5, overall: 5 }],
  },
  {
    name: "spanglish 2 no condom pero pull out",
    text: "El viernes after the party, no condom pero hice pull out. Cowgirl, super rico, 8/10",
    expect: [{ date: "2026-10-30", contraception: ["pullout"], positions: ["Cowgirl"], overall: 4, notesHas: ["after the party"] }],
  },
  // ---------- several encounters in one paste ----------
  {
    name: "multi: lines",
    text: "Oct 1 night, missionary, condom\nOct 3 morning shower, quick\nOct 5 with Ana at the hotel, 2 times, IUD, amazing",
    expect: [
      { date: "2026-10-01", time: "21:00", positions: ["Missionary"], contraception: ["condom"] },
      { date: "2026-10-03", time: "09:00", place: "Shower" },
      { date: "2026-10-05", partner: "Ana", place: "Hotel", count: 2, contraception: ["iud"], overall: 5 },
    ],
  },
  {
    name: "multi: one paragraph, relative days",
    text: "Last night we did it in the living room, she was on top, so good. This morning again in the shower, slow and sleepy.",
    expect: [
      { date: "2026-10-30", time: "21:00", place: "Living room", positions: ["Cowgirl"], overall: 4 },
      { date: "2026-10-31", time: "09:00", place: "Shower", intensity: 1, energy: 1 },
    ],
  },
  {
    name: "multi: spanish paragraph",
    text: "El sábado pasado en el carro, rapidito. El domingo en la noche en la cama con condón, misionero, muy conectados y satisfechos.",
    expect: [
      { date: "2026-10-24", place: "Car" },
      { date: "2026-10-25", time: "21:00", place: "Bedroom", contraception: ["condom"], positions: ["Missionary"], connection: 4, satisfaction: 3 },
    ],
  },
  {
    name: "multi: old style ordinals with year",
    text: "1st time. Mar 3rd, 2024 at night at home. (Once)\n\n2nd time. Mar 12th in the afternoon at a hotel. (Twice)\n\n3rd time. Mar 20th at the beach. (Three times, the next day.). Condom.",
    expect: [
      { date: "2024-03-03", time: "21:00" },
      { date: "2024-03-12", time: "15:00", count: 2, place: "Hotel" },
      { date: "2024-03-20", count: 3, nextDay: true, place: "Outdoors", contraception: ["condom"] },
    ],
  },
  {
    name: "multi: semicolons + explicit dates",
    text: "Oct 2 9pm doggy; Oct 4 around 1am cowgirl, no condom, pill; Oct 6 lunch break in the car",
    expect: [
      { date: "2026-10-02", time: "21:00", positions: ["Doggy"] },
      { date: "2026-10-04", time: "01:00", positions: ["Cowgirl"], contraception: ["pill"] },
      { date: "2026-10-06", time: "13:00", place: "Car" },
    ],
  },
  {
    name: "en continuation line folds into previous",
    text: "Oct 7 at the hotel, missionary.\nShe said it was the best night of her life. Condom.",
    expect: [{ date: "2026-10-07", place: "Hotel", positions: ["Missionary"], contraception: ["condom"], overall: 5, notesHas: ["best night of her life"] }],
  },
  {
    name: "en no date at all -> today, nothing invented",
    text: "Quick one before work, spooning, gentle.",
    expect: [{ date: "2026-10-31", positions: ["Spooning"], intensity: 1, notesHas: ["before work"] }],
  },
  {
    name: "es tres veces + 'al día siguiente'",
    text: "10 de octubre en la playa con Sofía, tres veces, la última al día siguiente. Sin condón, ella tiene implante.",
    expect: [{ date: "2026-10-10", partner: "Sofía", place: "Outdoors", count: 3, nextDay: true, contraception: ["implant"] }],
  },
  {
    name: "en unknown partner via 'with'",
    text: "Oct 21 with Laura at her place, condom. She was nervous at first.",
    expect: [{ date: "2026-10-21", partner: "Laura", contraception: ["condom"], problems: ["anxiety"], notesHas: ["nervous at first"] }],
  },
  {
    name: "en 'not bad', round two",
    text: "Oct 8 around 10, missionary, not bad. Round two an hour later, doggy.",
    expect: [{ date: "2026-10-08", time: "22:00", count: 2, positions: ["Missionary", "Doggy"], overall: 3 }],
  },
  // Audit M5–M8 (Nov 2 2026): bare Spanish day, d/m in Spanish, weekends, ranges, second partner, again, solo.
  { name: "es el 28", text: "el 28 con Ana", expect: [{ date: "2026-10-28", partner: "Ana" }] },
  { name: "es d/m 5/9", text: "5/9 con Ana dos veces", expect: [{ date: "2026-09-05", partner: "Ana", count: 2 }] },
  { name: "en m/d 5/9 stays", text: "5/9 with Ana", expect: [{ date: "2026-05-09", partner: "Ana" }] },
  { name: "es el finde", text: "el finde con Marco", expect: [{ date: "2026-10-31", partner: "Marco" }] },
  { name: "en last weekend (on a Saturday = the one before)", text: "last weekend with Ana", expect: [{ date: "2026-10-24", partner: "Ana" }] },
  { name: "es este fin de semana", text: "este fin de semana con Sofía", expect: [{ date: "2026-10-31", partner: "Sofía" }] },
  { name: "es del 1 al 3", text: "del 1 al 3 con Ana", expect: [{ date: "2026-10-01", partner: "Ana", count: 3 }] },
  { name: "en Oct 1-3", text: "Oct 1-3 with Marco", expect: [{ date: "2026-10-01", partner: "Marco", count: 3 }] },
  { name: "en range with total", text: "Oct 25 - Oct 26 getaway with Ana, 5 times total", expect: [{ date: "2026-10-25", partner: "Ana", count: 5, notesHas: ["getaway"] }] },
  { name: "en second partner same day", text: "Oct 25 with Ana. Oct 25 later with Marco", expect: [{ date: "2026-10-25", partner: "Ana" }, { date: "2026-10-25", partner: "Marco", notesHas: ["later"] }] },
  { name: "en partner headings", text: "Ana: Oct 25 twice, Oct 27 once\nMarco: Oct 28 3 times", expect: [{ date: "2026-10-25", partner: "Ana", count: 2 }, { date: "2026-10-27", partner: "Ana" }, { date: "2026-10-28", partner: "Marco", count: 3 }] },
  { name: "en again at 1am", text: "Oct 29 with Ana at 10pm and again at 1am", expect: [{ date: "2026-10-29", partner: "Ana", time: "22:00", count: 2, nextDay: true }] },
  { name: "en again the next morning", text: "Oct 28 with Marco, again the next morning", expect: [{ date: "2026-10-28", partner: "Marco", count: 2, nextDay: true }] },
  { name: "es otra vez al dia siguiente", text: "anoche con Sofía y otra vez a la mañana siguiente", expect: [{ date: "2026-10-30", partner: "Sofía", count: 2, nextDay: true }] },
  { name: "en solo item gets no partner", text: "#1 Oct 29 with Ana\n#2 Oct 30 solo", expect: [{ date: "2026-10-29", partner: "Ana" }, { date: "2026-10-30", partner: "" }] },
  { name: "es solo una vez is not solo", text: "solo una vez con Ana ayer", expect: [{ date: "2026-10-30", partner: "Ana" }] },
];

// Held-out set: written after the reader was tuned on CASES, to measure how it
// generalises to phrasing it was not built around. Same scoring rules.
export const HOLDOUT: Case[] = [
  {
    name: "ho en friday evening couch",
    text: "Friday evening on the couch with Ana, she started it. Took about 25 mins. Condoms. Super hot, would rate 9/10.",
    expect: [{ date: "2026-10-30", time: "21:00", partner: "Ana", place: "Living room", duration: 25, contraception: ["condom"], intensity: 3, overall: 5, notesHas: ["she started it"] }],
  },
  {
    name: "ho es el lunes pasado",
    text: "El lunes pasado como a las 11 de la noche con Marco en su carro. Sin condón, me salí a tiempo. Estuvo bueno pero me dolía la espalda.",
    expect: [{ date: "2026-10-26", time: "23:00", partner: "Marco", place: "Car", problems: ["pain"], notesHas: ["me sali a tiempo"] }],
  },
  {
    name: "ho en two days ago twice + orgasm",
    text: "two days ago, did it twice, first in the shower then in bed. I finished both times, she didn't the second time. Pretty relaxed vibe.",
    expect: [{ date: "2026-10-29", count: 2, place: "Shower", problems: ["climax"], energy: 2, notesHas: ["she didn't the second time"] }],
  },
  {
    name: "ho en last saturday hotel nervous",
    text: "Last Saturday at a motel. First time with Marco, I was really nervous and it was a little painful. We used a condom. He was super sweet about it.",
    expect: [{ date: "2026-10-24", partner: "Marco", place: "Hotel", contraception: ["condom"], problems: ["anxiety", "pain"], connection: 2, notesHas: ["First time with Marco"] }],
  },
  {
    name: "ho es ayer madrugada sin ganas",
    text: "ayer como a las 2 de la madrugada, yo no tenía muchas ganas pero se dio. Cucharita, lento. Nada especial.",
    expect: [{ date: "2026-10-30", time: "02:00", positions: ["Spooning"], intensity: 1, overall: 2, notesHas: ["se dio"] }],
  },
  {
    name: "ho en wed 69 + oral + iud",
    text: "Wed night: oral for her, then 69, then missionary. She has the IUD so no condom. Wild. 10/10.",
    expect: [{ date: "2026-10-28", time: "21:00", positions: ["Oral", "69", "Missionary"], contraception: ["iud"], energy: 5, overall: 5 }],
  },
  {
    name: "ho spanglish tired",
    text: "Hoy en la mañana, both of us were tired pero igual. Spooning, super chill, como 20 min.",
    expect: [{ date: "2026-10-31", time: "09:00", positions: ["Spooning"], duration: 20, problems: ["fatigue"], energy: 2 }],
  },
  {
    name: "ho en no pain no lube needed",
    text: "Oct 23, no pain this time and no lube needed. Doggy and cowgirl. Really good.",
    expect: [{ date: "2026-10-23", positions: ["Doggy", "Cowgirl"], overall: 4 }],
  },
  {
    name: "ho es dos encuentros en un parrafo",
    text: "El jueves en la oficina, rapidito y de pie. El viernes en la noche ya en casa con calma, misionero, nos sentimos súper conectados.",
    expect: [
      { date: "2026-10-29", place: "Office", positions: ["Standing"] },
      { date: "2026-10-30", time: "21:00", positions: ["Missionary"], connection: 4, notesHas: ["en casa con calma"] },
    ],
  },
  {
    name: "ho en three lines",
    text: "Oct 12 - shower, quick, no condom\nOct 14 - bed, gentle, condom, 7/10\nOct 15 - car lol, crazy, pulled out",
    expect: [
      { date: "2026-10-12", place: "Shower" },
      { date: "2026-10-14", place: "Bedroom", intensity: 1, contraception: ["condom"], overall: 4 },
      { date: "2026-10-15", place: "Car", energy: 5, contraception: ["pullout"] },
    ],
  },
  {
    name: "ho es borracha, interrumpidos",
    text: "Sábado 17 de octubre, después de la boda, los dos medio borrachos. Nos interrumpió su hermana tocando la puerta. Igual estuvo rico.",
    expect: [{ date: "2026-10-17", problems: ["alcohol", "interruption"], overall: 4, notesHas: ["después de la boda"] }],
  },
  {
    name: "ho en period + towel + bleeding",
    text: "Oct 5, she's on her period so we put a towel down. A bit of bleeding but no pain. Intimate and slow.",
    expect: [{ date: "2026-10-05", problems: ["period", "bleeding"], connection: 4, intensity: 1, notesHas: ["towel"] }],
  },
  {
    name: "ho en erection medication",
    text: "Oct 4 around 8. Took half a viagra, still lost my erection once. Annoying but she was understanding. 5/10",
    expect: [{ date: "2026-10-04", time: "20:00", problems: ["medication", "erection"], overall: 3, notesHas: ["she was understanding"] }],
  },
  {
    name: "ho es mañana del domingo",
    text: "Domingo por la mañana, con Sofi en la cama, cucharita y luego ella arriba. Muy tiernos. Usamos condón.",
    expect: [{ date: "2026-10-25", time: "09:00", partner: "Sofía", place: "Bedroom", positions: ["Spooning", "Cowgirl"], intensity: 1, contraception: ["condom"] }],
  },
  {
    name: "ho en came quick, dryness, stress",
    text: "Thursday after work, stressed out. I came really quick and she wasn't wet enough. Not our best.",
    expect: [{ date: "2026-10-29", problems: ["stress", "timing", "dryness"], overall: 2 }],
  },
  {
    name: "ho en explicit date with year & time 24h",
    text: "2026-10-03 22:15, beach house, lotus, 1h, IUD, profound connection.",
    expect: [{ date: "2026-10-03", time: "22:15", place: "Beach house", positions: ["Lotus"], duration: 60, contraception: ["iud"], connection: 5 }],
  },
  {
    name: "ho es hace una semana, implante",
    text: "Hace una semana en el hotel, tres veces. Ella tiene implante. Salvaje y apasionado.",
    expect: [{ date: "2026-10-24", place: "Hotel", count: 3, contraception: ["implant"], energy: 5, intensity: 3 }],
  },
  {
    name: "ho en distracted phone, no privacy",
    text: "Sunday afternoon at his parents' place. Not much privacy and he kept checking his phone. Kind of disconnected. 2/5",
    expect: [{ date: "2026-10-25", time: "15:00", problems: ["privacy", "connection"], connection: 1, overall: 2, notesHas: ["checking his phone"] }],
  },
  {
    name: "ho typos es",
    text: "28 oct, misionero y perito, condon, increiblee",
    expect: [{ date: "2026-10-28", positions: ["Missionary", "Doggy"], contraception: ["condom"], overall: 5 }],
  },
  {
    name: "ho en irritation after",
    text: "Oct 2. Felt fine during, but itchy and irritated after. Probably the new lube.",
    expect: [{ date: "2026-10-02", problems: ["irritation"], overall: 3, notesHas: ["new lube"] }],
  },
  {
    name: "ho en tonight standing shower",
    text: "Tonight we had sex standing in the shower, hot water ran out lol. Fun, playful, 15 minutes.",
    expect: [{ date: "2026-10-31", time: "21:00", place: "Shower", positions: ["Standing"], energy: 3, duration: 15, notesHas: ["hot water ran out"] }],
  },
  {
    name: "ho es ayer + hoy temprano",
    text: "Ayer en la noche con Ana dos veces, con condón. Y hoy temprano otra vez sin nada.",
    expect: [
      { date: "2026-10-30", time: "21:00", partner: "Ana", count: 2, contraception: ["condom"] },
      { date: "2026-10-31", contraception: ["none"] },
    ],
  },
];
