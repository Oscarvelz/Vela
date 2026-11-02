// Fake-data check: numbered lists become encounters, and a recap sits above Save (en/es, night/day, 360/412).
import { chromium } from "/workspace/work/browser-test/node_modules/playwright-core/index.mjs";
import { mkdirSync } from "node:fs";
const OUT = "/workspace/work/vela-recap-shots"; mkdirSync(OUT, { recursive: true });
const PORT = process.env.VELA_PORT || 8133;
let fails = 0; const ok = (n, c, x = "") => { if (!c) fails++; console.log(`${c ? "PASS" : "FAIL"}  ${n}  ${JSON.stringify(x)}`); };
const browser = await chromium.launch({ executablePath: "/workspace/work/browser-test/browsers/chromium_headless_shell-1155/chrome-linux/headless_shell", args: ["--no-sandbox", "--no-proxy-server"] });
for (const [lang, width] of [["en", 412], ["es", 360]]) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 2.5, hasTouch: true, locale: lang === "es" ? "es-US" : "en-US" });
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${PORT}/Vela/`);
  await page.waitForSelector("#name", { timeout: 20000 });
  await page.fill("#name", "Tester"); await page.fill("#create-pass", "fake-orbit-lantern-42"); await page.fill("#create-pass2", "fake-orbit-lantern-42");
  await page.check("#pass-ack"); await page.click("button[type=submit]");
  await page.waitForSelector(".ag-tabbar", { timeout: 30000 }); await page.waitForTimeout(800);
  await page.evaluate((lang) => window.__velaStore.setState((s) => ({ journal: { ...s.journal, partners: ["Ana", "Marco"], settings: { ...s.journal.settings, lang } } })), lang);
  await page.waitForTimeout(300);
  await page.locator(".ag-hero-actions .ag-hero-tile").nth(1).click(); await page.waitForTimeout(400);
  ok(`${lang}: no recap while empty`, (await page.locator('[data-testid="batch-recap"]').count()) === 0);
  const text = lang === "en"
    ? "Last week:\n1. Monday in the bedroom, twice, 5 stars\n2. Wednesday couch around 11pm\n3. shower"
    : "1) el lunes en la cama, dos veces 2) el miércoles en el sofá 3) en la ducha";
  await page.locator(".vb-page-text").fill(text); await page.waitForTimeout(400);
  const cards = await page.locator('[data-testid="batch-card"]').count();
  ok(`${lang}: numbered list → 3 cards`, cards === 3, cards);
  await page.locator(".vb-chip", { hasText: "Ana" }).click(); await page.waitForTimeout(200);
  const rows = await page.locator('[data-testid="batch-recap-row"]').count();
  ok(`${lang}: recap has 3 rows`, rows === 3, rows);
  const total = await page.locator('[data-testid="batch-recap-total"]').innerText();
  ok(`${lang}: recap total counts sessions`, /3 .* 4 /.test(total), total);
  const recapBox = await page.locator('[data-testid="batch-recap"]').boundingBox();
  const saveBox = await page.locator('[data-testid="batch-save"]').boundingBox();
  ok(`${lang}: recap sits right above Save`, recapBox.y + recapBox.height <= saveBox.y + 1 && saveBox.y - (recapBox.y + recapBox.height) < 40, [recapBox, saveBox]);
  const wraps = await page.evaluate(() => [...document.querySelectorAll(".vb-recap-row > span, .vb-recap-total, .vb-recap-who")].filter((e) => e.getClientRects().length > 1 || e.scrollHeight > e.clientHeight + 2 || e.getBoundingClientRect().height > 26 || e.scrollWidth > e.clientWidth + 1).map((e) => e.className));
  ok(`${lang}: every recap line on one line`, wraps.length === 0, wraps);
  // skip one → recap shrinks and says so
  await page.locator('[data-testid="batch-card"]').nth(2).getByRole("button", { name: lang === "en" ? "Leave this one out" : /fuera|Dejar/i }).click(); await page.waitForTimeout(250);
  ok(`${lang}: skipped one leaves the recap`, (await page.locator('[data-testid="batch-recap-row"]').count()) === 2);
  const tag = await page.addStyleTag({ content: ".ag-header, .ag-tabbar { visibility: hidden !important; }" });
  await page.locator('[data-testid="batch-recap"]').scrollIntoViewIfNeeded();
  const r = await page.locator('[data-testid="batch-recap"]').boundingBox();
  await page.screenshot({ path: `${OUT}/${lang}-${width}-night.png`, clip: { x: 0, y: Math.max(0, r.y - 30), width, height: r.height + 150 } });
  await page.evaluate(() => window.__velaStore.setState((s) => ({ journal: { ...s.journal, settings: { ...s.journal.settings, mode: "day" } } })));
  await page.waitForTimeout(500);
  const r2 = await page.locator('[data-testid="batch-recap"]').boundingBox();
  await page.screenshot({ path: `${OUT}/${lang}-${width}-day.png`, clip: { x: 0, y: Math.max(0, r2.y - 30), width, height: r2.height + 150 } });
  await tag.evaluate((e) => e.remove());
  ok(`${lang}: no page errors`, errors.length === 0, errors);
  await page.close();
}
await browser.close();
console.log(fails ? `batch-recap: ${fails} FAIL` : "batch-recap: ok"); process.exit(fails ? 1 : 0);
