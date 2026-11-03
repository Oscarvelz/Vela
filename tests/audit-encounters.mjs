// AUDIT (fake data only): additions/edits/removals of sessions, encounters and partners.
import { launch, newJournal, ok, note, J, tab, iso, SHOTS, fails } from "./audit-lib.mjs";
const browser = await launch();
const { page, errors } = await newJournal(browser);
const E = (o) => ({ title: "", date: iso(0), dateStated: true, time: "20:00", timeStated: true, times: [], place: "Bedroom", count: 1, nextDay: false, notes: "", contraception: [], problems: [], partnerName: "", durationMins: 30, positions: [], intensity: 0, connection: 0, satisfaction: 0, energy: 0, overall: 4, source: "", ...o });
// Seed: Fakeana today x2 (batch), Fakemar 2 days ago
await page.evaluate((es) => window.__velaStore.getState().saveBatch(es, ""), [E({ partnerName: "Fakeana", count: 2 }), E({ partnerName: "Fakemar", date: iso(-2) })]);
await page.waitForTimeout(300);
// A) Details form: log with Fakelu today
await page.waitForTimeout(300);
const chip = page.locator("button:visible").filter({ hasText: /^Fakelu$/ }).first();
await chip.click(); await page.waitForTimeout(200);
const joinedText = await page.locator("form").first().innerText().catch(() => "");
note("form text near encounter", (joinedText.match(/.{0,60}(encounter|Encounter|night).{0,60}/g) || []).slice(0, 4));
await page.screenshot({ path: `${SHOTS}/form-fakelu-joins.png`, fullPage: true });
await page.locator('[data-testid="save-moment"]').click(); await page.waitForTimeout(700);
let j = await J(page);
const lu = j.sessions.find((s) => s.partnerName === "Fakelu");
const anaEnc = j.sessions.find((s) => s.partnerName === "Fakeana")?.encounterId;
ok("A: Fakelu session saved", Boolean(lu));
ok("A: Fakelu session NOT folded into Fakeana's encounter", lu && lu.encounterId !== anaEnc, { lu: lu?.encounterId, ana: anaEnc });
// B) Quick log (+1 now) on same day: solo
await tab(page, "home");
await page.locator(".ag-hero-cta").click(); await page.waitForTimeout(500);
j = await J(page);
const solo = j.sessions.find((s) => !s.partnerName);
ok("B: solo quick log not folded into a partner's encounter", solo && solo.encounterId !== anaEnc, { solo: solo?.encounterId, ana: anaEnc });
// C0) screenshot History encounter card + remove dialog
await tab(page, "history"); await page.waitForTimeout(500);
await page.screenshot({ path: `${SHOTS}/history-merged-encounter.png` });
// C) Remove Fakeana's encounter (as History's confirm would) → what else goes?
const before = j.sessions.length;
await page.evaluate((id) => window.__velaStore.getState().removeEncounter(id), anaEnc);
j = await J(page);
const gone = before - j.sessions.length;
ok("C: removing Fakeana's encounter removes only her 2 sessions", gone === 2, { removed: gone, left: j.sessions.map((s) => s.partnerName || "solo") });
// D) Edit via store (as the edit form would): move Fakemar's session to Fakelu
const mar = j.sessions.find((s) => s.partnerName === "Fakemar");
const enc0 = j.encounters.find((e) => e.id === mar.encounterId);
await page.evaluate(([s, e]) => window.__velaStore.getState().saveEdit(s.id, { ...s, partnerName: "Fakelu", newPartner: "", customPlace: "", prevNote: "", encounterId: s.encounterId, encounterTitle: e.title, encounterStart: e.startDate, encounterEnd: e.endDate, encounterProblems: [] }), [mar, enc0]);
j = await J(page);
const moved = j.sessions.find((s) => s.id === mar.id);
const enc = j.encounters.find((e) => e.id === moved.encounterId);
ok("D: after changing partner, encounter's partner follows the session", enc.partnerName === moved.partnerName, { session: moved.partnerName, encounter: enc.partnerName });
// D2) move it to another date: encounter span
await page.evaluate(([s, e, d]) => window.__velaStore.getState().saveEdit(s.id, { ...s, date: d, newPartner: "", customPlace: "", prevNote: "", encounterId: s.encounterId, encounterTitle: e.title, encounterStart: e.startDate, encounterEnd: e.endDate, encounterProblems: [] }), [moved, enc, iso(-9)]);
j = await J(page);
const m2 = j.sessions.find((s) => s.id === mar.id); const e2 = j.encounters.find((e) => e.id === m2.encounterId);
note("D2: moved date → encounter span", `${e2.startDate}..${e2.endDate} (session ${m2.date}, was ${mar.date})`);
ok("D2: encounter does not keep a stale span after the only session moved", e2.startDate === m2.date && e2.endDate === m2.date, `${e2.startDate}..${e2.endDate}`);
// E) delete last session of an encounter → empty encounter left?
await page.evaluate((id) => window.__velaStore.getState().deleteSession(id), m2.id);
j = await J(page);
const empty = j.encounters.filter((e) => !j.sessions.some((s) => s.encounterId === e.id));
ok("E: deleting the only session also removes its now-empty encounter", empty.length === 0, empty.map((e) => `${e.partnerName}@${e.startDate}..${e.endDate}`));
await tab(page, "home"); await tab(page, "history");
await page.screenshot({ path: `${SHOTS}/history-empty-encounter.png` });
const histText = await page.locator("body").innerText();
ok("E: History shows no 0-session encounter", !/· 0 sessions/.test(histText), (histText.match(/.{0,40}0 sessions.{0,20}/) || [""])[0]);
// F) remove partner (store) → sessions keep name; history filter & insights
await page.evaluate((es) => window.__velaStore.getState().saveBatch(es, ""), [E({ partnerName: "Fakemar", date: iso(-5), count: 3 })]);
await page.evaluate(() => window.__velaStore.getState().removePartner("Fakemar"));
j = await J(page);
note("F: Fakemar sessions after partner removal", j.sessions.filter((s) => s.partnerName === "Fakemar").length);
await tab(page, "home"); await tab(page, "history");
const hist2 = await page.locator("body").innerText();
note("F: history 'partners on file' line", (hist2.match(/.{0,30}partners on file.{0,10}/i) || [""])[0]);
await tab(page, "insights");
const ins = await page.locator("body").innerText();
note("F: insights mentions removed Fakemar", /Fakemar/.test(ins));
ok("no page errors", errors.length === 0, errors);
await browser.close();
console.log(fails ? `audit-encounters: ${fails} FAIL` : "audit-encounters: ok");
