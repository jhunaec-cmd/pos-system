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
*/

import * as db from "./db.js";

const SESSION_KEY = "pos-unlocked";

/** Hashes text with SHA-256 so the PIN is never stored in plain text. */
async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function isUnlockedThisSession() {
  return sessionStorage.getItem(SESSION_KEY) === "1";
}

/** Clears the unlocked flag and reloads, showing the lock screen again.
 * Wired to the "Lock" button in the nav bar on every page. */
export function lock() {
  sessionStorage.removeItem(SESSION_KEY);
  location.reload();
}

/**
 * Shows the lock screen (markup already present in the page's HTML) until
 * the correct PIN is entered, then resolves. Every page does:
 *   requireAuth().then(init);
 * instead of just calling init() directly.
 */
export async function requireAuth() {
  const overlay = document.getElementById("auth-overlay");
  const messageEl = document.getElementById("auth-message");
  const form = document.getElementById("auth-form");
  const pinInput = document.getElementById("auth-pin");
  const confirmField = document.getElementById("auth-confirm-field");
  const confirmInput = document.getElementById("auth-pin-confirm");
  const errorEl = document.getElementById("auth-error");
  const forgotBtn = document.getElementById("auth-forgot-btn");

  if (isUnlockedThisSession()) {
    overlay.hidden = true;
    return;
  }

  const settings = await db.getSettings();
  const firstRun = !settings.pinHash;

  messageEl.textContent = firstRun
    ? "Set up a PIN to protect this POS system. Only share it with people you authorize to use it."
    : "Enter the PIN to unlock this POS system.";
  confirmField.hidden = !firstRun;
  confirmInput.required = firstRun;
  pinInput.focus();

  if (forgotBtn) {
    forgotBtn.addEventListener("click", handleForgotPin);
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
        await db.saveSettings({ pinHash: await sha256(pinInput.value) });
        finish();
      } else {
        const enteredHash = await sha256(pinInput.value);
        if (enteredHash === settings.pinHash) {
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
        sessionStorage.setItem(SESSION_KEY, "1");
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
async function handleForgotPin() {
  const confirmed = confirm(
    "Resetting will permanently erase ALL products, sales, and settings on this device - there is no way to recover a forgotten PIN otherwise. Continue?"
  );
  if (!confirmed) return;

  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(db.DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

  sessionStorage.removeItem(SESSION_KEY);
  location.reload();
}

/** Lets an already-unlocked user change their PIN from Settings. */
export async function changePin(currentPin, newPin) {
  const settings = await db.getSettings();
  const currentHash = await sha256(currentPin);

  if (currentHash !== settings.pinHash) {
    return { ok: false, error: "Current PIN is incorrect." };
  }
  if (newPin.length < 4) {
    return { ok: false, error: "New PIN must be at least 4 characters." };
  }

  await db.saveSettings({ pinHash: await sha256(newPin) });
  return { ok: true };
}
