/*
  theme.js
  --------
  Applies the Light/Dark/System appearance setting. The actual colors live
  as CSS custom properties in css/variables.css - this just sets a
  data-theme attribute on <html> so the right set of variables takes over.
  "System" (the default) means "no attribute" - the @media (prefers-color-
  scheme) block in variables.css handles it automatically.
*/

import * as db from "./db.js";

export function applyTheme(theme) {
  if (theme === "dark" || theme === "light") {
    document.documentElement.setAttribute("data-theme", theme);
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

/** Applies the saved theme as early as possible - call this at the top of
 * every page's script, independent of the device/PIN auth chain, so even
 * the lock screens show the right theme instead of waiting for unlock. */
export function applyThemeEarly() {
  db.getSettings().then((settings) => applyTheme(settings.theme));
}
