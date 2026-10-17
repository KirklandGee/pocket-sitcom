// Stale-while-revalidate so the board works offline and still picks up updates.
const CACHE = "pocket-sitcom-v2";
// Keep the audio list in sync with SAMPLES in sounds.js.
const AUDIO = ["applause-1", "applause-2", "whoo-1", "whoo-2", "crickets-1", "crickets-2", "rimshot-1", "rimshot-2", "rimshot-3",
  "drumroll-1", "drumroll-2", "doorbell-1", "doorbell-2", "scratch-1", "scratch-2", "scratch-3", "boing-1", "boing-2"];
const ASSETS = ["/", "/index.html", "/styles.css", "/app.js", "/sounds.js", "/icon.svg", "/manifest.webmanifest",
  ...AUDIO.map((name) => `/audio/${name}.mp3`)];

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
