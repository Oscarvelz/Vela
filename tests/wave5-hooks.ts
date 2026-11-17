/* Wave 5 fence, REBUILT in Round 2 Wave 1 (RT2-H5 B1′/fence hole) —
 * the hooks law: no component may return before a hook it later calls,
 * call a hook conditionally, or hide a hook inside a plain callback.
 * The first version of this sweep opened the component body at the
 * first `{` after the declaration — but a destructured props
 * parameter `({ a }: Props)` puts a `{` BEFORE the body, so the
 * scanner closed at the destructure's `}` and never saw the body at
 * all: 100 of 148 components were invisible to it, SessionCard
 * included, while it reported the tree clean. This version finds the
 * body brace AFTER the parameter list's closing paren, tracks nested
 * function contexts, and carries planted specimens below that must
 * flag every run — a fence that cannot catch its own specimens is
 * not a fence. */
import { readdirSync, readFileSync } from "node:fs";

let breaks = 0;
let holds = 0;
function hold(name: string) { holds += 1; console.log(`HOLD ${name}`); }
function brk(name: string, extra = "") { breaks += 1; console.log(`BREAK ${name}${extra ? " — " + extra : ""}`); }

function mask(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length))
    .replace(/`(?:\\.|[^`\\])*`/g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/'(?:\\.|[^'\\\n])*'/g, (m) => " ".repeat(m.length))
    .replace(/"(?:\\.|[^"\\\n])*"/g, (m) => " ".repeat(m.length));
}

type Fn = { name: string; at: number };

function findFns(text: string): Fn[] {
  const fns: Fn[] = [];
  for (const m of text.matchAll(/(?:export\s+)?(?:default\s+)?function\s+([A-Za-z]\w*)\s*\(/g))
    fns.push({ name: m[1], at: m.index ?? 0 });
  for (const m of text.matchAll(/(?:export\s+)?const\s+([A-Za-z]\w*)\s*=\s*(?:\([^)]*\)|[\w]+)\s*(?::[^=]+)?=>/g))
    fns.push({ name: m[1], at: m.index ?? 0 });
  for (const m of text.matchAll(/(?:export\s+)?const\s+([A-Za-z]\w*)\s*=\s*(?:forwardRef|memo)\b[\s\S]{0,220}?function\s+([A-Za-z]\w*)\s*\(/g))
    fns.push({ name: m[2], at: m.index ?? 0 });
  return fns.sort((a, b) => a.at - b.at);
}

function bodyOpen(text: string, fn: Fn): number {
  const paren = text.indexOf("(", fn.at);
  if (paren < 0) return -1;
  let pdepth = 0;
  let close = -1;
  for (let i = paren; i < text.length; i += 1) {
    if (text[i] === "(") pdepth += 1;
    else if (text[i] === ")") {
      pdepth -= 1;
      if (pdepth === 0) { close = i; break; }
    }
  }
  if (close < 0) return -1;
  return text.indexOf("{", close);
}

function scanBody(file: string, fn: Fn, text: string, flags: string[]) {
  const open = bodyOpen(text, fn);
  if (open < 0) return;
  const isHookOrComp = /^[A-Z]/.test(fn.name) || /^use[A-Z]/.test(fn.name);
  if (!isHookOrComp) return;
  let depth = 1;
  let sawReturn = false;
  const fnStack: { depth: number; name: string }[] = [];
  for (let j = open + 1; j < text.length; j += 1) {
    const ch = text[j];
    if (ch === "{") {
      depth += 1;
      const before = text.slice(Math.max(0, j - 96), j);
      const fm = /(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:\([^)]*\)|[\w]+)\s*(?::[^=]+)?=>|(\w+)\s*:\s*(?:\([^)]*\)|[\w]+)\s*=>|\(\s*(?:\([^)]*\)|[\w]+)\s*=>)\s*$/.exec(before);
      if (/=>\s*$/.test(before) || /(?:^|\s)function\s*(?:\w+\s*)?\([^)]*\)\s*$/.test(before)) {
        fnStack.push({ depth, name: fm?.[1] ?? fm?.[2] ?? fm?.[3] ?? "(anon)" });
      }
      continue;
    }
    if (ch === "}") {
      if (fnStack.length && fnStack[fnStack.length - 1].depth === depth) fnStack.pop();
      depth -= 1;
      if (depth === 0) break;
      continue;
    }
    const rest = text.slice(j, j + 14);
    const hook = /^use[A-Z]\w*(?=\()/.exec(rest);
    if (fnStack.length === 0) {
      const inReturnExpr = /return\s*$/.test(text.slice(Math.max(0, j - 10), j));
      if (/^return\b/.test(rest)) sawReturn = true;
      if (hook) {
        if (sawReturn && !inReturnExpr) flags.push(`HOOK-AFTER-RETURN ${file} ${fn.name} ${hook[0]}`);
        else if (depth >= 2) flags.push(`HOOK-AT-DEPTH${depth} ${file} ${fn.name} ${hook[0]}`);
      }
    } else if (hook) {
      const inner = fnStack[fnStack.length - 1].name;
      const legit = /^[A-Z]/.test(inner) || /^use[A-Z]/.test(inner);
      if (!legit) flags.push(`HOOK-IN-CALLBACK ${file} ${fn.name} > ${inner} ${hook[0]}`);
    }
  }
}

function scanSource(file: string, src: string): string[] {
  const text = mask(src);
  const flags: string[] = [];
  for (const m of text.matchAll(/(&&|\|\||\?|:)\s*use[A-Z]\w*\s*\(/g))
    flags.push(`SHORT-CIRCUIT-HOOK? ${file} "${m[0].slice(0, 30)}"`);
  for (const fn of findFns(text)) scanBody(file, fn, text, flags);
  return flags;
}

/* ——— Planted specimens: the fence must catch its own disease ——— */
const PLANTED: { name: string; src: string; expect: boolean }[] = [
  {
    name: "planted destructured-props early return (the SessionCard shape)",
    expect: true,
    src: `export function CompD({ session, density = "list" }: { session: S; density?: "list" | 2 }) {
  if (density !== "list") return null;
  const t = useT();
  const [open, setOpen] = useState(false);
  return null;
}`,
  },
  {
    name: "planted plain early return",
    expect: true,
    src: `export function CompE(props: P) {
  if (!props.x) return null;
  const v = useMemo(() => 1, []);
  return null;
}`,
  },
  {
    name: "planted hook inside a plain callback",
    expect: true,
    src: `export function CompG(props: P) {
  const onTap = () => { const [x] = useState(0); };
  return null;
}`,
  },
  {
    name: "planted clean control (destructured props, hooks first)",
    expect: false,
    src: `export function CompF({ a, b }: { a: number; b: number }) {
  const t = useT();
  const [x, setX] = useState(0);
  if (!a) return null;
  return null;
}`,
  },
];
for (const p of PLANTED) {
  const flags = scanSource("planted.tsx", p.src);
  if (p.expect && flags.length > 0) hold(p.name);
  else if (!p.expect && flags.length === 0) hold(p.name);
  else brk(p.name, `expected ${p.expect ? "flags" : "no flags"}, got ${flags.length}: ${flags[0] ?? ""}`);
}

/* ——— The real tree ——— */
const compDir = "src/components/vela";
const files = readdirSync(compDir).filter((f) => f.endsWith(".tsx") || f.endsWith(".ts")).map((f) => `${compDir}/${f}`);
for (const f of ["back-stack.ts", "i18n.ts", "batch-copy.ts", "bio-copy.ts", "cycle-words.ts"])
  files.push(`src/lib/vela/${f}`);
let treeFlags = 0;
for (const f of files) {
  for (const flag of scanSource(f, readFileSync(f, "utf8"))) {
    treeFlags += 1;
    brk("tree", flag);
  }
}
if (treeFlags === 0) hold(`tree clean (${files.length} files)`);

console.log(`wave5-hooks: ${breaks} break(s), ${holds} hold(s)`);
if (breaks > 0) process.exitCode = 1;
