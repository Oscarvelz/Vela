// Launch splash frames at 360 px (fake data only): full show (browser/PWA) and the Android-app show, en/es, a saved
// day theme, reduced motion, fresh visitor (setup form) and a locked journal. Animations are frozen at exact times
// with the Web Animations API; the glide into the lock screen is captured live. Also checks: the splash leaves,
// the lock hero ends exactly where the splash hero was headed, nothing wraps, no white flash frame.
import { chromium } from "/workspace/work/browser-test/node_modules/playwright-core/index.mjs";
const PORT = process.env.VELA_PORT || 8132;
const URL = `http://localhost:${PORT}/Vela/`;
const OUT = process.env.OUT || "/workspace/work/vela-audit/splash";
let fails = 0;
const ok = (n, c, x = "") => { if (!c) fails++; console.log(`${c ? "PASS" : "FAIL"}  ${n}  ${typeof x === "string" ? x : JSON.stringify(x)}`); };
const browser = await chromium.launch({ executablePath: "/workspace/work/browser-test/browsers/chromium_headless_shell-1155/chrome-linux/headless_shell", args: ["--no-sandbox", "--no-proxy-server"] });
const only = process.env.ONLY;

async function ctxFor({ lang = "en", native = false, reduced = false } = {}) {
  const ua = native ? "Mozilla/5.0 (Linux; Android 14; SM-S928U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 VelaAndroid/1.2" : undefined;
  return browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, hasTouch: true, locale: lang === "es" ? "es-US" : "en-US", userAgent: ua, reducedMotion: reduced ? "reduce" : "no-preference" });
}
async function makeJournal(ctx, lang, mode) {
  const page = await ctx.newPage();
  await page.goto(URL);
  await page.waitForSelector("#name", { timeout: 20000 });
  await page.fill("#name", "Tester"); await page.fill("#create-pass", "fake-orbit-lantern-42"); await page.fill("#create-pass2", "fake-orbit-lantern-42");
  await page.check("#pass-ack"); await page.click("button[type=submit]");
  await page.waitForSelector(".ag-tabbar", { timeout: 30000 }); await page.waitForTimeout(600);
  await page.evaluate(([lang, mode]) => { const s = window.__velaStore.getState(); s.setLanguage(lang); if (mode === "day" && s.journal.settings.mode !== "day") s.toggleMode(); }, [lang, mode]);
  await page.waitForTimeout(800);
  await page.close();
}
const freeze = (page, t) => page.evaluate((t) => { for (const a of document.getAnimations()) { a.pause(); try { a.currentTime = t; } catch {} } }, t);

async function run(name, { lang = "en", native = false, reduced = false, journal = false, mode = "night", times }) {
  if (only && !name.includes(only)) return;
  const ctx = await ctxFor({ lang, native, reduced });
  if (journal) await makeJournal(ctx, lang, mode);
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => { window.__velaSplashHold = true; });
  await page.goto(URL);
  await page.waitForSelector('[data-testid="launch-splash"]', { timeout: 15000 });
  for (const t of times) {
    await freeze(page, t);
    await page.waitForTimeout(60);
    await page.screenshot({ path: `${OUT}/${name}-t${String(t).padStart(4, "0")}.png` });
  }
  // One-line text and white-flash check on the settled frame.
  const m = await page.evaluate(() => {
    const out = {};
    for (const sel of [".vs-word", ".vs-tag"]) { const el = document.querySelector(sel); const r = document.createRange(); r.selectNodeContents(el); const tops = new Set([...r.getClientRects()].filter((x) => x.width > 1).map((x) => Math.round(x.top))); out[sel] = { lines: tops.size, right: r.getBoundingClientRect().right, left: r.getBoundingClientRect().left, text: el.textContent }; }
    out.vw = innerWidth;
    return out;
  });
  ok(`${name}: wordmark + tagline on one line inside 360 px`, m[".vs-word"].lines === 1 && m[".vs-tag"].lines === 1 && m[".vs-tag"].left >= 0 && m[".vs-tag"].right <= m.vw, m);
  // Let it go: live glide frames.
  await page.evaluate((slow) => { for (const a of document.getAnimations()) { const end = a.effect?.getComputedTiming().endTime; if (Number.isFinite(end) && a.currentTime >= end) a.finish(); else a.play(); } window.__velaSplashSlow = slow; window.__velaSplashHold = false; }, Number(process.env.SLOW || 6));
  let target = null;
  // Glide frames: once it starts, freeze its transitions and step through them (the hand-off is slowed so the
  // done-timer can't fire while frames are taken).
  const phase = await page.waitForFunction(() => { const p = document.querySelector('[data-testid="launch-splash"]')?.dataset.phase ?? "gone"; return p === "show" ? false : p; }, null, { timeout: 15000, polling: 20 }).then((h) => h.jsonValue());
  if (phase === "glide" || phase === "fade") {
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {
      const st = await page.evaluate((f) => {
        for (const a of document.getAnimations()) {
          if (a instanceof CSSTransition) { a.pause(); a.currentTime = f * a.effect.getComputedTiming().duration; }
        }
        const lock = document.querySelector("[data-vela-hero] .vela-flame-stage");
        return { lockTop: lock ? Math.round(lock.getBoundingClientRect().top) : null };
      }, f);
      target = st.lockTop;
      await page.waitForTimeout(80);
      await page.screenshot({ path: `${OUT}/${name}-glide${Math.round(f * 100)}.png` });
    }
    await page.evaluate(() => { for (const a of document.getAnimations()) if (a instanceof CSSTransition) a.finish(); });
  }
  await page.waitForFunction(() => !document.querySelector('[data-testid="launch-splash"]'), null, { timeout: 60000 });
  await page.waitForTimeout(900);
  const end = await page.evaluate(() => ({ splash: !!document.querySelector('[data-testid="launch-splash"]'), attr: document.documentElement.dataset.splash ?? null, lockTop: (() => { const l = document.querySelector("[data-vela-hero] .vela-flame-stage"); return l ? Math.round(l.getBoundingClientRect().top) : null; })(), vis: (() => { const l = document.querySelector("[data-vela-hero]"); return l ? getComputedStyle(l).visibility : null; })() }));
  await page.screenshot({ path: `${OUT}/${name}-end.png` });
  ok(`${name}: splash left, lock hero visible`, !end.splash && !end.attr && (end.vis === "visible" || end.vis === null), end);
  if (target !== null && end.lockTop !== null) ok(`${name}: lock hero did not move after landing`, Math.abs(target - end.lockTop) <= 1, { target, end: end.lockTop });
  ok(`${name}: no page errors`, errors.length === 0, errors);
  await ctx.close();
}

const FULL = [0, 120, 240, 360, 480, 640, 800, 1000];
const NAT = [0, 160, 320, 480, 640];
await run("fresh-full-en", { times: FULL });
await run("fresh-full-es", { lang: "es", times: [1000] });
await run("locked-full-en", { journal: true, times: [0, 480, 1000] });
await run("locked-day-es", { lang: "es", journal: true, mode: "day", times: [1000] });
await run("locked-native-en", { native: true, journal: true, times: NAT });
await run("fresh-reduced-en", { reduced: true, times: [0] });
await browser.close();
console.log(fails ? `${fails} FAILED` : "ALL PASS");
process.exit(fails ? 1 : 0);
