/*
  pos.js
  ------
  Controller for the checkout page (index.html). Wires together:
  - the product grid + search box (manual item entry)
  - the barcode scanner listener (scanner.js)
  - the cart (cart.js)
  - the payment modal and receipt modal

  This file talks to the DOM directly; the actual data/calculation logic
  lives in cart.js, db.js, and receipt.js so this file stays focused on
  "what happens when the user does X".
*/

import * as db from "./db.js";
import { Cart } from "./cart.js";
import { initScanner } from "./scanner.js";
import { isCameraScanSupported, startCameraScanner } from "./camera-scanner.js";
import { renderReceipt, printReceipt } from "./receipt.js";
import { formatMoney, formatDateTime, showToast, generateId, generateReceiptNumber, round2, playBeep, productTracksInventory, stockBadgeHtml } from "./utils.js";
import { requireAuth, lock, startIdleTimer } from "./auth.js";
import { requireDeviceAuth } from "./device-auth.js";
import { applyThemeEarly } from "./theme.js";
import { applyLanguageEarly } from "./i18n.js";

applyThemeEarly();
applyLanguageEarly();
document.getElementById("nav-lock-btn").addEventListener("click", lock);

const cart = new Cart();
let products = [];
let settings = null;
let selectedPaymentMethod = "Cash";
let taxEnabled = true; // per-sale toggle - resets to on for each new sale

const productGridEl = document.getElementById("product-grid");
const searchInput = document.getElementById("product-search");
const cartLinesEl = document.getElementById("cart-lines");
const cartEmptyEl = document.getElementById("cart-empty");
const subtotalEl = document.getElementById("cart-subtotal");
const discountRowEl = document.getElementById("cart-discount-row");
const discountEl = document.getElementById("cart-discount");
const taxEl = document.getElementById("cart-tax");
const toggleTaxBtn = document.getElementById("toggle-tax-btn");
const totalEl = document.getElementById("cart-total");
const chargeBtn = document.getElementById("charge-btn");
const clearCartBtn = document.getElementById("clear-cart-btn");

const applyDiscountAllBtn = document.getElementById("apply-discount-all-btn");
const applyDiscountSpecificBtn = document.getElementById("apply-discount-specific-btn");
const discountPickerModal = document.getElementById("discount-picker-modal");
const discountPickerList = document.getElementById("discount-picker-list");
const discountPickerEmpty = document.getElementById("discount-picker-empty");
const closeDiscountPickerBtn = document.getElementById("close-discount-picker-btn");

const paymentModal = document.getElementById("payment-modal");
const paymentTotalEl = document.getElementById("payment-total");
const cashFields = document.getElementById("cash-fields");
const cashTenderedInput = document.getElementById("cash-tendered");
const changeDueEl = document.getElementById("change-due");
const cancelPaymentBtn = document.getElementById("cancel-payment-btn");
const confirmPaymentBtn = document.getElementById("confirm-payment-btn");

const receiptModal = document.getElementById("receipt-modal");
const receiptContainer = document.getElementById("receipt-container");
const printReceiptBtn = document.getElementById("print-receipt-btn");
const newSaleBtn = document.getElementById("new-sale-btn");

const cameraScanBtn = document.getElementById("camera-scan-btn");
const cameraModal = document.getElementById("camera-modal");
const cameraVideo = document.getElementById("camera-video");
const cancelCameraBtn = document.getElementById("cancel-camera-btn");
let stopCamera = null; // set while the camera modal is open

const shiftStatusText = document.getElementById("shift-status-text");
const startShiftBtn = document.getElementById("start-shift-btn");
const cashManagementBtn = document.getElementById("cash-management-btn");

const startShiftModal = document.getElementById("start-shift-modal");
const startShiftForm = document.getElementById("start-shift-form");
const shiftCashierNameField = document.getElementById("shift-cashier-name");
const shiftStartingCashField = document.getElementById("shift-starting-cash");
const shiftStartTimePreview = document.getElementById("shift-start-time-preview");
const cancelStartShiftBtn = document.getElementById("cancel-start-shift-btn");

