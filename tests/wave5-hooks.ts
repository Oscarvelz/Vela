/* Wave 5 fence — the hooks law (RT-V5 B1): no component may return
 * before a hook it later calls. An early return above a useMemo
 * crashed the whole app when Insights sat mounted on an empty journal
 * and a sync landed (React #310/#300). This sweep reads every
 * component file and flags any hook call that stands after a return
 * in the same component body — the pattern, not the instance.
 *
 * Method: crude but honest parsing. Component bodies are found from
 * `function Name(` / `const Name = (` declarations; inside a body,
 * braces are tracked, and any `{` opened by `=>` or `function` starts
 * a nested-function context whose hooks and returns are not the
 * component's own. Strings and comments are masked first so braces
 * inside them cannot lie. */
import { readdirSync, readFileSync } from "node:fs";

let breaks = 0;
let holds = 0;
function hold(name: string) { holds += 1; console.log(`HOLD ${name}`); }
function brk(name: string, extra = "") { breaks += 1; console.log(`BREAK ${name}${extra ? " — " + extra : ""}`); }

function mask(src: string): string {
  // Replace string/comment contents with spaces (newlines kept).
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length))
    .replace(/`(?:\\.|[^`\\])*`/g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/'(?:\\.|[^'\\\n])*'/g, (m) => " ".repeat(m.length))
    .replace(/"(?:\\.|[^"\\\n])*"/g, (m) => " ".repeat(m.length));
}

type Finding = { file: string; component: string; hook: string };

function scanFile(file: string, src: string): Finding[] {
  const text = mask(src);
  const findings: Finding[] = [];
  // Component starts: exported or plain function declarations and
  // const components with capitalised names.
  const starts: { name: string; at: number }[] = [];
  for (const m of text.matchAll(/(?:export\s+)?function\s+([A-Z]\w*)\s*\(/g)) starts.push({ name: m[1], at: m.index ?? 0 });
  for (const m of text.matchAll(/(?:export\s+)?const\s+([A-Z]\w*)\s*=\s*(?:\([^)]*\)|[\w]+)\s*(?::[^=]+)?=>/g)) starts.push({ name: m[1], at: m.index ?? 0 });
  starts.sort((a, b) => a.at - b.at);
  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i];
    const limit = i + 1 < starts.length ? starts[i + 1].at : text.length;
    // The body opens at the first { after the declaration; that brace
    // is the component's own and is consumed here (depth starts at 1),
    // never classified as a nested function.
    const open = text.indexOf("{", start.at);
    if (open < 0 || open > limit) continue;
    let depth = 1;
    let fnDepth = -1; // depth at which a nested function context opened (-1 = none)
    let sawReturn = false;
    let j = open + 1;
    const pendingFn: number[] = [];
    for (; j < limit; j += 1) {
      const ch = text[j];
      if (ch === "{") {
        depth += 1;
        // Was this brace opened by an arrow or function keyword just before?
        const before = text.slice(Math.max(0, j - 64), j);
        if (/=>\s*$/.test(before) || /(?:^|\s)function\s*(?:\w+\s*)?\([^)]*\)\s*$/.test(before)) pendingFn.push(depth);
        continue;
      }
      if (ch === "}") {
        if (pendingFn.length && pendingFn[pendingFn.length - 1] === depth) pendingFn.pop();
        depth -= 1;
        if (depth === 0) break;
        continue;
      }
      if (fnDepth < 0 && pendingFn.length) fnDepth = pendingFn[0];
      if (fnDepth >= 0 && !pendingFn.length) fnDepth = -1;
      if (pendingFn.length) continue; // inside a nested function: not the component's own hooks
      const rest = text.slice(j, j + 12);
      if (/^return\b/.test(rest) && depth >= 1) sawReturn = true;
      const hook = /^use[A-Z]\w*(?=\()/.exec(rest);
      if (hook && sawReturn) {
        findings.push({ file, component: start.name, hook: hook[0] });
        break;
      }
    }
  }
  return findings;
}

const dir = "src/components/vela";
const files = readdirSync(dir).filter((f) => f.endsWith(".tsx"));
const all: Finding[] = [];
for (const f of files) all.push(...scanFile(f, readFileSync(`${dir}/${f}`, "utf8")));

if (all.length === 0) hold(`no component returns before a hook (${files.length} files swept)`);
else for (const f of all) brk(`hook after return: ${f.file} ${f.component} ${f.hook}`);

console.log(`WAVE5-HOOKS: ${breaks} breaks, ${holds} holds`);
if (breaks > 0) process.exitCode = 1;
