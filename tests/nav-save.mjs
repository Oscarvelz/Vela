// Fake-data check: gliding tab indicator (alignment after taps / setTab / resize) and the Save button look.
import { chromium } from "/workspace/work/browser-test/node_modules/playwright-core/index.mjs";
import { mkdirSync } from "node:fs";
const OUT = "/workspace/work/vela-navsave-shots";
mkdirSync(OUT, { recursive: true });
let fails = 0; const ok = (n, c, x = "") => { if (!c) fails++; console.log(`${c ? "PASS" : "FAIL"}  ${n}  ${JSON.stringify(x)}`); };
const browser = await chromium.launch({ executablePath: "/workspace/work/browser-test/browsers/chromium_headless_shell-1155/chrome-linux/headless_shell", args: ["--no-sandbox", "--no-proxy-server"] });
const page = await browser.newPage({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 2.5, hasTouch: true, locale: "en-US" });
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:8132/Vela/");
await page.waitForSelector("#name", { timeout: 20000 });
await page.fill("#name", "Tester"); await page.fill("#create-pass", "fake-orbit-lantern-42"); await page.fill("#create-pass2", "fake-orbit-lantern-42");
await page.check("#pass-ack"); await page.click("button[type=submit]");
await page.waitForSelector(".ag-tabbar", { timeout: 30000 }); await page.waitForTimeout(900);

const align = () => page.evaluate(() => {
  const ind = document.querySelector('[data-testid="tab-indicator"]').getBoundingClientRect();
  const cur = document.querySelector('.ag-tabbar button[aria-current="page"]');
  const b = cur?.getBoundingClientRect();
  const n = document.querySelectorAll('.ag-tabbar button[aria-current="page"]').length;
  const on = document.querySelector('[data-testid="tab-indicator"]').dataset.on;
  if (!b) return { n, on, tab: null };
  return { n, on, tab: cur.dataset.tab, dx: Math.round(Math.abs(ind.left - b.left) * 10) / 10, dw: Math.round(Math.abs(ind.width - b.width) * 10) / 10, dy: Math.round(Math.abs(ind.top - b.top) * 10) / 10, dh: Math.round(Math.abs(ind.height - b.height) * 10) / 10 };
});
const aligned = (a, tab) => a.n === 1 && a.on === "true" && a.tab === tab && a.dx <= 0.6 && a.dw <= 0.6 && a.dy <= 0.6 && a.dh <= 0.6;
const nav = page.locator(".ag-tabbar");
const settle = async () => { await page.waitForTimeout(120); await page.waitForFunction(() => document.querySelector('[data-testid="tab-indicator"]').getAnimations().length === 0, null, { timeout: 3000 }).catch(() => {}); await page.waitForTimeout(60); };

ok("home active on start, chip aligned", aligned(await align(), "home"), await align());

for (const mode of ["night", "day"]) {
  if (mode === "day") { await page.evaluate(() => { const s = window.__velaStore.getState(); if (s.journal.settings.mode !== "day") s.toggleMode(); }); await page.waitForTimeout(400); }
  await page.evaluate(() => window.__velaStore.getState().setTab("home")); await page.waitForTimeout(500);
  await nav.screenshot({ path: `${OUT}/nav-${mode}-before.png` });
  await page.click('.ag-tabbar button[data-tab="history"]');
  await page.waitForTimeout(30);
  // Freeze the glide at ~45% (the stretched midpoint) so the screenshot shows it.
  const mid = await page.evaluate(() => { const i = document.querySelector('[data-testid="tab-indicator"]'); const a = i.getAnimations(); a.forEach((x) => { x.pause(); x.currentTime = 150; }); return { anims: a.length, w: Math.round(i.getBoundingClientRect().width) }; });
  await nav.screenshot({ path: `${OUT}/nav-${mode}-mid.png`, animations: "allow" });
  await page.evaluate(() => document.querySelector('[data-testid="tab-indicator"]').getAnimations().forEach((x) => x.play()));
  ok(`${mode}: glide is animating mid-way (stretched)`, mid.anims >= 1 && mid.w > 100, mid);
  await page.waitForTimeout(450);
  await nav.screenshot({ path: `${OUT}/nav-${mode}-after.png` });
  for (const tab of ["calendar", "insights", "home", "history", "insights", "calendar", "home"]) {
    await page.click(`.ag-tabbar button[data-tab="${tab}"]`); await settle();
    const a = await align();
    ok(`${mode}: chip lands on ${tab}`, aligned(a, tab), a);
  }
  const labelColors = await page.evaluate(() => [...document.querySelectorAll(".ag-tabbar button")].map((b) => getComputedStyle(b).color));
  ok(`${mode}: active tab color differs from inactive`, labelColors[0] !== labelColors[1], labelColors);
}
// Back to night for the rest
await page.evaluate(() => window.__velaStore.getState().toggleMode()); await page.waitForTimeout(300);

