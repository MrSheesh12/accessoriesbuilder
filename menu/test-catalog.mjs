import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bulletsFor, tierSwitch } from "./js/copy.js";
import { photosFor, PHOTOS } from "./js/photos.js";
import { itemMatchesVehicle } from "./js/vehicle-filter.js";
import { PARTS_ONLY_NOTE, PARTS_ONLY_TAG, priceLabel } from "./js/price-label.js";
import { quoteTotals } from "./js/quote-math.js";
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
  "js/quote-math.js",
  "js/vehicle-filter.js",
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

if (items.length !== 48) fail(`expected 48 public items, found ${items.length}`);
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
const softBullets = bulletsFor(softCover, { showPrices: true });
if (JSON.stringify(softBullets) !== JSON.stringify([
  "Ford OEM TruXedo soft roll-up.",
  "Fits: F-150",
  "Installed price, before tax.",
])) fail(`soft cover bullets were ${JSON.stringify(softBullets)}`);

const powered = items.find((item) => item.id === "powered-retractable-cover-f-150-6-5-bed-leer-ford");
const poweredBullets = bulletsFor(powered, { showPrices: true });
if (JSON.stringify(poweredBullets) !== JSON.stringify([
  "Ford OEM LEER powered retractable; 4 hr install.",
  "Fits: F-150",
  "Installed price, before tax.",
])) fail(`powered cover bullets were ${JSON.stringify(poweredBullets)}`);

items.forEach((item) => {
  const shown = bulletsFor(item, { showPrices: true });
  const hidden = bulletsFor(item, { showPrices: false });
  if (shown[0] !== String(item.sellingPoint).trim()) fail(`${item.id} must use the full selling point as bullet 1`);
  if (shown[1] !== `Fits: ${item.fits.join(", ")}`) fail(`${item.id} must use the fits list as bullet 2`);
  if (item.price === null) {
    if (shown.length !== 2 || shown.some((bullet) => bullet.includes("before tax") || bullet.includes("List price"))) {
      fail(`${item.id} with a null price must drop the price bullet`);
    }
  } else if (item.listPrice) {
    if (shown.length !== 3 || shown[2] !== "List price, parts only. Install extra.") {
      fail(`${item.id} must use the list-price bullet`);
    }
  } else if (shown.length !== 3 || shown[2] !== "Installed price, before tax.") {
    fail(`${item.id} must have exactly 3 bullets when prices are shown`);
  }
  if (hidden.length !== 2 || hidden.some((bullet) => bullet.includes("before tax"))) {
    fail(`${item.id} must drop the price bullet when prices are hidden`);
  }
});

const nullPriceBullets = bulletsFor({
  sellingPoint: "Full line; still one bullet.",
  fits: ["F-150", "Ranger"],
  price: null,
}, { showPrices: true });
if (JSON.stringify(nullPriceBullets) !== JSON.stringify([
  "Full line; still one bullet.",
  "Fits: F-150, Ranger",
])) fail(`null price bullets were ${JSON.stringify(nullPriceBullets)}`);

const goodCover = items.find((item) => item.id === "soft-roll-up-cover-f-150-5-5-6-5-bed-truxedo-ford");
const goodSwitch = tierSwitch(goodCover, items);
if (goodSwitch.map((segment) => segment.label).join("|") !== "Good|Better|Best") {
  fail(`tier switch labels were ${goodSwitch.map((segment) => segment.label).join("|")}`);
}
if (!goodSwitch[0].current || goodSwitch[0].id !== goodCover.id) fail("the current good tier must be highlighted");
if (goodSwitch.some((segment) => segment.tier !== "good" && segment.current)) fail("only the current tier is highlighted");
const betterCover = items.find((item) => item.id === "hard-folding-cover-f-150-6-5-bed-advantage-rev-ford");
const betterSwitch = tierSwitch(betterCover, items);
const betterSegments = betterSwitch.filter((segment) => segment.tier === "better");
if (betterSegments.length !== 1 || betterSegments[0].id !== betterCover.id || !betterSegments[0].current) {
  fail("the switch highlights the current item instead of every item in that tier");
}
if (!betterSwitch.some((segment) => segment.id === goodCover.id && !segment.current)) {
  fail("the good segment must link to the good cover");
}

