// Fake-data check: the redesigned batch card ("Tell it your way") — empty, example parsed, typed, es, day; save count.
import { chromium } from "/workspace/work/browser-test/node_modules/playwright-core/index.mjs";
import { mkdirSync } from "node:fs";
const OUT = "/workspace/work/vela-batch-shots";
mkdirSync(OUT, { recursive: true });
let fails = 0; const ok = (n, c, x = "") => { if (!c) fails++; console.log(`${c ? "PASS" : "FAIL"}  ${n}  ${JSON.stringify(x)}`); };
const browser = await chromium.launch({ executablePath: "/workspace/work/browser-test/browsers/chromium_headless_shell-1155/chrome-linux/headless_shell", args: ["--no-sandbox", "--no-proxy-server"] });
const page = await browser.newPage({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 2.5, hasTouch: true, locale: "en-US" });
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:8132/Vela/");
await page.waitForSelector("#name", { timeout: 20000 });
await page.fill("#name", "Tester"); await page.fill("#create-pass", "fake-orbit-lantern-42"); await page.fill("#create-pass2", "fake-orbit-lantern-42");
await page.check("#pass-ack"); await page.click("button[type=submit]");
await page.waitForSelector(".ag-tabbar", { timeout: 30000 }); await page.waitForTimeout(800);
// Fake partners
await page.evaluate(() => window.__velaStore.setState((s) => ({ journal: { ...s.journal, partners: ["Ana", "Sofía", "Marco"] } })));
const card = page.locator(".vb-card-shell");
const shot = async (name) => {
  await page.waitForTimeout(550);
  // Lift the sticky header / tab bar out of the way so a tall card shoots whole.
  const tag = await page.addStyleTag({ content: ".ag-header, .ag-tabbar { visibility: hidden !important; }" });
  await card.screenshot({ path: `${OUT}/${name}.png` });
  await tag.evaluate((e) => e.remove());
};
const status = () => page.locator('[data-testid="batch-status"]').innerText();
const overflow = () => page.evaluate(() => { const c = document.querySelector(".vb-card-shell"); const r = c.getBoundingClientRect(); return [...c.querySelectorAll("*")].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && (b.right > r.right + 1 || b.left < r.left - 1) && !e.closest(".vb-sky"); }).map((e) => [String(e.className).slice(0, 30), Math.round(e.getBoundingClientRect().left), Math.round(e.getBoundingClientRect().right), Math.round(r.left), Math.round(r.right)]).slice(0, 5); });

await page.locator(".ag-hero-actions .ag-hero-tile").nth(1).click(); await page.waitForTimeout(400);
ok("batch card opens", await card.isVisible());
ok("composed header", (await page.locator(".vb-title").innerText()) === "Tell it your way" && (await page.locator(".vb-eyebrow").innerText()).toUpperCase().includes("WRITE IT DOWN"));
ok("save disabled when empty, with a hint", await page.locator('[data-testid="batch-save"]').isDisabled() && (await page.locator(".vb-save-hint").innerText()).length > 0);
ok("idle status", (await status()).includes("reads as you write"), await status());
await shot("01-empty-night-en");
ok("no horizontal overflow (empty)", (await overflow()).length === 0, await overflow());

await page.click(".vb-knows-btn"); await page.waitForTimeout(450);
ok("understands row expands", (await page.locator(".vb-knows-btn").getAttribute("aria-expanded")) === "true" && (await page.locator(".vb-knows-chip").first().isVisible()));
await shot("02-understands-open-night-en");
await page.click(".vb-knows-btn"); await page.waitForTimeout(400);

// Try an example → 2 moments
await page.click('[data-testid="batch-example"]'); await page.waitForTimeout(400);
ok("example parses 2 moments", (await page.locator('[data-testid="batch-card"]').count()) === 2 && (await status()).includes("2 moments"), await status());
ok("second moment needs a partner → save disabled", await page.locator('[data-testid="batch-save"]').isDisabled(), await page.locator(".vb-save-hint").innerText().catch(() => ""));
await shot("03-example-needs-partner-night-en");
await page.locator(".vb-chip", { hasText: "Marco" }).click(); await page.waitForTimeout(200);
ok("save enabled once a partner is picked", await page.locator('[data-testid="batch-save"]').isEnabled());
await shot("04-example-ready-night-en");
ok("no horizontal overflow (filled)", (await overflow()).length === 0, await overflow());

