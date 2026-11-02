// REGRESSION (fake data only) for audit C1 + M2: an encounter only holds sessions with one partner
// (solo is its own key). Editing a session's partner/date re-homes it; an emptied encounter is dropped.
// Existing mixed encounters are left exactly as stored on load (no silent migration).
// Run: VELA_PORT=8132 /workspace/work/run-vela-test.sh 8132 <build parent> node tests/regress-encounters.mjs
import { launch, newJournal, ok, J, tab, iso, fails } from "./audit-lib.mjs";
const browser = await launch();
const { page, errors } = await newJournal(browser);
const E = (o) => ({ title: "", date: iso(0), dateStated: true, time: "20:00", timeStated: true, times: [], place: "Bedroom", count: 1, nextDay: false, notes: "", contraception: [], problems: [], partnerName: "", durationMins: 30, positions: [], intensity: 0, connection: 0, satisfaction: 0, energy: 0, overall: 4, source: "", ...o });
const store = (fn, arg) => page.evaluate(([f, a]) => new Function("s", "a", f)(window.__velaStore.getState(), a), [fn, arg]);
const encOf = (j, sid) => j.sessions.find((s) => s.id === sid)?.encounterId;
const members = (j, eid) => j.sessions.filter((s) => s.encounterId === eid);
const editDraft = (s, e, over = {}) => ({ ...s, newPartner: "", customPlace: "", prevNote: "", encounterId: s.encounterId, encounterTitle: e?.title ?? "", encounterStart: e?.startDate ?? "", encounterEnd: e?.endDate ?? "", encounterProblems: [], ...over });

await store("s.saveBatch(a, '')", [E({ partnerName: "Fakeana", count: 2 })]);
await page.waitForTimeout(300);
let j = await J(page);
const anaEnc = j.sessions.find((s) => s.partnerName === "Fakeana").encounterId;

// 1) Details form with another partner on the same day → its own encounter
await page.locator("button:visible").filter({ hasText: /^Fakelu$/ }).first().click(); await page.waitForTimeout(200);
await page.locator('[data-testid="save-moment"]').click(); await page.waitForTimeout(700);
j = await J(page);
const lu = j.sessions.find((s) => s.partnerName === "Fakelu");
ok("form: Fakelu on Fakeana's day gets its own encounter", lu && lu.encounterId !== anaEnc);
ok("form: Fakelu's encounter is named for Fakelu", j.encounters.find((e) => e.id === lu.encounterId)?.partnerName === "Fakelu");

// 2) Same partner on the same day still joins (the form's auto-join keeps working)
await tab(page, "home");
await page.locator("button:visible").filter({ hasText: /^Fakeana$/ }).first().click(); await page.waitForTimeout(200);
await page.locator('[data-testid="save-moment"]').click(); await page.waitForTimeout(700);
j = await J(page);
ok("form: another Fakeana session that day joins Fakeana's encounter", members(j, anaEnc).length === 3, members(j, anaEnc).length);

// 3) Quick log (solo) → never merged with a partner's encounter
await tab(page, "home");
await page.locator(".ag-hero-cta").click(); await page.waitForTimeout(500);
j = await J(page);
const solo = j.sessions.find((s) => !s.partnerName);
ok("quick log: solo session gets a solo encounter", solo && ![anaEnc, lu.encounterId].includes(solo.encounterId));
ok("quick log: that encounter has no partner", j.encounters.find((e) => e.id === solo.encounterId)?.partnerName === "");
await store("s.quickLog()");
j = await J(page);
ok("quick log: a second solo log that day joins the solo encounter", members(j, solo.encounterId).length === 2);

// 4) Removing Fakeana's encounter removes only her sessions
let before = j.sessions.length;
await store("s.removeEncounter(a)", anaEnc);
j = await J(page);
ok("remove encounter: only Fakeana's 3 sessions go", before - j.sessions.length === 3 && j.sessions.every((s) => s.partnerName !== "Fakeana"), j.sessions.map((s) => s.partnerName || "solo"));

// 5) Shared encounter: change one session's partner → it moves out; the rest stay
await store("s.saveBatch(a, '')", [E({ partnerName: "Fakemar", date: iso(-3), count: 2 })]);
j = await J(page);
const marPair = j.sessions.filter((s) => s.partnerName === "Fakemar");
const marEnc = marPair[0].encounterId;
const e5 = j.encounters.find((e) => e.id === marEnc);
await store("s.saveEdit(a[0], a[1])", [marPair[0].id, editDraft(marPair[0], e5, { partnerName: "Fakelu" })]);
j = await J(page);
const moved5 = j.sessions.find((s) => s.id === marPair[0].id);
ok("edit partner (shared): session leaves Fakemar's encounter", moved5.encounterId !== marEnc);
ok("edit partner (shared): its new encounter is Fakelu's", j.encounters.find((e) => e.id === moved5.encounterId)?.partnerName === "Fakelu");
ok("edit partner (shared): Fakemar's encounter keeps its other session", members(j, marEnc).length === 1 && j.encounters.find((e) => e.id === marEnc)?.partnerName === "Fakemar");

