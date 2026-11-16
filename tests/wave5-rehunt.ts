/* Wave 5 re-hunt — fresh prejudice against the NEW door machinery,
 * driving the real store through goToGo the way a (?)-door tap does. */
const g = globalThis as Record<string, unknown>;
if (typeof g.window === "undefined") g.window = g;
const { useJournal } = await import("../src/lib/vela/store");
const { goToTopicGo, takeSpotRequest } = await import("../src/lib/vela/manual-nav");

process.on("unhandledRejection", () => undefined);

let breaks = 0;
let holds = 0;
function hold(name: string) { holds += 1; console.log(`HOLD ${name}`); }
function brk(name: string, extra = "") { breaks += 1; console.log(`BREAK ${name}${extra ? " — " + extra : ""}`); }
const S = () => useJournal.getState();

/* RH1 — the batch doors raise the card they ring. */
{
  S().setShowBatch(false);
  goToTopicGo("lector-lotes");
  const req = takeSpotRequest();
  if (S().showBatch && S().tab === "home" && req?.spot === "batch-card") hold("RH1 lector-lotes opens Home with the batch card raised");
  else brk("RH1 batch door", `showBatch=${S().showBatch} tab=${S().tab} spot=${req?.spot}`);
}

/* RH2 — a statistics door carries the chapter fallback. */
{
  goToTopicGo("fuera-del-patron");
  const req = takeSpotRequest();
  if (req?.spot === "cycle-reasons-card" && req?.fallbackSpot === "insights-top" && S().tab === "insights")
    hold("RH2 statistics doors fall back to the surface anchor");
  else brk("RH2 chapter fallback", JSON.stringify(req));
}

/* RH3 — bloqueo's door opens Profile, not Privacy. */
{
  goToTopicGo("bloqueo");
  takeSpotRequest();
  if (S().settingsOpen && S().sections["profile"]) hold("RH3 bloqueo opens the Profile section");
  else brk("RH3 bloqueo section", `open=${S().settingsOpen} sections=${JSON.stringify(S().sections)}`);
}

/* RH4 — a non-batch Home door does not raise the batch card. */
{
  S().setShowBatch(false);
  goToTopicGo("el-ciclo");
  takeSpotRequest();
  if (!S().showBatch && S().tab === "home") hold("RH4 only batch doors raise the batch card");
  else brk("RH4 batch selectivity", `showBatch=${S().showBatch}`);
}

/* RH5 — a Settings door carries no chapter fallback (its sections
 * are the landing), and the request is consumed exactly once. */
{
  goToTopicGo("puerta-sin-conexion");
  const req = takeSpotRequest();
  const again = takeSpotRequest();
  if (req && req.fallbackSpot === undefined && again === null) hold("RH5 requests are one-shot, settings doors unfellbacked");
  else brk("RH5 request lifecycle", `req=${JSON.stringify(req)} again=${JSON.stringify(again)}`);
}

/* RH6 — the cycle sub-doors fall back to the card that hosts them. */
{
  goToTopicGo("proyeccion");
  const a = takeSpotRequest();
  goToTopicGo("varios-ciclos");
  const b = takeSpotRequest();
  if (a?.fallbackSpot === "cycle-card" && b?.fallbackSpot === "cycle-card")
    hold("RH6 projection and tracker-switch doors fall back to the cycle card");
  else brk("RH6 cycle fallbacks", `proy=${a?.fallbackSpot} varios=${b?.fallbackSpot}`);
}

/* RH7 — couple-settings doors fall back to the couple section, the
 * one landing that exists whether couple mode is on or off. */
{
  goToTopicGo("decisiones");
  const req = takeSpotRequest();
  if (req?.spot === "proposals-inbox" && req?.fallbackSpot === "couple-section")
    hold("RH7 decisiones falls back to the couple section");
  else brk("RH7 couple fallback", JSON.stringify(req));
}

console.log(`WAVE5-REHUNT: ${breaks} breaks, ${holds} holds`);
if (breaks > 0) process.exitCode = 1;
