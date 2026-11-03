// AUDIT (fake data only): batch reader end to end — cards, recap, skip, adjust, save → store.
import { launch, newJournal, ok, note, J, tab, iso, SHOTS, fails } from "./audit-lib.mjs";
const browser = await launch();
const { page, errors } = await newJournal(browser);
await page.locator(".ag-hero-actions .ag-hero-tile").nth(1).click(); await page.waitForTimeout(400);
const text = [
  "1. Last night with Fakelu in the bedroom, twice, 8/10, condom",
  "2) Saturday at the hotel, 3 rounds, 1 hour, 4 stars",
  "(3) hace 3 días con Fakemar en la ducha, sin condón",
  "#4 Oct 20 car 10pm",
  "5. el 28 con Fakeana",
].join("\n");
await page.locator(".vb-page-text").fill(text); await page.waitForTimeout(500);
const cards = page.locator('[data-testid="batch-card"]');
ok("5 cards", (await cards.count()) === 5, await cards.count());
await page.locator(".vb-chip", { hasText: "Fakeana" }).first().click(); await page.waitForTimeout(250);
const recapRows = await page.locator('[data-testid="batch-recap-row"]').allInnerTexts();
note("recap rows", recapRows);
const total = await page.locator('[data-testid="batch-recap-total"]').innerText();
note("recap total", total);
const save = await page.locator('[data-testid="batch-save"]').innerText();
note("save label", save);
ok("save label 2+3+1+1+1=8 sessions", /8/.test(save), save);
const cardTexts = await cards.allInnerTexts();
cardTexts.forEach((c, i) => note(`card ${i + 1}`, c.replace(/\n+/g, " | ").slice(0, 220)));
// skip card 4, adjust card 2 → count +1
await cards.nth(3).getByRole("button", { name: /Leave this one out|skip/i }).click(); await page.waitForTimeout(200);
const adj = cards.nth(1).getByRole("button", { name: /Adjust/i });
if (await adj.count()) { await adj.first().click(); await page.waitForTimeout(300);
  await cards.nth(1).locator('button[aria-label="+"]').first().click(); await page.waitForTimeout(200);
  // change partner of card 2 to Fakemar inside Adjust
  await cards.nth(1).locator("button", { hasText: "Fakemar" }).first().click().catch(() => note("no partner chip in adjust"));
  await page.waitForTimeout(200);
} else note("no Adjust button found");
const recap2 = await page.locator('[data-testid="batch-recap-row"]').allInnerTexts();
note("recap after skip+adjust", recap2);
const save2 = await page.locator('[data-testid="batch-save"]').innerText();
note("save after", save2);
await page.locator('[data-testid="batch-recap"]').scrollIntoViewIfNeeded();
await page.screenshot({ path: `${SHOTS}/batch-before-save.png`, fullPage: false });
await page.locator('[data-testid="batch-save"]').click(); await page.waitForTimeout(800);
const j = await J(page);
const summary = j.sessions.map((s) => `${s.date} ${s.time} ${s.partnerName} ${s.place} enc=${s.encounterId.slice(-4)}`).sort();
note("sessions", summary);
note("encounters", j.encounters.map((e) => `${e.startDate}..${e.endDate} ${e.partnerName}`));
const by = (p) => j.sessions.filter((s) => s.partnerName === p).length;
ok("Fakelu 2 (last night x2)", by("Fakelu") === 2 && j.sessions.filter((s) => s.partnerName === "Fakelu").every((s) => s.date === iso(-1)), by("Fakelu"));
ok("card2 adjusted → 4 rounds with Fakemar on Saturday", j.sessions.filter((s) => s.partnerName === "Fakemar" && s.place === "Hotel").length === 4);
ok("Fakemar shower 1 on -3", j.sessions.filter((s) => s.partnerName === "Fakemar" && s.date === iso(-3)).length === 1);
ok("skipped car entry not saved", !j.sessions.some((s) => s.place === "Car"));
ok("el 28 → Oct 28 (not today)", j.sessions.some((s) => s.partnerName === "Fakeana" && s.date.endsWith("-10-28")), j.sessions.filter((s) => s.partnerName === "Fakeana").map((s) => s.date));
ok("total sessions 8", j.sessions.length === 8, j.sessions.length);
// persistence
await page.reload(); await page.waitForTimeout(2500);
const unlocked = await page.locator(".ag-tabbar").count();
if (!unlocked) { const pu = page.locator("#unlock-pass, input[type=password]").first(); if (await pu.count()) { await pu.fill("fake-orbit-lantern-42"); await page.keyboard.press("Enter"); await page.waitForSelector(".ag-tabbar", { timeout: 30000 }); await page.waitForTimeout(800);} }
const j2 = await J(page);
ok("reload keeps all sessions", j2.sessions.length === j.sessions.length, [j2.sessions.length, j.sessions.length]);
ok("no page errors", errors.length === 0, errors);
await browser.close();
console.log(fails ? `audit-batch-ui: ${fails} FAIL` : "audit-batch-ui: ok");
