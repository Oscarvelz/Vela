// The offline door (Oscar, Nov 9 2026 — the rule he set for Brizna and Faro):
// the device remembers WHOSE journal it holds outside the account session, so a
// returning owner whose session ended (app closed with "keep me signed in" off,
// token expired, no signal) is met by the door — "your session ended, sign in
// again" — never by "create your profile" as if they were new. Only an explicit
// sign-out erases the mark. Runs against the mock build (fake SUPABASE_URL,
// served at http://localhost:8098/Vela/). Fake data only.
import { chromium } from "/workspace/work/browser-test/node_modules/playwright-core/index.mjs";

const URL = "http://localhost:8098/Vela/";
const UID = "11111111-2222-3333-4444-555555555555";
const results = [];
const ok = (name, cond, extra = "") => {
  results.push({ name, pass: Boolean(cond) });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

const SESSION = {
  access_token: "fake.jwt.token",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600 * 24,
  refresh_token: "fake-refresh",
  user: { id: UID, aud: "authenticated", role: "authenticated", email: "tester@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
};

async function handle(route) {
  const req = route.request();
  const u = new globalThis.URL(req.url());
  const json = (status, data) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
  if (u.pathname.startsWith("/auth/v1/token")) return json(200, SESSION);
  if (u.pathname.startsWith("/auth/v1/")) return json(200, {});
  if (u.pathname === "/rest/v1/vela_vault") return json(200, []);
  return json(404, { message: "nope" });
}

const browser = await chromium.launch({
  executablePath: "/workspace/work/browser-test/browsers/chromium_headless_shell-1155/chrome-linux/headless_shell",
  args: ["--no-sandbox", "--no-proxy-server"],
});

// First visit: sign in with "keep me signed in" OFF.
const ctx1 = await browser.newContext({ viewport: { width: 412, height: 900 }, serviceWorkers: "block" });
await ctx1.route("https://fakeproj.supabase.co/**", handle);
const p1 = await ctx1.newPage();
p1.on("pageerror", (e) => console.log("pageerror", String(e)));
await p1.goto(URL);
await p1.waitForSelector("#account-keep", { timeout: 30000 });
await p1.uncheck("#account-keep");
await p1.fill("#account-email", "tester@example.com");
await p1.fill("#account-password", "whatever-pass-1");
await p1.click('button[type=submit]:has-text("Sign in")');
await p1.waitForFunction(() => localStorage.getItem("vela.lastUser") !== null || sessionStorage.getItem("vela.lastUser") !== null, null, { timeout: 30000 });
const mark = await p1.evaluate(() => ({ local: localStorage.getItem("vela.lastUser"), session: sessionStorage.getItem("vela.lastUser") }));
ok("signed in with keep OFF, the owner mark is in localStorage", Boolean(mark.local && mark.local.includes(UID)), mark.local ?? "(none)");
ok("…and not in the session storage that dies with the app", mark.session === null);

// "Close the app": a fresh context with the same device storage. With keep OFF the
// session token lived in sessionStorage, which a closed app loses — nothing to strip.
const state = await ctx1.storageState();
const ctx2 = await browser.newContext({ viewport: { width: 412, height: 900 }, serviceWorkers: "block", storageState: state });
await ctx2.route("https://fakeproj.supabase.co/**", handle);
const p2 = await ctx2.newPage();
p2.on("pageerror", (e) => console.log("pageerror", String(e)));
await p2.goto(URL);
await p2.waitForSelector('[data-testid="finding"]', { timeout: 30000 });
ok("a returning owner is met by the door, not by 'create your profile'", !(await p2.$("#create-pass")));
const findingText = await p2.textContent('[data-testid="finding"]');
ok("it says the session ended and the diary is still here", findingText.includes("Your account session ended"), findingText.trim().slice(0, 80));

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
