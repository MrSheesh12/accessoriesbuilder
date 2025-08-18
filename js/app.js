/* ---------- Accessories & Packages Builder (Full Rewrite) ---------- */

/* ------------------- state ------------------- */
const state = {
  items: [],
  selected: new Set(),
  taxRate: 0.089,
  subtotal: 0,
  tax: 0,
  total: 0,
  finance: { enabled: false, apr: 7.49, termMonths: 60, monthly: 0 },
  selectedBaseImage: null,
  selectedVehicle: "",
  selectedBedLength: "",
};

/* ------------------- elements ------------------- */
const els = {
  media: {
    vinLast8: document.getElementById("vinLast8"),
    stock: document.getElementById("stockNum"),
    fetchBtn: document.getElementById("fetchMedia"),
    status: document.getElementById("mediaStatus"),
    gallery: document.getElementById("mediaGallery"),
    container: document.getElementById("vehicle-media"),
    url: document.getElementById("vehicleUrl"),
    fetchUrlBtn: document.getElementById("fetchMediaByUrl"),
  },
  catalog: document.getElementById("catalog"),
  categorySelect: document.getElementById("categorySelect"),
  vehicleSelect: document.getElementById("vehicleSelect"),
  bedLength: document.getElementById("bedLength"),
  bedLengthWrap: document.getElementById("bedLengthWrap"),
  pkgBtns: document.querySelectorAll(".pkg-btn"),
  exportBtn: document.getElementById("exportQuote"),
  yearSpan: document.getElementById("year"),
  financeToggle: document.getElementById("financeToggle"),
  financeBox: document.getElementById("financeBox"),
  apr: document.getElementById("apr"),
  term: document.getElementById("term"),
  down: document.getElementById("down"),
  estPayment: document.getElementById("estPayment"),
  subtotal: document.getElementById("subtotal"),
  tax: document.getElementById("tax"),
  total: document.getElementById("total"),
  itemCount: document.getElementById("itemCount"),
};

