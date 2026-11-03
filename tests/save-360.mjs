// Save button and Settings group headers at 360 px, en + es, night + day (fake data only). Checks the label fits on one line, unclipped.
import { launch, newJournal, ok } from "./audit-lib.mjs";
const OUT = "/workspace/work/vela-audit/fix-shots";
const browser = await launch();
for (const lang of ["en", "es"]) {
  const { page } = await newJournal(browser, { lang, width: 360 });
  for (const mode of ["night", "day"]) {
    if (mode === "day") { await page.evaluate(() => window.__velaStore.getState().toggleMode()); await page.waitForTimeout(400); }
    const details = page.locator(".ag-hero-actions .ag-hero-tile").nth(0);
    if ((await details.getAttribute("aria-pressed")) !== "true") await details.click();
    await page.waitForTimeout(400);
    const btn = page.locator('[data-testid="save-moment"]');
    await btn.scrollIntoViewIfNeeded(); await page.waitForTimeout(300); await page.mouse.move(0, 0);
    const box = await btn.boundingBox();
    await page.screenshot({ path: `${OUT}/save-360-${lang}-${mode}.png`, clip: { x: 0, y: box.y - 20, width: 360, height: box.height + 40 } });
    const m = await btn.evaluate((el) => {
      const r = el.getBoundingClientRect(); const out = [];
      el.querySelectorAll("*").forEach((c) => { if (!c.children.length && c.textContent.trim()) { const cr = c.getBoundingClientRect(); const cs = getComputedStyle(c); const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.25; out.push({ t: c.textContent.trim(), sw: c.scrollWidth, cw: c.clientWidth, h: cr.height, lh, l: cr.left, rr: cr.right }); } });
      const rg = document.createRange(); rg.selectNodeContents(el); const rects = [...rg.getClientRects()].filter((x) => x.width > 2); const tops = new Set(rects.map((x) => Math.round(x.top / 4))); const tr = rg.getBoundingClientRect();
      return { lines: tops.size, tl: tr.left, tr: tr.right, left: r.left, right: r.right, vw: innerWidth, text: el.innerText.trim(), sw: el.scrollWidth, cw: el.clientWidth, parts: out };
    });
    const clipped = m.parts.some((p) => p.sw > p.cw + 1 || p.h > p.lh * 1.6 || p.l < m.left - 1 || p.rr > m.right + 1) || m.lines > 1 || m.tl < m.left || m.tr > m.right || m.right > m.vw; // button scrollWidth includes the decorative shimmer, so measure the text itself
    ok(`save ${lang} ${mode}: one line, not clipped`, !clipped, m);
  }
  // Settings group headers: each title on one line, badge not cut off
  await page.locator('button[aria-label="Open settings"], button[aria-label="Abrir ajustes"]').first().dispatchEvent("click"); await page.waitForTimeout(600);
  const heads = await page.evaluate(() => [...document.querySelectorAll("section.ag-panel > button[aria-expanded]")].map((b) => {
    const t = b.querySelector("span.flex-1"); const cs = getComputedStyle(t); const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.25;
    const badge = t.nextElementSibling && t.nextElementSibling.tagName === "SPAN" ? t.nextElementSibling : null;
    return { title: t.innerText.trim(), oneLine: t.getBoundingClientRect().height <= lh * 1.6, badge: badge?.innerText.trim() ?? "", badgeCut: badge ? badge.scrollWidth > badge.clientWidth + 1 : false };
  }));
  ok(`settings ${lang}: every group header on one line, no badge cut`, heads.length >= 6 && heads.every((h) => h.oneLine && !h.badgeCut), heads.filter((h) => !h.oneLine || h.badgeCut).concat([{ n: heads.length }]));
  await page.screenshot({ path: `${OUT}/settings-360-${lang}.png` });
  await page.context().close();
}
await browser.close();
