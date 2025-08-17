// netlify/functions/fetch-vehicle-media.js
// Robust vehicle photo fetcher (Netlify, Node 18). No external deps.

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
    if (!vinLast8 && !stock) return json(400, { error: "Provide vinLast8 or stock" });

    // 1) Discover vehicle URL from sitemaps
    const sitemapUrls = await discoverSitemaps();
    let vehicleUrl = null;
    for (const map of sitemapUrls) {
      const xml = await safeText(map);
      if (!xml) continue;
      const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
      const hit = urls.find(u =>
        (vinLast8 && u.toLowerCase().includes(vinLast8.toLowerCase())) ||
        (stock && u.toLowerCase().includes(stock.toLowerCase()))
      );
      if (hit) { vehicleUrl = hit; break; }
    }

    // 2) Fallback: site search pages
    if (!vehicleUrl) {
      const key = encodeURIComponent(vinLast8 || stock);
      const candidates = [
        `${SITE}/searchnew.aspx?pt=new&search=${key}`,
        `${SITE}/searchused.aspx?pt=used&search=${key}`,
        `${SITE}/inventory/?q=${key}`,
        `${SITE}/cars/?q=${key}`,
      ];
      for (const url of candidates) {
        const html = await safeText(url);
        if (!html) continue;
        const m = html.match(/https?:\/\/[^"']+\/vehicle[^"']+/i);
        if (m) { vehicleUrl = m[0]; break; }
      }
    }

    if (!vehicleUrl) return json(404, { error: "Vehicle not found (sitemaps/search)", debug: { vinLast8, stock, sitemapUrls } });

    // 3) Fetch the vehicle detail page
    const html = await safeText(vehicleUrl);
    if (!html) return json(502, { error: "Vehicle page did not load (blocked or 4xx/5xx)", debug: { vehicleUrl } });

    // 4) Extract VIN + images
    const vinMatch = html.match(/\bVIN[:\s]*([A-HJ-NPR-Z0-9]{17})\b/i);
    const fullVin = vinMatch && vinMatch[1];

    // Preferred: images that include the VIN dir
    const imgByVin = fullVin
      ? Array.from(new Set((html.match(new RegExp(`https?://(?:[^/]*\\.)?${IMG_HOST.replace(/\./g,"\\.")}/[^"']+/${fullVin}[A-Za-z0-9]*/[^"']+\\.(?:jpg|jpeg|webp)`, "gi")) || [])))
      : [];

    // Fallback: any DealerInspire images on page (sometimes gallery doesn’t include VIN in the path)
    const imgAny = Array.from(new Set((html.match(new RegExp(`https?://(?:[^/]*\\.)?${IMG_HOST.replace(/\./g,"\\.")}/[^"']+\\.(?:jpg|jpeg|webp)`, "gi")) || [])));

    const images = imgByVin.length ? imgByVin : imgAny;

    // Basic meta
    const title = (html.match(/<h1[^>]*>([^<]+)<\/h1>/i) || [])[1] || "Vehicle";
    const ymm = parseYMM(title);

    return json(200, {
      meta: {
        url: vehicleUrl,
        title, ...ymm,
        vin: fullVin || null,
        vinLast8: vinLast8 || (fullVin ? fullVin.slice(-8) : null),
        stock: stock || null
      },
      images,
      debug: {
        sitemapCount: sitemapUrls.length,
        imagesFound: images.length,
        vinImagesFound: imgByVin.length,
      }
    });
  } catch (e) {
    return json(500, { error: e.message });
  }
};

function parseYMM(title) {
  const m = title.match(/(\d{4})\s+([A-Za-z0-9\-]+)\s+([A-Za-z0-9\-]+)\s*(.*)?/);
  if (!m) return {};
  return { year: m[1], make: m[2], model: m[3], trim: (m[4]||"").trim() };
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
      [...txt.matchAll(/<loc>([^<]+inventory[^<]+?\.xml)<\/loc>/g)].forEach(m => found.add(m[1]));
    }
  }
  return [...found];
}

async function safeText(url) {
  try {
    const res = await fetch(url, { headers: HEADERS, redirect: "follow" });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
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
