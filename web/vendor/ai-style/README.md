# Suggested Styles AI assets

Suggested Styles is intentionally fail-closed. The browser runtime uses a compact image-only TinyCLIP package plus pinned semantic-axis vectors. The text tower and tokenizer are build-time only and are never shipped to the browser.

The runtime requires:

- `assets.json` plus packaged TinyCLIP **image-only** ONNX graphs;
- `semantic-axes.json`, generated in the same 512-dimensional TinyCLIP embedding space.

The runtime does **not** use nearest-reference retrieval to choose a Style. `reference-bank.json` is retained for calibration, corpus audits, and diagnostics only.

These assets are not required for the normal Stylio converter. If the model package or semantic axes are missing/invalid, Suggested Styles reports that recommendation is unavailable and the existing Standard non-native Styles path continues.

## TinyCLIP packaging

Pinned source identity:

- family: TinyCLIP ViT-8M/16
- source revision: `9463a9c508a344c837ffefe9d724f3827bf2dc79`
- runtime input: `pixel_values`, float32 NCHW RGB `[1,3,224,224]`
- runtime output: `image_embeds`, float32 `[1,512]`

The packaged graphs must contain the image encoder only. Tokenizers, text inputs and the text tower are not accepted by the runtime contract.

Build the pinned image-only package with:

```
python tools/fetch-ai-style-model.py
python tools/verify-ai-style-model.py
```

The fetcher verifies the pinned upstream FP32 LFS object, extracts only `pixel_values -> image_embeds`, then derives a compact WASM model by INT8 weight-quantizing transformer MatMul/Gemm nodes and a WebGPU model by converting the isolated image tower to FP16 while keeping float32 I/O. The upstream all-tower INT8 graph is deliberately not shipped because its quantized patch convolution is not portable across the supported ORT CPU/WASM runtimes.

The verifier checks manifest identity, bytes, SHA-256, the single-image-input / 512-dimensional embedding contract, executes both graphs locally, and requires close cosine agreement between the INT8 and FP16 embeddings. `tools/package-ai-style.mjs` remains available when independently verified image-only ONNX graphs are supplied manually.

## Semantic-axis decision layer

`tools/style-axis-prompts.json` defines eight build-time semantic/mood axes: dramatic, airy, energetic, warm/cozy, dreamy, natural, people, and colorful. `tools/build-style-semantic-axes.py` projects those prompt groups through the pinned TinyCLIP text tower and writes normalized positive/negative vectors to `semantic-axes.json`.

Runtime receives vectors only. It combines multi-view semantic-axis scores with deterministic image statistics and the balanced 16-Style profile matrix in `web/src/recommend/style-profile-matrix.js`. Standard/Natural/Neutral/Luminous receive only a small prior; expressive Styles can win when semantic and photographic evidence agree. Cross-view disagreement and a small top-score margin trigger Standard fallback.

## Reference-bank diagnostics

A diagnostic `reference-bank.json` must:

1. use embeddings from the exact packaged TinyCLIP image encoder;
2. contain all 16 validated Photographic Style IDs;
3. contain only curated native reference selections backed by either a complete Styles graph or the validated iPhone 18+ native capture record;
4. contain no original pixels, filenames, EXIF, timestamps, GPS, face metadata or free-form source metadata;
5. pass `style-reference-bank.js` validation.

Production builds require a curated manifest so a generated/reconstructed research file cannot enter the bank merely because it still carries an iPhone camera model. The private manifest is versioned as:

```json
{"version":1,"records":[
  {"file":"Standard/IMG_0001.HEIC","styleId":1},
  {"file":"Vibrant/IMG_0002.HEIC","styleId":8}
]}
```

Each `file` is relative to the private `--input` root. Records default to `"role":"reference"`. Mixed diagnostic corpora may explicitly use `"role":"holdout"`; holdouts are structurally audited and reported but never embedded into the production bank. This keeps known-bad B/C/D variants, incomplete exports, and compatibility probes useful for regression without contaminating retrieval. The builder requires a reference record's native 0x54 Style ID to match the curated `styleId`, requires either a complete native Styles graph or the validated iPhone 18+ 0x65 capture record, rejects incompatible 0x54 schemas, and strips the filename before writing the bank. Directory-only `--audit-only` mode remains available for discovery, but cannot produce a production bank.

Build with `node tools/build-style-reference-bank.mjs --input <private-root> --manifest <private-manifest.json> --output web/vendor/ai-style/reference-bank.json`, then audit with `node tools/audit-style-reference-bank.mjs web/vendor/ai-style/reference-bank.json`.

The reference bank is not a runtime prerequisite. Suggested Styles availability is governed by the packaged image encoder and `semantic-axes.json`; the bank remains useful for validating Style IDs, metadata provenance, and research comparisons.
