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

const tag = `${MODE}${LANG === "es" ? "-es" : ""}`;
async function setMode(mode) {
  await page.evaluate((m) => {
    const s = window.__velaStore.getState();
    if (s.journal.settings.mode !== m) s.toggleMode();
  }, mode);
  await page.waitForTimeout(450);
}
async function tab(name) {
  await page.evaluate((n) => window.__velaStore.getState().setTab(n), name);
  await page.waitForTimeout(500);
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(200);
}
async function shot(locator, name) {
  // Fixed header / tab bar would sit on top of a tall element: hide them for element shots only.
  await page.addStyleTag({ content: ".ag-tabbar,.ag-header{visibility:hidden!important}" }).then((h) => h.evaluate((el) => el.setAttribute("data-shot", "1")));
  await locator.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 16));
  await page.waitForTimeout(950);
  await locator.screenshot({ path: `${OUT}/${name}.png` });
  await page.evaluate(() => document.querySelectorAll("style[data-shot]").forEach((el) => el.remove()));
}

for (const mode of ["night", "day"]) {
  await setMode(mode);
  await tab("home");
  if (MODE === "empty") {
    await shot(page.locator('[data-testid="cycle-first"]'), `empty-card-${mode}`);
    await page.click('[data-testid="cycle-first"] button:has-text("partner")').catch(() => page.click('[data-testid="cycle-first"] [aria-pressed]:nth-child(2)'));
    await page.locator('[data-testid="cycle-first"] button[aria-label]:not([disabled])').nth(24).click();
    await shot(page.locator('[data-testid="cycle-first"]'), `empty-card-partner-${mode}`);
    await page.click('[data-testid="cycle-first"] [aria-pressed]:first-child');
    continue;
  }
  await page.screenshot({ path: `${OUT}/${tag}-header-${mode}.png`, clip: { x: 0, y: 0, width: 412, height: 82 } });
  await shot(page.locator('#cycle-card'), `${tag}-home-card-${mode}`);
  // Session form phase chip
  const chip = page.locator('[data-testid="session-phase"]').first();
  if (await chip.count()) {
    await chip.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const box = await chip.boundingBox();
    await page.screenshot({ path: `${OUT}/${tag}-session-phase-${mode}.png`, clip: { x: 0, y: Math.max(0, box.y - 120), width: 412, height: 190 } });
  }
  // Header pill opens the cycle sheet
  await page.evaluate(() => scrollTo(0, 0));
  await page.click('[data-testid="cycle-pill"]');
  await page.waitForSelector('[data-testid="cycle-sheet"]');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${tag}-pill-sheet-${mode}.png` });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  if (MODE === "self") {
    await page.evaluate(() => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const p = (n) => String(n).padStart(2, "0");
      window.__velaStore.getState().openCycleDay(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
    });
    await page.waitForSelector('[data-testid="day-log"]');
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/${tag}-day-log-${mode}.png` });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  } else {
    const hidden = await page.locator('[data-testid="day-log"]').count();
    console.log("partner: day log sheet present?", hidden);
  }
  await tab("calendar");
  await page.screenshot({ path: `${OUT}/${tag}-calendar-${mode}.png` });
  await tab("history");
  await page.screenshot({ path: `${OUT}/${tag}-history-${mode}.png`, clip: { x: 0, y: 0, width: 412, height: 900 } });
  await tab("insights");
  await shot(page.locator('[data-testid="cycle-stats"]'), `${tag}-insights-${mode}`);
}

if (MODE === "partner") {
  const texts = await page.evaluate(() => document.body.innerText);
  console.log("partner: 'Log today' visible?", /Log today|Registrar hoy/.test(texts));
  await page.evaluate(() => window.__velaStore.getState().setSettingsOpen(true));
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const s = window.__velaStore.getState();
    if (!s.sections.cycle) s.toggleSection("cycle");
  });
  await page.waitForTimeout(400);
  await shot(page.locator('[data-testid="cycle-perspective"]').locator("xpath=../.."), `${tag}-settings-day`);
}

console.log(`${tag} errors:`, JSON.stringify(errors));
await browser.close();
