// Android back (page.goBack = system back button / gesture): layered back navigation, fake data only, en + es.
// Every layer closes innermost first; a non-Home tab (or a sub-view in it) backs to Home; Home backs out of the app;
// closing by the UI leaves no ghost entry; rapid backs; Escape; lock screen; reload. LANGS=en,es (default both).
import { chromium } from "/workspace/work/browser-test/node_modules/playwright-core/index.mjs";
const URL = `http://127.0.0.1:${process.env.VELA_PORT || 8132}/Vela/`;
const LANGS = (process.env.LANGS || "en,es").split(",");
let fails = 0;
const ok = (n, c, x = "") => { if (!c) fails++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  " + JSON.stringify(x)}`); };
const W = {
  en: { enc: "Encounters", partners: "Partners", rmPartner: "Remove partner", often: "How often:", date: "Choose a date", edit: "Edit", adjust: "Cycle settings", close: "Close", unlock: "Unlock" },
  es: { enc: "Encuentros", partners: "Parejas", rmPartner: "Eliminar a la pareja", often: "Frecuencia:", date: "Elegir una fecha", edit: "Editar", adjust: "Ajustes del ciclo", close: "Cerrar", unlock: "Desbloquear" },
};
const PASS = "fake-orbit-lantern-42";
const browser = await chromium.launch({ executablePath: "/workspace/work/browser-test/browsers/chromium_headless_shell-1155/chrome-linux/headless_shell", args: ["--no-sandbox", "--no-proxy-server"] });

for (const lang of LANGS) {
  const w = W[lang];
  const page = await browser.newPage({ viewport: { width: 412, height: 900 }, locale: lang === "es" ? "es-ES" : "en-US" });
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  const L = (name) => `${lang}: ${name}`;
  const pause = (ms = 280) => page.waitForTimeout(ms);
  const back = async () => { await page.goBack({ timeout: 4000, waitUntil: "commit" }).catch(() => {}); await pause(); };
  const st = () => page.evaluate(() => {
    const s = window.__velaStore?.getState();
    return { layers: window.__velaBack?.layers ?? [], depth: window.__velaBack?.depth ?? -1, hdepth: history.state?.velaBack ?? 0, tab: s?.tab, settings: s?.settingsOpen, edit: s?.editingId, form: s?.showForm, url: location.href };
  }).catch(() => ({ url: page.url() }));
  const atHome = async (name) => {
    await pause(150);
    const s = await st();
    ok(L(`${name} → Home, nothing open, no entries left`), s.tab === "home" && !s.settings && !s.edit && s.layers.length === 0 && s.hdepth === 0 && s.url.startsWith(URL), s);
  };

  // ── Set up a fake journal ──
  await page.goto(URL);
  await page.waitForSelector("#name", { timeout: 20000 });
  await page.fill("#name", "Tester"); await page.fill("#create-pass", PASS); await page.fill("#create-pass2", PASS);
  await page.check("#pass-ack"); await page.click("button[type=submit]");
  await page.waitForSelector(".ag-tabbar", { timeout: 30000 }); await pause(700);
  await page.evaluate((lang) => {
    const s = window.__velaStore.getState(); const pad = (n) => String(n).padStart(2, "0");
    const day = (o) => { const d = new Date(); d.setDate(d.getDate() + o); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
    if (lang === "es") s.setLanguage("es");
    s.setCycle({ enabled: true, perspective: "self", starts: [day(-3)] });
    const sessions = [-1, -3, -6, -9, -20, -33].map((o) => ({ date: day(o), time: "22:00", partnerName: "Fakepartner", place: "Bedroom", durationMins: 30, overall: 4, positions: [] }));
    s.importJSON(JSON.stringify({ app: "vela", sessions, partners: ["Fakepartner", "Otherfake"] }));
  }, lang);
  await pause(600);
  const len0 = await page.evaluate(() => history.length);
  await atHome("start");

  // ── Tabs → Home ──
  for (const tab of ["calendar", "history", "insights"]) {
    await page.click(`[data-tab=${tab}]`); await pause();
    let s = await st();
    ok(L(`${tab}: one back step`), s.tab === tab && s.hdepth === 1, s);
    await back();
    await atHome(`${tab} back`);
  }
  // Tab hopping does not pile up history.
  await page.click("[data-tab=calendar]"); await pause(); await page.click("[data-tab=history]"); await pause(); await page.click("[data-tab=insights]"); await pause();
  ok(L("calendar → history → insights is still one step"), (await st()).hdepth === 1, await st());
  await back(); await atHome("tab hopping, one back");
  // Home tab tap removes the entry (no ghost press).
  await page.click("[data-tab=calendar]"); await pause(); await page.click("[data-tab=home]"); await pause(400);
  await atHome("calendar, then Home tab tap");

  // ── History sub-view (Encounters) → Sessions → Home ──
  await page.click("[data-tab=history]"); await pause();
  await page.locator("main button", { hasText: w.enc }).first().click(); await pause();
  ok(L("history encounters: two steps"), (await st()).hdepth === 2, await st());
  await back();
  let s = await st();
  ok(L("back: Encounters → Sessions, still in History"), s.tab === "history" && !s.layers.includes("history-encounters") && s.hdepth === 1, s);
  await back(); await atHome("history root back");

  // ── History search + partner menu ──
  await page.click("[data-tab=history]"); await pause();
  await page.locator("input[type=search]").click(); await page.keyboard.type("Fake"); await pause();
  await page.locator("button[aria-haspopup=listbox]").first().click(); await pause();
  ok(L("menu open over a search (3 steps)"), (await page.locator("[role=listbox]").count()) === 1 && (await st()).hdepth === 3, await st());
  await back();
  ok(L("back closes the menu only"), (await page.locator("[role=listbox]").count()) === 0 && (await page.inputValue("input[type=search]")) === "Fake", await st());
  await back();
  s = await st();
  ok(L("back clears the search, stays in History"), s.tab === "history" && (await page.inputValue("input[type=search]")) === "", s);
  await back(); await atHome("history search back");

  // ── Insights drill-down → Insights → Home ──
  await page.click("[data-tab=insights]"); await pause();
  await page.locator("main button", { hasText: w.often }).first().click(); await pause();
  s = await st();
  ok(L("insights range opens History (2 steps)"), s.tab === "history" && s.layers.includes("range") && s.hdepth === 2, s);
  await back();
  s = await st();
  ok(L("back: range → Insights"), s.tab === "insights" && !s.layers.includes("range") && (await page.evaluate(() => !window.__velaStore.getState().histFrom)), s);
  await back(); await atHome("insights back");

  // ── Settings → section → confirm dialog ──
  const settingsBtn = page.locator("header .ag-hdr-btn").last();
  await settingsBtn.click(); await pause();
  await page.locator("section > button[aria-expanded]", { hasText: w.partners }).first().click(); await pause();
  await page.locator(`button[aria-label^="${w.rmPartner}"]`).first().click(); await pause();
  ok(L("settings › section › confirm = 3 steps"), (await page.locator("[role=alertdialog]").count()) === 1 && (await st()).hdepth === 3, await st());
  await back();
  ok(L("back = Cancel on the confirm (partner kept, section open)"), (await page.locator("[role=alertdialog]").count()) === 0 && (await page.evaluate(() => window.__velaStore.getState().journal.partners.length)) === 2 && (await page.locator("section > button[aria-expanded=true]").count()) === 1, await st());
  await back();
  s = await st();
  ok(L("back folds the section, Settings stays"), s.settings && (await page.locator("section > button[aria-expanded=true]").count()) === 0, s);
  await back(); await atHome("settings back");
  // Settings over Calendar → Calendar → Home
  await page.click("[data-tab=calendar]"); await pause(); await settingsBtn.click(); await pause();
  await back(); s = await st();
  ok(L("settings over Calendar: back → Calendar"), s.tab === "calendar" && !s.settings && s.hdepth === 1, s);
  await back(); await atHome("calendar after settings");

  // ── Edit sheet with a date picker ──
  await page.locator("article .w-full.text-left").first().dblclick(); await pause(400);
  await page.locator(`[role=dialog][aria-label="${w.edit}"] button[aria-label="${w.date}"]`).click(); await pause();
  ok(L("edit sheet + date picker = 2 steps"), (await st()).hdepth === 2 && (await st()).layers.includes("date-picker"), await st());
  await back();
  s = await st();
  ok(L("back closes the picker, edit stays"), Boolean(s.edit) && !s.layers.includes("date-picker"), s);
  await back(); await atHome("edit sheet back");

  // ── Home: the default Details form's picker; the Repeat form is a step ──
  ok(L("Details form is Home's resting state (no step)"), (await st()).form === true && (await st()).hdepth === 0, await st());
  await page.locator(`main button[aria-label="${w.date}"]`).first().click(); await pause();
  ok(L("date picker in the Home form = 1 step"), (await st()).hdepth === 1 && (await st()).layers.includes("date-picker"), await st());
  await back(); s = await st();
  ok(L("back closes the picker, form stays"), s.form && !s.layers.includes("date-picker"), s);
  await atHome("home picker back");
  await page.click("[data-testid=hero-repeat]"); await pause();
  ok(L("Repeat form = 1 step"), (await st()).layers.includes("form") && (await st()).hdepth === 1, await st());
  await back(); s = await st();
  ok(L("back closes the Repeat form"), !s.form, s);
  ok(L("Repeat closed: no entries left"), s.hdepth === 0 && s.layers.length === 0, s);
  await page.locator(".ag-hero-actions .ag-hero-tile").nth(0).click(); await pause();
  await atHome("Details form reopened");

  // ── Home: Batch with typed text + Adjust ──
  await page.locator(".ag-hero-actions .ag-hero-tile").nth(1).click(); await pause();
  await page.locator(".vb textarea").first().click(); await page.keyboard.type("yesterday twice at home"); await pause(500);
  await page.locator(".vb-card-shell button.min-h-10[aria-expanded]").first().click(); await pause();
  ok(L("batch + Adjust = 2 steps"), (await st()).hdepth === 2 && (await st()).layers.includes("batch-adjust"), await st());
  await back();
  ok(L("back closes Adjust, batch stays"), (await st()).layers.join() === "batch", await st());
  await back(); await atHome("batch back");
  await page.locator(".ag-hero-actions .ag-hero-tile").nth(1).click(); await pause();
  ok(L("typed batch text kept after back"), (await page.locator(".vb textarea").first().inputValue()) === "yesterday twice at home");
  await page.locator(".ag-hero-actions .ag-hero-tile").nth(1).click(); await pause(400);
  await atHome("batch closed by its tile");

  // ── Cycle sheet → day log ──
  await page.click("[data-testid=cycle-pill]"); await pause();
  await page.locator("[data-testid=cycle-sheet] .cy-week-day").first().click(); await pause();
  ok(L("cycle sheet + day log = 2 steps"), (await page.locator("[data-testid=day-log]").count()) === 1 && (await st()).hdepth === 2, await st());
  await back();
  ok(L("back closes the day log, sheet stays"), (await page.locator("[data-testid=day-log]").count()) === 0 && (await page.locator("[data-testid=cycle-sheet]").count()) === 1, await st());
  await back();
  ok(L("back closes the cycle sheet"), (await page.locator("[data-testid=cycle-sheet]").count()) === 0);
  await atHome("cycle sheet back");
  // Closed by its X: no ghost entry.
  await page.click("[data-testid=cycle-pill]"); await pause();
  await page.locator(`[data-testid=cycle-sheet] button[aria-label="${w.close}"]`).first().click(); await pause(400);
  await atHome("cycle sheet closed by X");

  // ── Cycle card: Follow another cycle, Adjust, scrub ──
  await page.click("[data-testid=cycle-add-person]"); await pause();
  ok(L("follow-another-cycle panel = 1 step"), (await page.locator("[data-testid=cycle-add-panel]").count()) === 1 && (await st()).hdepth === 1, await st());
  await back();
  ok(L("back closes the add panel"), (await page.locator("[data-testid=cycle-add-panel]").count()) === 0);
  await atHome("add panel back");
  await page.locator(`#cycle-card button[aria-label="${w.adjust}"]`).click(); await pause();
  ok(L("cycle Adjust = 1 step"), (await st()).layers.includes("cycle-adjust") && (await st()).hdepth === 1, await st());
  await back(); await atHome("cycle adjust back");
  await page.click("[data-testid=cycle-fold]"); await pause(700);
  await page.locator("#cycle-card [role=slider]").focus(); await page.keyboard.press("ArrowRight"); await pause();
  const scrubOn = () => page.locator('.cy-layer[data-on="true"] [data-testid=cycle-back]').count();
  ok(L("dial scrub = 1 step"), (await scrubOn()) === 1 && (await st()).hdepth === 1, await st());
  await back();
  ok(L("back = Back to today"), (await scrubOn()) === 0 && !(await st()).layers.includes("cycle-scrub"), await st());
  await atHome("scrub back");

  // ── UI close then back: no extra presses ──
  await settingsBtn.click(); await pause(); await settingsBtn.click(); await pause(400);
  await atHome("settings opened and closed by its button");
  await page.click("[data-tab=insights]"); await pause();
  await back(); await atHome("one back after a UI close");

  // ── Escape closes the top layer and keeps history in sync ──
  await settingsBtn.click(); await pause(); await page.keyboard.press("Escape"); await pause(400);
  await atHome("Escape closes Settings");

  // ── A layer opened without a tap gets its entry only at the next tap (Chrome skips entries pushed without one) ──
  await page.evaluate(() => window.__velaStore.getState().setSettingsOpen(true)); await pause();
  ok(L("programmatic open: no entry yet"), (await st()).settings && (await st()).hdepth === 0, await st());
  await page.mouse.click(5, 450); await pause();
  ok(L("next tap adds its entry"), (await st()).hdepth === 1, await st());
  await back(); await atHome("deferred entry back");

  // ── Confirm closed by its Cancel button, then back ──
  await settingsBtn.click(); await pause();
  await page.locator("section > button[aria-expanded]", { hasText: w.partners }).first().click(); await pause();
  await page.locator(`button[aria-label^="${w.rmPartner}"]`).first().click(); await pause();
  await page.locator("[role=alertdialog] button").last().click(); await pause(400);
  ok(L("Cancel button removes the confirm's entry"), (await st()).hdepth === 2 && (await page.locator("[role=alertdialog]").count()) === 0, await st());
  await back(); await back(); await atHome("two backs after a Cancel");

  // ── Rapid backs ──
  await page.click("[data-tab=calendar]"); await pause(); await settingsBtn.click(); await pause();
  await page.locator("section > button[aria-expanded]").first().click(); await pause();
  ok(L("3 steps before rapid backs"), (await st()).hdepth === 3, await st());
  await page.goBack({ waitUntil: "commit" }).catch(() => {}); await page.goBack({ waitUntil: "commit" }).catch(() => {}); await page.goBack({ waitUntil: "commit" }).catch(() => {});
  await pause(700);
  await atHome("3 rapid backs");
  // history.length keeps forward entries after a back; it never exceeds the deepest stack used (3 here).
  ok(L("history did not pile up over the whole run"), (await page.evaluate(() => history.length)) <= len0 + 3, { len0, now: await page.evaluate(() => history.length) });

  // ── Reload with layers open (and older-style entries) ──
  await settingsBtn.click(); await pause();
  await page.evaluate(() => history.pushState({ agStack: ["settings"] }, ""));
  await page.reload(); await page.waitForSelector("#unlock-pass, .ag-tabbar, [data-testid=bio-lock]", { timeout: 30000 }); await pause(1500);
  ok(L("after reload no stale entries on top"), (await page.evaluate(() => history.state?.velaBack ?? (history.state?.agStack ? 99 : 0))) === 0, await st());
  if (await page.locator("#unlock-pass").count()) {
    await page.fill("#unlock-pass", PASS); await page.click(`button[type=submit]:has-text("${w.unlock}")`);
    await page.waitForSelector(".ag-tabbar", { timeout: 30000 }); await pause(800);
  }
  await page.keyboard.press("Escape").catch(() => {}); await pause(300);
  await atHome("after reload + unlock");
  await page.click("[data-tab=history]"); await pause(); await back(); await atHome("history back after reload");

  // ── Lock: back never reveals the journal ──
  await settingsBtn.click(); await pause();
  await page.evaluate(() => window.__velaStore.getState().lock());
  await page.waitForSelector("#unlock-pass, [data-testid=bio-lock]", { timeout: 10000 }); await pause(600);
  ok(L("locking drops the open layers' entries"), (await page.evaluate(() => history.state?.velaBack ?? 0)) === 0, await st());
  await back();
  ok(L("back on the lock screen leaves the app (never opens the journal)"), !page.url().startsWith(URL), page.url());
  await page.goForward({ timeout: 15000 }).catch(() => {});
  await page.waitForSelector("#unlock-pass, [data-testid=bio-lock], .ag-tabbar", { timeout: 30000 }).catch(() => {}); await pause(800);
  ok(L("forward again: still locked"), (await page.locator(".ag-tabbar").count()) === 0 && (await page.locator("#unlock-pass, [data-testid=bio-lock]").count()) > 0);
  await page.fill("#unlock-pass", PASS); await page.click(`button[type=submit]:has-text("${w.unlock}")`);
  await page.waitForSelector(".ag-tabbar", { timeout: 30000 }); await pause(800);
  await page.keyboard.press("Escape").catch(() => {}); await pause(300);

  // ── Home with nothing open: back exits ──
  await atHome("before exit");
  await back();
  ok(L("Home: back leaves the app"), !page.url().startsWith(URL), page.url());
  ok(L("no page errors"), errors.length === 0, errors);
  await page.close();
}
await browser.close();
console.log(fails ? `back-nav: ${fails} FAIL` : "back-nav: ok");
process.exit(fails ? 1 : 0);
