/* Vela service worker — the app opens with no internet.
   VERSION and PRECACHE are filled in by scripts/postbuild.mjs on every build. */
const VERSION = "20ac1b822e0c";
const CACHE = `vela-${VERSION}`;
const PRECACHE = ["/Vela/","/Vela/assets/dist-CTOaXH3b.js","/Vela/assets/index-C3LO9GhT.js","/Vela/assets/index-tl2TwSoI.css","/Vela/assets/leaflet-src-U91KI8yH.js","/Vela/assets/leaflet-vh-t_kPv.css","/Vela/favicon.svg","/Vela/fonts/fraunces-italic-latin-ext.woff2","/Vela/fonts/fraunces-italic-latin.woff2","/Vela/fonts/fraunces-latin-ext.woff2","/Vela/fonts/fraunces-latin.woff2","/Vela/fonts/outfit-latin-ext.woff2","/Vela/fonts/outfit-latin.woff2","/Vela/icon-180.png","/Vela/icon-192.png","/Vela/icon-512.png","/Vela/index.html","/Vela/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(PRECACHE.map((p) => new Request(p, { cache: "reload" })));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("vela-") && key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Never cache account or sync traffic, maps or address lookups.
  if (url.hostname.endsWith("supabase.co") || url.hostname.endsWith("supabase.in")) return;
  if (url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope).pathname;
  if (!url.pathname.startsWith(scope)) return;
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(scope, res.clone());
          return res;
        } catch {
          return (await cache.match(scope)) || (await cache.match(`${scope}index.html`)) || Response.error();
        }
      })(),
    );
    return;
  }
  event.respondWith(
    (async () => {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
      return res;
    })(),
  );
});
