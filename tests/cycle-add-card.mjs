// Fake-data check: add a person's cycle straight from the cycle card header (en/es); card rests folded.
import { chromium } from "/workspace/work/browser-test/node_modules/playwright-core/index.mjs";
import { mkdirSync } from "node:fs";
const OUT = "/workspace/work/vela-addcard-shots"; mkdirSync(OUT, { recursive: true });
let fails = 0; const ok = (n, c, x = "") => { if (!c) fails++; console.log(`${c ? "PASS" : "FAIL"}  ${n}  ${JSON.stringify(x)}`); };
const browser = await chromium.launch({ executablePath: "/workspace/work/browser-test/browsers/chromium_headless_shell-1155/chrome-linux/headless_shell", args: ["--no-sandbox", "--no-proxy-server"] });
for (const lang of ["en", "es"]) {
  const page = await browser.newPage({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 2.5, locale: lang === "es" ? "es-ES" : "en-US" });
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:8132/Vela/");
  await page.waitForSelector("#name", { timeout: 20000 });
  await page.fill("#name", "Tester"); await page.fill("#create-pass", "fake-orbit-lantern-42"); await page.fill("#create-pass2", "fake-orbit-lantern-42");
  await page.check("#pass-ack"); await page.click("button[type=submit]");
  await page.waitForSelector(".ag-tabbar", { timeout: 30000 }); await page.waitForTimeout(600);
  await page.evaluate((lang) => {
    const s = window.__velaStore.getState();
    if (lang === "es") s.setLanguage("es");
    const d = new Date(); d.setDate(d.getDate() - 3);
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    s.setCycle({ enabled: true, perspective: "partner", starts: [ds] });
    s.importJSON(JSON.stringify({ app: "vela", sessions: [], partners: ["Fakeana", "Fakelu"] }));
  }, lang);
  await page.waitForTimeout(500);
  const card = page.locator("#cycle-card");
  ok(`${lang}: card rests folded`, (await card.getAttribute("data-folded")) === "true");
  ok(`${lang}: no switcher with one cycle`, (await page.locator(".cy-switch, [data-testid=cycle-switch]").count()) === 0);
  await page.click('[data-testid="cycle-add-person"]'); await page.waitForTimeout(300);
  ok(`${lang}: add panel opens from the card`, await page.locator('[data-testid="cycle-add-panel"]').isVisible());
  const hdr = await page.evaluate(() => { const r = document.querySelector('[data-testid="cycle-title"]'); return r.scrollWidth <= r.clientWidth + 1; });
  ok(`${lang}: title not clipped with the extra glyph`, hdr);
  await page.addStyleTag({ content: ".ag-tabbar,.ag-header{visibility:hidden!important}" });
  await card.screenshot({ path: `${OUT}/${lang}-panel.png` });
  await page.locator('[data-testid="cycle-add-partner"]', { hasText: "Fakelu" }).click(); await page.waitForTimeout(500);
  const n = await page.evaluate(() => window.__velaStore.getState().journal.settings.cycles.length);
  ok(`${lang}: second cycle added`, n === 2, n);
  ok(`${lang}: panel closes after adding`, (await page.locator('[data-testid="cycle-add-panel"]').count()) === 0);
  await card.screenshot({ path: `${OUT}/${lang}-after.png` });
  ok(`${lang}: no page errors`, errors.length === 0, errors);
  await page.close();
}
await browser.close();
console.log(fails ? `cycle-add-card: ${fails} FAIL` : "cycle-add-card: ok"); process.exit(fails ? 1 : 0);
