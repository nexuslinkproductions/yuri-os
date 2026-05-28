const CACHE = "nex-ops-v1";
const PRECACHE = ["/", "/manifest.webmanifest", "/brand/logo.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  // Never intercept Supabase, Netlify functions, or external APIs
  if (
    url.hostname !== self.location.hostname ||
    url.pathname.startsWith("/.netlify/") ||
    url.pathname.startsWith("/api/")
  ) return;

  // Cache-first for static assets, network-first for pages
  if (url.pathname.match(/\.(js|css|woff2?|svg|png|ico|webmanifest)$/)) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        if (cached) return cached;
        return fetch(e.request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, clone));
          }
          return res;
        });
      })
    );
  }
});
