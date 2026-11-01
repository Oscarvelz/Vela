// Hero "Repeat" tile: prefill from the latest moment. Fake data, E2E build on 8132.
import { chromium } from "/workspace/work/browser-test/node_modules/playwright-core/index.mjs";
const OUT = "/workspace/work/vela-repeat-shots";
const browser = await chromium.launch({ executablePath: "/workspace/work/browser-test/browsers/chromium_headless_shell-1155/chrome-linux/headless_shell", args: ["--no-sandbox", "--no-proxy-server"] });
const errors = []; let fails = 0;
const ok = (n, c, x) => { console.log(c ? "PASS" : "FAIL", n, x === undefined ? "" : JSON.stringify(x)); if (!c) fails++; };
const page = await browser.newPage({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 2.5 });
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:8132/Vela/");
await page.waitForSelector("#name", { timeout: 20000 });
await page.fill("#name", "Tester"); await page.fill("#create-pass", "fake-orbit-lantern-42"); await page.fill("#create-pass2", "fake-orbit-lantern-42");
await page.check("#pass-ack"); await page.click("button[type=submit]");
await page.waitForSelector(".ag-tabbar", { timeout: 30000 }); await page.waitForTimeout(800);
await page.keyboard.press("Escape").catch(() => {});
ok("repeat disabled when empty", await page.locator("[data-testid=hero-repeat]").isDisabled());
await page.locator(".ag-hero").first().screenshot({ path: `${OUT}/empty.png` });
await page.evaluate(() => {
  const s = window.__velaStore.getState(); const pad = (n) => String(n).padStart(2, "0");
  const day = (o) => { const d = new Date(); d.setDate(d.getDate() + o); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  s.importJSON(JSON.stringify({ app: "vela", partners: ["Fakepartner", "Otherfake"], sessions: [
    { date: day(-5), time: "21:00", partnerName: "Otherfake", place: "Hotel", durationMins: 20, overall: 3, positions: [] },
    { date: day(-1), time: "23:00", partnerName: "Fakepartner", place: "Shower", durationMins: 45, overall: 5, positions: [], contraception: ["condom"] },
  ] }));
});
await page.waitForTimeout(400);
ok("repeat enabled with sessions", !(await page.locator("[data-testid=hero-repeat]").isDisabled()));
await page.locator(".ag-hero").first().screenshot({ path: `${OUT}/hero-night-en.png` });
await page.click("[data-testid=hero-repeat]"); await page.waitForTimeout(600);
const form = await page.evaluate(() => {
  const h = [...document.querySelectorAll("h2")].map((e) => e.textContent);
  const txt = document.body.innerText;
  return { title: h.includes("Like last time"), partner: /Fakepartner/.test(txt), pressed: document.querySelector("[data-testid=hero-repeat]").getAttribute("aria-pressed") };
});
ok("form opens titled Like last time", form.title, form);
ok("repeat tile pressed", form.pressed === "true");
const before = await page.evaluate(() => window.__velaStore.getState().journal.sessions.length);
await page.locator("button", { hasText: /Save this moment/ }).last().click(); await page.waitForTimeout(600);
const saved = await page.evaluate(() => { const ss = window.__velaStore.getState().journal.sessions; const pad = (n) => String(n).padStart(2, "0"); const d = new Date(); const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; const n = ss.find((x) => x.date === today); return { count: ss.length, partner: n?.partnerName, place: n?.place, dur: n?.durationMins, contra: n?.contraception, ratings: n && [n.intensity, n.connection] }; });
ok("saved a new session today copying partner/place/duration/contraception", saved.count === before + 1 && saved.partner === "Fakepartner" && saved.place === "Shower" && saved.dur === 45 && JSON.stringify(saved.contra) === '["condom"]', saved);
ok("ratings start fresh", JSON.stringify(saved.ratings) === "[0,0]", saved.ratings);
await page.evaluate(() => window.__velaStore.getState().setLanguage("es")); await page.waitForTimeout(300);
await page.evaluate(() => scrollTo(0, 0));
await page.locator(".ag-hero").first().screenshot({ path: `${OUT}/hero-night-es.png` });
const clip = await page.evaluate(() => [...document.querySelectorAll(".ag-hero-tile-label")].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent));
ok("no clipped tile labels (es)", clip.length === 0, clip);
ok("no page errors", errors.length === 0, errors);
await browser.close();
process.exit(fails ? 1 : 0);