/* ------------------- config ------------------- */
const CONFIG = {
  shopRatePerHour: 165,
  
  vehicles: [
    { id: "f150", label: "F-150", beds: ["5.5ft","6.5ft"] },
    { id: "superduty", label: "Super Duty (F-250/F-350)", beds: ["6.75ft","8ft"] },
    { id: "ranger", label: "Ranger", beds: ["5ft","6ft"] },
    { id: "maverick", label: "Maverick", beds: ["4.5ft"] },
    { id: "bronco", label: "Bronco" },
    { id: "broncoSport", label: "Bronco Sport" },
    { id: "explorer", label: "Explorer" },
    { id: "expedition", label: "Expedition" },
    { id: "escape", label: "Escape" },
    { id: "edge", label: "Edge" },
    { id: "mustang", label: "Mustang" },
    { id: "machE", label: "Mustang Mach‑E" },
    { id: "transit", label: "Transit" }
  ],
  categories: {
    protection: "Protection",
    exterior: "Exterior",
    interior: "Interior",
    performance: "Performance",
  },
  items: [
{ id: "bedliner", name: "Spray\u2011in Bedliner", category: "protection", desc: "In\u2011house spray liner for trucks. Lifetime warranty.", image: "assets/spray-in-bedliner.png", tags: ["bedliner", "spray"], compute: "bedliner" },
{ id: "tint", name: "Front Window Tint (Carbon)", category: "protection", parts: 280, laborHours: 0, image: "assets/retronotify.png", desc: "Carbon film on front doors. Lifetime warranty.", tags: ["tint", "carbon"], fits: ["f150", "superduty", "ranger", "maverick", "bronco", "broncoSport", "explorer", "expedition", "escape", "edge", "mustang", "machE", "transit"] },
{ id: "tint_ceramic", name: "Front Window Tint (Ceramic)", category: "protection", parts: 340, laborHours: 0, image: "assets/retronotify.png", desc: "Ceramic film with superior heat rejection.", tags: ["tint", "ceramic"], fits: ["f150", "superduty", "ranger", "maverick", "bronco", "broncoSport", "explorer", "expedition", "escape", "edge", "mustang", "machE", "transit"] },
{ id: "ppf", name: "Paint Protection Film Package", category: "protection", parts: 1200, laborHours: 0, image: "assets/retronotify.png", desc: "Partial hood + fenders + headlights. Self\u2011healing film.", tags: ["ppf", "clear-bra"], fits: ["f150", "superduty", "ranger", "maverick", "bronco", "broncoSport", "explorer", "expedition", "escape", "edge", "mustang", "machE", "transit"] },
{ id: "steps", name: "AMP PowerSteps", category: "exterior", parts: 1400, laborHours: 1.2, image: "assets/amp-powersteps.png", desc: "Automatic retracting steps.", tags: ["amp", "running boards"], fits: ["f150", "superduty", "ranger", "maverick", "bronco", "explorer", "expedition"] },
{ id: "bakflip", name: "BAKFlip MX4 Tonneau", category: "exterior", image: "assets/b69bcb44-92b9-4844-8dd0-74d61a90b037.png", desc: "Aluminum tri\u2011fold, matte finish.", tags: ["tonneau", "hard-fold"], fits: ["f150", "superduty", "ranger", "maverick"], compute: "mx4" },
{ id: "retraxt", name: "Retrax PRO XR", category: "exterior", image: "assets/retraxpro.png", desc: "Aluminum retractable with T\u2011slot rails.", tags: ["tonneau", "retractable"], fits: ["f150", "superduty", "ranger", "maverick"], compute: "retrax" },
{ id: "mats", name: "All\u2011Weather Floor Mats", category: "interior", parts: 225, laborHours: 0, image: "assets/floor-mats.png", desc: "Custom\u2011fit mats to trap mud/snow.", tags: ["floor", "mats"], fits: ["f150", "superduty", "ranger", "maverick", "bronco", "broncoSport", "explorer", "expedition", "escape", "edge", "mustang", "machE", "transit"] },
{ id: "katzkin", name: "Katzkin Leather Upgrade", category: "interior", parts: 2500, laborHours: 0, image: "assets/retronotify.png", desc: "Basic Katzkin package installed.", tags: ["leather", "katzkin"], fits: ["f150", "superduty", "ranger", "maverick", "bronco", "explorer", "expedition", "mustang"] },
{ id: "subwoofer", name: "Subwoofer Upgrade", category: "interior", parts: 1200, laborHours: 0, image: "assets/retronotify.png", desc: "Clean bass, integrated wiring.", tags: ["audio", "sub"], fits: ["f150", "superduty", "ranger", "maverick", "bronco", "broncoSport", "explorer", "expedition", "escape", "edge", "mustang", "machE", "transit"] },
{ id: "leveling_half", name: "ReadyLIFT Leveling (Half\u2011ton)", category: "performance", parts: 650, laborHours: 1.5, image: "assets/7a6f71e5-6692-47d5-ad75-b35514b60a8c.png", desc: "2\" front level incl. alignment.", tags: ["leveling"], fits: ["f150"] },
{ id: "leveling_hd", name: "ReadyLIFT Leveling (HD)", category: "performance", parts: 750, laborHours: 1.5, image: "assets/a4cd8cfa-5d0e-48ab-84b6-da4437837d6a.png", desc: "2\" front level incl. alignment.", tags: ["leveling"], fits: ["superduty"] }
],
  packages: {
    work_truck: ["bedliner", "mats"],
    overland: ["steps", "retraxt", "leveling_hd"],
    family_daily: ["mats", "tint_ceramic", "subwoofer"],
    platinum_look: ["katzkin", "tint_ceramic", "ppf"],
  },
};

const API_BASE =
  location.hostname === "localhost"
    ? "http://localhost:8888/.netlify/functions"
    : "/.netlify/functions";


