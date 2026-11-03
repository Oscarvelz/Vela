// "Lock like Journey", end to end. Fake passphrases and fake data only; nothing printed but PASS/FAIL.
// Needs the VITE_E2E build in SERVE_DIR (default /workspace/work/ve/Vela) served at 127.0.0.1:8132, and the
// dd94a16 E2E build in OLD_BUILD for the migration part. WebAuthn needs a domain, so pages use localhost:8132.
// Leaving the app is simulated deterministically: document.visibilityState is driven by the test and the clock
// (Date.now) is moved forward instead of waiting. The fingerprint is Chrome's virtual authenticator.
//
// L  leave > 10 s locks · < 10 s doesn't · file picker doesn't · fingerprint sheet hiding the page doesn't loop
// R  update/quiet reload and pull-to-refresh don't lock · reload after Lock asks · SW update never reloads an open journal
// F  fresh launch: fingerprint only (no passphrase field), also in a brand-new page
// S  settings: app lock card, lock-after choices, app lock off = no gate
// M  migration from dd94a16 (fingerprint / none / locked with key dropped): data kept, no passphrase
// O  sign-out keeps the fingerprint (per account) · forget-device asks the passphrase, keeps the fingerprint
// P  screenshots (lock screen + settings, night/day, en/es)
import { chromium } from "/workspace/work/browser-test/node_modules/playwright-core/index.mjs";
import { appendFileSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const URL = process.env.AG_URL || "http://localhost:8132/Vela/";
const SERVE_DIR = process.env.SERVE_DIR || "/workspace/work/ve/Vela";
const NEW_BUILD = process.env.NEW_BUILD || "/workspace/work/vela/docs";
const OLD_BUILD = process.env.OLD_BUILD || "/workspace/work/ve-dd94/Vela";
const SHOTS = process.env.SHOTS || "/workspace/work/vela-journey-shots";
const ONLY = process.env.ONLY || "";
const RUN = (k) => !ONLY || ONLY.split(",").includes(k);
mkdirSync(SHOTS, { recursive: true });
const SB = "https://bybldbmwxucdvhfqspnf.supabase.co";
const PASS = "fake-orbit-lantern-42";
const SEC = 1000;

let fails = 0;
let passes = 0;
const ok = (n, c, x = "") => {
  if (c) passes++;
  else fails++;
  console.log(`${c ? "PASS" : "FAIL"}  ${n}${x !== "" ? "  — " + x : ""}`);
};

const browser = await chromium.launch({
  executablePath: "/workspace/work/browser-test/browsers/chromium_headless_shell-1155/chrome-linux/headless_shell",
  args: ["--no-sandbox", "--no-proxy-server"],
});

/* Runs in every page before the app: a movable clock, a test-driven visibility, and a counted fingerprint. */
function harness() {
  const real = Date.now.bind(Date);
  window.__skew = Number(localStorage.getItem("__skew") || 0);
  Date.now = () => real() + (window.__skew || 0);
  window.__adv = (ms) => {
    window.__skew += ms;
    localStorage.setItem("__skew", String(window.__skew));
  };
  let vis = "visible";
  Object.defineProperty(Document.prototype, "visibilityState", { get: () => vis, configurable: true });
  Object.defineProperty(Document.prototype, "hidden", { get: () => vis === "hidden", configurable: true });
  window.__setVis = (v) => {
    vis = v;
    document.dispatchEvent(new Event("visibilitychange"));
  };
  const get = navigator.credentials.get.bind(navigator.credentials);
  window.__gets = 0;
  navigator.credentials.get = async (opts) => {
    window.__gets++;
    // Credential deleted from the phone: Chrome shows "no passkey" and reports NotAllowedError once dismissed.
    if (localStorage.getItem("__noCred") === "1")
      return new Promise((_, rej) => setTimeout(() => rej(new DOMException("No matching passkey on this device.", "NotAllowedError")), 700));
    if (localStorage.getItem("__cancelBio") === "1")
      return new Promise((_, rej) => setTimeout(() => rej(new DOMException("The operation either timed out or was not allowed.", "NotAllowedError")), 600));
    if (localStorage.getItem("__promptHides") === "1") {
      // Like a phone: the fingerprint sheet hides the page while it is up (12 s here), and flickers as it closes.
      window.__setVis("hidden");
      window.__adv(12000);
      try {
        return await get(opts);
      } finally {
        setTimeout(() => window.__setVis("visible"), 40);
        setTimeout(() => window.__setVis("hidden"), 120);
        setTimeout(() => window.__setVis("visible"), 260);
      }
    }
    return get(opts);
  };
  document.addEventListener("input", (e) => {
    if (e.target?.id === "unlock-pass" || e.target?.id === "cloud-pass") window.__typedPass = (window.__typedPass || 0) + 1;
  }, true);
}

async function newContext(opts = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 900 },
    deviceScaleFactor: 2,
    locale: opts.locale || "en-US",
    serviceWorkers: opts.sw ? "allow" : "block",
  });
  await ctx.addInitScript(harness);
  if (opts.route) await ctx.route(`${SB}/**`, opts.route);
  else await ctx.route(`${SB}/**`, (r) => r.abort());
  return ctx;
}
async function authenticator(page, creds = []) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable", { enableUI: false });
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", ctap2Version: "ctap2_1", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true },
  });
  for (const credential of creds) await cdp.send("WebAuthn.addCredential", { authenticatorId, credential });
  return { cdp, authenticatorId, creds: async () => (await cdp.send("WebAuthn.getCredentials", { authenticatorId })).credentials };
}
async function openPage(ctx, { auth = false, creds = [], url = URL } = {}) {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("pageerror", String(e).slice(0, 200)));
  const a = auth ? await authenticator(p, creds) : null;
  await p.goto(url);
  await p.waitForSelector("#create-pass, #unlock-pass, .ag-tabbar, [data-testid=bio-lock], #cloud-pass", { timeout: 30000 });
  return { p, a };
}
async function create(p) {
  await p.fill("#name", "Tester");
  await p.fill("#create-pass", PASS);
  await p.fill("#create-pass2", PASS);
  await p.check("#pass-ack");
  await p.click("form:has(#create-pass) button[type=submit]");
  await p.waitForSelector(".ag-tabbar", { timeout: 30000 });
}
async function acceptOffer(p) {
  await p.waitForSelector('[data-testid="bio-offer"]', { timeout: 10000 });
  await p.click('[data-testid="bio-offer-yes"]');
  await p.waitForSelector('[data-testid="bio-offer"]', { state: "detached", timeout: 15000 });
}
async function dismissOffer(p) {
  if (await p.waitForSelector('[data-testid="bio-offer"]', { timeout: 2500 }).then(() => true, () => false)) {
    await p.click('[data-testid="bio-offer-later"]');
    await p.waitForTimeout(200);
  }
}
const isOpen = (p) => p.evaluate(() => Boolean(window.__velaStore?.getState().unlocked));
const opensSoon = (p, ms = 15000) => p.waitForSelector(".ag-tabbar", { timeout: ms }).then(() => true, () => false);
const gets = (p) => p.evaluate(() => window.__gets || 0);
const sessions = (p) => p.evaluate(() => window.__velaStore.getState().journal.sessions.length);
const ls = (p, k) => p.evaluate((key) => localStorage.getItem(key), k);
/* leave the app for `ms` (by the app's clock) and come back */
async function away(p, ms) {
  await p.evaluate((v) => {
    window.__setVis("hidden");
    window.__adv(v);
    window.__setVis("visible");
  }, ms);
  await p.waitForTimeout(150);
}
/** Watches whether the passphrase field ever appears from now on. */
async function watchPass(p) {
  await p.evaluate(() => {
    window.__sawPass = false;
    const mo = new MutationObserver(() => {
      if (document.querySelector("#unlock-pass")) window.__sawPass = true;
    });
    mo.observe(document.body, { childList: true, subtree: true });
  });
}
/** The fingerprint was asked (at least one prompt since `before`) and opened the journal. */
const fingerOpens = async (p, before = 0) => (await opensSoon(p)) && (await gets(p)) - before >= 1;
const sawPass = (p) => p.evaluate(() => Boolean(window.__sawPass || document.querySelector("#unlock-pass")));
async function openSection(p, en) {
  if (!(await p.isVisible(`button:has-text("${en}")`))) await p.locator('button[aria-label="Open settings"], button[aria-label="Abrir ajustes"]').first().dispatchEvent("click");
  const btn = p.locator(`button:has-text("${en}")`).first();
  await btn.waitFor({ timeout: 10000 });
  if ((await btn.getAttribute("aria-expanded")) !== "true") await btn.click();
  await p.waitForTimeout(350);
}
function serve(dir) {
  rmSync(SERVE_DIR, { recursive: true, force: true });
  cpSync(dir, SERVE_DIR, { recursive: true });
}

