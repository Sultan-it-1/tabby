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
  "./icon.png",
  "./Apple.png",
];

const CDN_ASSETS = [
  "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js",
  "https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css",
  "https://cdn.jsdelivr.net/npm/flatpickr/dist/themes/dark.css",
  "https://cdn.jsdelivr.net/npm/flatpickr",
];

// Install Event - cache everything aggressively
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Cache local assets first (must succeed)
      await cache.addAll(ASSETS_TO_CACHE).catch(() => {});
      // Cache CDN assets silently (optional)
      await Promise.allSettled(CDN_ASSETS.map(url => 
        fetch(url).then(r => r.ok ? cache.put(url, r) : null).catch(() => {})
      ));
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - remove old caches
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch Event - Cache-First for HTML pages, Stale-While-Revalidate for everything else
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  const url = e.request.url;
  const isSelfOrigin = url.startsWith(self.location.origin);
  const isCDN = url.includes("jsdelivr.net") || url.includes("googleapis.com") || url.includes("gstatic.com");

  if (!isSelfOrigin && !isCDN) return;

  const isNavigation = e.request.mode === "navigate";

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Cache-first for navigation (HTML pages) — instant load!
        if (isNavigation) {
          // Revalidate silently in background
          fetch(e.request).then((r) => {
            if (r && r.status === 200) {
              caches.open(CACHE_NAME).then(c => c.put(e.request, r));
            }
          }).catch(() => {});
          return cachedResponse;
        }
        // Stale-while-revalidate for JS/CSS assets
        fetch(e.request).then((r) => {
          if (r && r.status === 200) {
            caches.open(CACHE_NAME).then(c => c.put(e.request, r));
          }
        }).catch(() => {});
        return cachedResponse;
      }

      // Not in cache — fetch and store
      return fetch(e.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200) return networkResponse;
        const clone = networkResponse.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        return networkResponse;
      }).catch(() => {
        // Return offline fallback for navigation
        if (isNavigation) return caches.match("./index.html");
      });
    })
  );
});

// Message handler - prefetch all pages on demand
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "PREFETCH_ALL") {
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(HTML_PAGES.map(url =>
        fetch(url).then(r => r.ok ? cache.put(url, r) : null).catch(() => {})
      ));
    });
  }
});
