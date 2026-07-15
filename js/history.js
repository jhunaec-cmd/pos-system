/*
  history.js
  ----------
  Controller for history.html: shows a "today" summary, lists every past
  sale newest-first, and lets staff reopen a sale to view/reprint its
  receipt.
*/

import * as db from "./db.js";
import { renderReceipt, printReceipt } from "./receipt.js";
import { formatMoney, formatDateTime } from "./utils.js";

let sales = [];
let settings = null;

const tableBody = document.getElementById("sales-table-body");
const emptyState = document.getElementById("sales-empty");
const todayCountEl = document.getElementById("today-count");
const todayTotalEl = document.getElementById("today-total");

const saleModal = document.getElementById("sale-modal");
const receiptContainer = document.getElementById("receipt-container");
const closeSaleBtn = document.getElementById("close-sale-btn");
const printSaleBtn = document.getElementById("print-sale-btn");

async function init() {
  settings = await db.getSettings();
  sales = await db.getAllSales();

  renderSummary();
  renderTable();

  tableBody.addEventListener("click", (event) => {
    const row = event.target.closest("[data-sale-id]");
    if (!row) return;
    const sale = sales.find((s) => s.id === row.dataset.saleId);
    if (sale) openSale(sale);
  });

  closeSaleBtn.addEventListener("click", () => (saleModal.hidden = true));
  printSaleBtn.addEventListener("click", printReceipt);
}

function renderSummary() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todaySales = sales.filter((sale) => sale.timestamp >= startOfToday.getTime());

  todayCountEl.textContent = String(todaySales.length);
  const total = todaySales.reduce((sum, sale) => sum + sale.total, 0);
  todayTotalEl.textContent = formatMoney(total, settings.currencySymbol);
}

function renderTable() {
  emptyState.hidden = sales.length > 0;

  tableBody.innerHTML = sales
    .map(
      (sale) => `
      <tr data-sale-id="${sale.id}">
        <td>${formatDateTime(sale.timestamp)}</td>
        <td>${sale.receiptNumber}</td>
        <td class="text-right">${sale.items.reduce((sum, i) => sum + i.qty, 0)}</td>
        <td class="text-right">${formatMoney(sale.total, settings.currencySymbol)}</td>
        <td>${sale.paymentMethod}</td>
        <td class="text-right"><button type="button" class="btn btn--icon">View / Reprint</button></td>
      </tr>`
    )
    .join("");
}

function openSale(sale) {
  renderReceipt(receiptContainer, sale, settings);
  saleModal.hidden = false;
}

init();
