// Scores a batch parser against tests/batch-nl-cases.ts, field by field.
import { CASES, type Case, type Expect } from "./batch-nl-cases";

export type Norm = {
  date: string;
  time: string;
  count: number;
  nextDay: boolean;
  partner: string;
  place: string;
  duration: number;
  positions: string[];
  contraception: string[];
  problems: string[];
  intensity: number;
  connection: number;
  satisfaction: number;
  energy: number;
  overall: number;
  notes: string;
};

export const FIELDS = [
  "split",
  "date",
  "time",
  "count",
  "nextDay",
  "partner",
  "place",
  "duration",
  "positions",
  "contraception",
  "problems",
  "intensity",
  "connection",
  "satisfaction",
  "energy",
  "overall",
  "notes",
] as const;
type Field = (typeof FIELDS)[number];

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

function want(e: Expect, f: Field): unknown {
  switch (f) {
    case "count":
      return e.count ?? 1;
    case "nextDay":
      return e.nextDay ?? false;
    case "partner":
    case "place":
      return e[f] ?? "";
    case "positions":
    case "contraception":
    case "problems":
      return e[f] ?? [];
    case "duration":
    case "intensity":
    case "connection":
    case "satisfaction":
    case "energy":
    case "overall":
      return e[f] ?? 0;
    default:
      return (e as Record<string, unknown>)[f];
  }
}

export function score(parse: (text: string) => Norm[], verbose = false, cases: Case[] = CASES) {
  const tally: Record<string, { ok: number; n: number }> = {};
  for (const f of FIELDS) tally[f] = { ok: 0, n: 0 };
  const stated: Record<string, { ok: number; n: number }> = {};
  for (const f of FIELDS) stated[f] = { ok: 0, n: 0 };
  const failures: string[] = [];
  for (const c of cases) {
    let got: Norm[] = [];
    try {
      got = parse(c.text);
    } catch (err) {
      failures.push(`${c.name}: THREW ${(err as Error).message}`);
    }
    tally.split.n++;
    if (got.length === c.expect.length) tally.split.ok++;
    else failures.push(`${c.name}: split expected ${c.expect.length} got ${got.length}`);
    c.expect.forEach((e, i) => {
      const g = got[i];
      for (const f of FIELDS) {
        if (f === "split") continue;
        if (f === "time" && !e.time) continue;
        if (f === "notes" && !e.notesHas && !e.notesNot) continue;
        tally[f].n++;
        let ok = false;
        let shown: unknown = g ? (g as Record<string, unknown>)[f] : "(no entry)";
        if (g) {
          if (f === "notes") {
            const n = fold(g.notes);
            ok = (e.notesHas ?? []).every((x) => n.includes(fold(x))) && (e.notesNot ?? []).every((x) => !n.includes(fold(x)));
            shown = g.notes;
          } else {
            const w = want(e, f);
            const v = (g as Record<string, unknown>)[f];
            ok = Array.isArray(w) ? sameSet(w as string[], v as string[]) : w === v;
          }
        }
        const w0 = want(e, f);
        const isStated = f === "notes" || f === "date" || f === "time" || (Array.isArray(w0) ? w0.length > 0 : w0 !== 0 && w0 !== "" && w0 !== false && !(f === "count" && w0 === 1));
        if (isStated) {
          stated[f].n++;
          if (ok) stated[f].ok++;
        }
        if (ok) tally[f].ok++;
        else
          failures.push(
            `${c.name} [#${i + 1}] ${f}: want ${JSON.stringify(f === "notes" ? e.notesHas : want(e, f))} got ${JSON.stringify(shown)}`,
          );
      }
    });
  }
  let ok = 0;
  let n = 0;
  const rows = FIELDS.map((f) => {
    const t = tally[f];
    if (f !== "split") {
      ok += t.ok;
      n += t.n;
    }
    const st = stated[f];
    const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(0).padStart(3) : "  -");
    return `${f.padEnd(14)} ${String(t.ok).padStart(3)}/${String(t.n).padEnd(3)} ${pct(t.ok, t.n)}%   stated-only ${String(st.ok).padStart(3)}/${String(st.n).padEnd(3)} ${pct(st.ok, st.n)}%`;
  });
  rows.unshift(`${"field".padEnd(14)} all-checks          (stated-only = cases where the text actually says it)`);
  rows.push(`${"ALL FIELDS".padEnd(14)} ${String(ok).padStart(3)}/${String(n).padEnd(3)} ${((100 * ok) / n).toFixed(0).padStart(3)}%`);
  if (verbose) for (const line of failures) rows.push("  ✗ " + line);
  return { rows, ok, n, failures, tally };
}
