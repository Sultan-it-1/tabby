// استيراد ملف الإصدار لربط اسم الكاش ديناميكياً
try { importScripts('./version.js'); } catch (e) {}
const CACHE_NAME = "fast-toolkit-cache-" + (typeof APP_VERSION !== 'undefined' ? APP_VERSION : 'v1');

const HTML_PAGES = [
  "./",
  "./index.html",
  "./card.html",
  "./note.html",
  "./simah.html",
  "./sticky.html",
  "./cia.html",
  "./settings.html",
  "./date.html",
  "./download.html",
];

const ASSETS_TO_CACHE = [
  ...HTML_PAGES,
  "./settings.js",
  "./version.js",
  "./note.js",
  "./card.js",
  "./simah.js",
  "./sticky.js",
  "./cia.js",
  "./date.js",
  "./icon.png",
  "./Apple.png",
];

const CDN_ASSETS = [
  "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js",
  "https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css",
  "https://cdn.jsdelivr.net/npm/flatpickr/dist/themes/dark.css",
  "https://cdn.jsdelivr.net/npm/flatpickr",
];

// Helper: strip query params for cache matching (fixes ?v=Date.now() cache misses)
function stripQuery(url) {
  const u = new URL(url);
  u.search = '';
  return u.href;
}

// Install Event — cache everything aggressively on first load
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(ASSETS_TO_CACHE).catch(() => {});
      await Promise.allSettled(CDN_ASSETS.map(url =>
        fetch(url).then(r => r.ok ? cache.put(url, r) : null).catch(() => {})
      ));
    }).then(() => self.skipWaiting())
  );
});

// Activate Event — remove old caches + claim clients immediately
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch Event — Cache-First with query-param stripping
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  const url = e.request.url;
  const isSelfOrigin = url.startsWith(self.location.origin);
  const isCDN = url.includes("jsdelivr.net") || url.includes("googleapis.com") || url.includes("gstatic.com");

  if (!isSelfOrigin && !isCDN) return;

  const isNavigation = e.request.mode === "navigate";

  e.respondWith(
    (async () => {
      // Try cache with exact URL first, then without query params
      let cached = await caches.match(e.request);
      if (!cached && isSelfOrigin) {
        const cleanUrl = stripQuery(url);
        cached = await caches.match(cleanUrl);
      }

      if (cached) {
        // Revalidate in background (non-blocking)
        if (isNavigation || isSelfOrigin) {
          const cleanUrl = stripQuery(url);
          fetch(e.request).then(r => {
            if (r && r.status === 200) {
              caches.open(CACHE_NAME).then(c => c.put(cleanUrl, r));
            }
          }).catch(() => {});
        }
        return cached;
      }

      // Not in cache — fetch from network and store (with clean URL)
      try {
        const networkResponse = await fetch(e.request);
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          const cacheKey = isSelfOrigin ? stripQuery(url) : url;
          caches.open(CACHE_NAME).then(c => c.put(cacheKey, clone));
        }
        return networkResponse;
      } catch {
        if (isNavigation) return caches.match("./index.html");
      }
    })()
  );
});

// Message handler — prefetch all pages on demand
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "PREFETCH_ALL") {
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(
        [...ASSETS_TO_CACHE, ...CDN_ASSETS].map(url =>
          fetch(url).then(r => r.ok ? cache.put(url, r) : null).catch(() => {})
        )
      );
    });
  }
});
