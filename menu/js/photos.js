/** Shop photos copied from assets/. Anything else stays a placeholder. */
export const PHOTOS = {
  "hard-folding-cover-f-150-6-5-bed-advantage-rev-ford": ["images/bakflip-mx4.png"],
  "hard-roll-up-cover-f-150-rev-ford": ["images/bakflip-mx4.png"],
  "retractable-cover-f-150-5-5-bed-embark-ford": ["images/retrax-pro-xr.png"],
  "powered-retractable-cover-f-150-6-5-bed-leer-ford": ["images/retrax-pro-xr.png"],
  "power-running-boards-amp-powersteps-or-similar": ["images/amp-powersteps.png"],
  "rain-guards-wind-deflectors": ["images/rain-deflector.png"],
  "hood-deflector": ["images/bug-deflector-f150.png"],
  "floor-liners-1st-and-2nd-row-weathertech-or-husky": ["images/floor-mats.png"],
  "cargo-mat-liner-weathertech": ["images/floor-mats.png"],
  "spray-in-bedliner": ["images/spray-in-bedliner.png"],
};

export function photosFor(id) {
  return PHOTOS[id] ? PHOTOS[id].slice(0, 4) : [];
}
