// Unlock fixes, end to end. Fake passphrases and fake data only; nothing is printed but PASS/FAIL.
// Env: AG_URL (default http://127.0.0.1:8132/Vela/), ONLY=A (just the passphrase-reading checks,
// used to run the same checks against the pre-fix build), SHOTS (screenshot dir).
//
// A1 password-manager autofill · A2 keyboard artefacts · A3 stale key from another window
// A4 submit races · B the passphrase is asked once per device (lock like Journey: no fingerprint set up here,
// Lock, sign out, forget) · M migration · F fingerprint alone is enough (virtual WebAuthn authenticator).
// The app-lock behaviour itself (leaving, pickers, reloads, sign-out, migration from dd94a16) is tests/journey-lock.mjs.
import { chromium } from "/workspace/work/browser-test/node_modules/playwright-core/index.mjs";
import { cpSync, mkdirSync, rmSync } from "node:fs";

const URL = process.env.AG_URL || "http://127.0.0.1:8132/Vela/";
// WebAuthn needs a domain (an IP address cannot be a relying party): the fingerprint part uses localhost.
const BIO_URL = URL.replace("127.0.0.1", "localhost");
const ONLY = process.env.ONLY || "";
const RUN = (k) => !ONLY || ONLY.split(",").includes(k);
const SHOTS = process.env.SHOTS || "/workspace/work/vela-unlock-shots";
const SERVE_DIR = process.env.SERVE_DIR || "/workspace/work/ve/Vela";
const NEW_BUILD = process.env.NEW_BUILD || "/workspace/work/vela/docs";
const OLD_BUILD = process.env.OLD_BUILD || "/workspace/work/ve-old/Vela";
mkdirSync(SHOTS, { recursive: true });
const SB = "https://bybldbmwxucdvhfqspnf.supabase.co";

const PASS = "fake-orbit-lantern-42";
const PASS2 = "fake-copper-meadow-77";
const ACCOUNT_PW = "Fake-Account-Pw-2026"; // what a password manager would drop in
const MIN = 60_000;

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

/* A clock we can move forward: Date.now() + window.__skew (persisted per origin in localStorage). */
function clockInit() {
  const real = Date.now.bind(Date);
  window.__skew = Number(localStorage.getItem("__skew") || 0);
  Date.now = () => real() + (window.__skew || 0);
  // Count PBKDF2 key imports (one per passphrase attempt/candidate).
  const imp = crypto.subtle.importKey.bind(crypto.subtle);
  window.__imports = 0;
  crypto.subtle.importKey = (fmt, data, alg, ...rest) => {
    if (alg === "PBKDF2" || alg?.name === "PBKDF2") window.__imports++;
    return imp(fmt, data, alg, ...rest);
  };
}

async function context(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 2, locale: opts.locale || "en-US", serviceWorkers: "block" });
  await ctx.addInitScript(clockInit);
  if (opts.route) await ctx.route(`${SB}/**`, opts.route);
  else await ctx.route(`${SB}/**`, (r) => r.abort());
  return ctx;
}
async function page(ctx) {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("pageerror", String(e).slice(0, 200)));
  await p.goto(URL);
  await p.waitForSelector("#create-pass, #unlock-pass, .ag-tabbar, [data-testid=bio-lock]", { timeout: 30000 });
  return p;
}
async function create(p, pass = PASS) {
  await p.fill("#create-pass", pass);
  await p.fill("#create-pass2", pass);
  await p.check("#pass-ack");
  await p.click('form:has(#create-pass) button[type=submit]');
  await p.waitForSelector(".ag-tabbar", { timeout: 30000 });
  await p.waitForTimeout(600);
}
const isOpen = (p) => p.isVisible(".ag-tabbar");
const opensSoon = (p, ms = 15000) => p.waitForSelector(".ag-tabbar", { timeout: ms }).then(() => true, () => false);
const lockShown = (p, ms = 15000) => p.waitForSelector("#unlock-pass, [data-testid=bio-lock]", { timeout: ms }).then(() => true, () => false);
async function closeOffer(p) {
  if (await p.isVisible('[data-testid="bio-offer"]')) {
    const later = p.locator('[data-testid="bio-offer"] button:has-text("Not now")');
    if (await later.count()) await later.first().click();
    await p.waitForTimeout(300);
  }
}
async function lockViaStore(p) {
  await p.evaluate(() => window.__velaStore.getState().lock());
  await p.waitForSelector("#unlock-pass, [data-testid=bio-lock]", { timeout: 10000 });
}
async function tryUnlock(p, typed) {
  await p.fill("#unlock-pass", typed);
  await p.click('button[type=submit]:has-text("Unlock")');
  const r = await Promise.race([
    p.waitForSelector(".ag-tabbar", { timeout: 20000 }).then(() => "open"),
    p.waitForSelector('[data-testid="pass-unlock"] [role=alert], form [role=alert]', { timeout: 20000 }).then(() => "error"),
  ]).catch(() => "timeout");
  return r;
}
async function openPrivacy(p) {
  if (!(await p.isVisible('button:has-text("Privacy & Security"), button:has-text("Privacidad y seguridad")')))
    await p.locator('button[aria-label="Open settings"], button[aria-label="Abrir ajustes"]').first().dispatchEvent("click");
  const btn = p.locator('button:has-text("Privacy & Security"), button:has-text("Privacidad y seguridad")').first();
  await btn.waitFor({ timeout: 10000 });
  if ((await btn.getAttribute("aria-expanded")) !== "true") await btn.click();
  await p.waitForTimeout(400);
}
const skew = (p, ms) =>
  p.evaluate((v) => {
    localStorage.setItem("__skew", String(v));
    window.__skew = v;
  }, ms);
