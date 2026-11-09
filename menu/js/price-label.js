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

/** Card and product copy. Null prices stay in the price slot as words. */
export function priceLabel(price) {
  if (!hasPrice(price)) return "Ask for price";
  return `Starting at ${moneyFormat.format(Number(price))}, installed`;
}
