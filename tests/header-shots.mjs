// Fake-data header screenshots (tagline + cycle pill). E2E build on 8132.
import { chromium } from "/workspace/work/browser-test/node_modules/playwright-core/index.mjs";
const OUT = "/workspace/work/vela-header-shots";
const browser = await chromium.launch({ executablePath: "/workspace/work/browser-test/browsers/chromium_headless_shell-1155/chrome-linux/headless_shell", args: ["--no-sandbox", "--no-proxy-server"] });
const errors = [];
const results = [];
for (const width of [360, 412]) {
  const page = await browser.newPage({ viewport: { width, height: 800 }, deviceScaleFactor: 2.5 });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:8132/Vela/");
  await page.waitForSelector("#name", { timeout: 20000 });
  await page.fill("#name", "Tester"); await page.fill("#create-pass", "fake-orbit-lantern-42"); await page.fill("#create-pass2", "fake-orbit-lantern-42");
  await page.check("#pass-ack"); await page.click("button[type=submit]");
  await page.waitForSelector(".ag-tabbar", { timeout: 30000 }); await page.waitForTimeout(800);
  await page.keyboard.press("Escape").catch(() => {});
  await page.evaluate(() => {
    const s = window.__velaStore.getState(); const pad = (n) => String(n).padStart(2, "0");
    const day = (o) => { const d = new Date(); d.setDate(d.getDate() + o); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
    s.setCycle({ enabled: true, perspective: "self", partnerName: "", starts: [day(-58), day(-30), day(-2)], ends: [], days: {} });
  });
  const shot = async (name) => {
    await page.waitForTimeout(1500); await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${OUT}/${width}-${name}.png`, clip: { x: 0, y: 0, width, height: 84 } });
    const m = await page.evaluate(() => {
      const tag = document.querySelector(".ag-tagline"); const pill = document.querySelector("[data-testid=cycle-pill]");
      const lh = parseFloat(getComputedStyle(tag).lineHeight) || 12;
      return { tagLines: Math.round(tag.getBoundingClientRect().height / lh), tagClipped: tag.scrollWidth > tag.clientWidth + 1, tagText: tag.textContent, tagW: Math.round(tag.clientWidth), tagSW: tag.scrollWidth, parW: Math.round(tag.parentElement.getBoundingClientRect().width), pill: pill?.innerText, pillH: pill && Math.round(pill.getBoundingClientRect().height), pillW: pill && Math.round(pill.getBoundingClientRect().width) };
    });
    results.push([width, name, m]); console.log(width, name, JSON.stringify(m));
  };
  await shot("night-en");
  await page.evaluate(() => window.__velaStore.getState().setLanguage("es")); await shot("night-es");
  await page.evaluate(() => { const s = window.__velaStore.getState(); s.setLanguage("en"); s.toggleMode(); }); await shot("day-en");
  await page.close();
}
console.log("errors", JSON.stringify(errors));
await browser.close();
