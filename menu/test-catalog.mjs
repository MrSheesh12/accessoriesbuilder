import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bulletsFor, tierChoices } from "./js/copy.js";
import { photosFor, PHOTOS } from "./js/photos.js";
import { priceLabel } from "./js/price-label.js";
import { inflateSync } from "node:zlib";

const root = dirname(fileURLToPath(import.meta.url));
const errors = [];
const fail = (message) => errors.push(message);

const HOME = [
  ["floor-mats", "Floor Mats"],
  ["bed-covers", "Bed Covers"],
  ["lift-level-kits", "Lift & Level Kits"],
  ["bumper-grille", "Bumper & Grille"],
  ["lighting", "Lighting"],
  ["bedliners", "Bedliners"],
  ["running-boards-steps", "Running Boards/Steps"],
  ["towing-5th-wheel", "Towing / 5th Wheel"],
  ["wheels-tires", "Wheels & Tires"],
  ["performance", "Performance"],
  ["tint", "Tint"],
  ["commercial-fleet", "Commercial / Fleet"],
  ["interior", "Interior"],
  ["audio", "Audio"],
  ["ppf-coating", "PPF & Coating"],
];

const TIERS = new Set(["good", "better", "best"]);
const FORBIDDEN = /gross|cost|vendor|times_sold|rmac|keystone/i;
const PAGE_FILES = [
  "catalog.json",
  "index.html",
  "css/menu.css",
  "js/menu.js",
  "js/copy.js",
  "js/price-label.js",
  "js/photos.js",
];

const MISMATCHED_COVERS = [
  ["hard-folding-cover-f-150-6-5-bed-advantage-rev-ford", "bakflip"],
  ["hard-roll-up-cover-f-150-rev-ford", "bakflip"],
  ["retractable-cover-f-150-5-5-bed-embark-ford", "retrax"],
  ["powered-retractable-cover-f-150-6-5-bed-leer-ford", "retrax"],
];

function paeth(a, b, c) {
  const estimate = a + b - c;
  const da = Math.abs(estimate - a);
  const db = Math.abs(estimate - b);
  const dc = Math.abs(estimate - c);
  if (da <= db && da <= dc) return a;
  if (db <= dc) return b;
  return c;
}

function isFlatOrTextGraphic(filePath) {
  const data = readFileSync(filePath);
  if (data.includes(Buffer.from("(placeholder)"))) return true;
  let offset = 8;
  const idat = [];
  let width = 0;
  let height = 0;
  let colorType = 6;
  while (offset + 8 <= data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString("ascii", offset + 4, offset + 8);
    const chunk = data.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      colorType = chunk[9];
    } else if (type === "IDAT") idat.push(chunk);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  if (!width || !height || colorType !== 2 && colorType !== 6) return false;
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const rows = [];
  let cursor = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[cursor];
    cursor += 1;
    const row = Buffer.from(raw.subarray(cursor, cursor + stride));
    cursor += stride;
    const prior = rows[y - 1];
    for (let i = 0; i < row.length; i += 1) {
      const left = i >= channels ? row[i - channels] : 0;
      const up = prior ? prior[i] : 0;
      const upLeft = prior && i >= channels ? prior[i - channels] : 0;
      if (filter === 1) row[i] = (row[i] + left) & 255;
      else if (filter === 2) row[i] = (row[i] + up) & 255;
      else if (filter === 3) row[i] = (row[i] + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) row[i] = (row[i] + paeth(left, up, upLeft)) & 255;
    }
    rows.push(row);
  }
  const colors = new Set();
  const stepY = Math.max(1, Math.floor(height / 40));
  const stepX = Math.max(1, Math.floor(width / 40));
  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const i = x * channels;
      colors.add(`${rows[y][i]},${rows[y][i + 1]},${rows[y][i + 2]}`);
    }
  }
  return colors.size < 48;
}

function isSafeImage(value) {
  if (typeof value !== "string" || !value) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return false;
  if (value.startsWith("/") || value.includes("\\") || value.split("/").includes("..")) return false;
  return true;
}

function imageExists(value) {
  const full = resolve(root, value);
  const rel = relative(root, full);
  if (rel.startsWith("..")) return false;
  return existsSync(full) && normalize(rel) === rel;
}

