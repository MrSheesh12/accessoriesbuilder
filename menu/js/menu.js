/* Corwin Ford Tri-Cities — iPad accessory menu.
   Item names and prices come from catalog.json. Photos are mapped locally. */

import { bulletsFor, tierSwitch } from "./copy.js?v=559be4a";
import { PARTS_ONLY_NOTE, PARTS_ONLY_TAG, hasPrice, money, priceLabel } from "./price-label.js?v=559be4a";
import { bedLengthsFor, commitLinePrice, customItemError, laborLine, linePartNumber, normalizeQuote, parseDollars, quoteForBed, quoteNotes, quoteTotals, resetLinePrice } from "./quote-math.js?v=559be4a";
import { photosFor } from "./photos.js?v=559be4a";
import { itemMatchesVehicle } from "./vehicle-filter.js?v=559be4a";

const PRICE_KEY = "accessory-menu-show-prices";
const FILTER_KEY = "accessory-menu-vehicle";
const QUOTE_KEY = "accessory-menu-quote";
const VEHICLES = ["All", "F-150", "Super Duty", "Ranger", "Maverick", "Bronco", "Other"];
const TIERS = ["good", "better", "best"];
const TIER_LABEL = { good: "Good", better: "Better", best: "Best" };

const ACCENTS = {
  "floor-mats": "#2c5c5a",
  "bed-covers": "#3d5470",
  "lift-level-kits": "#2f5a45",
  "bumper-grille": "#4d5a68",
  lighting: "#8a6230",
  bedliners: "#6b5344",
  "running-boards-steps": "#8a4b2f",
  "towing-5th-wheel": "#3e4d63",
  "wheels-tires": "#3a3f46",
  performance: "#6a3a3a",
  tint: "#31456b",
  "commercial-fleet": "#3f5348",
  interior: "#5a4638",
  audio: "#3d3a55",
  "ppf-coating": "#4a5560",
};

const ICONS = {
  "floor-mats": '<rect x="5" y="6" width="14" height="12" rx="2"/><path d="M8 9h8M8 12h8M8 15h5"/>',
  "bed-covers": '<path d="M4 16h16v3H4zM6 16V9h12v7"/><path d="M8 9V7h8v2"/>',
  "lift-level-kits": '<path d="M12 19V5"/><path d="M7 9l5-5 5 5"/><path d="M6 19h12"/>',
  "bumper-grille": '<path d="M4 15c4-6 12-6 16 0"/><path d="M7 15v2M17 15v2"/>',
  lighting: '<path d="M9 18h6"/><path d="M12 18v-3"/><path d="M8 10a4 4 0 1 1 8 0c0 2-2 3-2 5H10c0-2-2-3-2-5z"/>',
  bedliners: '<path d="M4 15h16v3H4z"/><path d="M6 15l2-6h8l2 6"/>',
  "running-boards-steps": '<path d="M4 18h16"/><path d="M6 18v-4h5v-4h5V6"/>',
  "towing-5th-wheel": '<circle cx="8" cy="16" r="2"/><circle cx="16" cy="16" r="2"/><path d="M4 14h4l2-5h8l2 5h0"/><path d="M12 9V6"/>',
  "wheels-tires": '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 5v3M12 16v3M5 12h3M16 12h3"/>',
  performance: '<path d="M5 15h14"/><path d="M7 15l3-7h4l3 7"/><path d="M12 8V5"/>',
  tint: '<rect x="5" y="6" width="14" height="12" rx="1"/><path d="M5 10h14"/>',
  "commercial-fleet": '<path d="M3 16h18"/><path d="M5 16V9h9v7"/><path d="M14 12h5l2 4"/>',
  interior: '<rect x="5" y="7" width="14" height="10" rx="2"/><path d="M8 11h8"/>',
  audio: '<path d="M8 16V8l8-2v10"/><circle cx="8" cy="16" r="2"/><circle cx="16" cy="14" r="2"/>',
  "ppf-coating": '<path d="M6 16l6-10 6 10"/><path d="M8 16h8"/>',
};

const state = {
  catalog: null,
  showPrices: localStorage.getItem(PRICE_KEY) !== "0",
  vehicleFilter: VEHICLES.includes(localStorage.getItem(FILTER_KEY)) ? localStorage.getItem(FILTER_KEY) : "All",
  quote: loadQuote(),
  bedLength: {},
  trayOpen: false,
  slideByItem: {},
  lightbox: null,
};

const view = document.getElementById("view");
const tray = document.getElementById("tray");
const live = document.getElementById("live");

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function items() {
  return (state.catalog.items || []).filter((item) => item.review !== true);
}

function itemMatchesFilter(item) {
  return itemMatchesVehicle(item, state.vehicleFilter);
}

function visibleItems() {
  return items().filter(itemMatchesFilter);
}

function categoryById(id) {
  return (state.catalog.categories || []).find((category) => category.id === id);
}

function itemById(id) {
  return items().find((item) => item.id === id);
}

function itemsIn(categoryId) {
  return visibleItems().filter((item) => item.category === categoryId);
}

function homeCategories() {
  return (state.catalog.categories || []).filter((category) => itemsIn(category.id).length > 0);
}

function accentFor(categoryId) {
  return ACCENTS[categoryId] || "#3d5470";
}

