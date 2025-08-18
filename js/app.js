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
  categories: {
    protection: "Protection",
    exterior: "Exterior",
    interior: "Interior",
    performance: "Performance",
  },
  items: [
    { id: "bedliner", name: "Spray-in Bedliner", price: 595, category: "protection" },
    { id: "tint", name: "Front Window Tint (Carbon)", price: 280, category: "protection" },
    { id: "tint_ceramic", name: "Front Window Tint (Ceramic)", price: 340, category: "protection" },
    { id: "ppf", name: "Paint Protection Film Package", price: 1200, category: "protection" },
    { id: "steps", name: "AMP PowerSteps", price: 1600, category: "exterior" },
    { id: "bakflip", name: "BAKFlip MX4 Tonneau Cover", price: 1250, category: "exterior" },
    { id: "retraxt", name: "Retrax PRO XR", price: 2100, category: "exterior" },
    { id: "mats", name: "All-Weather Floor Mats", price: 225, category: "interior" },
    { id: "katzkin", name: "Katzkin Leather Upgrade", price: 2500, category: "interior" },
    { id: "subwoofer", name: "Subwoofer Upgrade", price: 1200, category: "interior" },
    { id: "leveling_half", name: "ReadyLIFT Leveling Kit (Half-ton)", price: 895, category: "performance" },
    { id: "leveling_hd", name: "ReadyLIFT Leveling Kit (HD)", price: 995, category: "performance" },
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
  const items = CONFIG.items.filter((it) => filter === "all" || it.category === filter);
  if (!items.length) {
    els.catalog.innerHTML = `<p class="muted">No items in this category.</p>`;
    return;
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
  const subtotal = (state.items || []).reduce((s, it) => s + it.price, 0);
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
