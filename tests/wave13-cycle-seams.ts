/* WAVE13-CYCLE-SEAMS — Round 3 Wave 3 (2.2.36): the cycle seams
 * (RT3-H3-01/02/03). "Don't ask again" could never be un-muted: the
 * Settings door wrote false into a cleaner that carries the field only
 * when true, the gate stripped the q:mute stamp so merges hit the
 * legacy tie branch, and that branch fired on any tie, stamped or not.
 * Twin testimony was shared at exactly one door — a tracker bound at
 * couple-mode turn-on left the name group, and gate-born twins were
 * never shared at all. And Undo after a merge reverted the other
 * device's changed VALUES on shared entries, restamped so the loss
 * won. Fake data only.
 * Run: node ../run-ts-test.mjs tests/wave13-cycle-seams.ts */
const g = globalThis as Record<string, unknown>;
if (typeof g.window === "undefined") g.window = g;
const { journalFromUnknown, useJournal } = await import("../src/lib/vela/store");
const { cleanTracker, mergeTracker, mergeTrackerLists } = await import("../src/lib/vela/cycle-trackers");
const { cycleAsk } = await import("../src/lib/vela/cycle");
import type { Journal } from "../src/lib/vela/types";
import type { CycleTracker } from "../src/lib/vela/cycle-trackers";

process.on("unhandledRejection", () => undefined);

let breaks = 0;
let holds = 0;
function hold(name: string) { holds += 1; console.log(`HOLD ${name}`); }
function brk(name: string, extra = "") { breaks += 1; console.log(`BREAK ${name}${extra ? " — " + extra : ""}`); }
function check(name: string, ok: boolean, extra = "") { if (ok) hold(name); else brk(name, extra); }

const DAY = 86400000;
const T0 = Date.now();
const S = () => useJournal.getState();
const J = () => S().journal;

function tracker(raw: Record<string, unknown>): CycleTracker {
  return cleanTracker({ enabled: true, perspective: "partner", partnerName: "Ana", starts: [], ends: {}, days: {}, reasons: {}, stamps: {}, updatedAt: 100, metaAt: 100, ...raw }, String(raw.id ?? "c1"));
}

/* ── S1. The mute door writes false, and the stamp carries it (H3-01) ── */
{
  const j = journalFromUnknown({
    profile: { displayName: "Ana", createdAt: T0 - 30 * DAY },
    updatedAt: T0 - DAY,
    settings: {
      language: "en",
      cycles: [{ id: "c1", enabled: true, perspective: "self", partnerName: "", starts: ["2026-10-03"], ends: {}, days: {}, reasons: {}, muteReasonAsks: true, stamps: { "q:mute": 500 }, updatedAt: 500, metaAt: 500 }],
    },
    partners: [], sessions: [], encounters: [], people: [], proposals: [], quietDays: [], pregnancyTests: [],
  }, "en");
  useJournal.setState({ journal: j as Journal, unlocked: true });
  check("S1 the stamp enters the gate (precondition)", J().settings.cycles[0].stamps["q:mute"] === 500);
  S().setCycle({ muteReasonAsks: false });
  const t = J().settings.cycles[0];
  check("S1 the door writes false", t.muteReasonAsks === false);
  check("S1 the un-mute is stamped", (t.stamps["q:mute"] ?? 0) > 500);
  const round = journalFromUnknown(JSON.parse(JSON.stringify(J())), "en");
  check("S1 the un-mute survives a reload", round.settings.cycles[0].muteReasonAsks === false && (round.settings.cycles[0].stamps["q:mute"] ?? 0) > 500);
  const stale = tracker({ id: "c1", perspective: "self", partnerName: "", muteReasonAsks: true, stamps: { "q:mute": 500 }, updatedAt: 500 });
  const merged = mergeTracker(round.settings.cycles[0], stale);
  check("S1 the merge honours the un-mute", merged.muteReasonAsks === false);
}

/* ── S2. The tie law scopes to unstamped copies (H3-01c) ── */
{
  const a = tracker({ id: "c1", muteReasonAsks: false, stamps: { "q:mute": 700 }, updatedAt: 900 });
  const b = tracker({ id: "c1", muteReasonAsks: true, stamps: { "q:mute": 700 }, updatedAt: 100 });
  check("S2 a stamped tie resolves by the newer side, not the one-way door", mergeTracker(a, b).muteReasonAsks === false);
  const la = tracker({ id: "c1", muteReasonAsks: false, stamps: {}, updatedAt: 100 });
  const lb = tracker({ id: "c1", muteReasonAsks: true, stamps: {}, updatedAt: 900 });
  check("S2 unstamped legacy copies keep the one-way door", mergeTracker(la, lb).muteReasonAsks === true);
}

