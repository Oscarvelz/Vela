// REGRESSION (fake data only) for audit H1 + H2: every period start/end tap asks first (and says when a
// start replaces a nearby one), and Undo puts back the exact earlier starts/ends — including a start (and
// its logged end) that the 14-day merge replaced.
// Usage: VELA_PORT=8132 /workspace/work/run-vela-test.sh 8132 <build parent> node tests/regress-cycle-undo.mjs [en|es] [width]
import { launch, newJournal, ok, note, tab as tabRaw, iso, fails } from "./audit-lib.mjs";
// The tab bar hides while scrolled down (fold-bars); bring it back before tapping a tab.
const tab = async (page, id) => { await page.evaluate(() => window.scrollTo(0, 0)); await page.mouse.wheel(0, -400); await page.waitForTimeout(500); await tabRaw(page, id); };
import { mkdirSync } from "node:fs";
const LANG = process.argv[2] || "en";
const WIDTH = Number(process.argv[3] || 360);
const OUT = "/workspace/work/vela-audit/fix-shots"; mkdirSync(OUT, { recursive: true });
const tag = `${LANG}-${WIDTH}`;
const browser = await launch();
const { page, errors } = await newJournal(browser, { lang: LANG, width: WIDTH });
const loc = LANG === "es" ? "es" : "en";
const fmt = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toLocaleDateString(loc, { month: "short", day: "numeric" }); };
const cyc = () => page.evaluate(() => { const s = window.__velaStore.getState().journal.settings; const t = s.cycles.find((c) => c.id === s.cycleSelected) || s.cycles[0]; return { starts: t.starts, ends: t.ends }; });
const SEED = { starts: [iso(-45), iso(-17), iso(-8)], ends: { [iso(-8)]: iso(-5) } };
const same = (a, b) => JSON.stringify(a.starts) === JSON.stringify(b.starts) && JSON.stringify(a.ends) === JSON.stringify(b.ends);
const seed = (perspective = "self", partnerName = "") => page.evaluate(([s, p, n]) => window.__velaStore.getState().setCycle({ enabled: true, perspective: p, partnerName: n, starts: s.starts, ends: s.ends }), [SEED, perspective, partnerName]);
const replaces = LANG === "es" ? `Esto reemplaza el inicio del ${fmt(-8)}.` : `This replaces the start on ${fmt(-8)}.`;
// Any visible text node in the given selector that is clipped or wraps to a 2nd line.
const clipped = (sel) => page.evaluate((sel) => [...document.querySelectorAll(sel)].filter((el) => el.offsetParent !== null).flatMap((el) => [...el.querySelectorAll("span,p")]).filter((el) => {
  if (!el.textContent.trim() || el.offsetParent === null) return false;
  if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).display !== "inline") return true;
  // wraps: text lines at more than one height
  const range = document.createRange(); range.selectNodeContents(el);
  const tops = [...range.getClientRects()].filter((r) => r.height > 9 && r.width > 0).map((r) => r.top + r.height / 2);
  return tops.length > 1 && Math.max(...tops) - Math.min(...tops) > 8;
}).map((el) => el.textContent.trim().slice(0, 60)), sel);

await seed();
await page.waitForTimeout(400);
if ((await page.locator("#cycle-card").getAttribute("data-folded")) === "true") { await page.locator('[data-testid="cycle-fold"]').click(); await page.waitForTimeout(600); }

// ── 1) Card: Period started → confirm names the start it replaces → Yes → Undo restores everything
const startBtn = page.locator('[data-testid="cycle-card"] [data-act="start"]').first();
await startBtn.scrollIntoViewIfNeeded();
await startBtn.click(); await page.waitForTimeout(350);
const hint = (await page.locator('[data-testid="cycle-hint"]').innerText()).trim();
ok("card: confirm says which start it replaces", hint === replaces, hint);
ok("card: nothing changes before Yes", same(await cyc(), SEED));
ok("card: confirm line fits on one line", (await clipped('[data-testid="cycle-hint"], [data-testid="cycle-confirm"]')).length === 0, await clipped('[data-testid="cycle-hint"], [data-testid="cycle-confirm"]'));
await page.locator("#cycle-card").screenshot({ path: `${OUT}/${tag}-card-confirm-replace.png` });
await page.locator('[data-testid="cycle-confirm-yes"]').click(); await page.waitForTimeout(400);
let c = await cyc();
ok("card: Yes replaces the start 8 days ago with today", c.starts.includes(iso(0)) && !c.starts.includes(iso(-8)), c);
await page.locator("#cycle-card").screenshot({ path: `${OUT}/${tag}-card-undo.png` });
await page.locator('[data-testid="cycle-undo"]').click(); await page.waitForTimeout(400);
c = await cyc();
ok("card: Undo restores the replaced start AND its logged end exactly", same(c, SEED), c);

