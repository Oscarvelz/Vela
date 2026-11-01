// "Vela looks like it reset" — regression test (Nov 1 2026). Fake passphrases, fake data, a mock account.
// Prints PASS/FAIL lines only; no journal data, keys or passphrases are ever printed.
//
// Each block reproduces one way an existing user on a real phone ended up at the passphrase or setup screen
// instead of the fingerprint. Run against the 5ee372a E2E build (NEW_BUILD=/workspace/work/ve-5ee3/Vela) the
// marked checks fail; against the fixed build they pass.
//
// A  migration guard: dd94a16 / 013df35-era builds, fingerprint enrolled, signed in → update → fingerprint
// B  the phone didn't hand back the fingerprint (PRF) key once → 5ee372a deleted the sealed passphrase for good
// C  IndexedDB refused right after the update → 5ee372a showed the create-journal screen (and stayed broken)
// D  journal storage lost, seal kept, session restoring slowly → 5ee372a flashed setup, then asked the passphrase
// E  first sign-in, passphrase typed, an old enrolment on the phone → 5ee372a never offered the fingerprint
// F  offline boot → fingerprint; offline with no journal here → no setup screen
// G  service-worker update from dd94a16 → storage intact, fingerprint
// H  enrolment saved under another owner (account not known yet) → 5ee372a skipped the fingerprint
// I  storage persistence requested at boot · K journal id drift · J diagnostics without secrets
import { chromium } from "/workspace/work/browser-test/node_modules/playwright-core/index.mjs";
import { cpSync, readFileSync, rmSync } from "node:fs";

const URL = process.env.AG_URL || "http://localhost:8132/Vela/";
const SERVE_DIR = process.env.SERVE_DIR || "/workspace/work/ve/Vela";
const NEW_BUILD = process.env.NEW_BUILD || "/workspace/work/ve-new/Vela";
const DD94 = process.env.DD94_BUILD || "/workspace/work/ve-dd94/Vela";
const OLD = process.env.OLD_BUILD || "/workspace/work/ve-old/Vela";
const ONLY = process.env.ONLY || "";
const RUN = (k) => !ONLY || ONLY.split(",").includes(k);
const SB = "https://bybldbmwxucdvhfqspnf.supabase.co";
const PASS = "fake-orbit-lantern-42";
const UID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const EMAIL = "fake.reset@example.com";

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

/* Runs in every page before the app. */
function harness() {
  const real = Date.now.bind(Date);
  window.__skew = Number(localStorage.getItem("__skew") || 0);
  Date.now = () => real() + (window.__skew || 0);
  window.__gets = 0;
  const get = navigator.credentials.get.bind(navigator.credentials);
  navigator.credentials.get = async (opts) => {
    window.__gets++;
    if (localStorage.getItem("__cancelBio") === "1")
      return new Promise((_, rej) => setTimeout(() => rej(new DOMException("The operation either timed out or was not allowed.", "NotAllowedError")), 600));
    const r = await get(opts);
    const n = Number(localStorage.getItem("__noPrf") || 0);
    if (n > 0 && opts?.publicKey?.extensions?.prf) {
      // The phone's passkey provider didn't hand back the PRF output this time.
      localStorage.setItem("__noPrf", String(n - 1));
      return { type: "public-key", id: r.id, rawId: r.rawId, response: r.response, authenticatorAttachment: "platform", getClientExtensionResults: () => ({}) };
    }
    return r;
  };
  // IndexedDB refusing the journal store for a moment (n opens), as phones sometimes do right after launch.
  const open = IDBFactory.prototype.open;
  IDBFactory.prototype.open = function (name, ...rest) {
    const n = Number(localStorage.getItem("__idbFail") || 0);
    if (name === "vela-vault" && n > 0) {
      localStorage.setItem("__idbFail", String(n - 1));
      throw new DOMException("Internal error opening backing store for indexedDB.open.", "UnknownError");
    }
    return open.call(this, name, ...rest);
  };
  if (localStorage.getItem("__offline") === "1") Object.defineProperty(Navigator.prototype, "onLine", { get: () => false, configurable: true });
  window.__persistCalls = 0;
  if (navigator.storage?.persist) {
    const persist = navigator.storage.persist.bind(navigator.storage);
    navigator.storage.persist = () => {
      window.__persistCalls++;
      return persist();
    };
  }
  window.__seen = { unlock: false, cloud: false, create: false };
  const mark = () => {
    if (document.querySelector("#unlock-pass")) window.__seen.unlock = true;
    if (document.querySelector("#cloud-pass")) window.__seen.cloud = true;
    if (document.querySelector("#create-pass")) window.__seen.create = true;
  };
  new MutationObserver(mark).observe(document, { childList: true, subtree: true });
}

