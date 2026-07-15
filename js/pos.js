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
import { formatMoney, showToast, generateId, generateReceiptNumber, round2 } from "./utils.js";
import { requireAuth, lock } from "./auth.js";

document.getElementById("nav-lock-btn").addEventListener("click", lock);

const cart = new Cart();
let products = [];
let settings = null;
let selectedPaymentMethod = "Cash";

const productGridEl = document.getElementById("product-grid");
const searchInput = document.getElementById("product-search");
const cartLinesEl = document.getElementById("cart-lines");
const cartEmptyEl = document.getElementById("cart-empty");
const subtotalEl = document.getElementById("cart-subtotal");
const taxEl = document.getElementById("cart-tax");
const totalEl = document.getElementById("cart-total");
const chargeBtn = document.getElementById("charge-btn");
const clearCartBtn = document.getElementById("clear-cart-btn");

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

async function init() {
  settings = await db.getSettings();
  products = await db.getAllProducts();
  renderProductGrid(products);
  renderCart();

  initScanner(handleScan);

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

  chargeBtn.addEventListener("click", openPaymentModal);
  cancelPaymentBtn.addEventListener("click", closePaymentModal);
  confirmPaymentBtn.addEventListener("click", confirmPayment);

  document.querySelectorAll("[data-method]").forEach((btn) => {
    btn.addEventListener("click", () => selectPaymentMethod(btn.dataset.method));
  });

  cashTenderedInput.addEventListener("input", updateChangeDue);

  printReceiptBtn.addEventListener("click", printReceipt);
  newSaleBtn.addEventListener("click", startNewSale);

  if (isCameraScanSupported()) {
    cameraScanBtn.addEventListener("click", openCameraModal);
  } else {
    cameraScanBtn.disabled = true;
    cameraScanBtn.title = "Camera scanning isn't supported in this browser - try Chrome, Edge, or Safari, or use search / a USB scanner instead.";
  }
  cancelCameraBtn.addEventListener("click", closeCameraModal);
}

/* ---------- Product grid ---------- */

function renderProductGrid(list) {
  if (list.length === 0) {
    productGridEl.innerHTML = `<p class="empty-state">No products found.</p>`;
    return;
  }

  productGridEl.innerHTML = list
    .map((product) => {
      const outOfStock = typeof product.stock === "number" && product.stock <= 0;
      return `
        <button
          type="button"
          class="product-tile"
          data-product-id="${product.id}"
          ${outOfStock ? "disabled" : ""}
        >
          <span class="product-tile__name">${escapeHtml(product.name)}</span>
          <span class="product-tile__price">${formatMoney(product.price, settings.currencySymbol)}</span>
          ${
            typeof product.stock === "number"
              ? `<span class="product-tile__stock">${outOfStock ? "Out of stock" : `Stock: ${product.stock}`}</span>`
              : ""
          }
        </button>`;
    })
    .join("");
}

function addToCart(product) {
  if (typeof product.stock === "number" && product.stock <= 0) {
    showToast(`${product.name} is out of stock`);
    return;
  }
  cart.addItem(product);
  renderCart();
}

/** Called by scanner.js (USB scanner) or the camera scanner whenever a
 * barcode is read. */
async function handleScan(barcode) {
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
      .map(
        (line) => `
        <div class="cart-line" data-line-id="${line.productId}">
          <div class="cart-line__info">
            <div class="cart-line__name">${escapeHtml(line.name)}</div>
            <div class="cart-line__price">${formatMoney(line.price, currency)} each</div>
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
          <div class="cart-line__total">${formatMoney(round2(line.price * line.qty), currency)}</div>
          <button type="button" class="btn btn--icon" data-action="remove" aria-label="Remove ${escapeHtml(line.name)}">&times;</button>
        </div>`
      )
      .join("");
  }

  const totals = cart.getTotals(settings.taxRate);
  subtotalEl.textContent = formatMoney(totals.subtotal, currency);
  taxEl.textContent = formatMoney(totals.taxAmount, currency);
  totalEl.textContent = formatMoney(totals.total, currency);
  chargeBtn.disabled = cart.isEmpty;
}

/* ---------- Payment modal ---------- */

function openPaymentModal() {
  const totals = cart.getTotals(settings.taxRate);
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
  const totals = cart.getTotals(settings.taxRate);
  const tendered = Number(cashTenderedInput.value) || 0;
  const change = round2(tendered - totals.total);
  changeDueEl.textContent = formatMoney(Math.max(0, change), settings.currencySymbol);
}

async function confirmPayment() {
  const totals = cart.getTotals(settings.taxRate);
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
      lineTotal: round2(line.price * line.qty),
    })),
    subtotal: totals.subtotal,
    taxRate: settings.taxRate,
    taxAmount: totals.taxAmount,
    total: totals.total,
    paymentMethod: selectedPaymentMethod,
    cashTendered,
    change,
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
  renderCart();
  renderProductGrid(products);
  searchInput.value = "";
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

requireAuth().then(init);
