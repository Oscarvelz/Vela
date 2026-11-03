// Fake-data check: (1) auto-hiding header / tab bar leave nothing behind (no blurred band), and
// (2) the foldable cycle card (summary, persistence per tracker, a11y, unchanged unfolded body).
// Usage: LD_LIBRARY_PATH=... node tests/fold-bars.mjs   (e2e build with the store hook, served at 8132)
import { chromium } from "/workspace/work/browser-test/node_modules/playwright-core/index.mjs";
import { mkdirSync } from "node:fs";

const OUT = "/workspace/work/vela-fold-shots";
mkdirSync(OUT, { recursive: true });
let fails = 0;
const ok = (n, c, x = "") => {
  if (!c) fails++;
  console.log(`${c ? "PASS" : "FAIL"}  ${n}${x !== "" ? "  — " + JSON.stringify(x) : ""}`);
};
const browser = await chromium.launch({
  executablePath: "/workspace/work/browser-test/browsers/chromium_headless_shell-1155/chrome-linux/headless_shell",
  args: ["--no-sandbox", "--no-proxy-server"],
});
const page = await browser.newPage({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 2.5, hasTouch: true, locale: "en-US" });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));
await page.goto("http://127.0.0.1:8132/Vela/");
await page.waitForSelector("#name", { timeout: 20000 });
await page.fill("#name", "Tester");
await page.fill("#create-pass", "fake-orbit-lantern-42");
await page.fill("#create-pass2", "fake-orbit-lantern-42");
await page.check("#pass-ack");
await page.click("button[type=submit]");
await page.waitForSelector(".ag-tabbar", { timeout: 30000 });
await page.waitForTimeout(800);

