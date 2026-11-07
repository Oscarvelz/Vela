/**
 * Vela for Android (shell android-1): the WebView app (package com.oscarvelz.vela, source in android/) puts
 * `window.VelaNative` on the page. Everything here is feature-detected: in a browser or the installed PWA there is no
 * VelaNative, startNative() returns at once and nothing in this file runs, so the web app behaves exactly as before.
 *
 * What the bridge does inside the app:
 * - App lock: WebAuthn (navigator.credentials) is not available in a plain Android WebView, so app-lock.ts asks the
 *   phone's own BiometricPrompt through nativeAuth() (fingerprint, face, or the phone's PIN/pattern/password).
 *   The rules stay the same: every fresh launch and every return after the chosen time away asks; the passphrase is
 *   only for encryption (once per device).
 * - Back: the phone's Back asks VelaBack(); the layered back stack (back-stack.ts) closes the innermost open layer
 *   and a non-Home tab returns Home. With nothing open (Home, or the lock screen) the app closes, as in the PWA.
 * - Status/navigation bar colours follow the theme (meta theme-color at the top, the page's bottom colour below).
 * - Downloads (encrypted backup, CSV): the blob is handed to the app and saved in Downloads/Vela.
 * - Leaving/returning: the app also says when it goes to the background and comes back (velanative-hidden /
 *   velanative-visible), so the lock timer works even if the WebView's own visibility events are late.
 */
import { backLayerCount, nativeBackStep } from "./back-stack";

export type VelaNativeBridge = {
  version(): string;
  versionCode?(): number;
  setBars(top: string, bottom: string, darkTop: boolean, darkBottom: boolean): void;
  setLang?(lang: string): void;
  exitApp(): void;
  canAuth(): string;
  authenticate(id: string, title: string, subtitle: string): void;
  saveBegin(name: string, mime: string): string;
  saveChunk(id: string, b64: string): string;
  saveEnd(id: string, msgTemplate: string): string;
  /** Shell android-2+: the page painted its first frame (called by index.html), so the phone's splash may hand over. */
  painted?(): void;
};

type W = Window & { VelaNative?: VelaNativeBridge; VelaBack?: () => string; __velaNativeOn?: boolean };

export function native(): VelaNativeBridge | null {
  if (typeof window === "undefined") return null;
  const n = (window as W).VelaNative;
  return n && typeof n.version === "function" ? n : null;
}

export const inAndroidApp = (): boolean => native() !== null;

/** An Android phone or tablet browsing Vela in Chrome (or the installed PWA), not inside the Vela app. */
export function androidBrowser(): boolean {
  if (typeof navigator === "undefined" || inAndroidApp()) return false;
  return /Android/i.test(navigator.userAgent) && !/VelaAndroid\//.test(navigator.userAgent);
}

export const APK_URL = "https://github.com/Oscarvelz/Vela/releases/latest/download/Vela.apk";

const en = () => typeof document === "undefined" || document.documentElement.lang !== "es";

/* ---------- app lock (the phone's own prompt) ---------- */

export function nativeCanAuth(): boolean {
  const n = native();
  try {
    return !!n && n.canAuth() === "yes";
  } catch {
    return false;
  }
}

export type NativeAuthResult = { ok: true } | { ok: false; code: "cancel" | "timeout" | "unsupported" | "failed" };

/** The phone's biometric prompt (fingerprint/face, the phone's PIN as fallback). Never resolves ok on cancel. */
export function nativeAuth(): Promise<NativeAuthResult> {
  const n = native();
  if (!n) return Promise.resolve({ ok: false, code: "unsupported" });
  const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
  return new Promise((resolve) => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ id: string; ok: boolean; code?: string }>).detail;
      if (!d || d.id !== id) return;
      window.removeEventListener("velanative-auth", on);
      if (d.ok === true) resolve({ ok: true });
      else {
        const c = d.code;
        resolve({ ok: false, code: c === "cancel" || c === "timeout" || c === "unsupported" ? c : "failed" });
      }
    };
    window.addEventListener("velanative-auth", on);
    try {
      n.authenticate(id, en() ? "Unlock Vela" : "Desbloquear Vela", en() ? "Use your fingerprint or your screen lock" : "Usa tu huella o el bloqueo de pantalla");
    } catch {
      window.removeEventListener("velanative-auth", on);
      resolve({ ok: false, code: "failed" });
    }
  });
}

/* ---------- back ---------- */

function installBack(n: VelaNativeBridge) {
  (window as W).VelaBack = () => {
    // An open layer (dialog, sheet, Settings, a sub-view, another tab): close the innermost one, like browser Back.
    if (backLayerCount() > 0 && nativeBackStep()) return "ok";
    // Home with nothing open, or the lock screen: Back leaves the app (it never opens the journal).
    try {
      n.exitApp();
    } catch {
      return "none";
    }
    return "root";
  };
}

/* ---------- system bar colours ---------- */

