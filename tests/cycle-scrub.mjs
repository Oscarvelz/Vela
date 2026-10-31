// Cycle tracker visual check. FAKE data only. Serves: e2e build (store hook) at 8132, real docs at 8131.
// Usage: LD_LIBRARY_PATH=... node tests/cycle-shots.mjs <self|partner|empty|real> [es]
import { chromium } from "/workspace/work/browser-test/node_modules/playwright-core/index.mjs";
import { mkdirSync } from "node:fs";

const MODE = process.argv[2] || "self";
const LANG = process.argv[3] || "en";
const OUT = "/workspace/work/vela-cycle-shots";
mkdirSync(OUT, { recursive: true });
const URL = MODE === "real" ? "http://127.0.0.1:8131/Vela/" : "http://127.0.0.1:8132/Vela/";

const browser = await chromium.launch({
  executablePath: "/workspace/work/browser-test/browsers/chromium_headless_shell-1155/chrome-linux/headless_shell",
  args: ["--no-sandbox", "--no-proxy-server"],
});
const page = await browser.newPage({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 2.5, locale: LANG === "es" ? "es-ES" : "en-US" });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));

await page.goto(URL);
await page.waitForSelector("#name", { timeout: 20000 });
await page.fill("#name", "Tester");
await page.fill("#create-pass", "fake-orbit-lantern-42");
await page.fill("#create-pass2", "fake-orbit-lantern-42");
await page.check("#pass-ack");
await page.click("button[type=submit]");
await page.waitForSelector(".ag-tabbar", { timeout: 30000 });
await page.waitForTimeout(600);

if (MODE === "real") {
  // Production build: no hook. Enable the cycle through the UI and mark a first day.
  await page.click('button:has-text("Track my cycle")');
  await page.waitForSelector('[data-testid="cycle-first"]');
  await page.locator('[data-testid="cycle-first"] button[aria-label]:not([disabled])').nth(20).click();
  await page.click('[data-testid="cycle-first"] button:has-text("Start tracking")');
  await page.waitForSelector('[data-testid="cycle-card"]');
  await page.click('[data-testid="cycle-primary"]');
  await page.waitForTimeout(300);
  for (const tab of ["Calendar", "History", "Insights", "Home"]) {
    await page.click(`.ag-tabbar button:has-text("${tab}")`);
    await page.waitForTimeout(400);
  }
  console.log("real build errors:", JSON.stringify(errors));
  await browser.close();
  process.exit(errors.length ? 1 : 0);
}

await page.evaluate(
  ({ mode, lang }) => {
    const store = window.__velaStore.getState();
    const pad = (n) => String(n).padStart(2, "0");
    const day = (offset) => {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };
    if (lang === "es") store.setLanguage("es");
    if (mode === "empty") {
      store.setCycle({ enabled: true });
      return;
    }
    const startOffsets = [-181, -150, -124, -95, -68, -39, -11];
    const starts = startOffsets.map(day);
    const ends = { [day(-124)]: day(-120), [day(-95)]: day(-90), [day(-68)]: day(-64), [day(-39)]: day(-35), [day(-11)]: day(-7) };
    const days = {
      [day(-11)]: { flow: "heavy", symptoms: ["cramps", "fatigue"], mood: "low" },
      [day(-10)]: { flow: "medium", symptoms: ["cramps"] },
      [day(-9)]: { flow: "light" },
      [day(-3)]: { symptoms: ["libidoHigh"], mood: "happy" },
      [day(-1)]: { symptoms: ["libidoHigh", "discharge"], mood: "calm", note: "Fake note for testing" },
      [day(-30)]: { symptoms: ["libidoLow", "bloating"], mood: "irritable" },
      [day(-44)]: { symptoms: ["libidoHigh"] },
      [day(-60)]: { symptoms: ["libidoLow", "headache"] },
    };
    store.setCycle({ enabled: true, perspective: mode === "partner" ? "partner" : "self", partnerName: mode === "partner" ? "Luna" : "", starts, ends, days });
    const sessions = [-1, -2, -5, -9, -14, -18, -25, -33, -41, -47, -55].map((offset, index) => ({
      date: day(offset),
      time: "22:00",
      partnerName: "Fakepartner",
      place: "Bedroom",
      durationMins: 30 + index,
      overall: 4,
      intensity: 3,
      connection: 4,
      satisfaction: 4,
      energy: 3,
      positions: [],
    }));
    store.importJSON(JSON.stringify({ app: "vela", sessions, partners: ["Fakepartner"] }));
  },
  { mode: MODE, lang: LANG },
);
await page.waitForTimeout(500);

const card = page.locator('#cycle-card');
await card.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 16));
await page.waitForTimeout(900);
await card.screenshot({ path: `${OUT}/scrub-0-today.png` });
const svg = page.locator('.cy-dial-svg');
const b = await svg.boundingBox();
const cx = b.x + b.width / 2, cy = b.y + b.height / 2, r = b.width * 100 / 240;
const at = (deg) => [cx + r * Math.sin(deg * Math.PI / 180), cy - r * Math.cos(deg * Math.PI / 180)];
let [x, y] = at(30); await page.mouse.move(x, y); await page.mouse.down();
for (let d = 30; d <= 100; d += 10) { [x, y] = at(d); await page.mouse.move(x, y); await page.waitForTimeout(30); }
await page.mouse.up(); await page.waitForTimeout(400);
console.log('after drag', await page.locator('.cy-dial').getAttribute('aria-valuetext'));
await card.screenshot({ path: `${OUT}/scrub-1-drag.png` });
await page.locator('[data-testid="cycle-phase-chips"] button').nth(1).click(); await page.waitForTimeout(400);
console.log('chip', await page.locator('.cy-dial').getAttribute('aria-valuetext'));
await card.screenshot({ path: `${OUT}/scrub-2-chip.png` });
await page.locator('.cy-dial').focus(); await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(200);
console.log('key', await page.locator('.cy-dial').getAttribute('aria-valuetext'));
await page.locator('[data-testid="cycle-phase-chips"] button').nth(3).click(); await page.waitForTimeout(400);
console.log('low', await page.locator('.cy-dial').getAttribute('aria-valuetext'));
await card.screenshot({ path: `${OUT}/scrub-3-low.png` });
await page.locator('.cy-act').first().click(); await page.waitForTimeout(300);
console.log('back', await page.locator('.cy-dial').getAttribute('aria-valuetext'));
const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
console.log('overflow', ov, 'errors', JSON.stringify(errors));
await browser.close();
