// Layout sweep (fake data only): wrap/clip check at 360 px, en/es, two trackers. Shots go to vela-audit/fix-shots.
import { launch, newJournal, ok, note, J, tab, iso, SHOTS, fails } from "./audit-lib.mjs";
const browser = await launch();
const E = (o) => ({ title: "", date: iso(0), dateStated: true, time: "20:00", timeStated: true, times: [], place: "Bedroom", count: 1, nextDay: false, notes: "", contraception: [], problems: [], partnerName: "", durationMins: 30, positions: [], intensity: 3, connection: 4, satisfaction: 4, energy: 3, overall: 4, source: "", ...o });
const sweep = () => window.__auditSweep = (() => {
  const out = [];
  const els = [...document.querySelectorAll("button, [role=button], .ag-chip, h1, h2, h3, label, .vb-chip, [data-testid] > span, .ag-tab, p")];
  for (const el of els) {
    if (!el.offsetParent) continue;
    const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) continue;
    const text = (el.innerText || "").trim(); if (!text || text.length > 34 || text.includes("\n")) continue;
    const cs = getComputedStyle(el); const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.25;
    const tops = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) { if (!n.textContent.trim()) continue; const rg = document.createRange(); rg.selectNodeContents(n); for (const q of rg.getClientRects()) if (q.width > 1) tops.push(q.top + q.height / 2); }
    tops.sort((a, b) => a - b); let lines = tops.length ? 1 : 0; for (let i = 1; i < tops.length; i++) if (tops[i] - tops[i - 1] > lh * 0.6) lines++;
    const clipped = el.scrollWidth > el.clientWidth + 1 && (cs.overflow !== "visible" || cs.textOverflow === "ellipsis");
    if (lines > 1 || clipped) out.push(`${lines > 1 ? "WRAP" : "CLIP"} <${el.tagName.toLowerCase()}> "${text}"`);
  }
  const over = document.documentElement.scrollWidth > window.innerWidth + 1;
  return { out: [...new Set(out)], over };
})();
for (const lang of ["en", "es"]) for (const mode of (process.env.MODES || "night").split(",")) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, hasTouch: true, locale: lang === "es" ? "es-US" : "en-US" });
  const { page, errors } = await newJournal(browser, { ctx, lang });
  await page.evaluate(([es, mode, a, b, c, d]) => {
    const s = window.__velaStore.getState();
    s.saveBatch(es, "");
    s.setCycle({ enabled: true, perspective: "self", starts: [a, b] });
    const id = s.addTracker({ perspective: "partner", partnerLink: "Fakeana", partnerName: "Fakeana" });
    window.__velaStore.getState().setCycle({ starts: [c, d] }, id);
    if (mode === "day") window.__velaStore.getState().toggleMode();
  }, [[E({ partnerName: "Fakeana", count: 2 }), E({ partnerName: "Fakelu", date: iso(-3), place: "Hotel" }), E({ partnerName: "Fakemar", date: iso(-9), place: "Shower" })], mode, iso(-40), iso(-12), iso(-33), iso(-5)]);
  await page.waitForTimeout(500);
  for (const t of ["home", "calendar", "history", "insights"]) {
    await tab(page, t); await page.waitForTimeout(400);
    const card = page.locator("#cycle-card");
    if (t === "home" && (await card.count()) && (await card.getAttribute("data-folded")) === "true") { await page.locator('[data-testid="cycle-fold"]').click(); await page.waitForTimeout(600); }
    const res = await page.evaluate(sweep);
    note(`${lang}/${mode}/${t}: overflow-x=${res.over}`, res.out);
    await page.screenshot({ path: `${SHOTS}/../fix-shots/layout-${lang}-${mode}-${t}.png`, fullPage: true });
  }
  // settings
  await page.evaluate(() => window.__velaStore.getState().setSettingsOpen(true)); await page.waitForTimeout(600);
  const res = await page.evaluate(sweep);
  note(`${lang}/${mode}/settings: overflow-x=${res.over}`, res.out);
  await page.screenshot({ path: `${SHOTS}/../fix-shots/layout-${lang}-${mode}-settings.png`, fullPage: true });
  ok(`${lang}/${mode}: no page errors`, errors.length === 0, errors);
  await ctx.close();
}
await browser.close();