const catalogPath = join(root, "catalog.json");
const rawCatalog = readFileSync(catalogPath, "utf8");
let catalog;
try {
  catalog = JSON.parse(rawCatalog);
} catch (error) {
  console.error(`catalog.json is not valid JSON: ${error.message}`);
  process.exit(1);
}

PAGE_FILES.forEach((file) => {
  const text = file === "catalog.json" ? rawCatalog : readFileSync(join(root, file), "utf8");
  if (FORBIDDEN.test(text)) fail(`${file} contains a private field name`);
});

if (!Array.isArray(catalog.categories) || !Array.isArray(catalog.items)) {
  fail("catalog needs categories and items arrays");
}

const categories = catalog.categories || [];
const items = catalog.items || [];

if (categories.length !== HOME.length) fail(`expected ${HOME.length} categories, found ${categories.length}`);
HOME.forEach(([id, name], index) => {
  const category = categories[index];
  if (!category || category.id !== id || category.name !== name) {
    fail(`category ${index + 1} must be ${name} (${id})`);
  }
});

if (items.length !== 36) fail(`expected 36 public items, found ${items.length}`);
if (items.some((item) => item && item.review === true)) fail("catalog.json still has a review item");
if (rawCatalog.includes("full-vehicle-tint")) fail("full-vehicle-tint must not be in the public catalog");
if (/"review"\s*:/.test(rawCatalog)) fail("review flags must not be stored in catalog.json");

const ids = new Set();
const categoryIds = new Set(categories.map((category) => category && category.id));
items.forEach((item, index) => {
  const where = `items[${index}]`;
  if (!item || typeof item !== "object") {
    fail(`${where} must be an object`);
    return;
  }
  if (typeof item.id !== "string" || !item.id) fail(`${where}.id is required`);
  if (ids.has(item.id)) fail(`duplicate id ${item.id}`);
  ids.add(item.id);
  if (!categoryIds.has(item.category)) fail(`${where}.category is unknown`);
  if (typeof item.name !== "string" || !item.name.trim()) fail(`${where}.name is required`);
  if (typeof item.sellingPoint !== "string" || !item.sellingPoint.trim() || item.sellingPoint.includes("\n")) {
    fail(`${where}.sellingPoint must be one line`);
  }
  if (!Array.isArray(item.fits) || item.fits.length === 0 || item.fits.some((fit) => typeof fit !== "string" || !fit.trim())) {
    fail(`${where}.fits must be a non-empty list of labels`);
  }
  const priced = typeof item.price === "number" && Number.isFinite(item.price) && item.price >= 0;
  if (item.price !== null && !priced) fail(`${where}.price must be a number or null`);
  if (item.tier !== null && item.tier !== undefined && !TIERS.has(item.tier)) {
    fail(`${where}.tier must be good, better, best, or null`);
  }
  if ("example" in item) fail(`${where} still has an example flag`);
});

const carbon = items.find((item) => item.id === "front-window-tint-2-fronts-carbon");
if (!carbon || carbon.price !== 280) fail("front carbon tint must stay priced at 280");

["audio", "ppf-coating"].forEach((id) => {
  if (items.some((item) => item.category === id)) fail(`${id} should have no public items, so its tile stays hidden`);
});

const menuJs = readFileSync(join(root, "js/menu.js"), "utf8");
if (!menuJs.includes("itemsIn(category.id).length > 0")) fail("home grid must skip categories with no items");
if (menuJs.includes("SHOW_REVIEW_ITEMS")) fail("the review toggle must not ship in the menu");
if (menuJs.includes("full-vehicle-tint")) fail("full-vehicle-tint must not be referenced by the page");

Object.entries(PHOTOS).forEach(([id, paths]) => {
  if (!ids.has(id)) fail(`photo map points at an item that is not public: ${id}`);
  paths.forEach((path) => {
    if (!isSafeImage(path) || !imageExists(path)) fail(`photo for ${id} is missing: ${path}`);
    else if (isFlatOrTextGraphic(join(root, path))) fail(`photo for ${id} is a placeholder graphic: ${path}`);
  });
});

MISMATCHED_COVERS.forEach(([id, banned]) => {
  const used = photosFor(id).join(" ").toLowerCase();
  if (used.includes(banned)) fail(`${id} must not use the ${banned} photo`);
});

