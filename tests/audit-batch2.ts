// AUDIT (fake data only): trickier batch reader inputs; prints readings for review.
import { parseBatch } from "../src/lib/vela/batch";
const now = new Date("2026-11-02T12:00:00");
const ctx = { partners: ["Fakeana", "Fakelu", "Fakemar"] };
const cases = [
  "Oct 25 with Fakeana. Oct 25 later with Fakelu",
  "Oct 25 with Fakeana and Fakelu (threesome)",
  "with Fakenueva on Oct 20, first time",
  "conocí a Fakenueva el 20 de octubre, primera vez",
  "the 28th with Fakeana",
  "el 28 con Fakeana",
  "2/11 con Fakeana",
  "11/2 with Fakeana",
  "hace una semana con Fakeana",
  "last week with Fakelu",
  "el finde con Fakemar, 3 veces",
  "this weekend with Fakemar",
  "Halloween with Fakeana in costume",
  "Oct 31 9pm bedroom; Nov 1 1am again",
  "1. Oct 25 Fakeana 8/10\n2. Oct 25 Fakeana again 9/10",
  "Fakeana: Oct 25 twice, Oct 27 once\nFakelu: Oct 28 3 times",
  "oct 25 fakeana 2 rounds 7/10 15 min each",
  "Oct 25 Fakeana, didn't use condom, she was on the pill, no pain",
  "Oct 25 Fakeana, sin protección, me dolió un poco",
  "Oct 25 Fakeana doggy then missionary then cowgirl",
  "25 oct Fakeana perrito y misionero",
  "Oct 25 Fakeana 1 hr 8/10 hotel 2x condom",
  "On Monday Fakeana, on Tuesday Fakelu, on Wednesday Fakemar",
  "lunes Fakeana, martes Fakelu, miércoles Fakemar",
  "1. 25/10 Fakeana\n2. 26/10 Fakelu",
  "yesterday x3 lol with fakelu",
  "Oct 25 - Oct 26 weekend getaway with Fakeana, 5 times total",
  "Sept 30 Fakeana",
  "Sep 31 Fakeana",
];
for (const c of cases) {
  const got = parseBatch(c, now, ctx);
  console.log("\n>> " + c.replace(/\n/g, " ⏎ "));
  for (const e of got) console.log(`   ${e.date}${e.dateStated ? "" : "(assumed)"} x${e.count} [${e.partnerName}] ${e.time}${e.timeStated?"":"*"} times=${e.times.join(",")} place=${e.place} pos=${e.positions.join("+")} con=${e.contraception.join("+")} prob=${e.problems.join("+")} dur=${e.durationMins} ovr=${e.overall} nd=${e.nextDay} notes="${e.notes}"`);
}
