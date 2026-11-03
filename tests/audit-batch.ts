// AUDIT (fake data only): batch reader expectations across EN/ES/Spanglish reports.
import { parseBatch } from "../src/lib/vela/batch";
const now = new Date("2026-11-02T12:00:00"); // Monday
const ctx = { partners: ["Fakeana", "Fakelu", "Fakemar"] };
let pass = 0, fail = 0; const fails: string[] = [];
type Want = { n?: number; dates?: string[]; counts?: number[]; partners?: string[]; places?: string[]; overall?: number[]; dur?: number[]; times?: string[]; nextDay?: boolean[]; contra?: string[][]; problems?: string[][]; positions?: string[][] };
function check(name: string, text: string, want: Want) {
  const got = parseBatch(text, now, ctx);
  const errs: string[] = [];
  if (want.n !== undefined && got.length !== want.n) errs.push(`n ${got.length}≠${want.n}`);
  const cmp = (k: string, arr: any[] | undefined, f: (e: any) => any) => {
    if (!arr) return; arr.forEach((w, i) => { const g = got[i] ? f(got[i]) : undefined; if (JSON.stringify(g) !== JSON.stringify(w)) errs.push(`${k}[${i}] ${JSON.stringify(g)}≠${JSON.stringify(w)}`); });
  };
  cmp("date", want.dates, (e) => e.date); cmp("count", want.counts, (e) => e.count); cmp("partner", want.partners, (e) => e.partnerName);
  cmp("place", want.places, (e) => e.place); cmp("overall", want.overall, (e) => e.overall); cmp("dur", want.dur, (e) => e.durationMins);
  cmp("time", want.times, (e) => e.time); cmp("nextDay", want.nextDay, (e) => e.nextDay); cmp("contra", want.contra, (e) => e.contraception);
  cmp("problems", want.problems, (e) => e.problems); cmp("positions", want.positions, (e) => e.positions);
  if (errs.length) { fail++; fails.push(`FAIL ${name}: ${errs.join("; ")}\n   got=${JSON.stringify(got.map(e=>({d:e.date,c:e.count,p:e.partnerName,pl:e.place,t:e.time,o:e.overall,dur:e.durationMins,nd:e.nextDay,con:e.contraception,pr:e.problems,pos:e.positions,notes:e.notes})))}`); }
  else pass++;
}
// relative dates
check("last night", "Last night with Fakeana in the bedroom, twice, 8/10", { n: 1, dates: ["2026-11-01"], counts: [2], partners: ["Fakeana"], places: ["Bedroom"] });
check("anoche es", "Anoche con Fakelu en el sofá, dos veces", { n: 1, dates: ["2026-11-01"], counts: [2], partners: ["Fakelu"] });
check("hace 3 dias", "hace 3 días con Fakemar en la ducha", { n: 1, dates: ["2026-10-30"], partners: ["Fakemar"], places: ["Shower"] });
check("Saturday", "Saturday night at the hotel with Fakeana, 3 rounds", { n: 1, dates: ["2026-10-31"], counts: [3], places: ["Hotel"] });
check("el sábado", "el sábado en el carro con Fakelu", { n: 1, dates: ["2026-10-31"], places: ["Car"] });
check("yesterday morning", "yesterday morning quickie, 10 min", { n: 1, dates: ["2026-11-01"], dur: [10] });
check("ayer", "ayer por la tarde, 45 minutos, 4 estrellas", { n: 1, dates: ["2026-11-01"], dur: [45] });
check("antier", "antier con Fakeana", { n: 1, dates: ["2026-10-31"] });
check("anteayer", "anteayer con Fakeana", { n: 1, dates: ["2026-10-31"] });
check("two days ago", "two days ago with Fakelu", { n: 1, dates: ["2026-10-31"] });
check("3 days ago", "3 days ago with Fakelu, condom", { n: 1, dates: ["2026-10-30"] });
check("last friday", "last Friday with Fakemar", { n: 1, dates: ["2026-10-30"] });
check("el viernes pasado", "el viernes pasado con Fakemar", { n: 1, dates: ["2026-10-30"] });
check("this morning", "this morning with Fakeana before work", { n: 1, dates: ["2026-11-02"] });
check("today es hoy", "hoy en la mañana con Fakeana", { n: 1, dates: ["2026-11-02"] });
// explicit dates
check("Oct 28", "Oct 28 with Fakeana, 9pm, bedroom", { n: 1, dates: ["2026-10-28"], times: ["21:00"] });
check("28 de octubre", "28 de octubre con Fakelu a las 10 de la noche", { n: 1, dates: ["2026-10-28"], times: ["22:00"] });
check("10/28", "10/28 with Fakeana", { n: 1, dates: ["2026-10-28"] });
check("Dec 31 last year", "Dec 31 with Fakeana, new years", { n: 1, dates: ["2025-12-31"] });
check("future date no year", "Nov 20 with Fakeana", { n: 1 });
// rounds
check("twice", "Oct 29 twice with Fakelu", { counts: [2] });
check("tres veces", "29 de octubre tres veces con Fakelu", { counts: [3] });
check("2x", "Oct 29 2x with Fakelu", { counts: [2] });
check("round 2 later", "Oct 29 with Fakelu in the car, then round 2 at home", { n: 1, counts: [2] });
check("once", "Oct 29 once, Fakelu", { counts: [1] });
// numbered lists, multi partners
check("numbered multi partner", "1. Oct 25 Fakeana bedroom\n2) Oct 27 Fakelu couch twice\n(3) Oct 29 Fakemar shower\n#4 Oct 30 solo", { n: 4, dates: ["2026-10-25", "2026-10-27", "2026-10-29", "2026-10-30"], partners: ["Fakeana", "Fakelu", "Fakemar", ""], counts: [1, 2, 1, 1] });
check("es list", "Esta semana:\n1. lunes con Fakeana en la cama\n2. miércoles con Fakelu, dos veces\n3. viernes con Fakemar en el carro", { n: 3, dates: ["2026-10-26", "2026-10-28", "2026-10-30"], partners: ["Fakeana", "Fakelu", "Fakemar"], counts: [1, 2, 1] });
check("multi-line no numbers", "Oct 25 with Fakeana in bed\nOct 27 with Fakelu on the couch\nOct 29 with Fakemar in the shower", { n: 3, partners: ["Fakeana", "Fakelu", "Fakemar"] });
check("two partners one line", "Oct 25 with Fakeana and then Oct 26 with Fakelu", { n: 2, partners: ["Fakeana", "Fakelu"], dates: ["2026-10-25", "2026-10-26"] });
check("spanglish", "Last Saturday con Fakeana en el hotel, fue amazing, 9/10, con condón", { n: 1, dates: ["2026-10-31"], places: ["Hotel"], partners: ["Fakeana"] });
check("lowercase partner", "oct 25 with fakeana", { partners: ["Fakeana"] });
check("typo partner", "oct 25 with Fakeanna", { partners: ["Fakeana"] });
check("possessive", "Oct 25 at Fakelu's place", { partners: ["Fakelu"] });
// ratings
check("8/10", "Oct 25 Fakeana 8/10", { overall: [4] });
check("4 stars", "Oct 25 Fakeana 4 stars", { overall: [4] });
check("5 estrellas", "25 de octubre Fakeana 5 estrellas", { overall: [5] });
check("10/10", "Oct 25 Fakeana 10/10", { overall: [5] });
check("3/5", "Oct 25 Fakeana 3/5", { overall: [3] });
// durations
check("1 hour", "Oct 25 Fakeana 1 hour", { dur: [60] });
check("an hour and a half", "Oct 25 Fakeana an hour and a half", { dur: [90] });
check("hora y media", "25 de octubre Fakeana hora y media", { dur: [90] });
check("20 mins", "Oct 25 Fakeana 20 mins", { dur: [20] });
// next day
check("past midnight", "Oct 25 at 11pm with Fakeana, went until 2am, twice", { nextDay: [true], counts: [2] });
check("next day morning", "Friday night with Fakelu and again the next morning", { n: 1, counts: [2], nextDay: [true] });
check("al día siguiente", "el viernes en la noche con Fakelu y otra vez al día siguiente en la mañana", { n: 1, counts: [2], nextDay: [true] });
// protection / problems / negations
check("no condom", "Oct 25 Fakeana, no condom, pill", { contra: [["Pill"]] });
check("sin condon", "25 de octubre Fakeana sin condón", { contra: [[]] });
check("condom broke", "Oct 25 Fakeana, condom broke", {});
check("pain", "Oct 25 Fakeana, some pain afterwards", {});
// times
check("rounds times", "Oct 25 Fakeana at 10pm and again at 1am", { counts: [2] });
check("noon", "Oct 25 at noon with Fakeana", { times: ["12:00"] });
check("mediodia", "25 de octubre al mediodía con Fakeana", { times: ["12:00"] });
check("madrugada", "25 de octubre a las 3 de la madrugada con Fakeana", { times: ["03:00"] });
console.log(fails.join("\n"));
console.log(`audit-batch: ${pass}/${pass + fail}`);
