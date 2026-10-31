// Natural-language batch reader check. Run: node tests/run-batch-nl.mjs [-v]
import { parseBatch } from "../src/lib/vela/batch";
import { CASES, CTX, HOLDOUT, NOW } from "./batch-nl-cases";
import { score } from "./batch-score";

const verbose = process.argv.includes("-v");
const dump = process.argv.includes("--dump");
const set = process.argv.includes("--holdout") ? HOLDOUT : process.argv.includes("--all") ? [...CASES, ...HOLDOUT] : CASES;
const result = score(
  (text) =>
    parseBatch(text, NOW, CTX).map((e) => ({
      date: e.date,
      time: e.time,
      count: e.count,
      nextDay: e.nextDay,
      partner: e.partnerName,
      place: e.place,
      duration: e.durationMins,
      positions: e.positions,
      contraception: e.contraception,
      problems: e.problems,
      intensity: e.intensity,
      connection: e.connection,
      satisfaction: e.satisfaction,
      energy: e.energy,
      overall: e.overall,
      notes: e.notes,
    })),
  verbose,
  set,
);
console.log(result.rows.join("\n"));
if (dump) for (const c of set) console.log("\n# " + c.name + "\n" + JSON.stringify(parseBatch(c.text, NOW, CTX).map(({ source, ...rest }) => rest)));
const pct = result.ok / result.n;
if (pct < 0.95) {
  console.error(`batch-nl: accuracy ${(pct * 100).toFixed(1)}% is below 95%`);
  process.exit(1);
}
console.log("batch-nl: ok");
