import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const token = "ASSET_VERSION";
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

const version = commitId();
if (!/^[0-9a-f]{7,40}$/i.test(version)) {
  throw new Error(`asset version must be a git commit id, got ${version}`);
}

files.forEach((file) => {
  const full = join(root, file);
  const text = readFileSync(full, "utf8");
  if (!text.includes(token)) throw new Error(`${file} is missing ${token}`);
  writeFileSync(full, text.replaceAll(`${token}`, version));
});

console.log(`stamped ${version}`);
