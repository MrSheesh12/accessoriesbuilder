// netlify/functions/fetch-vehicle-media.js
// Robust vehicle photo fetcher — uses sitemaps first, then page search fallback.
// No external deps; relies on global fetch (Node 18+ on Netlify).

const SITE = "https://www.corwinfordtricities.com";
const IMG_HOST = "vehicle-images.dealerinspire.com";

exports.handler = async (event) => {
  try {
    const params = event.queryStringParameters || {};
    const vinLast8 = (params.vinLast8 || "").trim();
    const stock = (params.stock || "").trim();
    if (!vinLast8 && !stock) return json(400, { error: "Provide vinLast8 or stock" });

    // 1) SITEMAP DISCOVERY
    const sitemapUrls = await discoverSitemaps();
    let vehicleUrl = null;

    for (const mapUrl of sitemapUrls) {
      const xml = await safeText(mapUrl);
      if (!xml) continue;
      const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
      const hit = urls.find(u =>
        (vinLast8 && u.toLowerCase().includes(vinLast8.toLowerCase())) ||
        (stock && u.toLowerCase().includes(stock.toLowerCase()))
      );
      if (hit) { vehicleUrl = hit; break; }
    }

    // 2) FALLBACK — site-wide search pages that often list vehicles w/ stock/VIN
    if (!vehicleUrl) {
      const candidates = [
        `${SITE}/searchnew.aspx?pt=new&search=${encodeURIComponent(vinLast8 || stock)}`,
        `${SITE}/searchused.aspx?pt=used&search=${encodeURIComponent(vinLast8 || stock)}`,
        `${SITE}/inventory/?q=${encodeURIComponent(vinLast8 || stock)}`,
        `${SITE}/cars/?q=${encodeURIComponent(vinLast8 || stock)}`,
      ];
      for (const url of candidates) {
        const html = await safeText(url);
        if (!html) continue;
        const match = html.match(/https?:\/\/[^"']+\/vehicle[^"']+/i);
        if (match) { vehicleUrl = match[0]; break; }
      }
    }

    if (!vehicleUrl) return json(404, { error: "Vehicle not found (sitemaps/search)" });

    // 3) FETCH VEHICLE PAGE
    const html = await safeText(vehicleUrl);
    if (!html) return json(502, { error: "Vehicle page did not load" });

    // Pull VIN / Stock
    const vinMatch = html.match(/\bVIN[:\s]*([A-HJ-NPR-Z0-9]{17})\b/i);
    const fullVin = vinMatch && vinMatch[1];
    const stockMatch = html.match(/\bStock[:\s]*([A-Za-z0-9-]+)\b/i);
    const stockVal = (stockMatch && stockMatch[1]) || stock || null;

    // 4) EXTRACT IMAGES (jpg/webp) hosted on DealerInspire for this VIN (or last8 as fallback)
    let imgRegex;
    if (fullVin) {
      imgRegex = new RegExp(`https?://(?:[^/]*\\.)?${IMG_HOST.replace(/\./g,"\\.")}/[^"']+/${fullVin}[A-Za-z0-9]*/[^"']+\\.(?:jpg|jpeg|webp)`, "gi");
    } else if (vinLast8) {
      imgRegex = new RegExp(`https?://(?:[^/]*\\.)?${IMG_HOST.replace(/\./g,"\\.")}/[^"']+/[A-HJ-NPR-Z0-9]{9}${vinLast8}[A-Za-z0-9]*/[^"']+\\.(?:jpg|jpeg|webp)`, "gi");
    }
    let images = [];
    if (imgRegex) images = Array.from(new Set(html.match(imgRegex) || []));

    // 5) METADATA
    const title = (html.match(/<h1[^>]*>([^<]+)<\/h1>/i) || [])[1] || "Vehicle";
    const ymm = parseYMM(title);

    return json(200, {
      meta: {
        url: vehicleUrl,
        title,
        ...ymm,
        vin: fullVin || null,
        vinLast8: vinLast8 || (fullVin ? fullVin.slice(-8) : null),
        stock: stockVal
      },
      images
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
  const found = [];
  for (const url of guesses) {
    const txt = await safeText(url);
    if (txt) {
      found.push(url);
      // If it's an index, include children inventory maps
      const invs = [...txt.matchAll(/<loc>([^<]+inventory[^<]+?\.xml)<\/loc>/g)].map(m => m[1]);
      found.push(...invs);
    }
  }
  // remove dups
  return Array.from(new Set(found));
}

async function safeText(url) {
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

function json(status, body) {
  return {
    statusCode: status,
    headers: {
      "content-type": "application/json",
      // cache responses for 1 hour to speed up repeat lookups
      "cache-control": "public, max-age=3600"
    },
    body: JSON.stringify(body)
  };
}