// Card prompt without a nearby start stays the plain question
await page.evaluate(([a, b]) => window.__velaStore.getState().setCycle({ starts: [a, b], ends: {} }), [iso(-45), iso(-17)]);
await page.waitForTimeout(300);
await page.locator('[data-testid="cycle-card"] [data-act="start"]').first().click(); await page.waitForTimeout(300);
const plain = (await page.locator('[data-testid="cycle-hint"]').innerText()).trim();
ok("card: no replacement → the usual question", !/replaces|reemplaza/.test(plain) && plain.length > 0, plain);
await page.locator('[data-testid="cycle-confirm-no"]').click(); await page.waitForTimeout(300);
await seed(); await page.waitForTimeout(300);

// ── 2) Calendar day: "Period started this day" asks, warns, and can be undone
await tab(page, "calendar");
await page.evaluate((d) => window.__velaStore.getState().pickDay(d), iso(-2)); await page.waitForTimeout(500);
const startChipRe = LANG === "es" ? /^El periodo empezó este día$/ : /^Period started this day$/;
let chip = page.locator("button:visible", { hasText: startChipRe }).first();
ok("calendar: day −2 offers the start chip", (await chip.count()) > 0);
await chip.scrollIntoViewIfNeeded();
await chip.click(); await page.waitForTimeout(350);
const q = page.locator('[data-testid="period-confirm-q"]:visible').first();
ok("calendar: chip asks first", (await q.count()) > 0 && same(await cyc(), SEED));
ok("calendar: the question names the start it replaces", (await q.innerText()).trim() === replaces, await q.innerText());
ok("calendar: confirm fits on one line", (await clipped('[data-testid="period-confirm"]')).length === 0, await clipped('[data-testid="period-confirm"]'));
await page.locator('[data-testid="period-confirm"]:visible').first().evaluate((el) => el.parentElement.scrollIntoView({ block: "center" }));
await page.screenshot({ path: `${OUT}/${tag}-calendar-confirm.png` });
await page.locator('[data-testid="period-confirm-no"]:visible').first().click(); await page.waitForTimeout(250);
ok("calendar: Cancel changes nothing", same(await cyc(), SEED));
await page.locator("button:visible", { hasText: startChipRe }).first().click(); await page.waitForTimeout(300);
await page.locator('[data-testid="period-confirm-yes"]:visible').first().click(); await page.waitForTimeout(400);
c = await cyc();
ok("calendar: Yes marks day −2 (replacing −8)", c.starts.includes(iso(-2)) && !c.starts.includes(iso(-8)), c);
const undo = page.locator('[data-testid="period-undo"]:visible').first();
ok("calendar: Undo offered", (await undo.count()) > 0);
await undo.evaluate((el) => el.scrollIntoView({ block: "center" }));
await page.screenshot({ path: `${OUT}/${tag}-calendar-undo.png` });
await undo.click(); await page.waitForTimeout(400);
ok("calendar: Undo restores −8 and its end exactly", same(await cyc(), SEED), await cyc());

// removing a start from the calendar asks too, and Undo brings it (and its end) back
await page.evaluate((d) => window.__velaStore.getState().pickDay(d), iso(-8)); await page.waitForTimeout(400);
chip = page.locator("button:visible", { hasText: startChipRe }).first();
await chip.click(); await page.waitForTimeout(300);
ok("calendar: removing a start asks first", (await page.locator('[data-testid="period-confirm-q"]:visible').count()) > 0 && same(await cyc(), SEED));
await page.locator('[data-testid="period-confirm-yes"]:visible').first().click(); await page.waitForTimeout(350);
ok("calendar: start −8 removed after Yes", !(await cyc()).starts.includes(iso(-8)));
await page.locator('[data-testid="period-undo"]:visible').first().click(); await page.waitForTimeout(350);
ok("calendar: Undo puts start −8 and its end back", same(await cyc(), SEED), await cyc());

