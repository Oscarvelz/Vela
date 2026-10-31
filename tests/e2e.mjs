// End-to-end check of the built app (docs/) served at http://localhost:8097/Vela/.
// Uses only fake data. Run: LD_LIBRARY_PATH=... node tests/e2e.mjs
import { chromium } from "/workspace/work/browser-test/node_modules/playwright-core/index.mjs";
import { mkdirSync, readFileSync } from "node:fs";

const URL = process.env.AG_URL || "http://localhost:8097/Vela/";
const PASS = "velvet-orbit-lantern-42";
const PASS2 = "copper-tide-meadow-77";
const PARTNER = "Zephyrine Fakename";
const NOTE = "Moonlit-fake-note-4821";
const LEGACY_PARTNER = "Legacyperson Fakeson";
const LEGACY_NOTE = "OldPlainNote-9917";
const SHOTS = process.env.SHOTS || "/workspace/work/vela/tests/shots";
mkdirSync(SHOTS, { recursive: true });

const results = [];
const ok = (name, cond, extra = "") => {
  results.push({ name, pass: Boolean(cond), extra });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

const browser = await chromium.launch({
  executablePath: "/workspace/work/browser-test/browsers/chromium_headless_shell-1155/chrome-linux/headless_shell",
  args: ["--no-sandbox", "--no-proxy-server"],
});

async function dumpStorage(page) {
  return page.evaluate(async () => {
    const ls = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      ls[k] = localStorage.getItem(k);
    }
    const dbs = (await indexedDB.databases?.()) || [{ name: "vela-vault" }, { name: "vela-bio" }];
    const idb = {};
    for (const { name } of dbs) {
      if (!name) continue;
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open(name);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      for (const store of db.objectStoreNames) {
        const all = await new Promise((res) => {
          const tx = db.transaction(store, "readonly");
          const out = {};
          const c = tx.objectStore(store).openCursor();
          c.onsuccess = () => {
            const cur = c.result;
            if (!cur) return res(out);
            try {
              out[String(cur.key)] = JSON.parse(JSON.stringify(cur.value));
            } catch {
              out[String(cur.key)] = String(cur.value);
            }
            cur.continue();
          };
        });
        idb[`${name}/${store}`] = all;
      }
      db.close();
    }
    return { ls, idb };
  });
}

// Reopening the app ends its session (sessionStorage), which also ends the pull-to-refresh grace.
async function reopen(page) {
  await page.evaluate(() => sessionStorage.removeItem("vela_grace")).catch(() => undefined);
  await page.reload();
}

async function createJournal(page, pass) {
  await page.fill("#name", "Tester");
  await page.fill("#create-pass", pass);
  await page.fill("#create-pass2", pass);
  await page.check("#pass-ack");
  await page.click('button[type=submit]:has-text("Create my private journal")');
  await page.waitForSelector(".ag-tabbar", { timeout: 30000 });
}

async function unlock(page, pass) {
  await page.waitForSelector("#unlock-pass", { timeout: 20000 });
  await page.fill("#unlock-pass", pass);
  await page.click('button[type=submit]:has-text("Unlock")');
}