const graceCount = (p) =>
  p.evaluate(
    () =>
      new Promise((res) => {
        const r = indexedDB.open("vela-grace", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("k");
        r.onsuccess = () => {
          const t = r.result.transaction("k", "readonly").objectStore("k").count();
          t.onsuccess = () => {
            res(t.result);
            r.result.close();
          };
        };
        r.onerror = () => res(-1);
      }),
  );

/* ───────────── A1: a password manager fills the passphrase field ───────────── */
if (RUN("A")) {
  const ctx = await context();
  const p = await page(ctx);
  const createAttrs = await p.evaluate(() => [...document.querySelectorAll("#create-pass, #create-pass2")].map((e) => e.getAttribute("autocomplete")));
  ok("A1 create fields are not offered to the password manager as a new site password", createAttrs.every((a) => a !== "new-password" && a !== "current-password"), JSON.stringify(createAttrs));
  await create(p);
  await closeOffer(p);
  await lockViaStore(p);
  const attrs = await p.evaluate(() => {
    const e = document.querySelector("#unlock-pass");
    return { ac: e.getAttribute("autocomplete"), cap: e.getAttribute("autocapitalize"), cor: e.getAttribute("autocorrect"), spell: e.getAttribute("spellcheck"), lp: e.getAttribute("data-lpignore") };
  });
  ok("A1 unlock field is not a site-login field (autocomplete ≠ current-password)", attrs.ac !== "current-password" && attrs.ac !== "password", JSON.stringify(attrs.ac));
  ok("A1 unlock field tells password managers to ignore it", attrs.lp === "true");
  // Autofill: value appears with a plain `input` Event (no inputType), the way Chrome's autofill fills.
  await p.evaluate((v) => {
    const el = document.querySelector("#unlock-pass");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, ACCOUNT_PW);
  await p.click('button[type=submit]:has-text("Unlock")');
  await p.waitForSelector('[role=alert]', { timeout: 20000 });
  const msg = await p.textContent("[role=alert]");
  const left = await p.inputValue("#unlock-pass");
  ok("A1 autofilled wrong secret → says the browser filled a saved password", /browser filled/i.test(msg || ""), msg);
  ok("A1 autofilled wrong secret is cleared from the field", left === "");
  await p.screenshot({ path: `${SHOTS}/lock-autofill-${ONLY ? "before" : "after"}.png` });
  ok("A1 then typing the real passphrase opens", (await tryUnlock(p, PASS)) === "open");
  await ctx.close();
}

/* account sign-in form: username + current-password so the password manager files the account password there */
if (RUN("A") && ONLY !== "A") {
  const ctx = await context();
  const p = await page(ctx);
  await p.waitForSelector("#account-email", { timeout: 15000 }).catch(() => undefined);
  const a = await p.evaluate(() => ({ user: document.querySelector("#account-email")?.getAttribute("autocomplete"), pw: document.querySelector("#account-password")?.getAttribute("autocomplete") }));
  ok("A1 account form: email is the username, password is current-password", a.user === "username" && a.pw === "current-password", JSON.stringify(a));
  await ctx.close();
}

/* ───────────── A2: keyboard artefacts ───────────── */
if (RUN("A")) {
  const ctx = await context();
  const p = await page(ctx);
  const SMART = "don't-fake-moon-42";
  await create(p, SMART);
  await closeOffer(p);
  await lockViaStore(p);
  ok("A2 trailing space from swipe/suggestion still opens", (await tryUnlock(p, SMART + " ")) === "open");
  await lockViaStore(p);
  ok("A2 smart apostrophe (’) still opens", (await tryUnlock(p, "don\u2019t-fake-moon-42")) === "open");
  await lockViaStore(p);
  ok("A2 no-break space + smart apostrophe still opens", (await tryUnlock(p, "\u00a0don\u2019t-fake-moon-42")) === "open");
  await lockViaStore(p);
  ok("A2 auto-capitalised first letter is NOT accepted (case is never changed)", (await tryUnlock(p, "Don't-fake-moon-42")) === "error");
  ok("A2 a different passphrase is still rejected", (await tryUnlock(p, "dont-fake-moon-43")) === "error");
  const kb = await p.evaluate(() => {
    const e = document.querySelector("#unlock-pass");
    return [e.getAttribute("autocapitalize"), e.getAttribute("autocorrect"), e.getAttribute("spellcheck")];
  });
  ok("A2 field turns off auto-capitalise / autocorrect / spellcheck", kb[0] === "none" && kb[1] === "off" && kb[2] === "false", JSON.stringify(kb));
  const kdf = await p.evaluate(
    () =>
      new Promise((res) => {
        const r = indexedDB.open("vela-vault", 1);
        r.onsuccess = () => {
          const g = r.result.transaction("kv").objectStore("kv").get("vault");
          g.onsuccess = () => res(g.result?.envelope?.kdf);
        };
      }),
  );
  ok("A2 crypto unchanged: PBKDF2-SHA256 600k", kdf?.name === "PBKDF2" && kdf.hash === "SHA-256" && kdf.iterations === 600000, JSON.stringify(kdf));
  await ctx.close();

  const ctx2 = await context();
  const p2 = await page(ctx2);
  const ES = "contraseña-falsa-99";
  await create(p2, ES);
  await closeOffer(p2);
  await lockViaStore(p2);
  ok("A2 decomposed ñ (NFD from some keyboards) opens", (await tryUnlock(p2, ES.normalize("NFD"))) === "open");
  await ctx2.close();
}

/* ───────────── A3: another window changes the passphrase ───────────── */
if (RUN("A")) for (const variant of ["broadcast", "no-broadcast"]) {
  const ctx = await context();
  const a = await page(ctx);
  await create(a);
  await closeOffer(a);
  const b = await ctx.newPage();
  if (variant === "no-broadcast") await b.addInitScript(() => { delete window.BroadcastChannel; });
  await b.goto(URL);
  await b.waitForSelector("#unlock-pass, .ag-tabbar", { timeout: 30000 });
  if (!(await isOpen(b))) await tryUnlock(b, PASS);
  ok(`A3[${variant}] second window open`, await isOpen(b));
  // window A changes the passphrase
  await a.bringToFront();
  const r = await a.evaluate(([c, n]) => window.__velaStore.getState().changePassphrase(c, n), [PASS, PASS2]);
  ok(`A3[${variant}] passphrase changed in window A`, r === "ok");
  await a.waitForTimeout(800);
  // window B (opened with the old key) makes an edit
  await b.bringToFront();
  await b.evaluate(() => window.__velaStore.getState().unlocked && window.__velaStore.getState().saveDisplayName("Edited in B"));
  await b.waitForTimeout(2500);
  const c = await ctx.newPage();
  await c.goto(URL);
  await c.waitForTimeout(1500);
  const newWorks = await c.evaluate((p) => window.__velaStore.getState().verifyPassphrase(p), PASS2);
  const oldWorks = await c.evaluate((p) => window.__velaStore.getState().verifyPassphrase(p), PASS);
  ok(`A3[${variant}] the NEW passphrase still opens the journal on disk`, newWorks, `new=${newWorks} old=${oldWorks}`);
  ok(`A3[${variant}] the old passphrase no longer does`, !oldWorks);
  if (!ONLY) {
    // B's edit was not lost: either B reopened with the new key, or it locked and asks for the new one.
    const bState = await b.evaluate(() => ({ open: window.__velaStore.getState().unlocked, note: window.__velaStore.getState().lockNote }));
    ok(`A3[${variant}] window B is open with the new key or locked asking for it`, bState.open || bState.note === "stale", JSON.stringify(bState));
  }
  await ctx.close();
}

/* ───────────── A4: submit races ───────────── */
if (RUN("A")) {
  const ctx = await context();
  const p = await page(ctx);
  await create(p);
  await closeOffer(p);
  await lockViaStore(p);
  // double submit (Enter + tap) of one wrong attempt → one key derivation
  await p.fill("#unlock-pass", "wrong-fake-pass-1");
  await p.evaluate(() => {
    window.__imports = 0;
    const f = document.querySelector("#unlock-pass").form;
    f.requestSubmit();
    f.requestSubmit();
  });
  await p.waitForSelector("[role=alert]", { timeout: 20000 });
  await p.waitForTimeout(1500);
  const n = await p.evaluate(() => window.__imports);
  ok("A4 double submit runs one attempt, not two", n === 1, `PBKDF2 imports=${n}`);
  // the field holds the right value but React never saw an input event (autofill without events)
  await p.evaluate((v) => {
    const el = document.querySelector("#unlock-pass");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v);
  }, PASS);
  await p.evaluate(() => document.querySelector("#unlock-pass").form.requestSubmit());
  ok("A4 submit uses what the field shows, not a stale copy", await opensSoon(p, 15000));
  await ctx.close();
}

if (ONLY === "A" && false) {
  await browser.close();
  console.log(`\n${passes}/${passes + fails} passed`);
  process.exit(fails ? 1 : 0);
}

/* ───────────── B: the passphrase is asked once per device ───────────── */
if (RUN("B")) {
  const ctx = await context();
  const p = await page(ctx);
  await create(p);
  await closeOffer(p);
  await openPrivacy(p);
  ok("B the old 'Ask for my passphrase' picker is gone", (await p.locator("[data-ask]").count()) === 0 && (await p.evaluate(() => localStorage.getItem("vela_ask_pass"))) === null);
  ok("B app lock card shown (no sensor on this browser)", await p.isVisible('[data-testid="app-lock"]'));
  ok("B passphrase note: only for encryption, asked once per device", /once on each device/i.test((await p.textContent('[data-testid="pass-note"]')) || ""));
  await p.reload();
  ok("B reload opens without asking", await opensSoon(p));
  await p.close();
  let q = await page(ctx);
  ok("B closing the app and opening again (new page) opens without asking", await isOpen(q));
  await skew(q, 30 * 24 * 60 * MIN);
  await q.close();
  q = await page(ctx);
  ok("B a month later still open (key parked on this device)", await isOpen(q));
  ok("B no fingerprint here: leaving 5 min doesn't lock (nothing to lock behind)", await q.evaluate(() => {
    const s = window.__velaStore.getState();
    s.noteHidden();
    window.__skew += 5 * 60000;
    s.noteVisible();
    return window.__velaStore.getState().unlocked;
  }));
  await skew(q, 0);

  // Lock in the header: without a fingerprint / screen lock, the passphrase is the only lock left
  await q.locator('.ag-header [data-testid="header-lock"]').click();
  ok("B header Lock button locks", await lockShown(q));
  ok("B … with no fingerprint set up, Lock wipes the key (the passphrase is the only lock)", (await graceCount(q)) === 0);
  await q.close();
  q = await page(ctx);
  ok("B after Lock, opening again asks for the passphrase", !(await isOpen(q)) && (await q.isVisible("#unlock-pass")));
  await tryUnlock(q, PASS);
  ok("B the passphrase parks the key again", (await graceCount(q)) === 1);
  // settings Lock now
  await openPrivacy(q);
  await q.click('[data-testid="lock-now"]');
  ok("B settings 'Lock now' locks", await lockShown(q));
  await tryUnlock(q, PASS);
  // Forget this device
  await q.evaluate(() => window.__velaStore.getState().forgetDevice());
  await q.waitForTimeout(500);
  ok("B forget device wipes the parked key", (await graceCount(q)) === 0);
  await ctx.close();
}

/* sign-out with no fingerprint set up locks and wipes the key (Supabase mocked, nothing reaches the network).
   With a fingerprint, sign-out keeps the key and the enrolment: tests/journey-lock.mjs (O). */
if (RUN("B")) {
  const UID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const user = { id: UID, aud: "authenticated", role: "authenticated", email: "fake.unlock@example.com", app_metadata: { provider: "email" }, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
  const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: UID, email: user.email, role: "authenticated", aud: "authenticated", exp, iat: exp - 3600 })}.ZmFrZQ`;
  const route = async (r) => {
    const req = r.request();
    const u = new globalThis.URL(req.url());
    const json = (status, data) => r.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(data) });
    if (req.method() === "OPTIONS") return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    if (u.pathname === "/auth/v1/user") return json(200, user);
    if (u.pathname === "/auth/v1/logout") return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
    if (u.pathname === "/rest/v1/vela_vault") return req.method() === "GET" ? json(200, []) : json(201, [{ revision: 1 }]);
    return json(404, {});
  };
  const ctx = await context({ route });
  await ctx.addInitScript((s) => { if (!localStorage.getItem("vela-auth")) localStorage.setItem("vela-auth", s); }, JSON.stringify({ access_token: jwt, token_type: "bearer", expires_in: 86400, expires_at: exp, refresh_token: "fake-refresh", user }));
  const p = await page(ctx);
  await create(p);
  await closeOffer(p);
  ok("B (signed in) parked key present after unlock", (await graceCount(p)) === 1);
  await p.locator('button[aria-label="Open settings"]').first().dispatchEvent("click");
  const data = p.locator('button:has-text("Data & Backup")').first();
  await data.waitFor({ timeout: 10000 });
  if ((await data.getAttribute("aria-expanded")) !== "true") await data.click();
  await p.locator('[data-testid="sign-out"]').first().click();
  await p.locator('[role=alertdialog] button:has-text("Sign out")').click();
  ok("B sign out locks the journal", await lockShown(p));
  await p.waitForTimeout(500);
  ok("B sign out (no fingerprint here) wipes the parked key", (await graceCount(p)) === 0);
  await ctx.close();
}

/* migration: a device running the previous build updates to this one */
if (RUN("M")) {
  rmSync(SERVE_DIR, { recursive: true, force: true });
  cpSync(OLD_BUILD, SERVE_DIR, { recursive: true });
  const ctx = await context();
  const p = await page(ctx);
  await create(p);
  await closeOffer(p);
  ok("M previous build: journal open", await isOpen(p));
  ok("M previous build had no ask setting stored", (await p.evaluate(() => localStorage.getItem("vela_ask_pass"))) === null);
  // update arrives
  rmSync(SERVE_DIR, { recursive: true, force: true });
  cpSync(NEW_BUILD, SERVE_DIR, { recursive: true });
  await p.reload();
  ok("M after update: same-session reload keeps it open (old parked key adopted)", await opensSoon(p));
  ok("M after update: no 'ask for passphrase' setting any more", (await p.evaluate(() => localStorage.getItem("vela_ask_pass"))) === null);
  await p.close();
  const q = await page(ctx);
  ok("M after update: opening the app again no longer asks", await isOpen(q));
  await ctx.close();

  // a device that was locked (app closed) when the update arrived: asks once, then stays open
  rmSync(SERVE_DIR, { recursive: true, force: true });
  cpSync(OLD_BUILD, SERVE_DIR, { recursive: true });
  const ctx2 = await context();
  const a = await page(ctx2);
  await create(a);
  await closeOffer(a);
  await a.close();
  rmSync(SERVE_DIR, { recursive: true, force: true });
  cpSync(NEW_BUILD, SERVE_DIR, { recursive: true });
  const b = await page(ctx2);
  ok("M locked device: asks once after the update", await b.isVisible("#unlock-pass"));
  await tryUnlock(b, PASS);
  await b.close();
  const c = await page(ctx2);
  ok("M locked device: after that one unlock, opening again doesn't ask", await isOpen(c));
  await ctx2.close();
}

/* ───────────── F: fingerprint alone is enough ───────────── */
if (RUN("F")) for (const PRF of [true, false]) {
  const tag = PRF ? "prf" : "devkey";
  const ctx = await context();
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("pageerror", String(e).slice(0, 200)));
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("WebAuthn.enable", { enableUI: false });
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", ctap2Version: "ctap2_1", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: PRF },
  });
  // Cancel is simulated the way Chrome reports it (after a short wait, NotAllowedError), and counted.
  await ctx.addInitScript(() => {
    const real = navigator.credentials.get.bind(navigator.credentials);
    navigator.credentials.get = (opts) => {
      const n = Number(sessionStorage.getItem("__bioGets") || 0) + 1;
      sessionStorage.setItem("__bioGets", String(n));
      return localStorage.getItem("__cancelBio") === "1"
        ? new Promise((_, rej) => setTimeout(() => rej(new DOMException("The operation either timed out or was not allowed.", "NotAllowedError")), 800))
        : real(opts);
    };
  });
  await p.goto(BIO_URL);
  await p.waitForSelector("#create-pass", { timeout: 30000 });
  await create(p);
  await p.waitForSelector('[data-testid="bio-offer"]', { timeout: 8000 });
  await p.click('[data-testid="bio-offer-yes"]');
  await p.waitForSelector('[data-testid="bio-offer"]', { state: "detached", timeout: 15000 });
  const rec = await p.evaluate(() => JSON.parse(localStorage.getItem("vela-fingerprint") || "null"));
  ok(`F[${tag}] enrolled`, Boolean(rec?.credentialId) && rec.prf === PRF);
  ok(`F[${tag}] the enrollment holds no plaintext passphrase`, !JSON.stringify(rec).includes(PASS));

  // passphrase typing is watched for the rest of the run
  const typed = () => p.evaluate(() => window.__typedPass || 0);
  await ctx.addInitScript(() => {
    document.addEventListener("input", (e) => { if (e.target?.id === "unlock-pass") window.__typedPass = (window.__typedPass || 0) + 1; }, true);
  });

  // manual Lock → fingerprint prompt by itself → open
  await p.locator('.ag-header [data-testid="header-lock"]').click();
  ok(`F[${tag}] after manual Lock the fingerprint opens it, nothing typed`, await opensSoon(p, 15000));
  // stricter option + time passes → fingerprint, not passphrase.
  // (The virtual authenticator belongs to this page, so "close and reopen the app" = end the
  // session (sessionStorage) and reload, exactly what closing the installed app does.)
  const reopen = async (ms) => {
    await p.evaluate((v) => {
      sessionStorage.clear();
      localStorage.setItem("__skew", String(v));
    }, ms);
    await p.goto(BIO_URL); // a fresh launch
  };
  await reopen(25 * 3600000);
  const sawPass = await p.waitForSelector("#unlock-pass", { timeout: 2500 }).then(() => true, () => false);
  ok(`F[${tag}] fresh launch 25 h later: fingerprint opens it, no passphrase field`, (await opensSoon(p, 15000)) && !sawPass);
  await skew(p, 0);
  await reopen(0);
  const sawPass2 = await p.waitForSelector("#unlock-pass", { timeout: 2500 }).then(() => true, () => false);
  ok(`F[${tag}] fresh launch: fingerprint opens it, no passphrase field`, (await opensSoon(p, 15000)) && !sawPass2);
  ok(`F[${tag}] no passphrase was typed at any point`, (await p.evaluate(() => window.__typedPass || 0)) === 0);
  const q = p;

  // cancelled repeatedly → passphrase field with a "Use fingerprint" retry button
  await q.evaluate(() => localStorage.setItem("__cancelBio", "1"));
  await q.locator('.ag-header [data-testid="header-lock"]').click();
  await q.waitForSelector('[data-testid="bio-lock"]', { timeout: 10000 });
  ok(`F[${tag}] one cancel keeps the fingerprint screen`, await q.waitForSelector('text=Tap the fingerprint to try again', { timeout: 10000 }).then(() => true, () => false));
  for (let i = 0; i < 2; i++) {
    const b = q.locator('[data-testid="bio-unlock"]');
    if (await b.count()) await b.click().catch(() => undefined);
    await q.waitForTimeout(1300);
  }
  ok(`F[${tag}] after 3 cancels: set up again offered, passphrase as the last option`, await q.waitForSelector('[data-testid="gate-reenrol"]', { timeout: 10000 }).then(() => true, () => false));
  await q.click('[data-testid="use-pass"]');
  ok(`F[${tag}] … the passphrase field shows`, await q.waitForSelector("#unlock-pass", { timeout: 10000 }).then(() => true, () => false));
  ok(`F[${tag}] … with a 'Use fingerprint' retry button`, await q.isVisible('[data-testid="use-finger"]'));
  await q.screenshot({ path: `${SHOTS}/lock-bio-fallback-${tag}.png` });
  await q.evaluate(() => localStorage.removeItem("__cancelBio"));
  await q.click('[data-testid="use-finger"]');
  ok(`F[${tag}] 'Use fingerprint' retries and opens`, await opensSoon(q, 15000));

  // the passphrase changed behind the fingerprint's back (e.g. another device): the fingerprint is
  // kept, the passphrase opens once, and the fingerprint is re-sealed and works again
  await q.evaluate(async (pass2) => {
    const st = window.__velaStore.getState();
    const journal = st.journal;
    const vaultId = st.vaultId;
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const b64 = (u) => btoa(String.fromCharCode(...u));
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass2.normalize("NFC")), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", iterations: 600000, salt }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(journal))));
    st.lock();
    await new Promise((r) => setTimeout(r, 300));
    const envelope = { v: 1, kdf: { name: "PBKDF2", hash: "SHA-256", iterations: 600000 }, salt: b64(salt), iv: b64(iv), ciphertext: b64(ct) };
    await new Promise((res) => {
      const r = indexedDB.open("vela-vault", 1);
      r.onsuccess = () => {
        const t = r.result.transaction("kv", "readwrite");
        t.objectStore("kv").put({ vaultId, envelope, savedAt: Date.now() }, "vault");
        t.oncomplete = () => res();
      };
    });
  }, PASS2);
  await q.reload();
  ok(`F[${tag}] stale fingerprint → passphrase field`, await q.waitForSelector("#unlock-pass", { timeout: 15000 }).then(() => true, () => false));
  ok(`F[${tag}] … and the fingerprint is kept (not deleted)`, Boolean(await q.evaluate(() => localStorage.getItem("vela-fingerprint"))));
  ok(`F[${tag}] new passphrase opens`, (await tryUnlock(q, PASS2)) === "open");
  await q.waitForTimeout(2500);
  await q.locator('.ag-header [data-testid="header-lock"]').click();
  ok(`F[${tag}] after that, the fingerprint alone opens it again`, await opensSoon(q, 15000));

  // a damaged sealed copy doesn't matter while the key is parked: the fingerprint is only the app lock
  await q.evaluate(() => {
    const r = JSON.parse(localStorage.getItem("vela-fingerprint"));
    r.data = r.data.slice(0, -4) + (r.data.endsWith("AAAA") ? "BBBB" : "AAAA");
    localStorage.setItem("vela-fingerprint", JSON.stringify(r));
  });
  await q.waitForTimeout(2200);
  await q.locator('.ag-header [data-testid="header-lock"]').click();
  ok(`F[${tag}] damaged sealed copy, key parked → fingerprint still opens it`, await opensSoon(q, 15000));
  await ctx.close();
}

/* ───────────── screenshots ───────────── */
if (RUN("S")) for (const [mode, lang] of [["night", "en"], ["day", "en"], ["night", "es"]]) {
  const ctx = await context({ locale: lang === "es" ? "es-ES" : "en-US" });
  const p = await page(ctx);
  await create(p);
  await closeOffer(p);
  await p.evaluate(([m, l]) => {
    const s = window.__velaStore.getState();
    if (s.journal.settings.mode !== m) s.toggleMode();
    s.setLanguage(l);
  }, [mode, lang]);
  await p.waitForTimeout(300);
  await openPrivacy(p);
  const el = p.locator('[data-testid="app-lock"]');
  await el.evaluate((e) => e.scrollIntoView({ block: "center" }));
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${SHOTS}/setting-${mode}-${lang}.png` });
  await el.screenshot({ path: `${SHOTS}/setting-card-${mode}-${lang}.png` });
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.screenshot({ path: `${SHOTS}/header-${mode}-${lang}.png`, clip: { x: 0, y: 0, width: 412, height: 90 } });
  await lockViaStore(p);
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${SHOTS}/lock-${mode}-${lang}.png`, fullPage: false });
  await ctx.close();
}

await browser.close();
console.log(`\n${passes}/${passes + fails} passed`);
process.exit(fails ? 1 : 0);
