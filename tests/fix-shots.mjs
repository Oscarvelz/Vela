// Screens changed by the Nov 2 fixes, at 360 px, en + es (fake data only). Also checks the dialogs' behaviour:
// removing a partner says sessions stay and survives a reload; a sessions wipe forces encounters; encounters-only
// shows the regroup note. Shots: /workspace/work/vela-audit/fix-shots/fx-*.png
import { launch, newJournal, ok, note, J, tab, iso, fails } from "./audit-lib.mjs";
const OUT = "/workspace/work/vela-audit/fix-shots";
const browser = await launch();
const E = (o) => ({ title: "", date: iso(0), dateStated: true, time: "20:00", timeStated: true, times: [], place: "Bedroom", count: 1, nextDay: false, notes: "", contraception: [], problems: [], partnerName: "", durationMins: 30, positions: [], intensity: 3, connection: 4, satisfaction: 4, energy: 3, overall: 4, source: "", solo: false, ...o, endDate: o.endDate ?? o.date ?? iso(0) });
const twoLines = (loc) => loc.evaluate((el) => {
  const cs = getComputedStyle(el); const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.25;
  return el.getBoundingClientRect().height > lh * 1.6;
});
for (const lang of ["en", "es"]) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, hasTouch: true, locale: lang === "es" ? "es-US" : "en-US" });
  const { page, errors } = await newJournal(browser, { ctx, lang });
  await page.evaluate(([es, a, b, c, d]) => {
    const s = window.__velaStore.getState();
    s.saveBatch(es, "");
    s.setCycle({ enabled: true, perspective: "self", starts: [a, b] });
    const id = s.addTracker({ perspective: "partner", partnerLink: "Fakeana", partnerName: "Fakeana" });
    window.__velaStore.getState().setCycle({ starts: [c, d] }, id);
  }, [[E({ partnerName: "Fakeana", count: 2 }), E({ partnerName: "Fakelu", date: iso(-3), place: "Hotel" }), E({ partnerName: "Fakemar", date: iso(-9), place: "Shower" })], iso(-40), iso(-12), iso(-33), iso(-5)]);
  await page.waitForTimeout(600);
  // Home cycle card (two trackers)
  const card = page.locator("#cycle-card");
  if ((await card.getAttribute("data-folded")) === "true") { await page.locator('[data-testid="cycle-fold"]').click(); await page.waitForTimeout(600); }
  await card.screenshot({ path: `${OUT}/fx-${lang}-home-cycle-card.png` });
  const title = page.locator('[data-testid="cycle-title"]');
  ok(`${lang}: cycle card title not clipped`, await title.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), await title.innerText());
  // History glance
  await tab(page, "history");
  await page.locator('[data-testid="glance-card"]').screenshot({ path: `${OUT}/fx-${lang}-history-glance.png` });
  ok(`${lang}: glance title one line`, !(await twoLines(page.locator('[data-testid="glance-card"] h2').first())));
  // Insights
  await tab(page, "insights");
  await page.screenshot({ path: `${OUT}/fx-${lang}-insights.png`, fullPage: true });
  ok(`${lang}: '1 encounters' never shown`, !/\b1 (encounters|encuentros)\b/.test(await page.locator("body").innerText()));
  // Batch: range, second partner, solo
  await tab(page, "home");
  await page.locator(".ag-hero-actions .ag-hero-tile").nth(1).click(); await page.waitForTimeout(400);
  const text = lang === "en"
    ? "Oct 25 - Oct 26 getaway with Fakeana, 5 times total\nOct 28 with Fakeana. Oct 28 later with Fakelu\nOct 30 solo"
    : "del 24 al 25 de octubre con Fakeana, 5 veces\nel 28 con Fakeana, luego con Fakelu\nel 30 por mi cuenta";
  await page.locator(".vb-page-text").fill(text); await page.waitForTimeout(500);
  const cards = await page.locator('[data-testid="batch-card"]').count();
  ok(`${lang}: batch reads 4 moments (range · 2 partners same day · solo)`, cards === 4, cards);
  const saveOn = await page.locator('[data-testid="batch-save"]').isEnabled();
  ok(`${lang}: save is enabled with no batch partner (solo needs none)`, saveOn);
  await page.locator('[data-testid="batch-recap"]').screenshot({ path: `${OUT}/fx-${lang}-batch-recap.png` });
  for (const row of await page.locator('[data-testid="batch-recap-row"]').all()) {
    ok(`${lang}: recap row on one line: ${(await row.innerText()).replace(/\n/g, " ")}`, !(await twoLines(row.locator(".vb-recap-what"))));
  }
  await page.locator('[data-testid="batch-card"]').first().screenshot({ path: `${OUT}/fx-${lang}-batch-card-range.png` });
  const before = (await J(page)).sessions.length;
  await page.locator('[data-testid="batch-save"]').click(); await page.waitForTimeout(800);
  const j = await J(page);
  ok(`${lang}: saved 5+1+1+1 = 8 sessions`, j.sessions.length - before === 8, j.sessions.length - before);
  const soloS = j.sessions.filter((s) => s.date.endsWith("-30") && !s.partnerName);
  ok(`${lang}: the solo moment has no partner`, soloS.length === 1);
  const rangeDays = lang === "en" ? ["2026-10-25", "2026-10-26"] : ["2026-10-24", "2026-10-25"];
  const range = j.sessions.filter((s) => s.partnerName === "Fakeana" && rangeDays.includes(s.date));
  ok(`${lang}: the range's 5 sessions spread over both days`, range.length === 5 && new Set(range.map((s) => s.date)).size === 2, range.map((s) => s.date));
  // Settings: remove a partner who has sessions
  await page.evaluate(() => window.__velaStore.getState().setSettingsOpen(true)); await page.waitForTimeout(600);
  await page.getByText(lang === "en" ? "Partners" : "Parejas", { exact: true }).first().click(); await page.waitForTimeout(400);
  await page.locator(`button[aria-label="${lang === "en" ? "Remove partner" : "Eliminar a la pareja"} Fakemar"]`).last().click(); await page.waitForTimeout(400);
  const dlg = page.locator('[role="dialog"], [role="alertdialog"]').last();
  await page.screenshot({ path: `${OUT}/fx-${lang}-remove-partner.png` });
  const dtext = await page.locator("body").innerText();
  ok(`${lang}: remove dialog says the session stays`, lang === "en" ? /Their 1 session stays/.test(dtext) : /Su sesión se queda/.test(dtext));
  await page.getByRole("button", { name: lang === "en" ? "Yes, remove" : "Sí, quitar" }).last().click(); await page.waitForTimeout(800);
  ok(`${lang}: Fakemar removed`, !(await J(page)).partners.includes("Fakemar"));
  await page.reload(); await page.waitForTimeout(2500);
  if (!(await page.locator(".ag-tabbar").count())) { await page.locator("input[type=password]").first().fill("fake-orbit-lantern-42"); await page.keyboard.press("Enter"); await page.waitForSelector(".ag-tabbar", { timeout: 30000 }); await page.waitForTimeout(800); }
  const after = await J(page);
  ok(`${lang}: …stays removed after reload, session kept with the name`, !after.partners.includes("Fakemar") && after.sessions.some((s) => s.partnerName === "Fakemar"), after.partners);
  // Logging with the name again brings it back
  await page.evaluate((e) => window.__velaStore.getState().saveBatch([e], ""), E({ partnerName: "Fakemar", date: iso(-1) }));
  await page.waitForTimeout(500);
  ok(`${lang}: logging with Fakemar again brings the name back`, (await J(page)).partners.includes("Fakemar"));
  // Clean the journal dialog
  await page.evaluate(() => window.__velaStore.getState().setSettingsOpen(true)); await page.waitForTimeout(600);
  await page.getByText(lang === "en" ? "Data & Backup" : "Datos y copias", { exact: true }).first().click(); await page.waitForTimeout(400);
  await page.getByRole("button", { name: lang === "en" ? "Clean the journal" : "Limpiar el diario" }).first().click(); await page.waitForTimeout(400);
  const encRow = page.locator('[data-testid="wipe-encounters"]');
  ok(`${lang}: sessions ticked → encounters forced (disabled, Remove)`, (await encRow.isDisabled()) && (await encRow.getAttribute("aria-pressed")) === "true");
  await page.screenshot({ path: `${OUT}/fx-${lang}-wipe-default.png` });
  await page.locator('[data-testid="wipe-sessions"]').click(); await page.waitForTimeout(200);
  ok(`${lang}: encounters only → regroup note`, (await page.locator('[data-testid="wipe-regroup-note"]').count()) === 1);
  await page.screenshot({ path: `${OUT}/fx-${lang}-wipe-encounters-only.png` });
  const keep = await J(page);
  await page.getByRole("button", { name: lang === "en" ? "Yes, clean it" : "Sí, limpiar" }).click(); await page.waitForTimeout(800);
  const w1 = await J(page);
  ok(`${lang}: encounters-only wipe keeps every session, each in a fresh encounter`, w1.sessions.length === keep.sessions.length && w1.sessions.every((s) => w1.encounters.some((e) => e.id === s.encounterId)) && !w1.encounters.some((e) => keep.encounters.some((k) => k.id === e.id)));
  await page.reload(); await page.waitForTimeout(2500);
  if (!(await page.locator(".ag-tabbar").count())) { await page.locator("input[type=password]").first().fill("fake-orbit-lantern-42"); await page.keyboard.press("Enter"); await page.waitForSelector(".ag-tabbar", { timeout: 30000 }); await page.waitForTimeout(800); }
  const w2 = await J(page);
  ok(`${lang}: …and after reload it is the same grouping (nothing rebuilt)`, JSON.stringify(w2.encounters.map((e) => e.id).sort()) === JSON.stringify(w1.encounters.map((e) => e.id).sort()));
  await page.evaluate(() => window.__velaStore.getState().eraseAll({ sessions: true, encounters: false, partners: false, places: false, positions: false, problems: false }));
  await page.waitForTimeout(600);
  const w3 = await J(page);
  ok(`${lang}: sessions wipe leaves no empty encounters`, w3.sessions.length === 0 && w3.encounters.length === 0);
  ok(`${lang}: no page errors`, errors.length === 0, errors);
  await ctx.close();
}
await browser.close();
process.exit(fails ? 1 : 0);
