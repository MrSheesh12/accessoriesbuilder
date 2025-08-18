/* ---------- Accessories & Packages Builder (Netlify-ready) ---------- */

const state = {
  items: [],
  taxRate: 0.089,
  subtotal: 0,
  tax: 0,
  total: 0,
  finance: { enabled: false, apr: 7.49, termMonths: 60, monthly: 0 },
  selectedBaseImage: null
};

const els = {
  media: {
    vinLast8: document.getElementById("vinLast8"),
    stock: document.getElementById("stockNum"),
    fetchBtn: document.getElementById("fetchMedia"),
    status: document.getElementById("mediaStatus"),
    gallery: document.getElementById("mediaGallery"),
    container: document.getElementById("vehicle-media"),
    url: document.getElementById("vehicleUrl"),
    fetchUrlBtn: document.getElementById("fetchMediaByUrl")
  },
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
  itemCount: document.getElementById("itemCount")
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

function showDebug(meta, images, route) {
  if (!els.media.container) return;
  let dbg = document.getElementById("debugPanel");
  if (!dbg) {
    dbg = document.createElement("pre");
    dbg.id = "debugPanel";
    dbg.style.background = "#0f141b";
    dbg.style.border = "1px solid var(--border)";
    dbg.style.padding = "8px";
    dbg.style.borderRadius = "8px";
    dbg.style.whiteSpace = "pre-wrap";
    dbg.style.marginTop = "8px";
    els.media.container.appendChild(dbg);
  }
  dbg.textContent = JSON.stringify(
    {
      route: route || null,
      foundUrl: meta?.url || null,
      title: meta?.title || null,
      imagesFound: (images || []).length
    },
    null,
    2
  );
}

// Ensure images are valid and unique and have https scheme
function normalizeImages(list = []) {
  const norm = new Set();
  list.forEach((u) => {
    if (!u) return;
    let url = String(u).trim();
    if (!/^https?:\/\//i.test(url)) {
      if (url.startsWith("//")) url = "https:" + url;
      else if (url.startsWith("/")) url = location.origin + url;
    }
    // only accept jpg/jpeg/webp from dealerinspire (or anything the fn returns)
    if (!/\.(jpg|jpeg|webp)(\?|#|$)/i.test(url)) return;
    norm.add(url);
  });
  return Array.from(norm);
}

function renderMediaGallery(images = []) {
  if (!els.media.gallery) return;
  const imgs = normalizeImages(images);
  els.media.gallery.innerHTML = imgs
    .map(
      (src, i) => `
      <div class="media-thumb" data-src="${src}" title="Use this photo as base">
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
      let info = document.querySelector(".selected-base");
      if (!info) {
        info = document.createElement("div");
        info.className = "selected-base";
        els.media.container.appendChild(info);
      }
      info.textContent = `Base photo selected: ${state.selectedBaseImage}`;
    });
  });

  // Auto-select first image, if any
  if (nodes.length) {
    nodes[0].click();
    setStatus(`Loaded ${nodes.length} images. Click a thumbnail to change the base photo.`, "success");
  } else {
    setStatus("No images found for that vehicle.", "error");
  }
}

async function fetchVehicleMedia({ vinLast8, stock, url }) {
  const qs = new URLSearchParams();
  if (vinLast8) qs.set("vinLast8", vinLast8.trim());
  if (stock) qs.set("stock", String(stock).trim());
  if (url) qs.set("url", url.trim());

  const endpoint = `${API_BASE}/fetch-vehicle-media?${qs.toString()}`;
  const res = await fetch(endpoint, { method: "GET" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Function error ${res.status}: ${text || "unknown"}`);
  }
  return res.json();
}

function recomputeTotals() {
  const subtotal = (state.items || []).reduce((sum, it) => sum + (Number(it.price) || 0), 0);
  const tax = +(subtotal * state.taxRate).toFixed(2);
  const total = +(subtotal + tax).toFixed(2);
  state.subtotal = +subtotal.toFixed(2);
  state.tax = tax;
  state.total = total;

  if (state.finance.enabled) {
    const r = state.finance.apr / 100 / 12;
    const n = state.finance.termMonths;
    const m = r ? (total * r) / (1 - Math.pow(1 + r, -n)) : total / n;
    state.finance.monthly = +m.toFixed(2);
  }

  if (els.subtotal) els.subtotal.textContent = `$${state.subtotal.toFixed(2)}`;
  if (els.tax) els.tax.textContent = `$${state.tax.toFixed(2)}`;
  if (els.total) els.total.textContent = `$${state.total.toFixed(2)}`;
  if (els.itemCount) els.itemCount.textContent = String((state.items || []).length);
}

// disable/enable buttons to prevent double clicks
function setLoading(isLoading) {
  const btns = [els.media.fetchBtn, els.media.fetchUrlBtn];
  btns.forEach((b) => {
    if (!b) return;
    b.disabled = isLoading;
    b.classList.toggle("is-loading", isLoading);
  });
}

/* ------------------- wiring ------------------- */

// VIN / Stock
if (els.media.fetchBtn) {
  els.media.fetchBtn.addEventListener("click", async () => {
    try {
      const vin8 = (els.media.vinLast8?.value || "").trim();
      const stock = (els.media.stock?.value || "").trim();
      if (!vin8 && !stock) {
        setStatus("Enter last 8 of VIN or Stock #", "error");
        return;
      }
      els.media.gallery.innerHTML = "";
      setLoading(true);
      setStatus('Looking up vehicle… <span class="spinner"></span>');
      const data = await fetchVehicleMedia({ vinLast8: vin8, stock });
      showDebug(data.meta, data.images || [], data?.debug?.route || "vin/stock");
      renderMediaGallery(data.images || []);
    } catch (e) {
      console.error(e);
      setStatus("Could not find photos. Check VIN/Stock or try the URL method.", "error");
    } finally {
      setLoading(false);
    }
  });
}

// URL method
if (els.media.fetchUrlBtn) {
  els.media.fetchUrlBtn.addEventListener("click", async () => {
    try {
      const url = (els.media.url?.value || "").trim();
      if (!url) return setStatus("Paste a vehicle detail URL first.", "error");
      if (!/^https?:\/\//i.test(url)) return setStatus("URL must start with http:// or https://", "error");

      els.media.gallery.innerHTML = "";
      setLoading(true);
      setStatus('Fetching photos from URL… <span class="spinner"></span>');
      const data = await fetchVehicleMedia({ url });
      showDebug(data.meta, data.images || [], data?.debug?.route || "url");
      renderMediaGallery(data.images || []);
    } catch (e) {
      console.error(e);
      setStatus("Could not fetch from that URL. Try a different one or use VIN last 8.", "error");
    } finally {
      setLoading(false);
    }
  });
}

// Allow pressing Enter inside VIN/Stock inputs to trigger "Grab Photos"
["vinLast8", "stockNum"].forEach((id) => {
  const inp = document.getElementById(id);
  if (!inp) return;
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      els.media.fetchBtn?.click();
    }
  });
});
// Enter key in URL field triggers Use URL
if (els.media.url) {
  els.media.url.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      els.media.fetchUrlBtn?.click();
    }
  });
}