/* Mock account (Supabase REST + auth), optionally slow. */
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const user = { id: UID, aud: "authenticated", role: "authenticated", email: EMAIL, app_metadata: { provider: "email" }, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
function sessionJson(expired = false) {
  const exp = Math.floor(Date.now() / 1000) + (expired ? -600 : 3600 * 24 * 60);
  const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: UID, email: EMAIL, role: "authenticated", aud: "authenticated", exp, iat: exp - 3600 })}.ZmFrZQ`;
  return JSON.stringify({ access_token: jwt, token_type: "bearer", expires_in: 86400, expires_at: exp, refresh_token: "fake-refresh", user });
}
function account() {
  const st = { row: null, delay: 0 };
  st.route = async (r) => {
    const req = r.request();
    const u = new globalThis.URL(req.url());
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
    const json = (status, data) => r.fulfill({ status, contentType: "application/json", headers: cors, body: JSON.stringify(data) });
    if (req.method() === "OPTIONS") return r.fulfill({ status: 204, headers: cors });
    if (st.delay) await new Promise((res) => setTimeout(res, st.delay));
    if (u.pathname === "/auth/v1/user") return json(200, user);
    if (u.pathname === "/auth/v1/token") return json(200, JSON.parse(sessionJson()));
    if (u.pathname === "/auth/v1/logout") return r.fulfill({ status: 204, headers: cors });
    if (u.pathname !== "/rest/v1/vela_vault") return json(404, {});
    if (req.method() === "GET") return json(200, st.row ? [st.row] : []);
    const data = JSON.parse(req.postData() || "{}");
    if (req.method() === "POST") {
      st.row = { ...data, revision: 1, updated_at: new Date().toISOString() };
      return json(201, [{ revision: 1 }]);
    }
    if (req.method() === "PATCH") {
      st.row = { ...st.row, ...data, updated_at: new Date().toISOString() };
      return json(200, [{ revision: st.row.revision }]);
    }
    return json(405, {});
  };
  return st;
}

async function newContext({ acct = null, signed = false, sw = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 1, locale: "en-US", serviceWorkers: sw ? "allow" : "block" });
  await ctx.addInitScript(harness);
  if (acct) await ctx.route(`${SB}/**`, acct.route);
  else await ctx.route(`${SB}/**`, (r) => r.abort());
  if (signed) await ctx.addInitScript((s) => {
    if (!localStorage.getItem("vela-auth") && !localStorage.getItem("__noAuth")) localStorage.setItem("vela-auth", s);
  }, sessionJson());
  return ctx;
}
async function authenticator(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable", { enableUI: false });
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", ctap2Version: "ctap2_1", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true },
  });
}
const ANY = "#create-pass, #unlock-pass, .ag-tabbar, [data-testid=bio-lock], #cloud-pass, [data-testid=finding], [data-testid=store-retry]";
async function openPage(ctx) {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("pageerror", String(e).slice(0, 160)));
  await authenticator(p);
  await p.goto(URL);
  await p.waitForSelector(ANY, { timeout: 30000 });
  return p;
}
async function create(p) {
  await p.fill("#name", "Tester");
  await p.fill("#create-pass", PASS);
  await p.fill("#create-pass2", PASS);
  await p.check("#pass-ack");
  await p.click("form:has(#create-pass) button[type=submit]");
  await p.waitForSelector(".ag-tabbar", { timeout: 30000 });
}
const offerShown = (p, ms = 4000) => p.waitForSelector('[data-testid="bio-offer"]', { timeout: ms }).then(() => true, () => false);
async function acceptOffer(p) {
  await p.waitForSelector('[data-testid="bio-offer"]', { timeout: 10000 });
  await p.click('[data-testid="bio-offer-yes"]');
  await p.waitForSelector('[data-testid="bio-offer"]', { state: "detached", timeout: 15000 });
}
const opensSoon = (p, ms = 15000) => p.waitForSelector(".ag-tabbar", { timeout: ms }).then(() => true, () => false);
const isOpen = (p) => p.evaluate(() => Boolean(window.__velaStore?.getState().unlocked));
const sessions = (p) => p.evaluate(() => window.__velaStore.getState().journal.sessions.length);
const ls = (p, k) => p.evaluate((key) => localStorage.getItem(key), k);
const seen = (p) => p.evaluate(() => window.__seen);
const gets = (p) => p.evaluate(() => window.__gets || 0);
function serve(dir) {
  rmSync(SERVE_DIR, { recursive: true, force: true });
  cpSync(dir, SERVE_DIR, { recursive: true });
}
/** Closes the app (blank same-origin page, sessionStorage gone), runs `between` there, opens it again. */
async function relaunch(p, between) {
  await p.goto(URL + "__closed__.html");
  await p.evaluate(() => sessionStorage.clear());
  if (between) await p.evaluate(between);
  await p.goto(URL);
  await p.waitForSelector(ANY, { timeout: 30000 });
}
const dropDb = (name) => `new Promise((res) => { const r = indexedDB.deleteDatabase(${JSON.stringify(name)}); r.onsuccess = r.onerror = r.onblocked = () => res(); })`;
const evictKey = () => new Promise((res) => {
  const r = indexedDB.deleteDatabase("vela-grace");
  r.onsuccess = r.onerror = r.onblocked = () => res();
});
async function settle(p, ms = 900) {
  await p.waitForTimeout(ms);
}

