// Fake-data check: hero heading lines, regularity explainer, precise taps on the today moon.
import { chromium } from "/workspace/work/browser-test/node_modules/playwright-core/index.mjs";
const OUT = "/workspace/work/vela-cycle-shots";
const LANG = process.argv[2] || "en";
let fails = 0; const ok = (n, c, x = "") => { if (!c) fails++; console.log(`${c ? "PASS" : "FAIL"}  ${n}  ${JSON.stringify(x)}`); };
const browser = await chromium.launch({ executablePath: "/workspace/work/browser-test/browsers/chromium_headless_shell-1155/chrome-linux/headless_shell", args: ["--no-sandbox", "--no-proxy-server"] });
const page = await browser.newPage({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 2.5, hasTouch: true, locale: LANG === "es" ? "es-ES" : "en-US" });
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:8132/Vela/");
await page.waitForSelector("#name", { timeout: 20000 });
await page.fill("#name", "Tester"); await page.fill("#create-pass", "fake-orbit-lantern-42"); await page.fill("#create-pass2", "fake-orbit-lantern-42");
await page.check("#pass-ack"); await page.click("button[type=submit]");
await page.waitForSelector(".ag-tabbar", { timeout: 30000 }); await page.waitForTimeout(800);
if (LANG === "es") { await page.evaluate(() => window.__velaStore.getState().setLanguage("es")); await page.waitForTimeout(300); }
const hero = page.locator(".ag-hero").first();
const lines = await page.evaluate(() => { const h = document.querySelector(".ag-hero-title"); const lh = parseFloat(getComputedStyle(h).lineHeight); return Math.round(h.getBoundingClientRect().height / lh); });
ok("hero title balanced in 2 lines", lines === 2, lines);
const heroShape = await page.evaluate(() => {
  const tiles = [...document.querySelectorAll(".ag-hero-actions .ag-hero-tile")];
  const w = tiles.map((t) => Math.round(t.getBoundingClientRect().width));
  const cta = Math.round(document.querySelector(".ag-hero-cta").getBoundingClientRect().width);
  const row = Math.round(document.querySelector(".ag-hero-actions").getBoundingClientRect().width);
  const clipped = [...document.querySelectorAll(".ag-hero-tile-label")].filter((e) => e.scrollWidth > e.clientWidth + 1).length;
  return { n: tiles.length, even: new Set(w).size === 1, cta, row, clipped, pressed: tiles.map((t) => t.getAttribute("aria-pressed")) };
});
ok("hero: one full-width action over an even 3-up row", heroShape.n === 3 && heroShape.even && Math.abs(heroShape.cta - heroShape.row) <= 1 && heroShape.clipped === 0, heroShape);
ok("hero: Details/Batch are toggles", heroShape.pressed[0] !== null && heroShape.pressed[1] !== null, heroShape.pressed);
await hero.screenshot({ path: `${OUT}/hero-empty${LANG === "es" ? "-es" : ""}.png` });
// Learning state: 2 starts
await page.evaluate(() => { const s = window.__velaStore.getState(); const pad = (n) => String(n).padStart(2, "0"); const day = (o) => { const d = new Date(); d.setDate(d.getDate() + o); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }; s.setCycle({ enabled: true, perspective: "self", starts: [day(-40), day(-11)], ends: {}, days: {} }); });
await page.waitForTimeout(500);
const card = page.locator("#cycle-card");
await page.addStyleTag({ content: ".ag-tabbar,.ag-header{visibility:hidden!important}" });
await card.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 16));
await page.click('[data-testid="cycle-regularity"]'); await page.waitForTimeout(400);
const info = await page.locator('[data-testid="cycle-reginfo"]').innerText().catch(() => "");
ok("learning chip opens explainer", info.length > 40, info.slice(0, 80));
await card.screenshot({ path: `${OUT}/reginfo-learning${LANG === "es" ? "-es" : ""}.png` });
await page.click('[data-testid="cycle-regularity"]'); await page.waitForTimeout(300);
// Precise taps around the today moon
const moon = await page.locator(".cy-today-dot").boundingBox();
const cx = moon.x + moon.width / 2, cy = moon.y + moon.height / 2;
const today = await page.locator('[data-testid="cycle-day"]').innerText();
let good = 0, total = 0;
for (const [dx, dy] of [[0,0],[9,0],[-9,0],[0,9],[0,-9],[7,7],[-7,-7],[7,-7],[-7,7],[12,0],[-12,0]]) {
  await page.mouse.click(cx + dx, cy + dy); await page.waitForTimeout(150);
  const v = await page.locator('[data-testid="cycle-day"]').innerText(); total++; if (v === today) good++;
  await page.locator(".cy-center").click(); await page.waitForTimeout(120);
}
ok("taps near the moon pick today", good === total, `${good}/${total} (today ${today})`);
ok("no page errors", errors.length === 0, errors);
await browser.close(); console.log(fails ? `TAP FAIL ${fails}` : "TAP ALL PASS"); process.exit(fails ? 1 : 0);
