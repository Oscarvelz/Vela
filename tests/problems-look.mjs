// Fake-data check: the redesigned "Anything off?" (problems) section of the session details form —
// collapsed, one row open, selections previewed while collapsed, own problem, es, day; saves into the session.
import { chromium } from "/workspace/work/browser-test/node_modules/playwright-core/index.mjs";
import { mkdirSync } from "node:fs";
const OUT = "/workspace/work/vela-problems-shots";
mkdirSync(OUT, { recursive: true });
let fails = 0; const ok = (n, c, x = "") => { if (!c) fails++; console.log(`${c ? "PASS" : "FAIL"}  ${n}  ${JSON.stringify(x)}`); };
const browser = await chromium.launch({ executablePath: "/workspace/work/browser-test/browsers/chromium_headless_shell-1155/chrome-linux/headless_shell", args: ["--no-sandbox", "--no-proxy-server"] });
const page = await browser.newPage({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 2.5, hasTouch: true, locale: "en-US" });
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:8132/Vela/");
await page.waitForSelector("#name", { timeout: 20000 });
await page.fill("#name", "Tester"); await page.fill("#create-pass", "fake-orbit-lantern-42"); await page.fill("#create-pass2", "fake-orbit-lantern-42");
await page.check("#pass-ack"); await page.click("button[type=submit]");
await page.waitForSelector(".ag-tabbar", { timeout: 30000 }); await page.waitForTimeout(800);
await page.evaluate(() => window.__velaStore.setState((s) => ({ journal: { ...s.journal, partners: ["Fakepartner"] } })));

// Open the details form from the hero.
{ const d = page.locator(".ag-hero-actions .ag-hero-tile").nth(0); if ((await d.getAttribute("aria-pressed")) !== "true") await d.click(); }
await page.waitForTimeout(500);
const card = page.locator('.vp[data-scope="session"]:visible').first();
await card.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
const shot = async (name, loc = card) => {
  await page.waitForTimeout(520);
  const tag = await page.addStyleTag({ content: ".ag-header, .ag-tabbar { visibility: hidden !important; }" });
  await loc.scrollIntoViewIfNeeded();
  await loc.screenshot({ path: `${OUT}/${name}.png` });
  await tag.evaluate((e) => e.remove());
};
const overflow = () => card.evaluate((c) => { const r = c.getBoundingClientRect(); return [...c.querySelectorAll("*")].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && getComputedStyle(e).visibility !== "hidden" && (b.right > r.right + 1 || b.left < r.left - 1) && !e.closest(".vp-glow"); }).map((e) => String(e.className).slice(0, 30)).slice(0, 5); });
const row = (i) => card.locator(".vp-row").nth(i);
const btn = (i) => row(i).locator(".vp-row-btn");

ok("section renders with eyebrow + Fraunces title", (await card.locator(".vp-eyebrow").innerText()).toUpperCase().includes("THIS ROUND") && (await card.locator(".vp-title").innerText()).startsWith("Anything off?"), await card.locator(".vp-title").innerText());
ok("title font is Fraunces", (await card.locator(".vp-title").evaluate((e) => getComputedStyle(e).fontFamily)).includes("Fraunces"));
ok("four rows, all collapsed", (await card.locator(".vp-row").count()) === 4 && (await card.locator('.vp-row-btn[aria-expanded="false"]').count()) === 4);
ok("rows have icon rings + hints", (await card.locator(".vp-ring svg").count()) === 4 && (await row(0).locator(".vp-row-hint").innerText()).includes("Erection trouble"), await row(0).locator(".vp-row-hint").innerText());
ok("no grey left bar (border-left width ≤ 1px)", (await card.evaluate((e) => parseFloat(getComputedStyle(e).borderLeftWidth))) <= 1);
ok("no count pill before any pick", (await card.locator(".vp-count").count()) === 0);
await shot("01-collapsed-night-en");
ok("no horizontal overflow (collapsed)", (await overflow()).length === 0, await overflow());

// Open Body: aria, region, animated height, chevron rotates.
await btn(0).click(); await page.waitForTimeout(40);
const anim = await row(0).locator(".vp-fold").evaluate((e) => getComputedStyle(e).transitionProperty);
await page.waitForTimeout(450);
const ctl = await btn(0).getAttribute("aria-controls");
ok("Body opens: aria-expanded=true + aria-controls region", (await btn(0).getAttribute("aria-expanded")) === "true" && (await page.evaluate((id) => !!document.getElementById(id), ctl)), ctl);
ok("height animates (grid-template-rows transition)", anim.includes("grid-template-rows"), anim);
ok("chevron rotated", (await row(0).locator(".vp-chev").evaluate((e) => getComputedStyle(e).transform)) !== "none");
ok("option chips visible", await row(0).locator(".vp-opt").first().isVisible());
ok("closed rows' chips are hidden", !(await row(1).locator(".vp-opt").first().isVisible()));
await shot("02-body-open-night-en");

