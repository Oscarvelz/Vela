// Two cycle trackers in the UI (e2e build with the store hook, served at 8132). FAKE data only.
// Usage: LD_LIBRARY_PATH=... node tests/cycle-trackers-ui.mjs [en|es] [night|day]
// Asserts: no switcher with one tracker; switcher with two; switching changes the dial, header pill and
// calendar legend and is remembered; each session's phase chip reads its own partner's tracker; settings
// lists both; no wrapping in the switcher; no horizontal overflow; no page errors.
import { chromium } from "/workspace/work/browser-test/node_modules/playwright-core/index.mjs";
import { mkdirSync } from "node:fs";

const LANG = process.argv[2] || "en";
const MODE = process.argv[3] || "night";
const OUT = "/workspace/work/vela-cycle-shots";
mkdirSync(OUT, { recursive: true });
const tag = `trackers-${MODE}${LANG === "es" ? "-es" : ""}`;

let fails = 0;
const ok = (name, cond, extra = "") => {
  if (!cond) fails += 1;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra !== "" ? "  — " + JSON.stringify(extra) : ""}`);
};

const browser = await chromium.launch({
  executablePath: "/workspace/work/browser-test/browsers/chromium_headless_shell-1155/chrome-linux/headless_shell",
  args: ["--no-sandbox", "--no-proxy-server"],
});
const page = await browser.newPage({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 2.5, locale: LANG === "es" ? "es-ES" : "en-US" });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));

await page.goto("http://127.0.0.1:8132/Vela/");
await page.waitForSelector("#name", { timeout: 20000 });
await page.fill("#name", "Tester");
await page.fill("#create-pass", "fake-orbit-lantern-42");
await page.fill("#create-pass2", "fake-orbit-lantern-42");
await page.check("#pass-ack");
await page.click("button[type=submit]");
await page.waitForSelector(".ag-tabbar", { timeout: 30000 });
await page.waitForTimeout(600);

const store = (fn, arg) => page.evaluate(fn, arg);
// Tracker #1: the user's own cycle (one start); sessions with two partners.
await store(({ lang, mode }) => {
  const s = window.__velaStore.getState();
  const pad = (n) => String(n).padStart(2, "0");
  const day = (o) => {
    const d = new Date();
    d.setDate(d.getDate() + o);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  if (lang === "es") s.setLanguage("es");
  if (mode === "day" && s.journal.settings.mode !== "day") s.toggleMode();
  s.setCycle({ enabled: true, perspective: "self", starts: [-67, -39, -11].map(day), ends: { [day(-11)]: day(-7) } });
  const sessions = [
    { date: day(-2), partnerName: "Luna" },
    { date: day(-3), partnerName: "Fakepartner" },
    { date: day(-20), partnerName: "Luna" },
  ].map((x) => ({ ...x, time: "22:00", place: "Bedroom", durationMins: 30, overall: 4, intensity: 3, connection: 4, satisfaction: 4, energy: 3, positions: [] }));
  s.importJSON(JSON.stringify({ app: "vela", sessions, partners: ["Luna", "Fakepartner"] }));
}, { lang: LANG, mode: MODE });
await page.waitForTimeout(500);
await page.addStyleTag({ content: ".ag-tabbar{visibility:hidden!important}" });
ok("one tracker: no switcher on the card", (await page.locator('[data-testid="cycle-switch"]').count()) === 0);
ok("one tracker: pill has no name", (await page.locator('[data-testid="cycle-pill-whose"]').count()) === 0);

// Tracker #2: Luna's cycle, linked to the saved partner, with its own dates.
await store(() => {
  const s = window.__velaStore.getState();
  const pad = (n) => String(n).padStart(2, "0");
  const day = (o) => {
    const d = new Date();
    d.setDate(d.getDate() + o);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  s.addTracker({ perspective: "partner", partnerName: "Luna", partnerLink: "Luna" });
  s.setCycle({ starts: [-58, -30, -3].map(day) });
});
await page.waitForTimeout(600);
const sw = page.locator('[data-testid="cycle-switch"]');
ok("two trackers: switcher shown", (await sw.count()) === 1);
const labels = await sw.locator("button").allInnerTexts();
ok("switcher names both people", labels.length === 2 && labels.includes("Luna") && labels.includes(LANG === "es" ? "Yo" : "Me"), labels);
const tallBtn = await sw.locator("button").evaluateAll((els) => els.filter((el) => el.getBoundingClientRect().height > 44 || el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent));
ok("switcher labels on one line, not clipped", tallBtn.length === 0, tallBtn);
const card = page.locator("#cycle-card");
await card.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 96));
await page.waitForTimeout(900);
const dialLuna = await page.locator(".cy-dial").getAttribute("aria-valuetext");
const title = await card.locator('[data-testid=cycle-title], p.uppercase').first().innerText();
// With two trackers the switcher names the person, so the card title is just "Cycle" (fits one line at 360 px).
const activeName = await sw.locator('button[aria-pressed="true"]').innerText();
ok("new tracker is shown: Luna selected, plain title", /luna/i.test(activeName) && /^(cycle|ciclo)$/i.test(title.trim()), [activeName, title]);
await card.screenshot({ path: `${OUT}/${tag}-card-luna.png` });
await page.evaluate(() => scrollTo(0, 0));
const pill = await page.locator('[data-testid="cycle-pill"]').innerText();
ok("header pill names the shown tracker", /Luna/.test(pill), pill);
await page.screenshot({ path: `${OUT}/${tag}-header.png`, clip: { x: 0, y: 0, width: 412, height: 90 } });

await sw.locator("button", { hasText: LANG === "es" ? "Yo" : "Me" }).click();
await page.waitForTimeout(600);
const dialMe = await page.locator(".cy-dial").getAttribute("aria-valuetext");
ok("switching changes the dial", dialMe !== dialLuna, { dialLuna, dialMe });
ok("selection remembered in settings", await store(() => {
  const st = window.__velaStore.getState().journal.settings;
  return st.cycles.find((c) => c.id === st.cycleSelected)?.perspective === "self";
}));
ok("pill follows the switch", /Me|Yo/.test(await page.locator('[data-testid="cycle-pill"]').innerText()));
await card.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 96));
await page.waitForTimeout(700);
await card.screenshot({ path: `${OUT}/${tag}-card-me.png` });
ok("per-tracker isolation: my starts untouched", await store(() => window.__velaStore.getState().journal.settings.cycles[0].starts.length === 3));

// Session form chip: a Luna session reads Luna's cycle; a Fakepartner session falls to the user's own.
const ids = await store(() => window.__velaStore.getState().journal.sessions.map((x) => ({ id: x.id, p: x.partnerName, d: x.date })));
const lunaId = ids.find((x) => x.p === "Luna" && x.d === ids.filter((y) => y.p === "Luna").map((y) => y.d).sort().pop()).id;
const otherId = ids.find((x) => x.p === "Fakepartner").id;
await store((id) => window.__velaStore.getState().openEdit(id), lunaId);
await page.waitForSelector('[data-testid="session-phase"]');
await page.waitForTimeout(500);
const chipLuna = await page.locator('[data-testid="session-phase"]').last().innerText();
ok("Luna session chip reads Luna's cycle", /Luna/.test(chipLuna), chipLuna);
const chip = page.locator('[data-testid="session-phase"]').last();
await chip.scrollIntoViewIfNeeded();
const box = await chip.boundingBox();
await page.screenshot({ path: `${OUT}/${tag}-session-chip.png`, clip: { x: 0, y: Math.max(0, box.y - 110), width: 412, height: 170 } });
await store(() => window.__velaStore.getState().openEdit(null));
await page.waitForTimeout(300);
await store((id) => window.__velaStore.getState().openEdit(id), otherId);
await page.waitForSelector('[data-testid="session-phase"]');
await page.waitForTimeout(400);
const chipOther = await page.locator('[data-testid="session-phase"]').last().innerText();
ok("other partner's session reads my own cycle", /Me|Yo/.test(chipOther) && !/Luna/.test(chipOther), chipOther);
await store(() => window.__velaStore.getState().openEdit(null));
await page.waitForTimeout(300);

// Calendar: marks + legend say whose.
await store(() => window.__velaStore.getState().selectCycle(window.__velaStore.getState().journal.settings.cycles[1].id));
await store(() => window.__velaStore.getState().setTab("calendar"));
await page.waitForTimeout(700);
const legend = await page.locator('[data-testid="cycle-legend-whose"]').innerText();
ok("calendar legend names whose marks", /Luna/.test(legend), legend);
await page.evaluate(() => scrollTo(0, 0));
await page.screenshot({ path: `${OUT}/${tag}-calendar.png` });

// History: phase filter counts each session by its own tracker (no errors, dots rendered).
await store(() => window.__velaStore.getState().setTab("history"));
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/${tag}-history.png` });