const html = readFileSync(join(root, "index.html"), "utf8");
const css = readFileSync(join(root, "css/menu.css"), "utf8");
if (!html.includes('class="price" id="tray-total"') || !html.includes('class="price handle-total"')) {
  fail("build tray totals must use the price style so the toggle can hide them");
}
if (!css.includes("body.prices-off .price")) fail("price toggle must hide every price, including the tray total");
if (!/class="seg-label"[\s\S]{0,160}class="price"/.test(menuJs)) {
  fail("tier switch prices must use the price class so Hide prices leaves only the tier label");
}

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

const taxed = quoteTotals([
  { price: 1000, qty: 1 },
  { price: 1200, qty: 1 },
  { price: 1213, qty: 1 },
]);
if (taxed.subtotal !== 3413 || taxed.tax !== 303.76 || taxed.total !== 3716.76) {
  fail(`3 items totaling $3,413 must tax to $303.76 and total $3,716.76, got ${JSON.stringify(taxed)}`);
}
const withCall = quoteTotals([
  { price: 3413, qty: 1 },
  { price: null, qty: 2 },
]);
if (withCall.subtotal !== 3413 || withCall.tax !== 303.76 || withCall.total !== 3716.76 || !withCall.callForPrice) {
  fail(`a missing price must stay out of the tax math, got ${JSON.stringify(withCall)}`);
}
if (!html.includes('id="vehicle-filter"')) fail("the vehicle filter must live in the top bar");
if (!html.includes('id="make-quote"')) fail("the tray needs a Make quote button");
if (!menuJs.includes('parts[0] === "quote"')) fail("the quote must live at #/quote");
if (!menuJs.includes("Landon Alexander")) fail("salesperson must default to Landon Alexander");
if (!menuJs.includes("Call for price")) fail("missing prices on a quote must read Call for price");
if (!css.includes("@media print") || !css.includes("size: letter")) fail("print layout must target letter paper");
if (!css.includes("body.prices-off .quote-page .price")) fail("the quote page must keep prices visible when the price switch is off");

