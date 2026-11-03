// REGRESSION (fake data only): one-time split of mixed-partner encounters ("enc-split-1") runs on device after
// unlock, survives reloads, runs once, and removing one split encounter leaves the others alone.
// Run: VELA_PORT=8132 /workspace/work/run-vela-test.sh 8132 <build parent> node tests/regress-enc-split.mjs
import { launch, newJournal, ok, J, tab, iso, fails, SHOTS } from "./audit-lib.mjs";
const browser = await launch();
const { page, errors } = await newJournal(browser, { width: 360 });
let n = 0;
const S = (o) => ({ id: `fk${n}`, createdAt: 1_790_000_000_000 + n++ * 1000, partnerName: "", date: iso(-2), time: "21:00", place: "Bedroom", durationMins: 30, positions: [], intensity: 3, connection: 3, satisfaction: 3, energy: 3, overall: 4, notes: "", ownWords: "fake", contraception: [], problems: [], sessionNumber: 0, encounterId: "", ...o });
const Enc = (o) => ({ id: "emix", createdAt: 1_790_000_000_000, title: "", startDate: iso(-2), endDate: iso(-2), partnerName: "", comment: "", problems: [], ...o });
const sessions = [
  S({ id: "fa1", partnerName: "Fakeana", encounterId: "emix" }),
  S({ id: "fa2", partnerName: "Fakeana", encounterId: "emix" }),
  S({ id: "fl1", partnerName: "Fakelu", encounterId: "emix" }),
  S({ id: "fs1", partnerName: "", encounterId: "emix" }),
  // multi-day weekend: Fakemar Sat + Sun, solo on Sun
  S({ id: "fm1", partnerName: "Fakemar", date: iso(-9), encounterId: "ewk" }),
  S({ id: "fm2", partnerName: "Fakemar", date: iso(-8), encounterId: "ewk" }),
  S({ id: "fs2", partnerName: "", date: iso(-8), encounterId: "ewk" }),
  // already clean
  S({ id: "fc1", partnerName: "Fakelu", date: iso(-5), encounterId: "eok" }),
];
const encounters = [
  Enc({ id: "emix", partnerName: "Fakeana", title: "Fakeana night", comment: "fake comment" }),
  Enc({ id: "ewk", partnerName: "Fakemar", startDate: iso(-10), endDate: iso(-8), title: "Weekend" }),
  Enc({ id: "eok", partnerName: "Fakelu", startDate: iso(-5), endDate: iso(-5) }),
];
// Seed an "older build" journal (no migration marker) and save it encrypted.
await page.evaluate(([sessions, encounters]) => {
  const s = window.__velaStore.getState();
  s.replaceJournal({ ...s.journal, partners: ["Fakeana", "Fakelu", "Fakemar"], sessions, encounters, migrations: undefined, updatedAt: Date.now() });
}, [sessions, encounters]);
await page.waitForTimeout(1200);
let j = await J(page);
ok("seed: mixed encounter stored as-is before unlock-time migration", j.sessions.filter((s) => s.encounterId === "emix").length === 4);

const reopen = async () => {
  await page.reload(); await page.waitForTimeout(2500);
  if (!(await page.locator(".ag-tabbar").count())) {
    await page.locator("input[type=password]").first().fill("fake-orbit-lantern-42"); await page.keyboard.press("Enter");
    await page.waitForSelector(".ag-tabbar", { timeout: 30000 }); await page.waitForTimeout(800);
  }
  return page.evaluate(() => { const j = window.__velaStore.getState().journal; return { sessions: j.sessions, encounters: j.encounters, migrations: j.migrations, deleted: j.deleted }; });
};
const own = (s) => JSON.stringify({ ...s, encounterId: 0, updatedAt: 0, sessionNumber: 0 });
const groupsOk = (j) => j.encounters.every((e) => new Set(j.sessions.filter((s) => s.encounterId === e.id).map((s) => s.partnerName.trim().toLowerCase())).size === 1);

j = await reopen();
ok("after unlock: marker set", (j.migrations ?? []).includes("enc-split-1"), j.migrations);
ok("after unlock: 8 sessions, own fields unchanged", j.sessions.length === 8 && sessions.every((s) => own(j.sessions.find((x) => x.id === s.id)) === own({ ...s, sessionNumber: 0 })));
ok("after unlock: every encounter holds one partner", groupsOk(j));
ok("after unlock: 6 encounters (Fakeana, Fakelu, solo · Fakemar, solo · clean one)", j.encounters.length === 6, j.encounters.map((e) => `${e.id}:${e.partnerName || "solo"}:${e.startDate}..${e.endDate}`));
const mix = j.encounters.find((e) => e.id === "emix");
ok("original keeps Fakeana's 2 sessions and its title", mix?.partnerName === "Fakeana" && mix.title === "Fakeana night" && j.sessions.filter((s) => s.encounterId === "emix").length === 2);
const wk = j.encounters.find((e) => e.id === "ewk");
ok("weekend: Fakemar keeps Fri..Sun span (Fri wasn't from a moved session)", wk?.startDate === iso(-10) && wk.endDate === iso(-8), wk);
const wkSolo = j.encounters.find((e) => e.id.startsWith("ewk~"));
ok("weekend: solo split gets Sun only, title copied", wkSolo?.startDate === iso(-8) && wkSolo.endDate === iso(-8) && wkSolo.title === "Weekend" && wkSolo.partnerName === "", wkSolo);
const clean = j.encounters.find((e) => e.id === "eok");
ok("clean encounter untouched (no new stamp)", clean && clean.updatedAt === undefined);
const snapshot = JSON.stringify({ s: j.sessions.map((s) => [s.id, s.encounterId]).sort(), e: j.encounters.map((e) => e.id).sort() });

// History → Encounters shows them apart
await tab(page, "history");
await page.locator("button:visible").filter({ hasText: /^Encounters$/ }).first().click().catch(() => {});
await page.waitForTimeout(500);
await page.screenshot({ path: `${SHOTS}/../fix-shots/enc-split-history-en-360.png`, fullPage: true }).catch(() => {});

// Reload again: same result, nothing re-runs
const j2 = await reopen();
ok("second reload: identical links and encounters", JSON.stringify({ s: j2.sessions.map((s) => [s.id, s.encounterId]).sort(), e: j2.encounters.map((e) => e.id).sort() }) === snapshot);
ok("second reload: no restamp (migration ran once)", j2.sessions.find((s) => s.id === "fl1")?.updatedAt === j.sessions.find((s) => s.id === "fl1")?.updatedAt);

// Remove Fakelu's split encounter → only Fakelu's session goes
const luEnc = j2.sessions.find((s) => s.id === "fl1").encounterId;
await page.evaluate((id) => window.__velaStore.getState().removeEncounter(id), luEnc);
await page.waitForTimeout(600);
const j3 = await J(page);
ok("remove one split encounter: only its 1 session goes", j3.sessions.length === 7 && !j3.sessions.some((s) => s.id === "fl1"));
ok("…Fakeana's and the solo ones remain", ["fa1", "fa2", "fs1"].every((id) => j3.sessions.some((s) => s.id === id)));
const j4 = await reopen();
ok("…and after reload it stays that way", j4.sessions.length === 7 && j4.encounters.length === 5 && groupsOk(j4));
ok("no page errors", errors.length === 0, errors);
await browser.close();
process.exit(fails ? 1 : 0);
