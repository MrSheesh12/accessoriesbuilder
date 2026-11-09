/** Photos of the exact product, from the maker or Ford Accessories. */
export const PHOTOS = {
  "air-suspension-airbags-compressor": ["images/air-suspension-airbags-compressor.webp"],
  "all-terrain-tire-upgrade": ["images/all-terrain-tire-upgrade.webp"],
  "black-front-emblem-ford-oem": ["images/black-front-emblem-ford-oem.webp"],
  "cargo-mat-liner-weathertech": ["images/cargo-mat-liner-weathertech.webp"],
  "cold-air-intake": ["images/cold-air-intake.webp"],
  "fender-flares": ["images/fender-flares.webp"],
  "fixed-running-boards-nerf-bars-dee-zee-etc": ["images/fixed-running-boards-nerf-bars-dee-zee-etc.webp"],
  "floor-liners-1st-and-2nd-row-weathertech-or-husky": ["images/floor-liners-1st-and-2nd-row-weathertech-or-husky.webp"],
  "grille-guard-bull-bar": ["images/grille-guard-bull-bar.webp"],
  "hard-folding-cover-f-150-6-5-bed-advantage-rev-ford": ["images/hard-folding-cover-f-150-6-5-bed-advantage-rev-ford.webp"],
  "led-light-bar": ["images/led-light-bar.webp"],
  "lift-kit-3in-f-150-rough-country-41431": ["images/lift-kit-3in-f-150-rough-country-41431.webp"],
  "mud-flaps": ["images/mud-flaps.webp"],
  "power-running-boards-amp-powersteps-or-similar": ["images/power-running-boards-amp-powersteps-or-similar.webp"],
  "rain-guards-wind-deflectors": ["images/rain-guards-wind-deflectors.webp"],
  "leveling-kit-f-150-readylift-2in-66-2120": ["images/leveling-kit-f-150-readylift-2in-66-2120.webp"],
  "powered-retractable-cover-f-150-6-5-bed-leer-ford": ["images/powered-retractable-cover-f-150-6-5-bed-leer-ford.webp"],
  "reverse-lights-baja-designs": ["images/reverse-lights-baja-designs.webp"],
  "b-w-turnover-ball-super-duty-gooseneck-hitch": ["images/b-w-turnover-ball-super-duty-gooseneck-hitch.webp"],
  "hood-deflector": ["images/hood-deflector.webp"],
  "bed-divider-ford": ["images/bed-divider-ford.webp"],
  "oem-trailer-hitch-and-wiring-ford": ["images/oem-trailer-hitch-and-wiring-ford.webp"],
};

export function photosFor(id) {
  return PHOTOS[id] ? PHOTOS[id].slice(0, 4) : [];
}