function rgb(c: string): [number, number, number] | null {
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return [p[0] | 0, p[1] | 0, p[2] | 0];
  }
  const h = c.trim().match(/^#([0-9a-f]{6})$/i);
  return h ? [parseInt(h[1].slice(0, 2), 16), parseInt(h[1].slice(2, 4), 16), parseInt(h[1].slice(4, 6), 16)] : null;
}
const isDark = (v: [number, number, number]) => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2] < 140;

function bottomColor(): string | null {
  let el = document.elementFromPoint(Math.round(innerWidth / 2), innerHeight - 2) as HTMLElement | null;
  while (el) {
    if (el.getBoundingClientRect().width >= innerWidth * 0.92) {
      const m = getComputedStyle(el).backgroundColor.match(/rgba?\(([^)]+)\)/);
      if (m) {
        const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
        if ((p.length > 3 ? p[3] : 1) >= 0.5) return `rgb(${p[0] | 0}, ${p[1] | 0}, ${p[2] | 0})`;
      }
    }
    el = el.parentElement;
  }
  return null;
}

function installBars(n: VelaNativeBridge) {
  let last = "";
  let lastLang = "";
  let queued = 0;
  const apply = () => {
    queued = 0;
    const lang = document.documentElement.lang === "es" ? "es" : "en";
    if (lang !== lastLang) {
      lastLang = lang;
      try {
        n.setLang?.(lang);
      } catch {
        /* ignore */
      }
    }
    const meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    // While the launch splash is up the whole screen is its night sky, whatever theme sits underneath.
    const top = document.documentElement.dataset.splash ? "#0d1636" : meta?.content || "#0d1636";
    const bottom = bottomColor() || top;
    const t = rgb(top);
    const b = rgb(bottom);
    if (!t || !b) return;
    const key = `${top}|${bottom}`;
    if (key === last) return;
    last = key;
    try {
      n.setBars(`rgb(${t.join(",")})`, `rgb(${b.join(",")})`, isDark(t), isDark(b));
    } catch {
      /* ignore */
    }
  };
  const soon = () => {
    if (!queued) queued = window.setTimeout(apply, 160);
  };
  new MutationObserver(soon).observe(document.documentElement, {
    attributes: true,
    childList: true,
    subtree: true,
    attributeFilter: ["content", "data-theme", "data-mode", "data-splash", "lang", "class", "style"],
  });
  addEventListener("scroll", soon, { passive: true });
  addEventListener("resize", soon);
  document.addEventListener("visibilitychange", soon);
  soon();
}

/* ---------- downloads ---------- */

function b64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function saveBlob(n: VelaNativeBridge, name: string, blob: Blob) {
  const id = n.saveBegin(name || "Vela", blob.type || "application/octet-stream");
  if (!id || id.startsWith("error")) return;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const CH = 512 * 1024;
  for (let i = 0; i < bytes.length; i += CH) {
    if (n.saveChunk(id, b64(bytes.subarray(i, i + CH))) !== "ok") return;
  }
  n.saveEnd(id, en() ? "Saved in Downloads › Vela: %s" : "Guardado en Descargas › Vela: %s");
}

function installDownloads(n: VelaNativeBridge) {
  // A blob URL may be revoked right after a.click(); keep the Blob itself so the app can still read it.
  const blobs = new Map<string, Blob>();
  const make = URL.createObjectURL.bind(URL);
  const revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (obj: Blob | MediaSource) => {
    const u = make(obj);
    if (obj instanceof Blob) blobs.set(u, obj);
    return u;
  };
  URL.revokeObjectURL = (u: string) => {
    window.setTimeout(() => {
      blobs.delete(u);
      revoke(u);
    }, 60_000);
  };
  const take = (a: HTMLAnchorElement): boolean => {
    if (!a.hasAttribute("download")) return false;
    const href = a.href || "";
    const name = a.getAttribute("download") || "Vela";
    if (href.startsWith("blob:")) {
      const blob = blobs.get(href);
      if (blob) void saveBlob(n, name, blob);
      else void fetch(href).then((r) => r.blob()).then((b) => saveBlob(n, name, b)).catch(() => undefined);
      return true;
    }
    if (href.startsWith("data:")) {
      void fetch(href).then((r) => r.blob()).then((b) => saveBlob(n, name, b)).catch(() => undefined);
      return true;
    }
    return false;
  };
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    if (take(this)) return;
    click.call(this);
  };
  document.addEventListener(
    "click",
    (e) => {
      const a = (e.target as Element | null)?.closest?.("a[download]") as HTMLAnchorElement | null;
      if (a && take(a)) e.preventDefault();
    },
    true,
  );
}

/* ---------- start ---------- */

export function startNative() {
  const n = native();
  const w = typeof window !== "undefined" ? (window as W) : null;
  if (!n || !w || w.__velaNativeOn) return;
  w.__velaNativeOn = true;
  document.documentElement.dataset.android = "";
  installBack(n);
  installBars(n);
  installDownloads(n);
}
