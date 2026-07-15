/*
  admin.js
  --------
  Controller for admin.html - the "master" tool for managing which devices
  are authorized to run this POS. It edits an in-memory copy of the device
  list (loaded from the live devices.json) and lets the owner copy out an
  updated version to publish - this page cannot write back to GitHub itself,
  since doing that from client-side code would mean embedding a repo-write
  secret in public JS, which anyone could then steal and use.
*/

import { requireAuth, startIdleTimer } from "./auth.js";
import { requireDeviceAuth } from "./device-auth.js";
import { sha256, showToast } from "./utils.js";

const MASTER_AUTH_OPTIONS = { settingsKey: "masterPinHash", sessionKey: "admin-unlocked" };

let devices = [];

const tableBody = document.getElementById("device-table-body");
const emptyState = document.getElementById("devices-empty");
const newLabelField = document.getElementById("new-device-label");
const generateCodeBtn = document.getElementById("generate-code-btn");
const newCodeBox = document.getElementById("new-code-box");
const newCodeValue = document.getElementById("new-code-value");
const copyCodeBtn = document.getElementById("copy-code-btn");
const publishSection = document.getElementById("publish-section");
const jsonOutput = document.getElementById("json-output");
const copyJsonBtn = document.getElementById("copy-json-btn");

async function init() {
  tableBody.addEventListener("click", handleTableClick);
  generateCodeBtn.addEventListener("click", handleGenerateCode);
  copyCodeBtn.addEventListener("click", () => copyToClipboard(newCodeValue.value, "Code copied"));
  copyJsonBtn.addEventListener("click", () => copyToClipboard(jsonOutput.value, "JSON copied"));

  await loadRegistry();
}

async function loadRegistry() {
  try {
    const response = await fetch("./devices.json", { cache: "no-store" });
    const data = await response.json();
    devices = data.devices || [];
  } catch {
    devices = [];
    showToast("Couldn't load the current device list - check your internet connection.");
  }
  render();
}

function render() {
  emptyState.hidden = devices.length > 0;

  tableBody.innerHTML = devices
    .map(
      (device) => `
      <tr data-device-id="${escapeHtml(device.id)}">
        <td>${escapeHtml(device.label)}</td>
        <td>${device.active ? "✅ Active" : "🚫 Revoked"}</td>
        <td class="text-right">
          <button type="button" class="btn btn--icon" data-action="toggle">
            ${device.active ? "Revoke" : "Reactivate"}
          </button>
          <button type="button" class="btn btn--icon btn--danger" data-action="remove">Remove</button>
        </td>
      </tr>`
    )
    .join("");

  updateJsonPreview();
}

function handleTableClick(event) {
  const row = event.target.closest("[data-device-id]");
  if (!row) return;
  const device = devices.find((d) => d.id === row.dataset.deviceId);
  if (!device) return;

  if (event.target.matches("[data-action='toggle']")) {
    device.active = !device.active;
    render();
  } else if (event.target.matches("[data-action='remove']")) {
    const confirmed = confirm(`Remove "${device.label}"? It will need a brand-new code to be re-added later.`);
    if (!confirmed) return;
    devices = devices.filter((d) => d.id !== device.id);
    render();
  }
}

async function handleGenerateCode() {
  const label = newLabelField.value.trim();
  if (!label) {
    showToast("Enter a label for this device first");
    return;
  }

  const code = generateCode();
  const codeHash = await sha256(code);
  const id = `d-${slugify(label)}-${Math.random().toString(36).slice(2, 7)}`;

  devices.push({ id, label, codeHash, active: true });

  newCodeValue.value = code;
  newCodeBox.style.display = "block";
  newLabelField.value = "";
  render();
}

/** Generates a random code from an unambiguous alphanumeric alphabet using
 * a cryptographically secure random source (not Math.random). */
function generateCode(length = 10) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);
  return Array.from(randomValues, (value) => alphabet[value % alphabet.length]).join("");
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "device";
}

function updateJsonPreview() {
  const hasDevices = devices.length > 0;
  publishSection.style.display = hasDevices ? "block" : "none";
  jsonOutput.value = JSON.stringify({ devices }, null, 2);
}

async function copyToClipboard(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(message);
  } catch {
    showToast("Couldn't copy automatically - select the text and copy it manually");
  }
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

requireDeviceAuth()
  .then(() => requireAuth(MASTER_AUTH_OPTIONS))
  .then(init)
  .then(() => startIdleTimer(MASTER_AUTH_OPTIONS));
