import { hasPrice, PARTS_ONLY_NOTE } from "./price-label.js?v=3cdd0e2";

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

export const VEHICLE_BEDS = {
  "F-150": [
    { id: "5.5", label: "5.5 ft", feet: 5.5 },
    { id: "6.5", label: "6.5 ft", feet: 6.5 },
    { id: "8", label: "8 ft", feet: 8 },
  ],
  "Super Duty": [
    { id: "6.75", label: "6.75 ft", feet: 6.75 },
    { id: "8", label: "8 ft", feet: 8 },
  ],
  Ranger: [
    { id: "5", label: "5 ft", feet: 5 },
    { id: "6", label: "6 ft", feet: 6 },
  ],
  Maverick: [
    { id: "4.5", label: "4.5 ft", feet: 4.5 },
  ],
};

export function isBedProduct(item) {
  if (!item) return false;
  if (item.category === "bed-covers" || item.category === "bedliners") return true;
  const text = `${item.id} ${item.name || ""}`.toLowerCase();
  return /bed-divider|bed divider|drawer|bed rack|headache rack|bed-step|bed step|tool-box|tool box|tonneau|bed mat|bedliner/.test(text);
}

export function isSprayIn(item) {
  if (!item) return false;
  return item.id === "spray-in-bedliner" || /spray-in bedliner/i.test(item.name || "");
}

/** Lengths named in the product itself. An empty list means it fits every bed of its trucks. */
export function lengthsNamedIn(item) {
  const text = `${item?.name || ""} ${item?.sellingPoint || ""}`;
  const found = [];
  const add = (id) => { if (!found.includes(id)) found.push(id); };
  if (/5\.5\s*(?:ft|['’])|5\s*['’]?\s*7\s*(?:["”]|inch)|5-foot-7/i.test(text)) add("5.5");
  if (/6\.5\s*(?:ft|['’])/i.test(text)) add("6.5");
  if (/6\.75\s*(?:ft|['’])|6\s*['’]?\s*10\s*(?:["”]|inch)|6-foot-10/i.test(text)) add("6.75");
  if (/(?<![0-9.])8\s*(?:ft|['’])|(?<![0-9])8-foot(?!-)/i.test(text)) add("8");
  if (/4\.5\s*(?:ft|['’])/i.test(text)) add("4.5");
  if (/(?<![0-9.])5\s*(?:ft|['’])(?!\s*7)/i.test(text)) add("5");
  if (/(?<![0-9.])6\s*(?:ft|['’])(?!\s*(?:5|6|7|10))/i.test(text)) add("6");
  return found;
}

function allowedBedIds(item) {
  if (Array.isArray(item?.bedLengths) && item.bedLengths.length) return item.bedLengths.map(String);
  return lengthsNamedIn(item);
}

/** Lengths this exact part fits on the chosen vehicle. One length means no picker. */
export function bedLengthsFor(item, vehicle) {
  if (!isBedProduct(item)) return [];
  const fits = Array.isArray(item.fits) ? item.fits : [];
  const names = vehicle && vehicle !== "All" ? (fits.includes(vehicle) ? [vehicle] : []) : fits;
  const named = allowedBedIds(item);
  const allowed = named.length ? new Set(named) : null;
  const seen = new Set();
  const lengths = [];
  names.forEach((name) => {
    (VEHICLE_BEDS[name] || []).forEach((length) => {
      if (allowed && !allowed.has(length.id)) return;
      if (seen.has(length.label)) return;
      seen.add(length.label);
      lengths.push(length);
    });
  });
  return lengths;
}

/** Same price and part number for every length, except spray-in: under 8 ft is $650 and 8 ft is $700. */
export function quoteForBed(item, length) {
  const baseName = String(item?.name || "");
  const name = length ? `${baseName}, ${length.label} bed` : baseName;
  let price = item?.price;
  if (isSprayIn(item) && length) price = length.feet >= 8 ? 700 : 650;
  return {
    name,
    price,
    partNumber: item?.partNumber || "",
  };
}
