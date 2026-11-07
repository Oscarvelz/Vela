// Fake-data UI check for a long code-switched numbered item (fake names Ana/Lucia): one card, right date/time/rounds/partner,
// whole text in the note, partner flag + alt chip, nothing wraps at 360. Serve a VITE_E2E build.
import { chromium } from "/workspace/work/browser-test/node_modules/playwright-core/index.mjs";
import { mkdirSync } from "node:fs";
const OUT = "/workspace/work/vela-batch-shots"; mkdirSync(OUT, { recursive: true });
const PORT = process.env.VELA_PORT || 8137;
let fails = 0; const ok = (n, c, x = "") => { if (!c) fails++; console.log(`${c ? "PASS" : "FAIL"}  ${n}  ${c ? "" : JSON.stringify(x)}`); };
const ITEM34 = "34. Sept 21. I met Ana 2 years ago. 9:16 de la noche, esperando por Lucia. Este ha sido quizás uno de los días más esperados, puesto que ella estuvo en su periodo menstrual y estuvimos intercambiando mensajes muy sugestivos en el chat. Twice, no difficulties to get an erection. The first time was full in intensity and full of a burning desire. The second time was more pleasurable to me, with the orgasm.";
const AMBIG = "35. Oct 23 en el cuarto, Ana, Lucia";
const ALT = "36. Oct 25. Waiting for Marta at 8pm, though I met Sara 3 years ago.";
const browser = await chromium.launch({ executablePath: "/workspace/work/browser-test/browsers/chromium_headless_shell-1155/chrome-linux/headless_shell", args: ["--no-sandbox", "--no-proxy-server"] });
for (const [lang, width, mode] of [["en", 360, "night"], ["es", 360, "day"], ["en", 412, "day"]]) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 2.5, hasTouch: true, locale: lang === "es" ? "es-US" : "en-US" });
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${PORT}/Vela/`);
  await page.waitForSelector("#name", { timeout: 20000 });
  await page.fill("#name", "Tester"); await page.fill("#create-pass", "fake-orbit-lantern-42"); await page.fill("#create-pass2", "fake-orbit-lantern-42");
  await page.check("#pass-ack"); await page.click("button[type=submit]");
  await page.waitForSelector(".ag-tabbar", { timeout: 30000 }); await page.waitForTimeout(800);
  await page.evaluate(([lang, mode]) => window.__velaStore.setState((s) => ({ journal: { ...s.journal, partners: ["Ana", "Lucia"], settings: { ...s.journal.settings, lang, language: lang, mode } } })), [lang, mode]);
  await page.waitForTimeout(300);
  await page.locator(".ag-hero-actions .ag-hero-tile").nth(1).click(); await page.waitForTimeout(400);
  await page.locator(".vb-page-text").fill(`${ITEM34}\n${AMBIG}\n${ALT}`); await page.waitForTimeout(500);
  const cards = page.locator('[data-testid="batch-card"]');
  ok(`${lang}-${width}: three items → three cards`, (await cards.count()) === 3, await cards.count());
  const c0 = cards.nth(0);
  const date = await c0.locator(".vb-card-date").innerText();
  ok(`${lang}: date Sep 21`, /21/.test(date) && /(Sep|sept)/i.test(date), date);
  const meta = await c0.locator(".vb-card-meta").innerText();
  ok(`${lang}: 9:16 PM and 2 rounds`, /(9:16\s?(PM|p\.?\s?m\.?)|21:16)/i.test(meta) && /2 (rounds|rondas)/.test(meta), meta);
  const who = await c0.locator(".vb-card-who").innerText();
  ok(`${lang}: with Lucia, no check flag`, /Lucia/.test(who) && !/(check this|revísalo)/.test(who), who);
  const note = await c0.locator(".vb-note-text").innerText();
  ok(`${lang}: note keeps the whole text`, note.includes("I met Ana 2 years ago") && note.includes("with the orgasm.") && note.includes("9:16 de la noche"), note.slice(0, 80));
  const c1 = cards.nth(1);
  const who1 = await c1.locator(".vb-card-who").innerText();
  ok(`${lang}: ambiguous item flags a check`, (await c1.locator('[data-testid="batch-partner-check"]').count()) === 1, who1);
  const wraps = await page.evaluate(() => [...document.querySelectorAll(".vb-card-who, .vb-card-meta, .vb-card-kicker, .vb-card-date")].filter((e) => e.getBoundingClientRect().height > 30).map((e) => e.innerText));
  ok(`${lang}-${width}: card lines on one line`, wraps.length === 0, wraps);
  const ell = await page.evaluate(() => [...document.querySelectorAll('[data-testid="batch-card"] *')].some((e) => getComputedStyle(e).textOverflow === "ellipsis" && e.scrollWidth > e.clientWidth));
  ok(`${lang}: no ellipsis`, !ell);
  // Adjust on the ambiguous card offers the other name as a chip; picking it clears the flag
  await c1.getByRole("button", { name: lang === "en" ? "Adjust" : "Ajustar" }).click(); await page.waitForTimeout(250);
  const chip = c1.getByRole("button", { name: "Lucia", exact: true });
  ok(`${lang}: alt name chip offered`, (await chip.count()) >= 1, await chip.count());
  if (await chip.count()) { await chip.first().click(); await page.waitForTimeout(250); }
  ok(`${lang}: picking clears the flag`, (await c1.locator('[data-testid="batch-partner-check"]').count()) === 0 && /Lucia/.test(await c1.locator(".vb-card-who").innerText()));
  await c1.getByRole("button", { name: lang === "en" ? "Done" : "Listo" }).click().catch(() => {}); await page.waitForTimeout(200);
  const c2 = cards.nth(2);
  ok(`${lang}: waiting for Marta → Marta`, /Marta/.test(await c2.locator(".vb-card-who").innerText()));
  await c2.getByRole("button", { name: lang === "en" ? "Adjust" : "Ajustar" }).click(); await page.waitForTimeout(250);
  ok(`${lang}: unsaved other name offered as a chip`, (await c2.getByRole("button", { name: "Sara", exact: true }).count()) === 1);
  const chipWrap = await c2.evaluate((el) => [...el.querySelectorAll("button[aria-pressed]")].filter((e) => e.getBoundingClientRect().height > 48).map((e) => e.innerText));
  ok(`${lang}: chips on one line each`, chipWrap.length === 0, chipWrap);
  await c2.screenshot({ path: `${OUT}/${lang}-${width}-${mode}-altchip.png` });
  await c2.getByRole("button", { name: lang === "en" ? "Done" : "Listo" }).click().catch(() => {}); await page.waitForTimeout(200);
  const tag = await page.addStyleTag({ content: ".ag-header, .ag-tabbar { visibility: hidden !important; }" });
  await c0.scrollIntoViewIfNeeded(); await c0.screenshot({ path: `${OUT}/${lang}-${width}-${mode}-item.png` });
  await c1.scrollIntoViewIfNeeded(); await c1.screenshot({ path: `${OUT}/${lang}-${width}-${mode}-ambig.png` });
  await tag.evaluate((e) => e.remove());
  ok(`${lang}: no page errors`, errors.length === 0, errors);
  await page.close();
}
await browser.close();
console.log(fails ? `batch-mixed-ui: ${fails} failed` : "batch-mixed-ui: ok");
process.exit(fails ? 1 : 0);
