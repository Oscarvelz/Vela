// Bundles tests/batch-nl.ts with rolldown (already a Vite dependency) and runs it.
import { execFileSync } from "node:child_process";
const out = "/tmp/vela-batch-nl.mjs";
execFileSync("node_modules/.bin/rolldown", ["tests/batch-nl.ts", "--file", out, "--format", "esm", "--platform", "node"], { stdio: ["ignore", "ignore", "inherit"] });
execFileSync("node", [out, ...process.argv.slice(2)], { stdio: "inherit" });
