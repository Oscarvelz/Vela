// Fake-data check: the coloured rating sections (Connection first, plus Intensity / Satisfaction / Energy)
// of the session details form — collapsed, open, each level selected, night/day/es; picking still saves.
import { chromium } from "/workspace/work/browser-test/node_modules/playwright-core/index.mjs";
import { mkdirSync } from "node:fs";
const PORT = process.env.VELA_PORT || "8133";
const OUT = process.env.SHOTS || "/workspace/work/vela-color-shots";
mkdirSync(OUT, { recursive: true });
let fails = 0; const ok = (n, c, x = "") => { if (!c) fails++; console.log(`${c ? "PASS" : "FAIL"}  ${n}  ${JSON.stringify(x)}`); };
const browser = await chromium.launch({ executablePath: "/workspace/work/browser-test/browsers/chromium_headless_shell-1155/chrome-linux/headless_shell", args: ["--no-sandbox", "--no-proxy-server"] });
const page = await browser.newPage({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 2.5, hasTouch: true, locale: "en-US" });
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`http://127.0.0.1:${PORT}/Vela/`);
await page.waitForSelector("#name", { timeout: 20000 });
await page.fill("#name", "Tester"); await page.fill("#create-pass", "fake-orbit-lantern-42"); await page.fill("#create-pass2", "fake-orbit-lantern-42");
await page.check("#pass-ack"); await page.click("button[type=submit]");
await page.waitForSelector(".ag-tabbar", { timeout: 30000 }); await page.waitForTimeout(800);
await page.evaluate(() => window.__velaStore.setState((s) => ({ journal: { ...s.journal, partners: ["Fakepartner"] } })));

{ const d = page.locator(".ag-hero-actions .ag-hero-tile").nth(0); if ((await d.getAttribute("aria-pressed")) !== "true") await d.click(); }
await page.waitForTimeout(500);

const blocks = page.locator(".vr:visible");
const block = (name) => blocks.filter({ has: page.locator("button[aria-expanded] span.font-semibold", { hasText: new RegExp(`^${name}$`) }) }).first();
const head = (b) => b.locator("button[aria-expanded]").first();
const opt = (b, lvl) => b.locator(`.vr-opt[data-level="${lvl}"]`);
const shot = async (name, loc) => {
  await page.waitForTimeout(500);
  const tag = await page.addStyleTag({ content: ".ag-header, .ag-tabbar { visibility: hidden !important; }" });
  await loc.scrollIntoViewIfNeeded({ timeout: 8000 });
  await loc.screenshot({ path: `${OUT}/${name}.png`, timeout: 8000, animations: "disabled" });
  await tag.evaluate((e) => e.remove());
};
const bg = (loc) => loc.evaluate((e) => getComputedStyle(e).backgroundImage);
const col = (loc) => loc.evaluate((e) => getComputedStyle(e).color);

ok("four rating blocks", (await blocks.count()) === 4, await blocks.count());
const conn = block("Connection");
await conn.scrollIntoViewIfNeeded();
ok("connection collapsed, aria-expanded=false", (await head(conn).getAttribute("aria-expanded")) === "false");
await shot("01-connection-collapsed-night-en", conn);

await head(conn).click(); await page.waitForTimeout(300);
ok("opens, aria-expanded=true", (await head(conn).getAttribute("aria-expanded")) === "true");
ok("five level cards", (await conn.locator(".vr-opt").count()) === 5);
const names = await conn.locator(".vr-name").allInnerTexts();
ok("en labels unchanged", names.join(",") === "Distant,Sweet,Close,Soulful,Profound", names);
const titleCols = await Promise.all([1, 2, 3, 4, 5].map((l) => col(opt(conn, l).locator(".vr-name"))));
ok("each level title has its own colour", new Set(titleCols).size === 5, titleCols);
const numBgs = await Promise.all([1, 2, 3, 4, 5].map((l) => opt(conn, l).locator(".vr-num").evaluate((e) => getComputedStyle(e).backgroundColor)));
ok("each medallion tinted differently", new Set(numBgs).size === 5, numBgs);
await shot("02-connection-open-night-en", conn);

for (const lvl of [1, 2, 3, 4, 5]) {
  await opt(conn, lvl).click(); await page.waitForTimeout(250);
  const v = await page.evaluate(() => window.__velaStore.getState().draft?.connection);
  const draftVal = v ?? null;
  ok(`level ${lvl}: selected flag + check`, (await conn.locator(".vr-opt[data-selected]").count()) === 1 && (await opt(conn, lvl).getAttribute("data-selected")) === "" && (await opt(conn, lvl).locator(".vr-check").count()) === 1);
  ok(`level ${lvl}: selected medallion filled with gradient`, (await bg(opt(conn, lvl).locator(".vr-num"))).includes("gradient"));
  if (draftVal !== null) ok(`level ${lvl}: draft rating = ${lvl}`, draftVal === lvl, draftVal);
  await shot(`03-connection-level${lvl}-night-en`, conn);
}
// Collapse at Soulful: summary chip coloured coral.
await opt(conn, 4).click(); await page.waitForTimeout(200);
await head(conn).click(); await page.waitForTimeout(300);
const chip = conn.locator(".vr-chip");
ok("collapsed summary chip shows Soulful", (await chip.innerText()) === "Soulful", await chip.innerText());
const chipCol = await col(chip);
ok("chip is warm (red > blue)", (() => { const m = chipCol.match(/[\d.]+/g).map(Number); return m[0] > m[2] + (chipCol.startsWith("color(") ? 0.15 : 40); })(), chipCol);
ok("header icon tinted", (await conn.locator(".vr-icon").evaluate((e) => getComputedStyle(e).color)) !== (await block("Intensity").locator(".vr-icon").evaluate((e) => getComputedStyle(e).color)));
ok("4 lit dots", (await conn.locator(".vr-dot[data-on]").count()) === 4);
await shot("04-connection-collapsed-soulful-night-en", conn);