// --- Pricing & Fitment helpers ---
function vehicleById(id) {
  return (CONFIG.vehicles || []).find(v => v.id === id);
}
// Compute bundled price:
// 1) If item has a compute type, evaluate based on selected vehicle/bed.
// 2) Else parts + laborHours*rate.
// 3) Else static price.
function priceOf(it) {
  const rate = CONFIG.shopRatePerHour || 165;
  const vehicleId = state.selectedVehicle || "";
  const vehicle = vehicleById(vehicleId) || {};
  const bed = state.selectedBedLength || "";

  if (it.compute === "bedliner") {
    // $595 short, $650 long (F-150 5.5 vs 6.5; Super Duty 6.75 vs 8.0). Others default $595.
    if (vehicleId === "f150") return (bed === "6.5ft") ? 650 : 595;
    if (vehicleId === "superduty") return (bed === "8ft") ? 650 : 595;
    return 595;
  }
  if (it.compute === "mx4") {
    // BAKFlip MX4 parts+1h labor (@$165). Parts vary by truck/bed.
    let parts = 1050;
    if (vehicleId === "f150") parts = (bed === "6.5ft") ? 1199.99 : 1050;
    else if (vehicleId === "superduty") parts = (bed === "8ft") ? 1200 : 1150;
    else if (vehicleId === "ranger") parts = (bed === "6ft") ? 1050 : 995;
    else if (vehicleId === "maverick") parts = 975;
    return +(parts + rate * 1.0).toFixed(2);
  }
  if (it.compute === "retrax") {
    // Retrax PRO XR parts + 2h labor
    let parts = 2249.99;
    if (vehicleId === "f150") parts = (bed === "6.5ft") ? 2349.99 : 2249.99;
    else if (vehicleId === "superduty") parts = (bed === "8ft") ? 2449.99 : 2349.99;
    else if (vehicleId === "ranger") parts = 2349.99;
    else if (vehicleId === "maverick") parts = 2249.99;
    return +(parts + rate * 2.0).toFixed(2);
  }

  const parts = Number(it.parts || 0);
  const hours = Number(it.laborHours || 0);
  if (!isNaN(parts) && !isNaN(hours) && (parts || hours)) return +(parts + hours * rate).toFixed(2);
  return Number(it.price || 0);
}
// Fitment check: if item has fits array, require the selected vehicle to be in it.
function itemFits(it, vehicleId) {
  if (!vehicleId) return true; // no vehicle chosen → show all
  if (!it.fits) return true;
  return it.fits.includes(vehicleId);
}
/* ------------------- helpers ------------------- */
function setStatus(html, cls = "") {
  if (!els.media.status) return;
  els.media.status.className = cls || "";
  els.media.status.innerHTML = html;
}