// ── 3) Dial scrub (partner tracker: start / unstart / end chips) asks, then Undo
await tab(page, "home");
await seed("partner", "Fakeana"); await page.waitForTimeout(400);
if ((await page.locator("#cycle-card").getAttribute("data-folded")) === "true") { await page.locator('[data-testid="cycle-fold"]').click(); await page.waitForTimeout(600); }
const dial = page.locator(".cy-dial").first();
await dial.scrollIntoViewIfNeeded();
await dial.focus();
// today is day 9 of the −8 cycle: step back to day 1 (the −8 start) → "Remove this start"
for (let i = 0; i < 8; i++) await page.keyboard.press("ArrowLeft");
await page.waitForTimeout(300);
const act = page.locator('[data-testid="cycle-scrub-act"]').first();
note("scrub act on −8", await act.getAttribute("data-act"));
ok("scrub: the −8 start offers 'Remove this start'", (await act.getAttribute("data-act")) === "unstart");
await act.click(); await page.waitForTimeout(300);
const sh = (await page.locator('[data-testid="cycle-hint"]').innerText()).trim();
ok("scrub: asks before removing", (await page.locator('[data-testid="cycle-scrub-confirm"]').count()) > 0 && same(await cyc(), SEED), sh);
ok("scrub: question names the day", sh.includes(fmt(-8)), sh);
ok("scrub: confirm fits on one line", (await clipped('[data-testid="cycle-hint"], [data-testid="cycle-scrub-confirm"]')).length === 0, await clipped('[data-testid="cycle-hint"], [data-testid="cycle-scrub-confirm"]'));
await page.locator("#cycle-card").screenshot({ path: `${OUT}/${tag}-scrub-confirm.png` });
await page.locator('[data-testid="cycle-scrub-yes"]').click(); await page.waitForTimeout(400);
ok("scrub: Yes removes the start", !(await cyc()).starts.includes(iso(-8)));
await page.locator("#cycle-card").screenshot({ path: `${OUT}/${tag}-scrub-undo.png` });
await page.locator('[data-testid="cycle-undo"]').first().click(); await page.waitForTimeout(400);
ok("scrub: Undo restores start and end exactly", same(await cyc(), SEED), await cyc());
// scrub start on day −3 (inside −8's period? no: −8 ends −5) → replaces −8
await dial.focus();
for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowLeft");
await page.waitForTimeout(300);
note("scrub act on −3", await act.getAttribute("data-act"));
if ((await act.getAttribute("data-act")) === "start") {
  await act.click(); await page.waitForTimeout(300);
  const sh2 = (await page.locator('[data-testid="cycle-hint"]').innerText()).trim();
  ok("scrub start: warns it replaces −8", sh2 === replaces, sh2);
  await page.locator('[data-testid="cycle-scrub-yes"]').click(); await page.waitForTimeout(400);
  await page.locator('[data-testid="cycle-undo"]').first().click(); await page.waitForTimeout(400);
  ok("scrub start: Undo restores exactly", same(await cyc(), SEED), await cyc());
} else ok("scrub: day −3 offers a start", false, await act.getAttribute("data-act"));

// ── 4) Settings → "Remove this start" asks in its row, then Undo
await seed(); await page.waitForTimeout(300);
await page.evaluate(() => { const s = window.__velaStore.getState(); s.setSettingsOpen(true); });
await page.waitForTimeout(400);
await page.evaluate(() => { const s = window.__velaStore.getState(); if (!s.sections.cycle) s.toggleSection("cycle"); });
await page.waitForTimeout(500);
const rm = page.locator('[data-testid="start-remove"]').first();
await rm.scrollIntoViewIfNeeded();
await rm.click(); await page.waitForTimeout(300);
ok("settings: asks first (nothing removed yet)", (await page.locator('[data-testid="start-remove-yes"]').count()) === 1 && same(await cyc(), SEED));
ok("settings: confirm row fits on one line", (await clipped('[data-testid="start-row"]')).length === 0, await clipped('[data-testid="start-row"]'));
await page.locator('[data-testid="start-remove-yes"]').evaluate((el) => el.scrollIntoView({ block: "center" }));
await page.screenshot({ path: `${OUT}/${tag}-settings-confirm.png` });
await page.locator('[data-testid="start-remove-yes"]').click(); await page.waitForTimeout(400);
ok("settings: the newest start (−8) and its end are removed", !(await cyc()).starts.includes(iso(-8)));
ok("settings: Undo row fits on one line", (await clipped('[data-testid="start-removed"]')).length === 0, await clipped('[data-testid="start-removed"]'));
await page.locator('[data-testid="start-undo"]').evaluate((el) => el.scrollIntoView({ block: "center" }));
await page.screenshot({ path: `${OUT}/${tag}-settings-undo.png` });
await page.locator('[data-testid="start-undo"]').click(); await page.waitForTimeout(400);
ok("settings: Undo restores the start and its end exactly", same(await cyc(), SEED), await cyc());

const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
ok("no horizontal overflow", !overflow);
ok("no page errors", errors.length === 0, errors);
await browser.close();
console.log(fails ? `regress-cycle-undo ${tag}: ${fails} FAIL` : `regress-cycle-undo ${tag}: ALL PASS`);