// Other scales get their palettes too.
for (const [name, lvl] of [["Intensity", 3], ["Satisfaction", 5], ["Energy", 2]]) {
  const b = block(name);
  await head(b).click(); await page.waitForTimeout(250);
  await opt(b, lvl).click(); await page.waitForTimeout(250);
  await shot(`05-${name.toLowerCase()}-open-night-en`, b);
  await head(b).click(); await page.waitForTimeout(200);
}
await shot("06-all-collapsed-night-en", page.locator(".vr:visible").first().locator(".."));

// es
await page.evaluate(() => window.__velaStore.getState().setLanguage("es")); await page.waitForTimeout(400);
const connEs = block("Conexión");
await head(connEs).click(); await page.waitForTimeout(300);
const namesEs = await connEs.locator(".vr-name").allInnerTexts();
ok("es labels unchanged", namesEs.join(",") === "Distante,Dulce,Cercano,Íntimo,Profundo", namesEs);
await shot("07-connection-open-night-es", connEs);
await opt(connEs, 5).click(); await page.waitForTimeout(250);
await shot("08-connection-profundo-night-es", connEs);

// day
await page.evaluate(() => { const s = window.__velaStore.getState(); if (s.journal.settings.mode !== "day") s.toggleMode(); }); await page.waitForTimeout(500);
await shot("09-connection-profundo-day-es", connEs);
await page.evaluate(() => window.__velaStore.getState().setLanguage("en")); await page.waitForTimeout(400);
const connD = block("Connection");
for (const lvl of [1, 3, 4]) { await opt(connD, lvl).click(); await page.waitForTimeout(250); await shot(`10-connection-level${lvl}-day-en`, connD); }
// Contrast check in day: title ink against white-ish surface.
const lum = (rgb) => { const raw = rgb.match(/[\d.]+/g).slice(0, 3).map(Number); const scale = rgb.startsWith("color(") ? 1 : 255; const [r, g, b] = raw.map((c) => { c /= scale; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const dayCols = await Promise.all([1, 2, 3, 4, 5].map((l) => col(opt(connD, l).locator(".vr-name"))));
const ratios = dayCols.map((c) => (1.05) / (lum(c) + 0.05));
ok("day titles contrast ≥ 4.5 vs white", ratios.every((r) => r >= 4.5), ratios.map((r) => r.toFixed(2)));
await head(connD).click(); await page.waitForTimeout(300);
await shot("11-connection-collapsed-day-en", connD);
for (const name of ["Intensity", "Satisfaction", "Energy"]) { const b = block(name); await head(b).click(); await page.waitForTimeout(250); await shot(`12-${name.toLowerCase()}-open-day-en`, b); await head(b).click(); }
await shot("13-all-collapsed-day-en", page.locator(".vr:visible").first().locator(".."));
await page.evaluate(() => window.__velaStore.getState().toggleMode()); await page.waitForTimeout(400);

// Reduced motion: no transitions / animations
await page.emulateMedia({ reducedMotion: "reduce" });
await head(connD).click(); await page.waitForTimeout(300);
const rm = await opt(connD, 4).evaluate((e) => getComputedStyle(e).transitionDuration);
const rmAnim = await opt(connD, 4).locator(".vr-heat").evaluate((e) => getComputedStyle(e).animationName);
ok("reduced motion: no transitions, no flicker", rm.split(",").every((d) => parseFloat(d) === 0) && rmAnim === "none", [rm, rmAnim]);
await page.emulateMedia({ reducedMotion: "no-preference" });

// Overflow
const ovf = await connD.evaluate((c) => { const r = c.getBoundingClientRect(); return [...c.querySelectorAll("*")].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && (b.right > r.right + 1 || b.left < r.left - 1); }).length; });
ok("no horizontal overflow", ovf === 0, ovf);

// Save: the rating persists on the session.
await opt(connD, 5).click(); await page.waitForTimeout(200);
const before = await page.evaluate(() => window.__velaStore.getState().journal.sessions.length);
await page.locator('[data-testid="save-moment"]').scrollIntoViewIfNeeded();
await page.locator('[data-testid="save-moment"]').click(); await page.waitForTimeout(900);
const saved = await page.evaluate(() => window.__velaStore.getState().journal.sessions.map((s) => ({ c: s.connection, i: s.intensity, sa: s.satisfaction, e: s.energy })));
ok("session saved with connection=5 + other ratings", saved.length === before + 1 && saved.some((s) => s.c === 5 && s.i === 3 && s.sa === 5 && s.e === 2), saved);

ok("no page errors", errors.length === 0, errors);
await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