for (const width of (process.env.WIDTHS ? process.env.WIDTHS.split(",").map(Number).filter(Boolean) : [412, 1366])) {
  const tag = `w${width}`;
  const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 900 : 860 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(URL);
  await page.waitForSelector("#create-pass", { timeout: 20000 });
  ok(`${tag} offline-only state shown (placeholders)`, await page.isVisible('[data-testid="cloud-off"]'));
  ok(`${tag} forgotten-passphrase warning shown`, (await page.textContent('[data-testid="pass-warning"]')).includes("cannot be recovered"));
  await page.screenshot({ path: `${SHOTS}/${tag}-setup.png`, fullPage: true });

  // mismatch + ack guard
  await page.fill("#create-pass", PASS);
  await page.fill("#create-pass2", PASS + "x");
  await page.click('button[type=submit]:has-text("Create my private journal")');
  ok(`${tag} mismatched passphrase rejected`, (await page.textContent('[role=alert]')).includes("don't match"));

  await createJournal(page, PASS);
  ok(`${tag} journal created and opened`, true);

  // add an entry with fake data
  await page.fill('input[placeholder="…or type a new name"]', PARTNER);
  await page.fill('textarea[placeholder="Anything you want to remember…"]', NOTE);
  await page.click('button:has-text("Save this moment")');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/${tag}-home.png`, fullPage: true });
  ok(`${tag} entry visible after save`, (await page.content()).includes(PARTNER));
  await page.waitForTimeout(600); // let the encrypted write land

  const s1 = await dumpStorage(page);
  const blob1 = JSON.stringify(s1);
  ok(`${tag} storage has encrypted vault`, Boolean(s1.idb["vela-vault/kv"]?.vault?.envelope?.ciphertext));
  ok(`${tag} no plaintext partner/notes in localStorage+IndexedDB`, !blob1.includes("Zephyrine") && !blob1.includes("Moonlit") && !blob1.includes("Tester"));
  ok(`${tag} old plaintext key absent`, !("afterglow_pwa_v1" in s1.ls));

  // reload → locked
  await reopen(page);
  await page.waitForSelector("#unlock-pass", { timeout: 20000 });
  ok(`${tag} reload shows lock screen`, !(await page.isVisible(".ag-tabbar")));
  ok(`${tag} locked page has no diary text`, !(await page.content()).includes(PARTNER));
  await page.screenshot({ path: `${SHOTS}/${tag}-locked.png`, fullPage: true });

  // wrong passphrase
  await unlock(page, "wrong-passphrase-000");
  await page.waitForSelector('[role=alert]', { timeout: 20000 });
  ok(`${tag} wrong passphrase refused`, (await page.textContent('[role=alert]')).includes("didn't open"));

  // unlock
  await unlock(page, PASS);
  await page.waitForSelector(".ag-tabbar", { timeout: 30000 });
  await page.click('.ag-tabbar button:has-text("History")');
  await page.waitForTimeout(500);
  const hist = await page.content();
  ok(`${tag} entry present after unlock (partner + note)`, hist.includes(PARTNER) && hist.includes(NOTE));
  await page.screenshot({ path: `${SHOTS}/${tag}-history.png`, fullPage: true });

  if (width === 412) {
    // encrypted backup export
    await page.click('button[aria-label="Open settings"]');
    await page.click('button:has-text("Data & Backup")');
    ok(`${tag} settings shows cloud-not-set-up note`, await page.isVisible('[data-testid="cloud-off"]'));
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click('button:has-text("Export encrypted backup")')]);
    const file = readFileSync(await dl.path(), "utf8");
    const parsed = JSON.parse(file);
    ok(`${tag} backup file is encrypted`, parsed.kind === "vela-encrypted-backup" && parsed.ciphertext && !file.includes("Zephyrine") && !file.includes("Moonlit"));

    // change passphrase
    await page.click('button:has-text("Privacy & Security")');
    await page.fill('input[placeholder="Current passphrase"] >> nth=0', PASS);
    await page.fill('input[placeholder="New passphrase (at least 8 characters)"]', PASS2);
    await page.click('button:has-text("Change and re-encrypt")');
    await page.waitForTimeout(2500);
    await reopen(page);
    await unlock(page, PASS);
    await page.waitForSelector('[role=alert]', { timeout: 20000 });
    ok(`${tag} old passphrase no longer opens after change`, true);
    await unlock(page, PASS2);
    await page.waitForSelector(".ag-tabbar", { timeout: 30000 });
    await page.click('.ag-tabbar button:has-text("History")');
    ok(`${tag} new passphrase opens re-encrypted journal`, (await page.content()).includes(PARTNER));

    // backup import into a journal now keyed with PASS2 → needs the old passphrase
    page.once("dialog", (d) => d.accept(PASS));
    await page.click('button[aria-label="Open settings"]');
    await page.click('button:has-text("Data & Backup")');
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.click('button:has-text("Import backup")')]);
    await chooser.setFiles(await dl.path());
    await page.waitForTimeout(3000);
    ok(`${tag} encrypted backup import (old passphrase) works`, (await page.content()).includes("Imported"));

    // offline: service worker serves the app
    await page.waitForTimeout(500);
    const controlled = await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      return Boolean(navigator.serviceWorker.controller) || "ready";
    });
    ok(`${tag} service worker active`, Boolean(controlled), String(controlled));
    await ctx.setOffline(true);
    await reopen(page);
    await unlock(page, PASS2);
    await page.waitForSelector(".ag-tabbar", { timeout: 30000 });
    await page.click('.ag-tabbar button:has-text("History")');
    ok(`${tag} app opens and unlocks fully offline`, (await page.content()).includes(PARTNER));
    await ctx.setOffline(false);
  }
  ok(`${tag} no page errors`, errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// legacy plaintext migration
if (!process.env.SKIP_LEGACY) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(URL);
  await page.evaluate(
    ([p, n]) => {
      localStorage.setItem(
        "afterglow_pwa_v1",
        JSON.stringify({
          profile: { displayName: "Old", pinHash: "x", salt: "y", createdAt: 1 },
          settings: { language: "en" },
          partners: [p],
          sessions: [{ id: "legacy1", createdAt: 1700000000000, date: "2026-01-02", time: "21:00", partnerName: p, place: "Bedroom", ownWords: n, notes: "" }],
          encounters: [],
          updatedAt: 1,
        }),
      );
    },
    [LEGACY_PARTNER, LEGACY_NOTE],
  );
  await reopen(page);
  await page.waitForSelector('[data-testid="legacy-setup"]', { timeout: 20000 });
  ok("legacy plaintext journal detected at setup", true);
  await createJournal(page, PASS);
  await page.click('.ag-tabbar button:has-text("History")');
  await page.waitForTimeout(500);
  ok("legacy entry imported", (await page.content()).includes(LEGACY_PARTNER));
  await page.waitForTimeout(600);
  const s = JSON.stringify(await dumpStorage(page));
  ok("legacy plaintext deleted, nothing readable stored", !s.includes("afterglow_pwa_v1") && !s.includes("Legacyperson") && !s.includes("OldPlainNote"));
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
