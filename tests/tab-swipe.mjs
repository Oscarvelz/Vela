// Tab swipe (pager) + hero "Count one session now" confirm/undo. FAKE data only (Ana, Lucia).
// E2E build (VITE_E2E=1, store hook). Usage: VELA_PORT=<port> node tests/tab-swipe.mjs <part> [lang]
//   part: pager (default) | count:<lang>:<width> (e.g. count:es:360) | perf-only
//   perf-only: just the CPU-throttled frame-time measurement (works against an older build too).
// Touch is driven through CDP Input.dispatchTouchEvent, which goes through Chromium's real input pipeline
// (gesture detection, touch-action, compositor scrolling), like a finger on the phone.
import { chromium } from "/workspace/work/browser-test/node_modules/playwright-core/index.mjs";
import { mkdirSync } from "node:fs";

const PORT = process.env.VELA_PORT || 8132;
const URL = `http://127.0.0.1:${PORT}/Vela/`;
const PERF_ONLY = process.argv.includes("perf-only");
const COUNT = process.argv.find((arg) => arg.startsWith("count:"));
const LANG = process.argv.includes("es") ? "es" : "en";
const OUT = "/workspace/work/vela-swipe-shots";
mkdirSync(OUT, { recursive: true });

let fails = 0;
const ok = (name, cond, extra) => {
  if (!cond) fails += 1;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra === undefined ? "" : "  — " + JSON.stringify(extra)}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  executablePath: "/workspace/work/browser-test/browsers/chromium_headless_shell-1155/chrome-linux/headless_shell",
  args: ["--no-sandbox", "--no-proxy-server"],
});

async function openApp({ width = 412, height = 891, lang = LANG, dpr = Number(process.env.DPR || 1), reducedMotion = false } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dpr,
    isMobile: true,
    hasTouch: true,
    locale: lang === "es" ? "es-ES" : "en-US",
    reducedMotion: reducedMotion ? "reduce" : "no-preference",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("crash", () => console.log("!! renderer crashed"));
  page.on("close", () => console.log("!! page closed"));
  page.on("framenavigated", (f) => f === page.mainFrame() && console.log("   nav", f.url()));
  await page.goto(URL);
  await page.waitForSelector("#name", { timeout: 30000 });
  await page.fill("#name", "Tester");
  await page.fill("#create-pass", "fake-orbit-lantern-42");
  await page.fill("#create-pass2", "fake-orbit-lantern-42");
  await page.check("#pass-ack");
  await page.click("button[type=submit]");
  await page.waitForSelector(".ag-tabbar", { timeout: 30000 });
  await page.waitForTimeout(700);
  await page.keyboard.press("Escape").catch(() => {});
  await page.evaluate((lang) => {
    const store = window.__velaStore.getState();
    const pad = (n) => String(n).padStart(2, "0");
    const day = (o) => {
      const d = new Date();
      d.setDate(d.getDate() + o);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };
    if (lang === "es") store.setLanguage("es");
    store.setCycle({ enabled: true, perspective: "partner", partnerName: "Lucia", starts: [day(-70), day(-41), day(-12)], ends: {}, days: {} });
    const sessions = [];
    for (let i = 1; i <= 14; i++) {
      sessions.push({ date: day(-i * 3), time: "22:00", partnerName: i % 2 ? "Ana" : "Lucia", place: "Bedroom", durationMins: 30, overall: 4, intensity: 3, connection: 4, satisfaction: 4, energy: 3, positions: [] });
    }
    store.importJSON(JSON.stringify({ app: "vela", sessions, partners: ["Ana", "Lucia"] }));
    store.setTab("home");
  }, lang);
  await page.waitForTimeout(800);
  const cdp = await context.newCDPSession(page);
  return { context, page, cdp, errors };
}

