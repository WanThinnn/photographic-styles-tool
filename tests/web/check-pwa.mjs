// Validate the install metadata and make stale/missing offline assets fail CI.
// Run from the repository root with: node tests/web/check-pwa.mjs

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = `${dirname(fileURLToPath(import.meta.url))}/../../`;
const WEB = join(ROOT, "web");
const manifest = JSON.parse(readFileSync(join(WEB, "manifest.webmanifest"), "utf8"));
const html = readFileSync(join(WEB, "index.html"), "utf8");
const app = readFileSync(join(WEB, "app.js"), "utf8");
const worker = readFileSync(join(WEB, "sw.js"), "utf8");
const startup = readFileSync(join(WEB, 'src/ui/startup.js'), 'utf8');
const errors = [];

if (!existsSync(join(WEB, 'LICENSE.txt')) ||
    readFileSync(join(WEB, 'LICENSE.txt'), 'utf8').replaceAll('\r\n','\n')
      .replace(/^Maintained by [^\n]+\n\n/m, '') !==
    readFileSync(join(ROOT, 'LICENSE'), 'utf8').replaceAll('\r\n','\n')) {
  errors.push('browser distribution must retain the complete upstream MIT license');
}

try {
  new Function(worker);
} catch (error) {
  errors.push(`service worker has invalid JavaScript: ${error.message}`);
}

for (const key of ["name", "short_name", "start_url", "scope", "display", "icons"]) {
  if (!manifest[key]) errors.push(`manifest is missing ${key}`);
}
if (manifest.start_url !== "./" || manifest.scope !== "./") {
  errors.push("manifest start_url and scope must remain GitHub Pages subpath-safe");
}
if (!html.includes('rel="manifest" href="manifest.webmanifest"')) {
  errors.push("index.html does not link the web app manifest");
}
if (html.includes("manifest-dark.webmanifest") || html.includes("icon-180-ios-dark.png")) {
  errors.push("install icons must not be frozen to the appearance used when the PWA was installed");
}
if (!startup.includes("serviceWorker?.register('./sw.js'") || !app.includes('await prepareBrowser()')) {
  errors.push("app.js does not register the service worker with a relative URL");
}

function pngInfo(path) {
  const data = readFileSync(path);
  if (data.length < 26 || data.toString("ascii", 1, 4) !== "PNG") return null;
  const chunks=[];let offset=8;
  while(offset+12<=data.length){
    const length=data.readUInt32BE(offset),type=data.toString("ascii",offset+4,offset+8);
    chunks.push(type);offset+=12+length;
  }
  return {width:data.readUInt32BE(16),height:data.readUInt32BE(20),colorType:data[25],chunks};
}
function pngDimensions(path) {
  const info=pngInfo(path);return info?[info.width,info.height]:null;
}

const declaredSizes = new Set((manifest.icons || []).map((icon) => icon.sizes));
for (const required of ["192x192", "512x512"]) {
  if (!declaredSizes.has(required)) errors.push(`manifest is missing a ${required} icon`);
}

for (const icon of manifest.icons || []) {
  const path = join(WEB, icon.src);
  if (!existsSync(path)) {
    errors.push(`missing manifest icon: ${icon.src}`);
    continue;
  }
  const actual = pngDimensions(path),info=pngInfo(path);
  const expected = icon.sizes.split("x").map(Number);
  if (!actual || actual[0] !== expected[0] || actual[1] !== expected[1]) {
    errors.push(`${icon.src} is not a ${icon.sizes} PNG`);
  }
  const purpose=String(icon.purpose||"any");
  if(purpose.includes("maskable")&&info?.colorType!==6)
    errors.push(`${icon.src} must remain full-opaque RGBA for Apple/maskable appearance treatment`);
}
if (!(manifest.icons || []).some(icon=>icon.sizes==='512x512'&&String(icon.purpose||'').includes('maskable'))) {
  errors.push('manifest 512x512 icon must remain maskable');
}
if (!(manifest.icons || []).some(icon=>icon.sizes==='512x512'&&String(icon.purpose||'').split(/\s+/).includes('any'))) {
  errors.push('manifest must retain a separate 512x512 any icon for Windows/desktop');
}

const sha=bytes=>createHash("sha256").update(bytes).digest("hex");

const touchIcon=join(WEB,"icons","apple-touch-icon-v2.png");
if(pngDimensions(touchIcon)?.join("x")!=="180x180")errors.push("apple-touch-icon-v2.png is not a 180x180 PNG");
const touchInfo=pngInfo(touchIcon);
if(touchInfo?.colorType!==6)errors.push("apple-touch-icon-v2.png must remain a 32-bit RGBA PNG");
for(const chunk of ["sRGB","gAMA","pHYs"])if(!touchInfo?.chunks.includes(chunk))
  errors.push(`apple-touch-icon-v2.png is missing Apple-compatible ${chunk} PNG metadata`);
if(!html.includes('rel="apple-touch-icon" sizes="180x180" href="icons/apple-touch-icon-v2.png"'))
  errors.push("index.html must expose the dedicated Apple touch icon so iOS can synthesize Home Screen appearances");
const legacyTouch=join(WEB,"icons","icon-180.png");
if(!existsSync(legacyTouch)||sha(readFileSync(legacyTouch))!==sha(readFileSync(touchIcon)))
  errors.push("legacy icon-180.png must mirror apple-touch-icon-v2.png for compatibility");

const shellMatch = worker.match(/const APP_SHELL = (\[[\s\S]*?\n\]);/);
if (!shellMatch) {
  errors.push("could not read APP_SHELL from sw.js");
} else {
  const shell = JSON.parse(shellMatch[1]);
  for (const relative of shell) {
    if (!relative.startsWith("./")) {
      errors.push(`offline asset is not subpath-safe: ${relative}`);
      continue;
    }
    const path = join(WEB, relative.slice(2));
    if (!existsSync(path)) errors.push(`offline asset does not exist: ${relative}`);
  }

  function walk(directory) {
    return readdirSync(directory).flatMap((name) => {
      const path = join(directory, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
  }

  const shouldCache = new Set(
    walk(WEB)
      // Large opt-in AI assets are fetched lazily, never during PWA installation.
      .filter((path) => !normalize(path).startsWith(normalize(join(WEB, 'vendor'))))
      .filter((path) => /\.(?:html|css|js|json|png|svg|webmanifest|zip)$/.test(path))
      .filter((path) => normalize(path) !== normalize(join(WEB, "sw.js")))
      .map((path) => `./${normalize(path).slice(normalize(WEB).length + 1).replaceAll("\\", "/")}`)
  );
  for (const asset of shouldCache) {
    if (!shell.includes(asset)) errors.push(`runtime asset is not precached: ${asset}`);
  }
}

if (errors.length) {
  console.error(errors.map((error) => `PWA check: ${error}`).join("\n"));
  process.exit(1);
}

console.log("PWA manifest, icons, registration, and offline asset list are consistent.");
