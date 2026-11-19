/** Headless check of the Car and SUV filters, including a saved Car quote. */
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const CAR = [
  "Cargo mat / liner (WeatherTech)",
  "Ceramic Full Tint, sedans and coupes",
  "Ceramic Windshield",
  "Floor liners, 1st and 2nd row (WeatherTech or Husky)",
  "LED light bar",
];
const SUV = [
  "All-terrain tire upgrade",
  "Baja Designs S2 Pro LED Light Pod Pair w/ Harness",
  "Cargo mat / liner (WeatherTech)",
  "Ceramic Full Tint, SUVs and trucks",
  "Ceramic Windshield",
  "Floor liners, 1st and 2nd row (WeatherTech or Husky)",
  "LED light bar",
  "OEM trailer hitch and wiring (Ford)",
  "Rough Country 20 Inch Black Series LED Light Bar (Single Row)",
  "Rough Country 2 Inch Black Series LED Light Pods (Spot, Amber DRL)",
  "Rough Country 50 Inch Black Series LED Light Bar (Dual Row, Amber DRL)",
];
const OFF_CAR = [
  "All-terrain tire upgrade",
  "Baja Designs S2 Pro LED Light Pod Pair w/ Harness",
  "OEM trailer hitch and wiring (Ford)",
  "Rough Country 20 Inch Black Series LED Light Bar (Single Row)",
  "Rough Country 2 Inch Black Series LED Light Pods (Spot, Amber DRL)",
  "Rough Country 50 Inch Black Series LED Light Bar (Dual Row, Amber DRL)",
];

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
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith("/")) path += "index.html";
    const full = join(root, path.replace(/^\/+/, ""));
    if (!full.startsWith(root) || !existsSync(full) || statSync(full).isDirectory()) {
      res.writeHead(404);
      res.end("missing");
      return;
    }
    res.writeHead(200, { "content-type": TYPES[extname(full)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(readFileSync(full));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
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
  throw new Error("puppeteer-core is required for menu/test-vehicle-picks.mjs");
}

async function shownNames(page) {
  await page.waitForSelector(".home-grid");
  const hrefs = await page.$$eval("a.tile", (nodes) => nodes.map((node) => node.getAttribute("href")));
  const names = [];
  for (const href of hrefs) {
    await page.evaluate((next) => {
      location.hash = next;
    }, href);
    await page.waitForSelector(".card h2");
    names.push(...await page.$$eval(".card h2", (nodes) => nodes.map((node) => node.textContent.trim())));
    await page.evaluate(() => {
      location.hash = "#/";
    });
    await page.waitForSelector(".home-grid");
  }
  return names.sort((a, b) => a.localeCompare(b));
}

function sameList(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify([...expected].sort((a, b) => a.localeCompare(b)));
}

async function main() {
  const failures = [];
  const fail = (message) => failures.push(message);
  const puppeteer = await loadPuppeteer();
  const server = await serve();
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}/#/`;
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const found = {};
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 1600 });
    await page.goto(url, { waitUntil: "networkidle0" });
    await page.waitForSelector("#vehicle-filter");
    for (const vehicle of ["Car", "SUV"]) {
      await page.select("#vehicle-filter", vehicle);
      await page.waitForFunction((pick) => document.querySelector("#vehicle-filter").value === pick, {}, vehicle);
      found[vehicle] = await shownNames(page);
    }
    if (!sameList(found.Car, CAR)) fail(`Car shows ${JSON.stringify(found.Car)}`);
    if (!sameList(found.SUV, SUV)) fail(`SUV shows ${JSON.stringify(found.SUV)}`);
    OFF_CAR.forEach((name) => {
      if (found.Car.includes(name)) fail(`${name} is still on Car`);
      if (!found.SUV.includes(name)) fail(`${name} is missing from SUV`);
    });

    const saved = await browser.newPage();
    await saved.evaluateOnNewDocument(() => {
      localStorage.setItem("accessory-menu-vehicle", "Car");
      localStorage.setItem("accessory-menu-quote", JSON.stringify({
        customerName: "Casey",
        phone: "509-555-0199",
        vehicle: "2024 Mustang",
        vehicleTouched: true,
        salesperson: "Landon Alexander",
        number: "Q-20261119",
        lines: [{
          id: "oem-trailer-hitch-and-wiring-ford",
          name: "OEM trailer hitch and wiring (Ford)",
          price: 1100,
          qty: 1,
          taxable: true,
        }],
      }));
    });
    await saved.goto(`http://127.0.0.1:${port}/#/quote`, { waitUntil: "networkidle0" });
    await saved.waitForSelector(".line-name, .message");
    const state = await saved.evaluate(() => ({
      filter: document.querySelector("#vehicle-filter")?.value || "",
      error: document.querySelector(".message")?.textContent || "",
      line: document.querySelector(".line-name")?.textContent || "",
    }));
    if (state.error) fail(`saved Car quote failed to open: ${state.error}`);
    if (state.filter !== "Car") fail(`saved Car filter opened as ${state.filter || "blank"}`);
    if (!state.line.includes("OEM trailer hitch")) fail("saved Car quote dropped the hitch line");
  } catch (error) {
    fail(error.stack || error.message);
  } finally {
    await browser.close();
    server.close();
  }
  if (failures.length) {
    console.error(`vehicle checks failed (${failures.length}):`);
    console.error(failures.map((item) => `- ${item}`).join("\n"));
    process.exit(1);
  }
  console.log("Car");
  found.Car.forEach((name) => console.log(`- ${name}`));
  console.log("SUV");
  found.SUV.forEach((name) => console.log(`- ${name}`));
  console.log("ok: Car and SUV filters match, and a saved Car quote still opens");
}

main();
