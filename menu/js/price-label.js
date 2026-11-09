const moneyFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function money(amount) {
  return moneyFormat.format(Number(amount) || 0);
}

export function hasPrice(price) {
  if (price === null || price === undefined || price === "") return false;
  return Number.isFinite(Number(price));
}

export const PARTS_ONLY_TAG = "Parts only, install extra";
export const PARTS_ONLY_NOTE = "Some items are parts-only list prices; installation is quoted separately.";

/** Card and product copy. Null prices stay in the price slot as words. */
export function priceLabel(price, options = {}) {
  if (!hasPrice(price)) return "Ask for price";
  const amount = moneyFormat.format(Number(price));
  if (options.listPrice) return `List price ${amount}`;
  return `Starting at ${amount}, installed`;
}