const cashManagementModal = document.getElementById("cash-management-modal");
const cmCashierName = document.getElementById("cm-cashier-name");
const cmStartTime = document.getElementById("cm-start-time");
const cmStartingCash = document.getElementById("cm-starting-cash");
const cmCashPayments = document.getElementById("cm-cash-payments");
const cmCashRefunds = document.getElementById("cm-cash-refunds");
const cmPaidOut = document.getElementById("cm-paid-out");
const cmExpectedCash = document.getElementById("cm-expected-cash");
const paidOutForm = document.getElementById("paid-out-form");
const paidOutAmountField = document.getElementById("paid-out-amount");
const paidOutReasonField = document.getElementById("paid-out-reason");
const closeCashManagementBtn = document.getElementById("close-cash-management-btn");
const showCloseShiftBtn = document.getElementById("show-close-shift-btn");
const closeShiftSection = document.getElementById("close-shift-section");
const csGross = document.getElementById("cs-gross");
const csRefunds = document.getElementById("cs-refunds");
const csDiscounts = document.getElementById("cs-discounts");
const csNet = document.getElementById("cs-net");
const confirmCloseShiftBtn = document.getElementById("confirm-close-shift-btn");

let openShift = null;

async function init() {
  settings = await db.getSettings();
  products = await db.getAllProducts();
  productGridEl.classList.toggle("product-grid--list", settings.checkoutLayout === "list");
  renderProductGrid(products);
  renderCart();

  initScanner(handleScan, settings.scannerSensitivity);

  searchInput.addEventListener("input", () => {
    const term = searchInput.value.trim().toLowerCase();
    const filtered = term
      ? products.filter(
          (p) => p.name.toLowerCase().includes(term) || p.barcode.toLowerCase().includes(term)
        )
      : products;
    renderProductGrid(filtered);
  });

  productGridEl.addEventListener("click", (event) => {
    const tile = event.target.closest("[data-product-id]");
    if (!tile) return;
    const product = products.find((p) => p.id === tile.dataset.productId);
    if (product) addToCart(product);
  });

  cartLinesEl.addEventListener("click", (event) => {
    const line = event.target.closest("[data-line-id]");
    if (!line) return;
    const productId = line.dataset.lineId;

    if (event.target.matches("[data-action='increase']")) {
      const current = cart.lines.find((l) => l.productId === productId);
      cart.setQty(productId, current.qty + 1);
      renderCart();
    } else if (event.target.matches("[data-action='decrease']")) {
      const current = cart.lines.find((l) => l.productId === productId);
      cart.setQty(productId, current.qty - 1);
      renderCart();
    } else if (event.target.matches("[data-action='remove']")) {
      cart.removeItem(productId);
      renderCart();
    }
  });

  cartLinesEl.addEventListener("change", (event) => {
    if (!event.target.matches("[data-action='qty-input']")) return;
    const line = event.target.closest("[data-line-id]");
    cart.setQty(line.dataset.lineId, Number(event.target.value));
    renderCart();
  });

  clearCartBtn.addEventListener("click", () => {
    cart.clear();
    renderCart();
  });

  toggleTaxBtn.addEventListener("click", () => {
    taxEnabled = !taxEnabled;
    toggleTaxBtn.textContent = taxEnabled ? "Tax: On" : "Tax: Off";
    renderCart();
  });

  applyDiscountAllBtn.addEventListener("click", () => {
    cart.applyDiscountToAll();
    renderCart();
  });
  applyDiscountSpecificBtn.addEventListener("click", openDiscountPicker);
  closeDiscountPickerBtn.addEventListener("click", () => (discountPickerModal.hidden = true));
  discountPickerList.addEventListener("click", (event) => {
    const row = event.target.closest("[data-product-id]");
    if (!row) return;
    if (event.target.matches("[data-action='apply-discount']")) {
      cart.applyDiscountToLine(row.dataset.productId);
    } else if (event.target.matches("[data-action='remove-discount']")) {
      cart.removeDiscountFromLine(row.dataset.productId);
    }
    renderCart();
    renderDiscountPickerList();
  });

  chargeBtn.addEventListener("click", openPaymentModal);
  cancelPaymentBtn.addEventListener("click", closePaymentModal);
  confirmPaymentBtn.addEventListener("click", confirmPayment);

  document.querySelectorAll("[data-method]").forEach((btn) => {
    btn.addEventListener("click", () => selectPaymentMethod(btn.dataset.method));
  });

  cashTenderedInput.addEventListener("input", updateChangeDue);

  printReceiptBtn.addEventListener("click", printReceipt);
  newSaleBtn.addEventListener("click", startNewSale);

  if (!settings.cameraScanEnabled) {
    cameraScanBtn.hidden = true;
  } else if (isCameraScanSupported()) {
    cameraScanBtn.addEventListener("click", openCameraModal);
  } else {
    cameraScanBtn.disabled = true;
    cameraScanBtn.title = "Camera scanning isn't supported in this browser - try Chrome, Edge, or Safari, or use search / a USB scanner instead.";
  }
  cancelCameraBtn.addEventListener("click", closeCameraModal);

  openShift = await db.getOpenShift();
  updateShiftBar();

  startShiftBtn.addEventListener("click", openStartShiftModal);
  cancelStartShiftBtn.addEventListener("click", () => (startShiftModal.hidden = true));
  startShiftForm.addEventListener("submit", handleStartShift);

  cashManagementBtn.addEventListener("click", openCashManagementModal);
  closeCashManagementBtn.addEventListener("click", () => (cashManagementModal.hidden = true));
  paidOutForm.addEventListener("submit", handleRecordPaidOut);
  showCloseShiftBtn.addEventListener("click", showCloseShiftSummary);
  confirmCloseShiftBtn.addEventListener("click", handleConfirmCloseShift);
}

