/* Corwin Ford Tri-Cities — iPad accessory menu.
   Item names and prices come from catalog.json. Photos are mapped locally. */

import { hasPrice, money, priceLabel } from "./price-label.js";
import { photosFor } from "./photos.js";

const PRICE_KEY = "accessory-menu-show-prices";
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
  tray: [],
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

function categoryById(id) {
  return (state.catalog.categories || []).find((category) => category.id === id);
}

function itemById(id) {
  return items().find((item) => item.id === id);
}

function itemsIn(categoryId) {
  return items().filter((item) => item.category === categoryId);
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

function placeholderBlock(label, accent, tilt, iconId) {
  const caption = label && label !== "Photo coming" ? `<span class="ph-label">${esc(label)}</span>` : "";
  return `<div class="ph" style="--accent:${esc(accent)};--tilt:${tilt}deg">${iconSvg(iconId)}<span class="ph-kicker">Photo coming</span>${caption}</div>`;
}

function photoTag(src, alt) {
  return `<img src="${esc(src)}" alt="${esc(alt)}" width="800" height="500" loading="lazy" decoding="async">`;
}

function slidesFor(item) {
  const images = photosFor(item.id);
  if (images.length >= 2) {
    return images.map((src, index) => ({ kind: "img", src, label: `${item.name} photo ${index + 1}` }));
  }
  if (images.length === 1) {
    return [
      { kind: "img", src: images[0], label: item.name },
      { kind: "ph", label: "Another angle coming" },
    ];
  }
  return [
    { kind: "ph", label: "Photo coming" },
    { kind: "ph", label: "Another angle coming" },
    { kind: "ph", label: "Detail photo coming" },
  ];
}

function priceHtml(price) {
  return `<p class="price">${esc(priceLabel(price))}</p>`;
}

function tierBadge(tier) {
  if (!TIER_LABEL[tier]) return "";
  return `<span class="tag">${esc(TIER_LABEL[tier])}</span>`;
}

function chipsHtml(fits) {
  return (fits || []).map((fit) => `<li class="chip is-fit">${esc(fit)}</li>`).join("");
}

function parseRoute() {
  const raw = (location.hash || "#/").replace(/^#/, "");
  const parts = raw.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts.length === 0) return { name: "home" };
  if (parts[0] === "c" && parts[1]) return { name: "category", id: parts[1] };
  if (parts[0] === "p" && parts[1]) return { name: "product", id: parts[1] };
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
    : placeholderBlock("Photo coming", accentFor(category.id), 155, category.id);
  const brand = item.brand ? `<p class="brand">${esc(item.brand)}</p>` : "";
  return `<article class="card">
    <a class="card-link" href="#/p/${esc(item.id)}">
      <div class="media">${media}</div>
      <div class="card-body">
        ${tierBadge(item.tier)}
        <h2>${esc(item.name)}</h2>
        ${brand}
        <p class="benefit">${esc(item.sellingPoint)}</p>
        ${priceHtml(item.price)}
      </div>
    </a>
    <button class="add-btn" type="button" data-add="${esc(item.id)}" aria-label="Add ${esc(item.name)} to Build my truck">+</button>
  </article>`;
}

function renderCategory(id) {
  const category = categoryById(id);
  const list = itemsIn(id);
  if (!category || !list.length) {
    view.innerHTML = `<div class="message"><h1>Nothing in that category.</h1><button class="back" type="button" data-back="#/">Back</button></div>`;
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
  const index = Math.min(state.slideByItem[item.id] || 0, slides.length - 1);
  state.slideByItem[item.id] = index;
  const slideHtml = slides.map((slide, slideIndex) => {
    const hidden = slideIndex === index ? "" : " hidden";
    if (slide.kind === "img") {
      return `<div class="slide" data-slide="${slideIndex}"${hidden}>${photoTag(slide.src, slide.label)}</div>`;
    }
    return `<div class="slide" data-slide="${slideIndex}"${hidden}>${placeholderBlock(slide.label, accent, 140 + slideIndex * 28, item.category)}</div>`;
  }).join("");
  const dots = slides.map((slide, slideIndex) => {
    const current = slideIndex === index ? ' aria-current="true"' : "";
    return `<button class="dot" type="button" data-goto="${slideIndex}" aria-label="Photo ${slideIndex + 1}"${current}><span></span></button>`;
  }).join("");
  const brand = item.brand ? `<p class="brand">${esc(item.brand)}</p>` : "";
  view.innerHTML = `<article class="product" data-product="${esc(item.id)}">
    <div class="gallery">
      <button class="g-nav g-prev" type="button" data-nudge="-1" aria-label="Previous photo">‹</button>
      <div class="gallery-stage" id="gallery-stage">${slideHtml}</div>
      <button class="g-nav g-next" type="button" data-nudge="1" aria-label="Next photo">›</button>
      <div class="dots">${dots}</div>
      <p class="slide-count" id="slide-count">${index + 1} of ${slides.length}. Tap the photo to view full screen.</p>
    </div>
    <div class="details">
      <div class="page-head">
        <button class="back" type="button" data-back="#/c/${esc(item.category)}">Back</button>
        <div><p>${esc(category ? category.name : "")}</p></div>
      </div>
      <h1>${esc(item.name)}</h1>
      ${tierBadge(item.tier)}
      ${brand}
      <p class="benefit">${esc(item.sellingPoint)}</p>
      ${priceHtml(item.price)}
      <p class="fit-label">Fitment</p>
      <ul class="chips">${chipsHtml(item.fits)}</ul>
      <button class="add-wide" type="button" data-add="${esc(item.id)}">Add to my truck</button>
    </div>
  </article>`;
  mountSwipe(document.getElementById("gallery-stage"), {
    onLeft: () => nudgeSlide(1),
    onRight: () => nudgeSlide(-1),
    onTap: () => openLightbox(item.id, state.slideByItem[item.id] || 0),
  });
}

function nudgeSlide(delta) {
  const root = view.querySelector("[data-product]");
  if (!root) return;
  const item = itemById(root.dataset.product);
  const slides = slidesFor(item);
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
    return `<div class="lb-slide" data-slide="${slideIndex}"${hidden}>${placeholderBlock(slide.label, accent, 140 + slideIndex * 28, item.category)}</div>`;
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

function addToTray(itemId) {
  const item = itemById(itemId);
  if (!item) return;
  state.tray.push({
    uid: `${item.id}-${Date.now()}-${state.tray.length}`,
    name: item.name,
    price: hasPrice(item.price) ? Number(item.price) : null,
  });
  renderTray();
  const handle = document.getElementById("tray-handle");
  handle.classList.remove("pulse");
  void handle.offsetWidth;
  handle.classList.add("pulse");
  const total = trayTotalLabel();
  live.textContent = state.showPrices ? `Added ${item.name}. Installed total ${total}.` : `Added ${item.name}.`;
}

function trayTotalLabel() {
  if (!state.tray.length) return money(0);
  if (state.tray.some((line) => !hasPrice(line.price))) return "Ask for price";
  return money(state.tray.reduce((sum, line) => sum + Number(line.price), 0));
}

function renderTray() {
  const list = document.getElementById("tray-list");
  const empty = document.getElementById("tray-empty");
  const total = trayTotalLabel();
  document.getElementById("tray-count").textContent = String(state.tray.length);
  document.getElementById("tray-total").textContent = total;
  document.getElementById("tray-handle-total").textContent = total;
  list.innerHTML = state.tray.map((line) => `<li>
    <span class="tray-name">${esc(line.name)}</span>
    <span class="price">${esc(hasPrice(line.price) ? money(line.price) : "Ask for price")}</span>
    <button class="remove-btn" type="button" data-remove="${esc(line.uid)}">Remove</button>
  </li>`).join("");
  empty.hidden = state.tray.length > 0;
}

function openTray() {
  state.trayOpen = true;
  tray.classList.add("is-open");
  document.getElementById("tray-handle").setAttribute("aria-expanded", "true");
  document.getElementById("tray-panel").hidden = false;
}

function closeTray() {
  state.trayOpen = false;
  tray.classList.remove("is-open");
  document.getElementById("tray-handle").setAttribute("aria-expanded", "false");
  window.setTimeout(() => {
    if (!state.trayOpen) document.getElementById("tray-panel").hidden = true;
  }, 280);
}

function clearTray() {
  state.tray = [];
  renderTray();
  live.textContent = "Build cleared.";
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
    live.textContent = state.showPrices ? "Prices shown." : "Prices hidden.";
  });
  document.getElementById("tray-handle").addEventListener("click", () => {
    if (state.trayOpen) closeTray();
    else openTray();
  });
  document.getElementById("tray-clear").addEventListener("click", clearTray);
  tray.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-tray]")) closeTray();
    const remove = event.target.closest("[data-remove]");
    if (!remove) return;
    state.tray = state.tray.filter((line) => line.uid !== remove.dataset.remove);
    renderTray();
    live.textContent = state.showPrices ? `Removed. Installed total ${trayTotalLabel()}.` : "Removed.";
  });
  view.addEventListener("click", (event) => {
    const back = event.target.closest("[data-back]");
    if (back) {
      goBack(back.dataset.back);
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
  renderTray();
  try {
    const response = await fetch("catalog.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Catalog request failed (${response.status})`);
    state.catalog = await response.json();
  } catch (error) {
    view.innerHTML = `<div class="message"><h1>The menu did not load.</h1><p>${esc(error.message)}</p><button class="back" type="button" id="retry">Try again</button></div>`;
    document.getElementById("retry").addEventListener("click", () => location.reload());
    return;
  }
  if (!location.hash || location.hash === "#") history.replaceState(null, "", "#/");
  render();
}

boot();