function toucher(cdp) {
  // Events carry the timestamps a finger would give them (CDP `timestamp`), so velocity reads the same as on
  // a phone even when this headless browser delivers them late.
  const touch = (type, pts, ts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts, ...(ts ? { timestamp: ts } : {}) });
  return {
    /** A drag from (x0,y0) to (x1,y1) over ms milliseconds in steps moves; holdEnd keeps the finger still first. */
    async swipe(x0, y0, x1, y1, { ms = 200, steps = 8, holdEnd = 0, release = true } = {}) {
      const t0 = Date.now() / 1000;
      await touch("touchStart", [{ x: x0, y: y0 }], t0);
      for (let i = 1; i <= steps; i++) {
        await sleep(ms / steps);
        await touch("touchMove", [{ x: x0 + ((x1 - x0) * i) / steps, y: y0 + ((y1 - y0) * i) / steps }], t0 + (ms * i) / steps / 1000);
      }
      if (holdEnd) await sleep(holdEnd);
      if (release) await touch("touchEnd", [], t0 + (ms + holdEnd + 8) / 1000);
    },
    async move(x, y) {
      await touch("touchMove", [{ x, y }]);
    },
    async end() {
      await touch("touchEnd", []);
    },
    async tap(x, y) {
      await touch("touchStart", [{ x, y }]);
      await sleep(60);
      await touch("touchEnd", []);
    },
  };
}

const tabOf = (page) => page.evaluate(() => window.__velaStore.getState().tab);
const setTab = async (page, tab) => {
  if (process.env.DEBUG) console.log("   setTab", tab, await page.evaluate(() => JSON.stringify({ len: history.length, st: history.state, back: window.__velaBack, y: scrollY })));
  await page.evaluate((tab) => window.__velaStore.getState().setTab(tab), tab);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(700);
};
const centerOf = async (page, selector) => {
  const box = await page.locator(selector).first().boundingBox();
  return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2, box } : null;
};
const settle = (page) => page.waitForTimeout(900);

/* ── Frame times under 4x CPU throttling ─────────────────────────────────────────────────────────── */
async function measure(label, { page, cdp }, run) {
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: Number(process.env.THROTTLE || 4) });
  await page.evaluate(() => {
    window.__ft = [];
    window.__ftOn = true;
    let last = performance.now();
    const loop = (now) => {
      if (!window.__ftOn) return;
      window.__ft.push(now - last);
      last = now;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame((now) => {
      last = now;
      requestAnimationFrame(loop);
    });
  });
  await sleep(120);
  await cdp.send("Performance.enable").catch(() => {});
  const metrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
  const m0 = await metrics();
  const t0 = Date.now();
  await run();
  await sleep(700);
  const wall = Date.now() - t0;
  const m1 = await metrics();
  const d = (k) => Math.round((m1[k] - m0[k]) * 1000);
  const main = { taskMs: d("TaskDuration"), scriptMs: d("ScriptDuration"), layoutMs: d("LayoutDuration"), styleMs: d("RecalcStyleDuration") };
  const ft = await page.evaluate(() => {
    window.__ftOn = false;
    return window.__ft;
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  const sorted = [...ft].sort((a, b) => a - b);
  const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100))];
  const stats = {
    frames: ft.length,
    mean: +(ft.reduce((a, b) => a + b, 0) / Math.max(ft.length, 1)).toFixed(1),
    p50: +pct(50).toFixed(1),
    p95: +pct(95).toFixed(1),
    max: +sorted[sorted.length - 1].toFixed(1),
    over33: ft.filter((v) => v > 33.4).length,
    over50: ft.filter((v) => v > 50).length,
    wallMs: wall,
  };
  Object.assign(stats, main);
  console.log(`PERF  ${label}  ${JSON.stringify(stats)}`);
  return stats;
}

