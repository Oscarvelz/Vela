// Two-device sync test against an in-memory mock of the Supabase REST API
// (build made with a fake SUPABASE_URL, served at http://localhost:8098/Vela/).
// Checks: upload is ciphertext only, new-device open from cloud, conflict merge,
// offline queue, passphrase changed on another device. Fake data only.
import { chromium } from "/workspace/work/browser-test/node_modules/playwright-core/index.mjs";

const URL = "http://localhost:8098/Vela/";
const UID = "11111111-2222-3333-4444-555555555555";
const PASS = "amber-river-falcon-31";
const PASS_NEW = "silver-cedar-harbor-58";
const results = [];
const ok = (name, cond, extra = "") => {
  results.push({ name, pass: Boolean(cond) });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

let row = null;
const bodies = [];
let conflicts = 0;
let raceOnce = false;

async function handle(route) {
  const req = route.request();
  const u = new globalThis.URL(req.url());
  const json = (status, data) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
  if (u.pathname.startsWith("/auth/v1/")) return json(200, {});
  if (u.pathname !== "/rest/v1/vela_vault") return json(404, { message: "nope" });
  const method = req.method();
  if (method === "GET") {
    if (row && u.searchParams.get("user_id") === `eq.${UID}`) {
      const { ciphertext, iv, salt, kdf, version, revision, updated_at } = row;
      return json(200, [{ ciphertext, iv, salt, kdf, version, revision, updated_at }]);
    }
    return json(200, []);
  }
  const body = req.postData() || "";
  bodies.push(body);
  const data = JSON.parse(body);
  if (method === "POST") {
    if (row) {
      conflicts += 1;
      return json(409, { code: "23505", message: "duplicate key value violates unique constraint", details: "", hint: "" });
    }
    row = { ...data, user_id: UID, revision: 1, updated_at: new Date().toISOString() };
    return json(201, [{ revision: 1 }]);
  }
  if (method === "PATCH") {
    const base = Number((u.searchParams.get("revision") || "").replace("eq.", ""));
    if (raceOnce && row) {
      // Simulate another device writing between this device's pull and push.
      raceOnce = false;
      row = { ...row, revision: row.revision + 1 };
    }
    if (!row || row.revision !== base) {
      conflicts += 1;
      return json(200, []);
    }
    if (data.revision !== base + 1) return json(400, { code: "40001", message: "revision must step by one" });
    row = { ...row, ...data, updated_at: new Date().toISOString() };
    return json(200, [{ revision: row.revision }]);
  }
  return json(405, {});
}

const browser = await chromium.launch({
  executablePath: "/workspace/work/browser-test/browsers/chromium_headless_shell-1155/chrome-linux/headless_shell",
  args: ["--no-sandbox", "--no-proxy-server"],
});

async function device(width) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block" }); // SW first-install reload raced the form fill on localhost
  await ctx.route("https://fakeproj.supabase.co/**", handle);
  const session = {
    access_token: "fake.jwt.token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600 * 24,
    refresh_token: "fake-refresh",
    user: { id: UID, aud: "authenticated", role: "authenticated", email: "tester@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
  };
  await ctx.addInitScript((s) => {
    if (!localStorage.getItem("vela-auth")) localStorage.setItem("vela-auth", s);
  }, JSON.stringify(session));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("pageerror", String(e)));
  return { ctx, page };
}

async function addEntry(page, partner) {
  await page.locator('.ag-tabbar button:has-text("Home")').dispatchEvent("click");
  await page.waitForTimeout(200);
  await page.fill('input[placeholder="…or type a new name"]', partner);
  await page.click('button:has-text("Save this moment")');
  await page.waitForTimeout(300);
}
async function openData(page) {
  if (!(await page.isVisible('button:has-text("Data & Backup")'))) await page.locator('button[aria-label="Open settings"]').dispatchEvent("click");
  const btn = page.locator('button:has-text("Data & Backup")');
  if ((await btn.getAttribute("aria-expanded")) !== "true") await btn.click();
  if (process.env.DBG) { await page.waitForTimeout(800); console.log("expanded after click:", await btn.getAttribute("aria-expanded")); }
}
async function syncAndWait(page) {
  await openData(page);
  if (!(await page.isVisible('button:has-text("Sync now")'))) {
    await page.screenshot({ path: "/workspace/work/vela/tests/shots/debug-sync.png", fullPage: true });
    console.log("DEBUG sections:", await page.evaluate(() => [...document.querySelectorAll("section button[aria-expanded]")].map((b) => b.textContent + ":" + b.getAttribute("aria-expanded")).join(" | ")));
  }
  await page.click('button:has-text("Sync now")');
  await page.waitForFunction(() => document.querySelector('[data-testid="cloud-status"]')?.textContent?.includes("Saved to your account"), null, { timeout: 30000 });
}
async function historyHas(page, ...names) {
  await page.locator('.ag-tabbar button:has-text("History")').dispatchEvent("click");
  await page.waitForTimeout(300);
  const html = await page.content();
  return names.every((n) => html.includes(n));
}