/* ---------- Shift management ---------- */

function updateShiftBar() {
  if (openShift) {
    shiftStatusText.textContent = `Shift: ${openShift.cashierName}`;
    startShiftBtn.hidden = true;
    cashManagementBtn.hidden = false;
  } else {
    shiftStatusText.textContent = "No shift open";
    startShiftBtn.hidden = false;
    cashManagementBtn.hidden = true;
  }
}

function openStartShiftModal() {
  startShiftForm.reset();
  shiftStartingCashField.value = "0";
  shiftStartTimePreview.textContent = formatDateTime(Date.now());
  startShiftModal.hidden = false;
  shiftCashierNameField.focus();
}

async function handleStartShift(event) {
  event.preventDefault();

  openShift = {
    id: generateId(),
    cashierName: shiftCashierNameField.value.trim(),
    startTime: Date.now(),
    startingCash: Number(shiftStartingCashField.value) || 0,
    endTime: null,
    paidOuts: [],
    status: "open",
    closingSummary: null,
  };

  await db.saveShift(openShift);
  startShiftModal.hidden = true;
  updateShiftBar();
  showToast(`Shift started for ${openShift.cashierName}`);
}

/** Sums this shift's sales (all of them, or just Cash-paid ones). */
async function getShiftSales(cashOnly) {
  const allSales = await db.getAllSales();
  return allSales.filter(
    (sale) => sale.shiftId === openShift.id && (!cashOnly || sale.paymentMethod === "Cash")
  );
}

async function openCashManagementModal() {
  closeShiftSection.hidden = true;
  cmCashierName.textContent = openShift.cashierName;
  cmStartTime.textContent = formatDateTime(openShift.startTime);
  await renderCashSummary();
  cashManagementModal.hidden = false;
}