if (PERF_ONLY) {
  const app = await openApp();
  const { page, cdp } = app;
  const t = toucher(cdp);
  // Warm up once (first mount of each view), then measure a swipe from Home's hero to Calendar and back.
  await setTab(page, "calendar");
  await setTab(page, "home");
  for (let round = 0; round < Number(process.env.ROUNDS || 2); round++) {
    await setTab(page, "home");
    const hero = await centerOf(page, ".ag-hero-title");
    await measure(`swipe Home→Calendar r${round}`, app, () => t.swipe(330, hero.y, 80, hero.y + 6, { ms: 220, steps: 14 }));
    console.log("  tab after:", await tabOf(page));
    await setTab(page, "history");
    const h = await centerOf(page, "main h2");
    await measure(`swipe History→Insights r${round}`, app, () => t.swipe(330, h.y + 40, 80, h.y + 44, { ms: 220, steps: 14 }));
    console.log("  tab after:", await tabOf(page));
  }
  await app.context.close();
  await browser.close();
  process.exit(0);
}

/* 11. Count one session now: confirm inline, then Undo. */
async function heroCount(lang, width) {
  const a = await openApp({ width, lang });
  const p = a.page;
  const tt = toucher(a.cdp);
  const count = () => p.evaluate(() => window.__velaStore.getState().journal.sessions.length);
  const btn = p.locator("[data-testid=hero-count]");
  const base = await count();
  const h0 = (await btn.boundingBox()).height;
  const heroH0 = (await p.locator(".ag-hero").boundingBox()).height;
  await btn.click();
  await p.waitForTimeout(250);
  const armedOk = (await btn.getAttribute("data-armed")) === "true";
  ok(`[${lang} ${width}] one tap saves nothing and asks`, armedOk && (await count()) === base);
  const geo = await p.evaluate(() => {
    const b = document.querySelector("[data-testid=hero-count]");
    const c = document.querySelector("[data-testid=hero-count-cancel]");
    return { text: b.innerText, h: b.getBoundingClientRect().height, clip: b.scrollWidth > b.clientWidth + 1, oneLine: b.getBoundingClientRect().height < 60, sameRow: c && Math.abs(c.getBoundingClientRect().top - b.getBoundingClientRect().top) < 1, heroH: document.querySelector(".ag-hero").getBoundingClientRect().height };
  });
  ok(`[${lang} ${width}] confirm state on one line, no clipping, Cancel beside it`, !geo.clip && geo.oneLine && geo.sameRow, geo);
  ok(`[${lang} ${width}] no layout jump (button and hero keep their height)`, Math.abs(geo.h - h0) < 0.5 && Math.abs(geo.heroH - heroH0) < 0.5, { h0, h: geo.h, heroH0, heroH: geo.heroH });
  await p.locator(".ag-hero").first().screenshot({ path: `${OUT}/count-armed-${lang}-${width}.png` });
  // Back / Escape cancels the ask.
  await p.keyboard.press("Escape");
  await p.waitForTimeout(250);
  ok(`[${lang} ${width}] back cancels the ask`, !(await btn.getAttribute("data-armed")) && (await count()) === base);
  // The Cancel button cancels.
  await btn.click();
  await p.waitForTimeout(200);
  await p.click("[data-testid=hero-count-cancel]");
  await p.waitForTimeout(200);
  ok(`[${lang} ${width}] Cancel button cancels`, !(await btn.getAttribute("data-armed")) && (await count()) === base);
  // A double tap does not count.
  // Two taps 120 ms apart (a double tap), dispatched in the page so this slow headless browser keeps the gap.
  await btn.evaluate(async (el) => {
    el.click();
    await new Promise((r) => setTimeout(r, 120));
    el.click();
  });
  await p.waitForTimeout(100);
  ok(`[${lang} ${width}] a fast double tap does not count`, (await count()) === base);
  await p.click("[data-testid=hero-count-cancel]").catch(() => {});
  await p.waitForTimeout(200);
  if (width === 412 && lang === "en") {
    await btn.click();
    await p.waitForTimeout(5400);
    ok(`[${lang} ${width}] the ask reverts by itself after ~5 s`, !(await btn.getAttribute("data-armed")) && (await count()) === base);
  }
  // Confirm: tap, then tap again.
  await btn.click();
  await p.waitForTimeout(500);
  await btn.click();
  await p.waitForTimeout(300);
  ok(`[${lang} ${width}] second tap counts exactly one`, (await count()) === base + 1);
  const toast = await p.locator("[data-testid=toast-action]").innerText().catch(() => "");
  ok(`[${lang} ${width}] toast offers Undo`, /Undo|Deshacer/.test(toast), toast);
  await p.screenshot({ path: `${OUT}/count-toast-${lang}-${width}.png` });
  await p.click("[data-testid=toast-action]");
  await p.waitForTimeout(300);
  ok(`[${lang} ${width}] Undo removes that session`, (await count()) === base);
  // Undo stays ~8 s.
  await btn.click();
  await p.waitForTimeout(450);
  await btn.click();
  await p.waitForTimeout(6500);
  ok(`[${lang} ${width}] Undo still offered after 6.5 s`, await p.locator("[data-testid=toast-action]").isVisible());
  await p.waitForTimeout(2000);
  ok(`[${lang} ${width}] toast gone after ~8 s, the session stays`, !(await p.locator("[data-testid=toast-action]").isVisible()) && (await count()) === base + 1);
  // Swipe that ends on the button (arms nothing, counts nothing), even when it was armed.
  const c = await centerOf(p, "[data-testid=hero-count]");
  await btn.click();
  await p.waitForTimeout(450);
  await tt.swipe(c.x - 50, c.y, c.x, c.y + 2, { ms: 300, steps: 10 });
  await p.waitForTimeout(500);
  ok(`[${lang} ${width}] a drag ending on the armed button does not count`, (await count()) === base + 1);
  ok(`[${lang} ${width}] no page errors`, a.errors.length === 0, a.errors);
  await a.context.close();
}
if (process.argv.includes("compare")) {
  // The same finger paths against any build (old or new): which start points / shapes change the tab.
  const a = await openApp();
  const p = a.page;
  const tt = toucher(a.cdp);
  const cases = [];
  const run = async (name, prep, path, expect) => {
    await setTab(p, "home");
    const pt = await prep();
    await tt.swipe(...path(pt));
    await p.waitForTimeout(900);
    const tab = await tabOf(p);
    cases.push({ name, tab, ok: tab === expect });
    console.log(`CASE  ${tab === expect ? "pages " : "STUCK "} ${name}  → ${tab}`);
  };
  const at = async (sel) => {
    const el = p.locator(sel).first();
    await el.scrollIntoViewIfNeeded();
    await p.waitForTimeout(250);
    const b = await el.boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  await run("hero title, 250 px", () => at(".ag-hero-title"), (q) => [330, q.y, 80, q.y + 6, { ms: 220 }], "calendar");
  await run("cycle card", () => at("#cycle-card"), (q) => [330, q.y - 20, 80, q.y - 14, { ms: 220 }], "calendar");
  await run("form field (unfocused)", () => at("main input:not([type=range]):not([type=checkbox]):not([type=radio])"), (q) => [330, q.y, 80, q.y + 6, { ms: 220 }], "calendar");
  await run("form label area", () => at("main label"), (q) => [330, q.y, 80, q.y - 6, { ms: 220 }], "calendar");
  await run("diagonal ~27° on hero", () => at(".ag-hero-title"), (q) => [320, q.y - 20, 100, q.y + 90, { ms: 220 }], "calendar");
  await run("short fling 55 px / 60 ms", () => at(".ag-hero-title"), (q) => [260, q.y, 205, q.y + 2, { ms: 60, steps: 4 }], "calendar");
  await run("40 px slow drag (should NOT page)", () => at(".ag-hero-title"), (q) => [260, q.y, 200, q.y, { ms: 500, steps: 10, holdEnd: 150 }], "home");
  console.log(`COMPARE ${cases.filter((c) => c.ok).length}/${cases.length} as expected`);
  await browser.close();
  process.exit(0);
}

if (process.argv.includes("rm")) {
  // Reduced motion: no drag-follow animation needed, the swipe still pages (instantly).
  const a = await openApp({ reducedMotion: true });
  const tt = toucher(a.cdp);
  const h = await centerOf(a.page, ".ag-hero-title");
  await tt.swipe(320, h.y, 100, h.y, { ms: 200 });
  await a.page.waitForTimeout(150);
  ok("reduced motion: swipe pages at once", (await tabOf(a.page)) === "calendar");
  ok("reduced motion: no slide-in animation class", await a.page.evaluate(() => !document.querySelector(".ag-swipe-in") || getComputedStyle(document.querySelector(".ag-swipe-in")).animationName === "none"));
  ok("reduced motion: paging flag cleared", !(await a.page.evaluate(() => "paging" in document.documentElement.dataset)));
  ok("no page errors", a.errors.length === 0, a.errors);
  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
  process.exit(fails ? 1 : 0);
}

if (COUNT) {
  const [, lang, width] = COUNT.split(":");
  await heroCount(lang || "en", Number(width || 412));
  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
  process.exit(fails ? 1 : 0);
}

const app = await openApp();
const { page, cdp, errors } = app;
const t = toucher(cdp);
const W = 412;

/* 1. From the middle of Home's hero: the page follows the finger, then commits. */
await setTab(page, "home");
let hero = await centerOf(page, ".ag-hero-title");
await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 300, y: hero.y }] });
for (let i = 1; i <= 8; i++) {
  await sleep(16);
  await t.move(300 - i * 15, hero.y + i);
}
await sleep(60);
const follow = await page.evaluate(() => {
  const pane = document.querySelector("[data-pager]");
  const m = new DOMMatrix(getComputedStyle(pane).transform === "none" ? undefined : getComputedStyle(pane).transform);
  return Math.round(m.m41);
});
ok("page follows the finger mid-drag (≈ -110 px)", follow < -80 && follow > -130, follow);
ok("starfield/ambient paused while dragging", await page.evaluate(() => "paging" in document.documentElement.dataset));
await t.move(150, hero.y + 8);
await t.end();
await settle(page);
ok("swipe from the hero's middle → Calendar", (await tabOf(page)) === "calendar");
await page.waitForFunction(() => !("paging" in document.documentElement.dataset), null, { timeout: 2000 }).catch(() => {});
ok("paging flag cleared after the slide-in", !(await page.evaluate(() => "paging" in document.documentElement.dataset)));
ok("pane transform cleared", await page.evaluate(() => !document.querySelector("[data-pager]").style.transform));

