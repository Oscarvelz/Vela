// Cycle dial scrub check (e2e build with the store hook, served at 8132). FAKE data only.
// Usage: LD_LIBRARY_PATH=... node tests/cycle-scrub.mjs [self|partner] [en|es]
// Asserts: no layout jump while scrubbing, one-line buttons, chips jump, low arcs gated by learning,
// hint hidden after the first scrub, no horizontal overflow, no page errors.
import { chromium } from "/workspace/work/browser-test/node_modules/playwright-core/index.mjs";
import { mkdirSync } from "node:fs";

const MODE = process.argv[2] || "self";
const LANG = process.argv[3] || "en";
const OUT = "/workspace/work/vela-cycle-shots";
mkdirSync(OUT, { recursive: true });
const tag = `${MODE}${LANG === "es" ? "-es" : ""}`;

let fails = 0;
const ok = (name, cond, extra = "") => {
  if (!cond) fails += 1;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra !== "" ? "  — " + JSON.stringify(extra) : ""}`);
};

const browser = await chromium.launch({
  executablePath: "/workspace/work/browser-test/browsers/chromium_headless_shell-1155/chrome-linux/headless_shell",
  args: ["--no-sandbox", "--no-proxy-server"],
});
const page = await browser.newPage({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 2.5, locale: LANG === "es" ? "es-ES" : "en-US" });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));
const external = [];
page.on("request", (r) => {
  const u = new URL(r.url());
  if (u.hostname !== "127.0.0.1") external.push(u.hostname);
});

await page.goto("http://127.0.0.1:8132/Vela/");
await page.waitForSelector("#name", { timeout: 20000 });
await page.fill("#name", "Tester");
await page.fill("#create-pass", "fake-orbit-lantern-42");
await page.fill("#create-pass2", "fake-orbit-lantern-42");
await page.check("#pass-ack");
await page.click("button[type=submit]");
await page.waitForSelector(".ag-tabbar", { timeout: 30000 });
await page.waitForTimeout(600);

async function seed(startOffsets) {
  await page.evaluate(
    ({ mode, lang, startOffsets }) => {
      const store = window.__velaStore.getState();
      const pad = (n) => String(n).padStart(2, "0");
      const day = (offset) => {
        const d = new Date();
        d.setDate(d.getDate() + offset);
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      };
      if (lang === "es") store.setLanguage("es");
      const starts = startOffsets.map(day);
      const ends = Object.fromEntries(startOffsets.slice(-5).map((o) => [day(o), day(o + 4)]));
      const days = { [day(-11)]: { flow: "heavy", symptoms: ["cramps"] }, [day(-1)]: { symptoms: ["libidoHigh"], note: "Fake note" } };
      store.setCycle({ enabled: true, perspective: mode, partnerName: mode === "partner" ? "Luna" : "", starts, ends, days });
      const sessions = [-1, -2, -5, -9].map((offset) => ({
        date: day(offset), time: "22:00", partnerName: "Fakepartner", place: "Bedroom", durationMins: 30,
        overall: 4, intensity: 3, connection: 4, satisfaction: 4, energy: 3, positions: [],
      }));
      if (!store.journal.sessions.length) store.importJSON(JSON.stringify({ app: "vela", sessions, partners: ["Fakepartner"] }));
    },
    { mode: MODE, lang: LANG, startOffsets },
  );
  await page.waitForTimeout(500);
}

// Six measured cycles (7 starts): lower-chance arcs are allowed.
await seed([-181, -150, -124, -95, -68, -39, -11]);
const card = page.locator("#cycle-card");
await page.addStyleTag({ content: ".ag-tabbar,.ag-header{visibility:hidden!important}" });
await card.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 16));
await page.waitForTimeout(900);
const hint0 = await page.locator('[data-testid="cycle-hint"]').innerText();
ok("first visit shows the drag hint", /ring|anillo/i.test(hint0), hint0);
await card.screenshot({ path: `${OUT}/scrub-${tag}-0-today.png` });
const rows4 = await page.evaluate(() => new Set([...document.querySelectorAll('[data-testid="cycle-phase-chips"] .cy-chip')].map((el) => Math.round(el.getBoundingClientRect().top))).size);
ok("legend (4 chips) fits one row", rows4 === 1, rows4);

const weekY = async () => (await page.locator('[data-testid="cycle-week"]').boundingBox()).y;
const y0 = await weekY();
const svg = page.locator(".cy-dial-svg");
const b = await svg.boundingBox();
const cx = b.x + b.width / 2, cy = b.y + b.height / 2, r = (b.width * 100) / 240;
const at = (deg) => [cx + r * Math.sin((deg * Math.PI) / 180), cy - r * Math.cos((deg * Math.PI) / 180)];
let [x, y] = at(30);
await page.mouse.move(x, y);
await page.mouse.down();
for (let d = 30; d <= 100; d += 10) {
  [x, y] = at(d);
  await page.mouse.move(x, y);
  await page.waitForTimeout(30);
}
const yDrag = await weekY();
await page.mouse.up();
await page.waitForTimeout(450);
const v1 = await page.locator(".cy-dial").getAttribute("aria-valuetext");
console.log("after drag", v1);
ok("no layout jump while dragging", Math.abs(yDrag - y0) < 0.5, { y0, yDrag });
ok("no layout jump after release", Math.abs((await weekY()) - y0) < 0.5);
ok("scrub action sits in the main slot", await page.locator('[data-testid="cycle-scrub-act"]').isVisible());
ok("idle actions hidden while scrubbing", !(await page.locator('[data-testid="cycle-primary"]').isVisible()));
ok("drag hint is gone after the first scrub", await page.evaluate(() => localStorage.getItem("vela-cy-scrub") === "1"));
await card.screenshot({ path: `${OUT}/scrub-${tag}-1-drag.png` });

await page.locator('[data-testid="cycle-phase-chips"] [data-chip="fertile"]').click();
await page.waitForTimeout(400);
const v2 = await page.locator(".cy-dial").getAttribute("aria-valuetext");
console.log("chip", v2);
ok("fertile chip jumps into the window", /Fertile|fértil/i.test(v2), v2);
ok("fertile hint shown (muted line)", /chance|probabilidad/i.test(await page.locator('[data-testid="cycle-hint"]').innerText()));
ok("still no layout jump", Math.abs((await weekY()) - y0) < 0.5);
await card.screenshot({ path: `${OUT}/scrub-${tag}-2-chip.png` });

await page.locator(".cy-dial").focus();
await page.keyboard.press("ArrowLeft");
await page.waitForTimeout(200);
console.log("key", await page.locator(".cy-dial").getAttribute("aria-valuetext"));

ok("low arc drawn with 6 measured cycles", (await page.locator('[data-testid="cycle-low-arc"]').count()) === 1);
const lowChip = page.locator('[data-testid="cycle-phase-chips"] [data-chip="low"]');
ok("low chip present with 6 cycles", (await lowChip.count()) === 1);
if (await lowChip.count()) {
  await lowChip.click();
  await page.waitForTimeout(400);
  const hint = await page.locator('[data-testid="cycle-hint"]').innerText();
  ok("low days keep the 'not zero' framing", /not zero|no cero/i.test(hint), hint);
  await card.screenshot({ path: `${OUT}/scrub-${tag}-3-low.png` });
}

await page.locator('[data-testid="cycle-phase-chips"] [data-chip="period"]').click();
await page.locator(".cy-dial").focus();
for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight");
await page.waitForTimeout(400);
console.log("early", await page.locator(".cy-dial").getAttribute("aria-valuetext"));
await card.screenshot({ path: `${OUT}/scrub-${tag}-4-early.png` });

// Every visible action button renders on one line.
const tall = await page.evaluate(() =>
  [...document.querySelectorAll("#cycle-card .cy-btn")].filter((el) => el.offsetParent && el.getBoundingClientRect().height > 50).map((el) => el.textContent),
);
ok("buttons stay on one line", tall.length === 0, tall);
const clipped = await page.evaluate(() =>
  [...document.querySelectorAll("#cycle-card .cy-btn > span")].filter((el) => el.offsetParent && el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent),
);
console.log("truncated button labels (ellipsis):", JSON.stringify(clipped));

await page.locator('[data-testid="cycle-back"]').click();
await page.waitForTimeout(350);
const back = await page.locator(".cy-dial").getAttribute("aria-valuetext");
console.log("back", back);
ok("back to today", /today|hoy|ago|in |en |late|retraso|Period|Periodo|Ovul|Peak|Fertil/i.test(back) && (await page.locator('[data-testid="cycle-primary"]').isVisible()));

// Learning: three measured cycles → no lower-chance arcs or chip, a quiet line instead.
await seed([-95, -68, -39, -11]);
await page.waitForTimeout(400);
ok("learning: no low arc", (await page.locator('[data-testid="cycle-low-arc"], [data-testid="cycle-early-arc"]').count()) === 0);
ok("learning: no low chip", (await page.locator('[data-testid="cycle-phase-chips"] [data-chip="low"]').count()) === 0);
const learnHint = await page.locator('[data-testid="cycle-hint"]').innerText();
ok("learning: quiet line shown", /after a few more cycles|tras unos ciclos/i.test(learnHint), learnHint);
await card.screenshot({ path: `${OUT}/scrub-${tag}-5-learning.png` });

const legendRows = await page.evaluate(() => new Set([...document.querySelectorAll('[data-testid="cycle-phase-chips"] .cy-chip')].map((el) => Math.round(el.getBoundingClientRect().top))).size);
ok("legend chips fit one row", legendRows === 1, legendRows);
const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
ok("no horizontal overflow", ov <= 0, ov);
ok("no page errors", errors.length === 0, errors);
ok("no third-party requests (fonts self-hosted)", external.length === 0, [...new Set(external)]);
const fonts = await page.evaluate(async () => {
  await document.fonts.ready;
  return { fraunces: document.fonts.check('500 20px "Fraunces"'), italic: document.fonts.check('italic 500 13px "Fraunces"'), outfit: document.fonts.check('500 14px "Outfit"') };
});
ok("self-hosted fonts loaded", fonts.fraunces && fonts.outfit && fonts.italic, fonts);
await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nSCRUB ALL PASS");
process.exit(fails ? 1 : 0);