function normalizeImages(list = []) {
  const norm = new Set();
  list.forEach((u) => {
    if (!u) return;
    let url = String(u).trim();
    if (!/^https?:\/\//i.test(url)) {
      if (url.startsWith("//")) url = "https:" + url;
      else if (url.startsWith("/")) url = location.origin + url;
    }
    if (!/\.(jpg|jpeg|webp)(\?|#|$)/i.test(url)) return;
    norm.add(url);
  });
  return Array.from(norm);
}

/* ------------------- catalog rendering ------------------- */

function renderCatalog(filter = "all") {
  if (!els.catalog) return;
  els.catalog.innerHTML = "";
  let items = CONFIG.items.filter((it) => filter === "all" || it.category === filter);
  const veh = state.selectedVehicle;
  if (veh) items = items.filter((it) => itemFits(it, veh));
  if (!items.length) {
    els.catalog.innerHTML = `<p class="muted">No compatible items for this selection.</p>`;
    return;
  }
  els.catalog.innerHTML = items.map((it) => {
    const price = priceOf(it);
    const img = it.image ? `<div class="media"><img src="${it.image}" alt="${it.name}"></div>` : "";
    const desc = it.desc ? `<p class="desc">${it.desc}</p>` : "";
    const tags = it.tags && it.tags.length ? `<small class="badge">${it.tags.join(" · ")}</small>` : "";
    const showBreakdown = (typeof it.parts !== "undefined" || typeof it.laborHours !== "undefined") || it.compute;
    let breakdown = "";
    if (showBreakdown) {
      if (it.compute === "bedliner") {
        breakdown = `<small class="muted">Price varies by bed length; includes labor.</small>`;
      } else if (it.compute === "mx4") {
        breakdown = `<small class="muted">Includes ~1.0h labor × $${(CONFIG.shopRatePerHour||165).toFixed(2)}</small>`;
      } else if (it.compute === "retrax") {
        breakdown = `<small class="muted">Includes ~2.0h labor × $${(CONFIG.shopRatePerHour||165).toFixed(2)}</small>`;
      } else {
        breakdown = `<small class="muted">includes labor: $${(it.parts||0).toFixed(2)} parts + ${(Number(it.laborHours||0))}h × $${(CONFIG.shopRatePerHour||165).toFixed(2)}</small>`;
      }
    }
    const checked = state.selected.has(it.id) ? "checked" : "";
    return `
      <article class="card" data-id="${it.id}">
        ${img}
        <div class="content">
          <h3>${it.name}</h3>
          ${tags}
          ${desc}
          ${breakdown}
          <div class="actions">
            <label class="checkbox">
              <input type="checkbox" ${checked}>
              <span>Add</span>
            </label>
            <span class="price">$${price.toFixed(2)}</span>
          </div>
        </div>
      </article>
    `;
  }).join("");

  els.catalog.querySelectorAll(".card input[type='checkbox']").forEach((chk) => {
    chk.addEventListener("change", (e) => {
      const id = e.target.closest(".card").dataset.id;
      if (e.target.checked) state.selected.add(id);
      else state.selected.delete(id);
      state.items = CONFIG.items.filter((it) => state.selected.has(it.id));
      recomputeTotals();
    });
  });
}
  els.catalog.innerHTML = items
    .map(
      (it) => `
      <div class="item" data-id="${it.id}">
        <label>
          <input type="checkbox" ${state.selected.has(it.id) ? "checked" : ""}>
          <span>${it.name}</span>
        </label>
        <span class="price">$${it.price.toFixed(2)}</span>
      </div>`
    )
    .join("");

  els.catalog.querySelectorAll(".item input").forEach((chk) => {
    chk.addEventListener("change", (e) => {
      const id = e.target.closest(".item").dataset.id;
      if (e.target.checked) state.selected.add(id);
      else state.selected.delete(id);
      syncItems();
    });
  });
}

function syncItems() {
  state.items = CONFIG.items.filter((it) => state.selected.has(it.id));
  recomputeTotals();
}

/* ------------------- media rendering ------------------- */
function renderMediaGallery(images = []) {
  if (!els.media.gallery) return;
  const imgs = normalizeImages(images);
  els.media.gallery.innerHTML = imgs
    .map(
      (src, i) => `
      <div class="media-thumb" data-src="${src}">
        <span class="pick">Use</span>
        <img src="${src}" alt="Vehicle photo ${i + 1}">
      </div>`
    )
    .join("");

  const nodes = els.media.gallery.querySelectorAll(".media-thumb");
  nodes.forEach((div) => {
    div.addEventListener("click", () => {
      nodes.forEach((n) => n.classList.remove("active"));
      div.classList.add("active");
      state.selectedBaseImage = div.dataset.src;
    });
  });

  if (nodes.length) {
    nodes[0].click();
    setStatus(`Loaded ${nodes.length} images.`, "success");
  } else {
    setStatus("No images found for that vehicle.", "error");
  }
}

/* ------------------- fetch vehicle media ------------------- */
async function fetchVehicleMedia({ vinLast8, stock, url }) {
  const qs = new URLSearchParams();
  if (vinLast8) qs.set("vinLast8", vinLast8.trim());
  if (stock) qs.set("stock", stock.trim());
  if (url) qs.set("url", url.trim());
  const endpoint = `${API_BASE}/fetch-vehicle-media?${qs.toString()}`;
  const res = await fetch(endpoint);
  if (!res.ok) throw new Error(`Fetch error ${res.status}`);
  return res.json();
}

/* ------------------- totals & finance ------------------- */
function recomputeTotals() {
  const subtotal = (state.items || []).reduce((s, it) => s + priceOf(it), 0);
  const tax = +(subtotal * state.taxRate).toFixed(2);
  const total = +(subtotal + tax).toFixed(2);
  state.subtotal = subtotal;
  state.tax = tax;
  state.total = total;

  if (state.finance.enabled) {
    updatePayment();
  }

  if (els.subtotal) els.subtotal.textContent = `$${subtotal.toFixed(2)}`;
  if (els.tax) els.tax.textContent = `$${tax.toFixed(2)}`;
  if (els.total) els.total.textContent = `$${total.toFixed(2)}`;
  if (els.itemCount) els.itemCount.textContent = state.items.length;
}

function updatePayment() {
  const down = Number(els.down?.value || 0);
  const financed = Math.max(0, state.total - down);
  const r = state.finance.apr / 100 / 12;
  const n = state.finance.termMonths;
  const m = r ? (financed * r) / (1 - Math.pow(1 + r, -n)) : financed / Math.max(1, n);
  state.finance.monthly = +m.toFixed(2);
  if (els.estPayment) els.estPayment.textContent = `$${state.finance.monthly.toFixed(2)}/mo`;
}

/* ------------------- wiring ------------------- */
// Category filter
if (els.categorySelect) {
  Object.entries(CONFIG.categories).forEach(([val, label]) => {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = label;
    els.categorySelect.appendChild(opt);
  });
  els.categorySelect.addEventListener("change", () => {
    renderCatalog(els.categorySelect.value);
  });
  renderCatalog("all");

// Vehicle select wiring
if (els.vehicleSelect) {
  // Populate list
  (CONFIG.vehicles || []).forEach(({id,label}) => {
    const opt = document.createElement("option");
    opt.value = id; opt.textContent = label;
    els.vehicleSelect.appendChild(opt);
  });
  els.vehicleSelect.addEventListener("change", () => {
    state.selectedVehicle = els.vehicleSelect.value || "";
    // Bed length show/hide
    const v = (CONFIG.vehicles || []).find(v => v.id === state.selectedVehicle);
    if (v && v.beds && v.beds.length) {
      els.bedLengthWrap.style.display = "";
      els.bedLength.innerHTML = "";
      v.beds.forEach((b, i) => {
        const opt = document.createElement("option");
        opt.value = b; opt.textContent = b;
        els.bedLength.appendChild(opt);
        if (i === 0) els.bedLength.value = b;
      });
      state.selectedBedLength = v.beds[0] || "";
    } else {
      els.bedLengthWrap.style.display = "none";
      state.selectedBedLength = "";
    }
    renderCatalog(els.categorySelect ? els.categorySelect.value : "all");
  });
}
// Bed length select
els.bedLength?.addEventListener("change", () => {
  state.selectedBedLength = els.bedLength.value || "";
  renderCatalog(els.categorySelect ? els.categorySelect.value : "all");
});

}

// Packages
els.pkgBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const pkg = btn.dataset.package;
    if (pkg && CONFIG.packages[pkg]) {
      CONFIG.packages[pkg].forEach((id) => state.selected.add(id));
    } else if (btn.id === "clearSelections") {
      state.selected.clear();
    }
    renderCatalog(els.categorySelect.value);
    syncItems();
  });
});

