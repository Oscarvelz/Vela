// Fingerprint unlock, end to end, with Chrome's virtual WebAuthn authenticator.
// Fake data only. Env: AG_URL, SHOTS, WIDTH (412|1366), PRF (1|0).
import { chromium } from "/workspace/work/browser-test/node_modules/playwright-core/index.mjs";
import { mkdirSync } from "node:fs";

const URL = process.env.AG_URL || "http://localhost:8191/Vela/";
const SHOTS = process.env.SHOTS || "/workspace/work/vela-fp/shots";
const WIDTH = Number(process.env.WIDTH || 412);
const PRF = process.env.PRF !== "0";
const PASS = "velvet-orbit-lantern-42";
const PASS2 = "copper-tide-meadow-77";
mkdirSync(SHOTS, { recursive: true });
const tag = `w${WIDTH}-${PRF ? "prf" : "devkey"}`;
const results = [];
const ok = (name, cond, extra = "") => {
  results.push({ name, pass: Boolean(cond) });
  console.log(`${cond ? "PASS" : "FAIL"}  ${tag} ${name}${extra ? "  — " + extra : ""}`);
};

const browser = await chromium.launch({
  executablePath: "/workspace/work/browser-test/browsers/chromium_headless_shell-1155/chrome-linux/headless_shell",
  args: ["--no-sandbox", "--no-proxy-server"],
});
const ctx = await browser.newContext({ viewport: { width: WIDTH, height: WIDTH < 600 ? 900 : 860 } });
// This suite checks the strictest lock flow: "Ask for my passphrase: Every time I open Vela".
// (The default, "Only when I lock it", is covered by tests/unlock-fix.mjs.)
await ctx.addInitScript(() => {
  if (!localStorage.getItem("vela_ask_pass")) localStorage.setItem("vela_ask_pass", "open");
});
const page = await ctx.newPage();
page.on("console", (m) => process.env.DEBUG && console.log("CONSOLE", m.text()));
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const cdp = await ctx.newCDPSession(page);
await cdp.send("WebAuthn.enable", { enableUI: false });
const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: {
    protocol: "ctap2",
    ctap2Version: "ctap2_1",
    transport: "internal",
    hasResidentKey: true,
    hasUserVerification: true,
    isUserVerified: true,
    automaticPresenceSimulation: true,
    hasPrf: PRF,
    hasLargeBlob: PRF,
  },
});
// "User cancels the fingerprint sheet": Chrome's virtual authenticator with PRF does not recover from a
// UV failure, so cancel is simulated by rejecting the request the way Chrome does (NotAllowedError).
await ctx.addInitScript(() => {
  const real = navigator.credentials.get.bind(navigator.credentials);
  navigator.credentials.get = (opts) =>
    sessionStorage.getItem("__cancelBio") === "1"
      ? Promise.reject(new DOMException("The operation either timed out or was not allowed.", "NotAllowedError"))
      : real(opts);
});
const setUV = (v) => page.evaluate((cancel) => (cancel ? sessionStorage.setItem("__cancelBio", "1") : sessionStorage.removeItem("__cancelBio")), !v);
void authenticatorId;
const typedPass = { n: 0 };
const bioRec = () => page.evaluate(() => JSON.parse(localStorage.getItem("vela-fingerprint") || "null"));
// Closing and reopening the installed app ends its session (sessionStorage), which also ends the
// pull-to-refresh grace. A reload without that would reopen through grace, not the lock screen.
const reopen = async () => {
  await page.evaluate(() => sessionStorage.removeItem("vela_grace"));
  await page.reload();
};
const unlockedSoon = (ms = 15000) =>
  page.waitForSelector(".ag-tabbar", { timeout: ms }).then(
    () => true,
    () => false,
  );

await page.goto(URL);
await page.waitForTimeout(2000);
await page.waitForSelector("#create-pass", { timeout: 20000 });
ok("platform authenticator visible to page", await page.evaluate(() => PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()));
await page.fill("#name", "Tester");
await page.fill("#create-pass", PASS);
await page.fill("#create-pass2", PASS);
await page.check("#pass-ack");
await page.click('button[type=submit]:has-text("Create my private journal")');
await page.waitForSelector(".ag-tabbar", { timeout: 30000 });

// 1. one-tap offer after the first unlock
const offered = await page.waitForSelector('[data-testid="bio-offer"]', { timeout: 8000 }).then(() => true, () => false);
ok("one-tap offer appears after creating/unlocking with passphrase", offered);
await page.waitForTimeout(400);
await page.screenshot({ path: `${SHOTS}/${tag}-offer.png` });
await page.click('[data-testid="bio-offer-yes"]');
await page.waitForSelector('[data-testid="bio-offer"]', { state: "detached", timeout: 15000 });
let rec = await bioRec();
ok("enrolled with one tap", Boolean(rec?.credentialId), rec ? `prf=${rec.prf}` : "no record");
ok(`wrap mode is ${PRF ? "PRF" : "device key"}`, rec && rec.prf === PRF);
ok("record holds no plaintext passphrase", !JSON.stringify(rec).includes(PASS));
ok("toast confirms", (await page.content()).includes("Fingerprint saved"));

// 2. reload (like reopening the app) → auto fingerprint → open, nothing typed
await reopen();
ok("reopen: fingerprint unlocks with no passphrase typed", await unlockedSoon());
ok("no offer once enrolled", !(await page.isVisible('[data-testid="bio-offer"]')));

// 3. lock (manual, same path as auto-lock) → auto fingerprint resumes
await page.click('button[aria-label="Open settings"]');
if (!(await page.isVisible('button:has-text("Lock now")'))) await page.click('button:has-text("Profile")');
await page.click('button:has-text("Lock now")');
await page.waitForSelector('[data-testid="bio-lock"], .ag-tabbar', { timeout: 10000 });
ok("after lock: fingerprint resumes automatically", await unlockedSoon());