function iconSvg(id) {
  const body = ICONS[id] || ICONS.lighting;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

function placeholderBlock(accent, iconId) {
  return `<div class="ph" style="--accent:${esc(accent)}">${iconSvg(iconId)}<span class="ph-kicker">Photo coming</span></div>`;
}

function photoTag(src, alt) {
  return `<img src="${esc(src)}" alt="${esc(alt)}" width="800" height="500" loading="lazy" decoding="async">`;
}

function slidesFor(item) {
  const images = photosFor(item.id);
  if (images.length >= 2) {
    return images.map((src, index) => ({ kind: "img", src, label: `${item.name} photo ${index + 1}` }));
  }
  if (images.length === 1) return [{ kind: "img", src: images[0], label: item.name }];
  return [{ kind: "ph", label: "Photo coming" }];
}

function partsTag() {
  return `<span class="tag tag-parts">${esc(PARTS_ONLY_TAG)}</span>`;
}

function priceHtml(item) {
  const label = priceLabel(item.price, { listPrice: item.listPrice === true });
  const tag = item.listPrice ? partsTag() : "";
  return `<p class="price-line"><span class="price">${esc(label)}</span>${tag}</p>`;
}

function catalogItemForLine(line) {
  if (!state.catalog || !line || line.custom) return null;
  return itemById(String(line.id || "").split("--")[0]);
}

function isListPrice(line) {
  if (line && line.listPrice) return true;
  const item = catalogItemForLine(line);
  return Boolean(item && item.listPrice);
}

function partLineHtml(line) {
  if (line.labor) return `<span class="part-fixed">Part #: —</span>`;
  const value = String(line.partNumber || "");
  return `<label class="part-edit no-print">Part #<input class="part-input" type="text" data-part="${esc(line.id)}" value="${esc(value)}" autocomplete="off" aria-label="Part number for ${esc(line.name)}"></label>`;
}

function metaBits(line, titled) {
  const bits = [];
  if (titled.size) bits.push(titled.size);
  if (line.description) bits.push(line.description);
  if (line.partNumber) bits.push(`Part #: ${line.partNumber}`);
  if (line.labor) bits.push("Labor");
  else if (line.custom) bits.push("Custom");
  else if (TIER_LABEL[line.tier]) bits.push(TIER_LABEL[line.tier]);
  if (isListPrice(line)) bits.push(PARTS_ONLY_TAG);
  if (line.taxable === false) bits.push("Not taxed");
  return bits;
}

function listWasHtml(line) {
  if (!line.priceTouched || !hasPrice(line.basePrice)) return "";
  return `<span class="list-was no-print">List ${esc(money(line.basePrice))}</span><button class="reset-price no-print" type="button" data-reset-price="${esc(line.id)}" aria-label="Reset price">↺</button>`;
}

function priceEditorHtml(line) {
  const shown = hasPrice(line.price) ? String(line.price) : "";
  const printed = hasPrice(line.price) ? money(line.price) : "Call for price";
  return `<input class="line-price no-print" type="text" inputmode="decimal" autocomplete="off" data-price="${esc(line.id)}" value="${esc(shown)}" aria-label="Price for ${esc(line.name)}"><span class="print-only price">${esc(printed)}</span><span class="price-extra no-print">${listWasHtml(line)}</span>`;
}

function quoteTitle(name) {
  const match = String(name || "").match(/^(.*), (\d+(?:\.\d+)? ft) bed$/);
  if (!match) return { title: name, size: "" };
  return { title: match[1], size: `${match[2]} bed` };
}

function linePriceText(line) {
  if (!hasPrice(line.price)) return "Call for price";
  if (isListPrice(line)) return `List price ${money(line.price)}`;
  return money(line.price);
}

function linePriceHtml(line) {
  const tag = isListPrice(line) ? partsTag() : "";
  const untaxed = line && line.taxable === false ? `<span class="tag tag-custom">Not taxed</span>` : "";
  return `<span class="price">${esc(linePriceText(line))}</span>${tag}${untaxed}`;
}

function tierBadge(tier) {
  if (!TIER_LABEL[tier]) return "";
  return `<span class="tag">${esc(TIER_LABEL[tier])}</span>`;
}

function tierSwitchHtml(item) {
  const segments = tierSwitch(item, visibleItems().some((entry) => entry.id === item.id) ? visibleItems() : visibleItems().concat(item));
  if (!segments.length) return "";
  const html = segments.map((segment) => {
    const priceText = hasPrice(segment.price) ? money(segment.price) : "Ask for price";
    const inner = `<span class="seg-label">${esc(segment.label)}</span><span class="price">${esc(priceText)}</span>`;
    if (segment.current) return `<span class="seg is-current" aria-current="true">${inner}</span>`;
    return `<a class="seg" href="#/p/${esc(segment.id)}">${inner}</a>`;
  }).join("");
  return `<div class="tier-switch" role="group" aria-label="Good, better, best">${html}</div>`;
}

function parseRoute() {
  const raw = (location.hash || "#/").replace(/^#/, "");
  const parts = raw.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts.length === 0) return { name: "home" };
  if (parts[0] === "c" && parts[1]) return { name: "category", id: parts[1] };
  if (parts[0] === "p" && parts[1]) return { name: "product", id: parts[1] };
  if (parts[0] === "quote") return { name: "quote" };
  return { name: "missing" };
}

function render() {
  if (!state.catalog) return;
  const route = parseRoute();
  document.body.classList.toggle("is-home", route.name === "home");
  closeLightbox();
  if (route.name === "home") renderHome();
  else if (route.name === "category") renderCategory(route.id);
  else if (route.name === "product") renderProduct(route.id);
  else if (route.name === "quote") renderQuote();
  else {
    view.innerHTML = `<div class="message"><h1>That page is not on the menu.</h1><p><a href="#/">Back to categories</a></p></div>`;
  }
}

function renderHome() {
  const tiles = homeCategories().map((category) => {
    const count = itemsIn(category.id).length;
    const noun = count === 1 ? "accessory" : "accessories";
    const photo = itemsIn(category.id).map((item) => photosFor(item.id)[0]).find(Boolean);
    const media = photo
      ? photoTag(photo, "")
      : `<div class="ph" style="--accent:${esc(accentFor(category.id))}">${iconSvg(category.id)}<span class="ph-kicker">Photo coming</span></div>`;
    return `<a class="tile" href="#/c/${esc(category.id)}">
      <div class="tile-media">${media}</div>
      <div class="tile-foot">
        <h2 class="tile-name">${esc(category.name)}</h2>
        <p class="tile-count">${count} ${noun}</p>
      </div>
    </a>`;
  }).join("");
  view.innerHTML = `<div class="view-home"><div class="home-grid">${tiles}</div></div>`;
}

function cardHtml(item, category) {
  const photo = photosFor(item.id)[0];
  const media = photo
    ? photoTag(photo, item.name)
    : placeholderBlock(accentFor(category.id), category.id);
  const brand = item.brand ? `<p class="brand">${esc(item.brand)}</p>` : "";
  return `<article class="card">
    <a class="card-link" href="#/p/${esc(item.id)}">
      <div class="media">${media}</div>
      <div class="card-body">
        ${tierBadge(item.tier)}
        <h2>${esc(item.name)}</h2>
        ${brand}
        <p class="benefit">${esc(item.sellingPoint)}</p>
        ${priceHtml(item)}
      </div>
    </a>
    <button class="add-btn" type="button" data-add="${esc(item.id)}" aria-label="Add ${esc(item.name)} to Build my truck">+</button>
  </article>`;
}

function renderCategory(id) {
  const category = categoryById(id);
  const list = itemsIn(id);
  if (!category || !list.length) {
    const why = state.vehicleFilter === "All" ? "Nothing in that category." : `Nothing in that category for ${state.vehicleFilter}.`;
    view.innerHTML = `<div class="message"><h1>${esc(why)}</h1><button class="back" type="button" data-back="#/">Back</button></div>`;
    return;
  }
  const tiered = TIERS
    .map((tier) => ({ tier, items: list.filter((item) => item.tier === tier) }))
    .filter((group) => group.items.length);
  const rest = list.filter((item) => !TIERS.includes(item.tier));
  const sections = [];
  if (tiered.length) {
    tiered.forEach((group) => {
      sections.push(`<section class="tier-group">
        <h2 class="tier-heading">${esc(TIER_LABEL[group.tier])}</h2>
        <div class="cards">${group.items.map((item) => cardHtml(item, category)).join("")}</div>
      </section>`);
    });
  }
  if (rest.length) {
    sections.push(`<section class="tier-group"><div class="cards">${rest.map((item) => cardHtml(item, category)).join("")}</div></section>`);
  }
  if (!tiered.length && rest.length === list.length && sections.length === 1) {
    /* untitled list is the whole category */
  }
  view.innerHTML = `<section>
    <div class="page-head">
      <button class="back" type="button" data-back="#/">Back</button>
      <div>
        <h1>${esc(category.name)}</h1>
        <p>Tap a card for photos and fitment. + adds it to the truck.</p>
      </div>
    </div>
    ${sections.join("")}
  </section>`;
}

function renderProduct(id) {
  const item = itemById(id);
  if (!item) {
    view.innerHTML = `<div class="message"><h1>That accessory is not on the menu.</h1><button class="back" type="button" data-back="#/">Back</button></div>`;
    return;
  }
  const category = categoryById(item.category);
  const accent = accentFor(item.category);
  const slides = slidesFor(item);
  const single = slides.length < 2;
  const index = 0;
  state.slideByItem[item.id] = 0;
  const slideHtml = slides.map((slide, slideIndex) => {
    const hidden = slideIndex === index ? "" : " hidden";
    if (slide.kind === "img") return `<div class="slide" data-slide="${slideIndex}"${hidden}>${photoTag(slide.src, slide.label)}</div>`;
    return `<div class="slide" data-slide="${slideIndex}"${hidden}>${placeholderBlock(accent, item.category)}</div>`;
  }).join("");
  const dots = single ? "" : slides.map((slide, slideIndex) => {
    const current = slideIndex === index ? ' aria-current="true"' : "";
    return `<button class="dot" type="button" data-goto="${slideIndex}" aria-label="Photo ${slideIndex + 1}"${current}><span></span></button>`;
  }).join("");
  const controls = single ? "" : `<button class="g-nav g-prev" type="button" data-nudge="-1" aria-label="Previous photo">‹</button>
      <button class="g-nav g-next" type="button" data-nudge="1" aria-label="Next photo">›</button>
      <div class="dots">${dots}</div>
      <p class="slide-count" id="slide-count">${index + 1} of ${slides.length}. Tap the photo to view full screen.</p>`;
  const brand = item.brand ? `<p class="brand">${esc(item.brand)}</p>` : "";
  const lengths = bedLengthsFor(item, state.vehicleFilter);
  const chosen = selectedLength(item);
  const quoted = chosen ? quoteForBed(item, chosen) : null;
  const priced = quoted ? { ...item, price: quoted.price } : item;
  const bedSwitch = lengths.length > 1 ? `<div class="bed-lengths" role="group" aria-label="Bed length">${lengths.map((length) => {
    const on = chosen && length.id === chosen.id;
    return `<button type="button" data-bed="${esc(length.id)}" class="${on ? "is-current" : ""}" aria-pressed="${on ? "true" : "false"}">${esc(length.label)}</button>`;
  }).join("")}</div>` : "";
  view.innerHTML = `<article class="product" data-product="${esc(item.id)}">
    <div class="gallery${single ? " is-single" : ""}">
      <div class="gallery-stage" id="gallery-stage">${slideHtml}</div>
      ${controls}
    </div>
    <div class="details">
      <div class="page-head">
        <button class="back" type="button" data-back="#/c/${esc(item.category)}">Back</button>
        <div><p>${esc(category ? category.name : "")}</p></div>
      </div>
      <h1>${esc(item.name)}</h1>
      ${tierBadge(item.tier)}
      ${brand}
      ${priceHtml(priced)}
      <ul class="bullets">${bulletsFor(item, { showPrices: state.showPrices }).map((bullet) => `<li>${esc(bullet)}</li>`).join("")}</ul>
      ${bedSwitch}
      ${tierSwitchHtml(item)}
      <button class="add-wide" type="button" data-add="${esc(item.id)}">Add to my truck</button>
    </div>
  </article>`;
  const stage = document.getElementById("gallery-stage");
  if (!single && slides[0].kind === "img") {
    mountSwipe(stage, {
      onLeft: () => nudgeSlide(1),
      onRight: () => nudgeSlide(-1),
      onTap: () => openLightbox(item.id, state.slideByItem[item.id] || 0),
    });
  } else if (single && slides[0].kind === "img") {
    stage.addEventListener("click", (event) => {
      if (event.target.closest("button, a")) return;
      openLightbox(item.id, 0);
    });
  }
}

function nudgeSlide(delta) {
  const root = view.querySelector("[data-product]");
  if (!root) return;
  const item = itemById(root.dataset.product);
  const slides = slidesFor(item);
  if (slides.length < 2) return;
  const next = ((state.slideByItem[item.id] || 0) + delta + slides.length) % slides.length;
  state.slideByItem[item.id] = next;
  root.querySelectorAll(".slide").forEach((slide) => {
    slide.hidden = Number(slide.dataset.slide) !== next;
  });
  root.querySelectorAll(".dot").forEach((dot) => {
    if (Number(dot.dataset.goto) === next) dot.setAttribute("aria-current", "true");
    else dot.removeAttribute("aria-current");
  });
  const count = document.getElementById("slide-count");
  if (count) count.textContent = `${next + 1} of ${slides.length}. Tap the photo to view full screen.`;
}

function mountSwipe(el, handlers) {
  if (!el) return;
  let startX = 0;
  let startY = 0;
  let tracking = false;
  let lastFire = 0;
  const fire = (direction) => {
    const now = Date.now();
    if (now - lastFire < 350) return;
    lastFire = now;
    if (direction === "left") handlers.onLeft();
    else if (direction === "right") handlers.onRight();
    else handlers.onTap?.();
  };
  const finish = (x, y) => {
    if (!tracking) return;
    tracking = false;
    const dx = x - startX;
    const dy = y - startY;
    if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy)) fire(dx < 0 ? "left" : "right");
    else if (Math.abs(dx) < 12 && Math.abs(dy) < 12) fire("tap");
  };
  el.addEventListener("touchstart", (event) => {
    if (event.target.closest("button, a")) return;
    const touch = event.changedTouches[0];
    tracking = true;
    startX = touch.clientX;
    startY = touch.clientY;
  }, { passive: true });
  el.addEventListener("touchend", (event) => {
    const touch = event.changedTouches[0];
    finish(touch.clientX, touch.clientY);
  });
  el.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch") return;
    if (event.target.closest("button, a")) return;
    tracking = true;
    startX = event.clientX;
    startY = event.clientY;
  });
  el.addEventListener("pointerup", (event) => {
    if (event.pointerType === "touch") return;
    finish(event.clientX, event.clientY);
  });
  el.addEventListener("click", (event) => {
    if (event.target.closest("button, a")) return;
    if (Date.now() - lastFire < 400) return;
    lastFire = Date.now();
    handlers.onTap?.();
  });
}

