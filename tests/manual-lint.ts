/* Manual lint battery (2.2.8) — temporary; bundled with rolldown and run in node. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { MANUAL_CHAPTERS, MANUAL_TOPICS, HINT_ONLY, LINKS, findTopic, findHint, type Topic } from "../src/lib/vela/manual";
import { STR } from "../src/lib/vela/copy";

const SRC = join(process.cwd(), "src");
let failures = 0;
const fail = (msg: string) => { failures++; console.log("FAIL:", msg); };
const ok = (msg: string) => console.log("ok:", msg);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx") || p.endsWith(".ts")) out.push(p);
  }
  return out;
}
const files = walk(SRC);
const allSource = files.map((f) => readFileSync(f, "utf8")).join("\n");

// (a) every <Hint topic="…"> resolves
const hintIds = new Set<string>();
for (const f of files) {
  const text = readFileSync(f, "utf8");
  for (const m of text.matchAll(/<Hint\s+topic="([a-z0-9-]+)"/g)) hintIds.add(m[1]);
}
if (hintIds.size < 20) fail(`only ${hintIds.size} Hint ids found in source`);
for (const id of hintIds) {
  const entry = findHint(id);
  if (!entry) fail(`Hint topic "${id}" does not resolve via findHint`);
  else if (!entry.topic) fail(`Hint topic "${id}" has no manual topic`);
}
ok(`(a) ${hintIds.size} Hint ids in source, all resolve`);

// helpers over topic texts
const LANGS = [0, 1] as const;
function topicFields(topic: Topic, lang: 0 | 1): string[] {
  return [topic.title, topic.sum, topic.how, topic.calc, topic.example, topic.cases, topic.mistake]
    .filter(Boolean)
    .map((pair) => (pair as readonly [string, string])[lang]);
}
function bodyText(topic: Topic, lang: 0 | 1): string {
  return [topic.how, topic.calc, topic.example, topic.cases, topic.mistake]
    .filter(Boolean)
    .map((pair) => (pair as readonly [string, string])[lang])
    .join("\n");
}

// (b) every [[term]] resolves in LINKS
let linkCount = 0;
const checkLinks = (text: string, where: string) => {
  for (const m of text.matchAll(/\[\[([^\]]+)\]\]/g)) {
    linkCount++;
    if (!LINKS[m[1]]) fail(`[[${m[1]}]] in ${where} has no LINKS entry`);
    else if (!findTopic(LINKS[m[1]].topic)) fail(`[[${m[1]}]] in ${where} points at missing topic "${LINKS[m[1]].topic}"`);
  }
};
for (const topic of MANUAL_TOPICS) {
  for (const lang of LANGS) for (const field of topicFields(topic, lang)) checkLinks(field, `topic ${topic.id}`);
  for (const lang of LANGS) checkLinks(topic.what[lang], `topic ${topic.id} what`);
  if (topic.whatAlt) for (const lang of LANGS) checkLinks(topic.whatAlt[lang], `topic ${topic.id} whatAlt`);
}
for (const h of HINT_ONLY) for (const lang of LANGS) checkLinks(h.what[lang], `hint-only ${h.id}`);
ok(`(b) ${linkCount} [[term]] links checked`);

// (c) bubble brevity: ≤2 sentences, ≤230 chars
const sentences = (s: string) => s.split(/(?<=[.!?…])\s+/).map((x) => x.trim()).filter(Boolean);
const checkBubble = (text: string, where: string) => {
  if (text.length > 230) fail(`bubble ${where} is ${text.length} chars (>230)`);
  const n = sentences(text).length;
  if (n > 2) fail(`bubble ${where} has ${n} sentences (>2)`);
};
for (const topic of MANUAL_TOPICS) {
  for (const lang of LANGS) checkBubble(topic.what[lang], `${topic.id}[${lang}]`);
  if (topic.whatAlt) for (const lang of LANGS) checkBubble(topic.whatAlt[lang], `${topic.id} alt[${lang}]`);
}
for (const h of HINT_ONLY) {
  for (const lang of LANGS) checkBubble(h.what[lang], `hint-only ${h.id}[${lang}]`);
  if (h.whatAlt) for (const lang of LANGS) checkBubble(h.whatAlt[lang], `hint-only ${h.id} alt[${lang}]`);
}
ok("(c) bubble brevity checked");

// (d) depth + no repetition: body ≥320 letters beyond the bubble; no bubble sentence ≥25 chars verbatim in body
const letters = (s: string) => (s.match(/\p{L}/gu) ?? []).length;
for (const topic of MANUAL_TOPICS) {
  for (const lang of LANGS) {
    const body = bodyText(topic, lang);
    const depth = letters(body) - letters(topic.what[lang]);
    if (depth < 320) fail(`topic ${topic.id}[${lang}] body depth ${depth} letters (<320 beyond bubble)`);
    if (body.includes(topic.what[lang])) fail(`topic ${topic.id}[${lang}] body repeats the bubble verbatim`);
    for (const sentence of sentences(topic.what[lang])) {
      if (sentence.length >= 25 && body.includes(sentence)) fail(`topic ${topic.id}[${lang}] body repeats bubble sentence "${sentence.slice(0, 40)}…"`);
    }
    if (topic.sum[lang] === topic.what[lang]) fail(`topic ${topic.id}[${lang}] sum === what`);
    if (!topic.example) fail(`topic ${topic.id} has no example`);
    if (!topic.how) fail(`topic ${topic.id} has no how`);
  }
}
ok("(d) depth / no-repetition checked");

// (e) every go.spot exists as data-spot in source
const spotOf = (go: { spot?: string } | undefined, where: string) => {
  if (!go?.spot) return;
  if (!allSource.includes(`data-spot="${go.spot}"`) && !allSource.includes(`data-spot~="${go.spot}"`)) {
    fail(`go.spot "${go.spot}" (${where}) not found as data-spot in src`);
  }
};
for (const topic of MANUAL_TOPICS) spotOf(topic.go, `topic ${topic.id}`);
for (const [term, dest] of Object.entries(LINKS)) spotOf(dest.go, `LINKS ${term}`);
ok("(e) go.spot targets checked");

// (f) graph integrity
const ids = new Set<string>();
for (const topic of MANUAL_TOPICS) {
  if (ids.has(topic.id)) fail(`duplicate topic id ${topic.id}`);
  ids.add(topic.id);
}
for (const topic of MANUAL_TOPICS) {
  for (const rel of topic.related ?? []) if (!findTopic(rel)) fail(`topic ${topic.id} related "${rel}" missing`);
}
for (const h of HINT_ONLY) {
  if (ids.has(h.id)) fail(`hint-only id ${h.id} collides with a topic`);
  if (findHint(h.id)?.topic.id !== h.into) fail(`hint-only ${h.id} into "${h.into}" does not resolve via findHint`);
}
if (MANUAL_TOPICS.length !== 30) fail(`expected 30 topics, found ${MANUAL_TOPICS.length}`);
if (MANUAL_CHAPTERS.length !== 7) fail(`expected 7 chapters, found ${MANUAL_CHAPTERS.length}`);
ok("(f) graph integrity checked");

// (g) copy balance + mn keys
const enKeys = Object.keys(STR.en);
const esKeys = Object.keys(STR.es);
if (enKeys.length !== esKeys.length) fail(`copy imbalance EN=${enKeys.length} ES=${esKeys.length}`);
const esSet = new Set(esKeys);
for (const k of enKeys) if (!esSet.has(k)) fail(`copy key ${k} missing in ES`);
for (const k of enKeys.filter((k) => k.startsWith("mn"))) {
  if (!esSet.has(k)) fail(`mn key ${k} missing in ES`);
}
console.log(`(g) copy keys EN=${enKeys.length} ES=${esKeys.length}, mn keys=${enKeys.filter((k) => k.startsWith("mn")).length}`);

// (h) every HINT_ONLY entry is actually placed: a hint no component
// renders is a door to nowhere (RT-V5 B9 — ciclo-en-pausa sat defined
// but unplaced). The check reads the component sources for a Hint
// carrying the id.
{
  const dir = "src/components/vela";
  const sources = readdirSync(dir)
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => readFileSync(`${dir}/${f}`, "utf8"))
    .join("\n");
  for (const h of HINT_ONLY) {
    if (!sources.includes(`topic="${h.id}"`)) fail(`hint-only ${h.id} is rendered by no component`);
  }
  ok("(h) hint-only placement checked");
}

// (i) every name a where-line speaks EXISTS (RT3-H5 B1″): the wave-10
// fence grepped the convicted strings, so the class walked free —
// "Registrar un lote" and "Memories" named controls that do not
// exist while their corrected twins sat one file away. The check is
// the mechanism, not the strings: each where-line segment's head
// (before any comma qualifier) must be a string the app itself
// speaks, in that language — a copy value. Frame words with no copy
// key of their own are whitelisted only with their source named.
{
  const inventory: [Set<string>, Set<string>] = [
    new Set(Object.values(STR.en) as string[]),
    new Set(Object.values(STR.es) as string[]),
  ];
  const whitelist: [Set<string>, Set<string>] = [new Set(["Settings"]), new Set(["Ajustes"])];
  let segments = 0;
  for (const topic of MANUAL_TOPICS) {
    if (!topic.go?.where) continue;
    for (const lang of LANGS) {
      const line = topic.go.where[lang];
      for (const rawSegment of line.split("→")) {
        const head = rawSegment.split(",")[0].trim();
        if (!head) continue;
        segments += 1;
        if (!inventory[lang].has(head) && !whitelist[lang].has(head)) {
          fail(`topic ${topic.id} where[${lang}] names "${head}", which no copy string speaks`);
        }
      }
    }
  }
  ok(`(i) ${segments} where-line names checked against the copy inventory`);
}

// (j) check (i)'s blind spots close (RT4-H5 L2): LINKS carries its own
// where-lines, judged by the same rule — the [["Statistics"]] pair
// named a tab that does not exist ("Insights"/"Análisis") while the
// topic where-lines beside it had already been corrected. And BODY
// PROSE speaks arrow paths too (bloqueo's "→ Privacy" named no
// section): every arrow segment in how/example/what must OPEN with a
// name the app speaks — a copy value as a word-prefix of the segment.
{
  const inventory: [Set<string>, Set<string>] = [
    new Set(Object.values(STR.en) as string[]),
    new Set(Object.values(STR.es) as string[]),
  ];
  const whitelist: [Set<string>, Set<string>] = [new Set(["Settings"]), new Set(["Ajustes"])];
  let linkSegments = 0;
  for (const [term, link] of Object.entries(LINKS)) {
    if (!link.go?.where) continue;
    for (const lang of LANGS) {
      const line = link.go.where[lang];
      for (const rawSegment of line.split("→")) {
        const head = rawSegment.split(",")[0].trim();
        if (!head) continue;
        linkSegments += 1;
        if (!inventory[lang].has(head) && !whitelist[lang].has(head)) {
          fail(`link ${term} where[${lang}] names "${head}", which no copy string speaks`);
        }
      }
    }
  }
  ok(`(j) ${linkSegments} LINKS where-line names checked against the copy inventory`);
  let prosePaths = 0;
  const opensWithName = (segment: string, lang: 0 | 1) => {
    const words = segment.replace(/\[\[|\]\]/g, "").split(/\s+/).filter(Boolean);
    for (let n = Math.min(5, words.length); n >= 1; n -= 1) {
      const prefix = words.slice(0, n).join(" ").replace(/[.,:;]$/, "");
      if (inventory[lang].has(prefix) || whitelist[lang].has(prefix)) return true;
    }
    return false;
  };
  for (const topic of MANUAL_TOPICS) {
    // Every prose field the topic carries (what/how/calc/example/
    // cases): a field list would blind the check to the next field
    // the manual grows, so the census walks whatever pairs exist.
    for (const field of Object.keys(topic)) {
      const pair = (topic as unknown as Record<string, unknown>)[field] as [string, string] | undefined;
      if (!Array.isArray(pair) || typeof pair[0] !== "string" || typeof pair[1] !== "string") continue;
      for (const lang of LANGS) {
        for (const m of pair[lang].matchAll(/→\s*([^→\n]+)/g)) {
          prosePaths += 1;
          if (!opensWithName(m[1].trim(), lang)) {
            fail(`topic ${topic.id} ${field}[${lang}] arrow path opens with "${m[1].trim().slice(0, 40)}", which no copy string speaks`);
          }
        }
      }
    }
  }
  ok(`(j) ${prosePaths} body-prose arrow paths checked against the copy inventory`);
}

console.log(failures === 0 ? "MANUAL LINT: ALL PASS" : `MANUAL LINT: ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