async function renderCashSummary() {
  const currency = settings.currencySymbol;
  const cashSales = await getShiftSales(true);
  const cashPayments = round2(cashSales.reduce((sum, sale) => sum + sale.total, 0));
  const cashRefunds = 0; // refunds aren't tracked yet - see Settings/History for CSV export in the meantime
  const paidOut = round2(openShift.paidOuts.reduce((sum, entry) => sum + entry.amount, 0));
  const expectedCash = round2(openShift.startingCash + cashPayments - cashRefunds - paidOut);

  cmStartingCash.textContent = formatMoney(openShift.startingCash, currency);
  cmCashPayments.textContent = formatMoney(cashPayments, currency);
  cmCashRefunds.textContent = formatMoney(cashRefunds, currency);
  cmPaidOut.textContent = formatMoney(paidOut, currency);
  cmExpectedCash.textContent = formatMoney(expectedCash, currency);
}

async function handleRecordPaidOut(event) {
  event.preventDefault();

  const amount = Number(paidOutAmountField.value);
  const reason = paidOutReasonField.value.trim();
  if (!Number.isFinite(amount) || amount <= 0 || !reason) return;

  openShift.paidOuts.push({ id: generateId(), amount, reason, timestamp: Date.now() });
  await db.saveShift(openShift);

  paidOutForm.reset();
  await renderCashSummary();
  showToast("Paid out recorded");
}

/** Gross/discounts/net are pre-tax (tax collected is a pass-through, not
 * revenue) - refunds stay a placeholder until that feature exists. */
async function computeSalesSummary() {
  const allShiftSales = await getShiftSales(false);
  const grossSales = round2(allShiftSales.reduce((sum, sale) => sum + sale.subtotal, 0));
  const discounts = round2(allShiftSales.reduce((sum, sale) => sum + (sale.discount || 0), 0));
  const refunds = 0; // placeholder until refunds are implemented
  const netSales = round2(grossSales - discounts - refunds);
  return { grossSales, discounts, refunds, netSales };
}

async function showCloseShiftSummary() {
  const currency = settings.currencySymbol;
  const { grossSales, discounts, refunds, netSales } = await computeSalesSummary();

  csGross.textContent = formatMoney(grossSales, currency);
  csRefunds.textContent = formatMoney(refunds, currency);
  csDiscounts.textContent = formatMoney(discounts, currency);
  csNet.textContent = formatMoney(netSales, currency);

  closeShiftSection.hidden = false;
}

async function handleConfirmCloseShift() {
  const confirmed = confirm(`Close the shift for ${openShift.cashierName}? This cannot be undone.`);
  if (!confirmed) return;

  const cashSales = await getShiftSales(true);
  const cashPayments = round2(cashSales.reduce((sum, sale) => sum + sale.total, 0));
  const paidOut = round2(openShift.paidOuts.reduce((sum, entry) => sum + entry.amount, 0));
  const { grossSales, discounts, refunds, netSales } = await computeSalesSummary();

  openShift.endTime = Date.now();
  openShift.status = "closed";
  openShift.closingSummary = {
    grossSales,
    refunds,
    discounts,
    netSales,
    cashPayments,
    cashRefunds: 0,
    paidOut,
    expectedCash: round2(openShift.startingCash + cashPayments - paidOut),
  };

  await db.saveShift(openShift);
  showToast(`Shift closed for ${openShift.cashierName}`);
  openShift = null;
  cashManagementModal.hidden = true;
  updateShiftBar();
}

/* ---------- Product grid ---------- */

function renderProductGrid(list) {
  if (list.length === 0) {
    productGridEl.innerHTML = `<p class="empty-state">No products found.</p>`;
    return;
  }

  productGridEl.innerHTML = list
    .map((product) => {
      const outOfStock = productTracksInventory(product) && product.stock <= 0;
      return `
        <button
          type="button"
          class="product-tile"
          data-product-id="${product.id}"
          ${outOfStock ? "disabled" : ""}
        >
          ${product.image ? `<img class="product-tile__image" src="${product.image}" alt="" />` : ""}
          <span class="product-tile__name">${escapeHtml(product.name)}</span>
          <span class="product-tile__price">${formatMoney(product.price, settings.currencySymbol)}${product.soldBy === "weight" ? "/kg" : ""}</span>
          ${stockBadgeHtml(product)}
        </button>`;
    })
    .join("");
}

