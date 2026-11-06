// Vela for Android bridge (native.ts) in a simulated WebView: a mock window.VelaNative + the app's user agent.
// Fake data only. Also checks that a plain browser (desktop and Android Chrome) is unchanged.
// Run: VELA_PORT=8143 node tests/android-bridge.mjs   (E2E build served at 127.0.0.1:<port>/Vela/)
import { chromium } from "/workspace/work/browser-test/node_modules/playwright-core/index.mjs";
const URL = `http://127.0.0.1:${process.env.VELA_PORT || 8143}/Vela/`;
const PASS = "fake-orbit-lantern-42";
let fails = 0;
const ok = (n, c, x = "") => { if (!c) fails++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  " + JSON.stringify(x)}`); };
const browser = await chromium.launch({ executablePath: "/workspace/work/browser-test/browsers/chromium_headless_shell-1155/chrome-linux/headless_shell", args: ["--no-sandbox", "--no-proxy-server"] });

const APP_UA = "Mozilla/5.0 (Linux; Android 14; SM-S928U Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36 VelaAndroid/1.1";
const CHROME_ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; SM-S928U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

// The mock app: records every call in localStorage-free memory (window.__nat) and answers the prompt like the phone.
const MOCK = () => {
  const nat = { bars: [], lang: [], exits: 0, auths: 0, saves: [], answer: "ok", canAuth: "yes", webauthn: 0 };
  window.__nat = nat;
  try {
    const raw = sessionStorage.getItem("__natcfg");
    if (raw) Object.assign(nat, JSON.parse(raw));
  } catch {}
  const chunks = {};
  window.VelaNative = {
    version: () => "1.1",
    versionCode: () => 1,
    setBars: (t, b, dt, db) => nat.bars.push([t, b, dt, db]),
    setLang: (l) => nat.lang.push(l),
    exitApp: () => { nat.exits += 1; },
    canAuth: () => nat.canAuth,
    authenticate: (id) => {
      nat.auths += 1;
      setTimeout(() => dispatchEvent(new CustomEvent("velanative-auth", { detail: { id, ok: nat.answer === "ok", code: nat.answer === "ok" ? "" : nat.answer } })), 120);
    },
    saveBegin: (name, mime) => { const id = "s" + nat.saves.length; nat.saves.push({ name, mime, bytes: 0, done: false }); chunks[id] = nat.saves.length - 1; return id; },
    saveChunk: (id, b64) => { nat.saves[chunks[id]].bytes += atob(b64).length; return "ok"; },
    saveEnd: (id) => { nat.saves[chunks[id]].done = true; return "ok"; },
  };
  // WebAuthn must never be used inside the app.
  if (navigator.credentials) {
    const c = navigator.credentials;
    const wrap = (k) => { const f = c[k]?.bind(c); if (f) c[k] = (...a) => { nat.webauthn += 1; return f(...a); }; };
    wrap("get"); wrap("create");
  }
};

async function setup(page) {
  await page.goto(URL);
  await page.waitForSelector("#name", { timeout: 20000 });
  await page.fill("#name", "Tester"); await page.fill("#create-pass", PASS); await page.fill("#create-pass2", PASS);
  await page.check("#pass-ack"); await page.click("button[type=submit]");
  await page.waitForSelector(".ag-tabbar", { timeout: 30000 }); await page.waitForTimeout(700);
}
const nat = (page) => page.evaluate(() => window.__nat);
const state = (page) => page.evaluate(() => { const s = window.__velaStore.getState(); return { unlocked: s.unlocked, tab: s.tab, settings: s.settingsOpen, vault: s.vault, keyParked: s.keyParked }; });

/* ───────── 1. Plain browsers: nothing changes ───────── */
{
  const ctx = await browser.newContext({ userAgent: DESKTOP_UA, viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  await setup(page);
  const info = await page.evaluate(() => ({ back: typeof window.VelaBack, android: document.documentElement.hasAttribute("data-android"), native: typeof window.VelaNative }));
  ok("desktop browser: no bridge, no VelaBack, no data-android", info.back === "undefined" && !info.android && info.native === "undefined", info);
  await page.evaluate(() => window.__velaStore.getState().setSettingsOpen(true)); await page.waitForTimeout(400);
  ok("desktop browser: no 'Install the Android app' entry", (await page.getByText("Install the Android app").count()) === 0);
  let otp = null;
  await page.route("**/auth/v1/otp**", (r) => { otp = r.request().url(); r.fulfill({ status: 200, contentType: "application/json", body: "{}" }); });
  await ctx.close();
}
{
  const ctx = await browser.newContext({ userAgent: CHROME_ANDROID_UA, viewport: { width: 412, height: 900 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await setup(page);
  await page.evaluate(() => window.__velaStore.getState().setSettingsOpen(true)); await page.waitForTimeout(400);
  const entry = page.getByText("Install the Android app");
  ok("Android Chrome: 'Install the Android app' entry is there", (await entry.count()) === 1);
  await entry.click(); await page.waitForTimeout(300);
  ok("Android Chrome: the entry explains and offers Vela.apk", (await page.locator("[data-testid=android-app]").count()) === 1 && (await page.getByText("Download Vela.apk").count()) === 1);
  let apk = null;
  await page.route("https://github.com/**", (r) => { apk = r.request().url(); r.abort(); });
  await page.getByText("Download Vela.apk").click(); await page.waitForTimeout(800);
  ok("Android Chrome: Download goes to the latest Vela.apk", apk === "https://github.com/Oscarvelz/Vela/releases/latest/download/Vela.apk", apk);
  // Spanish copy
  await page.goto(URL); await page.waitForTimeout(500);
  await ctx.close();
}

/* ───────── 2. Inside the app (mock bridge) ───────── */
const ctx = await browser.newContext({ userAgent: APP_UA, viewport: { width: 412, height: 900 }, isMobile: true, hasTouch: true });
await ctx.addInitScript(MOCK);
const page = await ctx.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
await setup(page);
let n = await nat(page);
ok("app: bridge on (VelaBack, data-android)", await page.evaluate(() => typeof window.VelaBack === "function" && document.documentElement.hasAttribute("data-android")));
await page.waitForTimeout(400);
n = await nat(page);
ok("app: bar colours sent (navy night, dark)", n.bars.length > 0 && n.bars.some(([t, , dt]) => t.replace(/\s/g, "") === "rgb(13,22,54)" && dt === true), n.bars.slice(-3));
ok("app: page language sent", n.lang.includes("en"), n.lang);

// App lock offer → the phone's own prompt (no WebAuthn).
const offer = page.locator("[data-testid=bio-offer]");
await offer.waitFor({ timeout: 6000 }).catch(() => undefined);
ok("app: the app-lock offer shows (the phone can lock)", (await offer.count()) === 1);
ok("app: no re-seal offer mode in the app", (await offer.getAttribute("data-reseal").catch(() => null)) === "false");
await page.click("[data-testid=bio-offer-yes]"); await page.waitForTimeout(900);
n = await nat(page);
const rec = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("vela.lock.")).map((k) => [k, localStorage.getItem(k)]));
ok("app: setup asked the phone's prompt once", n.auths === 1, n.auths);
ok("app: lock recorded as the phone's prompt", rec.some(([, v]) => (v || "").includes("android-prompt")), rec);
ok("app: no WebAuthn call", n.webauthn === 0, n.webauthn);
ok("app: still open after setup", (await state(page)).unlocked);

// Back: Settings → closes; another tab → Home; Home → exitApp.
await page.evaluate(() => window.__velaStore.getState().setSettingsOpen(true)); await page.waitForTimeout(300);
ok("app: Install entry hidden inside the app", (await page.getByText("Install the Android app").count()) === 0);
let r = await page.evaluate(() => window.VelaBack()); await page.waitForTimeout(300);
ok("app back: Settings closes", r === "ok" && !(await state(page)).settings, { r, s: await state(page) });
await page.click("[data-tab=calendar]"); await page.waitForTimeout(300);
r = await page.evaluate(() => window.VelaBack()); await page.waitForTimeout(300);
ok("app back: Calendar → Home", r === "ok" && (await state(page)).tab === "home", { r, s: await state(page) });
await page.click("[data-tab=history]"); await page.waitForTimeout(300);
await page.click("[data-tab=insights]"); await page.waitForTimeout(300);
r = await page.evaluate(() => window.VelaBack()); await page.waitForTimeout(400);
ok("app back: tab hopping → Home in one Back", r === "ok" && (await state(page)).tab === "home");
ok("app back: no leftover history entry", await page.evaluate(() => (history.state?.velaBack ?? 0) === 0 && window.__velaBack.layers.length === 0), await page.evaluate(() => window.__velaBack));
const exits0 = (await nat(page)).exits;
r = await page.evaluate(() => window.VelaBack());
ok("app back: Home with nothing open closes the app", r === "root" && (await nat(page)).exits === exits0 + 1, r);
ok("app back: closing never changed the journal", (await state(page)).unlocked);

// Download: the encrypted backup goes through the app (Downloads/Vela), not a browser download.
await page.evaluate(() => window.__velaStore.getState().setSettingsOpen(true)); await page.waitForTimeout(300);
await page.evaluate(() => window.__velaStore.getState().toggleSection("data")); await page.waitForTimeout(300);
let downloaded = false; page.on("download", () => { downloaded = true; });
await page.getByText("Export encrypted backup").click(); await page.waitForTimeout(1200);
n = await nat(page);
ok("app download: saved through the app", n.saves.length === 1 && n.saves[0].done && n.saves[0].bytes > 50 && /vela/i.test(n.saves[0].name), n.saves);
ok("app download: no browser download", !downloaded);
await page.evaluate(() => window.VelaBack()); await page.evaluate(() => window.VelaBack()); await page.waitForTimeout(300);

// Leaving and coming back: < 10 s stays open, > 10 s locks (the app's own signals).
await page.evaluate(() => dispatchEvent(new Event("velanative-hidden"))); await page.waitForTimeout(2500);
await page.evaluate(() => dispatchEvent(new Event("velanative-visible"))); await page.waitForTimeout(300);
ok("app: back after 2.5 s → still open", (await state(page)).unlocked);
await page.evaluate(() => dispatchEvent(new Event("velanative-hidden"))); await page.waitForTimeout(10_800);
const authsBefore = (await nat(page)).auths;
await page.evaluate(() => { window.__nat.answer = "cancel"; dispatchEvent(new Event("velanative-visible")); }); await page.waitForTimeout(1500);
let s = await state(page);
ok("app: back after 10.8 s → locked, key kept (no passphrase)", !s.unlocked && s.keyParked, s);
ok("app: lock screen asks the phone's prompt by itself", (await nat(page)).auths > authsBefore, (await nat(page)).auths);
ok("app: cancelled prompt stays locked", !(await state(page)).unlocked && (await page.locator("[data-testid=bio-lock]").count()) === 1);
// The PIN screen closing (hidden → visible right after a cancel) must not bring the prompt straight back.
const a1 = (await nat(page)).auths;
await page.evaluate(() => { dispatchEvent(new Event("velanative-hidden")); dispatchEvent(new Event("velanative-visible")); }); await page.waitForTimeout(800);
ok("app: no prompt loop right after a cancel", (await nat(page)).auths === a1, { a1, now: (await nat(page)).auths });
// Back on the lock screen leaves; it never opens the journal.
const ex1 = (await nat(page)).exits;
r = await page.evaluate(() => window.VelaBack()); await page.waitForTimeout(300);
ok("app back on the lock screen: closes the app, journal stays locked", r === "root" && (await nat(page)).exits === ex1 + 1 && !(await state(page)).unlocked);
// Unlock with the phone.
await page.evaluate(() => { window.__nat.answer = "ok"; }); await page.click("[data-testid=bio-lock] button"); await page.waitForTimeout(1500);
ok("app: the phone's prompt opens the journal (no passphrase)", (await state(page)).unlocked, await state(page));

// Fresh launch (reload = new page) → asks again; refused stays locked.
await page.evaluate(() => sessionStorage.setItem("__natcfg", JSON.stringify({ answer: "cancel" })));
await page.goto(URL); await page.waitForTimeout(2500);
s = await state(page);
ok("app fresh launch: locked behind the app lock", !s.unlocked && (await page.locator("[data-testid=bio-lock]").count()) === 1, s);
await page.evaluate(() => { window.__nat.answer = "ok"; sessionStorage.removeItem("__natcfg"); }); await page.click("[data-testid=bio-lock] button"); await page.waitForTimeout(1500);
ok("app fresh launch: opens with the phone's prompt", (await state(page)).unlocked);
ok("app: still no WebAuthn call at all", (await nat(page)).webauthn === 0, (await nat(page)).webauthn);

// Sign-in link: inside the app it returns to vela://auth.
let otp = null;
await page.route("**/auth/v1/otp**", (rt) => { otp = rt.request().url(); rt.fulfill({ status: 200, contentType: "application/json", body: "{}" }); });
await page.evaluate(() => window.__velaStore.getState().setSettingsOpen(true)); await page.waitForTimeout(300);
await page.evaluate(() => window.__velaStore.getState().toggleSection("data")); await page.waitForTimeout(500);
await page.fill("#account-email", "vela.test.fake@example.com");
await page.getByText("Email me a sign-in link").click(); await page.waitForTimeout(1500);
ok("app sign-in link: redirect is vela://auth", otp !== null && decodeURIComponent(otp).includes("redirect_to=vela://auth"), otp);
ok("app sign-in link: note says to tap the link on this phone", (await page.getByText("it opens the Vela app").count()) === 1);

// A phone with no screen lock: the passphrase is the only lock (lock drops the key).
await page.evaluate(() => sessionStorage.setItem("__natcfg", JSON.stringify({ canAuth: "no" })));
await page.goto(URL); await page.waitForTimeout(2500);
s = await state(page);
ok("no screen lock on the phone: fresh launch asks the passphrase (never opens)", !s.unlocked && (await page.locator("[data-testid=bio-lock]").count()) === 0, s);
await page.evaluate(() => sessionStorage.removeItem("__natcfg"));
ok("no page errors", errors.length === 0, errors);
await ctx.close();

/* ───────── 3. Browser sign-in link unchanged ───────── */
{
  const c2 = await browser.newContext({ userAgent: DESKTOP_UA, viewport: { width: 1366, height: 900 } });
  const p2 = await c2.newPage();
  await setup(p2);
  let otp2 = null;
  await p2.route("**/auth/v1/otp**", (rt) => { otp2 = rt.request().url(); rt.fulfill({ status: 200, contentType: "application/json", body: "{}" }); });
  await p2.evaluate(() => window.__velaStore.getState().setSettingsOpen(true)); await p2.waitForTimeout(300);
  await p2.evaluate(() => window.__velaStore.getState().toggleSection("data")); await p2.waitForTimeout(500);
  await p2.fill("#account-email", "vela.test.fake@example.com");
  await p2.getByText("Email me a sign-in link").click(); await p2.waitForTimeout(1500);
  ok("browser sign-in link: redirect is still the site", otp2 !== null && decodeURIComponent(otp2).includes(`redirect_to=${URL.replace(/\/$/, "/")}`) && !decodeURIComponent(otp2).includes("vela://"), otp2);
  await c2.close();
}

await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