function openLightbox(itemId, index) {
  const item = itemById(itemId);
  if (!item) return;
  state.lightbox = { itemId, index: index || 0, slides: slidesFor(item) };
  paintLightbox();
}

function paintLightbox() {
  const box = document.getElementById("lightbox");
  if (!state.lightbox) {
    box.hidden = true;
    document.body.classList.remove("lb-open");
    return;
  }
  const { slides, index, itemId } = state.lightbox;
  const item = itemById(itemId);
  const accent = accentFor(item.category);
  const stage = document.getElementById("lb-stage");
  stage.innerHTML = slides.map((slide, slideIndex) => {
    const hidden = slideIndex === index ? "" : " hidden";
    if (slide.kind === "img") {
      return `<div class="lb-slide" data-slide="${slideIndex}"${hidden}><img src="${esc(slide.src)}" alt="${esc(slide.label)}" width="800" height="500"></div>`;
    }
    return `<div class="lb-slide" data-slide="${slideIndex}"${hidden}>${placeholderBlock(accent, item.category)}</div>`;
  }).join("");
  document.getElementById("lb-count").textContent = `${index + 1} of ${slides.length}`;
  box.hidden = false;
  document.body.classList.add("lb-open");
  if (!stage.dataset.swipe) {
    stage.dataset.swipe = "1";
    mountSwipe(stage, {
      onLeft: () => nudgeLightbox(1),
      onRight: () => nudgeLightbox(-1),
    });
  }
}

