/*
  settings.js
  -----------
  Controller for settings.html: edits store details/tax/currency, and
  handles exporting all data to a JSON file (backup) or importing one
  (restore / move data to another device).
*/

import * as db from "./db.js";
import { showToast } from "./utils.js";
import { requireAuth, lock, changePin, startIdleTimer } from "./auth.js";
import { requireDeviceAuth } from "./device-auth.js";
import { applyThemeEarly, applyTheme } from "./theme.js";
import { applyLanguageEarly, applyLanguage } from "./i18n.js";

applyThemeEarly();
applyLanguageEarly();
document.getElementById("nav-lock-btn").addEventListener("click", lock);

const form = document.getElementById("settings-form");
const storeNameField = document.getElementById("store-name");
const storeAddressField = document.getElementById("store-address");
const taxRateField = document.getElementById("tax-rate");
const taxEnabledField = document.getElementById("tax-enabled");
const currencySymbolField = document.getElementById("currency-symbol");

const exportBtn = document.getElementById("export-btn");
const importInput = document.getElementById("import-input");

const changePinForm = document.getElementById("change-pin-form");
const currentPinField = document.getElementById("current-pin");
const newPinField = document.getElementById("new-pin");
const newPinConfirmField = document.getElementById("new-pin-confirm");

const themeField = document.getElementById("theme-select");
const checkoutLayoutField = document.getElementById("checkout-layout-select");
const languageField = document.getElementById("language-select");
const saveAppearanceBtn = document.getElementById("save-appearance-btn");

const autoLockField = document.getElementById("auto-lock-minutes");
const saveAutoLockBtn = document.getElementById("save-auto-lock-btn");
const scannerSoundField = document.getElementById("scanner-sound-enabled");
const scannerSensitivityField = document.getElementById("scanner-sensitivity");
const saveScannerSettingsBtn = document.getElementById("save-scanner-settings-btn");

async function init() {
  const settings = await db.getSettings();
  storeNameField.value = settings.storeName;
  storeAddressField.value = settings.storeAddress;
  taxRateField.value = settings.taxRate;
  taxEnabledField.checked = settings.taxEnabled !== false;
  currencySymbolField.value = settings.currencySymbol;
  autoLockField.value = String(settings.autoLockMinutes || 0);
  scannerSoundField.value = settings.scannerSoundEnabled ? "on" : "off";
  scannerSensitivityField.value = settings.scannerSensitivity || "medium";
  themeField.value = settings.theme || "system";
  checkoutLayoutField.value = settings.checkoutLayout || "grid";
  languageField.value = settings.language || "en";

  form.addEventListener("submit", handleSave);
  exportBtn.addEventListener("click", handleExport);
  importInput.addEventListener("change", handleImport);
  changePinForm.addEventListener("submit", handleChangePin);
  saveAutoLockBtn.addEventListener("click", handleSaveAutoLock);
  saveScannerSettingsBtn.addEventListener("click", handleSaveScannerSettings);
  saveAppearanceBtn.addEventListener("click", handleSaveAppearance);
}

async function handleSaveAppearance() {
  await db.saveSettings({
    theme: themeField.value,
    checkoutLayout: checkoutLayoutField.value,
    language: languageField.value,
  });
  applyTheme(themeField.value);
  applyLanguage(languageField.value);
  showToast("Appearance saved");
}

async function handleSaveAutoLock() {
  await db.saveSettings({ autoLockMinutes: Number(autoLockField.value) || 0 });
  showToast("Auto-lock setting saved");
}

async function handleSaveScannerSettings() {
  await db.saveSettings({
    scannerSoundEnabled: scannerSoundField.value === "on",
    scannerSensitivity: scannerSensitivityField.value,
  });
  showToast("Scanner settings saved");
}

async function handleChangePin(event) {
  event.preventDefault();

  if (newPinField.value !== newPinConfirmField.value) {
    showToast("New PINs don't match");
    return;
  }

  const result = await changePin(currentPinField.value, newPinField.value);
  if (result.ok) {
    changePinForm.reset();
    showToast("PIN changed");
  } else {
    showToast(result.error);
  }
}

async function handleSave(event) {
  event.preventDefault();

  await db.saveSettings({
    storeName: storeNameField.value.trim() || "My Store",
    storeAddress: storeAddressField.value.trim(),
    taxRate: Number(taxRateField.value) || 0,
    taxEnabled: taxEnabledField.checked,
    currencySymbol: currencySymbolField.value.trim() || "$",
  });

  showToast("Settings saved");
}

/** Downloads everything (products, sales, settings) as one JSON file. */
async function handleExport() {
  const data = await db.exportAllData();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `pos-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();

  URL.revokeObjectURL(url);
  showToast("Backup downloaded");
}

/** Reads a chosen JSON backup file and restores it into IndexedDB. */
async function handleImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  const confirmed = confirm(
    "Importing will overwrite any products/sales/settings that share the same ID. Continue?"
  );
  if (!confirmed) {
    importInput.value = "";
    return;
  }

  try {
    const text = await file.text();
    const data = JSON.parse(text);
    await db.importAllData(data);
    showToast("Backup imported - reloading...");
    setTimeout(() => location.reload(), 1000);
  } catch (error) {
    showToast("Could not import file - is it a valid backup?");
  } finally {
    importInput.value = "";
  }
}

requireDeviceAuth().then(requireAuth).then(init).then(startIdleTimer);