/* 2. Calendar: the month grid keeps its own swipe; the heading/stats page. */
const monthBefore = await page.locator("main button.font-display").first().innerText();
const grid = await centerOf(page, "[data-noswipe].overflow-hidden");
await t.swipe(grid.x + 110, grid.y, grid.x - 110, grid.y + 4, { ms: 220 });
await settle(page);
const monthAfter = await page.locator("main button.font-display").first().innerText();
ok("month grid swipe changes the month, not the tab", (await tabOf(page)) === "calendar" && monthAfter !== monthBefore, { monthBefore, monthAfter });
const stats = await centerOf(page, "[data-testid=cal-stats]");
await t.swipe(100, stats.y, 330, stats.y + 5, { ms: 220 });
await settle(page);
ok("swipe right on the calendar stats → Home", (await tabOf(page)) === "home");

/* 3. Home: over the cycle card (folded or open, away from the dial ring). */
await setTab(page, "home");
const cyc = await page.locator("#cycle-card").boundingBox();
await page.evaluate((y) => window.scrollTo(0, y - 120), cyc.y + (await page.evaluate(() => scrollY)));
await page.waitForTimeout(300);
const cycBox = await page.locator("#cycle-card").boundingBox();
const cy0 = cycBox.y + 30;
await t.swipe(320, cy0, 90, cy0 + 8, { ms: 220 });
await settle(page);
ok("swipe across the cycle card → Calendar", (await tabOf(page)) === "calendar", { y: cy0 });

