/* WAVE25-TIES-QUIET — Round 5 Wave 3 (2.2.48): the tie law
 * finishes, and quiet marks coalesce (RT5-H6 B1/B2/B8, RT5-H3
 * B1/B2/B3/B4, RT5-H1 B5). Round 4's tie law governed items;
 * it never reached the journal itself (an exact updatedAt tie
 * crowned the first argument — and sync merges local-first, so
 * both devices crowned themselves), the couple mode, the mute's
 * full tie, the meta key (which omitted the four lengths), the
 * twin testimony's write-skip (which never compared the note),
 * or the owner-against-owner seat inside the id band. And quiet
 * marks unioned by id without the one-stretch-one-name law the
 * writing door always kept, so overlaps summed per mark on
 * every counting surface. Fake data only.
 * Run: node ../run-ts-test.mjs tests/wave25-ties-quiet.ts */
import { journalFromUnknown, mergeJournals } from "../src/lib/vela/store";
import { defaultTracker, mergeTracker, shareReasonsAcrossTwins } from "../src/lib/vela/cycle-trackers";
import { episodes } from "../src/lib/vela/quiet";
import type { CycleTracker, Journal } from "../src/lib/vela/types";

process.on("unhandledRejection", () => undefined);

let breaks = 0;
let holds = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) { holds += 1; console.log(`HOLD ${name}`); }
  else { breaks += 1; console.log(`BREAK ${name}${detail ? ` — ${detail}` : ""}`); }
}

const T0 = 1_700_000_000_000;
const OWNER = { id: "p-owner", name: "Ana", role: "owner" as const, createdAt: T0, updatedAt: T0 };
const raw = (over: Record<string, unknown>) => ({
  profile: { displayName: "Ana", createdAt: T0 },
  settings: { language: "en", weekStart: "mon" },
  partners: ["Lucía"],
  sessions: [],
  encounters: [],
  people: [OWNER],
  proposals: [],
  updatedAt: T0 + 30,
  ...over,
});
const gate = (over: Record<string, unknown>) => journalFromUnknown(raw(over), "en");
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/* ——— B1: the journal-level tie is a property of the pair ——— */
{
  const a = gate({ settings: { language: "en", theme: "firmament" }, profile: { displayName: "Ana", createdAt: T0 } });
  const b = gate({ settings: { language: "es", theme: "velvet" }, profile: { displayName: "Ana María", createdAt: T0 } });
  check("B1 setup: the journals tie on updatedAt", a.updatedAt === b.updatedAt, `${a.updatedAt} vs ${b.updatedAt}`);
  const ab = mergeJournals(a, b);
  const ba = mergeJournals(b, a);
  check("B1 settings converge in both orders", eq(ab.settings, ba.settings), `${JSON.stringify(ab.settings.language)}/${JSON.stringify(ba.settings.language)}`);
  check("B1 profile converges in both orders", eq(ab.profile, ba.profile));
}

/* ——— B2: the couple tie resolves by content ——— */
{
  const a = gate({ settings: { language: "en", coupleMode: { sharedFrom: "2026-10-01", enabledAt: T0 + 50 } } });
  const b = gate({ settings: { language: "en", coupleMode: { sharedFrom: "2026-09-01", enabledAt: T0 + 50 } } });
  const ab = mergeJournals(a, b);
  const ba = mergeJournals(b, a);
  check("B2 sharedFrom converges in both orders", ab.settings.coupleMode?.sharedFrom === ba.settings.coupleMode?.sharedFrom, `${ab.settings.coupleMode?.sharedFrom} vs ${ba.settings.coupleMode?.sharedFrom}`);
}

/* ——— H3-B1/B2: tracker full ties (mute + meta lengths) ——— */
{
  const base = (over: Partial<CycleTracker>): CycleTracker => ({ ...defaultTracker("c1"), updatedAt: T0 + 10, metaAt: T0 + 10, ...over });
  const a = base({ stamps: { "q:2026-10-05": T0 + 5 }, days: { "2026-10-05": { muted: true } as never } });
  const b = base({ stamps: { "q:2026-10-05": T0 + 5 }, days: { "2026-10-05": { muted: false } as never } });
  const ab = mergeTracker(a, b);
  const ba = mergeTracker(b, a);
  check("B1 the mute converges in both orders", ab.muteReasonAsks === ba.muteReasonAsks, `${ab.muteReasonAsks} vs ${ba.muteReasonAsks}`);
  const c = base({ periodDays: 4, cycleDays: 26 });
  const d = base({ periodDays: 6, cycleDays: 31 });
  const cd = mergeTracker(c, d);
  const dc = mergeTracker(d, c);
  check("B2 the lengths converge in both orders", cd.periodDays === dc.periodDays && cd.cycleDays === dc.cycleDays, `${cd.periodDays}/${dc.periodDays}`);
}

