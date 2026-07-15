/*
  products.js
  -----------
  Controller for products.html: lists products in a table, and lets staff
  add, edit, or delete them through a modal form.
*/

import * as db from "./db.js";
import { formatMoney, generateId, showToast } from "./utils.js";
import { requireAuth, lock } from "./auth.js";
import { requireDeviceAuth } from "./device-auth.js";
import { isCameraScanSupported, startCameraScanner } from "./camera-scanner.js";

document.getElementById("nav-lock-btn").addEventListener("click", lock);

let products = [];
let settings = null;

const tableBody = document.getElementById("product-table-body");
const emptyState = document.getElementById("products-empty");
const searchInput = document.getElementById("product-search");
const addBtn = document.getElementById("add-product-btn");

const modal = document.getElementById("product-modal");
const modalTitle = document.getElementById("product-modal-title");
const form = document.getElementById("product-form");
const idField = document.getElementById("product-id");
const nameField = document.getElementById("product-name");
const barcodeField = document.getElementById("product-barcode");
const priceField = document.getElementById("product-price");
const categoryField = document.getElementById("product-category");
const stockField = document.getElementById("product-stock");
const cancelBtn = document.getElementById("cancel-product-btn");

const scanBarcodeBtn = document.getElementById("scan-barcode-btn");
const cameraModal = document.getElementById("camera-modal");
const cameraVideo = document.getElementById("camera-video");
const cancelCameraBtn = document.getElementById("cancel-camera-btn");
let stopCamera = null; // set while the camera modal is open
let cameraModalOpen = false;

async function init() {
  settings = await db.getSettings();
  products = await db.getAllProducts();
  renderTable(products);

  searchInput.addEventListener("input", () => {
    const term = searchInput.value.trim().toLowerCase();
    const filtered = term
      ? products.filter(
          (p) => p.name.toLowerCase().includes(term) || p.barcode.toLowerCase().includes(term)
        )
      : products;
    renderTable(filtered);
  });

  addBtn.addEventListener("click", () => openModal());
  cancelBtn.addEventListener("click", closeModal);
  form.addEventListener("submit", handleSubmit);

  tableBody.addEventListener("click", (event) => {
    const row = event.target.closest("[data-product-id]");
    if (!row) return;
    const product = products.find((p) => p.id === row.dataset.productId);
    if (!product) return;

    if (event.target.matches("[data-action='edit']")) {
      openModal(product);
    } else if (event.target.matches("[data-action='delete']")) {
      handleDelete(product);
    }
  });

  if (isCameraScanSupported()) {
    scanBarcodeBtn.addEventListener("click", openCameraModal);
  } else {
    scanBarcodeBtn.disabled = true;
    scanBarcodeBtn.title = "Camera scanning isn't supported in this browser - try Chrome, Edge, or Safari, or type the barcode instead.";
  }
  cancelCameraBtn.addEventListener("click", closeCameraModal);
}

/* ---------- Camera barcode scanner ---------- */

async function openCameraModal() {
  cameraModal.hidden = false;
  cameraModalOpen = true;

  const stop = await startCameraScanner(cameraVideo, {
    onDetect: (barcode) => {
      closeCameraModal();
      barcodeField.value = barcode;
      document.getElementById("product-barcode-error").hidden = true;
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

function renderTable(list) {
  emptyState.hidden = list.length > 0;

  tableBody.innerHTML = list
    .map(
      (product) => `
      <tr data-product-id="${product.id}">
        <td>${escapeHtml(product.name)}</td>
        <td>${escapeHtml(product.barcode)}</td>
        <td class="text-right">${formatMoney(product.price, settings.currencySymbol)}</td>
        <td>${escapeHtml(product.category || "")}</td>
        <td class="text-right">${typeof product.stock === "number" ? product.stock : "-"}</td>
        <td class="text-right">
          <button type="button" class="btn btn--icon" data-action="edit">Edit</button>
          <button type="button" class="btn btn--icon btn--danger" data-action="delete">Delete</button>
        </td>
      </tr>`
    )
    .join("");
}

function openModal(product = null) {
  form.reset();
  clearErrors();

  if (product) {
    modalTitle.textContent = "Edit Product";
    idField.value = product.id;
    nameField.value = product.name;
    barcodeField.value = product.barcode;
    priceField.value = product.price;
    categoryField.value = product.category || "";
    stockField.value = typeof product.stock === "number" ? product.stock : "";
  } else {
    modalTitle.textContent = "Add Product";
    idField.value = "";
  }

  modal.hidden = false;
  nameField.focus();
}

function closeModal() {
  modal.hidden = true;
}

async function handleSubmit(event) {
  event.preventDefault();
  clearErrors();

  const name = nameField.value.trim();
  const barcode = barcodeField.value.trim();
  const price = Number(priceField.value);
  const stockRaw = stockField.value.trim();
  const currentId = idField.value || null;

  let hasError = false;
  if (!name) {
    showError("product-name-error");
    hasError = true;
  }

  const barcodeTaken = products.some((p) => p.barcode === barcode && p.id !== currentId);
  if (!barcode || barcodeTaken) {
    showError("product-barcode-error");
    hasError = true;
  }

  if (!Number.isFinite(price) || price <= 0) {
    showError("product-price-error");
    hasError = true;
  }

  if (hasError) return;

  const product = {
    id: currentId || generateId(),
    name,
    barcode,
    price,
    category: categoryField.value.trim(),
    stock: stockRaw === "" ? null : Number(stockRaw),
  };

  await db.saveProduct(product);
  products = await db.getAllProducts();
  renderTable(products);
  closeModal();
  showToast(currentId ? "Product updated" : "Product added");
}

async function handleDelete(product) {
  const confirmed = confirm(`Delete "${product.name}"? This cannot be undone.`);
  if (!confirmed) return;

  await db.deleteProduct(product.id);
  products = await db.getAllProducts();
  renderTable(products);
  showToast("Product deleted");
}

function showError(id) {
  document.getElementById(id).hidden = false;
}

function clearErrors() {
  document.querySelectorAll(".field-error").forEach((el) => (el.hidden = true));
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

requireDeviceAuth().then(requireAuth).then(init);
