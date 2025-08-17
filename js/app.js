/* Accessories Builder v5 – Plain JS
 * Key improvements:
 * - Central CONFIG for tax, items, and packages
 * - Robust finance toggle (no flakiness)
 * - Category filter + responsive cards
 * - Live totals + monthly payment estimate and inline badge
 * - Export quote as JSON
 */

const CONFIG = {
  taxRate: 0.089, // 8.9%
  shopRatePerHour: 165,
  // Items: price should include labor when noted; you can set laborHours and parts to compute price if preferred.
  items: [
    {
      id: "bakflip_mx4",
      name: "BAKFlip MX4 Tonneau",
      category: "Exterior",
      price: 1245, // parts+labor bundle
      image: "assets/b69bcb44-92b9-4844-8dd0-74d61a90b037.png",
      desc: "Hard-folding cover. Durable, low-profile, secure.",
      tags: ["tonneau","bakflip","truck bed"]
    },
  selectedBaseImage: null,
    {
      id: "retrax_pro_xr",
      name: "Retrax PRO XR",
      category: "Exterior",
      price: 1995,
      image: "assets/retraxpro.png",
      desc: "Premium retractable tonneau with crossbar compatibility.",
      tags: ["tonneau","retrax","premium"]
    },
    {
      id: "front_tint_carbon",
      name: "Front Windows Tint (Carbon)",
      category: "Protection",
      price: 280,
      image: "assets/ab3196d6-2aec-4652-82d8-d951d41320a3.png",
      desc: "Match factory rears. Carbon film. Sublet included.",
      tags: ["tint","carbon"]
    },
    {
      id: "front_tint_ceramic",
      name: "Front Windows Tint (Ceramic)",
      category: "Protection",
      price: 340,
      image: "assets/ab3196d6-2aec-4652-82d8-d951d41320a3.png",
      desc: "Superior heat rejection. Ceramic film. Sublet included.",
      tags: ["tint","ceramic"]
    },
    {
      id: "bedliner_spray",
      name: "Spray-in Bedliner (Short Bed)",
      category: "Protection",
      price: 595,
      image: "assets/spray-in-bedliner.png",
      desc: "In-house bedliner. Tough, UV-stable coating.",
      tags: ["bedliner"]
    },
    {
      id: "bedliner_spray_long",
      name: "Spray-in Bedliner (Long Bed)",
      category: "Protection",
      price: 650,
      image: "assets/spray-in-bedliner.png",
      desc: "In-house bedliner for long bed.",
      tags: ["bedliner"]
    },
    {
      id: "level_12_ton",
      name: "ReadyLIFT Leveling Kit (1/2-ton) + Alignment",
      category: "Suspension",
      price: 895,
      image: "assets/7a6f71e5-6692-47d5-ad75-b35514b60a8c.png",
      desc: "Includes parts, labor & alignment for half-ton.",
      tags: ["level","alignment"]
    },
    {
      id: "level_34_ton",
      name: "ReadyLIFT Leveling Kit (3/4+ ton) + Alignment",
      category: "Suspension",
      price: 995,
      image: "assets/a4cd8cfa-5d0e-48ab-84b6-da4437837d6a.png",
      desc: "Includes parts, labor & alignment for heavy-duty.",
      tags: ["level","alignment"]
    },
    {
      id: "amp_steps",
      name: "AMP PowerSteps",
      category: "Exterior",
      price: 1995,
      image: "assets/amp-powersteps.png",
      desc: "Automatic retracting steps, clean look & function.",
      tags: ["steps","amp"]
    },
    {
      id: "weathertech_front",
      name: "Floor Mats (Front)",
      category: "Interior",
      price: 160,
      image: "assets/floor-mats.png",
      desc: "Custom fit. Easy clean. Popular add-on.",
      tags: ["mats","interior"]
    },
    {
      id: "weathertech_full",
      name: "Floor Mats (Full Set)",
      category: "Interior",
      price: 280,
      image: "assets/floor-mats.png",
      desc: "Front + rear for full coverage.",
      tags: ["mats","interior"]
    },
    {
      id: "bug_deflector",
      name: "Bug Deflector (F-150)",
      category: "Exterior",
      price: 175,
      image: "assets/3c5fc9e4-d6ea-402d-827f-52fb12bfcf40.png",
      desc: "Protect hood & windshield from rock chips & bugs.",
      tags: ["deflector","f-150"]
    },
    {
      id: "subwoofer_upgrade",
      name: "Subwoofer Upgrade (In-house)",
      category: "Audio",
      price: 1200,
      image: "assets/retronotify.png",
      desc: "Clean bass, integrated install. Parts + labor.",
      tags: ["audio","bass"]
    },
    {
      id: "katzkin_basic",
      name: "Katzkin Leather (Basic)",
      category: "Interior",
      price: 2500,
      image: "assets/retronotify.png",
      desc: "Basic leather package installed.",
      tags: ["leather","katzkin"]
    }
  ],
  packages: {
    work_truck: ["bedliner_spray", "weathertech_front", "bug_deflector"],
    overland: ["retrax_pro_xr", "level_34_ton", "amp_steps"],
    family_daily: ["front_tint_ceramic", "weathertech_full", "bug_deflector"],
    platinum_look: ["bakflip_mx4", "front_tint_ceramic", "amp_steps"]
  }
};

