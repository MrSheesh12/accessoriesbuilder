// netlify/functions/fetch-vehicle-media.js
// Dealer image fetch with sitemap fallback (works even when vehicle page blocks)

const SITE = "https://www.corwinfordtricities.com";
const IMG_HOST = "vehicle-images.dealerinspire.com";
const HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
};

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const vinLast8 = (q.vinLast8 || "").trim();
    const stock = (q.stock || "").trim();
    const directUrl = (q.url || "").trim();

    if (!vinLast8 && !stock && !directUrl) {
      return json(400, { error: "Provide vinLast8, stock, or url" });
    }

    // 0) If a direct URL is provided, try it first
    if (directUrl) {
      const fromPage = await imagesFromVehiclePage(directUrl);
      if (fromPage.ok && fromPage.images.length) {
        return json(200, payload(fromPage.meta, fromPage.images, { route: "directUrl" }));
      }
      // fall through to sitemap strategy
    }

    // 1) Try discover vehicle URL (sitemaps/search)
    const discovered = await discoverVehicleUrl({ vinLast8, stock });
    let vehicleUrl = discovered.url;

    // 2) Try to pull images from the page (may be blocked)
    if (vehicleUrl) {
      const fromPage = await imagesFromVehiclePage(vehicleUrl);
      if (fromPage.ok && fromPage.images.length) {
        return json(200, payload(fromPage.meta, fromPage.images, {
          route: "vehiclePage",
          discovered
        }));
      }
    }

    // 3) **Fallback**: scrape images straight from inventory sitemaps
    const fromSitemaps = await imagesFromInventorySitemaps({ vinLast8, stock });
    if (fromSitemaps.images.length) {
      return json(200, payload(
        { url: vehicleUrl || fromSitemaps.vehicleUrl || null, title: fromSitemaps.title || "Vehicle" },
        fromSitemaps.images,
        { route: "inventorySitemaps", discovered }
      ));
    }

    return json(404, {
      error: "Vehicle not found or images unavailable",
      debug: { discovered, fromSitemaps }
    });
  } catch (e) {
    return json(500, { error: e.message });
  }
};

/* ---------------- internals ---------------- */

function payload(meta, images, debug = {}) {
  const title = meta?.title || "Vehicle";
  const ymm = parseYMM(title);
  return {
    meta: { url: meta?.url || null, title, ...ymm },
    images,
    debug
  };
}

function parseYMM(title) {
  const m = title && title.match(/(\d{4})\s+([A-Za-z0-9\-]+)\s+([A-Za-z0-9\-]+)\s*(.*)?/);
  if (!m) return {};
  return { year: m[1], make: m[2], model: m[3], trim: (m[4]||"").trim() };
}

