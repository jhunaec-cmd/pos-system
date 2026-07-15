/*
  db.js
  -----
  Wraps IndexedDB (the browser's built-in database) so the rest of the app
  never has to deal with its old-fashioned, event-based API directly.
  Everything here returns a Promise, so other files can just use
  "await db.getAllProducts()" and so on.

  Why IndexedDB instead of localStorage?
  - localStorage only stores strings and gets slow with lots of data.
  - IndexedDB can store real objects, search by index (e.g. by barcode),
    and comfortably hold thousands of sales records.
*/

export const DB_NAME = "pos-db";
const DB_VERSION = 1;

let dbPromise = null;

/** Opens (or creates) the database. Safe to call many times - it only
 * actually opens the connection once and reuses it after that. */
function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    // Runs only the first time the database is created, or when
    // DB_VERSION is bumped. This is where we define the "tables".
    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      if (!database.objectStoreNames.contains("products")) {
        const products = database.createObjectStore("products", { keyPath: "id" });
        products.createIndex("barcode", "barcode", { unique: false });
        products.createIndex("name", "name", { unique: false });
      }

      if (!database.objectStoreNames.contains("sales")) {
        const sales = database.createObjectStore("sales", { keyPath: "id" });
        sales.createIndex("timestamp", "timestamp", { unique: false });
      }

      if (!database.objectStoreNames.contains("settings")) {
        database.createObjectStore("settings", { keyPath: "key" });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });

  return dbPromise;
}

/** Turns a single IndexedDB request into a Promise. */
function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Runs `work(store)` inside a transaction and resolves once it commits. */
async function withStore(storeName, mode, work) {
  const database = await openDb();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const result = work(store);

    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/* ---------- Products ---------- */

export async function getAllProducts() {
  return withStore("products", "readonly", (store) => requestToPromise(store.getAll()));
}

export async function getProductByBarcode(barcode) {
  const database = await openDb();
  const tx = database.transaction("products", "readonly");
  const index = tx.objectStore("products").index("barcode");
  return requestToPromise(index.get(barcode));
}

export async function saveProduct(product) {
  await withStore("products", "readwrite", (store) => store.put(product));
  return product;
}

export async function deleteProduct(id) {
  await withStore("products", "readwrite", (store) => store.delete(id));
}

/** Reduces stock for each cart line after a sale. Ignores products that
 * don't track stock (stock === null). */
export async function decrementStock(items) {
  const database = await openDb();
  const tx = database.transaction("products", "readwrite");
  const store = tx.objectStore("products");

  for (const item of items) {
    const product = await requestToPromise(store.get(item.productId));
    if (product && typeof product.stock === "number") {
      product.stock = Math.max(0, product.stock - item.qty);
      store.put(product);
    }
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ---------- Sales ---------- */

export async function saveSale(sale) {
  await withStore("sales", "readwrite", (store) => store.put(sale));
  return sale;
}

export async function getAllSales() {
  const sales = await withStore("sales", "readonly", (store) => requestToPromise(store.getAll()));
  // Newest first.
  return sales.sort((a, b) => b.timestamp - a.timestamp);
}

export async function getSaleById(id) {
  return withStore("sales", "readonly", (store) => requestToPromise(store.get(id)));
}

/** Permanently deletes every sale record. Used by the "Reset History"
 * button on history.html, after its own separate password check. */
export async function clearAllSales() {
  await withStore("sales", "readwrite", (store) => store.clear());
}

/* ---------- Settings ---------- */

const DEFAULT_SETTINGS = {
  storeName: "My Store",
  storeAddress: "",
  taxRate: 0,
  currencySymbol: "$",
  pinHash: null,
  masterPinHash: null,
  resetHistoryPinHash: null,
};

export async function getSettings() {
  const rows = await withStore("settings", "readonly", (store) => requestToPromise(store.getAll()));
  const settings = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

export async function saveSettings(settings) {
  const database = await openDb();
  const tx = database.transaction("settings", "readwrite");
  const store = tx.objectStore("settings");
  for (const [key, value] of Object.entries(settings)) {
    store.put({ key, value });
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ---------- Backup export / import ---------- */

/** Gathers everything into one plain object, ready to be turned into a
 * downloadable JSON file. */
export async function exportAllData() {
  const [products, sales, settings] = await Promise.all([
    getAllProducts(),
    getAllSales(),
    getSettings(),
  ]);
  return { products, sales, settings, exportedAt: new Date().toISOString() };
}

/** Restores data from a previously exported object. Existing records with
 * the same id/key are overwritten; everything else is left untouched. */
export async function importAllData(data) {
  const database = await openDb();
  const tx = database.transaction(["products", "sales", "settings"], "readwrite");

  for (const product of data.products || []) {
    tx.objectStore("products").put(product);
  }
  for (const sale of data.sales || []) {
    tx.objectStore("sales").put(sale);
  }
  if (data.settings) {
    for (const [key, value] of Object.entries(data.settings)) {
      tx.objectStore("settings").put({ key, value });
    }
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