serve(NEW_BUILD);

/* ───────────── L + R + F + S: one device with a fingerprint ───────────── */
if (RUN("L")) {
  const ctx = await newContext();
  let { p, a } = await openPage(ctx, { auth: true });
  await create(p);
  await acceptOffer(p);
  ok("L setup offer enrols the fingerprint (app lock credential saved per owner)", Boolean(await ls(p, "vela.lock.local")) && (await ls(p, "vela.lock.owner")) === "local");
  ok("L the passphrase is not stored anywhere readable", !JSON.stringify(await p.evaluate(() => ({ ...localStorage }))).includes(PASS));
  await p.evaluate(() => {
    const s = window.__velaStore.getState();
    s.quickLog();
    s.quickLog();
  });
  await p.waitForTimeout(400);
  const n0 = await sessions(p);

  // leave for 11 s → locked behind the fingerprint, which opens it with nothing typed
  await watchPass(p);
  let g = await gets(p);
  await p.evaluate(() => {
    window.__setVis("hidden");
    window.__adv(11000);
    window.__setVis("visible");
  });
  ok("L away 11 s → locks", !(await isOpen(p)));
  ok("L … the lock screen asks for the fingerprint (no passphrase field)", await p.waitForSelector('[data-testid="bio-lock"][data-mode="gate"]', { timeout: 5000 }).then(() => true, () => false));
  ok("L … fingerprint opens it", await opensSoon(p));
  ok("L … exactly one fingerprint prompt", (await gets(p)) - g === 1, `prompts=${(await gets(p)) - g}`);
  ok("L … no passphrase field at any point", !(await sawPass(p)));
  ok("L … data intact", (await sessions(p)) === n0, `${await sessions(p)}/${n0}`);

  // brief blip
  g = await gets(p);
  await away(p, 5 * SEC);
  ok("L away 5 s (notification shade) → stays open", (await isOpen(p)) && (await gets(p)) === g);
  await away(p, 9.5 * SEC);
  ok("L away 9.5 s → stays open", await isOpen(p));

  // file picker opened from inside Vela (Import backup)
  await openSection(p, "Data & Backup");
  const chooser = p.waitForEvent("filechooser", { timeout: 5000 }).catch(() => null);
  await p.click('button:has-text("Import backup")');
  const fc = await chooser;
  ok("L import opens the system file picker", Boolean(fc));
  await away(p, 45 * SEC);
  ok("L file picker (45 s away) → stays open", await isOpen(p));
  await away(p, 11 * SEC);
  ok("L … the next real leave still locks", !(await isOpen(p)));
  await opensSoon(p);

  // the fingerprint sheet hides the page (and flickers as it closes): no re-lock, no loop
  await p.evaluate(() => localStorage.setItem("__promptHides", "1"));
  await p.waitForTimeout(2200);
  g = await gets(p);
  await p.locator('.ag-header [data-testid="header-lock"]').click();
  ok("L manual Lock button locks", await p.waitForSelector('[data-testid="bio-lock"]', { timeout: 5000 }).then(() => true, () => false));
  ok("L prompt-induced hide: opens after the sheet", await opensSoon(p));
  await p.waitForTimeout(3000);
  ok("L prompt-induced hide: still open 3 s later (no re-lock)", await isOpen(p));
  ok("L prompt-induced hide: one prompt only (no loop)", (await gets(p)) - g === 1, `prompts=${(await gets(p)) - g}`);
  await p.evaluate(() => localStorage.removeItem("__promptHides"));
  await p.waitForTimeout(2200);

  /* R: reloads */
  g = await gets(p);
  await p.evaluate(() => {
    window.__marker = 1;
    sessionStorage.setItem("vela-quiet-boot", String(Date.now()));
    location.reload();
  });
  await p.waitForSelector(".ag-tabbar, [data-testid=bio-lock]", { timeout: 20000 });
  await p.waitForTimeout(500);
  ok("R silent update reload → open, no prompt", (await isOpen(p)) && (await gets(p)) === 0);
  await p.reload();
  await p.waitForSelector(".ag-tabbar, [data-testid=bio-lock]", { timeout: 20000 });
  await p.waitForTimeout(500);
  ok("R pull-to-refresh while open → open, no prompt", (await isOpen(p)) && (await gets(p)) === 0);
  await p.evaluate(() => localStorage.setItem("__cancelBio", "1"));
  await p.evaluate(() => window.__velaStore.getState().lock());
  await p.waitForTimeout(300);
  await p.reload();
  await watchPass(p);
  await p.waitForTimeout(1500);
  ok("R reload from the lock screen → stays locked, asks for the fingerprint", !(await isOpen(p)) && (await gets(p)) >= 1 && (await p.isVisible('[data-testid="bio-lock"]')));
  await p.evaluate(() => localStorage.removeItem("__cancelBio"));
  await p.click('[data-testid="bio-unlock"]');
  ok("R … the fingerprint opens it, no passphrase field", (await opensSoon(p)) && !(await sawPass(p)));
  await p.waitForTimeout(400);
  await p.waitForTimeout(2200);
  await p.evaluate(() => {
    window.__setVis("hidden");
    window.__adv(15000);
  });
  await p.reload();
  ok("R reloaded after 15 s in the background → asks (fingerprint)", (await opensSoon(p)) && (await gets(p)) === 1, `prompts=${await gets(p)}`);

  /* F: fresh launch */
  await p.evaluate(() => window.__adv(2000));
  await p.goto(URL);
  await watchPass(p);
  ok("F fresh launch → the fingerprint opens it", (await opensSoon(p)) && (await gets(p)) === 1, `prompts=${await gets(p)}`);
  ok("F … no passphrase field", !(await sawPass(p)));
  // a brand-new page (the installed app relaunched), same phone credential
  const creds = await a.creds();
  await p.close();
  ({ p, a } = await openPage(ctx, { auth: true, creds }));
  await watchPass(p);
  ok("F new page (relaunch) → the fingerprint opens it, nothing typed", (await opensSoon(p)) && (await gets(p)) === 1 && !(await sawPass(p)) && (await p.evaluate(() => window.__typedPass || 0)) === 0);
  ok("F … data intact", (await sessions(p)) === n0);

  /* fallback: fingerprint keeps failing → re-enrol offered first, passphrase last */
  await p.evaluate(() => localStorage.setItem("__cancelBio", "1"));
  await p.locator('.ag-header [data-testid="header-lock"]').click();
  await p.waitForSelector('[data-testid="bio-lock"]', { timeout: 5000 });
  for (let i = 0; i < 2; i++) {
    await p.waitForTimeout(900);
    const b = p.locator('[data-testid="bio-unlock"]');
    if ((await b.count()) && !(await p.isVisible('[data-testid="gate-fall"]'))) await b.click().catch(() => undefined);
  }
  ok("L 3 failed fingerprints → offers to set it up again", await p.waitForSelector('[data-testid="gate-reenrol"]', { timeout: 8000 }).then(() => true, () => false));
  ok("L … passphrase only as the last option (no field yet)", (await p.isVisible('[data-testid="use-pass"]')) && !(await p.isVisible("#unlock-pass")));
  await p.screenshot({ path: `${SHOTS}/lock-fallback-night-en.png` });
  await p.evaluate(() => localStorage.removeItem("__cancelBio"));
  const before = await ls(p, "vela.lock.local");
  await p.click('[data-testid="gate-reenrol"]');
  ok("L re-enrol from the lock screen opens the journal", await opensSoon(p));
  ok("L … with a new credential", (await ls(p, "vela.lock.local")) !== before);
  await p.waitForTimeout(2200);
  // credential gone (deleted from the phone): Chrome answers NotAllowedError at once → same fallback
  await p.evaluate(() => localStorage.setItem("__noCred", "1"));
  await p.locator('.ag-header [data-testid="header-lock"]').click();
  await p.waitForSelector('[data-testid="bio-lock"]', { timeout: 5000 });
  for (let i = 0; i < 4 && !(await p.isVisible('[data-testid="gate-fall"]')); i++) {
    await p.waitForTimeout(700);
    const b = p.locator('[data-testid="bio-unlock"]');
    if ((await b.count()) && !(await p.isVisible('[data-testid="gate-fall"]'))) await b.click().catch(() => undefined);
  }
  ok("L credential gone → re-enrol offered", await p.waitForSelector('[data-testid="gate-reenrol"]', { timeout: 10000 }).then(() => true, () => false));
  await p.click('[data-testid="use-pass"]');
  await p.fill("#unlock-pass", PASS);
  await p.click('button[type=submit]:has-text("Unlock")');
  ok("L … last resort passphrase still opens", await opensSoon(p));
  await p.evaluate(() => localStorage.removeItem("__noCred"));
  await p.click('button[aria-label="Open settings"]').catch(() => undefined);
  await openSection(p, "Privacy & Security");
  await p.click('[data-testid="lock-redo"]');
  await p.waitForTimeout(1500);
  await p.click('button[aria-label="Open settings"]').catch(() => undefined);
  await p.waitForTimeout(300);

  /* S: settings */
  await openSection(p, "Privacy & Security");
  ok("S app lock card shown, on, enrolled", (await p.getAttribute('[data-testid="app-lock"]', "data-on")) === "true" && (await p.getAttribute('[data-testid="app-lock"]', "data-enrolled")) === "true");
  ok("S lock after leaving: 10 s is the default", (await p.getAttribute('[data-after="10000"]', "aria-checked")) === "true");
  ok("S passphrase note: only for encryption", /only for encryption/i.test((await p.textContent('[data-testid="pass-note"]')) || ""));
  ok("S old 'Ask for my passphrase' picker is gone", (await p.locator("[data-ask]").count()) === 0);
  await p.click('[data-after="60000"]');
  await away(p, 30 * SEC);
  ok("S 1 min: away 30 s → open", await isOpen(p));
  await away(p, 61 * SEC);
  ok("S 1 min: away 61 s → locks", !(await isOpen(p)));
  await opensSoon(p);
  await openSection(p, "Privacy & Security");
  await p.click('[data-after="0"]');
  await p.waitForTimeout(2200);
  await p.evaluate(() => window.__setVis("hidden"));
  ok("S immediately: locks as soon as it is hidden", !(await isOpen(p)));
  await p.evaluate(() => window.__setVis("visible"));
  await opensSoon(p);
  await openSection(p, "Privacy & Security");
  await p.click('[data-after="10000"]');
  // off
  await p.click('[data-testid="app-lock"] button[role=switch]');
  await p.waitForTimeout(300);
  ok("S app lock off: no Lock button in the header", (await p.locator('.ag-header [data-testid="header-lock"]').count()) === 0);
  await away(p, 5 * 60 * SEC);
  ok("S app lock off: away 5 min → still open", await isOpen(p));
  await p.goto(URL);
  await p.waitForSelector(".ag-tabbar, [data-testid=bio-lock], #unlock-pass", { timeout: 15000 });
  ok("S app lock off: fresh launch opens straight away (key still on the device)", (await isOpen(p)) && (await gets(p)) === 0);
  await openSection(p, "Privacy & Security");
  await p.click('[data-testid="app-lock"] button[role=switch]');
  await p.waitForTimeout(300);
  await p.goto(URL);
  ok("S app lock back on: fresh launch asks for the fingerprint again", await fingerOpens(p));
  await ctx.close();
}

