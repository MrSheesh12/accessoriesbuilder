/** Named trucks. Other is a catch-all, not a sixth required fit. */
export const NAMED_VEHICLES = ["F-150", "Super Duty", "Ranger", "Bronco", "Maverick"];

export function isUniversal(item) {
  if (!item || typeof item !== "object") return false;
  if (item.universal === true) return true;
  const fits = Array.isArray(item.fits) ? item.fits : [];
  if (fits.some((fit) => String(fit).trim().toLowerCase() === "universal")) return true;
  if (!fits.length) return true;
  return NAMED_VEHICLES.every((name) => fits.includes(name));
}

export function itemMatchesVehicle(item, vehicle) {
  if (!vehicle || vehicle === "All") return true;
  if (isUniversal(item)) return true;
  return (item.fits || []).includes(vehicle);
}