/* 4. Home: over the "Log a moment" form (labels, unfocused fields, chips). */
await setTab(page, "home");
const field = page.locator("main input:not([type=range]):not([type=checkbox]):not([type=radio])").first();
await field.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
const fb = await field.boundingBox();
await t.swipe(fb.x + fb.width - 20, fb.y + fb.height / 2, 60, fb.y + fb.height / 2 + 6, { ms: 220 });
await settle(page);
ok("swipe starting on an unfocused form field → Calendar", (await tabOf(page)) === "calendar");
ok("…and the field did not take focus", await page.evaluate(() => !(document.activeElement instanceof HTMLInputElement)));
await setTab(page, "home");
const label = page.locator("main label, main .text-dim").nth(6);
await label.scrollIntoViewIfNeeded();
const lb = await label.boundingBox();
await t.swipe(330, lb.y + lb.height / 2, 80, lb.y + lb.height / 2 - 6, { ms: 220 });
await settle(page);
ok("swipe over the form's labels → Calendar", (await tabOf(page)) === "calendar");
// A focused text field keeps the drag (text selection / caret).
await setTab(page, "home");
await field.scrollIntoViewIfNeeded();
await field.focus();
const fb2 = await field.boundingBox();
await t.swipe(fb2.x + fb2.width - 20, fb2.y + fb2.height / 2, fb2.x + 20, fb2.y + fb2.height / 2, { ms: 220 });
await settle(page);
ok("a focused text field keeps its drag (no tab change)", (await tabOf(page)) === "home");
await page.evaluate(() => document.activeElement?.blur());

