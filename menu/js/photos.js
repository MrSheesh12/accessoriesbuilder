/** Only photos of that exact product belong here. Placeholder graphics do not. */
export const PHOTOS = {};

export function photosFor(id) {
  return PHOTOS[id] ? PHOTOS[id].slice(0, 4) : [];
}
