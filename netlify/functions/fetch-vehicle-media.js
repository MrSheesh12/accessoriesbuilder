// netlify/functions/fetch-vehicle-media.js
// Vehicle photo fetcher for corwinfordtricities.com (Node 18 on Netlify, no deps)

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
    const directUrl = (q.url || "").trim(); // manual override for testing

    if (!vinLast8 && !stock && !directUrl) {
      return json(400, { error: "Provide vinLast8, stock, or url" });
    }

    let vehicleUrl = null;
    const tried = [];

    // 0) Manual override (best for testing)
    if (directUrl) {
      vehicleUrl = directUrl;
      tried.push({ method: "directUrl", ok: true, url: vehicleUrl });
    }

    // 1) SITEMAPS (index + inventory variants)
    if (!vehicleUrl) {
      const sitemapUrls = await discoverSitemaps();
      for (const map of sitemapUrls) {
        tried.push({ method: "sitemap", url: map });
        const xml = await safeText(map);
        if (!xml) continue;
        const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
        const hit = urls.find(u =>
          (vinLast8 && u.toLowerCase().includes(vinLast8.toLowerCase())) ||
          (stock && u.toLowerCase().includes(stock.toLowerCase()))
        );
        if (hit) { vehicleUrl = hit; break; }
      }
    }

    // 2) SEARCH PAGES (with query)
    if (!vehicleUrl) {
      const key = encodeURIComponent(vinLast8 || stock);
      const candidates = [
        `${SITE}/searchnew.aspx?pt=new&search=${key}`,
        `${SITE}/searchused.aspx?pt=used&search=${key}`,
        `${SITE}/inventory/?q=${key}`,
        `${SITE}/cars/?q=${key}`,
      ];
      for (const url of candidates) {
        tried.push({ method: "search", url });
        const html = await safeText(url);
        if (!html) continue;

        // First try a vehicle-looking URL straight from the page
        const direct = html.match(/https?:\/\/[^"']+\/vehicle[^"']+/i);
        if (direct) { vehicleUrl = direct[0]; break; }

        // Next: find an anchor near our key (VIN/stock) and capture its href
        const aroundKey = segmentAroundKey(html, (vinLast8 || stock), 5000); // slice of HTML near key
        if (aroundKey) {
          const href = aroundKey.match(/href="([^"]+)"/i);
          if (href) {
            vehicleUrl = absolutize(href[1]);
            break;
          }
        }
      }
    }

    // 3) LISTING PAGES (no query) — scan for VIN/stock near vehicle cards
    if (!vehicleUrl) {
      const lists = [
        `${SITE}/new-vehicles/`,
        `${SITE}/used-vehicles/`,
        `${SITE}/inventory/`,
        `${SITE}/cars/`,
      ];
      for (const url of lists) {
        tried.push({ method: "listing", url });
        const html = await safeText(url);
        if (!html) continue;
        const seg = segmentAroundKey(html, (vinLast8 || stock), 8000);
        if (seg) {
          const href = seg.match(/href="([^"]+\/vehicle[^"]+)"/i) || seg.match(/href="([^"]+)"/i);
          if (href) {
            vehicleUrl = absolutize(href[1]);
            break;
          }
        }
      }
    }

    if (!vehicleUrl) {
      return json(404, {
        error: "Vehicle not found (sitemaps/search/listing)",
        debug: { vinLast8, stock, tried }
      });
    }

    // 4) Fetch vehicle page
    const html = await safeText(vehicleUrl);
    if (!html) {
      return json(502, { error: "Vehicle page did not load (blocked or 4xx/5xx)", debug: { vehicleUrl } });
    }

    // 5) Extract VIN + images
    const vinMatch = html.match(/\bVIN[:\s]*([A-HJ-NPR-Z0-9]{17})\b/i);
    const fullVin = vinMatch && vinMatch[1];

    const imgByVin = fullVin
      ? Array.from(new Set((html.match(new RegExp(`https?://(?:[^/]*\\.)?${IMG_HOST.replace(/\./g,"\\.")}/[^"']+/${fullVin}[A-Za-z0-9]*/[^"']+\\.(?:jpg|jpeg|webp)`, "gi")) || [])))
      : [];

    const imgAny = Array.from(new Set((html.match(new RegExp(`https?://(?:[^/]*\\.)?${IMG_HOST.replace(/\./g,"\\.")}/[^"']+\\.(?:jpg|jpeg|webp)`, "gi")) || [])));

    const images = imgByVin.length ? imgByVin : imgAny;

    // Metadata
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
        methodsTried: tried,
        imagesFound: images.length,
        vinImagesFound: imgByVin.length
      }
    });

  } catch (e) {
    return json(500, { error: e.message });
  }
};

/* ---------------- helpers ---------------- */

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
      [...txt.matchAll(/<loc>([^<]+inventory[^<]+?\.xml)<\/loc>/g)]
        .forEach(m => found.add(m[1]));
    }
  }
  return [...found];
}

async function safeText(url) {
  try {
    const res = await fetch(url, { headers: HEADERS, redirect: "follow" });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

function segmentAroundKey(html, key, span = 6000) {
  if (!key) return null;
  const i = html.toLowerCase().indexOf(key.toLowerCase());
  if (i === -1) return null;
  const start = Math.max(0, i - Math.floor(span / 2));
  const end = Math.min(html.length, i + Math.floor(span / 2));
  return html.slice(start, end);
}

function absolutize(href) {
  if (!href) return href;
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith("//")) return `https:${href}`;
  if (href.startsWith("/")) return `${SITE}${href}`;
  return `${SITE}/${href.replace(/^\.?\//, "")}`;
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
