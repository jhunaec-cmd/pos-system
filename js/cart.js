/*
  cart.js
  -------
  Manages the shopping cart for the current sale: adding/removing items,
  changing quantity, and calculating subtotal/tax/total. This is plain data
  logic with no DOM code in it, so it's easy to reason about and reuse - the
  checkout page (pos.js) is the one that draws it on screen.
*/

import { round2 } from "./utils.js";

export class Cart {
  constructor() {
    /** @type {{productId: string, name: string, price: number, qty: number, maxStock: number|null}[]} */
    this.lines = [];
  }

  /** Adds a product to the cart, or increases its quantity if it's already
   * in the cart. `maxStock` is null when the product doesn't track stock. */
  addItem(product, qty = 1) {
    const existing = this.lines.find((line) => line.productId === product.id);
    const maxStock = typeof product.stock === "number" ? product.stock : null;

    if (existing) {
      existing.qty = this._clampQty(existing.qty + qty, maxStock);
    } else {
      this.lines.push({
        productId: product.id,
        name: product.name,
        price: product.price,
        qty: this._clampQty(qty, maxStock),
        maxStock,
      });
    }
  }

  setQty(productId, qty) {
    const line = this.lines.find((l) => l.productId === productId);
    if (!line) return;

    // Zero or below means "take it out of the cart", not "clamp to 1" -
    // otherwise the decrease button would get stuck at 1 forever.
    if (Math.floor(qty) <= 0) {
      this.removeItem(productId);
      return;
    }

    line.qty = this._clampQty(qty, line.maxStock);
  }

  removeItem(productId) {
    this.lines = this.lines.filter((line) => line.productId !== productId);
  }

  clear() {
    this.lines = [];
  }

  get isEmpty() {
    return this.lines.length === 0;
  }

  /** Keeps quantity at least 1, and no more than what's in stock (when the
   * product tracks stock). */
  _clampQty(qty, maxStock) {
    const safeQty = Math.max(1, Math.floor(qty) || 1);
    return maxStock === null ? safeQty : Math.min(safeQty, Math.max(maxStock, 0));
  }

  /** Returns subtotal/tax/total for the current cart given a tax rate
   * percentage (e.g. 6 for 6%). */
  getTotals(taxRatePercent = 0) {
    const subtotal = round2(
      this.lines.reduce((sum, line) => sum + line.price * line.qty, 0)
    );
    const taxAmount = round2(subtotal * (taxRatePercent / 100));
    const total = round2(subtotal + taxAmount);
    return { subtotal, taxAmount, total };
  }
}
