# Local AI Detail models

These models were downloaded into the **user's own local workspace** (not
uploaded to ChatGPT) with:

```sh
node tools/download-ai-detail.mjs
python tools/verify-ai-detail-models.py
```

The download tool streams pinned upstream model revisions to `.partial`
files, verifies each SHA-256, then moves the files into place. Repeat
runs validate the existing files instead of downloading them again.
`assets.json` holds hashes and model metadata consumed by ONNX Runtime Web.

| UI tier | Original 1x ONNX family | Local asset | Source |
| --- | --- | --- | --- |
| Lite | SuperScale SPAN | lite.onnx | notaneimu/onnx-image-models |
| Standard | RT-Focuser 2025 (25% blend in runtime) | standard.onnx | ReaganWu/RT-Focuser |
| Pro | Fatality DeBlur | pro.onnx | notaneimu/onnx-image-models |

**Actual local validation:** all three inputs and outputs are RGB float32
NCHW tensors with scale 1×; tested against onnxruntime CPU with a real
synthetic RGB image. This does **not** validate Safari/iPhone WebGPU execution,
image appearance on real photographs, or Apple Photos editability after AI.

**License warning:** RT-Focuser Standard is MIT-licensed and pinned to its
upstream commit. OpenModelDB lists the original SuperScale SPAN and Fatality
DeBlur weights as **CC BY-NC-SA 4.0**; the Hugging Face ONNX conversions do not
override those original terms. Review attribution, share-alike and
non-commercial restrictions before public/commercial distribution. See
`docs/AI-DETAIL-MODEL-EVALUATION.md`.
Therefore the large downloaded ONNX files are ignored by Git and CI/CD
must not automatically package them for public Pages releases.

The application's HEIC/native-HDR preservation path remains untouched.
Detail is currently applied only to browser-decoded SDR raster inputs before
the existing generated HEIC/Styles pipeline. Unsupported HDR/HEIC sources
remain unchanged, with a visible explanation.

Use a local HTTP server serving `web/` so model files resolve from
`vendor/ai-detail/`. Opening `index.html` with `file://` bypasses the
normal service worker / cross-origin isolation requirements.
