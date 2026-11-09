import { hasPrice } from "./price-label.js";

export const TAX_RATE = 0.089;

export function roundCents(amount) {
  return Math.round((Number(amount) + Number.EPSILON) * 100) / 100;
}

/** Sales tax is 8.9% of the full installed subtotal, rounded to cents. */
export function quoteTotals(lines) {
  let subtotal = 0;
  let callForPrice = false;
  (lines || []).forEach((line) => {
    const qty = Math.max(1, Math.round(Number(line.qty) || 1));
    if (!hasPrice(line.price)) {
      callForPrice = true;
      return;
    }
    subtotal += Number(line.price) * qty;
  });
  subtotal = roundCents(subtotal);
  const tax = roundCents(subtotal * TAX_RATE);
  const total = roundCents(subtotal + tax);
  return { subtotal, tax, total, callForPrice };
}
