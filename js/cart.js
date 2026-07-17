/*
  cart.js
  -------
  Manages the shopping cart for the current sale: adding/removing items,
  changing quantity, applying discounts, and calculating subtotal/tax/total.
  This is plain data logic with no DOM code in it, so it's easy to reason
  about and reuse - the checkout page (pos.js) is the one that draws it on
  screen.
*/

import { round2, productTracksInventory } from "./utils.js";

export class Cart {
  constructor() {
    /** @type {{productId: string, name: string, price: number, qty: number, maxStock: number|null, soldByWeight: boolean, discountType: string, discountValue: number, discountApplied: boolean}[]} */
    this.lines = [];
  }

  /** Adds a product to the cart, or increases its quantity if it's already
   * in the cart. `maxStock` is null when the product doesn't track stock.
   * The product's own discount (if any) rides along with the line, but
   * isn't switched on until "Apply Discount to All/Specific Product" is
   * used - scanning an item never silently discounts it. */
  addItem(product, qty = 1) {
    const existing = this.lines.find((line) => line.productId === product.id);
    const maxStock = productTracksInventory(product) ? product.stock ?? 0 : null;
    const soldByWeight = product.soldBy === "weight";

    if (existing) {
      existing.qty = this._clampQty(existing.qty + qty, maxStock, soldByWeight);
    } else {
      this.lines.push({
        productId: product.id,
        name: product.name,
        price: product.price,
        qty: this._clampQty(qty, maxStock, soldByWeight),
        maxStock,
        soldByWeight,
        discountType: product.discountType || "none",
        discountValue: Number(product.discountValue) || 0,
        discountApplied: false,
      });
    }
  }

  setQty(productId, qty) {
    const line = this.lines.find((l) => l.productId === productId);
    if (!line) return;

    // Zero or below means "take it out of the cart".
    if (!(qty > 0)) {
      this.removeItem(productId);
      return;
    }

    line.qty = this._clampQty(qty, line.maxStock, line.soldByWeight);
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

  /** "Apply Discount to All" - switches on every line's own configured
   * discount (lines with no discount configured are untouched). */
  applyDiscountToAll() {
    this.lines.forEach((line) => {
      if (line.discountType !== "none") line.discountApplied = true;
    });
  }

  /** "Apply Discount to Specific Product" - switches on just one line's
   * configured discount. */
  applyDiscountToLine(productId) {
    const line = this.lines.find((l) => l.productId === productId);
    if (line && line.discountType !== "none") line.discountApplied = true;
  }

  removeDiscountFromLine(productId) {
    const line = this.lines.find((l) => l.productId === productId);
    if (line) line.discountApplied = false;
  }

  /** How much a single line's discount is worth, in money - 0 if the line
   * has no discount configured or it isn't switched on. */
  lineDiscountAmount(line) {
    if (!line.discountApplied || line.discountType === "none") return 0;
    const lineSubtotal = line.price * line.qty;
    if (line.discountType === "percent") {
      return round2(lineSubtotal * (line.discountValue / 100));
    }
    if (line.discountType === "amount") {
      return round2(Math.min(line.discountValue, lineSubtotal));
    }
    return 0;
  }

  /** Keeps quantity at least a small positive amount, and no more than
   * what's in stock (when the product tracks stock). Items sold by weight
   * (e.g. kg) can have fractional quantities like 0.5; items sold "each"
   * are always whole numbers. */
  _clampQty(qty, maxStock, soldByWeight) {
    const minQty = soldByWeight ? 0.001 : 1;
    let safeQty = soldByWeight ? round2(qty) : Math.floor(qty) || 1;
    safeQty = Math.max(minQty, safeQty);
    return maxStock === null ? safeQty : Math.min(safeQty, Math.max(maxStock, 0));
  }

  /** Returns subtotal/discount/tax/total for the current cart given a tax
   * rate percentage (e.g. 6 for 6%). Tax is calculated on the total after
   * discounts, which is the common approach. */
  getTotals(taxRatePercent = 0) {
    const subtotal = round2(
      this.lines.reduce((sum, line) => sum + line.price * line.qty, 0)
    );
    const discount = round2(
      this.lines.reduce((sum, line) => sum + this.lineDiscountAmount(line), 0)
    );
    const discountedSubtotal = round2(subtotal - discount);
    const taxAmount = round2(discountedSubtotal * (taxRatePercent / 100));
    const total = round2(discountedSubtotal + taxAmount);
    return { subtotal, discount, taxAmount, total };
  }
}