/** Old build: create, fingerprint, two entries; optionally signed in and synced. */
async function oldDevice(build, { acct = null, lockAfter = false } = {}) {
  serve(build);
  const ctx = await newContext({ acct, signed: Boolean(acct) });
  const p = await openPage(ctx);
  await create(p);
  await acceptOffer(p);
  await p.evaluate(() => {
    const s = window.__velaStore.getState();
    s.quickLog();
    s.quickLog();
  });
  await settle(p, 2500);
  if (lockAfter) {
    await p.evaluate(() => window.__velaStore.getState().lock());
    await settle(p, 600);
  }
  return { ctx, p };
}

/* ───────── A: migration guard ───────── */
if (RUN("A")) {
  for (const [label, build] of [["dd94a16", DD94], ["013df35-era", OLD]]) {
    for (const locked of [false, true]) {
      const acct = account();
      const { ctx, p } = await oldDevice(build, { acct, lockAfter: locked });
      ok(`A ${label}${locked ? " (locked)" : ""}: fingerprint enrolled, signed in`, Boolean(await ls(p, "vela-fingerprint")) && Boolean(await ls(p, "vela-auth")));
      serve(NEW_BUILD);
      await relaunch(p);
      const opened = await opensSoon(p);
      const s = await seen(p);
      ok(`A ${label}${locked ? " (locked)" : ""} → update: the fingerprint opens it`, opened && (await gets(p)) >= 1, `gets=${await gets(p)}`);
      ok(`A … no passphrase / setup screen at any point`, !s.unlock && !s.cloud && !s.create, JSON.stringify(s));
      ok(`A … data kept, seal kept`, opened && (await sessions(p)) === 2 && Boolean(await ls(p, "vela-fingerprint")));
      await ctx.close();
    }
  }
}

/* ───────── B: PRF key not handed back once ───────── */
if (RUN("B")) {
  const { ctx, p } = await oldDevice(DD94, { lockAfter: true }); // dd94's Lock wiped the parked key
  serve(NEW_BUILD);
  // the key isn't on the phone (dd94's auto-lock / the 013df35-era session key), so the seal must open it
  await relaunch(p, async () => {
    localStorage.setItem("__noPrf", "1");
    await new Promise((res) => {
      const r = indexedDB.deleteDatabase("vela-grace");
      r.onsuccess = r.onerror = r.onblocked = () => res();
    });
  });
  await p.waitForSelector("#unlock-pass", { timeout: 15000 }).catch(() => undefined);
  ok("B no PRF this once: the sealed passphrase is KEPT (not deleted)", Boolean(await ls(p, "vela-fingerprint")));
  ok("B … the passphrase screen says why (key lost on this phone, once)", await p.isVisible("text=needs your passphrase once"));
  await p.fill("#unlock-pass", PASS);
  await p.click('form[data-testid="pass-unlock"] button[type=submit]');
  ok("B … the passphrase opens it", await opensSoon(p));
  ok("B … the fingerprint is offered right away after the passphrase", await offerShown(p));
  if (await p.isVisible('[data-testid="bio-offer-later"]')) await p.click('[data-testid="bio-offer-later"]');
  // later: the phone clears Vela's key, and the PRF works again → the kept seal opens it, nothing typed
  await relaunch(p, evictKey);
  const opened = await opensSoon(p);
  const s = await seen(p);
  ok("B next launch with the key evicted: fingerprint opens it, no passphrase", opened && !s.unlock, JSON.stringify(s));
  ok("B … data kept", opened && (await sessions(p)) === 2);
  await ctx.close();
}

