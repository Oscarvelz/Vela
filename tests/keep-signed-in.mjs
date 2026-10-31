// "Keep me signed in / Mantener sesión abierta" — mock-based (no real accounts, fake data only).
// Serves the VITE_E2E build at http://127.0.0.1:8132/Vela/ and mocks the Supabase auth + REST API
// in the browser (page.route), so nothing ever reaches the real project.
// Checks: checkbox present + default checked on sign-in and sign-up (en/es), choice persisted,
// session in localStorage when on / sessionStorage when off (reload + new tab), an existing
// localStorage session (pre-update) is kept without sign-out, and an expired session while kept
// keeps the diary open with a gentle "Sign in again". Screenshots → /workspace/work/vela-keep-shots/.
import { chromium } from "/workspace/work/browser-test/node_modules/playwright-core/index.mjs";
import { mkdirSync } from "node:fs";

const URL = "http://127.0.0.1:8132/Vela/";
const SB = "https://bybldbmwxucdvhfqspnf.supabase.co";
const KEY = "vela-auth";
const OUT = "/workspace/work/vela-keep-shots";
mkdirSync(OUT, { recursive: true });
const PASS = "fake-orbit-lantern-42";
const UID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const EMAIL = "kept.tester@example.com";

let fails = 0;
const ok = (n, c, x = "") => {
  if (!c) fails++;
  console.log(`${c ? "PASS" : "FAIL"}  ${n}${x !== "" ? "  — " + JSON.stringify(x) : ""}`);
};

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function jwt(exp) {
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: UID, email: EMAIL, role: "authenticated", aud: "authenticated", exp, iat: exp - 3600, session_id: "s-1" })}.ZmFrZXNpZw`;
}
const user = { id: UID, aud: "authenticated", role: "authenticated", email: EMAIL, app_metadata: { provider: "email" }, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
function session(expiresIn = 3600) {
  const exp = Math.floor(Date.now() / 1000) + expiresIn;
  return { access_token: jwt(exp), token_type: "bearer", expires_in: expiresIn, expires_at: exp, refresh_token: "fake-refresh-" + Math.random().toString(36).slice(2), user };
}

/** Per-context mock state. */
function mock() {
  const st = { refreshDead: false, logouts: 0, calls: [] };
  st.handle = async (route) => {
    const req = route.request();
    const u = new globalThis.URL(req.url());
    const json = (status, data) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(data) });
    st.calls.push(`${req.method()} ${u.pathname}${u.search}`);
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    if (u.pathname === "/auth/v1/token") {
      const grant = u.searchParams.get("grant_type");
      if (grant === "password") return json(200, session());
      if (grant === "refresh_token") {
        if (st.refreshDead) return json(400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token: Refresh Token Not Found" });
        return json(200, session());
      }
    }
    if (u.pathname === "/auth/v1/signup") return json(200, session());
    if (u.pathname === "/auth/v1/user") return st.refreshDead ? json(401, { code: 401, msg: "invalid JWT" }) : json(200, user);
    if (u.pathname === "/auth/v1/logout") {
      st.logouts += 1;
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
    }
    if (u.pathname === "/rest/v1/vela_vault") {
      if (req.method() === "GET") return json(200, []);
      return json(201, [{ revision: 1 }]);
    }
    return json(404, { message: "not mocked" });
  };
  return st;
}

const browser = await chromium.launch({
  executablePath: "/workspace/work/browser-test/browsers/chromium_headless_shell-1155/chrome-linux/headless_shell",
  args: ["--no-sandbox", "--no-proxy-server"],
});
const errors = [];

async function context(init) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 2.5, locale: "en-US", serviceWorkers: "block" });
  const m = mock();
  await ctx.route(`${SB}/**`, m.handle);
  if (init) await ctx.addInitScript(init.fn, init.arg);
  return { ctx, m };
}
async function open(ctx) {
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(URL);
  return page;
}
const store = (page) =>
  page.evaluate((k) => ({ local: localStorage.getItem(k), session: sessionStorage.getItem(k), keep: localStorage.getItem("vela.keep") }), KEY);
const signedIn = (page) => page.waitForSelector(`text=${EMAIL}`, { timeout: 15000 }).then(() => true, () => false);
async function signIn(page, { keep = true, mode = "in" } = {}) {
  if (mode === "up") await page.click('button:has-text("Create account") >> nth=0');
  await page.fill("#account-email", EMAIL);
  await page.fill("#account-password", PASS);
  if (mode === "up") await page.fill("#account-password2", PASS);
  if ((await page.isChecked("#account-keep")) !== keep) await page.click("label.vela-keep");
  await page.click('form button[type=submit]:has-text("' + (mode === "up" ? "Create account" : "Sign in") + '")');
}
async function createJournal(page) {
  await page.waitForSelector("#create-pass", { timeout: 20000 });
  await page.fill("#name", "Tester");
  await page.fill("#create-pass", PASS);
  await page.fill("#create-pass2", PASS);
  await page.check("#pass-ack");
  await page.click('button[type=submit]:has-text("Create my private journal")');
  await page.waitForSelector(".ag-tabbar", { timeout: 30000 });
}
async function openData(page) {
  if (!(await page.isVisible('button:has-text("Data & Backup")'))) await page.locator('button[aria-label="Open settings"]').dispatchEvent("click");
  const btn = page.locator('button:has-text("Data & Backup")');
  await btn.waitFor({ timeout: 10000 });
  if ((await btn.getAttribute("aria-expanded")) !== "true") await btn.click();
  await page.waitForTimeout(300);
}
async function unlockIfLocked(page) {
  await page.waitForSelector('.ag-tabbar, input[placeholder="Enter your passphrase"]', { timeout: 20000 });
  if (await page.isVisible('input[placeholder="Enter your passphrase"]')) {
    await page.fill('input[placeholder="Enter your passphrase"]', PASS);
    await page.click('button[type=submit]:has-text("Unlock")');
    await page.waitForSelector(".ag-tabbar", { timeout: 30000 });
  }
}

// ── 1. Checkbox present + default checked, en/es, sign-in + sign-up; screenshots ──
{
  const { ctx } = await context();
  const page = await open(ctx);
  await page.waitForSelector("#account-keep", { timeout: 20000 });
  ok("en sign-in: checkbox present", await page.isVisible("#account-keep"));
  ok("en sign-in: default checked", await page.isChecked("#account-keep"));
  ok("en label 'Keep me signed in'", (await page.textContent("label.vela-keep")).trim() === "Keep me signed in");
  const panel = page.locator(".ag-panel", { has: page.locator("#account-keep") });
  await panel.scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  await panel.screenshot({ path: `${OUT}/signin-night-en.png` });
  await page.click('button:has-text("Create account") >> nth=0');
  ok("en sign-up: checkbox present + checked", (await page.isVisible("#account-keep")) && (await page.isChecked("#account-keep")));
  await panel.screenshot({ path: `${OUT}/signup-night-en.png` });
  await page.click('button:has-text("Sign in") >> nth=0');
  // unchecked look
  await page.click("label.vela-keep");
  ok("clicking the label toggles it", !(await page.isChecked("#account-keep")));
  await page.waitForTimeout(300);
  await panel.screenshot({ path: `${OUT}/signin-night-unchecked.png` });
  await page.click("label.vela-keep");
  // es (the lock / first-run screen is always Firmament night by design)
  await page.click('button:has-text("ES")');
  await page.waitForTimeout(300);
  ok("es label 'Mantener sesión abierta'", (await page.textContent("label.vela-keep")).trim() === "Mantener sesión abierta");
  ok("es sign-in: default checked", await page.isChecked("#account-keep"));
  await panel.screenshot({ path: `${OUT}/signin-night-es.png` });
  await page.screenshot({ path: `${OUT}/screen-night-es.png`, fullPage: true });
  await page.click('button:has-text("Crear cuenta") >> nth=0');
  ok("es sign-up: checkbox present + checked", (await page.isVisible("#account-keep")) && (await page.isChecked("#account-keep")));
  await panel.screenshot({ path: `${OUT}/signup-night-es.png` });
  await ctx.close();
}

// ── 1b. The same form in Settings → Data & Backup, day + night (theme applies once the diary is open) ──
{
  const { ctx } = await context();
  const page = await open(ctx);
  await createJournal(page);
  await openData(page);
  const form = page.locator("section", { has: page.locator("#account-keep") }).first();
  await page.evaluate(() => { document.querySelector("#account-keep").scrollIntoView({ block: "center" }); });
  ok("settings: checkbox present + checked", await page.isChecked("#account-keep"));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/settings-night-en.png` });
  await page.evaluate(() => { const s = window.__velaStore.getState(); if (s.journal.settings.mode !== "day") s.toggleMode(); });
  await page.waitForTimeout(600);
  await page.evaluate(() => { document.querySelector("#account-keep").scrollIntoView({ block: "center" }); });
  await page.screenshot({ path: `${OUT}/settings-day-en.png` });
  await page.evaluate(() => window.__velaStore.getState().setLanguage("es"));
  await page.waitForTimeout(400);
  ok("settings es: label + checked", (await page.textContent("label.vela-keep")).trim() === "Mantener sesión abierta" && (await page.isChecked("#account-keep")));
  await page.evaluate(() => { document.querySelector("#account-keep").scrollIntoView({ block: "center" }); });
  await page.screenshot({ path: `${OUT}/settings-day-es.png` });
  await page.click("label.vela-keep");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/settings-day-es-unchecked.png` });
  void form;
  await ctx.close();
}

// ── 2. Keep ON: session in localStorage, survives reload and a new tab ──
{
  const { ctx } = await context();
  const page = await open(ctx);
  await page.waitForSelector("#account-keep", { timeout: 20000 });
  await signIn(page, { keep: true });
  ok("keep on: signed in", await signedIn(page));
  let s = await store(page);
  ok("keep on: session in localStorage, not sessionStorage", !!s.local && !s.session, { local: !!s.local, session: !!s.session });
  ok("keep on: choice saved as vela.keep=1", s.keep === "1", s.keep);
  await page.reload();
  ok("keep on: still signed in after reload", await signedIn(page));
  const tab2 = await open(ctx);
  ok("keep on: signed in in a new tab", await signedIn(tab2));
  await ctx.close();
}

// ── 3. Keep OFF: session in sessionStorage; reload keeps it, a new tab does not; choice persisted ──
{
  const { ctx } = await context();
  const page = await open(ctx);
  await page.waitForSelector("#account-keep", { timeout: 20000 });
  await signIn(page, { keep: false });
  ok("keep off: signed in", await signedIn(page));
  let s = await store(page);
  ok("keep off: session in sessionStorage, not localStorage", !s.local && !!s.session, { local: !!s.local, session: !!s.session });
  ok("keep off: choice saved as vela.keep=0", s.keep === "0", s.keep);
  await page.reload();
  ok("keep off: same tab reload still signed in", await signedIn(page));
  const tab2 = await open(ctx);
  await tab2.waitForSelector("#account-keep", { timeout: 20000 });
  ok("keep off: a new tab (app reopened) asks to sign in", !(await tab2.isVisible(`text=${EMAIL}`)));
  ok("keep off: no 'session ended' note when not kept", !(await tab2.isVisible('[data-testid="relogin"]')));
  ok("keep off: checkbox remembers the choice (unchecked)", !(await tab2.isChecked("#account-keep")));
  // switching back on while signed in on the first tab migrates the session without sign-out
  await signIn(tab2, { keep: true });
  ok("back on: signed in", await signedIn(tab2));
  s = await store(tab2);
  ok("back on: session now in localStorage", !!s.local && !s.session && s.keep === "1", { local: !!s.local, session: !!s.session, keep: s.keep });
  await ctx.close();
}

// ── 4. Existing users: a pre-update session in localStorage (no vela.keep yet) stays signed in ──
{
  const pre = JSON.stringify(session(3600));
  const { ctx, m } = await context({
    fn: ([k, v]) => { if (!localStorage.getItem("seeded")) { localStorage.setItem(k, v); localStorage.setItem("seeded", "1"); } },
    arg: [KEY, pre],
  });
  const page = await open(ctx);
  ok("migration: signed in without doing anything", await signedIn(page));
  await page.waitForTimeout(800);
  const s = await store(page);
  ok("migration: session still in localStorage under 'vela-auth'", !!s.local && !s.session);
  ok("migration: same session kept (same refresh token)", s.local && JSON.parse(s.local).refresh_token === JSON.parse(pre).refresh_token);
  ok("migration: no sign-out call, no 'session ended' note", m.logouts === 0 && !(await page.isVisible('[data-testid="relogin"]')));
  ok("migration: checkbox state defaults to on (vela.keep unset)", s.keep === null);
  await page.reload();
  ok("migration: still signed in after reload", await signedIn(page));
  await ctx.close();
}

// ── 5. Kept, then the session ends by itself: diary stays open, gentle "Sign in again" ──
{
  const { ctx, m } = await context();
  const page = await open(ctx);
  await createJournal(page);
  await openData(page);
  await signIn(page, { keep: true });
  ok("expiry: signed in from Settings", await signedIn(page));
  // The refresh token dies (expired / revoked server-side) and the access token is past its expiry.
  m.refreshDead = true;
  await page.evaluate((k) => {
    const s = JSON.parse(localStorage.getItem(k));
    s.expires_at = Math.floor(Date.now() / 1000) - 600;
    localStorage.setItem(k, JSON.stringify(s));
  }, KEY);
  await page.reload();
  await unlockIfLocked(page);
  ok("expiry: the diary is open (not sent to a login wall)", await page.isVisible(".ag-tabbar"));
  await openData(page);
  await page.waitForSelector('[data-testid="relogin"]', { timeout: 15000 }).catch(() => {});
  ok("expiry: 'session ended' note shown", await page.isVisible('[data-testid="relogin"]'));
  const badge = await page.locator('button:has-text("Data & Backup")').textContent();
  ok("expiry: Data & Backup badge says 'Sign in again'", badge.includes("Sign in again"), badge);
  ok("expiry: email prefilled", (await page.inputValue("#account-email")) === EMAIL);
  ok("expiry: submit button reads 'Sign in again'", await page.isVisible('form button[type=submit]:has-text("Sign in again")'));
  const sec = page.locator("section", { has: page.locator('[data-testid="relogin"]') }).first();
  await page.evaluate(() => document.querySelector('[data-testid="relogin"]').scrollIntoView({ block: "start" }) || window.scrollBy(0, -120));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/relogin-night-en.png` });
  await page.evaluate(() => { const s = window.__velaStore.getState(); s.setLanguage("es"); if (s.journal.settings.mode !== "day") s.toggleMode(); });
  await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector('[data-testid="relogin"]').scrollIntoView({ block: "start" }) || window.scrollBy(0, -120));
  await page.screenshot({ path: `${OUT}/relogin-day-es.png` });
  const badgeEs = await page.locator('button[aria-expanded="true"]', { hasText: "Datos" }).textContent().catch(() => "");
  ok("expiry: es badge 'Entrar de nuevo'", badgeEs.includes("Entrar de nuevo"), badgeEs);
  await page.evaluate(() => { const s = window.__velaStore.getState(); s.setLanguage("en"); s.toggleMode(); });
  await page.waitForTimeout(300);
  void sec;
  // Sign in again
  m.refreshDead = false;
  await page.fill("#account-password", PASS);
  await page.click('form button[type=submit]:has-text("Sign in again")');
  ok("expiry: signed in again", await signedIn(page));
  ok("expiry: note gone after signing in", !(await page.isVisible('[data-testid="relogin"]')));
  // An explicit sign-out is a real sign-out: no "session ended" note afterwards.
  await page.click('button:has-text("Sign out")');
  await page.waitForSelector("#account-email", { timeout: 10000 });
  ok("sign out: no 'session ended' note", !(await page.isVisible('[data-testid="relogin"]')));
  await page.reload();
  await unlockIfLocked(page);
  await openData(page);
  await page.waitForSelector("#account-email", { timeout: 10000 });
  ok("sign out: still no note after reload", !(await page.isVisible('[data-testid="relogin"]')));
  ok("sign out: session removed from both storages", await page.evaluate((k) => !localStorage.getItem(k) && !sessionStorage.getItem(k), KEY));
  await ctx.close();
}

ok("no page errors", errors.length === 0, errors.slice(0, 3));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
