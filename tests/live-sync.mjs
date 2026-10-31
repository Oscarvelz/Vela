// Live test against https://oscarvelz.github.io/Vela/ + shared Supabase. Throwaway account, fake data.
import { chromium } from "/workspace/work/browser-test/node_modules/playwright-core/index.mjs";
const URL = "https://oscarvelz.github.io/Vela/";
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
  proxy: { server: `${pu.protocol}//${pu.host}`, username: decodeURIComponent(pu.username), password: decodeURIComponent(pu.password) },
});
const uploads = [];
async function dev(w) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, ignoreHTTPSErrors: true });
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

  const B = await dev(1366);
  await B.page.goto(URL, { waitUntil: "networkidle" });
  await B.page.fill("#account-email", EMAIL); await B.page.fill("#account-password", PW);
  await B.page.locator('form button[type=submit]:has-text("Sign in")').click();
  await B.page.waitForSelector("text=Your encrypted journal is in your account", { timeout: 45000 });
  ok("fresh browser B sees the encrypted journal after sign-in", true);
  await B.page.fill('input[placeholder="Enter your passphrase"]', PASS);
  await B.page.click('button:has-text("Open my journal")');
  await B.page.waitForSelector(".ag-tabbar", { timeout: 45000 });
  await B.page.locator('.ag-tabbar button:has-text("History")').dispatchEvent("click");
  await B.page.waitForTimeout(600);
  ok("B decrypted A's entry with the passphrase", (await B.page.content()).includes(NAME));
} catch (e) { ok("flow", false, String(e).slice(0, 300)); }
await browser.close();
console.log("EMAIL=" + EMAIL);
console.log(`${res.filter(Boolean).length}/${res.length} passed`);
