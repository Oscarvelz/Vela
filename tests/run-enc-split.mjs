// Bundles tests/enc-split.ts with rolldown and runs it (one-time split of mixed-partner encounters).
import { execFileSync } from "node:child_process";
execFileSync("node_modules/.bin/rolldown", ["tests/enc-split.ts", "--file", "/tmp/vela-enc-split.mjs", "--format", "esm", "--platform", "node"], { stdio: "inherit" });
execFileSync("node", ["/tmp/vela-enc-split.mjs"], { stdio: "inherit" });
