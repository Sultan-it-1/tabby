try { importScripts('./version.js'); } catch (e) { }

const CACHE_NAME = "fast-toolkit-cache-" + (typeof APP_VERSION !== 'undefined' ? APP_VERSION : 'v1');

const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./note.html",
  "./simah.html",
  "./card.html",
  "./sticky.html",
  "./cia.html",
  "./date.html",
  "./settings.html",
  "./download.html",
  "./privacy.html",
  "./terms.html",
  "./404.html",
  "./manifest.json",
  "./theme.css",
  "./theme-utils.js",
  "./settings.js",
  "./version.js",
  "./note.js",
  "./card-utils.js",
  "./card.js",
  "./simah.js",
  "./sticky.js",
  "./cia.js",
  "./date.js",
  "./icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
  "./Apple.png",
  "./vendor/tesseract/tesseract.min.js",
  "./vendor/tesseract/worker.min.js",
  "./vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js",
  "./vendor/tesseract/core/tesseract-core-simd.wasm.js",
  "./vendor/tesseract/core/tesseract-core-lstm.wasm.js",
  "./vendor/tesseract/core/tesseract-core.wasm.js",
  "./vendor/tesseract/lang/eng.traineddata.gz",
  "./vendor/tesseract/lang/ara.traineddata.gz",
  "./vendor/flatpickr/flatpickr.min.js",
  "./vendor/flatpickr/flatpickr.min.css",
  "./vendor/flatpickr/dark.css"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((key) => (key !== CACHE_NAME ? caches.delete(key) : null))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const canonicalRequest = new Request(`${url.origin}${url.pathname}`);

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
      if (cachedResponse) {
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(canonicalRequest, networkResponse));
            }
          })
          .catch(() => { });
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(canonicalRequest, responseToCache));
        }
        return networkResponse;
      }).catch(() => {
        if (event.request.mode === "navigate") {
          return caches.match("./index.html");
        }
        return new Response("", { status: 504, statusText: "Offline" });
      });
    })
  );
});
