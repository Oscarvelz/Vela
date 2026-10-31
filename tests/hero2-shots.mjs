// Fake-data screenshots of the home hero (v2). Needs the E2E build served at 8132.
import { chromium } from "/workspace/work/browser-test/node_modules/playwright-core/index.mjs";
const OUT = "/workspace/work/vela-cycle-shots";
const browser = await chromium.launch({ executablePath: "/workspace/work/browser-test/browsers/chromium_headless_shell-1155/chrome-linux/headless_shell", args: ["--no-sandbox", "--no-proxy-server"] });
const errors = [];
async function open(width = 412) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 2.5 });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:8132/Vela/");
  await page.waitForSelector("#name", { timeout: 20000 });
  await page.fill("#name", "Tester"); await page.fill("#create-pass", "fake-orbit-lantern-42"); await page.fill("#create-pass2", "fake-orbit-lantern-42");
  await page.check("#pass-ack"); await page.click("button[type=submit]");
  await page.waitForSelector(".ag-tabbar", { timeout: 30000 }); await page.waitForTimeout(700);
  await page.addStyleTag({ content: ".ag-tabbar{visibility:hidden!important} *{animation-play-state:paused!important}" });
  return page;
}
const st = (page, fn, arg) => page.evaluate(fn, arg);
const shot = async (page, name) => { await page.waitForTimeout(400); await page.locator(".ag-hero").first().screenshot({ path: `${OUT}/hero2-${name}.png` }); console.log("shot", name); };
const metrics = (page) => page.evaluate(() => {
  const h = document.querySelector(".ag-hero-title"); const lh = parseFloat(getComputedStyle(h).lineHeight);
  const tiles = [...document.querySelectorAll(".ag-hero-tile")].map((t) => Math.round(t.getBoundingClientRect().width));
  const clipped = [...document.querySelectorAll(".ag-hero-tile-label,.ag-hero-stat-label")].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent);
  const cta = document.querySelector(".ag-hero-cta").getBoundingClientRect();
  const row = document.querySelector(".ag-hero-actions").getBoundingClientRect();
  const body = document.querySelector(".ag-hero-body"); const bl = body ? Math.round(body.getBoundingClientRect().height / parseFloat(getComputedStyle(body).lineHeight)) : null;
  return { titleLines: Math.round(h.getBoundingClientRect().height / lh), tiles, clipped, ctaW: Math.round(cta.width), rowW: Math.round(row.width), bodyLines: bl };
});
const seed = () => {
  const s = window.__velaStore.getState(); const pad = (n) => String(n).padStart(2, "0");
  const day = (o) => { const d = new Date(); d.setDate(d.getDate() + o); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const offs = [-1, -2, -4, -6, -9, -12, -15, -20, -26, -33, -41, -48, -55, -63, -70, -78, -90, -101, -115, -130, -144, -160, -170];
  const sessions = offs.map((o) => ({ date: day(o), time: "22:00", partnerName: "Fakepartner", place: "Bedroom", durationMins: 30, overall: 4, intensity: 3, connection: 4, satisfaction: 4, energy: 3, positions: [] }));
  s.importJSON(JSON.stringify({ app: "vela", sessions, partners: ["Fakepartner"] }));
};
// empty night en / es, empty day en
let p = await open();
console.log("empty-night-en", JSON.stringify(await metrics(p))); await shot(p, "empty-night-en");
await st(p, () => window.__velaStore.getState().setLanguage("es"));
console.log("empty-night-es", JSON.stringify(await metrics(p))); await shot(p, "empty-night-es");
await st(p, () => { const s = window.__velaStore.getState(); s.setLanguage("en"); s.toggleMode(); });
console.log("empty-day-en", JSON.stringify(await metrics(p))); await shot(p, "empty-day-en");
// returning user night en
await st(p, () => window.__velaStore.getState().toggleMode());
await st(p, seed);
console.log("returning-night-en", JSON.stringify(await metrics(p))); await shot(p, "returning-night-en");
await st(p, () => window.__velaStore.getState().setLanguage("es"));
console.log("returning-night-es", JSON.stringify(await metrics(p))); await shot(p, "returning-night-es");
await st(p, () => { const s = window.__velaStore.getState(); s.setLanguage("en"); s.toggleMode(); });
await shot(p, "returning-day-en");
await st(p, () => window.__velaStore.getState().toggleMode());
// details open
if ((await p.getAttribute(".ag-hero-tile >> nth=0", "aria-pressed")) !== "true") await p.click(".ag-hero-tile >> nth=0");
await p.waitForTimeout(400);
const pressed = await p.evaluate(() => [...document.querySelectorAll(".ag-hero-tile")].map((t) => t.getAttribute("aria-pressed")));
console.log("details pressed", JSON.stringify(pressed));
await p.addStyleTag({ content: ".ag-header{visibility:hidden!important}" });
await p.evaluate(() => window.scrollTo(0, 0));
await p.screenshot({ path: `${OUT}/hero2-details-open-night-en.png`, fullPage: false }); console.log("shot details-open");
await p.click(".ag-hero-tile >> nth=1"); await p.waitForTimeout(400);
await p.screenshot({ path: `${OUT}/hero2-batch-open-night-en.png` });
console.log("batch pressed", JSON.stringify(await p.evaluate(() => [...document.querySelectorAll(".ag-hero-tile")].map((t) => t.getAttribute("aria-pressed")))));
await p.click(".ag-hero-tile >> nth=1"); await p.waitForTimeout(200);
await p.click(".ag-hero-tile >> nth=2"); await p.waitForTimeout(400);
console.log("calendar tab", await p.evaluate(() => window.__velaStore.getState().tab));
// lg two-column
const q = await open(1280);
await shot(q, "empty-night-lg");
console.log("errors", JSON.stringify(errors));
await browser.close();
