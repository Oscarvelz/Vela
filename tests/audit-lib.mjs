// AUDIT helper (fake data only): launch + create a throwaway journal.
import { chromium } from "/workspace/work/browser-test/node_modules/playwright-core/index.mjs";
import { mkdirSync } from "node:fs";
export const PORT = process.env.VELA_PORT || 8133;
export const SHOTS = "/workspace/work/vela-audit/shots"; mkdirSync(SHOTS, { recursive: true });
export let fails = 0;
export const ok = (n, c, x = "") => { if (!c) fails++; console.log(`${c ? "PASS" : "FAIL"}  ${n}  ${typeof x === "string" ? x : JSON.stringify(x)}`); };
export const note = (n, x = "") => console.log(`INFO  ${n}  ${typeof x === "string" ? x : JSON.stringify(x)}`);
export async function launch() {
  return chromium.launch({ executablePath: "/workspace/work/browser-test/browsers/chromium_headless_shell-1155/chrome-linux/headless_shell", args: ["--no-sandbox", "--no-proxy-server"] });
}
export async function newJournal(browser, { lang = "en", width = 412, partners = ["Fakeana", "Fakelu", "Fakemar"], ctx } = {}) {
  const context = ctx ?? (await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, hasTouch: true, locale: lang === "es" ? "es-US" : "en-US" }));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/Vela/`);
  await page.waitForSelector("#name", { timeout: 20000 });
  await page.fill("#name", "Tester"); await page.fill("#create-pass", "fake-orbit-lantern-42"); await page.fill("#create-pass2", "fake-orbit-lantern-42");
  await page.check("#pass-ack"); await page.click("button[type=submit]");
  await page.waitForSelector(".ag-tabbar", { timeout: 30000 }); await page.waitForTimeout(800);
  await page.evaluate(([lang, partners]) => window.__velaStore.setState((s) => ({ journal: { ...s.journal, partners, } })) || window.__velaStore.getState().setLanguage(lang), [lang, partners]);
  await page.waitForTimeout(300);
  return { context, page, errors };
}
export const J = (page) => page.evaluate(() => { const j = window.__velaStore.getState().journal; return { sessions: j.sessions, encounters: j.encounters, partners: j.partners, settings: j.settings }; });
export const tab = async (page, id) => { await page.locator(`.ag-tab[data-tab=${id}]`).click(); await page.waitForTimeout(500); };
export const iso = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
