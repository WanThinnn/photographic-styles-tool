// The app reads patch()'s report after porting (web/app.js). A report missing a field the
// app reads makes every photo show "unsupported", although the port itself succeeded, which
// is what v0.6.2 first did with the photo's own item graph. Run the app's own expressions on
// both graph paths.

import { readFileSync, existsSync } from "node:fs";
import { loadProfile } from "../../web/src/zip.js";
import { patch, profileFor } from "../../web/src/port.js";
import { discoverHeic, auxUriForItem, DEPTH_URI, MATTE_URI_SET } from "../../web/src/heif.js";

const ROOT = new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const index = JSON.parse(readFileSync(`${ROOT}web/profiles/index.json`, "utf8"));
let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  [PASS] ${label}`); }
  else { fail++; console.log(`  [FAIL] ${label} ${detail}`); }
};

// What app.js evaluates on the report, line for line.
function appSummary(report) {
  const bits = [report.decoded ? "matched" : "neutral"];
  if (report.mattes.added.some((m) => m.startsWith("depth"))) bits.push("portrait");
  else if (report.mattes.transplanted.length) bits.push("people");
  if (report.texture !== "off") bits.push("texture");
  return bits;
}

const fixtures = [
  ["noSmartStyle", "IMG_5037"], ["noSmartStyle", "IMG_5048"],
  ["noSmartStyle-people", "IMG_4995"], ["noSmartStyle-people", "IMG_4999"],
].filter(([dir, name]) => existsSync(`${ROOT}${dir}/${name}.HEIC`));
if (!fixtures.length) console.log("  fixtures absent; skipped");

for (const [dir, name] of fixtures) {
  const bytes = new Uint8Array(readFileSync(`${ROOT}${dir}/${name}.HEIC`));
  const d = discoverHeic(bytes);
  const profile = await loadProfile(new Uint8Array(readFileSync(
    `${ROOT}web/profiles/${index[profileFor(index, d)].file}`)));
  const hasDepth = [...d.infos.keys()].some((i) => auxUriForItem(d.props, i) === DEPTH_URI);
  const hasMattes = [...d.infos.keys()].some((i) => MATTE_URI_SET.has(auxUriForItem(d.props, i)));
  for (const graph of ["auto", "donor"]) {
    const label = `${dir.endsWith("people") ? "portrait" : "photo"} ${name.slice(-2)} (${graph})`;
    let bits;
    try {
      const { report } = await patch(bytes, profile, { sceneStats: "donor", graph });
      bits = appSummary(report);
    } catch (e) {
      check(`${label}: app reads the report`, false, e.message);
      continue;
    }
    check(`${label}: app reads the report (${bits.join(", ")})`, true);
    check(`${label}: Portrait/people shown as the photo has them`,
      bits.includes("portrait") === hasDepth && (hasDepth || bits.includes("people") === hasMattes));
    check(`${label}: Texture/Grain shown`, bits.includes("texture"));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