const imageDir = join(root, "images");
if (existsSync(imageDir)) {
  readdirSync(imageDir).forEach((name) => {
    const full = join(imageDir, name);
    if (/\.png$/i.test(name) && isFlatOrTextGraphic(full)) {
      fail(`menu/images/${name} is a filename placeholder and must be deleted`);
    }
  });
}

const softCover = items.find((item) => item.id === "soft-roll-up-cover-f-150-5-5-6-5-bed-truxedo-ford");
const softBullets = bulletsFor(softCover);
if (JSON.stringify(softBullets) !== JSON.stringify([
  "Ford OEM TruXedo soft roll-up.",
  "TruXedo",
  "Fits F-150",
])) fail(`soft cover bullets were ${JSON.stringify(softBullets)}`);

const powered = items.find((item) => item.id === "powered-retractable-cover-f-150-6-5-bed-leer-ford");
const poweredBullets = bulletsFor(powered);
if (poweredBullets.length !== 3) fail("bullets stop at 3");
if (poweredBullets[0] !== "Ford OEM LEER powered retractable" || poweredBullets[1] !== "4 hr install." || poweredBullets[2] !== "LEER") {
  fail(`powered cover bullets were ${JSON.stringify(poweredBullets)}`);
}
if (poweredBullets.some((bullet) => bullet.startsWith("Fits "))) fail("a fourth fits bullet must not be added past the limit");

items.forEach((item) => {
  const bullets = bulletsFor(item);
  if (bullets.length > 3) fail(`${item.id} has more than 3 bullets`);
  const allowed = new Set(String(item.sellingPoint).split(";").map((part) => part.trim()).filter(Boolean));
  if (String(item.brand || "").trim()) allowed.add(String(item.brand).trim());
  allowed.add(`Fits ${item.fits.join(", ")}`);
  bullets.forEach((bullet) => {
    if (!allowed.has(bullet)) fail(`${item.id} bullet is not from the catalog: ${bullet}`);
  });
});

const goodCover = items.find((item) => item.id === "soft-roll-up-cover-f-150-5-5-6-5-bed-truxedo-ford");
const goodChoices = tierChoices(goodCover, items);
if (goodChoices.some((choice) => choice.id === goodCover.id || choice.tier === "good")) {
  fail("tier choices must not include the current tier");
}
if (!goodChoices.some((choice) => choice.tier === "better") || !goodChoices.some((choice) => choice.tier === "best")) {
  fail("a good cover should link to better and best covers");
}
const betterCover = items.find((item) => item.id === "hard-folding-cover-f-150-6-5-bed-advantage-rev-ford");
const betterChoices = tierChoices(betterCover, items);
if (betterChoices.some((choice) => choice.tier === "better")) fail("better covers must not list other better covers");
if (!betterChoices.some((choice) => choice.id === goodCover.id)) fail("better cover should link back to the good cover");

const html = readFileSync(join(root, "index.html"), "utf8");
const css = readFileSync(join(root, "css/menu.css"), "utf8");
if (!html.includes('class="price" id="tray-total"') || !html.includes('class="price handle-total"')) {
  fail("build tray totals must use the price style so the toggle can hide them");
}
if (!css.includes("body.prices-off .price")) fail("price toggle must hide every price, including the tray total");

const fixture = [
  { price: null, expect: "Ask for price" },
  { price: undefined, expect: "Ask for price" },
  { price: "", expect: "Ask for price" },
  { price: 280, expect: "Starting at $280.00, installed" },
  { price: 1450.5, expect: "Starting at $1,450.50, installed" },
];
fixture.forEach((row) => {
  const actual = priceLabel(row.price);
  if (actual !== row.expect) fail(`price fixture ${JSON.stringify(row.price)} rendered ${JSON.stringify(actual)}`);
});

const stray = [];
function walk(dir) {
  readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(csv|tsv)$/i.test(entry.name) || /summary/i.test(entry.name)) stray.push(relative(root, full));
  });
}
walk(root);
if (stray.length) fail(`unexpected source files: ${stray.join(", ")}`);

if (errors.length) {
  console.error(`catalog checks failed (${errors.length}):`);
  console.error(errors.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log(`ok: ${items.length} public items, ${categories.length} categories, ask-for-price fixture passed`);
