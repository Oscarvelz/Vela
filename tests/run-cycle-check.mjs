// Bundles the cycle checks with rolldown (already a Vite dependency) and runs them:
// tests/cycle-check.ts (unit cases), tests/cycle-consistency.ts (cross-surface sweep), tests/cycle-trackers.ts (multi-person trackers + sync merge).
import { execFileSync } from "node:child_process";
for (const name of ["cycle-check", "cycle-consistency", "cycle-trackers"]) {
  const out = `/tmp/vela-${name}.mjs`;
  execFileSync("node_modules/.bin/rolldown", [`tests/${name}.ts`, "--file", out, "--format", "esm", "--platform", "node"], { stdio: "inherit" });
  execFileSync("node", [out], { stdio: "inherit" });
}