// Typing by hand: two encounters
await page.click(".vb-mini"); // clear
await page.locator(".vb-page-text").click();
await page.keyboard.type("Oct 1 night at home with Sofía, missionary, condom, felt great 8/10\nOct 3 morning in the shower, quick, twice", { delay: 4 });
await page.waitForTimeout(400);
const n = await page.locator('[data-testid="batch-card"]').count();
ok("typed text: 2 moments previewed", n === 2 && (await status()).includes("2 moments"), { n, s: await status() });
const h = await page.locator(".vb-page-text").evaluate((e) => ({ h: e.clientHeight, sh: e.scrollHeight }));
ok("journal page auto-grows (no inner scroll)", h.sh <= h.h + 2, h);
await shot("05-typed-two-night-en");
// Adjust + leave out still work
await page.locator('[data-testid="batch-card"]').nth(1).getByRole("button", { name: "Adjust" }).click(); await page.waitForTimeout(250);
ok("adjust opens editor", (await page.locator('[data-testid="batch-card"]').nth(1).getByRole("button", { name: "Done" }).count()) === 1);
await page.locator('[data-testid="batch-card"]').nth(1).getByRole("button", { name: "Done" }).click();
await page.locator('[data-testid="batch-card"]').nth(1).getByRole("button", { name: "Leave this one out" }).click(); await page.waitForTimeout(250);
ok("leave out marks the card", (await page.locator('[data-testid="batch-card"].is-skip').count()) === 1);
await page.locator('[data-testid="batch-card"]').nth(1).getByRole("button", { name: "Include it again" }).click(); await page.waitForTimeout(200);
// New name chip
await page.click(".vb-chip-new"); await page.waitForTimeout(150);
await page.keyboard.type("Leo");
ok("new name field takes the batch partner", (await page.locator(".vb-name.is-on").count()) === 1 && (await page.locator(".vb-chip.ag-chip-on").count()) === 0);
await shot("06-new-name-night-en");
const label = await page.locator('[data-testid="batch-save"]').innerText();
const before = await page.evaluate(() => window.__velaStore.getState().journal.sessions.length);
await page.locator('[data-testid="batch-save"]').click(); await page.waitForTimeout(500);
const after = await page.evaluate(() => window.__velaStore.getState().journal.sessions.length);
const leo = await page.evaluate(() => window.__velaStore.getState().journal.sessions.filter((s) => s.partnerName === "Leo").length);
ok("save saves 3 sessions (1 + twice)", after - before === 3 && /3 sessions/.test(label), { before, after, label });
ok("untagged moment takes the new name", leo === 2, leo);

// Spanish
await page.evaluate(() => window.__velaStore.getState().setLanguage("es")); await page.waitForTimeout(300);
await page.locator(".ag-hero-actions .ag-hero-tile").nth(1).click(); await page.waitForTimeout(400);
ok("es header", (await page.locator(".vb-title").innerText()) === "Cuéntalo a tu manera");
await shot("07-empty-night-es");
await page.click(".vb-knows-btn"); await page.waitForTimeout(450);
await page.click('[data-testid="batch-example"]'); await page.locator(".vb-chip", { hasText: "Sofía" }).click(); await page.waitForTimeout(400);
ok("es example: 2 momentos", (await status()).includes("2 momentos"), await status());
await shot("08-example-ready-night-es");
ok("no horizontal overflow (es)", (await overflow()).length === 0, await overflow());

// Day mode
await page.evaluate(() => window.__velaStore.getState().toggleMode()); await page.waitForTimeout(400);
await shot("09-example-ready-day-es");
await page.evaluate(() => window.__velaStore.getState().setLanguage("en")); await page.waitForTimeout(300);
await page.click(".vb-mini"); await page.click(".vb-knows-btn"); await page.locator(".vb-page-text").blur();
await shot("10-empty-day-en");
await page.click('[data-testid="batch-example"]'); await page.waitForTimeout(300);
await shot("11-example-day-en");
await page.locator(".vb-page-text").focus(); await page.waitForTimeout(200);
await page.locator(".vb-page").screenshot({ path: `${OUT}/12-page-focus-day-en.png` });

// Reduced motion respected
await page.emulateMedia({ reducedMotion: "reduce" });
const anim = await page.evaluate(() => getComputedStyle(document.querySelector(".vb-card")).animationName);
ok("reduced motion: no card animation", anim === "none", anim);
ok("no page errors", errors.length === 0, errors);
await browser.close(); console.log(fails ? `BATCHLOOK FAIL ${fails}` : "BATCHLOOK ALL PASS"); process.exit(fails ? 1 : 0);