/* ───────── C: IndexedDB refused right after the update ───────── */
if (RUN("C")) {
  let { ctx, p } = await oldDevice(DD94);
  serve(NEW_BUILD);
  await relaunch(p, () => localStorage.setItem("__idbFail", "2"));
  const opened = await opensSoon(p);
  let s = await seen(p);
  ok("C storage refused twice at boot: never the create-journal screen", !s.create, JSON.stringify(s));
  ok("C … the fingerprint opens it, no passphrase", opened && !s.unlock && (await gets(p)) >= 1);
  await relaunch(p);
  ok("C next launch: still the fingerprint gate (migration not lost)", (await p.isVisible('[data-testid="bio-lock"]')) || (await gets(p)) >= 1);
  ok("C … opens", await opensSoon(p));
  // refused for longer: a retry screen, never setup; once storage answers, the fingerprint opens it
  await relaunch(p, () => localStorage.setItem("__idbFail", "99"));
  await settle(p, 2500);
  s = await seen(p);
  ok("C storage refused for good: no create-journal screen", !s.create && !s.unlock, JSON.stringify(s));
  ok("C … says it couldn't open storage, offers to try again", await p.isVisible('[data-testid="store-retry"]'));
  await p.evaluate(() => localStorage.setItem("__idbFail", "0"));
  await p.click('[data-testid="store-retry"] button', { timeout: 5000 }).catch(() => undefined);
  ok("C … try again → the fingerprint opens it", (await opensSoon(p)) && !(await seen(p)).unlock);
  ok("C … data kept", (await sessions(p)) === 2);
  await ctx.close();
}

/* ───────── D: journal storage lost, seal kept, slow session restore ───────── */
if (RUN("D")) {
  const acct = account();
  let { ctx, p } = await oldDevice(DD94, { acct });
  // make sure the account holds the encrypted journal
  await p.evaluate(() => window.__velaStore.getState().quickLog());
  await settle(p, 3500);
  ok("D synced to the mock account (ciphertext only)", Boolean(acct.row?.ciphertext) && !JSON.stringify(acct.row).includes("Tester"));
  serve(NEW_BUILD);
  acct.delay = 2500;
  await relaunch(p, async () => {
    await new Promise((res) => {
      const r = indexedDB.deleteDatabase("vela-vault");
      r.onsuccess = r.onerror = r.onblocked = () => res();
    });
    await new Promise((res) => {
      const r = indexedDB.deleteDatabase("vela-grace");
      r.onsuccess = r.onerror = r.onblocked = () => res();
    });
    // the session needs a refresh (slow), like a phone opened after a while
    const s = JSON.parse(localStorage.getItem("vela-auth") || "{}");
    s.expires_at = Math.floor(Date.now() / 1000) - 600;
    localStorage.setItem("vela-auth", JSON.stringify(s));
  });
  const opened = await opensSoon(p, 25000);
  const s = await seen(p);
  ok("D slow session restore: the setup screen never shows", !s.create, JSON.stringify(s));
  ok("D … the fingerprint opens the account copy, no passphrase typed", opened && !s.cloud && !s.unlock, JSON.stringify(s));
  ok("D … data back", opened && (await sessions(p)) === 3, String(opened ? await sessions(p) : -1));
  acct.delay = 0;
  if (opened) {
    await relaunch(p, evictKey);
    ok("D … and the seal follows the journal (next launch, key evicted: fingerprint)", (await opensSoon(p)) && !(await seen(p)).unlock);
  }
  await ctx.close();
}