await row(0).locator(".vp-opt", { hasText: "Pain" }).click();
await row(0).locator(".vp-opt", { hasText: "Dryness" }).click();
await row(0).locator(".vp-opt", { hasText: "Too soon" }).click();
await page.waitForTimeout(200);
ok("picked chips lit (ag-chip-on, aria-pressed)", (await row(0).locator(".vp-opt.ag-chip-on").count()) === 3 && (await row(0).locator('.vp-opt[aria-pressed="true"]').count()) === 3);
ok("header count pill shows 3", (await card.locator(".vp-count").innerText()).startsWith("3"), await card.locator(".vp-count").innerText());
await shot("03-body-picked-open-night-en");
await btn(0).click(); await page.waitForTimeout(100);
await btn(1).click(); await page.waitForTimeout(450);
await row(1).locator(".vp-opt", { hasText: "Stress" }).click();
await btn(1).click(); await page.waitForTimeout(450);
ok("collapsed Body shows 2 mini chips + '+1'", (await row(0).locator(".vp-mini").count()) === 3 && (await row(0).locator(".vp-mini-more").innerText()) === "+1");
ok("ring badge shows count", (await row(0).locator(".vp-ring-badge").innerText()) === "3");
ok("count pill shows 4", (await card.locator(".vp-count").innerText()).startsWith("4"));
await shot("04-collapsed-with-picks-night-en");
ok("no horizontal overflow (picks)", (await overflow()).length === 0, await overflow());

// Own problem under Yours.
await btn(3).click(); await page.waitForTimeout(450);
ok("Yours add button disabled when empty", await row(3).locator(".vp-add-save").isDisabled());
await row(3).locator(".vp-add input").fill("Fake: neighbour's dog barking");
await row(3).locator(".vp-add-save").click(); await page.waitForTimeout(300);
ok("own problem saved + lit", (await row(3).locator(".vp-opt.ag-chip-on").count()) === 1);
await shot("05-yours-open-night-en");

// Save the session → problems persisted
const before = await page.evaluate(() => window.__velaStore.getState().journal.sessions.length);
await page.locator('[data-testid="save-moment"]').scrollIntoViewIfNeeded();
await page.locator('[data-testid="save-moment"]').click(); await page.waitForTimeout(900);
const saved = await page.evaluate(() => { const s = window.__velaStore.getState().journal.sessions; return { n: s.length, problems: s[s.length - 1]?.problems ?? s[0]?.problems, all: s.map((x) => x.problems) }; });
ok("session saved with its problems", saved.n === before + 1 && ["pain", "dryness", "timing", "stress", "Fake: neighbour's dog barking"].every((p) => saved.all.some((a) => (a || []).includes(p))), saved);
ok("custom problem remembered in settings", await page.evaluate(() => window.__velaStore.getState().journal.settings.customProblems.includes("Fake: neighbour's dog barking")));

// Re-open the form: fresh draft, section empty again; pick for es/day shots
await page.evaluate(() => window.__velaStore.getState().setTab("home")); await page.waitForTimeout(400);
const details = page.locator(".ag-hero-actions .ag-hero-tile").nth(0);
if ((await details.getAttribute("aria-pressed")) !== "true") await details.click();
await page.waitForTimeout(500);
await card.scrollIntoViewIfNeeded();
await btn(0).click(); await page.waitForTimeout(400); await row(0).locator(".vp-opt").nth(3).click(); await btn(0).click();
await btn(2).click(); await page.waitForTimeout(400); await row(2).locator(".vp-opt").nth(1).click();
await page.waitForTimeout(300);

await page.evaluate(() => window.__velaStore.getState().setLanguage("es")); await page.waitForTimeout(500);
ok("es copy", (await card.locator(".vp-eyebrow").innerText()).toUpperCase().includes("ESTA RONDA") && (await card.locator(".vp-title").innerText()).startsWith("¿Algo no fue bien?"));
await shot("06-situation-open-night-es");
ok("no horizontal overflow (es)", (await overflow()).length === 0, await overflow());
await page.evaluate(() => { const s = window.__velaStore.getState(); if (s.journal.settings.mode !== "day") s.toggleMode(); }); await page.waitForTimeout(500);
await shot("07-situation-open-day-es");
await btn(2).click(); await page.waitForTimeout(100);
await page.evaluate(() => window.__velaStore.getState().setLanguage("en")); await page.waitForTimeout(400);
await shot("08-collapsed-picks-day-en");
await btn(1).click(); await page.waitForTimeout(100);
await shot("09-mood-open-day-en");
await btn(1).click();
await page.evaluate(() => window.__velaStore.getState().toggleMode()); await page.waitForTimeout(400);

// Encounter-scoped copy, if the form shows one.
const enc = page.locator('.vp[data-scope="encounter"]:visible');
if (await enc.count()) {
  await shot("10-encounter-night-en", enc.first());
  ok("encounter eyebrow", (await enc.first().locator(".vp-eyebrow").innerText()).toUpperCase().includes("ENCOUNTER"));
} else console.log("INFO  no encounter-scoped picker on the default form");

// Reduced motion: no transitions on the fold
await page.emulateMedia({ reducedMotion: "reduce" });
const rm = await row(0).locator(".vp-fold").evaluate((e) => getComputedStyle(e).transitionDuration);
ok("reduced motion: fold has no transition", rm.split(",").every((d) => parseFloat(d) === 0), rm);

ok("no page errors", errors.length === 0, errors);
await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
