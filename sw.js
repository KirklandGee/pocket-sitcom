// Stale-while-revalidate so the board works offline and still picks up updates.
const CACHE = "pocket-sitcom-v1";
const ASSETS = ["/", "/index.html", "/styles.css", "/app.js", "/sounds.js", "/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (ev) => {
  if (ev.request.method !== "GET") return;
  ev.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(ev.request);
      const fresh = fetch(ev.request)
        .then((res) => {
          if (res.ok) cache.put(ev.request, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || fresh;
    }),
  );
});
