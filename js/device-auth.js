/*
  device-auth.js
  --------------
  A separate gate that sits in FRONT of the staff PIN screen (js/auth.js).
  Where the PIN answers "is this operator allowed to use the till", this
  answers "is this specific gadget allowed to run the POS at all" - so the
  store owner can hand out one code per PC/tablet/phone and later shut off
  just one of them.

  Since this is a static site with no server, "shutting off a device" can't
  be instant - it works by checking this device's code against devices.json
  (a file in the same repo) every time it's online. The owner revokes a
  device by editing that file (flipping its "active" flag) and publishing a
  new version - already-authorized devices lock out the next time they can
  reach the file. See admin.html for the tool that manages that file.
*/

import { sha256 } from "./utils.js";

const DEVICE_STORAGE_KEY = "pos-device"; // localStorage - survives across browser sessions

function getStoredDevice() {
  try {
    return JSON.parse(localStorage.getItem(DEVICE_STORAGE_KEY));
  } catch {
    return null;
  }
}

function saveStoredDevice(record) {
  localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify(record));
}

/** Fetches the live device allow-list, bypassing any cache (including the
 * service worker's) so a revoked device can't hide behind a stale copy.
 * Returns null if it can't be reached (offline, or file missing). */
async function fetchRegistry() {
  try {
    const response = await fetch("./devices.json", { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Shows the device-authorization screen (markup already present in the
 * page's HTML) until this device is confirmed authorized, then resolves.
 * Every page does:
 *   requireDeviceAuth().then(requireAuth).then(init);
 * - the staff PIN and real data don't appear until the device itself passes.
 */
export async function requireDeviceAuth() {
  const overlay = document.getElementById("device-overlay");
  const messageEl = document.getElementById("device-message");
  const form = document.getElementById("device-form");
  const codeInput = document.getElementById("device-code");
  const errorEl = document.getElementById("device-error");

  const stored = getStoredDevice();
  let registry = await fetchRegistry();

  if (stored) {
    if (registry) {
      const entry = registry.devices.find((d) => d.id === stored.id);
      const stillActive = !!entry && entry.active && entry.codeHash === stored.codeHash;
      saveStoredDevice({ ...stored, verified: stillActive });

      if (stillActive) {
        overlay.hidden = true;
        return;
      }
      messageEl.textContent =
        "This device was deactivated by the store owner. Enter a new authorization code to continue.";
    } else if (stored.verified) {
      // Offline, but this device passed its check last time we could reach
      // the list - don't brick the till over a Wi-Fi blip.
      overlay.hidden = true;
      return;
    } else {
      messageEl.textContent =
        "Couldn't verify this device (no internet connection) and it wasn't previously authorized. Connect to the internet and try again.";
    }
  } else {
    messageEl.textContent = registry
      ? "This device needs an authorization code from the store owner before it can be used."
      : "This device needs an authorization code from the store owner, but there's no internet connection to check one right now. Connect and try again.";
  }

  codeInput.focus();

  return new Promise((resolve) => {
    form.addEventListener("submit", async function onSubmit(event) {
      event.preventDefault();
      errorEl.hidden = true;

      const currentRegistry = registry || (registry = await fetchRegistry());
      if (!currentRegistry) {
        showError("Can't reach the authorization list - check your internet connection and try again.");
        return;
      }

      const hash = await sha256(codeInput.value.trim());
      const entry = currentRegistry.devices.find((d) => d.codeHash === hash && d.active);
      if (!entry) {
        showError("Invalid or deactivated code. Contact the store owner for a new one.");
        codeInput.value = "";
        codeInput.focus();
        return;
      }

      saveStoredDevice({ id: entry.id, codeHash: hash, verified: true });
      overlay.hidden = true;
      form.removeEventListener("submit", onSubmit);
      resolve();

      function showError(text) {
        errorEl.textContent = text;
        errorEl.hidden = false;
      }
    });
  });
}
