# AI Portrait experiment

The switch is off by default. Photos and inference stay in the browser. The
Depth Anything V2 Small model runs with ONNX Runtime WebGPU only: unavailable
WebGPU stops the experiment without falling back to CPU inference.

Sources already containing native Styles or a HEVC depth auxiliary bypass AI.
The existing Styles/Texture export is produced first and remains available even
if AI fails. `port.js`, `graft.js`, `texture.js`, `decode.js` and the raster
converter are unchanged from 693cdc8.

The editor provides blur amount and relative far-to-near focus sliders, plus
tap-to-focus. Both preview and export use a WebGL2 disk-aperture bokeh shader
with linear-light averaging, variable circle of confusion and depth rejection
to reduce foreground colour bleeding. This approximates bokeh, not a physical
lens or a guaranteed accurate subject matte.
The foreground has a wider sharp zone and a smooth, weaker blur capped at 35%
of the background radius. This is an artistic depth response, not calibrated
physical distance. Preview and high-resolution export share that response.

Create HEIC re-decodes the primary photo at the existing raster converter's
maximum supported geometry (48 tiles, roughly 12 MP), renders bokeh there,
then generates a fresh HEIC with Styles and Texture/Grain. It never scales up
the preview to make the export. Changing focus/blur invalidates the generated
file until the user creates it again. Encoding work is serialized with imports.
PNG is used only as an internal lossless bridge; there is no PNG preview download
or unblurred depth-test download. The original Styles export remains in details
as a fallback. Pixel changes require HEVC re-encoding; the AI output is SDR sRGB,
and does not preserve native HDR or enable editable Apple Portrait controls.

The initial model/runtime download is approximately 120 MB. The FP32 network
input keeps the aspect ratio with a maximum edge of 518 and dimensions divisible
by 14, with depth resampled to the original aspect ratio and a
maximum edge of 768 pixels. This is relative depth, not physical distance.
The AI branch samples the primary image independently of the thumbnail decoder
used by Styles statistics. Original JPG/PNG input is decoded directly; HEIC uses
the browser decoder when available and otherwise libheif. Full-resolution decode
surfaces are released before model allocation. No mobile latency claim is made.

Run `node tools/download-ai-portrait.mjs` to download/verify local assets.
`vendor/ai-portrait/assets.json` records an immutable model revision and SHA-256
checksums. Binary model/WASM files are ignored by Git; Pages CI downloads and
verifies them before publishing. They are not precached during PWA installation.
Depth Anything V2 Small is Apache-2.0; model license is distributed locally.
ONNX Runtime is MIT licensed; `ORT-LICENSE.txt` is distributed locally.

Device validation: choose a non-Portrait photo, turn AI on, adjust bokeh and
focus, then create `_Bokeh_Styles.HEIC`. Transfer it as a file and check the
visible bokeh, colours, resolution and Styles editing in Photos. Focus is relative
inverse depth, never metres. Bokeh is rendered into the pixels and cannot be
refocused later in Photos. WebGL2 is required for this renderer.

Browser export validation: `IMG_6256.HEIC` produced a 3024×3024 bokeh HEIC with
Styles, retaining capture date/timezone/subseconds; a separate libheif decode
succeeded. `IMG_0665.PNG` produced 1020×1020, and `IMG_0368.DNG` produced
3000×4000 in displayed orientation, also independently decoded with libheif.
Changing focus removes the stale download; two export requests serialize.
These checks do not validate Photos Styles controls or physical iPhone Safari
memory limits. The source PNG had no capture date to preserve.

Reference findings:

- The supplied iPortraitPhotoMaker sample `IMG_0661.HEIC` has a depth auxiliary,
  an extended HEVC depth descriptor and Apple depth/rendering XMP. The user sees
  the Portrait badge, but still cannot edit aperture or Portrait Lighting.
  Its camera-specific metadata must not be copied onto unrelated AI images.
- [CapturingPhotos](https://github.com/danwood/CapturingPhotos) is a native
  SwiftUI/AVFoundation camera sample. `Camera.swift` captures HEVC photos without
  enabling depth delivery or generating AI depth. `DataModel.swift` saves
  `AVCapturePhoto.fileDataRepresentation()` through its photo collection. It
  does not contain a recipe for adding editable Portrait data to an existing
  image. Native capture and PhotoKit cannot be called directly from Safari
  JavaScript.
- Earlier HEIC depth-test outputs were not recognized as Portrait in the user's
  device test; that export has been removed from the user interface.
