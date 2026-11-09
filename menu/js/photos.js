/** Photos of the exact product, from the maker or Ford Accessories. */
export const PHOTOS = {
  "fixed-running-boards-nerf-bars-dee-zee-etc": ["images/fixed-running-boards-nerf-bars-dee-zee-etc.webp"],
  "power-running-boards-amp-powersteps-or-similar": ["images/power-running-boards-amp-powersteps-or-similar.webp"],
  "lift-kit-3in-f-150-rough-country-41431": ["images/lift-kit-3in-f-150-rough-country-41431.webp"],
  "leveling-kit-f-150-readylift-2in-66-2120": ["images/leveling-kit-f-150-readylift-2in-66-2120.webp"],
  "powered-retractable-cover-f-150-6-5-bed-leer-ford": ["images/powered-retractable-cover-f-150-6-5-bed-leer-ford.webp"],
  "b-w-turnover-ball-super-duty-gooseneck-hitch": ["images/b-w-turnover-ball-super-duty-gooseneck-hitch.webp"],
  "hood-deflector": ["images/hood-deflector.webp"],
  "bed-divider-ford": ["images/bed-divider-ford.webp"],
  "oem-trailer-hitch-and-wiring-ford": ["images/oem-trailer-hitch-and-wiring-ford.webp"],
};

export function photosFor(id) {
  return PHOTOS[id] ? PHOTOS[id].slice(0, 4) : [];
}
