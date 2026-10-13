# Suggested Styles validation status — 2026-10-12

This file records the release gates for the first Suggested Styles implementation. It is intentionally conservative: unchecked items are blockers, not assumed passes.

## Automated gates

- [x] 16-style MakerNote mapping is represented by bounded metadata objects and binary-plist real values.
- [x] Lite / Standard / Pro share one app-level AI quality selection.
- [x] Reference-bank schema requires complete coverage of all 16 Style IDs, binds embeddings to the exact pinned model revision, and strips private source metadata.
- [x] TinyCLIP runtime contract accepts only packaged image-only ONNX graphs with pinned SHA-256 metadata.
- [x] Browser-regression and Pages workflows include the new Suggested Styles test suite.
- [x] Suggested Styles is lazy and fails closed when the semantic-axis bundle or model package is absent; the diagnostic reference bank is not a runtime prerequisite.
- [x] iPhone 16+ HEIC recommendation path is bypassed before model load and the style patcher independently refuses to replace modern native selections.
- [x] Raster Detail runs before style analysis; AI Portrait runs after Styles creation and preserves the selected marker.
- [x] Stored HEIC pixels are canonicalized to display orientation before TinyCLIP analysis.
- [x] Model/runtime cleanup is connected to feature-off, history cleanup and downloaded-tool cleanup.
- [x] CI-equivalent browser regression checks pass: i18n/PWA/module paths, 11 depth/native cases, and the 186-case browser workflow suite with 171 passes, 15 optional private-fixture skips and zero failures.
- [x] Packaged image-only TinyCLIP assets pass `python tools/verify-ai-style-model.py`: WASM INT8 9.1 MiB, WebGPU FP16 16.0 MiB, exact SHA-256 matches, valid 512-dimensional runtime output, and cross-variant cosine agreement 0.998292.
- [x] Production tests verify the packaged ONNX files still match `assets.json` byte lengths and SHA-256 values.
- [x] Build-time semantic-axis generation succeeds for all eight axes; packaged `semantic-axes.json` contains vectors only and is pinned to the same model/revision/512-d embedding contract.
- [x] Real Chrome browser smoke passes scene-aware recommendation on WASM Lite/Standard/Pro and WebGPU Lite/Pro.
- [x] `D:/Downloads/styles-ref` provides one curated native-complete reference for every Style ID; the generated 16-record bank passes schema/model/hash coverage audit.
- [x] Runtime recommendation no longer uses nearest-reference kNN. It uses pinned TinyCLIP semantic axes + deterministic image statistics + a balanced 16-Style profile matrix, with cross-view disagreement and score-margin fallback.

## Reference-corpus audit

`D:/Downloads/styles-ref` now supplies complete all-16 metadata coverage, but coverage and recommendation quality are separate gates:

- `D:/Downloads/styles-ref`: all 16 files are accepted as `native-complete`; every Style ID 1–16 is represented exactly once and matches its curated folder label.
- `D:/Downloads/18pro/iCloud Photos`: IMG_0240 is accepted as a native iPhone 18 capture through its 0x65 capture record plus schema-1 0x54 marker, Style 16 (Bright). IMG_0243 is rejected because its 0x54 marker uses a different schema (`0 = 2`), so it is not silently interpreted as one of the 16 Photographic Styles.
- `D:/Downloads/16pro/iCloud Photos`: 0/4 accepted; these are the already-documented incomplete exports missing the Styles URI, linear thumbnail and delta map.
- `D:/Downloads/16-pro-ref`: 1 accepted native reference, Style 16 (Bright).
- `D:/Downloads/ip-16/iCloud Photos`: 3 accepted native references, all Style 16 (Bright).
- `D:/Downloads/iCloud Photos/iCloud Photos`: 2 accepted complete references, both Style 1 (Standard).
- A recursive uncurated audit of `D:/Downloads` therefore finds only seven metadata-eligible candidates: 2 Standard and 5 Bright. Production admission still requires an explicit curated manifest; the other supplied HEICs are incomplete, legacy, or use an incompatible marker schema.
- `tests/private-fixtures` contains many generated/research derivatives. A mechanical scan sees only Style IDs 1, 3, 5 and 16 among iPhone 16+ complete-looking graphs, so it must not be treated as a native training corpus.

No missing Style IDs are synthesized or inferred from filenames. A 16-record development bank is generated from `styles-ref` for metadata calibration and diagnostics only. The 18 metadata-valid Bright captures in `16-pro-ref` are useful structural/runtime holdouts, but they are **not** recommendation ground truth: their embedded Bright marker records the camera's selected/default Style, not evidence that Bright is aesthetically best for those scenes. The new scene-aware decision layer deliberately does not try to reconstruct that capture choice.

## Physical Photos validation

These remain required before enabling Suggested Styles as a production-ready recommendation feature:

- [ ] iPhone 15 HEIC — Suggested Styles only.
- [ ] iPhone 15 HEIC — Suggested Styles + AI Portrait.
- [ ] JPEG/PNG — Suggested Styles only.
- [ ] HDR JPEG — Suggested Styles + Detail.
- [ ] Low-confidence image — Standard fallback.
- [ ] Native iPhone 16+ complete Styles — original selection/payload unchanged.

For each generated recommendation, import into Photos, open Edit, verify the expected Style and Tone/Color/Palette state, change the pads, save, reopen, and edit again. For the Portrait combination, also verify aperture and Portrait Lighting remain editable.

## Production asset gate

`web/vendor/ai-style/reference-bank.json` passes the structural all-16 audit and is retained for calibration/diagnostics, not runtime winner selection. `semantic-axes.json` is generated from the pinned TinyCLIP text tower at build time; runtime ships vectors only. Browser smoke tests pass on WASM for Lite/Standard/Pro and on WebGPU for Lite. Remaining release work is physical Apple Photos validation and subjective tuning against preference-labeled scenes; those are quality/release gates, not missing implementation pieces.