/* 5. History and Insights page too; Insights wraps to Home. */
await setTab(page, "history");
await t.swipe(330, 300, 70, 306, { ms: 220 });
await settle(page);
ok("History → Insights", (await tabOf(page)) === "insights");
await t.swipe(330, 330, 70, 324, { ms: 220 });
await settle(page);
ok("Insights → Home (wraps)", (await tabOf(page)) === "home");
await setTab(page, "insights");
await t.swipe(80, 330, 340, 336, { ms: 220 });
await settle(page);
ok("Insights → History (swipe right)", (await tabOf(page)) === "history");

/* 6. Diagonals. */
await setTab(page, "home");
hero = await centerOf(page, ".ag-hero-title");
await t.swipe(320, hero.y - 20, 100, hero.y + 90, { ms: 220 }); // ~27° below horizontal
await settle(page);
ok("diagonal swipe (~27°) still pages", (await tabOf(page)) === "calendar");
await setTab(page, "home");
const sy0 = await page.evaluate(() => scrollY);
await t.swipe(260, 700, 180, 380, { ms: 260 }); // mostly vertical (~76°)
await settle(page);
const sy1 = await page.evaluate(() => scrollY);
ok("mostly-vertical swipe scrolls and does not page", (await tabOf(page)) === "home" && sy1 > sy0 + 100, { sy0, sy1 });

/* 7. Flings and spring-back. */
await setTab(page, "home");
hero = await centerOf(page, ".ag-hero-title");
await t.swipe(260, hero.y, 205, hero.y + 2, { ms: 60, steps: 4 }); // 55 px in 60 ms
await settle(page);
ok("short fast fling (55 px / 60 ms) pages", (await tabOf(page)) === "calendar");
await setTab(page, "home");
await t.swipe(260, hero.y, 200, hero.y + 2, { ms: 500, steps: 20, holdEnd: 150 }); // slow, short, stops
await page.waitForTimeout(120);
const mid = await page.evaluate(() => getComputedStyle(document.querySelector("[data-pager]")).transform);
await settle(page);
ok("slow short drag springs back (no page)", (await tabOf(page)) === "home", mid);
ok("…and the pane is back at rest", await page.evaluate(() => getComputedStyle(document.querySelector("[data-pager]")).transform === "none"));
await t.swipe(80, hero.y, 330, hero.y, { ms: 220 });
await settle(page);
ok("swipe right from Home → Insights (wraps)", (await tabOf(page)) === "insights");