/* ───────── E: first sign-in, passphrase typed, fingerprint offered at once ───────── */
if (RUN("E")) {
  serve(NEW_BUILD);
  const acct = account();
  let ctx = await newContext({ acct, signed: true });
  let p = await openPage(ctx);
  await create(p);
  await acceptOffer(p);
  await p.evaluate(() => window.__velaStore.getState().quickLog());
  await settle(p, 3000);
  ok("E account holds the journal", Boolean(acct.row?.ciphertext));
  // remove the journal from this phone (keeps the enrolment), then sign in again → passphrase once
  await p.evaluate(() => window.__velaStore.getState().forgetDevice());
  await settle(p, 600);
  await relaunch(p);
  await p.waitForSelector("#cloud-pass", { timeout: 15000 });
  await p.fill("#cloud-pass", PASS);
  await p.click('button[type=submit]:has-text("Open my journal")');
  ok("E passphrase opens the account copy", await opensSoon(p));
  ok("E … the fingerprint is offered right away (not silently skipped)", await offerShown(p));
  await acceptOffer(p).catch(() => undefined);
  ok("E … sealed for this journal", await p.evaluate(() => {
    const r = JSON.parse(localStorage.getItem("vela-fingerprint") || "null");
    return Boolean(r && r.username === window.__velaStore.getState().vaultId);
  }));
  await relaunch(p, evictKey);
  const opened = await opensSoon(p);
  ok("E next launch with the key evicted: fingerprint, no passphrase", opened && !(await seen(p)).unlock);
  ok("E … data kept", opened && (await sessions(p)) === 1);
  await ctx.close();
}

/* ───────── F: offline boots ───────── */
if (RUN("F")) {
  const acct = account();
  const { ctx, p } = await oldDevice(DD94, { acct });
  serve(NEW_BUILD);
  await relaunch(p, () => localStorage.setItem("__offline", "1"));
  const opened = await opensSoon(p);
  ok("F offline launch: the fingerprint opens it, no passphrase", opened && !(await seen(p)).unlock && (await gets(p)) >= 1);
  await relaunch(p, async () => {
    await new Promise((res) => {
      const r = indexedDB.deleteDatabase("vela-vault");
      r.onsuccess = r.onerror = r.onblocked = () => res();
    });
    localStorage.removeItem("vela-fingerprint");
  });
  await settle(p, 2500);
  const s = await seen(p);
  ok("F offline, no journal on the phone, account remembered: no setup screen", !s.create, JSON.stringify(s));
  ok("F … tells it is offline", await p.isVisible("text=offline"));
  await ctx.close();
}

