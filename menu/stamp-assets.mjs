import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const files = [
  "index.html",
  "manifest.webmanifest",
  "js/menu.js",
  "js/copy.js",
  "js/quote-math.js",
];

function commitId() {
  const fromRender = (process.env.RENDER_GIT_COMMIT || "").trim();
  if (fromRender) return fromRender.slice(0, 7);
  return execSync("git rev-parse --short HEAD", { cwd: root, encoding: "utf8" }).trim();
}

const version = process.argv[2] || commitId();
if (!/^[A-Za-z0-9._-]{4,40}$/.test(version) || version === "ASSET_VERSION") {
  throw new Error(`asset version must be a short commit id or a date, got ${version}`);
}

files.forEach((file) => {
  const full = join(root, file);
  const text = readFileSync(full, "utf8");
  const hits = text.match(/\?v=[A-Za-z0-9._-]+/g) || [];
  if (!hits.length) throw new Error(`${file} has no ?v= references to bump`);
  const next = text.replace(/\?v=[A-Za-z0-9._-]+/g, `?v=${version}`);
  writeFileSync(full, next);
});

console.log(`stamped ${version}`);