function nudgeLightbox(delta) {
  if (!state.lightbox) return;
  const count = state.lightbox.slides.length;
  state.lightbox.index = (state.lightbox.index + delta + count) % count;
  paintLightbox();
}

function closeLightbox() {
  if (!state.lightbox) return;
  state.lightbox = null;
  const box = document.getElementById("lightbox");
  box.hidden = true;
  document.body.classList.remove("lb-open");
}

function loadQuote() {
  try {
    return normalizeQuote(JSON.parse(localStorage.getItem(QUOTE_KEY) || "null"));
  } catch (error) {
    return normalizeQuote(null);
  }
}

function quoteNumber() {
  if (!state.quote.number) {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    state.quote.number = `Q-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    saveQuote();
  }
  return state.quote.number;
}

function suggestedVehicle() {
  return state.vehicleFilter === "All" ? "" : state.vehicleFilter;
}

function vehicleText() {
  if (state.quote.vehicleTouched) return state.quote.vehicle;
  return state.quote.vehicle || suggestedVehicle();
}

function saveQuote() {
  localStorage.setItem(QUOTE_KEY, JSON.stringify(state.quote));
}

function selectedLength(item) {
  const lengths = bedLengthsFor(item, state.vehicleFilter);
  if (!lengths.length) return null;
  return lengths.find((length) => length.id === state.bedLength[item.id]) || lengths[0];
}

function addToTray(itemId) {
  const item = itemById(itemId);
  if (!item) return;
  const length = selectedLength(item);
  const quoted = quoteForBed(item, length);
  const lineId = length ? `${item.id}--bed-${length.id}` : item.id;
  const existing = state.quote.lines.find((line) => line.id === lineId);
  if (existing) {
    existing.qty += 1;
    if (item.listPrice) existing.listPrice = true;
  } else {
    state.quote.lines.push({
      id: lineId,
      name: quoted.name,
      description: "",
      tier: item.tier || "",
      price: hasPrice(quoted.price) ? Number(quoted.price) : null,
      basePrice: hasPrice(quoted.price) ? Number(quoted.price) : null,
      qty: 1,
      listPrice: item.listPrice === true,
      custom: false,
      labor: false,
      taxable: true,
      priceTouched: false,
      partNumber: linePartNumber({}, item.partNumber || ""),
      partTouched: false,
    });
  }
  quoteNumber();
  saveQuote();
  renderTray();
  const handle = document.getElementById("tray-handle");
  handle.classList.remove("pulse");
  void handle.offsetWidth;
  handle.classList.add("pulse");
  live.textContent = `Added ${item.name}.`;
  if (parseRoute().name === "quote") renderQuote();
}

function renderTray() {
  const list = document.getElementById("tray-list");
  const empty = document.getElementById("tray-empty");
  const totals = quoteTotals(state.quote.lines);
  const count = state.quote.lines.reduce((sum, line) => sum + line.qty, 0);
  document.getElementById("tray-count").textContent = String(count);
  document.getElementById("tray-total").textContent = money(totals.subtotal);
  document.getElementById("tray-handle-total").textContent = money(totals.subtotal);
  list.innerHTML = state.quote.lines.map((line) => {
    const tier = line.custom
      ? `<span class="tag tag-custom">Custom</span>`
      : (TIER_LABEL[line.tier] ? `<span class="tray-tier">${esc(TIER_LABEL[line.tier])}</span>` : "");
    return `<li>
      <span class="tray-name">${esc(line.name)}${tier}${line.qty > 1 ? ` × ${line.qty}` : ""}</span>
      <span class="tray-price">${linePriceHtml(line)}</span>
      <button class="remove-btn" type="button" data-remove="${esc(line.id)}">Remove</button>
    </li>`;
  }).join("");
  empty.hidden = state.quote.lines.length > 0;
}

function openTray() {
  state.trayOpen = true;
  tray.classList.add("is-open");
  document.getElementById("tray-handle").setAttribute("aria-expanded", "true");
  document.getElementById("tray-panel").hidden = false;
  document.querySelector(".scrim").hidden = false;
}

function closeTray() {
  state.trayOpen = false;
  tray.classList.remove("is-open");
  document.getElementById("tray-handle").setAttribute("aria-expanded", "false");
  document.querySelector(".scrim").hidden = true;
  window.setTimeout(() => {
    if (!state.trayOpen) document.getElementById("tray-panel").hidden = true;
  }, 280);
}

function clearQuote() {
  state.quote = normalizeQuote(null);
  saveQuote();
  renderTray();
  live.textContent = "Quote cleared.";
  if (parseRoute().name === "quote") renderQuote();
}

function customLineId() {
  return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function addLabor() {
  const line = laborLine({});
  state.quote.lines.push(line);
  quoteNumber();
  saveQuote();
  renderTray();
  renderQuote();
  const field = view.querySelector(`[data-price="${line.id}"]`);
  if (field) field.focus();
  live.textContent = "Labor added.";
}

function bindResets(root) {
  root.querySelectorAll("[data-reset-price]").forEach((button) => {
    if (button.dataset.bound) return;
    button.dataset.bound = "1";
    button.addEventListener("click", () => {
      const line = state.quote.lines.find((entry) => entry.id === button.dataset.resetPrice);
      if (!line) return;
      Object.assign(line, resetLinePrice(line));
      saveQuote();
      renderTray();
      renderQuote();
    });
  });
}

function paintQuoteMoney() {
  const totalsNow = quoteTotals(state.quote.lines);
  view.querySelectorAll(".quote-totals .price").forEach((node, index) => {
    const values = [money(totalsNow.subtotal), money(totalsNow.tax), money(totalsNow.total)];
    if (values[index]) node.textContent = values[index];
  });
  renderTray();
}

function setPartsMode(form, partsOnly) {
  form.dataset.parts = partsOnly ? "1" : "0";
  form.querySelectorAll("[data-parts]").forEach((button) => {
    const on = button.dataset.parts === form.dataset.parts;
    button.classList.toggle("is-current", on);
    button.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function openCustomForm(line) {
  const form = document.getElementById("custom-form");
  form.hidden = false;
  form.dataset.editId = line?.id || "";
  document.getElementById("custom-name").value = line?.name || "";
  document.getElementById("custom-desc").value = line?.description || "";
  document.getElementById("custom-price").value = line ? String(line.price) : "";
  document.getElementById("custom-qty").value = line ? String(line.qty) : "1";
  document.getElementById("custom-taxable").checked = line ? line.taxable !== false : true;
  document.getElementById("custom-part").value = line?.partNumber || "";
  setPartsMode(form, Boolean(line && isListPrice(line)));
  document.getElementById("custom-error").textContent = "";
  document.getElementById("custom-save").textContent = line ? "Save item" : "Add to quote";
  form.scrollIntoView({ block: "nearest" });
  document.getElementById("custom-name").focus();
}

function saveCustomItem() {
  const form = document.getElementById("custom-form");
  const draft = {
    name: document.getElementById("custom-name").value,
    description: document.getElementById("custom-desc").value.trim(),
    price: document.getElementById("custom-price").value,
    qty: Math.max(1, Math.round(Number(document.getElementById("custom-qty").value) || 1)),
    listPrice: form.dataset.parts === "1",
    taxable: document.getElementById("custom-taxable").checked,
    partNumber: document.getElementById("custom-part").value.trim(),
  };
  const error = customItemError(draft);
  document.getElementById("custom-error").textContent = error;
  if (error) return;
  const price = parseDollars(draft.price);
  const editId = form.dataset.editId;
  const existing = editId ? state.quote.lines.find((line) => line.id === editId) : null;
  if (existing) {
    existing.name = draft.name.trim();
    existing.description = draft.description;
    existing.price = price;
    existing.basePrice = price;
    existing.priceTouched = false;
    existing.qty = draft.qty;
    existing.listPrice = draft.listPrice;
    existing.taxable = draft.taxable;
    existing.custom = true;
    existing.partNumber = draft.partNumber;
    existing.partTouched = true;
  } else {
    state.quote.lines.push({
      id: customLineId(),
      name: draft.name.trim(),
      description: draft.description,
      tier: "",
      price,
      basePrice: price,
      priceTouched: false,
      qty: draft.qty,
      listPrice: draft.listPrice,
      custom: true,
      labor: false,
      taxable: draft.taxable,
      partNumber: draft.partNumber,
      partTouched: true,
    });
  }
  quoteNumber();
  saveQuote();
  renderTray();
  renderQuote();
  live.textContent = existing ? "Custom item updated." : "Custom item added.";
}

function renderQuote() {
  const totals = quoteTotals(state.quote.lines);
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const number = state.quote.lines.length ? quoteNumber() : (state.quote.number || "");
  const vehicle = vehicleText();
  const rows = state.quote.lines.map((line) => {
    const titled = quoteTitle(line.name);
    const sizeLine = titled.size ? `<span class="line-size">${esc(titled.size)}</span>` : "";
    const detail = line.description ? `<span class="line-desc">${esc(line.description)}</span>` : "";
    const notes = [];
    if (line.labor) notes.push("Labor");
    else if (line.custom) notes.push("Custom");
    else if (TIER_LABEL[line.tier]) notes.push(TIER_LABEL[line.tier]);
    if (isListPrice(line)) notes.push(PARTS_ONLY_TAG);
    if (line.taxable === false) notes.push("Not taxed");
    const noteHtml = notes.map((text) => `<span class="line-note">${esc(text)}</span>`).join("");
    const joined = metaBits(line, titled);
    const printMeta = joined.length ? `<span class="part-line">${esc(joined.join(" · "))}</span>` : "";
    const extended = hasPrice(line.price) ? money(Number(line.price) * line.qty) : "Call for price";
    const edit = line.custom ? `<button class="remove-btn edit-line no-print" type="button" data-edit="${esc(line.id)}">Edit</button>` : "";
    const taxToggle = line.labor ? `<label class="labor-tax no-print"><input type="checkbox" data-labor-tax="${esc(line.id)}" ${line.taxable !== false ? "checked" : ""}> Taxable</label>` : "";
    const title = line.labor
      ? `<input class="labor-name no-print" type="text" data-labor-name="${esc(line.id)}" value="${esc(line.name)}" aria-label="Labor description"><span class="line-name print-only">${esc(line.name)}</span>`
      : `<span class="line-name">${esc(titled.title)}</span>`;
    const qtyCell = line.labor
      ? `<td class="num">1</td>`
      : `<td class="num qty-cell"><input class="qty no-print" type="number" min="1" step="1" inputmode="numeric" data-qty="${esc(line.id)}" value="${line.qty}" aria-label="Quantity for ${esc(line.name)}"><span class="print-only">${line.qty}</span></td>`;
    return `<tr>
      <td class="quote-item">${title}<div class="screen-meta">${sizeLine}${detail}${partLineHtml(line)}${noteHtml}${taxToggle}</div>${printMeta}${edit}</td>
      ${qtyCell}
      <td class="num price-cell">${priceEditorHtml(line)}</td>
      <td class="num line-total price">${esc(extended)}</td>
      <td class="no-print line-actions"><button class="remove-btn" type="button" data-remove="${esc(line.id)}" aria-label="Remove"><span aria-hidden="true">×</span></button></td>
    </tr>`;
  });
  const bodyRows = rows.slice(0, -1).join("");
  const tailRow = rows.at(-1) || "";
  const dense = state.quote.lines.length > 10 ? " quote-dense" : "";
  const noted = state.quote.lines.map((line) => ({ ...line, listPrice: isListPrice(line) }));
  const notes = quoteNotes(noted, totals).map((text) => `<p class="quote-note">${esc(text)}</p>`).join("");
  view.innerHTML = `<article class="quote-page">
    <div class="page-head no-print">
      <button class="back" type="button" data-back="#/">Back</button>
      <div><h1>Quote</h1><p>Prices stay visible here, even when the price switch is off.</p></div>
    </div>
    <form class="quote-fields no-print" id="quote-form">
      <label>Customer name <input id="quote-name" type="text" autocomplete="name" value="${esc(state.quote.customerName)}"></label>
      <label>Phone <input id="quote-phone" type="tel" autocomplete="tel" inputmode="tel" value="${esc(state.quote.phone)}"></label>
      <label>Vehicle <input id="quote-vehicle" type="text" autocomplete="off" placeholder="Year, model, and trim" value="${esc(vehicle)}"></label>
      <label>Salesperson <input id="quote-seller" type="text" autocomplete="name" value="${esc(state.quote.salesperson || "Landon Alexander")}"></label>
    </form>
    <div class="print-sheet">
      <header class="print-head">
        <h1>Corwin Ford Tri-Cities</h1>
        <p>Accessory quote</p>
      </header>
      <p class="print-meta"><span>Quote ${esc(number || "Q-draft")}</span><span>${esc(today)}</span></p>
      <dl class="print-who">
        <div><dt>Customer</dt><dd>${esc(state.quote.customerName || "—")}</dd></div>
        <div><dt>Phone</dt><dd>${esc(state.quote.phone || "—")}</dd></div>
        <div><dt>Vehicle</dt><dd>${esc(vehicle || "—")}</dd></div>
        <div><dt>Salesperson</dt><dd>${esc(state.quote.salesperson || "Landon Alexander")}</dd></div>
      </dl>
    </div>
    <div class="custom-bar no-print">
      <button class="add-wide" id="custom-open" type="button">Add custom item</button>
      <button class="add-wide" id="labor-open" type="button">Add labor</button>
    </div>
    <form class="custom-form no-print" id="custom-form" hidden>
      <label class="span-2">Name
        <input id="custom-name" type="text" autocomplete="off" required>
      </label>
      <label class="span-2">Description
        <input id="custom-desc" type="text" autocomplete="off" placeholder="Optional">
      </label>
      <label class="span-2">Part #
        <input id="custom-part" type="text" autocomplete="off" placeholder="Optional">
      </label>
      <label>Price
        <input id="custom-price" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00" aria-label="Price in dollars">
      </label>
      <label>Quantity
        <input id="custom-qty" type="number" min="1" step="1" inputmode="numeric" value="1">
      </label>
      <div class="span-2">
        <p class="custom-label" id="custom-kind-label">How this item is priced</p>
        <div class="parts-toggle" role="group" aria-labelledby="custom-kind-label">
          <button class="is-current" type="button" data-parts="0" aria-pressed="true">Installed</button>
          <button type="button" data-parts="1" aria-pressed="false">Parts only</button>
        </div>
      </div>
      <label class="check-row span-2">
        <input id="custom-taxable" type="checkbox" checked>
        Taxable
      </label>
      <p class="custom-error span-2" id="custom-error" role="alert"></p>
      <div class="custom-form-actions span-2">
        <button class="add-wide" id="custom-save" type="submit">Add to quote</button>
        <button class="clear-btn" id="custom-cancel" type="button">Cancel</button>
      </div>
    </form>
    ${state.quote.lines.length ? "" : `<p class="tray-empty">Nothing in this quote yet. Add accessories from the menu.</p>`}
    <table class="quote-table${dense}">
      <colgroup>
        <col>
        <col class="col-qty">
        <col class="col-price">
        <col class="col-total">
        <col class="col-act">
      </colgroup>
      <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Amount</th><th class="no-print act-col"><span class="sr">Remove</span></th></tr></thead>
      <tbody>${bodyRows}</tbody>
      <tbody class="quote-tail">
        ${tailRow}
        <tr class="totals-hold">
          <td colspan="5">
            <div class="quote-totals">
              <p><span>Subtotal</span><strong class="price">${esc(money(totals.subtotal))}</strong></p>
              <p><span>Sales tax (8.9%)</span><strong class="price">${esc(money(totals.tax))}</strong></p>
              <p class="quote-grand"><span>Total</span><strong class="price">${esc(money(totals.total))}</strong></p>
              ${notes}
            </div>
          </td>
        </tr>
      </tbody>
    </table>
    <p class="print-foot">Prices subject to change; quote valid 30 days.</p>
    <div class="quote-actions no-print">
      <button class="add-wide" id="quote-print" type="button">Print / Save PDF</button>
      <button class="clear-btn" id="quote-clear" type="button">Clear quote</button>
    </div>
  </article>`;
  const page = view.querySelector(".quote-page");
  const customForm = document.getElementById("custom-form");
  document.getElementById("custom-open").addEventListener("click", () => openCustomForm(null));
  document.getElementById("labor-open").addEventListener("click", addLabor);
  document.getElementById("custom-cancel").addEventListener("click", () => {
    customForm.hidden = true;
  });
  customForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveCustomItem();
  });
  customForm.querySelectorAll("[data-parts]").forEach((button) => {
    button.addEventListener("click", () => setPartsMode(customForm, button.dataset.parts === "1"));
  });
  page.addEventListener("input", (event) => {
    const target = event.target;
    if (target.closest("#custom-form")) return;
    if (target.dataset.part) {
      const line = state.quote.lines.find((entry) => entry.id === target.dataset.part);
      if (!line) return;
      line.partNumber = target.value.trim();
      line.partTouched = true;
      saveQuote();
      const cell = target.closest("td");
      const titled = quoteTitle(line.name);
      const joined = metaBits(line, titled);
      const shown = cell && cell.querySelector(".part-line");
      if (joined.length) {
        const text = joined.join(" · ");
        if (shown) shown.textContent = text;
        else cell.insertAdjacentHTML("beforeend", `<span class="part-line">${esc(text)}</span>`);
      } else if (shown) shown.remove();
      return;
    }
    if (target.id === "quote-name") state.quote.customerName = target.value;
    if (target.id === "quote-phone") state.quote.phone = target.value;
    if (target.id === "quote-vehicle") {
      state.quote.vehicle = target.value;
      state.quote.vehicleTouched = true;
    }
    if (target.id === "quote-seller") state.quote.salesperson = target.value;
    if (target.dataset.laborName) {
      const line = state.quote.lines.find((entry) => entry.id === target.dataset.laborName);
      if (!line) return;
      const name = target.value.trim() || "Installation labor";
      line.name = name;
      const printed = target.parentElement.querySelector(".line-name");
      if (printed) printed.textContent = name;
      saveQuote();
      renderTray();
      return;
    }
    if (target.dataset.price) {
      const line = state.quote.lines.find((entry) => entry.id === target.dataset.price);
      if (!line) return;
      const result = commitLinePrice(line, target.value);
      target.classList.toggle("is-invalid", !result.ok && target.value.trim() !== "" && !/^\d+\.$/.test(target.value.trim().replace(/[$,\s]/g, "")));
      if (!result.ok) return;
      Object.assign(line, result.line);
      saveQuote();
      const row = target.closest("tr");
      const printed = target.parentElement.querySelector(".print-only");
      if (printed) printed.textContent = hasPrice(line.price) ? money(line.price) : "Call for price";
      const extra = target.parentElement.querySelector(".price-extra");
      if (extra) {
        extra.innerHTML = listWasHtml(line);
        bindResets(extra);
      }
      const amount = row && row.querySelector(".line-total");
      if (amount) amount.textContent = hasPrice(line.price) ? money(Number(line.price) * line.qty) : "Call for price";
      paintQuoteMoney();
      return;
    }
    if (target.dataset.qty) {
      const line = state.quote.lines.find((entry) => entry.id === target.dataset.qty);
      if (line) line.qty = Math.max(1, Math.round(Number(target.value) || 1));
      const printed = target.parentElement.querySelector(".print-only");
      if (printed && line) printed.textContent = String(line.qty);
      saveQuote();
      paintQuoteMoney();
      const row = target.closest("tr");
      const amount = row && row.querySelector(".line-total");
      if (line && amount) amount.textContent = hasPrice(line.price) ? money(Number(line.price) * line.qty) : "Call for price";
      return;
    }
    saveQuote();
    const printed = view.querySelectorAll(".print-who dd");
    const shown = vehicleText();
    const values = [
      state.quote.customerName || "—",
      state.quote.phone || "—",
      shown || "—",
      state.quote.salesperson || "Landon Alexander",
    ];
    printed.forEach((node, index) => {
      if (values[index]) node.textContent = values[index];
    });
  });
  page.addEventListener("focusout", (event) => {
    const target = event.target;
    if (target.dataset?.laborName) {
      const line = state.quote.lines.find((entry) => entry.id === target.dataset.laborName);
      if (!line) return;
      const name = target.value.trim() || "Installation labor";
      line.name = name;
      target.value = name;
      const printed = target.parentElement.querySelector(".line-name");
      if (printed) printed.textContent = name;
      saveQuote();
      renderTray();
    }
    if (target.dataset?.price) {
      const line = state.quote.lines.find((entry) => entry.id === target.dataset.price);
      if (!line) return;
      const result = commitLinePrice(line, target.value);
      if (!result.ok) {
        target.value = hasPrice(line.price) ? String(line.price) : "";
        target.classList.remove("is-invalid");
        return;
      }
      Object.assign(line, result.line);
      target.value = hasPrice(line.price) ? String(line.price) : "";
      target.classList.remove("is-invalid");
      saveQuote();
      paintQuoteMoney();
    }
  });
  page.addEventListener("change", (event) => {
    const target = event.target;
    if (!target.dataset?.laborTax) return;
    const line = state.quote.lines.find((entry) => entry.id === target.dataset.laborTax);
    if (!line) return;
    line.taxable = target.checked;
    saveQuote();
    renderQuote();
  });
  document.getElementById("quote-print").addEventListener("click", () => {
    quoteNumber();
    saveQuote();
    window.print();
  });
  document.getElementById("quote-clear").addEventListener("click", clearQuote);
  view.querySelectorAll("[data-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      state.quote.lines = state.quote.lines.filter((line) => line.id !== button.dataset.remove);
      saveQuote();
      renderTray();
      renderQuote();
    });
  });
  bindResets(view);
  view.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      const line = state.quote.lines.find((entry) => entry.id === button.dataset.edit);
      if (line) openCustomForm(line);
    });
  });
}

function applyPriceVisibility() {
  document.body.classList.toggle("prices-off", !state.showPrices);
  const button = document.getElementById("price-toggle");
  button.setAttribute("aria-checked", state.showPrices ? "true" : "false");
  button.textContent = state.showPrices ? "Hide prices" : "Show prices";
  localStorage.setItem(PRICE_KEY, state.showPrices ? "1" : "0");
}

function goBack(fallback) {
  const before = location.hash;
  if (history.length > 1) {
    history.back();
    window.setTimeout(() => {
      if (location.hash === before) location.hash = fallback;
    }, 80);
  } else {
    location.hash = fallback;
  }
}

function bind() {
  document.getElementById("price-toggle").addEventListener("click", () => {
    state.showPrices = !state.showPrices;
    applyPriceVisibility();
    render();
    live.textContent = state.showPrices ? "Prices shown." : "Prices hidden.";
  });
  document.getElementById("tray-handle").addEventListener("click", () => {
    if (state.trayOpen) closeTray();
    else openTray();
  });
  document.getElementById("tray-clear").addEventListener("click", clearQuote);
  document.getElementById("make-quote").addEventListener("click", () => {
    closeTray();
    location.hash = "#/quote";
  });
  document.getElementById("vehicle-filter").addEventListener("change", (event) => {
    state.vehicleFilter = event.target.value;
    localStorage.setItem(FILTER_KEY, state.vehicleFilter);
    if (!state.quote.vehicleTouched) state.quote.vehicle = suggestedVehicle();
    saveQuote();
    render();
  });
  tray.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-tray]")) closeTray();
    const remove = event.target.closest("[data-remove]");
    if (!remove) return;
    state.quote.lines = state.quote.lines.filter((line) => line.id !== remove.dataset.remove);
    saveQuote();
    renderTray();
    if (parseRoute().name === "quote") renderQuote();
    live.textContent = "Removed.";
  });
  view.addEventListener("click", (event) => {
    const back = event.target.closest("[data-back]");
    if (back) {
      goBack(back.dataset.back);
      return;
    }
    const bed = event.target.closest("[data-bed]");
    if (bed && view.querySelector("[data-product]")) {
      state.bedLength[view.querySelector("[data-product]").dataset.product] = bed.dataset.bed;
      renderProduct(view.querySelector("[data-product]").dataset.product);
      return;
    }
    const add = event.target.closest("[data-add]");
    if (add) {
      addToTray(add.dataset.add);
      return;
    }
    const nudge = event.target.closest("[data-nudge]");
    if (nudge) {
      nudgeSlide(Number(nudge.dataset.nudge));
      return;
    }
    const dot = event.target.closest("[data-goto]");
    if (dot && view.querySelector("[data-product]")) {
      const item = itemById(view.querySelector("[data-product]").dataset.product);
      nudgeSlide(Number(dot.dataset.goto) - (state.slideByItem[item.id] || 0));
    }
  });
  document.getElementById("lb-close").addEventListener("click", closeLightbox);
  document.getElementById("lb-prev").addEventListener("click", () => nudgeLightbox(-1));
  document.getElementById("lb-next").addEventListener("click", () => nudgeLightbox(1));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (state.lightbox) closeLightbox();
      else if (state.trayOpen) closeTray();
    }
    if (!state.lightbox) return;
    if (event.key === "ArrowRight") nudgeLightbox(1);
    if (event.key === "ArrowLeft") nudgeLightbox(-1);
  });
  window.addEventListener("hashchange", render);
}

async function boot() {
  bind();
  applyPriceVisibility();
  const vehicleSelect = document.getElementById("vehicle-filter");
  if (vehicleSelect) vehicleSelect.value = state.vehicleFilter;
  renderTray();
  try {
    const response = await fetch("catalog.json?v=559be4a", { cache: "no-store" });
    if (!response.ok) throw new Error(`Catalog request failed (${response.status})`);
    state.catalog = await response.json();
  } catch (error) {
    view.innerHTML = `<div class="message"><h1>The menu did not load.</h1><p>${esc(error.message)}</p><button class="back" type="button" id="retry">Try again</button></div>`;
    document.getElementById("retry").addEventListener("click", () => location.reload());
    return;
  }
  state.quote.lines.forEach((line) => {
    const item = catalogItemForLine(line);
    line.partNumber = linePartNumber(line, item?.partNumber || "");
  });
  saveQuote();
  if (!location.hash || location.hash === "#") history.replaceState(null, "", "#/");
  render();
  renderTray();
}

boot();