/* ——— H3-B3: twin testimony converges on the note too ——— */
{
  const mk = (note: string): CycleTracker => ({
    ...defaultTracker("c1"),
    id: note === "hers" ? "c1" : "c2",
    partnerLink: "Lucía",
    partnerName: "Lucía",
    starts: ["2026-10-05"],
    reasons: { "2026-10-05": { id: "sore", at: T0 + 5, note } as never },
    stamps: { "s:2026-10-05": T0 + 5, "r:2026-10-05": T0 + 5 },
  });
  const out = shareReasonsAcrossTwins([mk("hers"), mk("mine")]);
  const notes = out.map((t) => (t.reasons?.["2026-10-05"] as { note?: string } | undefined)?.note);
  check("B3 both twins carry the winning note", notes[0] !== undefined && notes[0] === notes[1], JSON.stringify(notes));
}

/* ——— H3-B4: quiet marks coalesce — one stretch, one name ——— */
{
  const g = gate({
    quietDays: [
      { id: "q1", from: "2026-10-01", to: "2026-10-10", reason: "work", createdAt: T0 + 1 },
      { id: "q2", from: "2026-10-06", to: "2026-10-15", reason: "work", createdAt: T0 + 2 },
    ],
  });
  /* Same name: the overlap unions into ONE stretch. Across
   * names: the later writing owns the overlap (trim/split). */
  const spans = (g.quietDays ?? []).map((m) => `${m.from}..${m.to}`).join(" ");
  check("B4 same-name overlaps union into one stretch", spans === "2026-10-01..2026-10-15", spans);
  const a = gate({ quietDays: [{ id: "q1", from: "2026-10-01", to: "2026-10-10", reason: "work", createdAt: T0 + 1 }] });
  const b = gate({ quietDays: [{ id: "q2", from: "2026-10-06", to: "2026-10-15", reason: "work", createdAt: T0 + 2 }] });
  const m = mergeJournals(a, b);
  const mSpans = (m.quietDays ?? []).map((x) => `${x.from}..${x.to}`).join(" ");
  check("B4 the merge unions it identically", mSpans === "2026-10-01..2026-10-15", mSpans);
  const eps = episodes(m.quietDays ?? [], [], "2026-11-18");
  const total = eps.reduce((n, e) => n + e.days, 0);
  check("B4 episodes count the union (15), not the sum (21)", total === 15, `${total}`);
  const two = gate({
    quietDays: [
      { id: "q1", from: "2026-10-01", to: "2026-10-10", reason: "work", createdAt: T0 + 1 },
      { id: "q2", from: "2026-10-06", to: "2026-10-15", reason: "travel", createdAt: T0 + 2 },
    ],
  });
  const twoSpans = (two.quietDays ?? []).map((x) => `${x.from}..${x.to}`).join(" ");
  check("B4 one day, one name — across reasons too", twoSpans === "2026-10-01..2026-10-05 2026-10-06..2026-10-15", twoSpans);
}

/* ——— H6-B8: owner against owner in the band — earliest ceremony ——— */
{
  const LONG = "p" + "x".repeat(45);
  const early = { id: LONG + "A", name: "Ana Early", role: "owner" as const, createdAt: T0 + 1, updatedAt: T0 + 1 };
  const late = { id: LONG + "B", name: "Ana Late", role: "owner" as const, createdAt: T0 + 9, updatedAt: T0 + 9 };
  const g1 = gate({ people: [early, late] });
  const g2 = gate({ people: [late, early] });
  const n1 = (g1.people ?? []).filter((p) => p.role === "owner").map((p) => p.name).join(",");
  const n2 = (g2.people ?? []).filter((p) => p.role === "owner").map((p) => p.name).join(",");
  check("B8 the earliest owner survives in both array orders", n1 === "Ana Early" && n2 === "Ana Early", `${n1} / ${n2}`);
}

console.log(`WAVE25-TIES-QUIET: ${breaks} break(s), ${holds} hold(s)`);
if (breaks > 0) process.exitCode = 1;
