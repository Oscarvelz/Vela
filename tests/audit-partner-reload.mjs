// AUDIT (fake data only): does a removed partner / wiped names stay removed after reload?
import { launch, newJournal, ok, note, J, iso, fails } from "./audit-lib.mjs";
const browser = await launch();
const E = (o) => ({ title: "", date: iso(0), dateStated: true, time: "20:00", timeStated: true, times: [], place: "Bedroom", count: 1, nextDay: false, notes: "", contraception: [], problems: [], partnerName: "", durationMins: 30, positions: [], intensity: 0, connection: 0, satisfaction: 0, energy: 0, overall: 4, source: "", ...o });
const { page, errors } = await newJournal(browser);
await page.evaluate((es) => window.__velaStore.getState().saveBatch(es, ""), [E({ partnerName: "Fakeana" }), E({ partnerName: "Fakemar", date: iso(-2) })]);
await page.waitForTimeout(1500);
await page.evaluate(() => window.__velaStore.getState().removePartner("Fakemar"));
note("after removePartner", (await J(page)).partners);
await page.waitForTimeout(800);
await page.reload(); await page.waitForTimeout(2500);
if (!(await page.locator(".ag-tabbar").count())) { await page.locator("input[type=password]").first().fill("fake-orbit-lantern-42"); await page.keyboard.press("Enter"); await page.waitForSelector(".ag-tabbar", { timeout: 30000 }); await page.waitForTimeout(800); }
const p = (await J(page)).partners;
ok("removed partner stays removed after reload", !p.includes("Fakemar"), p);
await page.evaluate(() => window.__velaStore.getState().eraseAll({ sessions: false, encounters: false, partners: true, places: false, positions: false, problems: false }));
await page.waitForTimeout(800);
await page.reload(); await page.waitForTimeout(2500);
if (!(await page.locator(".ag-tabbar").count())) { await page.locator("input[type=password]").first().fill("fake-orbit-lantern-42"); await page.keyboard.press("Enter"); await page.waitForSelector(".ag-tabbar", { timeout: 30000 }); await page.waitForTimeout(800); }
const p2 = (await J(page)).partners;
ok("wiped partner names stay wiped after reload (sessions older than wipe)", p2.length === 0, p2);
ok("no page errors", errors.length === 0, errors);
await browser.close();
