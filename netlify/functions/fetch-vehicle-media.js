// netlify/functions/fetch-vehicle-media.js
// Paste-URL + VIN/stock lookup with sitemap fallback (works when the vehicle page blocks requests)

const SITE = "https://www.corwinfordtricities.com";
const IMG_HOST = "vehicle-images.dealerinspire.com";

const HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  "cache-control": "no-cache"
};

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    let vinLast8 = (q.vinLast8 || "").trim();
    let stock = (q.stock || "").trim();
    const directUrl = (q.url || "").trim();

    // If the user pasted a URL, try to pull a VIN out of it (many DI URLs include the full VIN)
    let vinFromUrl = null;
    if (directUrl) {
      const m = directUrl.match(/([A-HJ-NPR-Z0-9]{17})/i);
      if (m) vinFromUrl = m[1].toUpperCase();
      if (!vinLast8 && vinFromUrl) vinLast8 = vinFromUrl.slice(-8);
    }

    if (!vinLast8 && !stock && !directUrl) {
      return json(400, { error: "Provide vinLast8, stock, or url" });
    }

    // 0) If we can fetch the page and it returns images, great — otherwise we’ll fallback to sitemaps.
    if (directUrl) {
      const pageTry = await imagesFromVehiclePage(directUrl);
      if (pageTry.ok && pageTry.images.length) {
        return json(200, buildPayload(pageTry.meta, pageTry.images, { route: "directUrl" }));
      }
      // else: fall through to sitemap flow using VIN/stock extracted above
    }

    // 1) Try to discover a vehicle URL from sitemaps/search using VIN/stock
    const discovered = await discoverVehicleUrl({ vinLast8, stock });
    let vehicleUrl = discovered.url;

    // 2) If a page URL is known, try it (it may work on some units)
    if (vehicleUrl) {
      const pageTry2 = await imagesFromVehiclePage(vehicleUrl);
      if (pageTry2.ok && pageTry2.images.length) {
        return json(200, buildPayload(pageTry2.meta, pageTry2.images, { route: "vehiclePage", discovered }));
      }
    }

    // 3) Fallback: **inventory image sitemaps** keyed by VIN/stock (works even when the page blocks)
    const fromMaps = await imagesFromInventorySitemaps({ vinLast8, stock, preferUrl: vehicleUrl || directUrl || null });
    if (fromMaps.images.length) {
      return json(200, buildPayload(
        { url: fromMaps.vehicleUrl || vehicleUrl || directUrl || null, title: fromMaps.title || "Vehicle" },
        fromMaps.images,
        { route: "inventorySitemaps", discovered }
      ));
    }

    return json(404, {
      error: "Vehicle not found or images unavailable",
      debug: { vinLast8, stock, directUrl, discovered, fromMaps }
    });
  } catch (e) {
    return json(500, { error: e.message });
  }
};

/* ---------------- helpers ---------------- */

function buildPayload(meta, images, debug = {}) {
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
  return { year: m[1], make: m[2], model: m[3], trim: (m[4] || "").trim() };
}

async function discoverVehicleUrl({ vinLast8, stock }) {
  const tried = [];
  const sitemaps = await discoverSitemaps();

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
        `https?://(?:[^/]*\\.)?${IMG_HOST.replace(/\./g, "\\.")}/[^"']+/${fullVin}[A-Za-z0-9]*/[^"']+\\.(?:jpg|jpeg|webp)`,
        "gi"
      )) || [])))
    : [];

  const any = Array.from(new Set((html.match(new RegExp(
    `https?://(?:[^/]*\\.)?${IMG_HOST.replace(/\./g, "\\.")}/[^"']+\\.(?:jpg|jpeg|webp)`,
    "gi"
  )) || [])));

  const images = byVin.length ? byVin : any;
  return { ok: true, meta: { url: vehicleUrl, title }, images };
}

async function imagesFromInventorySitemaps({ vinLast8, stock, preferUrl }) {
  const sitemaps = await discoverSitemaps();
  const invMaps = sitemaps.filter(u => /inventory|vehicle/i.test(u));
  const result = { images: [], vehicleUrl: null, title: null, mapsChecked: invMaps.length };

  const keyLower = (vinLast8 || stock || "").toLowerCase();

  // Prefer checking a child sitemap that likely contains our specific URL
  for (const map of invMaps) {
    const xml = await safeText(map);
    if (!xml) continue;

    // Split into <url> blocks
    const blocks = xml.split(/<\/url>/i);
    for (const block of blocks) {
      const loc = (block.match(/<loc>([^<]+)<\/loc>/i) || [])[1];
      if (!loc) continue;

      const blockLc = block.toLowerCase();
      // Match by VIN last8/stock or (as a loose extra) by preferUrl if provided
      const looksLikeMatch =
        (keyLower && blockLc.includes(keyLower)) ||
        (preferUrl && loc.includes(stripTrailingSlash(preferUrl)));

      if (!looksLikeMatch) continue;

      // Collect images from <image:loc>
      const jpgs = [...block.matchAll(/<image:loc>([^<]+?\.jpe?g)<\/image:loc>/gi)].map(m => m[1]);
      const webps = [...block.matchAll(/<image:loc>([^<]+?\.webp)<\/image:loc>/gi)].map(m => m[1]);
      const imgs = Array.from(new Set(jpgs.concat(webps))).filter(u => u.includes(IMG_HOST));

      if (imgs.length) {
        result.images = imgs;
        result.vehicleUrl = loc;
        const title = (block.match(/<image:title>([^<]+)<\/image:title>/i) || [])[1];
        if (title) result.title = title;
        return result;
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
      [...txt.matchAll(/<loc>([^<]+inventory[^<]+?\.xml)<\/loc>/gi)].forEach(m => found.add(m[1]));
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
  } catch {
    return null;
  }
}

function stripTrailingSlash(u) {
  return u ? u.replace(/\/+$/, "") : u;
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
