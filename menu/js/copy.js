import { hasPrice } from "./price-label.js?v=4092866";

const TIERS = ["good", "better", "best"];
const TIER_LABEL = { good: "Good", better: "Better", best: "Best" };

export function bulletsFor(item, options = {}) {
  const showPrices = options.showPrices !== false;
  const sellingPoint = String(item?.sellingPoint || "").trim();
  const fits = Array.isArray(item?.fits) ? item.fits.map((fit) => String(fit).trim()).filter(Boolean) : [];
  const bullets = [sellingPoint, `Fits: ${fits.join(", ")}`];
  if (showPrices && hasPrice(item?.price)) {
    bullets.push(item.listPrice ? "List price, parts only. Install extra." : "Installed price, before tax.");
  }
  return bullets;
}

export function tierSwitch(item, catalogItems) {
  if (!item || !TIERS.includes(item.tier)) return [];
  const pool = (catalogItems || []).filter((other) => other && other.category === item.category && other.review !== true && TIERS.includes(other.tier));
  const present = TIERS.filter((tier) => pool.some((other) => other.tier === tier));
  if (present.length < 2) return [];
  return present.map((tier) => {
    const group = pool.filter((other) => other.tier === tier);
    const chosen = tier === item.tier ? item : group[0];
    return {
      tier,
      label: TIER_LABEL[tier],
      id: chosen.id,
      price: chosen.price,
      current: chosen.id === item.id,
    };
  });
}
