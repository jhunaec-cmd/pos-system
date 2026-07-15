/*
  service-worker.js
  -----------------
  This script runs separately from the page, in the background. Its job is
  to cache the "app shell" (HTML/CSS/JS/icons) so the app:
  1. Still works with no internet connection (important for a till!)
  2. Can be "installed" as an app on PC/tablet/mobile - browsers require a
     registered service worker before they'll offer an install prompt.

  Bump CACHE_NAME (e.g. to "pos-cache-v2") whenever you change any cached
  file, so returning users get the new version instead of a stale cache.
*/

const CACHE_NAME = "pos-cache-v2";

const APP_SHELL_FILES = [
  "./",
  "./index.html",
  "./products.html",
  "./history.html",
  "./settings.html",
  "./manifest.json",
  "./css/variables.css",
  "./css/main.css",
  "./css/pos.css",
  "./css/receipt.css",
  "./js/db.js",
  "./js/utils.js",
  "./js/cart.js",
  "./js/scanner.js",
  "./js/receipt.js",
  "./js/pos.js",
  "./js/products.js",
  "./js/history.js",
  "./js/settings.js",
  "./js/sw-register.js",
  "./assets/icons/icon.svg",
];

// On install, download and cache every app shell file up front.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_FILES))
  );
  self.skipWaiting();
});

// On activate, remove any caches left over from a previous version.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

// Cache-first strategy: serve from cache instantly when available (works
// offline), otherwise fetch from the network and store a copy for next time.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        const responseCopy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseCopy));
        return response;
      });
    })
  );
});