/* R: a real service-worker update while the journal is open */
if (RUN("R")) {
  const ctx = await newContext({ sw: true });
  const { p } = await openPage(ctx, { auth: true });
  await p.waitForFunction(() => navigator.serviceWorker.controller || navigator.serviceWorker.ready.then(() => true), null, { timeout: 15000 }).catch(() => undefined);
  await p.waitForTimeout(1500);
  await p.reload();
  await p.waitForSelector("#create-pass", { timeout: 20000 });
  await create(p);
  await acceptOffer(p);
  await p.waitForTimeout(500);
  const sw = readFileSync(`${SERVE_DIR}/sw.js`, "utf8");
  writeFileSync(`${SERVE_DIR}/sw.js`, sw.replace(/const VERSION = "([^"]+)"/, 'const VERSION = "$1-next"'));
  await p.evaluate(async () => {
    window.__marker = "still-here";
    const reg = await navigator.serviceWorker.getRegistration();
    await reg?.update();
    const next = reg?.installing || reg?.waiting;
    if (next && next.state !== "activated")
      await new Promise((res) => {
        next.addEventListener("statechange", () => next.state === "activated" && res());
        setTimeout(res, 15000);
      });
  });
  await p.waitForTimeout(1500);
  if (process.env.DEBUG) console.log("DBG", await p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return JSON.stringify({ ctrl: Boolean(navigator.serviceWorker.controller), active: r?.active?.state, waiting: Boolean(r?.waiting), installing: Boolean(r?.installing) }); }), await p.evaluate(() => fetch("sw.js").then((r) => r.text()).then((t) => t.slice(0, 160))));
  const swNow = await p.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.scriptURL || "");
  ok("R SW update activated while the journal is open", Boolean(swNow));
  ok("R … the open journal was not reloaded or locked", (await isOpen(p)) && (await p.evaluate(() => window.__marker)) === "still-here");
  const g = await gets(p);
  await p.locator('.ag-header [data-testid="header-lock"]').click();
  await p.waitForFunction(() => !window.__marker, null, { timeout: 10000 }).catch(() => undefined);
  ok("R … the update is applied once it locks (reloaded on the lock screen)", (await p.evaluate(() => window.__marker)) !== "still-here");
  ok("R … and the lock screen still asks only for the fingerprint", await opensSoon(p));
  void g;
  writeFileSync(`${SERVE_DIR}/sw.js`, sw);
  await ctx.close();
}

