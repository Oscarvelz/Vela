// Period start/end main buttons confirm before acting; a fresh start can be undone. Fake data only.
import { chromium } from "/workspace/work/browser-test/node_modules/playwright-core/index.mjs";
const OUT = "/workspace/work/vela-confirm-shots";
const LANG = process.argv[2] || "en";
const browser = await chromium.launch({ executablePath: "/workspace/work/browser-test/browsers/chromium_headless_shell-1155/chrome-linux/headless_shell", args: ["--no-sandbox", "--no-proxy-server"] });
const errors = []; let fails = 0;
const ok = (n, c, x) => { console.log(c ? "PASS" : "FAIL", n, x === undefined ? "" : JSON.stringify(x)); if (!c) fails++; };
const page = await browser.newPage({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 2.5, hasTouch: true });
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:8132/Vela/");
await page.waitForSelector("#name", { timeout: 20000 });
await page.fill("#name", "Tester"); await page.fill("#create-pass", "fake-orbit-lantern-42"); await page.fill("#create-pass2", "fake-orbit-lantern-42");
await page.check("#pass-ack"); await page.click("button[type=submit]");
await page.waitForSelector(".ag-tabbar", { timeout: 30000 }); await page.waitForTimeout(600);
const day = (o) => page.evaluate((o) => { const pad = (n) => String(n).padStart(2, "0"); const d = new Date(); d.setDate(d.getDate() + o); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }, o);
const d0 = await day(0), s1 = await day(-56), s2 = await day(-28);
await page.evaluate(([a, b, lang]) => { const s = window.__velaStore.getState(); if (lang === "es") s.setLanguage("es"); s.setCycle({ enabled: true, perspective: "partner", starts: [a, b], ends: {}, days: {} }); }, [s1, s2, LANG]);
await page.waitForTimeout(500);
if ((await page.locator('[data-testid="cycle-card"]').getAttribute("data-folded")) === "true") { await page.click('[data-testid="cycle-fold"]'); await page.waitForTimeout(700); }
const starts = () => page.evaluate(() => { const st = window.__velaStore.getState().journal.settings; return (st.cycleTrackers?.[0] ?? st.cycle).starts.slice(); });
const before = await starts();
const startBtn = page.locator('[data-testid="cycle-card"] [data-act="start"]').first();
await startBtn.scrollIntoViewIfNeeded();
await startBtn.click(); await page.waitForTimeout(300);
ok("tap does not log", JSON.stringify(await starts()) === JSON.stringify(before));
ok("confirm row shows", await page.locator('[data-testid="cycle-confirm"]').isVisible());
await page.locator('[data-testid="cycle-card"]').screenshot({ path: `${OUT}/confirm-${LANG}.png` });
const clip = await page.evaluate(() => [...document.querySelectorAll('[data-testid="cycle-confirm"] .truncate')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent));
ok("confirm labels not clipped", clip.length === 0, clip);
await page.click('[data-testid="cycle-confirm-no"]'); await page.waitForTimeout(300);
ok("cancel leaves starts untouched", JSON.stringify(await starts()) === JSON.stringify(before) && !(await page.locator('[data-testid="cycle-confirm"]').count()));
await startBtn.click(); await page.waitForTimeout(200);
await page.click('[data-testid="cycle-confirm-yes"]'); await page.waitForTimeout(300);
ok("confirm logs today", (await starts()).includes(d0));
ok("undo offered", await page.locator('[data-testid="cycle-undo"]').isVisible());
await page.locator('[data-testid="cycle-card"]').screenshot({ path: `${OUT}/undo-${LANG}.png` });
await page.click('[data-testid="cycle-undo"]'); await page.waitForTimeout(300);
ok("undo restores starts", JSON.stringify(await starts()) === JSON.stringify(before), await starts());
// auto-dismiss
await startBtn.click(); await page.waitForTimeout(7600);
ok("confirm auto-dismisses", !(await page.locator('[data-testid="cycle-confirm"]').count()) && JSON.stringify(await starts()) === JSON.stringify(before));
// A start within 14 days of another moves it instead of adding a 2-day "cycle".
const near = await day(-26);
await page.evaluate((d) => window.__velaStore.getState().logPeriodStart(d), near); await page.waitForTimeout(200);
ok("nearby start moves the old one", JSON.stringify(await starts()) === JSON.stringify([s1, near]), await starts());
await page.evaluate((d) => window.__velaStore.getState().logPeriodStart(d), d0); await page.waitForTimeout(200);
ok("far start still adds", JSON.stringify(await starts()) === JSON.stringify([s1, near, d0]), await starts());
ok("no page errors", errors.length === 0, errors);
await browser.close(); process.exit(fails ? 1 : 0);
