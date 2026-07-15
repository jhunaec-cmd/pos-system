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

const CACHE_NAME = "pos-cache-v8";

const APP_SHELL_FILES = [
  "./",
  "./index.html",
  "./products.html",
  "./history.html",
  "./settings.html",
  "./admin.html",
  "./manifest.json",
  "./css/variables.css",
  "./css/main.css",
  "./css/pos.css",
  "./css/receipt.css",
  "./js/db.js",
  "./js/auth.js",
  "./js/device-auth.js",
  "./js/utils.js",
  "./js/cart.js",
  "./js/scanner.js",
  "./js/camera-scanner.js",
  "./js/receipt.js",
  "./js/pos.js",
  "./js/products.js",
  "./js/history.js",
  "./js/settings.js",
  "./js/admin.js",
  "./js/sw-register.js",
  "./assets/icons/icon.svg",
  // devices.json is deliberately NOT cached here - it must always be
  // fetched fresh (see device-auth.js) so revoking a device actually works.
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

// devices.json must always be fetched from the network, never from this
// cache - device-auth.js relies on it being fresh to make revoking a
// device actually work. Without this, this fetch handler would happily
// cache the first copy it ever saw and keep serving that forever, even
// though the page's own `cache: "no-store"` option only bypasses the
// browser's HTTP cache, not this service worker's interception of it.
function isNetworkOnly(request) {
  return new URL(request.url).pathname.endsWith("/devices.json");
}

// Cache-first strategy: serve from cache instantly when available (works
// offline), otherwise fetch from the network and store a copy for next time.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  if (isNetworkOnly(event.request)) {
    event.respondWith(fetch(event.request));
    return;
  }

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