// --- State ---
const state = {
  selected: new Set(),
  category: "all",
  finance: {
    enabled: false,
    apr: 8.0,
    term: 72,
    down: 0
  }
};

// --- Elements ---
const els = {
  catalog: document.getElementById('catalog'),
  categorySelect: document.getElementById('categorySelect'),
  summary: {
    itemCount: document.getElementById('itemCount'),
    subtotal: document.getElementById('subtotal'),
    tax: document.getElementById('tax'),
    total: document.getElementById('total'),
    paymentBadge: document.getElementById('paymentBadge'),
  },
  finance: {
    box: document.getElementById('financeBox'),
    toggle: document.getElementById('financeToggle'),
    apr: document.getElementById('apr'),
    term: document.getElementById('term'),
    down: document.getElementById('down'),
    estPayment: document.getElementById('estPayment')
  },
  exportBtn: document.getElementById('exportQuote'),

  media: {
    vinLast8: document.getElementById('vinLast8'),
    stock: document.getElementById('stockNum'),
    fetchBtn: document.getElementById('fetchMedia'),
    status: document.getElementById('mediaStatus'),
    gallery: document.getElementById('mediaGallery')
  },

async function fetchVehicleMedia({ vinLast8, stock }) {
  const qs = new URLSearchParams();
  if (vinLast8) qs.set('vinLast8', vinLast8);
  if (stock) qs.set('stock', stock);
  const url = `/.netlify/functions/fetch-vehicle-media?${qs.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
  return res.json();
}

function renderMediaGallery(images = []) {
  els.media.gallery.innerHTML = images.map((src, i) => `
    <div class="media-thumb" data-src="${src}" title="Use this photo as base">
      <span class="pick">Use</span>
      <img src="${src}" alt="Vehicle photo ${i+1}">
    </div>
  `).join('');

  els.media.gallery.querySelectorAll('.media-thumb').forEach(div => {
    div.addEventListener('click', () => {
      els.media.gallery.querySelectorAll('.media-thumb').forEach(n => n.classList.remove('active'));
      div.classList.add('active');
      state.selectedBaseImage = div.dataset.src;
      const info = document.querySelector('.selected-base') || document.createElement('div');
      info.className = 'selected-base';
      info.textContent = `Base photo selected: ${state.selectedBaseImage}`;
      document.getElementById('vehicle-media').appendChild(info);
    });
  });
}

  year: document.getElementById('year')
};

// Utility
const fmt = n => n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });

function getTotals() {
  const items = CONFIG.items.filter(i => state.selected.has(i.id));
  const subtotal = items.reduce((sum, i) => sum + i.price, 0);
  const tax = subtotal * CONFIG.taxRate;
  const total = subtotal + tax;
  return { items, subtotal, tax, total };
}

function paymentFor(principal, apr, termMonths) {
  // Monthly payment for installment loan: P * r / (1 - (1 + r)^-n)
  const r = (apr / 100) / 12;
  if (termMonths <= 0) return 0;
  if (r === 0) return principal / termMonths;
  return principal * (r / (1 - Math.pow(1 + r, -termMonths)));
}

function renderFilters() {
  const cats = ["all", ...new Set(CONFIG.items.map(i => i.category))];
  els.categorySelect.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join("");
  els.categorySelect.value = state.category;
}

function renderCatalog() {
  const items = CONFIG.items.filter(i => state.category === "all" || i.category === state.category);
  els.catalog.innerHTML = items.map(i => cardHTML(i)).join("");
  // Bind checkbox handlers
  items.forEach(i => {
    const cb = document.querySelector(`#cb_${i.id}`);
    cb.checked = state.selected.has(i.id);
    cb.addEventListener('change', () => {
      if (cb.checked) state.selected.add(i.id);
      else state.selected.delete(i.id);
      updateSummary();
    });
  });
}