// 4. cancelled fingerprint → lock screen with big button + passphrase fallback
await setUV(false);
await reopen();
await page.waitForSelector('[data-testid="bio-lock"]', { timeout: 15000 });
await page.waitForSelector('text=Tap the fingerprint to try again', { timeout: 15000 });
await page.waitForTimeout(300);
ok("cancel leaves the journal locked", !(await page.isVisible(".ag-tabbar")));
await page.screenshot({ path: `${SHOTS}/${tag}-lock.png` });
ok("lock screen still offers the fingerprint button", await page.isVisible('[data-testid="bio-unlock"]'));
await page.click('[data-testid="use-pass"]');
await page.fill("#unlock-pass", PASS);
typedPass.n++;
await page.screenshot({ path: `${SHOTS}/${tag}-lock-pass.png` });
await page.click('button[type=submit]:has-text("Unlock")');
ok("passphrase fallback opens", await unlockedSoon());
ok("fingerprint kept after a passphrase unlock", Boolean((await bioRec())?.credentialId));

// retry button after cancel
await setUV(false);
await reopen();
await page.waitForSelector('[data-testid="bio-lock"]', { timeout: 15000 });
await page.waitForSelector('text=Tap the fingerprint to try again', { timeout: 15000 });
await setUV(true);
await page.click('[data-testid="bio-unlock"]');
const retried = await unlockedSoon();
if (!retried) {
  console.log("DEBUG", await page.evaluate(() => document.querySelector('[data-testid="bio-lock"]')?.innerText), await page.evaluate(() => document.hasFocus()));
  await page.screenshot({ path: `${SHOTS}/${tag}-debug.png` });
}
ok("tap the big button to retry → opens", retried);

// 5. passphrase change → fingerprint re-sealed, still unlocks with the NEW passphrase
await page.click('button[aria-label="Open settings"]');
await page.waitForTimeout(300);
if (!(await page.isVisible('[data-testid="bio-settings"]'))) await page.click('button:has-text("Privacy & Security")');
await page.waitForSelector('[data-testid="bio-settings"]');
await page.screenshot({ path: `${SHOTS}/${tag}-settings.png` });
const before = await bioRec();
await page.fill('input[placeholder="Current passphrase"] >> nth=0', PASS);
await page.fill('input[placeholder="New passphrase (at least 8 characters)"]', PASS2);
await page.click('button:has-text("Change and re-encrypt")');
await page.waitForFunction(
  (old) => {
    const r = JSON.parse(localStorage.getItem("vela-fingerprint") || "null");
    return r && r.data !== old;
  },
  before.data,
  { timeout: 20000 },
).catch(() => undefined);
const after = await bioRec();
ok("passphrase change re-seals the fingerprint (same credential)", after && after.credentialId === before.credentialId && after.data !== before.data);
await page.waitForTimeout(1500);
await reopen();
ok("after passphrase change, fingerprint opens (new passphrase sealed)", await unlockedSoon());
const pass2Works = await page.evaluate((p) => window.__velaVerify?.(p), PASS2);
void pass2Works;

// 6. service-worker update / cache wipe keeps enrollment
await page.evaluate(async () => {
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map((r) => r.unregister()));
  const keys = await caches.keys();
  await Promise.all(keys.map((k) => caches.delete(k)));
});
await reopen();
ok("SW unregistered + caches wiped: fingerprint still opens", await unlockedSoon());

// 7. Settings: turn off → passphrase only; turn on again → one tap (session passphrase)
await page.click('button[aria-label="Open settings"]');
await page.waitForTimeout(300);
if (!(await page.isVisible('[data-testid="bio-settings"]'))) await page.click('button:has-text("Privacy & Security")');
await page.click('[data-testid="bio-settings"] button[role=switch]');
await page.click('button:has-text("Remove fingerprint")');
await page.waitForTimeout(300);
ok("switch off removes it", !(await bioRec()));
await page.click('[data-testid="bio-settings"] button[role=switch]');
await page.waitForFunction(() => Boolean(localStorage.getItem("vela-fingerprint")), null, { timeout: 15000 }).catch(() => undefined);
ok("switch on again with one tap (no passphrase field)", Boolean(await bioRec()));
await page.screenshot({ path: `${SHOTS}/${tag}-settings-on.png` });

// 8. stale record (wrong passphrase sealed) → cleared, passphrase path, re-offer after unlock
await page.evaluate(() => {
  const r = JSON.parse(localStorage.getItem("vela-fingerprint"));
  r.data = r.data.slice(0, -4) + (r.data.endsWith("AAAA") ? "BBBB" : "AAAA");
  localStorage.setItem("vela-fingerprint", JSON.stringify(r));
  localStorage.removeItem("vela-bio-skip");
});
await reopen();
await page.waitForSelector("#unlock-pass", { timeout: 15000 });
ok("broken record falls back to passphrase with a message", (await page.content()).includes("fingerprint") || (await page.content()).includes("Fingerprint"));
await page.fill("#unlock-pass", PASS2);
await page.click('button[type=submit]:has-text("Unlock")');
await unlockedSoon();
ok("re-enroll offer appears after the passphrase unlock", await page.waitForSelector('[data-testid="bio-offer"]', { timeout: 8000 }).then(() => true, () => false));
await page.click('[data-testid="bio-offer-yes"]');
await page.waitForSelector('[data-testid="bio-offer"]', { state: "detached", timeout: 15000 });
await reopen();
ok("re-enrolled: fingerprint opens again", await unlockedSoon());

ok("no page errors", errors.length === 0, errors.join(" | "));
await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${tag}: ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
