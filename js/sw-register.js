/*
  sw-register.js
  --------------
  Included on every page. Registers service-worker.js so the browser can
  cache the app and offer to install it. Service workers only work over
  http(s):// (not a plain double-clicked file://), so this silently does
  nothing if that API isn't available - the rest of the app still works.
*/

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.warn("Service worker registration failed:", error);
    });
  });
}
