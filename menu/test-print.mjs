/** Headless check: a normal tab prints in place, and a Home Screen app hands the quote to Safari. */
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { decodePrintHash } from "./js/print-handoff.js";
import { quoteTotals } from "./js/quote-math.js";

const root = dirname(fileURLToPath(import.meta.url));
const QUOTE = {
  customerName: "Sam Rivera",
  phone: "509-555-0142",
  vehicle: "2024 F-150 Lariat",
  vehicleTouched: true,
  salesperson: "Landon Alexander",
  number: "Q-20261119",
  lines: [
    {
      id: "rc-bed-mat-rcm671",
      name: "Rough Country Rubber Bed Mat, RC Logo (F-150 5'7\" Bed)",
      description: "",
      tier: "better",
      price: 99.95,
      basePrice: 109.95,
      priceTouched: true,
      qty: 2,
      listPrice: true,
      taxable: true,
      partNumber: "RCM671",
      partTouched: true,
    },
    {
      id: "labor-install",
      name: "Installation labor",
      description: "",
      tier: "",
      price: 150,
      basePrice: 150,
      qty: 1,
      listPrice: false,
      custom: false,
      labor: true,
      taxable: true,
      partNumber: "—",
      partTouched: true,
    },
    {
      id: "labor-detail",
      name: "Detail labor",
      description: "",
      tier: "",
      price: 40,
      basePrice: 40,
      qty: 1,
      listPrice: false,
      custom: false,
      labor: true,
      taxable: false,
      partNumber: "—",
      partTouched: true,
    },
  ],
};

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".webp": "image/webp",
  ".png": "image/png",
};

function serve() {
  let catalogHits = 0;
  let releaseHeld = () => {};
  const held = new Promise((resolve) => {
    releaseHeld = resolve;
  });
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith("/")) path += "index.html";
    const full = join(root, path.replace(/^\/+/, ""));
    if (!full.startsWith(root) || !existsSync(full) || statSync(full).isDirectory()) {
      res.writeHead(404);
      res.end("missing");
      return;
    }
    if (path.includes("catalog") && path.endsWith(".json") && ++catalogHits >= 3) await held;
    res.writeHead(200, { "content-type": TYPES[extname(full)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(readFileSync(full));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, releaseHeld })));
}

async function loadPuppeteer() {
  const candidates = [
    "puppeteer-core",
    "/tmp/print-deps/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js",
  ];
  for (const candidate of candidates) {
    try {
      const href = candidate.startsWith("/") ? pathToFileURL(candidate).href : candidate;
      return await import(href);
    } catch (error) {
      continue;
    }
  }
  throw new Error("puppeteer-core is required for menu/test-print.mjs");
}

function printedSheet() {
  const rows = [...document.querySelectorAll(".quote-table tbody tr")].filter((row) => !row.classList.contains("totals-hold"));
  const qtyOf = (row) => {
    const printed = row.querySelector(".qty-cell .print-only");
    return (printed || row.querySelector("td.num")).textContent.trim();
  };
  return {
    number: document.querySelector(".print-meta span").textContent.trim(),
    who: [...document.querySelectorAll(".print-who dd")].map((node) => node.textContent.trim()),
    rows: rows.map((row) => ({
      name: [...row.querySelectorAll(".line-name")].map((node) => node.textContent.trim()).filter(Boolean).join("|"),
      meta: row.querySelector(".part-line") ? row.querySelector(".part-line").textContent.trim() : "",
      qty: qtyOf(row),
      price: row.querySelector(".price-cell .print-only").textContent.trim(),
      amount: row.querySelector(".line-total").textContent.trim(),
    })),
    totals: [...document.querySelectorAll(".quote-totals p")].map((node) => node.textContent.replace(/\s+/g, " ").trim()),
    hash: location.hash,
    stored: localStorage.getItem("accessory-menu-quote"),
    printed: window.__printed || 0,
    control: document.querySelector("#quote-print").tagName,
  };
}

async function prepare(page, { standalone }) {
  await page.evaluateOnNewDocument((quote, homeScreen) => {
    localStorage.setItem("accessory-menu-quote", JSON.stringify(quote));
    window.__printed = 0;
    window.print = () => {
      window.__printed += 1;
    };
    if (homeScreen) {
      Object.defineProperty(navigator, "standalone", { configurable: true, get: () => true });
    }
  }, QUOTE, standalone);
}

