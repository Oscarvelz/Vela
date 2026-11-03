// AUDIT (fake data only): Clean the journal selective wipes + persistence after reload.
import { launch, newJournal, ok, note, J, tab, iso, SHOTS, fails } from "./audit-lib.mjs";
const browser = await launch();
const E = (o) => ({ title: "", date: iso(0), dateStated: true, time: "20:00", timeStated: true, times: [], place: "Bedroom", count: 1, nextDay: false, notes: "", contraception: [], problems: [], partnerName: "", durationMins: 30, positions: [], intensity: 0, connection: 0, satisfaction: 0, energy: 0, overall: 4, source: "", ...o });
const seed = [E({ partnerName: "Fakeana", count: 2 }), E({ partnerName: "Fakelu", date: iso(-3) }), E({ partnerName: "Fakemar", date: iso(-9), count: 3 })];
async function unlockIfNeeded(page) {
  await page.waitForTimeout(2500);
  if (!(await page.locator(".ag-tabbar").count())) { const pu = page.locator("input[type=password]").first(); await pu.fill("fake-orbit-lantern-42"); await page.keyboard.press("Enter"); await page.waitForSelector(".ag-tabbar", { timeout: 30000 }); await page.waitForTimeout(800); }
}
for (const choice of [{ sessions: true }, { encounters: true }, { partners: true }]) {
  const { page, errors, context } = await newJournal(browser);
  await page.evaluate((es) => window.__velaStore.getState().saveBatch(es, ""), seed);
  const full = { sessions: false, encounters: false, partners: false, places: false, positions: false, problems: false, ...choice };
  await page.evaluate((c) => window.__velaStore.getState().eraseAll(c), full);
  let j = await J(page);
  const tag = Object.keys(choice)[0];
  note(`wipe ${tag}: now`, { sessions: j.sessions.length, encounters: j.encounters.length, partners: j.partners, sessionPartners: [...new Set(j.sessions.map((s) => s.partnerName))] });
  await page.reload(); await unlockIfNeeded(page);
  const j2 = await J(page);
  note(`wipe ${tag}: after reload`, { sessions: j2.sessions.length, encounters: j2.encounters.length, partners: j2.partners });
  if (tag === "sessions") ok("wipe sessions: no empty encounters left behind", j2.encounters.length === 0, j2.encounters.map((e) => `${e.partnerName}@${e.startDate}`));
  if (tag === "encounters") ok("wipe encounters: stays wiped after reload", j2.encounters.length === 0, j2.encounters.length);
  if (tag === "partners") ok("wipe partner names: names gone from sessions too (or UI says they stay)", j2.sessions.every((s) => !s.partnerName), [...new Set(j2.sessions.map((s) => s.partnerName))]);
  if (tag === "sessions") { await tab(page, "history"); await page.locator("button", { hasText: /^Encounters$/ }).click(); await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}/wipe-sessions-leaves-encounters.png` }); }
  ok(`wipe ${tag}: no page errors`, errors.length === 0, errors);
  await context.close();
}
await browser.close();
console.log(fails ? `audit-wipe: ${fails} FAIL` : "audit-wipe: ok");