/* ───────────── M: migration from dd94a16 ───────────── */
if (RUN("M")) {
  // M1: fingerprint enrolled on dd94a16, journal open
  serve(OLD_BUILD);
  let ctx = await newContext();
  let { p } = await openPage(ctx, { auth: true });
  await create(p);
  await acceptOffer(p);
  await p.evaluate(() => {
    const s = window.__velaStore.getState();
    s.quickLog();
    s.quickLog();
  });
  await p.waitForTimeout(600);
  ok("M1 dd94a16: fingerprint enrolled (sealed passphrase)", Boolean(await ls(p, "vela-fingerprint")));
  serve(NEW_BUILD);
  await p.goto(URL);
  await watchPass(p);
  ok("M1 after update: the fingerprint opens it (gate), not the passphrase", await fingerOpens(p));
  ok("M1 … no passphrase field", !(await sawPass(p)));
  ok("M1 … data kept", (await sessions(p)) === 2, String(await sessions(p)));
  ok("M1 … old fingerprint became the app lock (no setup offer)", Boolean(await ls(p, "vela.lock.local")) && !(await p.waitForSelector('[data-testid="bio-offer"]', { timeout: 2000 }).then(() => true, () => false)));
  ok("M1 … old 'Ask for my passphrase' setting removed", (await ls(p, "vela_ask_pass")) === null);
  await ctx.close();

  // M2: no fingerprint on dd94a16 (and its strictest setting "every time")
  serve(OLD_BUILD);
  ctx = await newContext();
  ({ p } = await openPage(ctx));
  await create(p);
  await dismissOffer(p);
  await p.evaluate(() => {
    localStorage.setItem("vela_ask_pass", "open");
    window.__velaStore.getState().quickLog();
  });
  await p.waitForTimeout(600);
  serve(NEW_BUILD);
  await p.goto(URL);
  await watchPass(p);
  await p.waitForSelector(".ag-tabbar, #unlock-pass, [data-testid=bio-lock]", { timeout: 15000 });
  await p.waitForTimeout(500);
  ok("M2 no fingerprint before: opens with the parked key, no passphrase", (await isOpen(p)) && !(await sawPass(p)));
  ok("M2 … data kept", (await sessions(p)) === 1);
  await ctx.close();

  // M3: fingerprint enrolled, but locked with dd94a16's Lock (which wiped the parked key)
  serve(OLD_BUILD);
  ctx = await newContext();
  let a;
  ({ p, a } = await openPage(ctx, { auth: true }));
  await create(p);
  await acceptOffer(p);
  await p.evaluate(() => window.__velaStore.getState().quickLog());
  await p.waitForTimeout(600);
  await p.evaluate(() => window.__velaStore.getState().lock());
  await p.waitForTimeout(600);
  serve(NEW_BUILD);
  await p.goto(URL);
  await watchPass(p);
  ok("M3 key wiped before: the fingerprint opens it (sealed passphrase), nothing typed", (await opensSoon(p)) && !(await sawPass(p)));
  ok("M3 … data kept", (await sessions(p)) === 1);
  await p.waitForTimeout(800);
  const g3 = await gets(p);
  await p.evaluate(() => window.__velaStore.getState().lock());
  ok("M3 … from then on Lock is the fingerprint gate (key parked again)", (await fingerOpens(p, g3)) && !(await sawPass(p)));
  void a;
  await ctx.close();
}

