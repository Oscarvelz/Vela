// Fake-data screenshots of the calendar stats footer. E2E build on 8132.
import { chromium } from "/workspace/work/browser-test/node_modules/playwright-core/index.mjs";
const OUT = "/workspace/work/vela-calstats-shots";
const browser = await chromium.launch({ executablePath: "/workspace/work/browser-test/browsers/chromium_headless_shell-1155/chrome-linux/headless_shell", args: ["--no-sandbox", "--no-proxy-server"] });
const errors = [];
const page = await browser.newPage({ viewport: { width: 412, height: 1100 }, deviceScaleFactor: 2.5 });
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:8132/Vela/");
await page.waitForSelector("#name", { timeout: 20000 });
await page.fill("#name", "Tester"); await page.fill("#create-pass", "fake-orbit-lantern-42"); await page.fill("#create-pass2", "fake-orbit-lantern-42");
await page.check("#pass-ack"); await page.click("button[type=submit]");
await page.waitForSelector(".ag-tabbar", { timeout: 30000 }); await page.waitForTimeout(800);
await page.keyboard.press("Escape").catch(() => {});
await page.addStyleTag({ content: ".ag-tabbar,.ag-header{visibility:hidden!important}" });
await page.evaluate(() => {
  const s = window.__velaStore.getState(); const pad = (n) => String(n).padStart(2, "0");
  const day = (o) => { const d = new Date(); d.setDate(d.getDate() + o); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const sessions = [-1, -1, -3, -6, -9, -12, -20, -26, -33, -41].map((o) => ({ date: day(o), time: "22:00", partnerName: "Fakepartner", place: "Bedroom", durationMins: 30, overall: 4, positions: [] }));
  s.importJSON(JSON.stringify({ app: "vela", sessions, partners: ["Fakepartner"] }));
  s.setTab("calendar");
});
const shot = async (name) => {
  await page.waitForTimeout(500);
  await page.waitForTimeout(800);
  const box = await page.locator("[data-testid=cal-stats]").boundingBox();
  await page.screenshot({ path: `${OUT}/${name}.png`, clip: { x: 0, y: Math.max(0, box.y - 330), width: 412, height: 400 } });
  const m = await page.evaluate(() => [...document.querySelectorAll("[data-testid=cal-stats] span")].map((e) => [e.textContent, e.scrollWidth > e.clientWidth + 1, Math.round(e.getBoundingClientRect().height)]));
  console.log(name, JSON.stringify(m));
};
await shot("night-en");
await page.evaluate(() => window.__velaStore.getState().setLanguage("es")); await shot("night-es");
await page.evaluate(() => { const s = window.__velaStore.getState(); s.setLanguage("en"); s.toggleMode(); }); await shot("day-en");
console.log("errors", JSON.stringify(errors));
await browser.close();
