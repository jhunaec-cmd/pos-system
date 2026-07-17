/*
  receipt.js
  ----------
  Turns a completed sale into a printable receipt. Builds the receipt's
  HTML and drops it into a container element; printing itself is just the
  browser's normal window.print(), styled by the @media print rules in
  css/receipt.css (see the [data-print-area] attribute used there).
*/

import { formatMoney, formatDateTime } from "./utils.js";

/**
 * Renders a receipt into `container` for the given sale.
 * @param {HTMLElement} container
 * @param {object} sale - a sale record as saved by db.js (saveSale)
 * @param {object} settings - store settings (name, address, currencySymbol)
 */
export function renderReceipt(container, sale, settings) {
  const money = (amount) => formatMoney(amount, settings.currencySymbol);

  const linesHtml = sale.items
    .map(
      (item) => `
        <div class="receipt__line">
          <span class="receipt__line-name">${escapeHtml(item.name)} x${item.qty}</span>
          <span>${money(item.lineTotal)}</span>
        </div>`
    )
    .join("");

  container.innerHTML = `
    <div class="receipt" data-print-area>
      <div class="receipt__header">
        <div class="receipt__store-name">${escapeHtml(settings.storeName)}</div>
        ${settings.storeAddress ? `<div class="receipt__meta">${escapeHtml(settings.storeAddress)}</div>` : ""}
        <div class="receipt__meta">${formatDateTime(sale.timestamp)}</div>
        <div class="receipt__meta">Receipt #${escapeHtml(sale.receiptNumber)}</div>
      </div>
      <hr class="receipt__divider" />
      ${linesHtml}
      <hr class="receipt__divider" />
      <div class="receipt__totals-row">
        <span>Subtotal</span><span>${money(sale.subtotal)}</span>
      </div>
      ${
        sale.discount > 0
          ? `<div class="receipt__totals-row">
               <span>Discount</span><span>-${money(sale.discount)}</span>
             </div>`
          : ""
      }
      ${
        sale.taxEnabled === false
          ? ""
          : `<div class="receipt__totals-row">
               <span>Tax (${sale.taxRate}%)</span><span>${money(sale.taxAmount)}</span>
             </div>`
      }
      <div class="receipt__totals-row receipt__totals-row--grand">
        <span>Total</span><span>${money(sale.total)}</span>
      </div>
      <hr class="receipt__divider" />
      <div class="receipt__totals-row">
        <span>Paid by</span><span>${escapeHtml(sale.paymentMethod)}</span>
      </div>
      ${
        sale.paymentMethod === "Cash"
          ? `<div class="receipt__totals-row">
               <span>Cash tendered</span><span>${money(sale.cashTendered)}</span>
             </div>
             <div class="receipt__totals-row">
               <span>Change</span><span>${money(sale.change)}</span>
             </div>`
          : ""
      }
      <div class="receipt__footer">Thank you for your purchase!</div>
    </div>
  `;
}

/** Opens the browser's print dialog for the currently rendered receipt. */
export function printReceipt() {
  window.print();
}

/** Prevents product/store names from breaking the receipt's HTML if they
 * happen to contain characters like < or &. */
function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}