/* ───────────── O: sign-out keeps the fingerprint; forget-device asks the passphrase ───────────── */
if (RUN("O")) {
  const UID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const user = { id: UID, aud: "authenticated", role: "authenticated", email: "fake.journey@example.com", app_metadata: { provider: "email" }, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 3600 * 24 * 60;
  const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: UID, email: user.email, role: "authenticated", aud: "authenticated", exp, iat: exp - 3600 })}.ZmFrZQ`;
  const session = JSON.stringify({ access_token: jwt, token_type: "bearer", expires_in: 86400, expires_at: exp, refresh_token: "fake-refresh", user });
  let row = null;
  const route = async (r) => {
    const req = r.request();
    const u = new globalThis.URL(req.url());
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
    const json = (status, data) => r.fulfill({ status, contentType: "application/json", headers: cors, body: JSON.stringify(data) });
    if (req.method() === "OPTIONS") return r.fulfill({ status: 204, headers: cors });
    if (u.pathname === "/auth/v1/user") return json(200, user);
    if (u.pathname === "/auth/v1/logout") return r.fulfill({ status: 204, headers: cors });
    if (u.pathname !== "/rest/v1/vela_vault") return json(404, {});
    if (req.method() === "GET") return json(200, row ? [row] : []);
    const data = JSON.parse(req.postData() || "{}");
    if (req.method() === "POST") {
      row = { ...data, revision: 1, updated_at: new Date().toISOString() };
      return json(201, [{ revision: 1 }]);
    }
    if (req.method() === "PATCH") {
      row = { ...row, ...data, updated_at: new Date().toISOString() };
      return json(200, [{ revision: row.revision }]);
    }
    return json(405, {});
  };
  const ctx = await newContext({ route });
  await ctx.addInitScript((s) => {
    if (!localStorage.getItem("vela-auth") && !sessionStorage.getItem("__signedOut")) localStorage.setItem("vela-auth", s);
  }, session);
  const { p } = await openPage(ctx, { auth: true });
  await create(p);
  await acceptOffer(p);
  await p.evaluate(() => window.__velaStore.getState().quickLog());
  await p.waitForTimeout(500);
  ok("O signed in: the fingerprint belongs to the account", Boolean(await ls(p, `vela.lock.${UID}`)) && (await ls(p, "vela.lock.owner")) === UID);
  await openSection(p, "Data & Backup");
  await p.click('button:has-text("Sync now")');
  await p.waitForFunction(() => document.querySelector('[data-testid="cloud-status"]')?.textContent?.includes("Saved to your account"), null, { timeout: 20000 }).catch(() => undefined);
  ok("O synced (encrypted row in the mock account)", Boolean(row?.ciphertext));
  // sign out, keep the journal
  await p.evaluate(() => sessionStorage.setItem("__signedOut", "1"));
  await p.click('[data-testid="sign-out"]');
  await p.waitForSelector('[data-testid="sign-out-dialog"]');
  await p.waitForFunction(() => !window.__velaStore.getState().toast, null, { timeout: 6000 }).catch(() => undefined);
  await p.screenshot({ path: `${SHOTS}/signout-dialog-night-en.png` });
  await p.click('[role=alertdialog] button:has-text("Sign out")');
  ok("O sign out: journal locked (no longer open)", await p.waitForFunction(() => !window.__velaStore.getState().unlocked, null, { timeout: 10000 }).then(() => true, () => false));
  ok("O sign out keeps the fingerprint enrolment", Boolean(await ls(p, `vela.lock.${UID}`)));
  await opensSoon(p);
  ok("O … and the key stays: fingerprint opens it, no passphrase", await isOpen(p));
  // sign back in
  await p.evaluate((s) => {
    sessionStorage.removeItem("__signedOut");
    localStorage.setItem("vela-auth", s);
  }, session);
  await p.goto(URL);
  await watchPass(p);
  ok("O signed back in: the fingerprint opens it, no passphrase", (await fingerOpens(p)) && !(await sawPass(p)));
  ok("O … not asked to set the fingerprint up again", !(await p.waitForSelector('[data-testid="bio-offer"]', { timeout: 2500 }).then(() => true, () => false)));
  // sign out and remove from this device
  await openSection(p, "Data & Backup");
  await p.evaluate(() => sessionStorage.setItem("__signedOut", "1"));
  await p.click('[data-testid="sign-out"]');
  await p.check("#sign-out-forget");
  await p.click('[role=alertdialog] button:has-text("Sign out")');
  await p.waitForSelector("#create-pass", { timeout: 10000 });
  const keyLeft = await p.evaluate(() => new Promise((res) => {
    const r = indexedDB.open("vela-grace", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("k");
    r.onsuccess = () => {
      const c = r.result.transaction("k", "readonly").objectStore("k").count();
      c.onsuccess = () => res(c.result);
    };
  }));
  ok("O forget device: journal key wiped", keyLeft === 0);
  ok("O forget device: the fingerprint enrolment survives", Boolean(await ls(p, `vela.lock.${UID}`)));
  await p.evaluate((s) => {
    sessionStorage.removeItem("__signedOut");
    localStorage.setItem("vela-auth", s);
  }, session);
  await p.goto(URL);
  ok("O after forget + sign in: asks for the passphrase", await p.waitForSelector("#cloud-pass", { timeout: 15000 }).then(() => true, () => false));
  await p.fill("#cloud-pass", PASS);
  await p.click('button[type=submit]:has-text("Open my journal")');
  ok("O … the passphrase opens it", await opensSoon(p));
  ok("O … data back from the account", (await sessions(p)) === 1);
  // The passphrase was just typed and this phone's fingerprint holds no sealed copy for this journal: the
  // one-tap "keep your fingerprint as the key" is offered (reset fix, Nov 1 2026), not a fresh setup.
  ok("O … only the one-tap re-seal is offered (fingerprint already set up)", await p.waitForSelector('[data-testid="bio-offer"][data-reseal="true"]', { timeout: 4000 }).then(() => true, () => false));
  await p.click('[data-testid="bio-offer-later"]').catch(() => undefined);
  await p.waitForTimeout(2200);
  const go = await gets(p);
  await p.locator('.ag-header [data-testid="header-lock"]').click();
  ok("O … Lock is the fingerprint again, which opens it", await fingerOpens(p, go));
  await ctx.close();
}

/* ───────────── P: screenshots ───────────── */
if (RUN("P")) for (const [mode, lang] of [["night", "en"], ["day", "en"], ["night", "es"], ["day", "es"]]) {
  const ctx = await newContext({ locale: lang === "es" ? "es-ES" : "en-US" });
  const { p } = await openPage(ctx, { auth: true });
  await create(p);
  await acceptOffer(p);
  await p.evaluate(([m, l]) => {
    const s = window.__velaStore.getState();
    if (s.journal.settings.mode !== m) s.toggleMode();
    s.setLanguage(l);
  }, [mode, lang]);
  await p.waitForFunction(() => !window.__velaStore.getState().toast, null, { timeout: 6000 }).catch(() => undefined);
  await openSection(p, lang === "es" ? "Privacidad" : "Privacy & Security");
  const card = p.locator('[data-testid="app-lock"]');
  await card.evaluate((e) => e.scrollIntoView({ block: "start" }));
  await p.evaluate(() => window.scrollBy(0, -90));
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${SHOTS}/settings-${mode}-${lang}.png` });
  // lock screen (sheet held open so the waiting state shows)
  await p.evaluate(() => localStorage.setItem("__cancelBio", "1"));
  await p.evaluate(() => window.__velaStore.getState().lock());
  await p.waitForSelector('[data-testid="bio-lock"]');
  await p.waitForTimeout(1600);
  await p.screenshot({ path: `${SHOTS}/lock-${mode}-${lang}.png` });
  await ctx.close();
}

await browser.close();
console.log(`\n${passes}/${passes + fails} passed`);
appendFileSync("/dev/null", "");
process.exit(fails ? 1 : 0);
