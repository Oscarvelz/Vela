// AUDIT (fake data only): cycle start merge via UI (card confirm+Undo, calendar day chip, settings unmark).
import { launch, newJournal, ok, note, J, tab, iso, SHOTS, fails } from "./audit-lib.mjs";
const browser = await launch();
const { page, errors } = await newJournal(browser);
const cyc = () => page.evaluate(() => { const s = window.__velaStore.getState().journal.settings; const t = s.cycles.find((c) => c.id === s.cycleSelected) || s.cycles[0]; return { starts: t.starts, ends: t.ends }; });
// self tracker: starts -45, -17, -8 (a short, real 9-day bleed gap is unusual; use -8 with logged end -5)
await page.evaluate(([a, b, c, ce]) => window.__velaStore.getState().setCycle({ enabled: true, perspective: "self", starts: [a, b, c], ends: { [c]: ce } }), [iso(-45), iso(-17), iso(-8), iso(-5)]);
await page.waitForTimeout(400);
const fold = page.locator('[data-testid="cycle-fold"]');
if ((await page.locator("#cycle-card").getAttribute("data-folded")) === "true") { await fold.click(); await page.waitForTimeout(600); }
// 1) card: Period started today → confirm → Undo
const startBtn = page.locator('[data-testid="cycle-card"] [data-act="start"]').first(); await startBtn.scrollIntoViewIfNeeded();
ok("card offers 'Period started'", (await startBtn.count()) > 0);
await startBtn.click(); await page.waitForTimeout(300);
const ask = await page.locator('[data-testid="cycle-card"], #cycle-card').first().innerText();
note("confirm prompt", (ask.match(/Mark your period.*\?/) || [""])[0]);
await page.locator('[data-testid="cycle-confirm-yes"]').click(); await page.waitForTimeout(400);
let c = await cyc();
note("after confirm", c);
ok("confirm warns that the start 8 days ago will be replaced", /replace|move|8 days/i.test(ask), "prompt only asks 'Mark your period as started today?'");
await page.locator('[data-testid="cycle-undo"]').click(); await page.waitForTimeout(400);
c = await cyc();
note("after undo", c);
ok("Undo restores the start (and logged end) it replaced", c.starts.includes(iso(-8)) && c.ends[iso(-8)] === iso(-5), c);
// re-seed and test calendar day chip
await page.evaluate(([a, b, c, ce]) => window.__velaStore.getState().setCycle({ enabled: true, perspective: "self", starts: [a, b, c], ends: { [c]: ce } }), [iso(-45), iso(-17), iso(-8), iso(-5)]);
await tab(page, "calendar");
await page.evaluate((d) => window.__velaStore.getState().pickDay(d), iso(-2)); await page.waitForTimeout(500);
const chip = page.locator("button:visible", { hasText: /^Period started this day$/ }).first();
ok("calendar day offers 'Period started this day' on day -2", (await chip.count()) > 0);
if (await chip.count()) {
  await chip.click(); await page.waitForTimeout(500);
  c = await cyc();
  note("after calendar chip", c);
  ok("calendar chip on day -2 kept the logged period 8 days ago", c.starts.includes(iso(-8)), c);
  const undo = await page.locator("button:visible", { hasText: /^Undo$/ }).count();
  ok("calendar chip offers Undo / confirm", undo > 0);
  await page.screenshot({ path: `${SHOTS}/calendar-start-chip-replaced.png` });
  // tap again: does toggling back restore?
  await page.locator("button:visible", { hasText: /^Period started this day$/ }).first().click(); await page.waitForTimeout(400);
  c = await cyc();
  ok("tapping the chip again restores the previous state", c.starts.includes(iso(-8)), c);
}
ok("no page errors", errors.length === 0, errors);
await browser.close();
console.log(fails ? `audit-cycle-ui: ${fails} FAIL` : "audit-cycle-ui: ok");