/* ── S3. Twin testimony crosses the ownerId split (H3-03a) ── */
{
  const STARTS = ["2026-01-01", "2026-02-14"];
  const DISMISSED = { "2026-01-01": { id: "dismissed", at: 100 } };
  const bound = tracker({ id: "ta", starts: STARTS, reasons: {}, ownerId: "p-ana" });
  const named = tracker({ id: "tb", starts: STARTS, reasons: {} });
  const split = mergeTrackerLists([bound], [named]);
  const boundAfter = { ...split.find((t) => t.id === "ta")!, reasons: { ...DISMISSED } };
  const crossed = mergeTrackerLists([boundAfter], [split.find((t) => t.id === "tb")!]);
  const namedAfter = crossed.find((t) => t.id === "tb")!;
  check("S3 a dismissal on the bound twin covers the name twin", namedAfter.reasons?.["2026-01-01"]?.id === "dismissed" && cycleAsk(namedAfter) === null);
}

/* ── S4. Gate-born twins share at the gate (H3-03b) ── */
{
  const STARTS = ["2026-01-01", "2026-02-14"];
  const j = journalFromUnknown({
    profile: { displayName: "Ana", createdAt: 100 },
    updatedAt: 1000,
    settings: {
      language: "en",
      cycles: [
        { id: "ga", enabled: true, perspective: "partner", partnerName: "Ana", starts: STARTS, ends: {}, days: {}, reasons: { "2026-01-01": { id: "dismissed", at: 100 } }, stamps: {}, updatedAt: 100, metaAt: 100 },
        { id: "gb", enabled: true, perspective: "partner", partnerName: "Ana", starts: STARTS, ends: {}, days: {}, reasons: {}, stamps: {}, updatedAt: 100, metaAt: 100 },
      ],
      cycleSelected: "ga",
    },
    partners: [], sessions: [], encounters: [], people: [], proposals: [], quietDays: [], pregnancyTests: [],
  }, "en");
  const gb = j.settings.cycles.find((t) => t.id === "gb")!;
  check("S4 the gate shares the dismissal across twins", gb.reasons?.["2026-01-01"]?.id === "dismissed" && cycleAsk(gb) === null);
}

/* ── S5. Undo carries merged VALUES, not only keys (H3-02) ── */
{
  const STARTS = ["2026-09-05", "2026-10-03"];
  const base = tracker({ id: "c1", perspective: "self", partnerName: "", starts: STARTS, reasons: { "2026-09-05": { id: "stress", at: 100 } }, stamps: { "r:2026-09-05": 100 }, updatedAt: 100 });
  const j = journalFromUnknown({
    profile: { displayName: "Ana", createdAt: T0 - 30 * DAY },
    updatedAt: T0 - DAY,
    settings: { language: "en", cycles: [ JSON.parse(JSON.stringify(base)) ] },
    partners: [], sessions: [], encounters: [], people: [], proposals: [], quietDays: [], pregnancyTests: [],
  }, "en");
  useJournal.setState({ journal: j as Journal, unlocked: true });
  const snap = { id: "c1", starts: [...STARTS], ends: {}, reasons: { "2026-09-05": { id: "stress", at: 100 } } };
  const after = { id: "c1", starts: [...STARTS], ends: {}, reasons: { "2026-09-05": { id: "travel", at: 200 }, "2026-10-03": { id: "dismissed", at: 200 } } };
  // The merge lands after the user's change: it rewrites 09-05's reason
  // (illness @900) and leaves the user's 10-03 answer untouched.
  const mergedTracker = tracker({ id: "c1", perspective: "self", partnerName: "", starts: STARTS, reasons: { "2026-09-05": { id: "illness", at: 900 }, "2026-10-03": { id: "dismissed", at: 200 } }, stamps: { "r:2026-09-05": 900, "r:2026-10-03": 200 }, updatedAt: 900 });
  useJournal.setState({ journal: { ...J(), settings: { ...J().settings, cycles: [mergedTracker], cycle: mergedTracker } } });
  S().restoreCycleDates(snap as never, after as never);
  const t = J().settings.cycles[0];
  check("S5 the merged-in value survives the undo", t.reasons?.["2026-09-05"]?.id === "illness", `got ${t.reasons?.["2026-09-05"]?.id}`);
  check("S5 the user's own answer still reverts", t.reasons?.["2026-10-03"] === undefined);
}

console.log(`WAVE13-CYCLE-SEAMS: ${breaks} break(s), ${holds} hold(s)`);
if (breaks > 0) process.exitCode = 1;