// Insights.
await store(() => window.__velaStore.getState().setTab("insights"));
await page.waitForTimeout(700);
const stats = page.locator('[data-testid="cycle-stats"]');
await stats.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 96));
await page.waitForTimeout(400);
await stats.screenshot({ path: `${OUT}/${tag}-insights.png` });
ok("insights explain the per-moment rule", /partner|pareja/i.test(await stats.innerText()));

// Settings: both trackers listed, editor, add button.
await store(() => {
  const s = window.__velaStore.getState();
  s.setSettingsOpen(true);
});
await page.waitForTimeout(400);
await store(() => {
  const s = window.__velaStore.getState();
  if (!s.sections.cycle) s.toggleSection("cycle");
});
await page.waitForTimeout(500);
const list = page.locator('[data-testid="cycle-trackers"]');
ok("settings list both trackers", (await list.locator("button").count()) === 2);
const section = list.locator("xpath=../..");
await section.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 70));
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/${tag}-settings.png` });
const removeBtn = page.locator('[data-testid="cycle-tracker-remove"]');
ok("multi: remove button offered", (await removeBtn.count()) === 1);
await page.locator('[data-testid="cycle-add-tracker"]').click();
await page.waitForTimeout(300);
await removeBtn.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 360));
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/${tag}-settings-bottom.png` });
await removeBtn.click();
await page.waitForTimeout(400);
const dialog = await page.locator('[role="dialog"], [role="alertdialog"]').last().innerText().catch(() => "");
ok("remove asks for confirmation, naming Luna", /Luna/.test(dialog), dialog);
await page.screenshot({ path: `${OUT}/${tag}-settings-confirm.png` });
await page.keyboard.press("Escape");
await page.locator('button', { hasText: LANG === "es" ? "Conservar" : "Keep" }).last().click().catch(() => {});
await page.waitForTimeout(300);
ok("cancelled: both trackers still there", await store(() => window.__velaStore.getState().journal.settings.cycles.length === 2));
// Pause Luna: the switcher disappears (one visible tracker), history stays.
await store(() => {
  const s = window.__velaStore.getState();
  s.setCycle({ enabled: false }, s.journal.settings.cycles[1].id);
});
await page.waitForTimeout(300);
await store(() => window.__velaStore.getState().setSettingsOpen(false));
await store(() => window.__velaStore.getState().setTab("home"));
await page.waitForTimeout(500);
ok("paused tracker: switcher hidden", (await page.locator('[data-testid="cycle-switch"]').count()) === 0);
ok("paused tracker keeps its history", await store(() => window.__velaStore.getState().journal.settings.cycles[1].starts.length === 3));
await store(() => {
  const s = window.__velaStore.getState();
  s.setCycle({ enabled: true }, s.journal.settings.cycles[1].id);
});

const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
ok("no horizontal overflow", ov <= 0, ov);
ok("no page errors", errors.length === 0, errors);
await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nTRACKERS UI ALL PASS");
process.exit(fails ? 1 : 0);
