// Bundles tests/cycle-check.ts with rolldown (already a Vite dependency) and runs it.
import { execFileSync } from "node:child_process";
const out = "/tmp/vela-cycle-check.mjs";
execFileSync("node_modules/.bin/rolldown", ["tests/cycle-check.ts", "--file", out, "--format", "esm", "--platform", "node"], { stdio: "inherit" });
execFileSync("node", [out], { stdio: "inherit" });
