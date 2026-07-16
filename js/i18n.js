/*
  i18n.js
  -------
  Translates the app's navigation, page headings, and main action buttons
  into English, Bahasa Melayu, or Chinese (Simplified). This covers the
  most-seen text, not literally every string in the app yet - adding a
  language later is just adding another object to TRANSLATIONS below, no
  redesign needed. Adding more strings later is just adding more keys.

  How it works: HTML elements are marked with data-i18n="some.key" (fills
  in textContent) or data-i18n-placeholder="some.key" (fills in the
  placeholder attribute). applyLanguage() walks the page and fills them
  all in from the saved language setting.
*/

import * as db from "./db.js";

const TRANSLATIONS = {
  en: {
    "nav.checkout": "Checkout",
    "nav.products": "Products",
    "nav.history": "History",
    "nav.settings": "Settings",
    "nav.lock": "🔒 Lock",
    "checkout.currentSale": "Current Sale",
    "checkout.searchLabel": "Search products",
    "checkout.searchPlaceholder": "Type a name or SKU...",
    "checkout.cartEmpty": "Cart is empty. Scan or tap a product to begin.",
    "checkout.subtotal": "Subtotal",
    "checkout.tax": "Tax",
    "checkout.total": "Total",
    "checkout.clear": "Clear",
    "checkout.charge": "Charge",
    "products.heading": "Products",
    "products.addProduct": "+ Add Product",
    "products.searchLabel": "Search",
    "history.heading": "Sales History",
    "history.exportCsv": "Export to Excel (CSV)",
    "history.resetHistory": "Reset History",
    "history.todaySales": "Today's Sales",
    "history.todayTotal": "Today's Total",
    "settings.heading": "Settings",
  },
  ms: {
    "nav.checkout": "Kaunter",
    "nav.products": "Produk",
    "nav.history": "Sejarah",
    "nav.settings": "Tetapan",
    "nav.lock": "🔒 Kunci",
    "checkout.currentSale": "Jualan Semasa",
    "checkout.searchLabel": "Cari produk",
    "checkout.searchPlaceholder": "Taip nama atau SKU...",
    "checkout.cartEmpty": "Troli kosong. Imbas atau ketik produk untuk mula.",
    "checkout.subtotal": "Jumlah Kecil",
    "checkout.tax": "Cukai",
    "checkout.total": "Jumlah",
    "checkout.clear": "Kosongkan",
    "checkout.charge": "Caj",
    "products.heading": "Produk",
    "products.addProduct": "+ Tambah Produk",
    "products.searchLabel": "Cari",
    "history.heading": "Sejarah Jualan",
    "history.exportCsv": "Eksport ke Excel (CSV)",
    "history.resetHistory": "Set Semula Sejarah",
    "history.todaySales": "Jualan Hari Ini",
    "history.todayTotal": "Jumlah Hari Ini",
    "settings.heading": "Tetapan",
  },
  zh: {
    "nav.checkout": "收银",
    "nav.products": "商品",
    "nav.history": "历史记录",
    "nav.settings": "设置",
    "nav.lock": "🔒 锁定",
    "checkout.currentSale": "当前交易",
    "checkout.searchLabel": "搜索商品",
    "checkout.searchPlaceholder": "输入名称或SKU...",
    "checkout.cartEmpty": "购物车是空的。扫描或点击商品开始。",
    "checkout.subtotal": "小计",
    "checkout.tax": "税额",
    "checkout.total": "总计",
    "checkout.clear": "清空",
    "checkout.charge": "收款",
    "products.heading": "商品",
    "products.addProduct": "+ 添加商品",
    "products.searchLabel": "搜索",
    "history.heading": "销售历史",
    "history.exportCsv": "导出到 Excel (CSV)",
    "history.resetHistory": "重置历史记录",
    "history.todaySales": "今日销售",
    "history.todayTotal": "今日总额",
    "settings.heading": "设置",
  },
};

export const SUPPORTED_LANGUAGES = {
  en: "English",
  ms: "Bahasa Melayu",
  zh: "中文 (简体)",
};

export function translate(lang, key) {
  return (TRANSLATIONS[lang] && TRANSLATIONS[lang][key]) || TRANSLATIONS.en[key] || key;
}

export function applyLanguage(lang) {
  const safeLang = TRANSLATIONS[lang] ? lang : "en";
  document.documentElement.lang = safeLang === "zh" ? "zh-Hans" : safeLang;

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = translate(safeLang, el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.setAttribute("placeholder", translate(safeLang, el.dataset.i18nPlaceholder));
  });
}

/** Applies the saved language as early as possible - call this at the top
 * of every page's script, alongside applyThemeEarly(). */
export function applyLanguageEarly() {
  db.getSettings().then((settings) => applyLanguage(settings.language || "en"));
}