function addToCart(product) {
  if (productTracksInventory(product) && product.stock <= 0) {
    showToast(`${product.name} is out of stock`);
    return;
  }
  cart.addItem(product);
  renderCart();
}

/** Called by scanner.js (USB scanner) or the camera scanner whenever a
 * barcode is read. */
async function handleScan(barcode) {
  if (settings.scannerSoundEnabled) playBeep();

  const product = products.find((p) => p.barcode === barcode);
  if (!product) {
    showToast(`No product found for barcode ${barcode}`);
    return;
  }
  addToCart(product);
}

/* ---------- Camera barcode scanner ---------- */

let cameraModalOpen = false;

async function openCameraModal() {
  cameraModal.hidden = false;
  cameraModalOpen = true;

  const stop = await startCameraScanner(cameraVideo, {
    onDetect: (barcode) => {
      closeCameraModal();
      handleScan(barcode);
    },
    onError: (error) => {
      closeCameraModal();
      showToast(`Could not access camera: ${error.message || "permission denied"}`);
    },
  });

  if (!cameraModalOpen) {
    // The modal was cancelled before the camera finished starting up -
    // stop it immediately instead of leaving it running in the background.
    stop();
    return;
  }
  stopCamera = stop;
}

function closeCameraModal() {
  cameraModal.hidden = true;
  cameraModalOpen = false;
  if (stopCamera) {
    stopCamera();
    stopCamera = null;
  }
}

/** The tax rate actually used for calculations right now - the store's
 * configured rate, or 0 while this sale's "Tax: Off" toggle is on. */
function getEffectiveTaxRate() {
  return taxEnabled ? settings.taxRate : 0;
}

/* ---------- Cart rendering ---------- */

function renderCart() {
  const currency = settings.currencySymbol;

  if (cart.isEmpty) {
    cartLinesEl.innerHTML = "";
    cartLinesEl.appendChild(cartEmptyEl);
    cartEmptyEl.hidden = false;
  } else {
    cartEmptyEl.hidden = true;
    cartLinesEl.innerHTML = cart.lines
      .map((line) => {
        const lineDiscount = cart.lineDiscountAmount(line);
        const lineTotal = round2(line.price * line.qty - lineDiscount);
        return `
        <div class="cart-line" data-line-id="${line.productId}">
          <div class="cart-line__info">
            <div class="cart-line__name">${escapeHtml(line.name)}</div>
            <div class="cart-line__price">${formatMoney(line.price, currency)} each${
          lineDiscount > 0 ? ` &middot; <span class="text-muted">-${formatMoney(lineDiscount, currency)} discount</span>` : ""
        }</div>
          </div>
          <div class="cart-line__qty">
            <button type="button" class="btn btn--icon" data-action="decrease" aria-label="Decrease quantity">-</button>
            <input
              type="number"
              min="1"
              value="${line.qty}"
              data-action="qty-input"
              aria-label="Quantity for ${escapeHtml(line.name)}"
            />
            <button type="button" class="btn btn--icon" data-action="increase" aria-label="Increase quantity">+</button>
          </div>
          <div class="cart-line__total">${formatMoney(lineTotal, currency)}</div>
          <button type="button" class="btn btn--icon" data-action="remove" aria-label="Remove ${escapeHtml(line.name)}">&times;</button>
        </div>`;
      })
      .join("");
  }

  const totals = cart.getTotals(getEffectiveTaxRate());
  subtotalEl.textContent = formatMoney(totals.subtotal, currency);
  discountRowEl.hidden = totals.discount <= 0;
  discountEl.textContent = `-${formatMoney(totals.discount, currency)}`;
  taxEl.textContent = formatMoney(totals.taxAmount, currency);
  totalEl.textContent = formatMoney(totals.total, currency);
  chargeBtn.disabled = cart.isEmpty;
}

