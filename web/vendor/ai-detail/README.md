# Local AI Detail models

These models were downloaded into the **user's own local workspace** (not
uploaded to ChatGPT) with:

```sh
node tools/download-ai-detail.mjs
python tools/verify-ai-detail-models.py
```

The download tool streams the pinned Hugging Face revisions to `.partial`
files, verifies the model's SHA-256, then moves the files into place. Repeat
runs validate the existing files instead of downloading them again.
`assets.json` holds hashes and model metadata consumed by ONNX Runtime Web.

| UI tier | Original 1x ONNX family | Local asset | Source |
| --- | --- | --- | --- |
| Lite | SuperScale SPAN | lite.onnx | notaneimu/onnx-image-models |
| Standard | SuperScale RPLKSR-S | standard.onnx | notaneimu/onnx-image-models |
| Pro | Fatality DeBlur | pro.onnx | notaneimu/onnx-image-models |

**Actual local validation:** all three inputs and outputs are RGB float32
NCHW tensors with scale 1×; tested against onnxruntime CPU with a real
synthetic RGB image. This does **not** validate Safari/iPhone WebGPU execution,
image appearance on real photographs, or Apple Photos editability after AI.

**License warning:** OpenModelDB lists the original SuperScale SPAN,
SuperScale RPLKSR-S and Fatality DeBlur weights as **CC BY-NC-SA 4.0**.
Hugging Face's `notaneimu/onnx-image-models` contains mixed-license ONNX
conversions, and that does not override the original weight terms. Review
attribution, share-alike and non-commercial restrictions before any public
or commercial use. See `docs/AI-DETAIL-MODEL-EVALUATION.md`.
Therefore the large downloaded ONNX files are ignored by Git and CI/CD
must not automatically package them for public Pages releases.

The application's HEIC/native-HDR preservation path remains untouched.
Detail is currently applied only to browser-decoded SDR raster inputs before
the existing generated HEIC/Styles pipeline. Unsupported HDR/HEIC sources
remain unchanged, with a visible explanation.

Use a local HTTP server serving `web/` so model files resolve from
`vendor/ai-detail/`. Opening `index.html` with `file://` bypasses the
normal service worker / cross-origin isolation requirements.
