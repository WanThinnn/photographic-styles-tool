# Editable AI Portrait

The switch is off by default. With it off, processing uses the normal
Styles/Texture pipeline. With it on, depth inference and Portrait export are part
of one visible processing flow. One save/download pair exports Styles, Texture
and AI Portrait together. The browser preview supports tap-to-focus and blur;
changes reuse the same encoded depth, never rerun AI or re-encode the primary.
The intermediate normal result stays hidden while opt-in AI processing runs.
Cancellation or failure publishes that result once as a fallback.

Portrait is initially off. Import the HEIC into Photos, enable Portrait, then
adjust aperture and Portrait Lighting. The preview approximates bokeh; it is not
a pixel-identical preview of Apple's renderer. Focus is stored as a normalized
Focus region and the aperture as SimulatedAperture. Opaque REND focus behavior
and refocusing across arbitrary scenes still need physical-device validation.

Depth Anything V2 Small runs locally through ONNX Runtime WebGPU. Native depth
is preserved without inference. Native Styles are kept byte-exact when adding AI
to a depthless native file. Unavailable WebGPU, cancellation or failure leaves
the normal result available. Switching off restores it. Inference has a two-minute
deadline; full-resolution decode surfaces are released before model allocation.

The capture-template exporter follows accepted V11/V12/V18/V20 device experiments.
It preserves this photo's compressed primary/HDR/thumbnail/delta payloads and
Texture/face masks. It never bakes blur into the primary or converts HDR to SDR.
Grid item slots are extended to fit the input, including 24 MP native captures
with 45 primary, 48 delta and 15 HDR tiles; tile payloads and properties stay exact.
The reference calibration and REND are compatibility estimates, not physical
camera measurements. The template contains metadata only: no photo bitstreams,
GPS, source dates, capture time or UUIDs. Numeric capture/Styles coefficients are
still reference estimates. Colour strength remains a separate unresolved issue.

The local `tools/build-portrait-template.mjs` build tool extracts sanitized
metadata from a developer-supplied reference; no private photo is deployed.
`tests/web/ai-portrait-export.mjs` checks geometry, payload preservation,
Texture/Styles/depth, native Styles retention and public-template privacy.
Graph checks do not prove Photos controls across every device or photo.

Run `node tools/download-ai-portrait.mjs` to download/verify pinned assets.
The initial download is approximately 120 MB; model/runtime binaries are ignored
by Git and fetched/verified by Pages CI. They are not installed with the PWA shell.
Depth Anything V2 Small is Apache-2.0 and ONNX Runtime is MIT; both licenses ship
with the assets. The model input has a maximum edge of 518 (multiples of 14),
and relative depth is resampled to the photo's aspect ratio with maximum edge 768.
No image is sent to a server. Safari/device memory and latency vary.
