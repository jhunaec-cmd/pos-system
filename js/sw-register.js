/*
  sw-register.js
  --------------
  Included on every page. Registers service-worker.js so the browser can
  cache the app and offer to install it. Service workers only work over
  http(s):// (not a plain double-clicked file://), so this silently does
  nothing if that API isn't available - the rest of the app still works.

  It also auto-reloads the page the moment a newly-deployed version takes
  over, so a fix that's already live doesn't sit there invisible until
  someone happens to hard-refresh - which is easy to not know how to do,
  especially on a phone/tablet.
*/

if ("serviceWorker" in navigator) {
  let reloadedAlready = false;

  // Fires once a new service worker (from a fresh deploy) has taken control
  // of this page. Reload exactly once - without the guard, some browsers
  // can fire this more than once and cause a reload loop.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadedAlready) return;
    reloadedAlready = true;
    location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.warn("Service worker registration failed:", error);
    });
  });
}