async function discoverVehicleUrl({ vinLast8, stock }) {
  const tried = [];
  const sitemaps = await discoverSitemaps();

  // Search sitemap URLs for a match
  for (const map of sitemaps) {
    tried.push({ method: "sitemap", map });
    const xml = await safeText(map);
    if (!xml) continue;
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
    const hit = urls.find(u =>
      (vinLast8 && u.toLowerCase().includes(vinLast8.toLowerCase())) ||
      (stock && u.toLowerCase().includes(stock.toLowerCase()))
    );
    if (hit) return { url: hit, tried };
  }

  // Fallback: search pages
  const key = encodeURIComponent(vinLast8 || stock || "");
  const candidates = [
    `${SITE}/searchnew.aspx?pt=new&search=${key}`,
    `${SITE}/searchused.aspx?pt=used&search=${key}`,
    `${SITE}/inventory/?q=${key}`,
    `${SITE}/cars/?q=${key}`
  ];
  for (const url of candidates) {
    tried.push({ method: "search", url });
    const html = await safeText(url);
    if (!html) continue;
    const m = html.match(/https?:\/\/[^"']+\/vehicle[^"']+/i);
    if (m) return { url: m[0], tried };
  }
  return { url: null, tried };
}

async function imagesFromVehiclePage(vehicleUrl) {
  const html = await safeText(vehicleUrl);
  if (!html) return { ok: false, images: [], meta: { url: vehicleUrl } };

  const title = (html.match(/<h1[^>]*>([^<]+)<\/h1>/i) || [])[1] || "Vehicle";
  const vinMatch = html.match(/\bVIN[:\s]*([A-HJ-NPR-Z0-9]{17})\b/i);
  const fullVin = vinMatch && vinMatch[1];

  const byVin = fullVin
    ? Array.from(new Set((html.match(new RegExp(
        `https?://(?:[^/]*\\.)?${IMG_HOST.replace(/\./g,"\\.")}/[^"']+/${fullVin}[A-Za-z0-9]*/[^"']+\\.(?:jpg|jpeg|webp)`,
        "gi"
      )) || [])))
    : [];

  const any = Array.from(new Set((html.match(new RegExp(
      `https?://(?:[^/]*\\.)?${IMG_HOST.replace(/\./g,"\\.")}/[^"']+\\.(?:jpg|jpeg|webp)`,
      "gi"
    )) || [])));

  const images = byVin.length ? byVin : any;
  return { ok: true, meta: { url: vehicleUrl, title }, images };
}

async function imagesFromInventorySitemaps({ vinLast8, stock }) {
  const sitemaps = await discoverSitemaps();
  const invMaps = sitemaps.filter(u => /inventory|vehicle/i.test(u));
  const result = { images: [], vehicleUrl: null, title: null, mapsChecked: invMaps.length };

  for (const map of invMaps) {
    const xml = await safeText(map);
    if (!xml) continue;

    // Entries typically look like:
    // <url><loc>VEHICLE_URL</loc><image:image><image:loc>IMG_URL</image:loc>...</image:image></url>
    const urlBlocks = xml.split(/<\/url>/i);
    for (const block of urlBlocks) {
      const loc = (block.match(/<loc>([^<]+)<\/loc>/i) || [])[1];
      if (!loc) continue;

      const blockLc = block.toLowerCase();
      const matchKey =
        (vinLast8 && blockLc.includes(vinLast8.toLowerCase())) ||
        (stock && blockLc.includes(String(stock).toLowerCase()));
      if (!matchKey) continue;

      // Collect any DealerInspire images for this entry
      const imgs = Array.from(new Set(
        [...block.matchAll(/<image:loc>([^<]+)\.jpe?g<\/image:loc>/gi)].map(m => m[1] + ".jpg")
          .concat([...block.matchAll(/<image:loc>([^<]+)\.webp<\/image:loc>/gi)].map(m => m[1] + ".webp"))
      )).filter(u => u.includes(IMG_HOST));

      if (imgs.length) {
        result.images = imgs;
        result.vehicleUrl = loc;
        // Title sometimes present in <image:title>
        const title = (block.match(/<image:title>([^<]+)<\/image:title>/i) || [])[1];
        if (title) result.title = title;
        return result; // found the vehicle with images—done
      }
    }
  }
  return result;
}

async function discoverSitemaps() {
  const guesses = [
    `${SITE}/sitemap_index.xml`,
    `${SITE}/sitemap.xml`,
    `${SITE}/sitemap-inventory.xml`,
    `${SITE}/sitemap-vehicle.xml`
  ];
  const found = new Set();
  for (const url of guesses) {
    const txt = await safeText(url);
    if (txt) {
      found.add(url);
      // Pull inventory children
      [...txt.matchAll(/<loc>([^<]+inventory[^<]+?\.xml)<\/loc>/gi)].forEach(m => found.add(m[1]));
      // Some sites put vehicle-specific sitemaps under different names:
      [...txt.matchAll(/<loc>([^<]+vehicle[^<]+?\.xml)<\/loc>/gi)].forEach(m => found.add(m[1]));
    }
  }
  return [...found];
}

async function safeText(url) {
  try {
    const r = await fetch(url, { headers: HEADERS, redirect: "follow" });
    if (!r.ok) return null;
    return await r.text();
  } catch { return null; }
}

function json(status, body) {
  return {
    statusCode: status,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=3600"
    },
    body: JSON.stringify(body)
  };
}