// Device A creates the journal and uploads it.
const A = await device(412);
await A.page.goto(URL);
await A.page.waitForSelector("#create-pass");
await A.page.fill("#create-pass", PASS);
await A.page.fill("#create-pass2", PASS);
await A.page.check("#pass-ack");
await A.page.click('button[type=submit]:has-text("Create my private journal")');
await A.page.waitForSelector(".ag-tabbar");
await addEntry(A.page, "Alphonse Fakeone");
await syncAndWait(A.page);
ok("A uploaded a row", row && row.revision >= 1, `revision ${row?.revision}`);
const keys = row ? Object.keys(row).sort().join(",") : "";
ok("row holds only ciphertext/iv/salt/kdf/version/revision", keys === "ciphertext,iv,kdf,revision,salt,updated_at,user_id,version", keys);
ok("no plaintext in any upload", bodies.every((b) => !b.includes("Alphonse") && !b.includes("Fakeone")));
ok("kdf is PBKDF2-SHA256 ≥ 310k", row.kdf.name === "PBKDF2" && row.kdf.hash === "SHA-256" && row.kdf.iterations >= 310000, JSON.stringify(row.kdf));

// Device B opens the account's journal with the passphrase.
const B = await device(1366);
await B.page.goto(URL);
await B.page.waitForSelector('text=Your encrypted journal is in your account', { timeout: 30000 });
ok("B sees the encrypted journal in the account", true);
await B.page.fill('input[placeholder="Enter your passphrase"]', PASS);
await B.page.click('button:has-text("Open my journal")');
await B.page.waitForSelector(".ag-tabbar", { timeout: 30000 });
ok("B opened A's entry", await historyHas(B.page, "Alphonse Fakeone"));

// B adds; A adds on a stale revision → conflict → pull, merge, retry.
await addEntry(B.page, "Beatrix Faketwo");
await syncAndWait(B.page);
const revAfterB = row.revision;
const conflictsBefore = conflicts;
raceOnce = true;
await addEntry(A.page, "Cassius Fakethree");
await syncAndWait(A.page);
ok("A hit a conflict and recovered", conflicts > conflictsBefore && row.revision > revAfterB, `conflicts ${conflicts}, rev ${row.revision}`);
ok("A merged B's entry with its own", await historyHas(A.page, "Alphonse Fakeone", "Beatrix Faketwo", "Cassius Fakethree"));
await syncAndWait(B.page);
ok("B received A's entry", await historyHas(B.page, "Cassius Fakethree", "Beatrix Faketwo"));

// Offline queue on B.
await B.ctx.setOffline(true);
await addEntry(B.page, "Dorian Fakefour");
await openData(B.page);
await B.page.waitForTimeout(1500);
const offlineText = await B.page.textContent('[data-testid="cloud-status"]').catch(() => "");
ok("B shows offline state while offline", offlineText.includes("Offline"), offlineText);
const revOffline = row.revision;
await B.ctx.setOffline(false);
await B.page.waitForFunction(() => document.querySelector('[data-testid="cloud-status"]')?.textContent?.includes("Saved to your account"), null, { timeout: 30000 });
ok("B synced the offline edit on reconnect", row.revision > revOffline);
await syncAndWait(A.page);
ok("A received B's offline entry", await historyHas(A.page, "Dorian Fakefour"));

// Passphrase changed on A → B must enter the new passphrase, then merges.
if (!(await A.page.isVisible('button:has-text("Privacy & Security")'))) await A.page.locator('button[aria-label="Open settings"]').dispatchEvent("click");
await A.page.click('button:has-text("Privacy & Security")');
await A.page.fill('input[placeholder="Current passphrase"] >> nth=0', PASS);
await A.page.fill('input[placeholder="New passphrase (at least 8 characters)"]', PASS_NEW);
await A.page.click('button:has-text("Change and re-encrypt")');
await A.page.waitForTimeout(4000);
const saltAfter = row.salt;
await addEntry(B.page, "Evander Fakefive");
await openData(B.page);
await B.page.click('button:has-text("Sync now")');
await B.page.waitForSelector('input[placeholder="Passphrase of the account journal"]', { timeout: 30000 });
ok("B asks for the passphrase changed elsewhere", true);
await B.page.fill('input[placeholder="Passphrase of the account journal"]', PASS_NEW);
await B.page.click('button:has-text("Open and merge")');
await B.page.waitForFunction(() => document.querySelector('[data-testid="cloud-status"]')?.textContent?.includes("Saved to your account"), null, { timeout: 30000 });
ok("B merged and now uses the new key", row.salt === saltAfter);
await syncAndWait(A.page);
ok("A got B's entry made before the re-key", await historyHas(A.page, "Evander Fakefive"));
ok("still no plaintext in any upload", bodies.every((b) => !/Fake(one|two|three|four|five)/.test(b)));

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
