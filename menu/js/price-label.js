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
export function priceLabel(price, options = {}) {
  if (!hasPrice(price)) return "Ask for price";
  const amount = moneyFormat.format(Number(price));
  if (options.listPrice) return `List price ${amount} (parts only, install extra)`;
  return `Starting at ${amount}, installed`;
}