// 6) Sole session, new partner already has an encounter that day → joins it; the emptied one is dropped
const lone = j.sessions.find((s) => s.encounterId === marEnc);
const target6 = moved5.encounterId;
await store("s.saveEdit(a[0], a[1])", [lone.id, editDraft(lone, j.encounters.find((e) => e.id === marEnc), { partnerName: "Fakelu" })]);
j = await J(page);
ok("edit partner (alone): joins Fakelu's encounter that day", encOf(j, lone.id) === target6, { got: encOf(j, lone.id), want: target6 });
ok("edit partner (alone): the emptied encounter is dropped", !j.encounters.some((e) => e.id === marEnc));
ok("edit partner (alone): the dropped encounter gets a tombstone (sync agrees)", Boolean(await page.evaluate((id) => window.__velaStore.getState().journal.deleted?.[id], marEnc)));

// 7) Date moved out of a shared encounter → re-homed; the shared one keeps its span
const pair = j.sessions.filter((s) => s.encounterId === target6);
const e7 = j.encounters.find((e) => e.id === target6);
await store("s.saveEdit(a[0], a[1])", [pair[0].id, editDraft(pair[0], e7, { date: iso(-10) })]);
j = await J(page);
const m7 = j.sessions.find((s) => s.id === pair[0].id);
const n7 = j.encounters.find((e) => e.id === m7.encounterId);
ok("edit date (shared): session gets an encounter on its new date", m7.encounterId !== target6 && n7.startDate === iso(-10) && n7.endDate === iso(-10), n7);
const o7 = j.encounters.find((e) => e.id === target6);
ok("edit date (shared): the old encounter keeps its own date", o7.startDate === iso(-3) && o7.endDate === iso(-3), o7);

// 8) Sole session moved → its encounter follows (no stale span); deleting it drops the encounter
await store("s.saveEdit(a[0], a[1])", [m7.id, editDraft(m7, n7, { date: iso(-12) })]);
j = await J(page);
const e8 = j.encounters.find((e) => e.id === encOf(j, m7.id));
ok("edit date (alone): encounter span follows the session", e8.startDate === iso(-12) && e8.endDate === iso(-12), e8);
await store("s.deleteSession(a)", m7.id);
j = await J(page);
ok("delete last session: its encounter is dropped", !j.encounters.some((e) => e.id === e8.id));
ok("no 0-session encounters anywhere", j.encounters.every((e) => members(j, e.id).length > 0), j.encounters.filter((e) => !members(j, e.id).length));
await tab(page, "history");
ok("History shows no '· 0 sessions'", !/· 0 sessions/.test(await page.locator("body").innerText()));

// 9) Existing mixed encounter (made by the old bug) is left exactly as stored after a reload
await page.evaluate(([d]) => {
  const st = window.__velaStore;
  const jn = st.getState().journal;
  const base = jn.sessions[0];
  const enc = { id: "elegacymix1", createdAt: 1, title: "", startDate: d, endDate: d, partnerName: "Fakeana", comment: "", problems: [] };
  const mk = (id, p) => ({ ...base, id, createdAt: 2, partnerName: p, date: d, encounterId: "elegacymix1" });
  st.setState({ journal: { ...jn, encounters: [...jn.encounters, enc], sessions: [...jn.sessions, mk("slegacyA", "Fakeana"), mk("slegacyB", "Fakelu"), mk("slegacyC", "")] } });
  st.getState().setWeekStart(jn.settings.weekStart === "monday" ? "sunday" : "monday");
}, [iso(-20)]);
await page.waitForTimeout(1200);
await page.reload(); await page.waitForTimeout(2500);
if (!(await page.locator(".ag-tabbar").count())) { await page.locator("input[type=password]").first().fill("fake-orbit-lantern-42"); await page.keyboard.press("Enter"); await page.waitForSelector(".ag-tabbar", { timeout: 30000 }); await page.waitForTimeout(800); }
j = await J(page);
const mix = j.sessions.filter((s) => s.id.startsWith("slegacy"));
ok("legacy mixed encounter survives reload untouched", mix.length === 3 && mix.every((s) => s.encounterId === "elegacymix1") && j.encounters.some((e) => e.id === "elegacymix1" && e.partnerName === "Fakeana"), mix.map((s) => s.encounterId));

ok("no page errors", errors.length === 0, errors);
await browser.close();
console.log(fails ? `regress-encounters: ${fails} FAIL` : "regress-encounters: ALL PASS");
