const TIER_ORDER = { good: 0, better: 1, best: 2 };

export function bulletsFor(item) {
  const clauses = String(item?.sellingPoint || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  const bullets = [...clauses];
  const brand = String(item?.brand || "").trim();
  if (brand) bullets.push(brand);
  const fits = Array.isArray(item?.fits) ? item.fits.map((fit) => String(fit).trim()).filter(Boolean) : [];
  if (fits.length) bullets.push(`Fits ${fits.join(", ")}`);
  return bullets.slice(0, 3);
}

export function tierChoices(item, catalogItems) {
  if (!item) return [];
  return (catalogItems || [])
    .filter((other) => {
      if (!other || other.id === item.id || other.category !== item.category) return false;
      if (other.review === true) return false;
      if (!Object.prototype.hasOwnProperty.call(TIER_ORDER, other.tier)) return false;
      return other.tier !== item.tier;
    })
    .sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);
}