/* ---------- Discount picker ---------- */

function openDiscountPicker() {
  renderDiscountPickerList();
  discountPickerModal.hidden = false;
}

function renderDiscountPickerList() {
  const eligible = cart.lines.filter((line) => line.discountType !== "none");
  discountPickerEmpty.hidden = eligible.length > 0;

  discountPickerList.innerHTML = eligible
    .map((line) => {
      const description =
        line.discountType === "percent" ? `${line.discountValue}% off` : `${formatMoney(line.discountValue, settings.currencySymbol)} off`;
      return `
        <div class="discount-picker-row" data-product-id="${line.productId}">
          <div>
            <div>${escapeHtml(line.name)}</div>
            <div class="text-muted" style="font-size: var(--font-size-sm);">${description}</div>
          </div>
          ${
            line.discountApplied
              ? `<div><span class="discount-picker-row__applied">Applied ✓</span> <button type="button" class="btn btn--icon" data-action="remove-discount">Remove</button></div>`
              : `<button type="button" class="btn btn--icon" data-action="apply-discount">Apply</button>`
          }
        </div>`;
    })
    .join("");
}

/* ---------- Payment modal ---------- */

function openPaymentModal() {
  const totals = cart.getTotals(getEffectiveTaxRate());
  paymentTotalEl.textContent = formatMoney(totals.total, settings.currencySymbol);
  cashTenderedInput.value = "";
  selectPaymentMethod("Cash");
  updateChangeDue();
  paymentModal.hidden = false;
}

function closePaymentModal() {
  paymentModal.hidden = true;
}

function selectPaymentMethod(method) {
  selectedPaymentMethod = method;
  document.querySelectorAll("[data-method]").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.method === method));
  });
  cashFields.hidden = method !== "Cash";
}

function updateChangeDue() {
  const totals = cart.getTotals(getEffectiveTaxRate());
  const tendered = Number(cashTenderedInput.value) || 0;
  const change = round2(tendered - totals.total);
  changeDueEl.textContent = formatMoney(Math.max(0, change), settings.currencySymbol);
}

async function confirmPayment() {
  const totals = cart.getTotals(getEffectiveTaxRate());
  let cashTendered = null;
  let change = null;

  if (selectedPaymentMethod === "Cash") {
    cashTendered = Number(cashTenderedInput.value) || 0;
    if (cashTendered < totals.total) {
      showToast("Cash tendered is less than the total due");
      return;
    }
    change = round2(cashTendered - totals.total);
  }

  const sale = {
    id: generateId(),
    receiptNumber: generateReceiptNumber(),
    timestamp: Date.now(),
    items: cart.lines.map((line) => ({
      productId: line.productId,
      name: line.name,
      price: line.price,
      qty: line.qty,
      discount: cart.lineDiscountAmount(line),
      lineTotal: round2(line.price * line.qty - cart.lineDiscountAmount(line)),
    })),
    subtotal: totals.subtotal,
    discount: totals.discount,
    taxRate: getEffectiveTaxRate(),
    taxAmount: totals.taxAmount,
    total: totals.total,
    paymentMethod: selectedPaymentMethod,
    cashTendered,
    change,
    shiftId: openShift ? openShift.id : null,
  };

  await db.saveSale(sale);
  await db.decrementStock(sale.items);
  products = await db.getAllProducts(); // refresh stock counts shown in the grid

  closePaymentModal();
  renderReceipt(receiptContainer, sale, settings);
  receiptModal.hidden = false;
}

function startNewSale() {
  receiptModal.hidden = true;
  cart.clear();
  taxEnabled = true;
  toggleTaxBtn.textContent = "Tax: On";
  renderCart();
  renderProductGrid(products);
  searchInput.value = "";
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

requireDeviceAuth().then(requireAuth).then(init).then(startIdleTimer);
