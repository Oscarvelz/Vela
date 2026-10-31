// Bundles the cycle checks with rolldown (already a Vite dependency) and runs them:
// tests/cycle-check.ts (unit cases) then tests/cycle-consistency.ts (cross-surface sweep).
import { execFileSync } from "node:child_process";
for (const name of ["cycle-check", "cycle-consistency"]) {
  const out = `/tmp/vela-${name}.mjs`;
  execFileSync("node_modules/.bin/rolldown", [`tests/${name}.ts`, "--file", out, "--format", "esm", "--platform", "node"], { stdio: "inherit" });
  execFileSync("node", [out], { stdio: "inherit" });
}
