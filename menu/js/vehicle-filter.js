/** Named trucks. SUV and Car cover what used to be filed under Other. */
export const NAMED_VEHICLES = ["F-150", "Super Duty", "Ranger", "Bronco", "Maverick"];
export const BODY_STYLES = ["SUV", "Car"];

function fitsOf(item) {
  return Array.isArray(item?.fits) ? item.fits.map((fit) => String(fit).trim()) : [];
}

/** A flag, an empty fit list, or the word universal. Fitting every truck is not enough. */
export function isUniversal(item) {
  if (!item || typeof item !== "object") return false;
  if (item.universal === true) return true;
  const fits = fitsOf(item);
  if (!fits.length) return true;
  return fits.some((fit) => fit.toLowerCase() === "universal");
}

const PICKS = ["All", "F-150", "Super Duty", "Ranger", "Maverick", "Bronco", "SUV", "Car"];

/** A saved Other pick, or any unknown value, opens on All vehicles. */
export function savedVehiclePick(value) {
  return PICKS.includes(value) ? value : "All";
}

export function itemMatchesVehicle(item, vehicle) {
  if (!vehicle || vehicle === "All") return true;
  if (isUniversal(item)) return true;
  const fits = fitsOf(item);
  if (fits.includes(vehicle)) return true;
  if ((vehicle === "SUV" || vehicle === "Car") && fits.includes("Other")) return true;
  return false;
}