// VIN/Stock fetch
if (els.media.fetchBtn) {
  els.media.fetchBtn.addEventListener("click", async () => {
    try {
      const vin8 = els.media.vinLast8.value.trim();
      const stock = els.media.stock.value.trim();
      if (!vin8 && !stock) return setStatus("Enter VIN or Stock", "error");
      els.media.gallery.innerHTML = "";
      setStatus("Fetching vehicle… <span class='spinner'></span>");
      const data = await fetchVehicleMedia({ vinLast8: vin8, stock });
      renderMediaGallery(data.images || []);
    } catch (e) {
      console.error(e);
      setStatus("Could not fetch photos.", "error");
    }
  });
}

// URL fetch
if (els.media.fetchUrlBtn) {
  els.media.fetchUrlBtn.addEventListener("click", async () => {
    try {
      const url = els.media.url.value.trim();
      if (!url) return setStatus("Paste a vehicle URL", "error");
      els.media.gallery.innerHTML = "";
      setStatus("Fetching from URL… <span class='spinner'></span>");
      const data = await fetchVehicleMedia({ url });
      renderMediaGallery(data.images || []);
    } catch (e) {
      console.error(e);
      setStatus("Could not fetch from that URL.", "error");
    }
  });
}

// Export
if (els.exportBtn) {
  els.exportBtn.addEventListener("click", () => {
    recomputeTotals();
    const payload = {
      selectedBaseImage: state.selectedBaseImage,
      items: state.items,
      taxRate: state.taxRate,
      totals: {
        items: state.items.length,
        subtotal: state.subtotal,
        tax: state.tax,
        total: state.total,
      },
      finance: state.finance.enabled
        ? { ...state.finance }
        : { enabled: false },
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "quote.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
}

// Finance toggle
if (els.financeToggle) {
  els.financeToggle.addEventListener("change", () => {
    els.financeBox.hidden = !els.financeToggle.checked;
    state.finance.enabled = els.financeToggle.checked;
    recomputeTotals();
  });
  ["input", "change"].forEach((evt) => {
    els.apr?.addEventListener(evt, () => {
      state.finance.apr = Number(els.apr.value);
      updatePayment();
    });
    els.term?.addEventListener(evt, () => {
      state.finance.termMonths = Number(els.term.value);
      updatePayment();
    });
    els.down?.addEventListener(evt, () => updatePayment());
  });
}

// Footer year
if (els.yearSpan) els.yearSpan.textContent = new Date().getFullYear();

// Initial
recomputeTotals();
