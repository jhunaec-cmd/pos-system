/*
  utils.js
  --------
  Small, reusable helper functions shared across pages: formatting money,
  generating unique IDs, and formatting dates. Kept separate so every page
  formats things the exact same way.
*/

/** Formats a number as money using the store's currency symbol,
 * e.g. formatMoney(12.5, "RM") -> "RM 12.50" */
export function formatMoney(amount, currencySymbol = "RM") {
  const value = Number.isFinite(amount) ? amount : 0;
  return `${currencySymbol} ${value.toFixed(2)}`;
}

/** Formats a timestamp (ms since epoch) as a readable local date + time. */
export function formatDateTime(timestamp) {
  return new Date(timestamp).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Generates a unique id. crypto.randomUUID() is supported in all modern
 * browsers; this avoids pulling in an external id-generation library. */
export function generateId() {
  return crypto.randomUUID();
}

/** Builds a short, human-friendly receipt number from the current time,
 * e.g. "R241231-8842". Not guaranteed globally unique, but good enough for
 * a receipt printed to a customer, and unique per device in practice. */
export function generateReceiptNumber() {
  const now = new Date();
  const y = String(now.getFullYear()).slice(2);
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const random = Math.floor(1000 + Math.random() * 9000);
  return `R${y}${m}${d}-${random}`;
}

/** Rounds to 2 decimal places safely (avoids floating point artefacts
 * like 19.999999999998). */
export function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Turns one field into safe CSV text: wraps it in quotes (and doubles any
 * quotes inside) whenever it contains a comma, quote, or line break -
 * otherwise Excel would misread it as extra columns/rows. */
function toCsvField(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Builds a CSV file from a list of column headers and row arrays, and
 * downloads it. Excel opens .csv files directly, so this needs no extra
 * library - just a correctly-escaped text file.
 * @param {string} filename
 * @param {string[]} headers
 * @param {Array<Array<string|number>>} rows
 */
export function downloadCsv(filename, headers, rows) {
  const lines = [headers, ...rows].map((row) => row.map(toCsvField).join(","));
  // The leading ﻿ (byte-order mark) tells Excel on Windows this file is
  // UTF-8, so currency symbols and non-English text display correctly.
  const csvText = "﻿" + lines.join("\r\n");

  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

/** Shows a small toast message at the bottom of the screen for a couple
 * of seconds. Every page includes a <div id="toast" class="toast" hidden>
 * element for this to use. */
export function showToast(message, duration = 2500) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.hidden = true;
  }, duration);
}
