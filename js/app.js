/* ---------- Accessories & Packages Builder (app.js) ---------- */
/* Works on Netlify + local `netlify dev`. Includes URL lookup. */

/* ---------- Global state ---------- */
const state = {
  items: [],
  taxRate: 0.089,
  subtotal: 0,
  tax: 0,
  total: 0,
  finance: { enabled: false, apr: 7.49, termMonths: 60, monthly: 0 },
  selectedBaseImage: null
};

/* ---------- Elements ---------- */
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
  exportBtn: document.getElementById("exportQuote")
};

/* ---------- Helpers ---------- */
const API_BASE =
  location.hostname === "localhost"
    ? "http://localhost:8888/.netlify/functions"
    : "/.netlify/functions";

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

function renderMediaGallery(images = []) {
  if (!els.media.gallery) return;
  els.media.gallery.innerHTML = images
    .map(
      (src, i) => `
    <div class="media-thumb" data-src="${src}" title="Use this photo as base">
      <span class="pick">Use</span>
      <img src="${src}" alt="Vehicle photo ${i + 1}">
    </div>`
    )
    .join("");

  els.media.gallery
    .querySelectorAll(".media-thumb")
    .forEach((div) => {
      div.addEventListener("click", () => {
        els.media.gallery
          .querySelectorAll(".media-thumb")
          .forEach((n) => n.classList.remove("active"));
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
}

async function fetchVehicleMedia({ vinLast8, stock, url }) {
  const qs = new URLSearchParams();
  if (vinLast8) qs.set("vinLast8", vinLast8.trim());
  if (stock) qs.set("stock", String(stock).trim());
  if (url) qs.set("url", url.trim());

  const full = `${API_BASE}/fetch-vehicle-media?${qs.toString()}`;
  const res = await fetch(full, { method: "GET" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Function error ${res.status}: ${text || "unknown"}`);
  }
  return res.json();
}

/* ---------- Totals (used by export) ---------- */
function recomputeTotals() {
  const subtotal = (state.items || []).reduce(
    (sum, it) => sum + (Number(it.price) || 0),
    0
  );
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
}

/* ---------- VIN/STOCK fetch ---------- */
if (els.media.fetchBtn) {
  els.media.fetchBtn.addEventListener("click", async () => {
    try {
      const vin8 = (els.media.vinLast8?.value || "").trim();
      const stock = (els.media.stock?.value || "").trim();
      if (!vin8 && !stock) {
        setStatus("Enter last 8 of VIN or Stock #", "error");
        return;
      }
      setStatus('Looking up vehicle… <span class="spinner"></span>');
      const data = await fetchVehicleMedia({ vinLast8: vin8, stock });
      setStatus(
        data?.meta?.title ? `Found: ${data.meta.title}` : "Found vehicle",
        "success"
      );
      showDebug(data.meta, data.images || [], data?.debug?.route);
      renderMediaGallery(data.images || []);
      if (!data.images?.length) {
        setStatus(
          "No images found for this vehicle. Try VIN last 8 (more reliable), a different unit, or paste the vehicle URL.",
          "error"
        );
      }
    } catch (e) {
      console.error(e);
      setStatus(
        "Could not find photos. Check VIN/Stock or try the URL method.",
        "error"
      );
    }
  });
}

/* ---------- URL fetch ---------- */
if (els.media.fetchUrlBtn) {
  els.media.fetchUrlBtn.addEventListener("click", async () => {
    try {
      const url = (els.media.url?.value || "").trim();
      if (!url) {
        setStatus("Paste a vehicle detail URL first.", "error");
        return;
      }
      if (!/^https?:\/\//i.test(url)) {
        setStatus("URL must start with http:// or https://", "error");
        return;
      }
      setStatus('Fetching photos from URL… <span class="spinner"></span>');
      const data = await fetchVehicleMedia({ url });
      setStatus(
        data?.meta?.title ? `Found: ${data.meta.title}` : "Found vehicle",
        "success"
      );
      showDebug(data.meta, data.images || [], data?.debug?.route || "url");
      renderMediaGallery(data.images || []);
      if (!data.images?.length) {
        setStatus(
          "No images were found at that URL. Try a different vehicle page.",
          "error"
        );
      }
    } catch (e) {
      console.error(e);
      setStatus(
        "Could not fetch from that URL. Try a different one or use VIN last 8.",
        "error"
      );
    }
  });
}

/* ---------- Export Quote (.json) ---------- */
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
          ? {
              enabled: true,
              apr: state.finance.apr,
              termMonths: state.finance.termMonths,
              estMonthly: state.finance.monthly
            }
          : { enabled: false },
        exportedAt: new Date().toISOString()
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json"
      });
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

/* ---------- Minimal spinner styles in case CSS missing ---------- */
(function ensureSpinnerCSS() {
  const style = document.createElement("style");
  style.textContent = `
    .spinner { display:inline-block;width:16px;height:16px;border-radius:50%;border:2px solid #4a9;border-top-color:transparent;animation:spin .8s linear infinite;vertical-align:middle;margin-left:6px;}
    @keyframes spin { to { transform: rotate(360deg); } }
    .error { color: #ff6b6b; }
    .success { color: #67e8f9; }
  `;
  document.head.appendChild(style);
})();
