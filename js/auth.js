/*
  auth.js
  -------
  A PIN lock screen that gates every page. Since this whole app is a static
  site with no server (the source is public on GitHub Pages), nothing here
  can be a truly unbypassable login - a determined person with browser
  DevTools could get around it. What it DOES do: stop someone who just has
  the link (a customer, a passerby, anyone who isn't given the PIN) from
  opening the app and seeing or using any real data. Think "key-lock on a
  cash register", not "bank vault".

  Every page's controller calls requireAuth() before it loads or renders
  anything - so being "locked" isn't just a visual overlay with the real
  app quietly running behind it; no product/sales data is fetched until the
  correct PIN is entered.

  This same logic also powers the separate "Master PIN" on admin.html - see
  the settingsKey/sessionKey options below - so there's one PIN
  implementation instead of two near-identical copies.
*/

import * as db from "./db.js";
import { sha256 } from "./utils.js";

const DEFAULT_OPTIONS = {
  settingsKey: "pinHash", // which db.js settings field stores the hash
  sessionKey: "pos-unlocked", // which sessionStorage flag marks it unlocked
};

function isUnlockedThisSession(sessionKey) {
  return sessionStorage.getItem(sessionKey) === "1";
}

/** Clears the unlocked flag and reloads, showing the lock screen again.
 * Wired to the "Lock" button in the nav bar on every page. */
export function lock(options = {}) {
  const { sessionKey } = { ...DEFAULT_OPTIONS, ...options };
  sessionStorage.removeItem(sessionKey);
  location.reload();
}

/**
 * Shows the lock screen (markup already present in the page's HTML) until
 * the correct PIN is entered, then resolves. Every page does:
 *   requireAuth().then(init);
 * instead of just calling init() directly.
 */
export async function requireAuth(options = {}) {
  const { settingsKey, sessionKey } = { ...DEFAULT_OPTIONS, ...options };

  const overlay = document.getElementById("auth-overlay");
  const messageEl = document.getElementById("auth-message");
  const form = document.getElementById("auth-form");
  const pinInput = document.getElementById("auth-pin");
  const confirmField = document.getElementById("auth-confirm-field");
  const confirmInput = document.getElementById("auth-pin-confirm");
  const errorEl = document.getElementById("auth-error");
  const forgotBtn = document.getElementById("auth-forgot-btn");

  if (isUnlockedThisSession(sessionKey)) {
    overlay.hidden = true;
    return;
  }

  const settings = await db.getSettings();
  const firstRun = !settings[settingsKey];

  messageEl.textContent = firstRun
    ? "Set up a PIN to protect this POS system. Only share it with people you authorize to use it."
    : "Enter the PIN to unlock this POS system.";
  confirmField.hidden = !firstRun;
  confirmInput.required = firstRun;
  pinInput.focus();

  if (forgotBtn) {
    forgotBtn.addEventListener("click", () => handleForgotPin(sessionKey));
  }

  return new Promise((resolve) => {
    form.addEventListener("submit", async function onSubmit(event) {
      event.preventDefault();
      errorEl.hidden = true;

      if (firstRun) {
        if (pinInput.value.length < 4) {
          showError("PIN must be at least 4 characters.");
          return;
        }
        if (pinInput.value !== confirmInput.value) {
          showError("PINs don't match.");
          return;
        }
        await db.saveSettings({ [settingsKey]: await sha256(pinInput.value) });
        finish();
      } else {
        const enteredHash = await sha256(pinInput.value);
        if (enteredHash === settings[settingsKey]) {
          finish();
        } else {
          showError("Incorrect PIN.");
          pinInput.value = "";
          pinInput.focus();
        }
      }

      function showError(text) {
        errorEl.textContent = text;
        errorEl.hidden = false;
      }

      function finish() {
        sessionStorage.setItem(sessionKey, "1");
        overlay.hidden = true;
        form.removeEventListener("submit", onSubmit);
        resolve();
      }
    });
  });
}

/** Last-resort recovery: since there's no server to verify identity and
 * reset a forgotten PIN safely, the only honest option is to wipe this
 * device's local data and start over. Used by the "Forgot PIN?" link. */
async function handleForgotPin(sessionKey) {
  const confirmed = confirm(
    "Resetting will permanently erase ALL products, sales, and settings on this device - there is no way to recover a forgotten PIN otherwise. Continue?"
  );
  if (!confirmed) return;

  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(db.DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

  sessionStorage.removeItem(sessionKey);
  location.reload();
}

/** Lets an already-unlocked user change their PIN from Settings (or the
 * Master PIN from admin.html, via the settingsKey option). */
export async function changePin(currentPin, newPin, options = {}) {
  const { settingsKey } = { ...DEFAULT_OPTIONS, ...options };

  const settings = await db.getSettings();
  const currentHash = await sha256(currentPin);

  if (currentHash !== settings[settingsKey]) {
    return { ok: false, error: "Current PIN is incorrect." };
  }
  if (newPin.length < 4) {
    return { ok: false, error: "New PIN must be at least 4 characters." };
  }

  await db.saveSettings({ [settingsKey]: await sha256(newPin) });
  return { ok: true };
}
