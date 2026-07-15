/*
  settings.js
  -----------
  Controller for settings.html: edits store details/tax/currency, and
  handles exporting all data to a JSON file (backup) or importing one
  (restore / move data to another device).
*/

import * as db from "./db.js";
import { showToast } from "./utils.js";

const form = document.getElementById("settings-form");
const storeNameField = document.getElementById("store-name");
const storeAddressField = document.getElementById("store-address");
const taxRateField = document.getElementById("tax-rate");
const currencySymbolField = document.getElementById("currency-symbol");

const exportBtn = document.getElementById("export-btn");
const importInput = document.getElementById("import-input");

async function init() {
  const settings = await db.getSettings();
  storeNameField.value = settings.storeName;
  storeAddressField.value = settings.storeAddress;
  taxRateField.value = settings.taxRate;
  currencySymbolField.value = settings.currencySymbol;

  form.addEventListener("submit", handleSave);
  exportBtn.addEventListener("click", handleExport);
  importInput.addEventListener("change", handleImport);
}

async function handleSave(event) {
  event.preventDefault();

  await db.saveSettings({
    storeName: storeNameField.value.trim() || "My Store",
    storeAddress: storeAddressField.value.trim(),
    taxRate: Number(taxRateField.value) || 0,
    currencySymbol: currencySymbolField.value.trim() || "RM",
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

init();
