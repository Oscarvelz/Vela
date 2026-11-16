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

console.log(failures === 0 ? "MANUAL LINT: ALL PASS" : `MANUAL LINT: ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
