# Photographic Style Port — browser build

The static site published to GitHub Pages. Everything runs in the visitor's browser; photos
are never uploaded.

Maintained by **Elio (aka WanThinnn)**, based on
[Shalielie by nathanatgit](https://github.com/nathanatgit/Shalielie).
The original MIT copyright and permission notice are retained in
[LICENSE.txt](LICENSE.txt); bundled AI components keep their own licenses.

## Source folders

| Folder | Responsibility |
| --- | --- |
| `src/core/` | HEIF boxes, binary plists, EXIF, ZIP and shared downloads |
| `src/styles/` | Styles/Texture metadata, preservation and Soft Skin integration |
| `src/portrait/` | Depth inference, Portrait assembly/export and preview |
| `src/codecs/` | FFmpeg/HEVC encoding, linear thumbnails and libheif lifecycle |
| `src/media/` | Image decoding, HEIC workers, dates, format detection and Live Photo resources |
| `src/ui/` | Startup, translations and result presentation |
| `src/raster/` | JPEG/PNG and other raster imports, including JPEG HDR |
| `src/dng/` | DNG inspection, development and workers |
| `src/vision/` | Face detection, landmarks and skin segmentation |

`app.js` coordinates these modules; `sw.js` lists the current paths for offline
use. Workers and bundled model URLs resolve relative to their owning modules.

## Network and privacy

`countVisit()` in `app.js` is the site's visit-counter request: a fire-and-forget ping to
`abacus.jasoncameron.dev` on load, once per browser session, feeding the visits badge in the
top-level README. It sends no photo data and no identifiers. The counter namespace is public,
so treat the number as a rough signal — anyone who knows the URL can increment it.
Decoder and encoder libraries are also downloaded as described below; photos remain local.

## AI Soft Skin supplementation

Soft Skin supplementation is automatic, with no switch. After Styles/Texture conversion, a file that
already has people entries, skin/person mattes and person instances skips AI. Otherwise,
the browser runs the pinned BlazeFace, Face Landmarker and SelfieMulticlass ONNX models
adapted from `ref/Elio-backup`. The runtime/models total about 34 MB on first use and are
SHA-256 checked and cached. Requests download model files; no photograph is uploaded.
Files already carrying the required data skip vision downloads/inference.

For files still needing supplementation, BlazeFace checks for face candidates first. The
landmark model is loaded only after the detector finds a candidate, and segmentation/refinement
and mask encoding are skipped if no valid face is found. A fresh browser test with a blank
PNG requested only runtime/detector assets, not landmark (~4.9 MB) or segmentation (~16.5 MB)
weights; a subsequent photo with faces still downloaded to the exact device-tested D result.
Absent face metadata is not a reliable negative signal for arbitrary JPEG/PNG/HEIC files, so
this path still requires a lightweight detector and its ONNX runtime. No face differs from no
person (e.g. an obscured face); Soft Skin supplementation here is specifically face-based.

The primary image supplies detection, 478 landmarks and six-class segmentation. The output
contains 76 Apple-layout landmarks per face, skin/person masks, instance references and
per-face statistics. Grayscale mattes use FFmpeg/x265, so a platform HEVC VideoEncoder is
not required for supplementation. ONNX's worker is released before encoding to bound memory;
HEIF insertion and preservation checks run in the existing processing worker. Source-native
masks and native Styles remain untouched; generated masks can replace empty conversion slots.
Model failure/no suitable face keeps the original converted result downloadable and records a
localized explanation. Phone testing on IMG_0783 confirmed Soft Skin is active, but the user
reports weaker smoothing than native iPhone 16/17 photos. Detection is not the smoothing
algorithm: Photos renders the effect from our approximate masks and per-face metadata.
SelfieMulticlass first segments the entire image at 256x256, then runs a square, padded
256x256 crop for each detected face (up to five). Crop confidence is mapped back to its
original position and softly blended inside the face contour, excluding eyes/lips/brows.
The global pass remains the fallback for an empty or failed crop; confidence is not boosted.
Native skin masks skip refinement. Crops run sequentially and transient canvases are released.
SkinSmoothFaceRoughness now uses local-detail residual variance: the user found variant D
smoother than A/B/C/E/F/G on IMG_0783, with Glow/Film working. Eye statistics still use the
previous face-wide variance; all colour fields remain unchanged. This result is device-tested
on one photo, not a reconstruction of Apple's private measurement or proof of native parity.

A private A/B test compared existing HEIC colour metadata against generated neutral gain,
range and high-key values, with identical AI data. The user found both equally too strong.
The neutral override is retained only as a research helper and is not used by the website;
the default HEIC metadata and raster profile were restored. Native Styles are never
recalibrated. Earlier rejected thumbnail/light-map variants were not adopted either.

The private G colour experiment changed only AI person/skin statistics: ToneMapped
blocks use linear-light samples and LinearImage blocks use the existing scene factor 0.166.
On IMG_0754/0762 this convention fits native person/skin percentiles better than the old
encoded/unscaled AI estimates, but the model's masks differ from Apple's, and these two
files are insufficient for calibration. Phone testing found G still too strong, just like
the other variants; E/F (P3-linear thumbnail and neutral-gain combination) turned skin red
at maximum Styles strength. All three colour experiments are rejected for the default
conversion. Styles intensity on reconstructed photos remains unresolved.

A subsequent same-pixel isolation on native IMG_0754 found identity coefficients (Styles
key `1`) increased Styles intensity, while identity tone curve alone did not visibly change
it. This identifies a contributor on that reference, not a general calibrated fix. The
coefficient lattice remains identity in reconstructed outputs until a source-specific
replacement is established; native coefficients always remain preserved. Research-only
IMG_0783 variants now transfer coefficients from two schema-matched native v14 references.
Newer `0x2000f` arrays were excluded from this v14 experiment by a version guard. Copying
an unrelated photo's array into every output is not adopted as a colour correction.

Run `node --test tests/web/soft-skin.mjs tests/web/face-refinement.mjs` for portable
graph/preservation, crop-placement, confidence fallback and lighting-gradient tests. Real model fixtures
can be downloaded with `node tools/download-soft-skin-fixtures.mjs`; private photographs and
test outputs remain under ignored test directories and are never part of the deploy root.

This directory is the deploy root and contains only site files. The Claude Artifact bundle
lives in `../artifact/` and the Node tests in `../tests/web/` — neither is served, and
nothing here depends on either.

## Deploying

`.github/workflows/pages.yml` publishes this directory on every push that touches it. Enable
it once under **Settings → Pages → Source → GitHub Actions**. There is no build step; the
workflow downloads and verifies the pinned AI assets, then checks three things before uploading:

- no `.heic`/`.heif` anywhere under `web/` — a guard against publishing a personal photo
- the two donor profiles are present and non-empty
- the PWA metadata, icon dimensions, registration, and offline asset list are consistent

To serve it locally instead:

```bash
python -m http.server -d web 8000
```

Everything uses relative paths, so a project subpath like `https://user.github.io/repo/`
works without configuration.

## PWA and offline use

The site is installable as a Progressive Web App. `manifest.webmanifest` supplies its app
identity and icons. `sw.js` caches the initial screen before activation, then warms the
complete converter, both donor profiles and first-party JavaScript in the background
after startup. Full offline processing requires that background caching and any needed
encoder/model downloads to finish. Paths stay relative so the same files work at the
root of a domain or under a GitHub Pages project subpath.

The initial HTML contains fallback text. A small bootstrap applies the selected language
before loading processing modules, so slow or failed downloads leave visible labels and
a usable language menu. Photo selection waits for browser setup; decoder initialization
starts on user interaction rather than blocking the initial screen.

The cache uses the network first when available, then falls back to its saved copy. This
keeps the deployed app current without giving up offline use. Encoder and AI downloads
use their own verified asset caches when storage is available. The visit counter is not
cached. Without the HEIC decoder, tone analysis falls back to donor statistics.

After changing runtime files or the manifest, check that the offline asset list is complete:

```bash
node tests/web/check-pwa.mjs
```

## What it ships

| | |
|---|---|
| Processing | Local JavaScript, module workers and WASM; both donor profiles are bundled |
| Encoder | About 32 MB of verified assets, prepared automatically |
| AI | Optional model/runtime downloads; see `AI-PORTRAIT.md` |
| Isolation | HTTPS or localhost; the service worker supplies isolation headers for WASM |

## Downloaded libraries

Measuring a photo's own tone and light needs a HEIC decoder, and browsers other than Safari
do not have one. `src/media/decode.js` loads libheif from jsDelivr when decoding is needed.
FFmpeg encoder assets are prepared during startup; DNG imports also load LibRaw.
AI assets are prepared when AI is enabled. See the source URLs and integrity hashes
in the corresponding loader modules for the pinned versions.

Nothing is uploaded to it; it is a script fetch. If it fails, or if you switch it off, the
port still runs and falls back to donor statistics and flat light maps — which is exactly the
configuration that reproduces the Python output byte for byte, so the fallback is the tested
path rather than a degraded guess.

To remove the dependency entirely, vendor the library and point `LIBHEIF_URL` at it:

```bash
npm pack libheif-js && tar -xzf libheif-js-*.tgz
cp package/libheif/libheif.js package/libheif/libheif.wasm web/vendor/
```

## When the HEVC encoder is needed

The Python tool re-encodes the linearthumbnail as 10-bit Main10 HEVC with ffmpeg. Browsers
have no dependable HEVC encoder, so a faithful port would have had to ship ffmpeg.wasm at
25–30 MB.

Reusing the photo's own embedded thumbnail as the linearthumbnail was validated on-device,
so ordinary HEIC ports use it when present. Missing thumbnails and raster imports use the
optional encoder. Its verified assets are prepared automatically after browser setup and
cached when available, without keeping an unused encoder instance in memory.

## iPhone notes

Two iOS behaviours are handled explicitly:

- **Picking from the Photo Library may return a rendered or converted copy.** It can
  omit native Styles, HDR or Portrait editing resources even when the file remains HEIC.
  Prefer an unmodified original from Files when preserving these features. The picker
  accepts supported image/video formats; uploads are identified by their contents.
- **Getting the result back into Photos.** Where the browser supports sharing files, a
  **Save to Photos** button hands the finished `.heic` to the native share sheet, so
  **Save Image** puts it straight in the library. A normal download sits alongside it.

## Editing the copy

The main interface translations are in `src/ui/i18n.js`; AI preview translations are in
`src/portrait/ai-portrait-ui.js`. Vietnamese, English and Simplified Chinese are supported.
Elements with `data-i18n` keys are filled in at load and when the language selector changes.

```bash
python -m http.server -d web 8000   # then edit src/ui/i18n.js and reload
node tests/web/check-i18n.mjs       # after editing
```

The checker catches the two mistakes that are otherwise invisible until someone switches
language: a key missing from a language, and a key `index.html` asks for that
no longer exists.

Adding a language requires matching translation keys in both translation modules and
an option in the language selector. Run the checker after changing the copy.

## Correctness

The browser port is checked against the Python implementation:

```bash
node tests/web/compare.mjs        # the modules this site loads
node tests/web/compare_bundle.mjs # the concatenated artifact bundle
node tests/web/check-pwa.mjs      # manifest, icons, and offline asset coverage
```

```
photo 1: BYTE-IDENTICAL (2431116)
photo 2: BYTE-IDENTICAL (1813693)
photo 3: BYTE-IDENTICAL (1861646)
portrait 1: EQUIVALENT (styles plist repacked, all items match)
portrait 2: EQUIVALENT (styles plist repacked, all items match)
portrait 3: EQUIVALENT (styles plist repacked, all items match)
native 1 add-texture: BYTE-IDENTICAL (3955304)
native 2 add-texture: BYTE-IDENTICAL (1562445)
native 3 add-texture: BYTE-IDENTICAL (2007006)
native 4 add-texture: BYTE-IDENTICAL (2056959)
```

Three are byte-for-byte identical. The other three differ only in how the styles plist is
packed — `plistlib` and this bplist writer lay objects out differently — so that one item is
compared semantically: every key and value matches, including the binary `c`/`d` maps. All
other items are byte-identical.

The fixtures are patched personal photos and are deliberately not in the repository, so the
tests only run once you generate your own:

```bash
python photographic_style_port.py patch IN.HEIC tests/web/ref/NAME_ref.HEIC \
  --linear-thumb reuse-thumbnail --scene-stats donor --light-maps flat
python photographic_style_port.py add-texture Smartstyle/NAME.HEIC tests/web/ref/NAME_addtex_ref.HEIC
```

The four `add-texture` cases cover v0.5's native-photo mode (`src/styles/texture.js`): an iPhone 16/17
style photo gets only the iOS 27 Texture/Grain set, so its output must be byte-identical to
Python's.

## Layout

Instructions, input-format guidance and output notes are collapsed by default using
native HTML `details`/`summary` controls. Processing and download controls stay visible;
each raster result keeps its longer conversion notes behind an expandable summary.

| File | Role |
|---|---|
| `src/core/box.js` | ISO-BMFF box reading and writing |
| `src/core/heif.js` | Item graph: `iloc`/`iinf`/`iref`/`ipma`/`ipco`, discovery, surgery |
| `src/core/bplist.js` | Apple binary plist reader and writer |
| `src/core/exif.js` | MakerNote `0x54` injection, preserving the target's Exif |
| `src/styles/styles.js` | Scene statistics, `c`/`d` light maps, person-mask hint |
| `src/core/zip.js` | Donor profile reader, via `DecompressionStream` |
| `src/styles/port.js` | The patch pipeline |
| `src/styles/texture.js` | iOS 27 Texture/Grain set (texture_styles + 2026 mattes), and native-photo insertion |
| `src/media/decode.js` | Optional libheif decoding, isolated behind one callback |
| `profiles/` | The two donor profiles, exported from the Python build |

`src/styles/port.js` takes the decoder as a callback, so nothing but `decode.js` knows libheif
exists — which is also why `port.js` runs unchanged under Node for the comparison tests.

## Live Photo pairs

Select an original HEIC and its matching MOV from Files, together or in separate selections.
The browser pairs them using the HEIC Apple MakerNote content identifier and the MOV
QuickTime content identifier, and checks for a still-image-time metadata key. Filenames
are not used as proof of pairing. After successful image processing, **Download Live Photo
pair** exports a ZIP containing the processed HEIC, the byte-identical original MOV and
`pair.json`. Processing must preserve the photo's identifier or pair export stops.

Extract the ZIP and import both resources together using a Live Photo-aware importer.
The browser's **Save still photo** button shares only the HEIC; it does not create a paired
Photos asset. Video frames receive no Styles changes. Unsupported HEIC files remain
unsupported even when their MOV is supplied. This feature preserves an existing pair;
it does not turn arbitrary photos and videos into Live Photos.

Run `node --test tests/web/live-photo.mjs` to verify container parsing and pair preservation.
Private HEIC/MOV fixtures are read locally when available and are never bundled into the site.

## JPG, PNG and Android images

The picker and drop area accept JPEG, PNG, WebP, GIF, BMP and AVIF as well as HEIC.
Browser decoding determines format availability (animated images use one frame).
These still images are converted locally into a new `_PhotographicStyle.HEIC` with
Styles and Texture/Grain, without changing the original file. Camera/EXIF metadata
from JPEG/PNG/WebP is preserved where supported; stored orientation is updated to
match the newly encoded pixels. Transparency is flattened onto black.

The raster pipeline under `src/raster/` is adapted from `ref/Elio-backup` and kept
separate from the existing native HEIC processing. It builds neutral auxiliaries
and Styles fields from readable constants; it does not copy another photo's pixels
or face masks. Main tiles use a platform HEVC encoder when available, with the
verified FFmpeg.wasm encoder as a fallback. The independent P3-linear Main10
thumbnail always uses WASM. The same on-demand encoder cache and isolation
requirements described below apply; the first-visit setup performs the required navigation automatically.

Dimensions are preserved within the 48 primary / 12 auxiliary tile budget; larger
SDR photos and extreme panoramas are reduced without stretching. Ordinary raster
input produces SDR and does not invent HDR, Portrait depth or Live Photo motion.
Apple Adaptive HDR JPEGs have a separate route described below. Apple Photos
rendering still needs device verification.

### HDR JPEG input

Apple's MPF JPEG export can contain a separate gain-map image, not just an SDR
JPEG. The previous raster route decoded only the base and created a black neutral
auxiliary; this discarded real HDR in the supplied IDG_20251020_121945_809.JPEG.
The browser now extracts the MPF base/gain images, reads Apple Adaptive HDR or
Adobe/Ultra HDR XMP channel parameters and keeps the source base ICC. Adaptive HDR
also retains the alternate HDR ICC. Adobe metadata accepts scalar and per-channel
RDF values; its HDR output uses extended linear RGB with the base image's primaries
when no alternate ICC is supplied. Both ICC v2 ASCII descriptions and v4 localized
descriptions are recognized for supported sRGB/Display P3 profiles. Raw JPEG decoding
in FFmpeg bypasses browser ICC conversion and HDR tone mapping for these numerical
samples. The base and gain map become separate full-range HEVC tile grids through
lossless x265 encoding of decoded 4:2:0 samples; their original compressed JPEG
bitstreams are not retained. ICC conversion is still used for the display thumbnail
and analysis, not for the main image/gain-map samples.

The output includes the original HDR XMP, an ISO 21496-1 `tmap` payload containing
the source per-channel ranges/gamma/offsets and headrooms, plus a preferred HDR
alternative group. Styles/Exif/thumbnail/auxiliary references include that rendition.
Base and alternate colour primaries must match in the supported sRGB/Display P3
profile forms. JPEG Exif orientation is applied to both sets of planes and normalized
in the output. Recognized unsupported/corrupt HDR (including currently unsupported
ISO-only or other unsupported XMP dialects), unsupported profiles and HDR images over the
48/12 tile budget stop with a localized message; they do not silently export SDR.
HDR images are not reduced to fit the tile budget. This is scoped support, not a
promise to import every JPEG HDR format.

On the real supplied file, desktop Chrome's normal UI exported 3024x4032 HEIC with
12 distinct gain-map tiles, a 142-byte three-channel `tmap`, matching ICC/XMP and
capture date. First-tile base/gain raw Y/U/V readback checked 786,432 samples with
zero mismatches. The output is approximately 8.4 MiB versus the source's 2.5 MiB
because decoded planes are encoded losslessly. The user accepted this output on iPhone
after the requested HDR/Styles/Texture comparison. This validates the supplied case,
not quantitative HDR equivalence or every supported input. Physical Safari conversion
memory/performance still requires validation; the accepted file was generated on desktop.

The newer IDG_20261009_172734_866.jpg uses Adobe per-channel metadata, an ICC v2
Display P3 profile and no alternate ICC. Its real desktop-browser conversion now
preserves the gain map, XMP and three-channel `tmap` with source headroom 3.863412.
Identical repeated source EXIF fields (including Indigo's ColorSpace) are normalized
in the active output IFD; conflicting duplicates remain errors. Original TIFF value
areas remain intact. This case still needs an iPhone HDR appearance check.

The container syntax follows the primary
[libavif tmap writer](https://github.com/AOMediaCodec/libavif/blob/main/src/write.c).
Apple describes HDR gain maps in JPEG and HEIF in
[WWDC24](https://developer.apple.com/videos/play/wwdc2024/10177/).
Adobe metadata interpretation follows the primary
[Ultra HDR image format specification](https://developer.android.com/media/platform/hdr-image-format).
Run `node --test tests/web/jpeg-hdr.mjs tests/web/raster-import.mjs` for extraction,
malformed/unsupported HDR, per-channel metadata, tiled samples and container checks.

Run `node --test tests/web/raster-import.mjs` for container, geometry and colour checks.

With tone matching enabled, raster scene statistics sample the entire photo without
black letterbox margins. Spatial c/d light maps are computed from this photo in
stored orientation using the same formulas as the HEIC route, rather than constant
maps. This corrects analysis mismatches; it does not establish that Apple's Styles
sliders will render identically to a native capture. Compare on an iPhone.

Capture dates, time-zone offsets and fractional seconds in source EXIF are retained.
Each result shows the original capture time when readable; sources without a capture
date are identified instead of assigning a fabricated date. Shared File objects also
use that timestamp when the original specifies a time zone. Browser downloads may
still have a current filesystem creation date, and Safari's Photos import decides the
asset date independently: this web app cannot set PhotoKit's `creationDate` directly.

## HEIC compatibility

An iPhone 16/17 export may retain depth while losing its native Styles resources
and HDR gain map after editing/export. In that state, the browser explains the limitation
before offering **Create new Styles (experimental)**. This per-file warning is only
shown when the camera Model identifies an iPhone 16/17 and native Styles are absent;
older iPhones, other cameras and missing camera metadata do not trigger it.
This action rebuilds Styles; it
cannot recover the selected native style, missing HDR, or guarantee aperture/Portrait
Lighting editing. Choose an unmodified original HEIC from Files, add Texture first, and
then reapply edits in Photos. Files that still contain native Styles use the existing
`add-texture` route and preserve their original image payloads.

Legacy native Styles version 14 without a tone curve need one extra compatibility step:
the app adds a neutral 516-byte curve to fix black Glow/Film rendering and inactive
Soft Skin observed in device testing. It retains every other Styles value, including
the native version, coefficients and statistics; existing curves are unchanged.
HDR, depth, original masks and Exif remain byte-identical. A previously processed file
with Texture and the same missing curve is repaired without duplicate Texture data;
its download is named `_TextureFixed.HEIC`. Other already compatible Texture files
still need no processing. This does not supply missing face regions or semantic masks.

The standard mode requires an HDR gain map and known StyleDeltaMap dimensions. A missing
thumbnail is generated locally using libheif decoding and FFmpeg.wasm x265
Main10 encoding. The official pinned encoder is prepared automatically (about 32 MB),
verified by SHA-256 and cached when storage is available. It requires cross-origin
isolation supplied by the service worker, including on GitHub Pages. On a fresh visit,
photo selection waits for setup and one automatic navigation, so no manual reload or
reselection is required. Conversion waits for unfinished downloads; preparation and
conversion share in-flight asset downloads. Failures stop export rather than substituting
another photo's thumbnail. Primary image tiles, HDR and depth payloads are kept unchanged.

HEIC reading, graph rebuilding, statistics and payload checks run in a module Web Worker.
DOM-based decoding still runs in the page and returns sampled RGB to the worker.
**Clear processing history** is available once processing finishes. It removes result
rows, revokes download URLs, clears Live Photo pairing data, disposes bokeh previews and
releases converter workers. It does not delete downloaded files or originals.
Each completed result can also be removed separately to release its buffers,
Portrait assembly worker, preview GPU resources and download URLs.
Tone matching is automatic when generating Styles; native Styles keep their
original route. If decoding fails, the normal donor-statistics fallback remains.

AI can be enabled before selection or after processing. With AI enabled, the app
finishes Styles, Texture and depth as one visible workflow, shows a tap-to-focus
preview, and offers a single save/download pair for `_Portrait.HEIC`. There is no
second Create HEIC step or separate flattened-bokeh download. Focus/blur changes
reuse the encoded depth and update focus/aperture metadata, without another model
inference or primary re-encode. The preview is illustrative; Portrait starts off.
After importing the file, enable Portrait in Photos to adjust aperture/lighting.
Existing native depth bypasses AI and stays intact. Turning AI off restores the
normal Styles file. Cancellation/failure also leaves that file available. With AI
selected before processing, the intermediate normal file is never published while
Portrait export is running; fallback output appears only after failure/cancellation.

The exporter promotes the accepted capture-graph research branch. Its public
template contains structure, numerical capture parameters, calibration and REND;
it contains no photographic bitstreams, source dates, GPS or capture UUIDs. All
primary pixels, HDR, delta map, thumbnails and Texture/face resources come from
the user's completed file. Its complete Styles payload is also retained, including
generated coefficients and per-photo skin/scene statistics. AI no longer replaces
generated Styles with reference camera values: one-step export follows the same
preservation path as downloading Styles and adding AI after re-upload.
Source camera/date/GPS metadata stays with that file.
Calibration/REND are compatibility estimates, not measured camera calibration or
metric AI depth. The accepted test scenes support aperture/Portrait Lighting;
other device/geometry combinations still need testing. Strong Styles colours
on non-native inputs remain unresolved and colour fitting is paused.
Portrait grids grow beyond the reference template's tile counts when needed.
The reported 24 MP IMG_0945 layout retains all 45 primary, 48 delta and 15 HDR
tiles, their compressed payloads and properties, and the selected native Styles.
Depth inference maps decoded display pixels back to stored coordinates using the
primary's ordered rotation/mirror transform. Preview and tap-to-focus use the
same convention, and the exported depth keeps the primary's transform order.
This corrects mirrored/rotated uploads that looked aligned in the web preview
but supplied differently oriented depth to Photos.

AI inference runs in a WebGPU worker. Stop AI or switch off to terminate active
inference; a two-minute watchdog covers GPU phases separately from streaming
model downloads. Downloads show progress and stop after 30 seconds without data;
the overall opt-in operation has a ten-minute ceiling. The first model download is
about 120 MB and verified/cached independently of UI releases. Input starts at
maximum edge 1036, with 770/518 fallbacks for resource failures. RGB-guided depth
refinement and quantization run in the inference worker; saved depth has maximum
edge 1024. Safari and iOS start at 630 rather than probing 1036/770, with a GPU
fallback to 518 on caught inference or resource errors. Physical-device stability still needs
validation: a process killed under GPU memory pressure cannot run a JavaScript fallback.
Guidance still samples the primary at up to 1024, and inference remains WebGPU.
This improves the data Photos receives, not only the web preview.

The completed conversion encoders are released before GPU inference. On failure,
Details shows the failed step and a short diagnostic while the normal Styles
download remains available. Edited HEICs without an ordinary thumbnail can still
receive Portrait when their Styles graph and linear thumbnail are intact.
Preview shaders/textures are reused, with offscreen GPU suspension.
The compact Portrait toolbar has an accessible circular reset button and an
indeterminate progress icon. Its native aperture range has a decorative tick
ruler, a yellow selection and a short wave around the active drag position.
The displayed ƒ value matches the exported aperture; reset restores ƒ 4.5.
Touch and keyboard remain native, and reduced motion disables the transitions.
Focus changes are debounced and assembled in a separate worker. The one download
pair waits for the latest metadata; rapid edits cannot publish older settings.
No CPU fallback or image upload is used. Superseded baked-bokeh and experimental
depth-only exporters have been removed; the production exporter retains editable depth.

An unknown native Styles schema retains its original additive Texture route,
while AI Portrait and added Soft Skin are skipped with an info message.
Supported Styles payloads retain unknown keys byte-exactly. Compatibility follows
actual file contracts, not a rewritten Software/iOS version; future Photos
versions still require real-file and physical-device validation.

Result headings show the filename above the success dot and short outcome. Expanded details
show camera, dimensions, file size, capture time and available HDR/depth resources.
These resource labels do not guarantee Portrait editing in Photos. Cache storage failures
do not discard valid network responses or prevent online startup. Regression checks run
in CI, including a synthetic native Texture fixture that requires no personal photos.

**Experimental support for SDR and resized HEIC photos** is selected automatically
when the file needs it; there is no checkbox to enable. Native style photos retain
their original route. This mode adds Styles metadata to the original photo graph, with an estimated
StyleDeltaMap size that follows the photo's stored orientation. It does not invent HDR
data, detect people or re-encode the primary image. This route is not validated on iPhone;
a successfully written file is not proof that Photos will offer Styles or render them
correctly. Its outputs are named `_ExperimentalStyle.HEIC`. The photo-graph route also
keeps HDR gain maps stored as a single HEVC item (not only maps stored as tile grids).

Safari sharing a HEIC saves a still image. A ZIP is only a package of Live Photo resources,
not a Photos asset. Creating a Live Photo in Photos requires a native importer that adds
the `.photo` and `.pairedVideo` resources in one PhotoKit creation request. No such native
importer is included in this browser build.

Live Photo stills use the same AI eligibility checks as other HEIC images; MOV
is not required for still Portrait export. Native Styles 131088 (the flag-bearing
v16 variant in the tested IMG_0471 Live Photo and IMG_0932 Bright capture) is
supported without changing its declaration or colour payload. Unknown contracts
remain guarded. Compatibility information appears once in Details. Focus preview
uses a yellow square with mid-edge ticks; it marks the selected point, not an
automatically detected face box. Decode samples are released after each file.

The separate [Shortcuts serverless proposal](../docs/shortcuts-serverless-api.md)
and OpenAPI contract describe Styles/Texture with opt-in Portrait. These are
design artifacts, not a live API; native server codec and GPU inference adapters
still need implementation and parity testing before cloud deployment.
