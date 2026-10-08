// Check decode.js against the REAL libheif bundle, not a stand-in.
//
//   node tests/web/libheif-api.mjs
//
// The browser build once called `new libheif.HeifDecoder()` on the global left by
// the <script> tag. That global is a lazy factory, not the module, so every photo
// failed. Mocks cannot catch that — only the real bundle can.
//
// Downloads the bundle on first run and caches it next to this file.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createContext, runInContext } from "node:vm";

const HERE = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const ROOT = new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

// Keep in step with LIBHEIF_URL in web/src/decode.js.
const decodeSrc = readFileSync(`${ROOT}web/src/decode.js`, "utf8");
const URL_IN_USE = decodeSrc.match(/const LIBHEIF_URL = "([^"]+)"/)?.[1];
if (!URL_IN_USE) { console.log("could not find LIBHEIF_URL in web/src/decode.js"); process.exit(1); }

mkdirSync(`${HERE}.cache`, { recursive: true });
const cached = `${HERE}.cache/${URL_IN_USE.split("/").pop()}`;
if (!existsSync(cached)) {
  console.log(`  fetching ${URL_IN_USE}`);
  const res = await fetch(URL_IN_USE);
  if (!res.ok) { console.log(`  could not fetch (${res.status}); skipping`); process.exit(0); }
  writeFileSync(cached, Buffer.from(await res.arrayBuffer()));
}

// Emulate a classic <script>: no module/exports/define, so the top-level var
// becomes a global — exactly what the browser ends up with.
// Quiet, but every method must be a real function: emscripten does
// `console.error.bind(console)` during startup.
const quiet = () => {};
const sandbox = {
  console: { log: quiet, error: quiet, warn: quiet, info: quiet, debug: quiet },
  TextDecoder, TextEncoder, performance, setTimeout, clearTimeout, fetch,
};
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
createContext(sandbox);
runInContext(readFileSync(cached, "utf8"), sandbox, { filename: "libheif.js" });

let pass = 0, fail = 0;
const check = (label, cond, extra = "") => {
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${extra ? " - " + extra : ""}`);
  cond ? pass++ : fail++;
};

const raw = sandbox.libheif;
check("a <script> tag leaves a global behind", raw !== undefined, `typeof ${typeof raw}`);
check("the global is NOT the module itself", typeof raw?.HeifDecoder !== "function",
  "this is the trap decode.js has to handle");

// The resolution decode.js performs.
const mod = typeof raw === "function" ? raw() : raw;
const resolved = mod && typeof mod.then === "function" ? await mod : mod;
if (resolved?.ready?.then) await resolved.ready;
check("calling the factory yields HeifDecoder", typeof resolved?.HeifDecoder === "function");
check("native context cleanup is exported", typeof resolved?.heif_context_free === "function");

// Typed arrays must come from the sandbox realm; emscripten uses instanceof.
const intoSandbox = (buf) => {
  const arr = runInContext(`new Uint8Array(${buf.length})`, sandbox);
  arr.set(buf);
  return arr;
};

const sample = `${ROOT}noSmartStyle/IMG_5049.HEIC`;
if (!existsSync(sample)) {
  console.log("\n  no sample photo present; stopped after the API checks");
} else {
  const decoder = new resolved.HeifDecoder();
  const images = decoder.decode(intoSandbox(readFileSync(sample)));
  check("decode() returns an image", Array.isArray(images) && images.length > 0);

  const image = images[0];
  const w = image.get_width(), h = image.get_height();
  check("get_width/get_height report a real size", w > 0 && h > 0, `${w}x${h}`);

  const imageData = runInContext("({})", sandbox);
  imageData.width = w; imageData.height = h;
  imageData.data = runInContext(`new Uint8ClampedArray(${w * h * 4})`, sandbox);
  const out = await new Promise((res, rej) => {
    try { image.display(imageData, (r) => (r ? res(r) : rej(new Error("display returned null")))); }
    catch (e) { rej(e); }
  });
  let lit = 0;
  for (let i = 0; i < out.data.length; i += 4)
    if (out.data[i] || out.data[i + 1] || out.data[i + 2]) lit++;
  check("display() fills in actual pixels", lit > w * h * 0.5, `${lit}/${w * h} non-black`);
}

// v0.6.2: analysis decodes the embedded thumbnail, wrapped by thumbnailHeic(), not the
// 12-24 MP primary. It must decode with the real bundle, in the stored orientation (no irot
// applied), at the thumbnail's size, and look like the full image.
const { thumbnailHeic } = await import("../../web/src/decode.js");
const { discoverHeic, dimensionsForItem, irotAngleForItem } = await import("../../web/src/heif.js");
const decodeRgba = async (bytes) => {
  const t0 = performance.now();
  const image = new resolved.HeifDecoder().decode(intoSandbox(bytes))[0];
  const w = image.get_width(), h = image.get_height();
  const imageData = runInContext("({})", sandbox);
  imageData.width = w; imageData.height = h;
  imageData.data = runInContext(`new Uint8ClampedArray(${w * h * 4})`, sandbox);
  const out = await new Promise((res, rej) => image.display(imageData, (r) => (r ? res(r) : rej(new Error("display")))));
  const mean = [0, 1, 2].map((c) => {
    let s = 0;
    for (let i = c; i < out.data.length; i += 4) s += out.data[i];
    return s / (w * h);
  });
  return { w, h, mean, ms: performance.now() - t0 };
};
for (const rel of ["noSmartStyle/IMG_5037.HEIC", "noSmartStyle/IMG_5049.HEIC"]) {
  const path = `${ROOT}${rel}`;
  if (!existsSync(path)) continue;
  const bytes = new Uint8Array(readFileSync(path));
  const d = discoverHeic(bytes);
  const mini = thumbnailHeic(bytes);
  const label = `photo ${rel.slice(-7, -5)} (irot ${irotAngleForItem(bytes, d.props, d.primary)})`;
  check(`${label}: thumbnail wrapped as a one-item HEIC`, mini instanceof Uint8Array && mini.length < 200000,
    mini ? `${mini.length} bytes` : "null");
  if (!mini) continue;
  const small = await decodeRgba(mini);
  const [tw, th] = dimensionsForItem(d.props, d.thumbnail);
  check(`${label}: decodes at the thumbnail's stored size`, small.w === tw && small.h === th,
    `${small.w}x${small.h} vs ${tw}x${th}`);
  const big = await decodeRgba(bytes);
  const diff = Math.max(...small.mean.map((v, i) => Math.abs(v - big.mean[i])));
  check(`${label}: same average colour as the full image (max ${diff.toFixed(1)}/255)`, diff < 4);
  check(`${label}: much faster (${small.ms.toFixed(0)} ms vs ${big.ms.toFixed(0)} ms full)`,
    small.ms * 5 < big.ms);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
