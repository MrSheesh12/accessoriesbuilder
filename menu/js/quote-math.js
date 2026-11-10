import { hasPrice, PARTS_ONLY_NOTE } from "./price-label.js";

export const TAX_RATE = 0.089;

export function roundCents(amount) {
  return Math.round((Number(amount) + Number.EPSILON) * 100) / 100;
}

/** Empty means a no-charge add-on. Negative and non-numeric values are rejected. */
export function parseDollars(value) {
  if (typeof value === "number") return Number.isFinite(value) ? roundCents(value) : null;
  const text = String(value ?? "").trim().replace(/[$,\s]/g, "");
  if (text === "") return 0;
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  return roundCents(Number(text));
}

/** A custom line needs a name. Zero is allowed. A negative price is not. */
export function customItemError(draft) {
  if (!String(draft?.name ?? "").trim()) return "Enter a name.";
  const amount = parseDollars(draft?.price);
  if (amount === null || amount < 0) return "Enter a price that is zero or more.";
  return "";
}

/** Sales tax is 8.9% of the taxable lines only, rounded to cents. */
export function quoteTotals(lines) {
  let subtotal = 0;
  let taxable = 0;
  let callForPrice = false;
  (lines || []).forEach((line) => {
    const qty = Math.max(1, Math.round(Number(line.qty) || 1));
    if (!hasPrice(line.price)) {
      callForPrice = true;
      return;
    }
    const amount = Number(line.price) * qty;
    subtotal += amount;
    if (line.taxable !== false) taxable += amount;
  });
  subtotal = roundCents(subtotal);
  taxable = roundCents(taxable);
  const tax = roundCents(taxable * TAX_RATE);
  const total = roundCents(subtotal + tax);
  return { subtotal, tax, total, callForPrice };
}

export function quoteNotes(lines, totals) {
  const notes = [];
  if (totals?.callForPrice) notes.push("Items marked Call for price are not included in the totals.");
  if ((lines || []).some((line) => line && line.listPrice)) notes.push(PARTS_ONLY_NOTE);
  return notes;
}

/** A saved override wins, including a cleared field. Otherwise use the catalog number. */
export function linePartNumber(saved, catalogPart) {
  if (saved && saved.partTouched) return String(saved.partNumber || "");
  if (saved && saved.partNumber) return String(saved.partNumber);
  return String(catalogPart || "");
}

export const BED_SIZES = [
  { id: "under-8", label: "Under 8 ft", price: 650, quoteName: "Spray-in bedliner, under 8 ft bed" },
  { id: "8-plus", label: "8 ft or longer", price: 700, quoteName: "Spray-in bedliner, 8 ft+ bed" },
];

export function bedSizesFor(item) {
  if (!item) return [];
  const name = String(item.name || "");
  if (item.id === "spray-in-bedliner" || /spray-in bedliner/i.test(name)) return BED_SIZES.slice();
  return [];
}

export function bedChoice(item, sizeId) {
  const sizes = bedSizesFor(item);
  if (!sizes.length) return null;
  return sizes.find((size) => size.id === sizeId) || sizes[0];
}
