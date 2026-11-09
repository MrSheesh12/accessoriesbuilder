import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { priceLabel } from "./js/price-label.js";
import { PHOTOS } from "./js/photos.js";

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
  "js/price-label.js",
  "js/photos.js",
];

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
  });
});

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