const store = (fn, arg) => page.evaluate(fn, arg);
await store(() => {
  const s = window.__velaStore.getState();
  const pad = (n) => String(n).padStart(2, "0");
  const day = (o) => { const d = new Date(); d.setDate(d.getDate() + o); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  s.setCycle({ enabled: true, perspective: "self", starts: [-89, -60, -31, -2].map(day), ends: {}, days: {} });
  const sessions = [-1, -3, -6, -12, -20].map((o) => ({ date: day(o), time: "22:00", partnerName: "Fakepartner", place: "Bedroom", durationMins: 30, overall: 4, intensity: 3, connection: 4, satisfaction: 4, energy: 3, positions: [] }));
  if (!s.journal.sessions.length) s.importJSON(JSON.stringify({ app: "vela", sessions, partners: ["Fakepartner"] }));
});
await page.waitForTimeout(600);
const mode = () => store(() => window.__velaStore.getState().journal.settings.mode);
if ((await mode()) !== "night") await store(() => window.__velaStore.getState().toggleMode());
await page.waitForTimeout(300);

/* ── 1. Bars ─────────────────────────────────────────────────────────────── */
const scrollSteps = async (dy, n) => {
  for (let i = 0; i < n; i++) {
    await page.evaluate((d) => window.scrollBy(0, d), dy);
    await page.waitForTimeout(24);
  }
  await page.waitForTimeout(700);
};
const barState = () =>
  page.evaluate(() => {
    const nav = document.querySelector(".ag-tabbar");
    const face = document.querySelector(".ag-tabbar-face");
    const head = document.querySelector(".ag-header");
    const cs = (el) => getComputedStyle(el);
    return {
      navBackdrop: cs(nav).backdropFilter,
      navBg: cs(nav).backgroundColor,
      navShadow: cs(nav).boxShadow,
      faceVis: cs(face).visibility,
      faceOpacity: cs(face).opacity,
      faceTop: Math.round(face.getBoundingClientRect().top),
      headVis: cs(head).visibility,
      headOpacity: cs(head).opacity,
      headBottom: Math.round(head.getBoundingClientRect().bottom),
      vh: innerHeight,
    };
  });
const shotBars = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}-bottom.png`, clip: { x: 0, y: 900 - 220, width: 412, height: 220 } });
  await page.screenshot({ path: `${OUT}/${name}-top.png`, clip: { x: 0, y: 0, width: 412, height: 200 } });
};

for (const m of ["night", "day"]) {
  if ((await mode()) !== m) await store(() => window.__velaStore.getState().toggleMode());
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  await scrollSteps(40, 14); // scroll down → bars hide
  const hidden = await barState();
  ok(`${m}: bars hidden — fixed wrapper has no blur/background/shadow`, hidden.navBackdrop === "none" && /rgba\(0, 0, 0, 0\)|transparent/.test(hidden.navBg) && hidden.navShadow === "none", hidden);
  ok(`${m}: bars hidden — dock face gone (off-screen, invisible)`, hidden.faceVis === "hidden" && Number(hidden.faceOpacity) === 0 && hidden.faceTop >= hidden.vh, hidden);
  ok(`${m}: bars hidden — header gone`, hidden.headVis === "hidden" && Number(hidden.headOpacity) === 0 && hidden.headBottom <= 0, hidden);
  // Pixel proof: the bottom strip with the bars hidden equals the same strip with the whole nav removed.
  await page.emulateMedia({ reducedMotion: "reduce" });
  // Freeze the page's own living bits (dial sky, moon glow, star dust) so only the bars can differ.
  const still = await page.addStyleTag({ content: ".cy-dial,.cy-sky,canvas,.vela-sky-glow,.ag-hero svg{visibility:hidden!important}" });
  await page.waitForTimeout(300);
  const clip = { x: 0, y: 900 - 160, width: 412, height: 160 };
  const a = await page.screenshot({ clip, animations: "disabled" });
  const tag = await page.addStyleTag({ content: ".ag-tabbar{display:none!important}" });
  await page.waitForTimeout(150);
  const b = await page.screenshot({ clip, animations: "disabled" });
  await tag.evaluate((el) => el.remove());
  const topClip = { x: 0, y: 0, width: 412, height: 120 };
  const c = await page.screenshot({ clip: topClip, animations: "disabled" });
  const tag2 = await page.addStyleTag({ content: ".ag-header{opacity:0!important}" });
  await page.waitForTimeout(150);
  const d = await page.screenshot({ clip: topClip, animations: "disabled" });
  await tag2.evaluate((el) => el.remove());
  await still.evaluate((el) => el.remove());
  await page.emulateMedia({ reducedMotion: "no-preference" });
  ok(`${m}: bottom edge identical to no nav at all (no band)`, a.equals(b));
  ok(`${m}: top edge identical to no header at all`, c.equals(d));
  if (!c.equals(d)) { const { writeFileSync } = await import("node:fs"); writeFileSync(`/tmp/top-${m}-a.png`, c); writeFileSync(`/tmp/top-${m}-b.png`, d); }
  await page.waitForTimeout(300);
  await shotBars(`bars-hidden-${m}`);
  await scrollSteps(-30, 8); // scroll up a little → bars return
  const shown = await barState();
  ok(`${m}: bars shown again, full look`, shown.faceVis === "visible" && Number(shown.faceOpacity) === 1 && shown.faceTop < shown.vh - 40 && shown.headVis === "visible" && Number(shown.headOpacity) === 1 && shown.headBottom > 40, shown);
  const faceBlur = await page.evaluate(() => getComputedStyle(document.querySelector(".ag-tabbar-face")).backdropFilter);
  ok(`${m}: dock face keeps its blur`, /blur/.test(faceBlur), faceBlur);
  await shotBars(`bars-shown-${m}`);
}
if ((await mode()) !== "night") await store(() => window.__velaStore.getState().toggleMode());

/* ── 2. Fold ─────────────────────────────────────────────────────────────── */
await page.addStyleTag({ content: ".ag-tabbar,.ag-header{visibility:hidden!important}" });
const card = page.locator("#cycle-card");
const toCard = async () => {
  await card.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 16));
  await page.waitForTimeout(500);
};
await toCard();
ok("card rests folded on arrival", (await card.getAttribute("data-folded")) === "true");
await page.click('[data-testid="cycle-fold"]');
await page.waitForTimeout(800);
const h0 = (await card.boundingBox()).height;
await card.screenshot({ path: `${OUT}/unfolded-before-night.png` });
const foldBtn = page.locator('[data-testid="cycle-fold"]');
const ctl = await page.evaluate(() => { const b = document.querySelector('[data-testid="cycle-fold"]'); return { exp: b.getAttribute("aria-expanded"), label: b.getAttribute("aria-label"), target: !!document.getElementById(b.getAttribute("aria-controls")) }; });
ok("fold control labelled, expanded, controls the body", ctl.exp === "true" && ctl.label === "Fold cycle card" && ctl.target, ctl);
await foldBtn.click();
await page.waitForTimeout(700);
const h1 = (await card.boundingBox()).height;
ok("folded card is compact", h1 < 190 && h1 < h0 * 0.4, { h0, h1 });
ok("fold control now says Expand, aria-expanded=false", (await foldBtn.getAttribute("aria-expanded")) === "false" && (await foldBtn.getAttribute("aria-label")) === "Expand cycle card");
const mini = await page.evaluate(() => ({
  day: document.querySelector('[data-testid="cycle-mini-day"]')?.textContent,
  phase: document.querySelector('[data-testid="cycle-mini-phase"]')?.textContent,
  line: document.querySelector('[data-testid="cycle-mini-line"]')?.textContent,
  bodyInert: document.getElementById(document.querySelector('[data-testid="cycle-fold"]').getAttribute("aria-controls")).inert,
  clipped: [...document.querySelectorAll('[data-testid="cycle-mini-line"],[data-testid="cycle-mini-phase"]')].filter((e) => e.scrollWidth > e.clientWidth + 1).length,
  overflowX: document.documentElement.scrollWidth > innerWidth,
}));
ok("summary shows day, phase, forecast", /3/.test(mini.day) && mini.phase === "Period" && mini.line.length > 4, mini);
ok("summary text not clipped, no h-overflow", mini.clipped === 0 && !mini.overflowX, mini);
ok("hidden body is inert", mini.bodyInert === true);
ok("fold is not persisted", await store(() => localStorage.getItem("vela-cy-folded") === null));
await card.screenshot({ path: `${OUT}/folded-night.png` });
// Unfold, tab away and back: it folds itself again.
await foldBtn.click();
await page.waitForTimeout(700);
ok("unfolded before leaving", (await card.getAttribute("data-folded")) === "false");
await page.click('.ag-tabbar button[data-tab="calendar"]', { force: true }).catch(() => store(() => window.__velaStore.getState().setTab?.("calendar")));
await page.waitForTimeout(400);
await page.click('.ag-tabbar button[data-tab="home"]', { force: true }).catch(() => store(() => window.__velaStore.getState().setTab?.("home")));
await page.waitForTimeout(600);
ok("folds again after leaving the tab", (await page.locator('[data-testid="cycle-card"]').getAttribute("data-folded")) === "true");
await toCard();

// Day mode + Spanish folded shots.
await store(() => window.__velaStore.getState().toggleMode());
await page.waitForTimeout(400);
await card.screenshot({ path: `${OUT}/folded-day.png` });
await store(() => window.__velaStore.getState().toggleMode());
await store(() => window.__velaStore.getState().setLanguage("es"));
await page.waitForTimeout(400);
ok("es: Expand label", (await foldBtn.getAttribute("aria-label")) === "Desplegar la tarjeta del ciclo");
const esClip = await page.evaluate(() => [...document.querySelectorAll('[data-testid="cycle-mini-line"],[data-testid="cycle-mini-phase"]')].filter((e) => e.scrollWidth > e.clientWidth + 1).length);
ok("es: summary not clipped", esClip === 0, esClip);
await card.screenshot({ path: `${OUT}/folded-night-es.png` });
await store(() => window.__velaStore.getState().setLanguage("en"));
await page.waitForTimeout(300);

// Tapping the title row unfolds; height and dial come back unchanged.
await page.click('[data-testid="cycle-title"]');
await page.waitForTimeout(800);
const h2 = (await card.boundingBox()).height;
ok("title tap unfolds to the same height", Math.abs(h2 - h0) <= 1.5, { h0, h2 });
const settled = await page.evaluate(() => document.getElementById(document.querySelector('[data-testid="cycle-fold"]').getAttribute("aria-controls")).dataset.settled);
ok("open body settles (overflow visible again)", settled === "true", settled);
await card.screenshot({ path: `${OUT}/unfolded-after-night.png` });
// Dial still scrubs.
const before = await page.locator('[data-testid="cycle-day"]').innerText();
await page.locator(".cy-dial").focus();
await page.keyboard.press("ArrowRight");
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(300);
const after = await page.locator('[data-testid="cycle-day"]').innerText();
ok("dial scrubbing still works when unfolded", Number(after) === Number(before) + 2, { before, after });
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

// Reduced motion: instant.
await page.emulateMedia({ reducedMotion: "reduce" });
await foldBtn.click();
await page.waitForTimeout(40);
const hr = (await card.boundingBox()).height;
ok("reduced motion folds instantly", hr < 190, hr);
await foldBtn.click();
await page.waitForTimeout(40);
ok("reduced motion unfolds instantly", Math.abs((await card.boundingBox()).height - h0) <= 1.5);
await page.emulateMedia({ reducedMotion: "no-preference" });

// Partner tracker (late), folded independently, switcher visible.
await store(() => {
  const s = window.__velaStore.getState();
  const pad = (n) => String(n).padStart(2, "0");
  const day = (o) => { const d = new Date(); d.setDate(d.getDate() + o); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  s.addTracker({ perspective: "partner", partnerName: "Luna", partnerLink: "Luna" });
  s.setCycle({ starts: [-96, -68, -40].map(day) });
});
await page.waitForTimeout(600);
await toCard();
ok("new partner tracker starts unfolded", (await page.locator('[data-testid="cycle-card"]').getAttribute("data-folded")) === "false");
await page.screenshot({ path: `${OUT}/partner-unfolded-viewport.png` });
await foldBtn.click();
await page.waitForTimeout(700);
const p = await page.evaluate(() => ({
  switcher: !!document.querySelector('#cycle-card [data-testid="cycle-switch"]'),
  late: document.querySelector('[data-testid="cycle-mini-late"]')?.textContent ?? null,
  title: document.querySelector('[data-testid="cycle-title"]')?.textContent,
  line: document.querySelector('[data-testid="cycle-mini-line"]')?.textContent,
}));
// With the switcher naming her, the folded title is just "Cycle" (Nov 2: one line at 360 px).
ok("partner folded: switcher + late indicator + plain title", p.switcher && /Late \+\d+/.test(p.late || "") && /^cycle$/i.test((p.title || "").trim()), p);
await card.screenshot({ path: `${OUT}/partner-folded-night.png` });
await store(() => window.__velaStore.getState().setLanguage("es"));
await page.waitForTimeout(400);
await card.screenshot({ path: `${OUT}/partner-folded-night-es.png` });
await store(() => window.__velaStore.getState().setLanguage("en"));
// Switch back to me: one fold for the card (it is no longer per tracker or saved).
await page.click('[data-testid="cycle-switch"] button:first-child');
await page.waitForTimeout(500);
ok("switching people keeps the card as it was", (await page.locator('[data-testid="cycle-card"]').getAttribute("data-folded")) === "true");
await page.click('[data-testid="cycle-switch"] button:last-child');
await page.waitForTimeout(500);
ok("switching back keeps it folded", (await page.locator('[data-testid="cycle-card"]').getAttribute("data-folded")) === "true");
await store(() => window.__velaStore.getState().toggleMode());
await page.waitForTimeout(400);
await card.screenshot({ path: `${OUT}/partner-folded-day.png` });

ok("no page errors", errors.length === 0, errors);
await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
