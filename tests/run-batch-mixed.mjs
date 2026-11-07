// Bundles tests/batch-mixed.ts with rolldown and runs it. Fake data only.
import { execFileSync } from "node:child_process";
const out = "/tmp/vela-batch-mixed.mjs";
execFileSync("node_modules/.bin/rolldown", ["tests/batch-mixed.ts", "--file", out, "--format", "esm", "--platform", "node"], { stdio: ["ignore", "ignore", "inherit"] });
execFileSync("node", [out, ...process.argv.slice(2)], { stdio: "inherit" });
