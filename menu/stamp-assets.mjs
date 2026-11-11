import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const VERSION_RE = /^[A-Za-z0-9._-]{4,40}$/;

function commitId() {
  const fromRender = (process.env.RENDER_GIT_COMMIT || "").trim();
  if (fromRender) return fromRender.slice(0, 7);
  return execSync("git rev-parse --short HEAD", { cwd: root, encoding: "utf8" }).trim();
}

const version = process.argv[2] || commitId();
if (!VERSION_RE.test(version) || version === "ASSET_VERSION") {
  throw new Error(`asset version must be a short commit id or a date, got ${version}`);
}

function sourceModules() {
  return readdirSync(join(root, "js"))
    .filter((name) => /^[a-z0-9-]+\.js$/.test(name))
    .map((name) => `js/${name}`);
}

function versionedPath(file, token) {
  return file.replace(/\.([a-z0-9]+)$/i, `.${token}.$1`);
}

function rewriteModule(text, token) {
  return text
    .replace(/from\s+["']\.\/([A-Za-z0-9_-]+)\.js(?:\?v=[A-Za-z0-9._-]+)?["']/g, (_match, name) => {
      return `from "./${name}.${token}.js"`;
    })
    .replace(/catalog(?:\.[A-Za-z0-9._-]+)?\.json(?:\?v=[A-Za-z0-9._-]+)?/g, `catalog.${token}.json`);
}

function previousVersion(html) {
  const named = html.match(/js\/menu\.([A-Za-z0-9._-]+)\.js/);
  if (named && named[1] !== version) return named[1];
  return "";
}

function rewriteIndex(html, token) {
  return html
    .replace(/css\/menu(?:\.[A-Za-z0-9._-]+)?\.css(?:\?v=[A-Za-z0-9._-]+)?/g, `css/menu.${token}.css`)
    .replace(/js\/menu(?:\.[A-Za-z0-9._-]+)?\.js(?:\?v=[A-Za-z0-9._-]+)?/g, `js/menu.${token}.js`)
    .replace(/manifest(?:\.[A-Za-z0-9._-]+)?\.webmanifest(?:\?v=[A-Za-z0-9._-]+)?/g, `manifest.${token}.webmanifest`);
}

const indexPath = join(root, "index.html");
const previous = previousVersion(readFileSync(indexPath, "utf8"));
const keep = new Set([version, previous].filter(Boolean));

sourceModules().forEach((file) => {
  const source = readFileSync(join(root, file), "utf8");
  writeFileSync(join(root, versionedPath(file, version)), rewriteModule(source, version));
});

writeFileSync(join(root, `css/menu.${version}.css`), readFileSync(join(root, "css/menu.css")));
writeFileSync(join(root, `catalog.${version}.json`), readFileSync(join(root, "catalog.json")));
const manifest = readFileSync(join(root, "manifest.webmanifest"), "utf8").replace(/\?v=[A-Za-z0-9._-]+/g, "");
writeFileSync(join(root, "manifest.webmanifest"), manifest);
writeFileSync(join(root, `manifest.${version}.webmanifest`), manifest);
writeFileSync(indexPath, rewriteIndex(readFileSync(indexPath, "utf8"), version));

function pruneDir(dir) {
  readdirSync(dir).forEach((name) => {
    const match = name.match(/^(?:menu|copy|quote-math|price-label|photos|vehicle-filter|catalog|manifest)\.([A-Za-z0-9._-]{4,40})\.(?:js|css|json|webmanifest)$/);
    if (!match || keep.has(match[1])) return;
    unlinkSync(join(dir, name));
  });
}

pruneDir(root);
pruneDir(join(root, "js"));
pruneDir(join(root, "css"));

const written = [
  `css/menu.${version}.css`,
  `catalog.${version}.json`,
  `manifest.${version}.webmanifest`,
  ...sourceModules().map((file) => versionedPath(file, version)),
];
written.forEach((file) => {
  if (!existsSync(join(root, file))) throw new Error(`missing stamped file ${file}`);
});

console.log(`stamped ${version}`);
