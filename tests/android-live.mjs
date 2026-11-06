// Vela for Android, live (with SB_SERVICE_KEY_FILE: also the real sign-in link → vela://auth → the app): shared Supabase + the build under test served locally (BASE, default 127.0.0.1:8144/Vela/).
// Device A = a browser; device B = the Android app (mock VelaNative + app user agent), a fresh profile like the
// app's own storage: sign in, passphrase once, then the phone's prompt is the lock. Throwaway account, fake data.
import { chromium } from "/workspace/work/browser-test/node_modules/playwright-core/index.mjs";
// The build under test is served at the real address (routed from BUILD_DIR), service workers blocked, so the
// redirect allow list, cookies and storage behave as on the live site.
const URL = "https://oscarvelz.github.io/Vela/";
const BUILD_DIR = process.env.BUILD_DIR || "/workspace/work/ve-android-live/Vela";
import { readFileSync, existsSync } from "node:fs";
const MIME = { html: "text/html", js: "text/javascript", css: "text/css", svg: "image/svg+xml", png: "image/png", woff2: "font/woff2", webmanifest: "application/manifest+json", json: "application/json" };
async function serveBuild(ctx) {
  await ctx.route("https://oscarvelz.github.io/Vela/**", (r) => {
    let p = new globalThis.URL(r.request().url()).pathname.replace(/^\/Vela\//, "");
    if (!p || p.endsWith("/")) p += "index.html";
    const f = `${BUILD_DIR}/${p}`;
    if (!existsSync(f)) return r.fulfill({ status: 404, body: "nf" });
    r.fulfill({ status: 200, contentType: MIME[p.split(".").pop()] || "application/octet-stream", body: readFileSync(f) });
  });
}
import { execSync } from "node:child_process";
const SVC = process.env.SB_SERVICE_KEY_FILE ? readFileSync(process.env.SB_SERVICE_KEY_FILE, "utf8").trim() : "";
const SB = "https://bybldbmwxucdvhfqspnf.supabase.co";
// Admin calls (throwaway user only) through curl, which uses the sandbox proxy; the key is read from a file, never printed.
function admin(method, path, body) {
  const out = execSync(`curl -s -X ${method} ${SB}${path} -H "apikey: $K" -H "Authorization: Bearer $K" -H "Content-Type: application/json" ${body ? "--data-binary @-" : ""}`, { input: body ? JSON.stringify(body) : undefined, env: { ...process.env, K: SVC } }).toString();
  try { return JSON.parse(out || "{}"); } catch { return {}; }
}
const stamp = Date.now();
const EMAIL = `vela.test.${stamp}@example.com`;
const PW = "Tst-" + stamp + "-pw!";
const PASS = "amber-river-falcon-31";
const NAME = "Zephyrin Fakelive";
const res = []; const ok = (n, c, x = "") => { res.push(!!c); console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  — " + x : ""}`); };
const pu = new globalThis.URL(process.env.HTTPS_PROXY);
const browser = await chromium.launch({
  executablePath: "/workspace/work/browser-test/browsers/chromium_headless_shell-1155/chrome-linux/headless_shell",
  args: ["--no-sandbox"],
  proxy: { server: `${pu.protocol}//${pu.host}`, username: decodeURIComponent(pu.username), password: decodeURIComponent(pu.password), },
});
const uploads = [];
const APP_UA = "Mozilla/5.0 (Linux; Android 14; SM-S928U Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36 VelaAndroid/1.1";
const MOCK = () => {
  const nat = { auths: 0, webauthn: 0, answer: "ok" };
  window.__nat = nat;
  window.VelaNative = {
    version: () => "1.1", setBars() {}, setLang() {}, exitApp() {}, canAuth: () => "yes",
    authenticate: (id) => { nat.auths += 1; setTimeout(() => dispatchEvent(new CustomEvent("velanative-auth", { detail: { id, ok: nat.answer === "ok", code: nat.answer === "ok" ? "" : "cancel" } })), 120); },
    saveBegin: () => "error", saveChunk: () => "error", saveEnd: () => "error",
  };
  const c = navigator.credentials;
  if (c) for (const k of ["get", "create"]) { const f = c[k]?.bind(c); if (f) c[k] = (...a) => { nat.webauthn += 1; return f(...a); }; }
};
async function dev(w, app = false) {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: w, height: 900 }, ignoreHTTPSErrors: true, ...(app ? { userAgent: APP_UA, isMobile: true, hasTouch: true } : {}) });
  await serveBuild(ctx);
  if (app) await ctx.addInitScript(MOCK);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("pageerror", String(e)));
  page.on("request", (r) => { if (r.url().includes("/rest/v1/vela_vault") && r.postData()) uploads.push(r.postData()); });
  return { ctx, page };
}
const status = (p) => p.waitForFunction(() => document.querySelector('[data-testid="cloud-status"]')?.textContent?.includes("Saved to your account"), null, { timeout: 45000 });
async function openData(page) {
  if (!(await page.isVisible('button:has-text("Data & Backup")'))) await page.locator('button[aria-label="Open settings"]').dispatchEvent("click");
  const b = page.locator('button:has-text("Data & Backup")');
  if ((await b.getAttribute("aria-expanded")) !== "true") await b.click();
}
try {
  const A = await dev(412);
  await A.page.goto(URL, { waitUntil: "networkidle" });
  await A.page.click('button:has-text("Create account")');
  await A.page.fill("#account-email", EMAIL);
  await A.page.fill("#account-password", PW);
  await A.page.fill("#account-password2", PW);
  await A.page.locator('form button[type=submit]:has-text("Create account")').click();
  await A.page.waitForSelector(`text=${EMAIL}`, { timeout: 30000 });
  ok("A signed up on the live site", true, EMAIL);
  await A.page.waitForSelector("#create-pass", { timeout: 30000 });
  await A.page.fill("#create-pass", PASS); await A.page.fill("#create-pass2", PASS); await A.page.check("#pass-ack");
  await A.page.click('button[type=submit]:has-text("Create my private journal")');
  await A.page.waitForSelector(".ag-tabbar", { timeout: 30000 });
  await A.page.locator('.ag-tabbar button:has-text("Home")').dispatchEvent("click");
  await A.page.fill('input[placeholder="…or type a new name"]', NAME);
  await A.page.click('button:has-text("Save this moment")');
  await A.page.waitForTimeout(500);
  await openData(A.page); await A.page.click('button:has-text("Sync now")'); await status(A.page);
  ok("A's encrypted journal saved to the account", true);
  ok("no plaintext in uploads", uploads.length > 0 && uploads.every((b) => !b.includes("Zephyrin") && !b.includes("Fakelive")), `${uploads.length} uploads`);

  const B = await dev(412, true);
  await B.page.goto(URL, { waitUntil: "networkidle" });
  await B.page.fill("#account-email", EMAIL); await B.page.fill("#account-password", PW);
  await B.page.locator('form button[type=submit]:has-text("Sign in")').click();
  await B.page.waitForSelector("text=Your encrypted journal is in your account", { timeout: 45000 });
  ok("fresh app B (own storage) sees the encrypted journal after sign-in", true);
  await B.page.fill('input[placeholder="Enter your passphrase"]', PASS);
  await B.page.click('button:has-text("Open my journal")');
  await B.page.waitForSelector(".ag-tabbar", { timeout: 45000 });
  await B.page.locator('.ag-tabbar button:has-text("History")').dispatchEvent("click");
  await B.page.waitForTimeout(600);
  ok("app B decrypted A's entry with the passphrase", (await B.page.content()).includes(NAME));
  // The app lock: offered once, set up with the phone's prompt; then a fresh launch asks only the prompt.
  const offer = B.page.locator("[data-testid=bio-offer]");
  await offer.waitFor({ timeout: 8000 }).catch(() => undefined);
  ok("app B: app-lock offer after the passphrase", (await offer.count()) === 1);
  if (await offer.count()) { await B.page.click("[data-testid=bio-offer-yes]"); await B.page.waitForTimeout(900); }
  await B.page.goto(URL, { waitUntil: "networkidle" });
  await B.page.waitForSelector("[data-testid=bio-lock]", { timeout: 20000 });
  ok("app B fresh launch: locked behind the phone's prompt", true);
  await B.page.waitForFunction(() => window.__nat.auths > 0, null, { timeout: 8000 }).catch(() => undefined);
  await B.page.waitForSelector(".ag-tabbar", { timeout: 15000 }).catch(() => undefined);
  ok("app B: the prompt opens it, no passphrase", await B.page.isVisible(".ag-tabbar"));
  await B.page.locator('.ag-tabbar button:has-text("History")').dispatchEvent("click"); await B.page.waitForTimeout(600);
  ok("app B: entry still there after relaunch", (await B.page.content()).includes(NAME));
  ok("app B: no WebAuthn call", (await B.page.evaluate(() => window.__nat.webauthn)) === 0);

  // The sign-in email's link, as the app gets it: Supabase must send it back to vela://auth with the session in the
  // fragment; MainActivity.authUrl() then opens <home>#<fragment> in a fresh app (own storage).
  if (SVC) {
    const gen = admin("POST", "/auth/v1/admin/generate_link", { type: "magiclink", email: EMAIL, redirect_to: "vela://auth" });
    const link = gen.action_link || gen.properties?.action_link || "";
    ok("magic link generated with redirect vela://auth", link.includes("redirect_to=vela") || link.includes("redirect_to=vela%3A"), link.replace(/token=[^&]+/, "token=…"));
    const loc = execSync(`curl -s -o /dev/null -w '%{redirect_url}' ${JSON.stringify(link)}`).toString();
    // Supabase answers vela://auth/#… (with a slash); the app matches scheme+host only, so both forms open it.
    ok("Supabase sends the link back to vela://auth (allow list)", /^vela:\/\/auth\/?#access_token=/.test(loc), loc.slice(0, 40));
    const frag = loc.split("#")[1] || "";
    ok("fragment passes the app's filter (MainActivity.authUrl)", /^[A-Za-z0-9_.~%=&+\-]*$/.test(frag));
    const C = await dev(412, true);
    await C.page.goto(`${URL}#${frag}`, { waitUntil: "networkidle" });
    await C.page.waitForSelector("text=Your encrypted journal is in your account", { timeout: 45000 }).then(() => ok("fresh app C: signed in by the link, journal found", true), () => ok("fresh app C: signed in by the link, journal found", false));
    ok("app C: the session fragment is cleared from the address", !(await C.page.evaluate(() => location.hash.includes("access_token"))));
    await C.page.fill('input[placeholder="Enter your passphrase"]', PASS);
    await C.page.click('button:has-text("Open my journal")');
    await C.page.waitForSelector(".ag-tabbar", { timeout: 45000 });
    await C.page.locator('.ag-tabbar button:has-text("History")').dispatchEvent("click");
    await C.page.waitForTimeout(600);
    ok("app C decrypted the entry with the passphrase", (await C.page.content()).includes(NAME));
  }
} catch (e) { ok("flow", false, String(e).slice(0, 300)); }
await browser.close();
if (SVC) {
  // Delete the throwaway user (its vela_vault row goes with it) and check nothing is left.
  const list = admin("GET", `/auth/v1/admin/users?per_page=1000`);
  const u = (list.users || []).find((x) => x.email === EMAIL);
  if (u) admin("DELETE", `/auth/v1/admin/users/${u.id}`);
  const left = (admin("GET", `/auth/v1/admin/users?per_page=1000`).users || []).filter((x) => /^vela\.test\./.test(x.email || ""));
  const rows = execSync(`curl -s "${SB}/rest/v1/vela_vault?select=user_id&user_id=eq.${u?.id}" -H "apikey: $K" -H "Authorization: Bearer $K"`, { env: { ...process.env, K: SVC } }).toString();
  ok("throwaway user deleted, no vela.test users left", Boolean(u) && left.length === 0, `${left.length} left`);
  ok("its vela_vault row is gone", rows.trim() === "[]", rows.slice(0, 80));
}
console.log("EMAIL=" + EMAIL);
console.log(`${res.filter(Boolean).length}/${res.length} passed`);