// Programmatic: setTab("calendar") from outside the bar (hero Calendar tile replaced by Repeat, Nov 1 2026)
await page.evaluate(() => window.__velaStore.getState().setTab("home")); await page.waitForTimeout(450);
await page.evaluate(() => window.__velaStore.getState().setTab("calendar")); await page.waitForTimeout(30);
await page.evaluate(() => document.querySelector('[data-testid="tab-indicator"]').getAnimations().forEach((x) => { x.pause(); x.currentTime = 120; }));
await nav.screenshot({ path: `${OUT}/nav-night-hero-calendar-mid.png`, animations: "allow" });
await page.evaluate(() => document.querySelector('[data-testid="tab-indicator"]').getAnimations().forEach((x) => x.play()));
await settle();
ok("setTab(calendar) → chip on calendar", aligned(await align(), "calendar"), await align());
await page.evaluate(() => window.__velaStore.getState().setTab("insights")); await page.waitForTimeout(450);
ok("store setTab(insights) → chip on insights", aligned(await align(), "insights"), await align());

// Settings open: no tab is current, chip hides; closes → reappears aligned
await page.evaluate(() => window.__velaStore.getState().setSettingsOpen(true)); await page.waitForTimeout(350);
const s1 = await align();
ok("settings open: no aria-current, chip hidden", s1.n === 0 && s1.on === "false", s1);
await page.evaluate(() => window.__velaStore.getState().setSettingsOpen(false)); await page.waitForTimeout(400);
ok("settings closed: chip back on insights", aligned(await align(), "insights"), await align());

// Resize: chip follows without animating
await page.setViewportSize({ width: 1100, height: 900 }); await page.waitForTimeout(400);
ok("resize wide: chip aligned", aligned(await align(), "insights"), await align());
await nav.screenshot({ path: `${OUT}/nav-night-wide.png` });
await page.click('.ag-tabbar button[data-tab="home"]'); await settle();
ok("wide: chip lands on home", aligned(await align(), "home"), await align());
await page.setViewportSize({ width: 412, height: 900 }); await page.waitForTimeout(400);
ok("resize back: chip aligned", aligned(await align(), "home"), await align());

// Reduced motion: no WAAPI glide, still aligned
await page.emulateMedia({ reducedMotion: "reduce" });
await page.click('.ag-tabbar button[data-tab="history"]'); await page.waitForTimeout(40);
const rm = await page.evaluate(() => document.querySelector('[data-testid="tab-indicator"]').getAnimations().length);
ok("reduced motion: no glide animation", rm === 0, rm);
ok("reduced motion: chip aligned at once", aligned(await align(), "history"), await align());
await page.emulateMedia({ reducedMotion: "no-preference" });
await page.click('.ag-tabbar button[data-tab="home"]'); await page.waitForTimeout(450);

