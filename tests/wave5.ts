/* Wave 5 fences — UI state and the Manual's doors (RT-V5 B2–B10).
 * The dynamic specimens (ring placement, door landings) live on the
 * Chrome bench; these fences pin the machinery statically so the
 * shapes cannot silently return: the doors' targets exist in every
 * state, the fallback can resolve its aliases, the batch card can be
 * raised by a door, and every theme's accent label clears AA. */
import { readFileSync } from "node:fs";
import { findTopic } from "../src/lib/vela/manual";

let breaks = 0;
let holds = 0;
function hold(name: string) { holds += 1; console.log(`HOLD ${name}`); }
function brk(name: string, extra = "") { breaks += 1; console.log(`BREAK ${name}${extra ? " — " + extra : ""}`); }

const read = (p: string) => readFileSync(p, "utf8");
const cycleCard = read("src/components/vela/cycle-card.tsx");
const insights = read("src/components/vela/insights-view.tsx");
const accountPanel = read("src/components/vela/account-panel.tsx");
const spotFocus = read("src/components/vela/spot-focus.tsx");
const manualNav = read("src/lib/vela/manual-nav.ts");
const store = read("src/lib/vela/store.ts");
const homeView = read("src/components/vela/home-view.tsx");
const settingsView = read("src/components/vela/settings-view.tsx");

/* S1 · B4 — bloqueo's door opens the section that hosts the Lock
 * button (Profile), and says so. */
{
  const go = findTopic("bloqueo")?.go;
  const lockInProfile = /function ProfileSection[\s\S]*?data-spot="lock-now"/.test(settingsView);
  if (go?.settings === "profile" && lockInProfile && go.where?.[0].includes("Profile"))
    hold("S1 bloqueo door opens Profile, where the Lock button lives");
  else brk("S1 bloqueo go", JSON.stringify(go));
}

/* S2 · B5 — every cycle state carries the card's spot: disabled
 * teaser, first-start, and the full card. */
{
  const spots = (cycleCard.match(/data-spot="cycle-card"/g) ?? []).length;
  if (spots >= 3) hold("S2 cycle-card spot exists in teaser, first-start and full states");
  else brk("S2 cycle spots", `found ${spots}`);
}

/* S3 · B5 — proyeccion's bubble lives outside the projected gate. */
{
  const gate = cycleCard.indexOf('data-testid="cycle-projected"');
  const outside = cycleCard.indexOf('topic="proyeccion"', gate);
  const second = cycleCard.indexOf('topic="proyeccion"', outside + 1);
  if (gate > 0 && second > gate) hold("S3 a proyeccion Hint renders when no pregnancy is noted");
  else brk("S3 proyeccion hint placement");
}

/* S4 · B6 — the Insights empty state carries the surface anchor. */
{
  const anchors = (insights.match(/data-spot="insights-top"/g) ?? []).length;
  if (anchors >= 2) hold("S4 insights-top exists on the full view and the empty state");
  else brk("S4 insights anchors", `found ${anchors}`);
}

/* S5 · B8 — the account door exists in the signed-out state too. */
{
  if (accountPanel.includes('data-spot="sync-section account-door"')) hold("S5 the signed-out panel carries the account-door spot");
  else brk("S5 account door states");
}

/* S6 · B3+B7 — the door machinery: the store can raise the batch
 * card, Home obeys it, the nav raises it for batch doors, and the
 * ring's fallback resolves HINT_ONLY aliases. */
{
  const ok =
    store.includes("showBatch: boolean") &&
    store.includes("setShowBatch:") &&
    homeView.includes("s.showBatch") &&
    manualNav.includes('go.spot === "batch-card"') &&
    manualNav.includes("insights-top") &&
    spotFocus.includes("HINT_ONLY");
  if (ok) hold("S6 doors can raise the batch card, fall back by chapter, and resolve hint aliases");
  else brk("S6 door machinery");
}

/* S7 · B2 — the ring measures a settled rect, not a fixed delay. */
{
  if (spotFocus.includes("stable") && !spotFocus.includes("}, 380)")) hold("S7 SpotFocus waits for a settled rect before drawing");
  else brk("S7 spot focus settling");
}

/* S8 · B10 — every theme × mode: the label on the accent clears
 * AA-normal (4.5:1) against the accent itself. */
{
  const css = read("src/styles.css");
  const lum = (hex: string) => {
    const h = hex.replace("#", "");
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    const lin = (c: number) => (c > 0.03928 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };
  const blocks = [...css.matchAll(/\[data-theme="(\w+)"\]\[data-mode="(\w+)"\] \{([\s\S]*?)\n\}/g)];
  const bad: string[] = [];
  let counted = 0;
  for (const b of blocks) {
    const accent = /--ag-accent:\s*(#[0-9a-f]{6})/.exec(b[3])?.[1];
    const on = /--ag-on-accent:\s*(#[0-9a-f]{6})/.exec(b[3])?.[1];
    if (!accent || !on) continue;
    counted += 1;
    const [hi, lo] = [Math.max(lum(accent), lum(on)), Math.min(lum(accent), lum(on))];
    const ratio = (hi + 0.05) / (lo + 0.05);
    if (ratio < 4.5) bad.push(`${b[1]}/${b[2]} ${ratio.toFixed(2)}`);
  }
  if (counted >= 6 && bad.length === 0) hold(`S8 accent labels clear 4.5:1 in all ${counted} theme blocks`);
  else brk("S8 accent contrast", bad.join(", ") || `only ${counted} blocks parsed`);
}

/* S9 — su-voz's door exists in both voice states: the Add button
 * when she has not spoken, the Edit button when she has. (The rich
 * doors bench caught the second state missing its spot.) */
{
  const card = read("src/components/vela/session-card.tsx");
  const doors = (card.match(/data-spot="voice-door"/g) ?? []).length;
  if (doors >= 2) hold("S9 voice-door spot exists with and without her voice");
  else brk("S9 voice-door states", `found ${doors}`);
}

console.log(`WAVE5: ${breaks} breaks, ${holds} holds`);
if (breaks > 0) process.exitCode = 1;