/* 8. Vertical scroll is never hijacked. */
await setTab(page, "home");
const v0 = await page.evaluate(() => scrollY);
await t.swipe(206, 760, 214, 300, { ms: 300, steps: 16 });
await page.waitForTimeout(500);
const v1 = await page.evaluate(() => scrollY);
ok("vertical swipe scrolls the page", v1 > v0 + 200, { v0, v1 });
ok("…without changing tab or moving the pane", (await tabOf(page)) === "home" && (await page.evaluate(() => !document.querySelector("[data-pager]").style.transform)));

/* 9. Taps never fire at the end of a drag. */
await setTab(page, "home");
const batch = page.locator(".ag-hero-tile").nth(1);
const bb = await batch.boundingBox();
const pressed0 = await batch.getAttribute("aria-pressed");
await t.swipe(bb.x + bb.width / 2, bb.y + bb.height / 2, bb.x + bb.width / 2 + 40, bb.y + bb.height / 2, { ms: 400, steps: 10 });
await t.swipe(bb.x + bb.width / 2 + 40, bb.y + bb.height / 2, bb.x + bb.width / 2, bb.y + bb.height / 2, { ms: 400, steps: 10 });
await settle(page);
ok("short drags that end on the Batch tile do not toggle it", (await tabOf(page)) === "home" && (await batch.getAttribute("aria-pressed")) === pressed0, pressed0);
const n0 = await page.evaluate(() => window.__velaStore.getState().journal.sessions.length);
const cnt = await centerOf(page, "[data-testid=hero-count]");
await t.swipe(cnt.x + 60, cnt.y, cnt.x, cnt.y, { ms: 300, steps: 10 }); // ends on the button, short of committing
await settle(page);
ok("a drag ending on Count one session saves nothing and does not arm it", (await page.evaluate(() => window.__velaStore.getState().journal.sessions.length)) === n0 && !(await page.locator("[data-testid=hero-count]").getAttribute("data-armed")));
await t.swipe(cnt.x - 60, cnt.y, cnt.x + 30, cnt.y, { ms: 70, steps: 4 }); // a fling ending on it
await settle(page);
ok("a fling ending on Count one session pages, saves nothing", (await tabOf(page)) === "insights" && (await page.evaluate(() => window.__velaStore.getState().journal.sessions.length)) === n0);

/* 10. The cycle dial still scrubs (touch). */
await setTab(page, "home");
if ((await page.locator("#cycle-card").getAttribute("data-folded")) === "true") {
  await page.click('[data-testid="cycle-fold"]');
  await page.waitForTimeout(800);
}
await page.locator(".cy-dial-svg").scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
const db = await page.locator(".cy-dial-svg").boundingBox();
const dcx = db.x + db.width / 2, dcy = db.y + db.height / 2, rr = (db.width * 100) / 240;
const at = (deg) => [dcx + rr * Math.sin((deg * Math.PI) / 180), dcy - rr * Math.cos((deg * Math.PI) / 180)];
const val0 = await page.locator(".cy-dial").getAttribute("aria-valuenow");
let [ax, ay] = at(60);
await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: ax, y: ay }] });
for (let d = 70; d <= 150; d += 10) {
  [ax, ay] = at(d);
  await sleep(20);
  await t.move(ax, ay);
}
await t.end();
await page.waitForTimeout(500);
const val1 = await page.locator(".cy-dial").getAttribute("aria-valuenow");
ok("dial scrubs with touch (value moves, tab stays)", val1 !== val0 && (await tabOf(page)) === "home", { val0, val1 });
await page.keyboard.press("Escape").catch(() => {});
await page.evaluate(() => window.__velaStore.getState().setTab("calendar"));
await page.waitForTimeout(300);


ok("no page errors (main)", errors.length === 0, errors);
await app.context.close();
await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