// Save button
async function shotSave(tag) {
  await page.evaluate(() => window.__velaStore.getState().setTab("home")); await page.waitForTimeout(350);
  const details = page.locator(".ag-hero-actions .ag-hero-tile").nth(0);
  if ((await details.getAttribute("aria-pressed")) !== "true") await details.click();
  await page.waitForTimeout(400);
  const btn = page.locator('[data-testid="save-moment"]');
  await btn.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
  await page.mouse.move(0, 0);
  const box = await btn.boundingBox();
  const clip = { x: Math.max(0, box.x - 18), y: box.y - 26, width: Math.min(412, box.width + 36), height: box.height + 52 };
  await page.addStyleTag({ content: ".ag-tabbar,.ag-header{visibility:hidden!important}" }).then((h) => h.evaluate((el) => el.setAttribute("data-shot", "1")));
  await page.screenshot({ path: `${OUT}/save-${tag}.png`, clip });
  const look = await btn.evaluate((el) => { const cs = getComputedStyle(el); return { bg: cs.backgroundImage.slice(0, 60), color: cs.color, text: el.innerText.trim(), icon: !!el.querySelector(".ag-save-ico svg") }; });
  ok(`save (${tag}) amber gradient + icon`, look.bg.includes("gradient") && look.icon, look);
  await page.evaluate(() => document.querySelectorAll('style[data-shot]').forEach((s) => s.remove()));
  return look;
}
const night = await shotSave("night");
await page.evaluate(() => window.__velaStore.getState().toggleMode()); await page.waitForTimeout(400);
const day = await shotSave("day");
ok("night and day inks differ (navy vs cream)", night.color !== day.color, [night.color, day.color]);
await page.evaluate(() => window.__velaStore.getState().toggleMode()); await page.waitForTimeout(300);
await page.evaluate(() => window.__velaStore.getState().setLanguage("es")); await page.waitForTimeout(400);
const es = await shotSave("night-es");
ok("es label", es.text === "Guardar este momento", es.text);
// Hover shimmer + success burst
const btn = page.locator('[data-testid="save-moment"]');
await btn.hover(); await page.waitForTimeout(350);
const box = await btn.boundingBox();
await page.screenshot({ path: `${OUT}/save-night-hover.png`, clip: { x: 0, y: box.y - 26, width: 412, height: box.height + 52 } });
await page.evaluate(() => window.__velaStore.getState().setLanguage("en")); await page.waitForTimeout(300);
const before = await page.evaluate(() => window.__velaStore.getState().journal.sessions.length);
const b2 = await btn.boundingBox();
await btn.click(); await page.waitForTimeout(150);
const burst = await page.evaluate(() => { const b = document.querySelector(".ag-burst"); const r = b?.getBoundingClientRect(); const n = document.querySelector('[data-testid="save-moment"]').getBoundingClientRect(); return r ? { y: r.top, h: r.height, off: Math.abs(r.top - n.top) } : null; });
ok("burst sits on the (reset) save button", burst && burst.off < 2, burst);
await page.screenshot({ path: `${OUT}/save-night-burst.png`, clip: { x: 0, y: Math.max(0, (burst?.y ?? b2.y) - 60), width: 412, height: b2.height + 120 } });
const after = await page.evaluate(() => window.__velaStore.getState().journal.sessions.length);
ok("save still saves one session", after === before + 1, { before, after });
await page.waitForTimeout(900);
ok("burst cleaned up", (await page.locator(".ag-burst").count()) === 0);
// Batch save uses the same family; disabled state
await page.locator(".ag-hero-actions .ag-hero-tile").nth(1).click(); await page.waitForTimeout(400);
const bs = page.locator('[data-testid="batch-save"]');
await bs.scrollIntoViewIfNeeded(); await page.waitForTimeout(250);
const bb = await bs.boundingBox();
await page.screenshot({ path: `${OUT}/batch-save-disabled-night.png`, clip: { x: 0, y: bb.y - 20, width: 412, height: bb.height + 40 } });
const bl = await bs.evaluate((el) => ({ cls: el.className.includes("ag-save"), disabled: el.disabled }));
ok("batch save shares the save style", bl.cls && bl.disabled, bl);
ok("no page errors", errors.length === 0, errors);
await browser.close(); console.log(fails ? `NAVSAVE FAIL ${fails}` : "NAVSAVE ALL PASS"); process.exit(fails ? 1 : 0);
