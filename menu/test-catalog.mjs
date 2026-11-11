import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bulletsFor, tierSwitch } from "./js/copy.js";
import { photosFor, PHOTOS } from "./js/photos.js";
import { itemMatchesVehicle } from "./js/vehicle-filter.js";
import { money, PARTS_ONLY_NOTE, PARTS_ONLY_TAG, priceLabel } from "./js/price-label.js";
import { bedLengthsFor, commitLinePrice, customItemError, isBedProduct, laborLine, linePartNumber, normalizeQuote, quoteForBed, quoteNotes, quoteTotals, resetLinePrice } from "./js/quote-math.js";
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

if (items.length !== 77) fail(`expected 77 public items, found ${items.length}`);
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

const tintItems = items.filter((item) => item.category === "tint");
if (tintItems.length !== 3) fail(`tint must be exactly three ceramic items, found ${tintItems.length}`);
if (tintItems.some((item) => /carbon|dye|front window/i.test(`${item.id} ${item.name}`))) {
  fail("non-ceramic tint items must be removed");
}
const tintById = Object.fromEntries(tintItems.map((item) => [item.id, item]));
const suvTint = tintById["ceramic-full-tint-suvs-trucks"];
const carTint = tintById["ceramic-full-tint-sedans-coupes"];
const windshield = tintById["ceramic-windshield"];
if (!suvTint || suvTint.price !== 650 || suvTint.name !== "Ceramic Full Tint, SUVs and trucks") {
  fail("trucks and SUVs need the $650 ceramic full tint");
}
if (!carTint || carTint.price !== 550 || carTint.name !== "Ceramic Full Tint, sedans and coupes") {
  fail("cars need the $550 ceramic full tint");
}
if (!windshield || windshield.price !== 300 || windshield.name !== "Ceramic Windshield") {
  fail("every vehicle needs the $300 ceramic windshield");
}
[suvTint, carTint, windshield].forEach((item) => {
  if (!item || item.partNumber) fail(`${item && item.id} must not invent a part number`);
});
["F-150", "Super Duty", "Ranger", "Maverick", "Bronco", "SUV"].forEach((vehicle) => {
  if (!itemMatchesVehicle(suvTint, vehicle)) fail(`$650 ceramic tint must show for ${vehicle}`);
  if (itemMatchesVehicle(carTint, vehicle)) fail(`$550 ceramic tint must stay off ${vehicle}`);
});
if (itemMatchesVehicle(suvTint, "Car") || !itemMatchesVehicle(carTint, "Car")) {
  fail("Car must see the $550 ceramic tint and not the $650 one");
}
["All", "F-150", "Super Duty", "Ranger", "Maverick", "Bronco", "SUV", "Car"].forEach((vehicle) => {
  if (!itemMatchesVehicle(windshield, vehicle)) fail(`ceramic windshield must show for ${vehicle}`);
});

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
const withCustom = quoteTotals([
  { price: 3413, qty: 1 },
  { price: 500, qty: 1, custom: true, taxable: true },
]);
if (withCustom.subtotal !== 3913 || withCustom.tax !== 348.26 || withCustom.total !== 4261.26) {
  fail(`$500 custom taxable plus $3,413 must tax to $348.26 and total $4,261.26, got ${JSON.stringify(withCustom)}`);
}
const untaxed = quoteTotals([
  { price: 3413, qty: 1 },
  { price: 500, qty: 1, custom: true, taxable: false },
]);
if (untaxed.subtotal !== 3913 || untaxed.tax !== 303.76 || untaxed.total !== 4216.76) {
  fail(`a non-taxable custom item must stay out of tax, got ${JSON.stringify(untaxed)}`);
}
const installedAndParts = [
  { price: 500, qty: 1, listPrice: false, taxable: true, custom: true },
  { price: 200, qty: 1, listPrice: true, taxable: true, custom: true },
];
const mixedKind = quoteTotals(installedAndParts);
if (mixedKind.subtotal !== 700 || mixedKind.tax !== 62.3 || mixedKind.total !== 762.3 || money(mixedKind.tax) !== "$62.30" || money(mixedKind.total) !== "$762.30") {
  fail(`$500 installed plus $200 parts-only must total $762.30, got ${JSON.stringify(mixedKind)}`);
}
if (!quoteNotes(installedAndParts, mixedKind).includes(PARTS_ONLY_NOTE)) {
  fail("the parts-only note must show when a custom line is parts only");
}
if (customItemError({ name: "Shop towels", price: 0 }) || customItemError({ name: "Shop towels", price: "0" }) || customItemError({ name: "Shop towels", price: "" })) {
  fail("a $0 custom price must be allowed");
}
if (!customItemError({ name: "   ", price: 25 })) fail("a blank custom name must be blocked");
if (!customItemError({ name: "Credit", price: -1 }) || !customItemError({ name: "Credit", price: "-4.00" })) {
  fail("a negative custom price must be blocked");
}
if (!menuJs.includes("Add custom item") || !menuJs.includes('inputmode="decimal"') || !menuJs.includes("customItemError(")) {
  fail("the quote needs an iPad custom item form");
}
const baselineLines = [{ id: "base", name: "Package", price: 2409.93, basePrice: 2409.93, qty: 1, taxable: true, priceTouched: false }];
const baseline = quoteTotals(baselineLines);
if (baseline.total !== 2624.41 || money(baseline.total) !== "$2,624.41") {
  fail(`unedited baseline must stay $2,624.41, got ${JSON.stringify(baseline)}`);
}
const reloaded = normalizeQuote(JSON.parse(JSON.stringify({ lines: baselineLines, customerName: "Alex" })));
if (quoteTotals(reloaded.lines).total !== 2624.41 || reloaded.customerName !== "Alex") {
  fail("an unedited quote must reload to the same $2,624.41 total");
}
const edited = commitLinePrice(baselineLines[0], "2500");
if (!edited.ok || edited.line.price !== 2500 || !edited.line.priceTouched || edited.line.basePrice !== 2409.93) {
  fail(`an edited price must replace the line amount, got ${JSON.stringify(edited)}`);
}
const editedTotal = quoteTotals([edited.line]);
if (editedTotal.total === baseline.total) fail("an edited price must change the quote total");
const reset = resetLinePrice(edited.line);
if (reset.price !== 2409.93 || reset.priceTouched || quoteTotals([reset]).total !== 2624.41) {
  fail("reset must restore the catalog price and the $2,624.41 total");
}
if (commitLinePrice(baselineLines[0], "").ok || commitLinePrice(baselineLines[0], "-5").ok || commitLinePrice(baselineLines[0], "abc").ok) {
  fail("a blank, negative, or non-numeric price must be rejected");
}
if (!commitLinePrice(baselineLines[0], "0").ok || commitLinePrice(baselineLines[0], "0").line.price !== 0) {
  fail("a $0 price must be allowed");
}
const taxedLabor = laborLine({ id: "labor-tax", price: 150, taxable: true });
const taxedQuote = quoteTotals([...baselineLines, taxedLabor]);
if (Math.round((taxedQuote.total - baseline.total) * 100) !== 16335) {
  fail(`$150 taxable labor must add $163.35, got ${taxedQuote.total - baseline.total}`);
}
const freeLabor = laborLine({ id: "labor-free", price: 150, taxable: false });
const freeQuote = quoteTotals([...baselineLines, freeLabor]);
if (Math.round((freeQuote.total - baseline.total) * 100) !== 15000) {
  fail(`non-taxable labor must add $150, got ${freeQuote.total - baseline.total}`);
}
const kept = normalizeQuote(JSON.parse(JSON.stringify({
  lines: [edited.line, taxedLabor],
})));
if (kept.lines.length !== 2 || kept.lines[0].price !== 2500 || !kept.lines[0].priceTouched || kept.lines[1].labor !== true || kept.lines[1].price !== 150 || kept.lines[1].partNumber !== "—") {
  fail(`edits and labor must survive a reload, got ${JSON.stringify(kept.lines)}`);
}
if (normalizeQuote(null).lines.length !== 0 || !menuJs.includes("state.quote = normalizeQuote(null)")) {
  fail("Clear must wipe edited prices and labor lines");
}
if (!menuJs.includes("Add labor") || !menuJs.includes("data-price") || !menuJs.includes("list-was") || !menuJs.includes("data-reset-price") || !menuJs.includes('aria-label="Reset price"')) {
  fail("the quote needs an editable price, a list price, a reset, and Add labor");
}
if (!menuJs.includes("Installation labor") || !menuJs.includes("data-labor-tax") || !menuJs.includes("Part #: —")) {
  fail("labor needs a description, a taxable checkbox, and a dash part number");
}
if (menuJs.includes(">Edited<") || menuJs.includes('"Edited"')) fail("an edited price must not show an Edited tag");
if (!css.includes(".line-price") || !css.includes("font-size: 16px") || !css.includes("min-height: 44px")) {
  fail("the price field must be a 16px, 44px iPad control");
}
const knownParts = {
  "bakflip-mx4": "448339",
  "rough-country-ranger-leveling-50100": "50100",
  "amp-bedstep2-f150": "75412-01A",
  "amp-powerstep-xl-f150": "77152-01A",
  "baja-s2-pro-led-pair": "487801",
  "ford-bronco-tube-doors-4dr": "M-19008-BTD4",
  "maverick-bed-divider": "NZ6Z-99286A72-A",
  "rough-country-bronco-lift-40400": "40400",
  "covercraft-carhartt-seatsaver": "SSC3489CAGY",
  "lift-kit-3in-f-150-rough-country-41431": "41431",
  "fender-flares": "O-F12124",
};
Object.entries(knownParts).forEach(([id, number]) => {
  const item = items.find((entry) => entry.id === id);
  if (!item || item.partNumber !== number) fail(`${id} part number should be ${number}`);
});
const flares = items.find((item) => item.id === "fender-flares");
if (!flares || flares.price !== 795) fail("fender flares stay at the $795 starting price");
if (!/unpainted 4-door kit/.test(flares.sellingPoint) || !/Paint-match is available for extra/.test(flares.sellingPoint)) {
  fail("fender flares must say the start price is the unpainted 4-door kit and paint-match is extra");
}
if (/https?:\/\/|\$\d/.test(flares.sellingPoint)) fail("the fender flare note must not carry a vendor price or URL");
["decked-drawer-system", "leitner-acs-forged", "yakima-overhaul-hd", "spray-in-bedliner", "ceramic-full-tint-suvs-trucks", "ceramic-full-tint-sedans-coupes", "ceramic-windshield", "mud-flaps", "heavy-duty-bed-mat-rubber"].forEach((id) => {
  const item = items.find((entry) => entry.id === id);
  if (!item) fail(`missing ${id}`);
  else if (item.partNumber) fail(`${id} should not have a part number yet`);
});
const roughCountry = items.filter((item) => item.id.startsWith("rc-"));
if (roughCountry.length !== 26) fail(`expected 26 Rough Country items, found ${roughCountry.length}`);
const universalLights = ["rc-50in-led-bar-70950bda", "rc-20in-led-bar-70720bl", "rc-2in-led-pods-70903blkdrla"];
roughCountry.forEach((item) => {
  if (item.listPrice !== true) fail(`${item.id} must be a list-price item`);
  if ("newAddition" in item) fail(`${item.id} must not keep a newAddition flag`);
  if (typeof item.partNumber !== "string" || !item.partNumber.trim()) fail(`${item.id} needs a part number`);
  if (!photosFor(item.id).includes(`images/${item.id}.webp`)) fail(`${item.id} needs its photo`);
  if (/https?:\/\//.test(JSON.stringify(item))) fail(`${item.id} must not carry a source URL`);
});
universalLights.forEach((id) => {
  const item = items.find((entry) => entry.id === id);
  ["All", "F-150", "Super Duty", "Ranger", "Bronco", "Maverick", "SUV", "Car"].forEach((vehicle) => {
    if (!itemMatchesVehicle(item, vehicle)) fail(`${id} must show under ${vehicle}`);
  });
});
if (linePartNumber({}, "448339") !== "448339") fail("a quote line should prefill the catalog part number");
if (linePartNumber({ partTouched: true, partNumber: "FIT-1" }, "448339") !== "FIT-1") fail("an edited part number must persist");
if (linePartNumber({ partTouched: true, partNumber: "" }, "448339") !== "") fail("Clear or a blank override must not invent a part number");
const withPart = quoteTotals([{ price: 1000, qty: 1, partNumber: "448339" }, { price: 1200, qty: 1 }, { price: 1213, qty: 1 }]);
if (withPart.subtotal !== taxed.subtotal || withPart.tax !== taxed.tax || withPart.total !== taxed.total) {
  fail("a part number must not change the quote totals");
}
if (!menuJs.includes("Part #: ") || !menuJs.includes("data-part") || !menuJs.includes('class="part-line"')) {
  fail("the quote and print must show Part #: under the item name");
}
const cardFn = menuJs.slice(menuJs.indexOf("function cardHtml"), menuJs.indexOf("function renderCategory"));
if (cardFn.includes("partNumber") || cardFn.includes("Part #")) fail("menu cards must not show part numbers");
const liner = items.find((item) => item.id === "spray-in-bedliner");
const sprayItems = items.filter((item) => /spray-in bedliner/i.test(item.name));
if (sprayItems.length !== 1 || !liner || liner.price !== 650) fail("spray-in bedliner stays one item at the $650 starting price");
if (!liner.fits.includes("Maverick") || liner.fits.includes("Bronco")) fail("spray-in includes Maverick and still excludes Bronco");
const maverickBed = bedLengthsFor(liner, "Maverick");
if (maverickBed.length !== 1 || maverickBed[0].id !== "4.5" || quoteForBed(liner, maverickBed[0]).price !== 650) {
  fail("a Maverick spray-in is the 4.5 ft bed at $650");
}
const f150Beds = bedLengthsFor(liner, "F-150");
if (f150Beds.map((length) => length.label).join("|") !== "5.5 ft|6.5 ft|8 ft") fail("F-150 beds must be 5.5, 6.5, and 8 ft");
const shortBed = quoteForBed(liner, f150Beds[0]);
const midBed = quoteForBed(liner, f150Beds[1]);
const longBed = quoteForBed(liner, f150Beds[2]);
if (shortBed.price !== 650 || midBed.price !== 650 || !shortBed.name.endsWith("5.5 ft bed")) fail("beds under 8 ft stay $650");
if (longBed.price !== 700 || longBed.name !== "Spray-in bedliner, 8 ft bed") fail("an 8 ft bed uses the $700 spray-in price");
if (shortBed.partNumber || longBed.partNumber) fail("spray-in bed length must not invent a part number");
const oneLength = {
  "rc-bed-mat-rcm671": "5.5 ft",
  "bakflip-mx4": "5.5 ft",
  "rc-trifold-f150-49221550": "5.5 ft",
  "rc-lowprofile-f150-47221550b": "5.5 ft",
  "hard-folding-cover-f-150-6-5-bed-advantage-rev-ford": "6.5 ft",
  "retractable-cover-f-150-5-5-bed-embark-ford": "5.5 ft",
  "powered-retractable-cover-f-150-6-5-bed-leer-ford": "6.5 ft",
  "rc-trifold-sd-49220651": "6.75 ft",
};
Object.entries(oneLength).forEach(([id, label]) => {
  const item = items.find((entry) => entry.id === id);
  const lengths = bedLengthsFor(item, item.fits[0]);
  if (lengths.length !== 1 || lengths[0].label !== label) {
    fail(`${id} fits only ${label}, got ${lengths.map((length) => length.label).join("|")}`);
  }
  const quoted = quoteForBed(item, lengths[0]);
  if (quoted.price !== item.price || quoted.partNumber !== (item.partNumber || "") || !quoted.name.endsWith(`${label} bed`)) {
    fail(`${id} must keep its price and part number and name ${label}`);
  }
});
const soft = items.find((item) => item.id === "soft-roll-up-cover-f-150-5-5-6-5-bed-truxedo-ford");
if (bedLengthsFor(soft, "F-150").map((length) => length.label).join("|") !== "5.5 ft|6.5 ft") {
  fail("the soft roll-up offers only its 5.5 and 6.5 ft beds");
}
const bedStep = items.find((item) => item.id === "amp-bedstep2-f150");
if (bedLengthsFor(bedStep, "F-150").map((length) => length.label).join("|") !== "5.5 ft|6.5 ft") {
  fail("AMP BedStep2 must not offer an 8 ft bed");
}
if (!menuJs.includes("lengths.length > 1")) fail("a product that fits one bed length must not show a picker");
if (bedLengthsFor({ id: "tint", name: "Tint", category: "tint", fits: ["F-150"] }, "F-150").length !== 0) fail("tint is not a bed product");
const maverickDivider = items.find((item) => item.id === "maverick-bed-divider");
if (bedLengthsFor(maverickDivider, "Maverick").length !== 1) fail("Maverick has a single 4.5 ft bed");
if (bedLengthsFor({ id: "sd-cover", name: "Cover", category: "bed-covers", fits: ["Super Duty"] }, "Super Duty").map((length) => length.label).join("|") !== "6.75 ft|8 ft") {
  fail("Super Duty beds must be 6.75 and 8 ft");
}
if (bedLengthsFor({ id: "ranger-cover", name: "Cover", category: "bed-covers", fits: ["Ranger"] }, "Ranger").map((length) => length.label).join("|") !== "5 ft|6 ft") {
  fail("Ranger beds must be 5 and 6 ft");
}
const underTotals = quoteTotals([{ price: shortBed.price, qty: 1 }]);
const longTotals = quoteTotals([{ price: longBed.price, qty: 1 }]);
if (underTotals.tax !== 57.85 || underTotals.total !== 707.85 || money(underTotals.tax) !== "$57.85" || money(underTotals.total) !== "$707.85") {
  fail(`$650 bedliner tax was ${JSON.stringify(underTotals)}`);
}
if (longTotals.tax !== 62.3 || longTotals.total !== 762.3 || money(longTotals.tax) !== "$62.30" || money(longTotals.total) !== "$762.30") {
  fail(`$700 bedliner tax was ${JSON.stringify(longTotals)}`);
}
if (!menuJs.includes('aria-label="Bed length"') || !menuJs.includes("data-bed")) fail("bed products need a compact bed length picker");
if (isBedProduct(liner) !== true) fail("spray-in bedliner is a bed product");
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
const rowEnd = menuJs.indexOf("const noted =", rowStart);
const rowSrc = menuJs.slice(rowStart, rowEnd);
if (!rowSrc.includes("PARTS_ONLY_TAG") || !rowSrc.includes('class="line-note"')) {
  fail("each quote line must show the parts tag under the item name");
}
if (!rowSrc.includes('joined.join(" · ")') || !menuJs.includes("quote-dense") || !menuJs.includes("quote-tail")) {
  fail("print details must share one line, and quotes over 10 items must use the dense table");
}
if (!css.includes(".quote-table.quote-dense") || !css.includes("padding: 5px")) {
  fail("quotes over 10 items must print with 5px row padding");
}
if (!css.includes(".quote-table { font-size: 10pt;") || !css.includes(".quote-table.quote-dense { font-size: 9pt; }")) {
  fail("print quotes stay at 10pt through 10 items and drop to 9pt after that");
}
if (!css.includes(".quote-table .line-price { font-size: inherit; }") || !css.includes("appearance: none") || !css.includes(".quote-totals p.quote-grand { font-size: 12pt;")) {
  fail("printed prices must match the table size, with only the grand total larger, and price inputs must print as plain text");
}
if (!css.includes("white-space: nowrap")) fail("list prices and the parts tag must stay on one line");
if (!rowSrc.includes('aria-label="Remove"') || !rowSrc.includes('aria-hidden="true">×')) {
  fail("the quote remove control must be a labeled × button, not clipped Remove text");
}
const actionCell = rowSrc.slice(rowSrc.lastIndexOf('class="no-print line-actions"'));
if (actionCell.includes("PARTS_ONLY_TAG")) fail("the parts tag must stay on the printed item, not in the remove cell");
const lineFn = menuJs.slice(menuJs.indexOf("function linePriceHtml"), menuJs.indexOf("function tierBadge"));
if (!lineFn.includes("partsTag()") || !lineFn.includes("isListPrice(line)")) {
  fail("quote lines for list prices must render the parts tag");
}
if (!menuJs.includes("PARTS_ONLY_NOTE") || !menuJs.includes('class="quote-totals"')) {
  fail("a parts-only quote needs the note under the totals");
}
const totalsBlock = menuJs.slice(menuJs.indexOf('class="quote-totals"'), menuJs.indexOf('class="print-foot"'));
if (!totalsBlock.includes("${notes}")) fail("the parts note must sit under the totals and print with them");
if (/"newAddition"\s*:/.test(rawCatalog)) fail("newAddition flags must be removed from the catalog");
const listPriced = items.filter((item) => item.listPrice === true);
if (listPriced.length !== 38) fail(`expected 38 list-price items, found ${listPriced.length}`);
const withPhotos = items.filter((item) => photosFor(item.id).length);
if (withPhotos.length !== 71) fail(`expected 71 of 77 items with photos, found ${withPhotos.length}`);
const photoComing = ["mud-flaps", "ford-5th-wheel-prep-package", "heavy-duty-bed-mat-rubber", "ceramic-full-tint-suvs-trucks", "ceramic-full-tint-sedans-coupes", "ceramic-windshield"];
const credits = readFileSync(join(root, "images/CREDITS.md"), "utf8");
photoComing.forEach((id) => {
  if (photosFor(id).length) fail(`${id} must show Photo coming until a matching photo is added`);
  if (existsSync(join(root, "images", `${id}.webp`))) fail(`${id} photo file must be deleted`);
  if (credits.includes(id)) fail(`${id} credit must be removed`);
});
const mud = items.find((item) => item.id === "mud-flaps");
if (!mud || mud.brand !== "WeatherTech" || mud.partNumber) fail("Bronco mud flaps are WeatherTech and have no guessed part number");
const rubberMat = items.find((item) => item.id === "heavy-duty-bed-mat-rubber");
if (!rubberMat || rubberMat.name !== "Rubber Bed Mat" || rubberMat.brand || rubberMat.price !== 169) {
  fail("the plain rubber bed mat keeps the $169 price and drops the BedRug brand");
}
["yakima-overhaul-hd"].forEach((id) => {
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
["All", "F-150", "Super Duty", "Ranger", "Bronco", "Maverick", "SUV", "Car"].forEach((vehicle) => {
  if (!itemMatchesVehicle(baja, vehicle)) fail(`Baja S2 pods must show under ${vehicle}`);
});
items.forEach((item) => {
  const coversNamed = ["F-150", "Super Duty", "Ranger", "Bronco", "Maverick"].every((name) => (item.fits || []).includes(name));
  const namesABody = (item.fits || []).some((fit) => fit === "SUV" || fit === "Car" || fit === "Other");
  if (coversNamed && !namesABody) {
    if (!itemMatchesVehicle(item, "SUV") || !itemMatchesVehicle(item, "Car")) {
      fail(`${item.id} fits every named truck and must show under SUV and Car`);
    }
  }
});
if (itemMatchesVehicle({ fits: ["Ranger"] }, "SUV") || itemMatchesVehicle({ fits: ["Ranger"] }, "Car")) {
  fail("a Ranger-only item must stay hidden under SUV and Car");
}
if (!itemMatchesVehicle({ universal: true, fits: ["F-150"] }, "SUV") || !itemMatchesVehicle({ universal: true, fits: ["F-150"] }, "Car")) {
  fail("an item marked universal must show under SUV and Car");
}
if (!itemMatchesVehicle({ fits: ["Other"] }, "SUV") || !itemMatchesVehicle({ fits: ["Other"] }, "Car")) {
  fail("a legacy Other fit must show under both SUV and Car");
}
if (!itemMatchesVehicle({ fits: ["universal"] }, "Bronco")) fail("a fits value of universal must show under every vehicle");
if (html.includes(">Other<") || menuJs.includes('"Other"')) fail("the vehicle filter must offer SUV and Car instead of Other");
if (!menuJs.includes("itemMatchesVehicle")) fail("the menu filter must use the shared vehicle match");
if (menuJs.includes("New additions") || menuJs.includes("tag-new") || menuJs.includes("newBadge")) {
  fail("the New additions row and badges must not render");
}
const fifth = items.find((item) => item.id === "ford-5th-wheel-prep-package");
if (!fifth || fifth.name !== "Ford 5th Wheel Prep Package" || fifth.brand !== "Ford" || fifth.price !== 2250 || fifth.category !== "towing-5th-wheel") {
  fail("Ford 5th Wheel Prep Package must be a $2,250 installed towing item");
}
if (!fifth.fits || fifth.fits.join("|") !== "Super Duty" || fifth.partNumber) fail("the 5th-wheel prep fits Super Duty and has no made-up part number");
if (/https?:\/\//.test(JSON.stringify(fifth))) fail("the 5th-wheel prep must not carry a source URL");
if (/priceSource|photoSourceUrl/.test(rawCatalog)) fail("public catalog must not carry source fields");
if (/https?:\/\//.test(rawCatalog)) fail("public catalog must not carry source URLs");
const bannedKey = /(^|[^a-z])(source|cost|gross|vendor|labor|notes|times_sold|rmac|keystone)([^a-z]|$)|priceSource|photoSourceUrl/i;
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

const versionIn = (file) => {
  const match = String(file).match(/\.([A-Za-z0-9._-]{4,40})\.(?:js|css|json|webmanifest)$/);
  return match ? match[1] : "";
};
const linked = [];
function resolveRef(fromFile, ref) {
  const clean = ref.split("?")[0].split("#")[0];
  if (!clean.startsWith("./")) return clean;
  const dir = fromFile.includes("/") ? fromFile.slice(0, fromFile.lastIndexOf("/") + 1) : "";
  return dir + clean.slice(2);
}
function walkServed(file) {
  if (linked.some((entry) => entry.file === file)) return;
  const full = join(root, file);
  if (!existsSync(full)) {
    fail(`referenced file is missing: ${file}`);
    return;
  }
  const text = readFileSync(full, "utf8");
  linked.push({ file, text });
  if (text.includes("ASSET_VERSION") || text.includes("?v=")) fail(`${file} still uses an unversioned cache query`);
  const refs = new Set();
  for (const match of text.matchAll(/(?:href|src)=["']([^"']+)["']/g)) refs.add(match[1]);
  for (const match of text.matchAll(/from\s+["'](\.\/[^"']+)["']/g)) refs.add(match[1]);
  for (const match of text.matchAll(/fetch\(\s*["']([^"']+)["']/g)) refs.add(match[1]);
  refs.forEach((ref) => {
    const next = resolveRef(file, ref);
    if (!/\.(?:js|css|json|webmanifest)$/.test(next)) return;
    if (!versionIn(next)) fail(`${file} references unversioned ${next}`);
    walkServed(next);
  });
}
walkServed("index.html");
const servedVersions = new Set(linked.map((entry) => versionIn(entry.file)).filter(Boolean));
if (servedVersions.size !== 1) fail(`asset versions must all match, found ${[...servedVersions].join(", ") || "none"}`);
const assetVersion = [...servedVersions][0];
if (!linked.some((entry) => entry.file === `js/quote-math.${assetVersion}.js`)) {
  fail("quote-math.js must be published under the same versioned filename");
}
if (!linked.some((entry) => entry.file === `catalog.${assetVersion}.json`)) {
  fail("catalog.json must be published under the same versioned filename");
}
const blueprint = readFileSync(join(root, "..", "render.yaml"), "utf8");
["/js/*", "/css/*", "/catalog.json"].forEach((path) => {
  const rule = new RegExp(`path:\\s*${path.replaceAll("*", "\\*").replaceAll(".", "\\.")}[\\s\\S]{0,80}value:\\s*no-cache`);
  if (!rule.test(blueprint)) fail(`render.yaml must set Cache-Control no-cache for ${path}`);
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
