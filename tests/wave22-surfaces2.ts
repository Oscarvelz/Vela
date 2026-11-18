/* WAVE22-SURFACES2 — Round 4 Wave 6 (2.2.45): the surfaces close.
 * H5-B1/L3/L4 were adjudicated and cured by the collision wave
 * (2.2.41) — the mirror-door specimen stands here as their pin.
 * H5-B2 (bloqueo's prose) and the LINKS where pair are fenced by
 * manual-lint's new check (j). What remains: L1 one SpotFocus
 * resolver, L5 the calendar fallback branch, L6 the frozen
 * EMPTY_ACTIVE. Fake data only.
 * Run: node ../run-ts-test.mjs tests/wave22-surfaces2.ts */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { activeTracker } from "../src/lib/vela/cycle-trackers";
import { MANUAL_TOPICS, LINKS, type Go } from "../src/lib/vela/manual";
import { goToGo, takeSpotRequest } from "../src/lib/vela/manual-nav";
import { journalFromUnknown, useJournal } from "../src/lib/vela/store";

process.on("unhandledRejection", () => undefined);

let breaks = 0;
let holds = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) { holds += 1; console.log(`HOLD ${name}`); }
  else { breaks += 1; console.log(`BREAK ${name}${detail ? ` — ${detail}` : ""}`); }
}

/* ——— L6: EMPTY_ACTIVE is frozen, and still the same object ——— */
{
  const a = activeTracker([], "c1");
  const b = activeTracker([], undefined);
  check("L6 same singleton", a === b);
  check("L6 frozen tracker", Object.isFrozen(a));
  check("L6 frozen stamps", Object.isFrozen(a.stamps));
  check("L6 frozen starts", Object.isFrozen(a.starts));
}

/* ——— L1: SpotFocus resolves through ONE chain ——— */
{
  const src = readFileSync(join(process.cwd(), "src/components/vela/spot-focus.tsx"), "utf8");
  const resolverDefs = (src.match(/const resolve = /g) ?? []).length;
  const tierSignatures = (src.match(/HINT_ONLY\.filter/g) ?? []).length;
  check("L1 one resolver definition", resolverDefs === 1, `${resolverDefs}`);
  check("L1 bubble tier built once (inside the resolver)", tierSignatures === 1, `${tierSignatures}`);
  check("L1 settle re-resolve calls the shared resolver", /if \(!target\.isConnected\) \{\s*const again = resolve\(\)/.test(src));
}

/* ——— L5 + the doors census: every door emits a spot or a fallback ——— */
{
  const now = Date.now();
  const journal = journalFromUnknown(
    { profile: { displayName: "Ana", createdAt: now - 1000 }, settings: { language: "en", weekStart: "mon" }, partners: [], sessions: [], encounters: [], people: [], updatedAt: 1 },
    "en",
  );
  useJournal.setState({ journal, unlocked: true });
  let bare = 0;
  let doors = 0;
  /* The three by-design exceptions, named by the Round 4 hunt
   * itself: el-manual (its own bubble waits in the section the door
   * opens) and [[Settings]]/[[Ajustes]] (the surface IS the
   * destination). Any FOURTH bare door is a break. */
  const BY_DESIGN = new Set(["el-manual", "Settings", "Ajustes"]);
  const census = (go: Go | undefined, id: string) => {
    if (!go) return;
    doors += 1;
    goToGo(go, id);
    const req = takeSpotRequest();
    if (!req?.spot && !req?.fallbackSpot && !BY_DESIGN.has(id)) bare += 1;
  };
  for (const topic of MANUAL_TOPICS) census(topic.go, topic.id);
  for (const [term, link] of Object.entries(LINKS)) census(link.go, term);
  check("L5 no bare doors beyond the three by-design", bare === 0, `${bare} bare of ${doors}`);
  // The calendar door specifically: the [[Calendar]] link go carries
  // no spot of its own, so its fallback is the whole landing.
  goToGo({ tab: "calendar", where: ["Calendar", "Calendario"] }, "dias-quietos");
  const req = takeSpotRequest();
  check("L5 calendar fallback is quiet-block", req?.fallbackSpot === "quiet-block", JSON.stringify(req));
}

/* ——— H5-B1 pin (cured 2.2.41): the mirror door re-seats, never executes ——— */
{
  const base = journalFromUnknown(
    {
      profile: { displayName: "Tester", createdAt: 1000 },
      settings: { language: "en" },
      partners: ["Lucía"],
      sessions: [{ id: "shared-1", date: "2026-11-01", partnerName: "Sofía", count: 1, durationMins: 0, positions: [], contraception: [], problems: [], intensity: 0, connection: 0, satisfaction: 0, energy: 0, overall: 0, createdAt: 1000, source: "manual" }],
      encounters: [],
      people: [
        { id: "p-owner", name: "Tester", role: "owner", createdAt: 900, updatedAt: 900 },
        { id: "shared-1", name: "Lucía", role: "partner", createdAt: 1000, updatedAt: 1000 },
      ],
      proposals: [],
      updatedAt: 1000,
    },
    "en",
  );
  useJournal.setState({ journal: base, unlocked: true });
  useJournal.getState().deletePersonForever("Lucía");
  const after = useJournal.getState().journal!;
  check("B1 she is gone", !after.people?.some((p) => p.name === "Lucía"));
  check("B1 the foreign session survives, re-seated", after.sessions.length === 1 && after.sessions[0].id !== "shared-1", JSON.stringify(after.sessions.map((s) => s.id)));
}

console.log(`WAVE22-SURFACES2: ${breaks} break(s), ${holds} hold(s)`);
if (breaks > 0) process.exitCode = 1;
