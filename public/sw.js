const CACHE_PREFIX = "mu-komik-pwa-";
const CACHE_NAME = `${CACHE_PREFIX}v5`;
const OFFLINE_URL = "/offline.html";
const OFFLINE_SCRIPT_URL = "/offline-episodes.js";
const PRECACHE_URLS = [
  "/pwa/icon.svg",
  "/pwa/icon-192.png",
  "/pwa/icon-512.png",
  "/pwa/icon-192-maskable.png",
  "/pwa/icon-512-maskable.png",
  "/pwa/apple-touch-icon.png",
  "/favicon.ico",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        await cache.addAll([OFFLINE_URL, OFFLINE_SCRIPT_URL]);
        const results = await Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)));
        results.forEach((result, index) => {
          if (result.status === "rejected") {
            console.error("Unable to precache mu-komik PWA asset:", {
              url: PRECACHE_URLS[index],
              error: result.reason,
            });
          }
        });
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cachedNavigation = await caches.match(request);
        if (cachedNavigation) return cachedNavigation;
        const offline = await caches.match(OFFLINE_URL);
        return offline || Response.error();
      }),
    );
    return;
  }

  const isImmutableNextAsset = url.pathname.startsWith("/_next/static/");
  const isPwaAsset = url.pathname.startsWith("/pwa/");
  const isOfflineScript = url.pathname === OFFLINE_SCRIPT_URL;
  if (!isImmutableNextAsset && !isPwaAsset && !isOfflineScript) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && response.type === "basic") {
          const responseToCache = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));
        }
        return response;
      });
    }),
  );
});
