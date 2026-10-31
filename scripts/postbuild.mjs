// Finishes docs/ for GitHub Pages: service-worker precache list + version, .nojekyll, 404 fallback.
import { createHash } from "node:crypto";
import { copyFileSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const out = process.argv[2] ? process.argv[2].replace(/\/?$/, "/") : new URL("../docs/", import.meta.url).pathname;
const BASE = "/Vela/";

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = walk(out)
  .map((p) => relative(out, p).split("\\").join("/"))
  .filter((f) => f !== "sw.js" && !f.startsWith(".") && f !== "404.html")
  .sort();
const hash = createHash("sha256");
for (const f of files) hash.update(f).update(readFileSync(join(out, f)));
const version = hash.digest("hex").slice(0, 12);
const precache = [BASE, ...files.map((f) => BASE + f)];

const swPath = join(out, "sw.js");
writeFileSync(
  swPath,
  readFileSync(swPath, "utf8").replace("__VERSION__", version).replace("__PRECACHE__", JSON.stringify(precache)),
);
copyFileSync(join(out, "index.html"), join(out, "404.html"));
writeFileSync(join(out, ".nojekyll"), "");
console.log(`postbuild: sw version ${version}, ${precache.length} files precached`);