/* ───────── G: service-worker update from dd94a16 ───────── */
if (RUN("G")) {
  serve(DD94);
  const ctx = await newContext({ sw: true });
  const p = await openPage(ctx);
  // let the first install finish (dd94a16 reloads the setup screen once when its worker takes control)
  await p.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 15000 }).catch(() => undefined);
  await settle(p, 1500);
  await p.reload();
  await p.waitForSelector("#create-pass", { timeout: 15000 });
  await create(p);
  await acceptOffer(p);
  await p.evaluate(() => window.__velaStore.getState().quickLog());
  await p.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 15000 }).catch(() => undefined);
  const v1 = await p.evaluate(() => navigator.serviceWorker.controller?.scriptURL || "");
  serve(NEW_BUILD);
  await p.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    await reg?.update();
  });
  await p.waitForFunction(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return Boolean(reg?.active && !reg.installing && !reg.waiting);
  }, null, { timeout: 20000 }).catch(() => undefined);
  await settle(p, 1500);
  ok("G update installed while the journal was open: not reloaded under it", await isOpen(p));
  await relaunch(p);
  const opened = await opensSoon(p);
  const want = (readFileSync(`${NEW_BUILD}/index.html`, "utf8").match(/assets\/(index-[^"]+\.js)/) || [])[1] || "?";
  ok("G next launch runs the new version", Boolean(v1) && (await p.evaluate((w) => Boolean(document.querySelector(`script[src*="${w}"]`)), want)));
  ok("G … storage intact: fingerprint opens it, no passphrase", opened && !(await seen(p)).unlock && !(await seen(p)).create);
  ok("G … data kept", opened && (await sessions(p)) === 1);
  await ctx.close();
}

/* ───────── H: enrolment saved under another owner ───────── */
if (RUN("H")) {
  serve(NEW_BUILD);
  const ctx = await newContext();
  const p = await openPage(ctx);
  await create(p);
  await acceptOffer(p);
  await p.evaluate(() => window.__velaStore.getState().quickLog());
  await settle(p, 600);
  // the credential sits under "local", the owner is an account (e.g. it was enrolled before the account was known)
  await relaunch(p, (uid) => {
    const rec = localStorage.getItem("vela.lock.local");
    localStorage.removeItem("vela.lock.local");
    localStorage.setItem("vela.lock.other-device-owner", rec || "");
    localStorage.setItem("vela.lock.owner", "bbbbbbbb-0000-4000-8000-000000000000");
    localStorage.removeItem("vela-fingerprint");
  });
  await settle(p, 1200);
  ok("H enrolment under another owner: the fingerprint is still asked at launch", (await gets(p)) >= 1 && (await opensSoon(p)));
  await p.evaluate(() => window.__velaStore.getState().lock());
  await settle(p, 400);
  await relaunch(p);
  ok("H … Lock kept the key: the fingerprint opens it again, no passphrase", (await opensSoon(p)) && !(await seen(p)).unlock);
  await ctx.close();
}

/* ───────── I + K + J ───────── */
if (RUN("I") || RUN("K") || RUN("J")) {
  serve(NEW_BUILD);
  const ctx = await newContext();
  const p = await openPage(ctx);
  await create(p);
  await acceptOffer(p);
  await p.evaluate(() => window.__velaStore.getState().quickLog());
  await settle(p, 600);
  await relaunch(p);
  await opensSoon(p);
  if (RUN("I")) ok("I storage persistence requested at every boot with a journal", (await p.evaluate(() => window.__persistCalls)) >= 1);
  if (RUN("K")) {
    await relaunch(p, async () => {
      const r = JSON.parse(localStorage.getItem("vela-fingerprint"));
      r.username = "an-older-journal-id";
      localStorage.setItem("vela-fingerprint", JSON.stringify(r));
      await new Promise((res) => {
        const d = indexedDB.deleteDatabase("vela-grace");
        d.onsuccess = d.onerror = d.onblocked = () => res();
      });
    });
    const opened = await opensSoon(p);
    ok("K seal saved under an older journal id: the fingerprint still opens it", opened && !(await seen(p)).unlock);
    ok("K … and the seal is tied to this journal from then on", opened && (await p.evaluate(() => JSON.parse(localStorage.getItem("vela-fingerprint")).username === window.__velaStore.getState().vaultId)));
  }
  if (RUN("J")) {
    const vid = await p.evaluate(() => window.__velaStore.getState().vaultId);
    await p.locator('button[aria-label="Open settings"]').first().dispatchEvent("click", undefined, { timeout: 10000 }).catch(() => undefined);
    const sec = p.locator('button:has-text("Privacy & Security")').first();
    await sec.waitFor({ timeout: 10000 }).catch(() => undefined);
    if ((await sec.getAttribute("aria-expanded", { timeout: 3000 }).catch(() => "true")) !== "true") await sec.click().catch(() => undefined);
    await p.locator('[data-testid="lock-diag"] summary').click({ timeout: 5000 }).catch(() => undefined);
    await p.waitForSelector('[data-testid="diag-diagKey"]', { timeout: 5000 }).catch(() => undefined);
    const text = await p.locator('[data-testid="lock-diag"]').innerText({ timeout: 5000 }).catch(() => "");
    ok("J settings: Lock diagnostics row shows the facts", /Key kept on this phone\s+yes/.test(text) && /Fingerprint enrolment found\s+yes/.test(text) && /Fingerprint-sealed passphrase\s+yes/.test(text), text.replace(/\s+/g, " ").slice(0, 160));
    ok("J … no secrets or ids in it", !text.includes(PASS) && !text.includes(vid) && !text.includes(UID) && !text.includes("Tester"));
    await p.evaluate(() => localStorage.setItem("__cancelBio", "1"));
    await p.evaluate(() => window.__velaStore.getState().lock());
    await p.waitForSelector('[data-testid="lock-wordmark"]', { timeout: 5000 }).catch(() => undefined);
    for (let i = 0; i < 5; i++) await p.locator('[data-testid="lock-wordmark"]').click({ force: true }).catch(() => undefined);
    ok("J lock screen: five taps on the name show the diagnostics", await p.waitForSelector('[data-testid="lock-diag-list"] [data-testid="diag-diagKey"]', { timeout: 5000 }).then(() => true, () => false));
    const t2 = await p.locator('[data-testid="lock-diag"]').innerText().catch(() => "");
    ok("J … no secrets or ids there either", !t2.includes(PASS) && !t2.includes(vid) && !t2.includes("Tester"));
    await p.evaluate(() => localStorage.removeItem("__cancelBio"));
  }
  await ctx.close();
}

await browser.close();
console.log(`\n${passes}/${passes + fails} passed`);
process.exit(fails ? 1 : 0);