function cardHTML(i) {
  return `
  <article class="card">
    <div class="media"><img src="${i.image}" alt="${i.name}"></div>
    <div class="content">
      <h3>${i.name}</h3>
      <div class="badge">${i.category}</div>
      <div class="price">${fmt(i.price)}</div>
      <p class="desc">${i.desc}</p>
      <div class="actions">
        <label class="checkbox">
          <input type="checkbox" id="cb_${i.id}" aria-label="Select ${i.name}">
          Add
        </label>
      </div>
    </div>
  </article>`;
}

function updateSummary() {
  const { items, subtotal, tax, total } = getTotals();
  els.summary.itemCount.textContent = items.length;
  els.summary.subtotal.textContent = fmt(subtotal);
  els.summary.tax.textContent = fmt(tax);
  els.summary.total.textContent = fmt(total);

  // Finance area
  if (state.finance.enabled) {
    const principal = Math.max(0, total - Number(els.finance.down.value || 0));
    const pmt = paymentFor(principal, Number(els.finance.apr.value || 0), Number(els.finance.term.value || 0));
    els.finance.estPayment.textContent = isFinite(pmt) ? `${fmt(pmt)}/mo` : "$0.00/mo";
    els.summary.paymentBadge.textContent = `~ ${fmt(pmt)}/mo`;
    els.summary.paymentBadge.hidden = false;
  } else {
    els.summary.paymentBadge.hidden = true;
  }
}

function applyPackage(key) {
  const list = CONFIG.packages[key] || [];
  list.forEach(id => state.selected.add(id));
  renderCatalog();
  updateSummary();
}

function clearSelections() {
  state.selected.clear();
  renderCatalog();
  updateSummary();
}

function bindEvents() {
  els.categorySelect.addEventListener('change', () => {
    state.category = els.categorySelect.value;
    renderCatalog();
  });

  document.querySelectorAll('.pkg-btn').forEach(btn => {
    const key = btn.dataset.package;
    if (key) btn.addEventListener('click', () => applyPackage(key));
  });

  document.getElementById('clearSelections').addEventListener('click', clearSelections);

  // Finance toggle – robust and idempotent
  els.finance.toggle.addEventListener('change', () => {
    state.finance.enabled = els.finance.toggle.checked;
    els.finance.box.hidden = !state.finance.enabled;
    updateSummary();
  });

  // Finance inputs
  ['apr','term','down'].forEach(k => {
    els.finance[k].addEventListener('input', updateSummary);
  });

  // Vehicle media fetch
  if (els.media.fetchBtn) {
    els.media.fetchBtn.addEventListener('click', async () => {
      try {
        els.media.status.innerHTML = 'Looking up vehicle… <span class="spinner"></span>';
        const vin8 = (els.media.vinLast8.value || "").trim();
        const stock = (els.media.stock.value || "").trim();
        if (!vin8 && !stock) {
          els.media.status.textContent = "Enter last 8 of VIN or Stock #";
          return;
        }
        const data = await fetchVehicleMedia({ vinLast8: vin8, stock });
        els.media.status.innerHTML = data.meta?.title ? `Found: ${data.meta.title}` : 'Found vehicle';
const dbg = document.querySelector('#debugPanel') || document.createElement('pre');
dbg.id = 'debugPanel';
dbg.style.background = '#0f141b';
dbg.style.border = '1px solid var(--border)';
dbg.style.padding = '8px';
dbg.style.borderRadius = '8px';
dbg.style.whiteSpace = 'pre-wrap';
dbg.textContent = JSON.stringify({
  meta: data.meta,
  imageCount: (data.images || []).length
}, null, 2);
document.getElementById('vehicle-media').appendChild(dbg);

        renderMediaGallery(data.images || []);
      } catch (e) {
        els.media.status.innerHTML = '<span class="error">Could not find photos. Check VIN/Stock or try another.</span>';
      }
    });
  }

  // Export quote
  els.exportBtn.addEventListener('click', () => {
    const { items, subtotal, tax, total } = getTotals();
    const data = {
      generatedAt: new Date().toISOString(),
      taxRate: CONFIG.taxRate,
      items: items.map(i => ({ id: i.id, name: i.name, category: i.category, price: i.price })),
      subtotal, tax, total,
      finance: state.finance.enabled ? {
        apr: Number(els.finance.apr.value || 0),
        term: Number(els.finance.term.value || 0),
        down: Number(els.finance.down.value || 0),
        estPayment: document.getElementById('estPayment').textContent
      } : null
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'quote.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

function init() {
  els.year.textContent = new Date().getFullYear();
  renderFilters();
  renderCatalog();
  bindEvents();
  updateSummary();
}

document.addEventListener('DOMContentLoaded', init);