const listed = priceLabel(1299.99, { listPrice: true });
if (listed !== "List price $1,299.99") {
  fail(`list price rendered ${JSON.stringify(listed)}`);
}
if (PARTS_ONLY_TAG !== "Parts only, install extra") fail("parts tag text changed");
if (PARTS_ONLY_NOTE !== "Some items are parts-only list prices; installation is quoted separately.") {
  fail("parts note text changed");
}
const priceFn = menuJs.slice(menuJs.indexOf("function priceHtml"), menuJs.indexOf("function newBadge"));
if (!priceFn.includes("partsTag()") || !priceFn.includes("item.listPrice") || !priceFn.includes("price-line")) {
  fail("product cards must show the parts-only tag next to a list price");
}
const rowStart = menuJs.indexOf("const rows = state.quote.lines.map");
const rowEnd = menuJs.indexOf("const notes =", rowStart);
const rowSrc = menuJs.slice(rowStart, rowEnd);
const priceCell = rowSrc.slice(rowSrc.indexOf('<td class="num">${linePriceHtml(line)}</td>'), rowSrc.indexOf("<td class=\"num\"><input"));
if (!priceCell.startsWith('<td class="num">${linePriceHtml(line)}</td>') || priceCell.includes("no-print")) {
  fail("each quote line must carry the parts tag on screen and in print");
}
const lineFn = menuJs.slice(menuJs.indexOf("function linePriceHtml"), menuJs.indexOf("function tierBadge"));
if (!lineFn.includes("partsTag()") || !lineFn.includes("isListPrice(line)")) {
  fail("quote lines for list prices must render the parts tag");
}
if (!menuJs.includes("PARTS_ONLY_NOTE") || !menuJs.includes('class="quote-totals"')) {
  fail("a parts-only quote needs the note under the totals");
}
const totalsBlock = menuJs.slice(menuJs.indexOf('class="quote-totals"'), menuJs.indexOf('class="print-foot"'));
if (!totalsBlock.includes("${notes}")) fail("the parts note must sit under the totals and print with them");
const additions = items.filter((item) => item.newAddition);
if (additions.length !== 12) fail(`expected 12 new additions, found ${additions.length}`);
additions.forEach((item) => {
  if (item.listPrice !== true) fail(`${item.id} must be marked as a list price`);
});
const withPhotos = items.filter((item) => photosFor(item.id).length);
if (withPhotos.length !== 47) fail(`expected 47 of 48 items with photos, found ${withPhotos.length}`);
const photoComing = ["mud-flaps"];
const credits = readFileSync(join(root, "images/CREDITS.md"), "utf8");
photoComing.forEach((id) => {
  if (photosFor(id).length) fail(`${id} must show Photo coming until a matching photo is added`);
  if (existsSync(join(root, "images", `${id}.webp`))) fail(`${id} photo file must be deleted`);
  if (credits.includes(id)) fail(`${id} credit must be removed`);
});
["heavy-duty-bed-mat-rubber", "yakima-overhaul-hd"].forEach((id) => {
  if (!photosFor(id).includes(`images/${id}.webp`)) fail(`${id} needs its replacement photo`);
  if (!credits.includes(`| ${id} |`)) fail(`${id} needs a credit`);
});
if (existsSync(join(root, "images/fixed-running-boards-nerf-bars-dee-zee-etc.webp"))) {
  fail("the old Dee Zee running board photo must be removed");
}
if (!photosFor("fixed-running-boards-nerf-bars-dee-zee-etc").join(" ").includes("fixed-running-boards-nerf-bars-dee-zee-etc-v2.webp")) {
  fail("the Dee Zee item must use the replacement photo");
}
const baja = items.find((item) => item.id === "baja-s2-pro-led-pair");
["All", "F-150", "Super Duty", "Ranger", "Bronco", "Maverick", "Other"].forEach((vehicle) => {
  if (!itemMatchesVehicle(baja, vehicle)) fail(`Baja S2 pods must show under ${vehicle}`);
});
items.forEach((item) => {
  const coversNamed = ["F-150", "Super Duty", "Ranger", "Bronco", "Maverick"].every((name) => (item.fits || []).includes(name));
  if (coversNamed && !itemMatchesVehicle(item, "Other")) {
    fail(`${item.id} fits every named vehicle and must show under Other`);
  }
});
if (itemMatchesVehicle({ fits: ["Ranger"] }, "Other")) fail("a Ranger-only item must stay hidden under Other");
if (!itemMatchesVehicle({ universal: true, fits: ["F-150"] }, "Other")) fail("an item marked universal must show under Other");
if (!itemMatchesVehicle({ fits: ["universal"] }, "Bronco")) fail("a fits value of universal must show under every vehicle");
if (!menuJs.includes("itemMatchesVehicle")) fail("the menu filter must use the shared vehicle match");
if (!menuJs.includes("New additions") || !menuJs.includes("tag-new")) fail("new additions need a home row and a New badge");
if (/priceSource|photoSourceUrl|partNumber/.test(rawCatalog)) fail("public catalog must not carry source fields");
if (/https?:\/\//.test(rawCatalog)) fail("public catalog must not carry source URLs");
const bannedKey = /(^|[^a-z])(source|cost|gross|vendor|times_sold|rmac|keystone)([^a-z]|$)|priceSource|photoSourceUrl|partNumber/i;
function walkKeys(value, path) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walkKeys(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  Object.entries(value).forEach(([key, entry]) => {
    if (bannedKey.test(key)) fail(`${path}.${key} is a private field`);
    walkKeys(entry, `${path}.${key}`);
  });
}
walkKeys(catalog, "catalog");

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