// Export Quote (.json)
if (els.exportBtn) {
  els.exportBtn.addEventListener("click", () => {
    try {
      recomputeTotals();
      const payload = {
        selectedBaseImage: state.selectedBaseImage || null,
        items: state.items || [],
        taxRate: state.taxRate,
        totals: {
          items: (state.items || []).length,
          subtotal: state.subtotal,
          tax: state.tax,
          total: state.total
        },
        finance: state.finance?.enabled
          ? { enabled: true, apr: state.finance.apr, termMonths: state.finance.termMonths, estMonthly: state.finance.monthly }
          : { enabled: false },
        exportedAt: new Date().toISOString()
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
    } catch (e) {
      console.error(e);
      alert("Could not export quote. See console for details.");
    }
  });
}

// Finance toggle (basic)
if (els.financeToggle && els.financeBox) {
  els.financeToggle.addEventListener("change", () => {
    els.financeBox.hidden = !els.financeToggle.checked;
    state.finance.enabled = els.financeToggle.checked;
    recomputeTotals();
    if (els.financeToggle.checked) updatePayment();
  });
  ["input", "change"].forEach((evt) => {
    els.apr?.addEventListener(evt, () => {
      state.finance.apr = Number(els.apr.value || 0);
      updatePayment();
    });
    els.term?.addEventListener(evt, () => {
      state.finance.termMonths = Number(els.term.value || 0);
      updatePayment();
    });
    els.down?.addEventListener(evt, () => {
      updatePayment();
    });
  });
}

function updatePayment() {
  recomputeTotals();
  const down = Number(els.down?.value || 0);
  const financed = Math.max(0, state.total - down);
  const r = state.finance.apr / 100 / 12;
  const n = state.finance.termMonths;
  const m = r ? (financed * r) / (1 - Math.pow(1 + r, -n)) : financed / Math.max(1, n);
  state.finance.monthly = +m.toFixed(2);
  if (els.estPayment) els.estPayment.textContent = `$${state.finance.monthly.toFixed(2)}/mo`;
}

// Footer year + initial totals
if (els.yearSpan) els.yearSpan.textContent = new Date().getFullYear();
recomputeTotals();

/* minimal spinner + status colors in case CSS missing */
(function ensureSpinnerCSS() {
  const style = document.createElement("style");
  style.textContent = `
    .spinner{display:inline-block;width:16px;height:16px;border-radius:50%;border:2px solid #4a9;border-top-color:transparent;animation:spin .8s linear infinite;vertical-align:middle;margin-left:6px}
    @keyframes spin{to{transform:rotate(360deg)}}
    .error{color:#ff6b6b}.success{color:#67e8f9}
    .is-loading{opacity:.7;pointer-events:none}
  `;
  document.head.appendChild(style);
})();