async function main() {
  const failures = [];
  const fail = (message) => failures.push(message);
  const puppeteer = await loadPuppeteer();
  const { server, releaseHeld } = await serve();
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}/#/quote`;
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const normal = await browser.newPage();
    await normal.setViewport({ width: 1200, height: 1600 });
    await prepare(normal, { standalone: false });
    await normal.goto(url, { waitUntil: "networkidle0" });
    await normal.waitForSelector("#quote-print");
    const normalControl = await normal.$eval("#quote-print", (node) => node.tagName);
    if (normalControl !== "BUTTON") fail(`normal print control is ${normalControl}`);
    let strayPopup = false;
    normal.once("popup", () => {
      strayPopup = true;
    });
    await normal.click("#quote-print");
    await normal.waitForFunction(() => window.__printed === 1);
    if (strayPopup) fail("normal mode opened a Safari handoff");

    const home = await browser.newPage();
    await home.setViewport({ width: 1200, height: 1600 });
    await prepare(home, { standalone: true });
    await home.goto(url, { waitUntil: "networkidle0" });
    await home.waitForSelector("#quote-print");
    const homeControl = await home.$eval("#quote-print", (node) => node.tagName);
    if (homeControl !== "A") fail(`standalone print control is ${homeControl}`);
    const sourceSheet = await home.evaluate(printedSheet);
    const popupPromise = new Promise((resolve) => home.once("popup", resolve));
    await home.click("#quote-print");
    const popup = await popupPromise;
    const opened = popup.url();
    await popup.waitForFunction(() => document.readyState !== "loading");
    await popup.evaluate(() => {
      window.__printed = 0;
      window.print = () => {
        window.__printed += 1;
      };
    });
    releaseHeld();
    await popup.waitForFunction(() => {
      const button = document.querySelector("#quote-print");
      return button && window.__printed > 0 && location.hash.startsWith("#/quote");
    }, { timeout: 8000 });
    const popupSheet = await popup.evaluate(printedSheet);
    const homePrinted = await home.evaluate(() => window.__printed || 0);
    if (homePrinted !== 0) fail("standalone mode called window.print");
    if (popupSheet.printed < 1) fail("the Safari tab did not print");
    if (popupSheet.control !== "BUTTON") fail("the Safari tab must keep a Print / Save PDF button");
    if (!popupSheet.hash.startsWith("#/quote")) fail(`print hash was left in place: ${popupSheet.hash}`);
    const sheetOf = (sheet) => JSON.stringify({
      number: sheet.number,
      who: sheet.who,
      rows: sheet.rows,
      totals: sheet.totals,
    });
    if (sheetOf(sourceSheet) !== sheetOf(popupSheet)) {
      fail(`printed sheets differ\nsource ${sheetOf(sourceSheet)}\npopup ${sheetOf(popupSheet)}`);
    }
    const hash = opened.includes("#") ? opened.slice(opened.indexOf("#")) : "";
    const decoded = decodePrintHash(hash);
    if (!decoded || decoded.customerName !== QUOTE.customerName || decoded.number !== QUOTE.number || decoded.lines.length !== 3) {
      fail(`the opened URL did not carry the quote: ${opened}`);
    }
    if (quoteTotals(decoded.lines).total !== quoteTotals(QUOTE.lines).total) fail("handoff totals do not match the quote");
    const stored = JSON.parse(popupSheet.stored || "null");
    if (!stored || stored.customerName !== QUOTE.customerName || stored.number !== QUOTE.number) {
      fail("Safari did not save the handed-off quote");
    }
    ["PRIVATE-COST", "gross", "vendor"].forEach((secret) => {
      if (hash.includes(secret)) fail(`print URL contains ${secret}`);
    });
  } catch (error) {
    fail(error.stack || error.message);
  } finally {
    await browser.close();
    server.close();
  }
  if (failures.length) {
    console.error(`print checks failed (${failures.length}):`);
    console.error(failures.map((item) => `- ${item}`).join("\n"));
    process.exit(1);
  }
  console.log(`ok: normal print stays on the page; standalone handoff total $${quoteTotals(QUOTE.lines).total.toFixed(2)}`);
}

main();
