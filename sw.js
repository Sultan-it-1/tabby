const CACHE_NAME = "fast-toolkit-cache-v1";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./note.html",
  "./simah.html",
  "./card.html",
  "./sticky.html",
  "./settings.html",
  "./settings.js",
  "./version.js",
  "./note.js",
  "./card.js",
  "./simah.js",
  "./sticky.js",
  "./icon.png",
  "./Apple.png",
  "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"
];

// Install Event
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate Event
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event (Stale-While-Revalidate cache strategy)
self.addEventListener("fetch", (e) => {
  // Filter for GET requests and secure origins
  if (e.request.method !== "GET") return;
  
  const url = e.request.url;
  const isSelfOrigin = url.startsWith(self.location.origin);
  const isCDN = url.includes("jsdelivr.net") || url.includes("googleapis.com") || url.includes("gstatic.com");

  if (!isSelfOrigin && !isCDN) return;

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch new version in background and update cache
        fetch(e.request)
          .then((networkResponse) => {
            if (networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(e.request, networkResponse));
            }
          })
          .catch(() => {});
        return cachedResponse;
      }

      return fetch(e.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        // Fallback for offline navigation errors if needed
      });
    })
  );
});
