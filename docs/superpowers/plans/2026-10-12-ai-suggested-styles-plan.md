# AI Suggested Styles — implementation plan

Date: 2026-10-12
Branch: `feature/ai-ml-processing`
Design: `docs/superpowers/specs/2026-10-12-ai-suggested-styles-design.md`

## Delivery strategy

Implement in small testable slices. Keep the production recommendation path disabled unless the packaged reference bank validates all 16 style IDs. This lets the UI, metadata writer, model/runtime, cache lifecycle and tests land safely before a complete bank is available.

No native iPhone 16+ selection mutation is introduced in this plan.

## Task 1 — Make Lite / Standard / Pro a shared AI level

Files:
- `web/app.js`
- `web/index.html`
- `web/src/ui/ai-strings.js`
- `tests/web/ai-feature-controls.mjs`

Changes:
1. Rename the app-level helper from `selectedModel()` to `selectedAiLevel()`.
2. Keep the existing `#depth-model` DOM id and `depth-model` localStorage key for migration compatibility.
3. Continue passing the selected level unchanged to Depth and Detail.
4. Update vi/en/zh model hint copy to describe the shared behavior:
   - Lite = faster.
   - Pro = deeper analysis / finer AI results / better Style suggestions.
   - selected level applies to all enabled AI features.
5. Add a third independent switch `#ai-style-suggest` between Sharpen and GPU settings.
6. Register `style: aiStyleSuggest` in `createAiFeatureControls`.
7. Extend accessibility tests to prove there is still exactly one quality slider and three independent feature switches.

Tests first:
- update `ai-feature-controls.mjs` to expect portrait/detail/style.
- verify master-off clears all three.
- verify no extra model selector exists.

Verification:
- `node --test tests/web/ai-feature-controls.mjs`

## Task 2 — Add the validated 16-style metadata mapping

Files:
- new `web/src/recommend/style-selection.js`
- new `tests/web/style-selection.mjs`

API:
```js
export const STYLE_SELECTIONS
export function styleSelection(id)
export function buildStyleMarker({styleId,tone,color,palette}, template?)
export function validateStyleRecommendation(value)
```

Rules:
1. Store the 16 validated Style ID/name/default tuples from the design.
2. Build an Apple 0x54 bplist by starting from the existing generated Standard marker shape:
   `{0:1,1:tone,2:color,3:palette,4:styleId,5:1,6:4,7:0}`.
3. Preserve bplist real-number types for keys 1/2/3.
4. Reject unsupported IDs, non-finite parameters, and out-of-bound values.
5. Do not alter keys 5/6/7 from the validated generated contract in the non-native path.

Tests:
- all 16 IDs round-trip through bplist parsing.
- Standard and Bright match the already-proven IDs.
- malformed recommendation fails closed.
- exact type checks for real-valued keys.

Verification:
- `node --test tests/web/style-selection.mjs`

## Task 3 — Define the Suggested Styles quality budgets

Files:
- new `web/src/recommend/style-quality.js`
- new `tests/web/style-quality.mjs`

API:
```js
export function styleQuality(level)
```

Budgets:
- Lite: 1 global 224px view, low-cost statistics, small k.
- Standard: 1 global + 4 overlapping local views, full statistics, medium k.
- Pro: global + multi-scale local views up to 9, robust aggregation, larger k.

Rules:
- Pro changes analysis budget only; it must not widen output bounds.
- all levels are deterministic.
- reject unknown levels.

Tests:
- view count monotonic Lite < Standard < Pro.
- k monotonic Lite < Standard < Pro.
- output bounds identical across levels.

Verification:
- `node --test tests/web/style-quality.mjs`

## Task 4 — Add a compact, validated reference-bank format

Files:
- new `web/src/recommend/style-reference-bank.js`
- new `tests/web/style-reference-bank.mjs`
- new `web/vendor/ai-style/reference-bank.json` only when a complete bank exists.

Bank schema:
```json
{
  "version": 1,
  "model": "tinyclip-vit-8m-16-image",
  "revision": "9463a9c508a344c837ffefe9d724f3827bf2dc79",
  "dimensions": 512,
  "records": [
    {
      "embedding": [ ... ],
      "styleId": 1,
      "tone": 0,
      "color": 0,
      "palette": 1,
      "sourceClass": "native-complete"
    }
  ]
}
```

Validation:
1. exact model id and embedding dimensionality.
2. every embedding component finite.
3. non-zero vector; normalize on load.
4. every record has a supported style ID.
5. all 16 style IDs must be represented at least once.
6. reject filenames, EXIF, dates, GPS/location, free-form source metadata and unexpected keys.
7. cap record count and total decoded bytes.

Retrieval:
- cosine similarity over normalized vectors.
- distance-weighted voting by style ID.
- robust weighted median/trimmed mean for Tone/Color/Palette among winning-style neighbors.
- deterministic tie breaker: higher support, then lower style ID only as final deterministic fallback.

Tests:
- malformed dimensions/NaN/zero vectors reject.
- incomplete 15-style bank rejects.
- deterministic vote and tie behavior.
- invalid style IDs reject.

Verification:
- `node --test tests/web/style-reference-bank.mjs`

## Task 5 — Add the TinyCLIP image-only asset contract

Files:
- new `web/src/recommend/style-model.js`
- new `tools/package-ai-style.mjs`
- new `tools/verify-ai-style-model.mjs`
- new `web/vendor/ai-style/assets.json` after packaging
- extend `web/src/core/cache-cleanup.js`
- extend `tests/web/lifecycle.mjs`

Model packaging:
1. Pin one TinyCLIP source revision.
2. Export/package image encoder only.
3. Produce:
   - FP16 ONNX for WebGPU.
   - INT8 ONNX for WASM/CPU.
4. Record URL/local file, byte length, SHA-256, input shape, input name, output name, embedding dimensions, normalization mean/std.
5. Do not package tokenizer or text encoder.

Runtime contract:
- `styleModel(provider)` returns a validated asset config.
- asset manifest validation mirrors `detail-models.js`.
- `clearDownloadedAssets()` recognizes the style model URLs/local vendor prefix.

Tests:
- manifest rejects wrong hash/shape/output dimension.
- cache cleanup removes style assets but leaves preferences/UI shell.

Verification:
- `node --test tests/web/lifecycle.mjs tests/web/style-model.mjs`
- `node tools/verify-ai-style-model.mjs` once packaged assets exist.

Important blocker:
- packaging/downloading the actual model may require a CodexPro session with network/full command permission. If unavailable, land the manifest/runtime contract first and package the pinned asset in a later local step.

## Task 6 — Implement TinyCLIP image inference in a worker

Files:
- new `web/src/recommend/style-inference.js`
- new `web/src/recommend/style-inference-worker.js`
- new `tests/web/style-inference.mjs`

Behavior:
1. Reuse ONNX Runtime Web 1.23.2 asset/runtime patterns.
2. Lazy-create the session only when Suggested Styles is enabled.
3. Select FP16/WebGPU or INT8/WASM from the shared GPU toggle.
4. Preprocess a 224x224 RGB crop exactly to the model manifest.
5. Return a normalized Float32 embedding.
6. Reuse the session across photos.
7. Export `releaseStyleRecommender()` for Clear cache/history teardown.
8. Support AbortSignal and bounded stage timeouts.

Tests:
- preprocessing channel order/normalization.
- normalized output.
- abort before run.
- invalid output shape fails.
- no model download/session creation when feature disabled (mocked runtime).

Verification:
- `node --test tests/web/style-inference.mjs`

## Task 7 — Implement multi-view analysis and deterministic image statistics

Files:
- new `web/src/recommend/style-analysis.js`
- new `tests/web/style-analysis.mjs`

Input:
- decoded display-oriented RGB/canvas.

Analysis:
1. generate global/local crop rectangles from `styleQuality(level)`.
2. compute TinyCLIP embedding per view.
3. aggregate embeddings with normalized mean.
4. compute deterministic statistics from a bounded downsample:
   - luminance percentiles;
   - contrast/interquartile range;
   - shadow/highlight occupancy;
   - mean/median chroma;
   - saturation percentiles;
   - warm/cool tendency;
   - optional face/person occupancy if existing face data is already available without additional model work.
5. estimate local-view disagreement for confidence reduction.

No semantic segmentation is added.

Tests:
- crop geometry stays inside image bounds for portrait/landscape/square/tiny inputs.
- same image gives same stats.
- synthetic dark/bright/warm/cool fixtures produce expected ordering.
- Pro executes more views than Lite.

Verification:
- `node --test tests/web/style-analysis.mjs`

## Task 8 — Implement the recommender

Files:
- new `web/src/recommend/style-recommender.js`
- new `tests/web/style-recommender.mjs`

Pipeline:
1. obtain level budget.
2. get aggregated embedding.
3. query validated reference bank.
4. weighted style vote.
5. estimate Tone/Color/Palette from winning-style neighbors.
6. apply small bounded corrections from image statistics.
7. reduce confidence when local views disagree.
8. apply level-specific confidence threshold.
9. low confidence -> Standard near-neutral fallback.

Output:
```js
{
  styleId,
  styleName,
  tone,
  color,
  palette,
  confidence,
  fallback,
  level
}
```

Constraints:
- no randomness.
- no stronger correction solely because level=Pro.
- clamp to validated metadata bounds.
- errors return/throw a typed recommendation failure that the app can downgrade without stopping conversion.

Tests:
- confident synthetic neighbor cluster selects expected style.
- low margin falls back Standard.
- Pro can improve stability by using more views but cannot exceed bounds.
- same inputs are bit/deterministically equivalent at JS-number level.

Verification:
- `node --test tests/web/style-recommender.mjs`

## Task 9 — Build a private reference-bank generator

Files:
- new `tools/build-style-reference-bank.mjs`
- new `tools/audit-style-reference-bank.mjs`
- optional private manifest under `tests/private-fixtures/AI_Style_References/` (not source photos in public artifacts).

Tool behavior:
1. accept an explicit list/directory of local HEIC/JPEG/PNG references.
2. for HEIC references:
   - require complete native supported Styles graph;
   - extract 0x54 and validate ID/parameters;
   - exclude generated/reconstructed compatibility fixtures.
3. decode source image locally.
4. run the same TinyCLIP preprocessing/inference as production.
5. write only embeddings + style state + coarse sourceClass.
6. strip filename/path and all EXIF/location/capture metadata.
7. audit coverage and per-style counts.

Release gate:
- do not copy bank into `web/vendor/ai-style/reference-bank.json` until all 16 IDs pass validation.
- recommended minimum after the first functional prototype: at least several visually distinct references per style, not one duplicated scene.

Current-data note:
- the repository/private fixtures visibly contain strong Standard/Bright examples, but they do not currently demonstrate broad all-16-style coverage. A complete production bank is therefore a data prerequisite, not something the code should fabricate.

Verification:
- run audit tool; require all 16 IDs and zero rejected records.

## Task 10 — Allow non-native HEIC patching to accept a recommended marker

Files:
- `web/src/styles/port.js`
- `web/src/styles/graft.js` only if needed for clean API shape
- `tests/web/report-shape.mjs`
- new/extended `tests/web/ai-style-export.mjs`

API change:
- add an explicit option such as `opts.styleRecommendation`.
- validate it before any graph mutation.
- only apply it when:
  - target is in the normal non-native Styles construction route;
  - source does not have a complete native iPhone 16+ Styles graph.
- create a derived profile object with `mn54=buildStyleMarker(recommendation)`.
- do not modify profile Styles coefficients/light maps/delta resources based on reference donors.

Report:
- add `report.styleRecommendation={styleId,styleName,tone,color,palette,confidence,level,fallback}`.

Tests:
- recommended 0x54 is written.
- target primary/HDR/depth bytes remain under existing preservation guarantees.
- native 16+ complete Styles input ignores/bypasses recommendation mutation.
- existing Bright/native-preservation tests remain unchanged.

Verification:
- `node --test tests/web/report-shape.mjs tests/web/ai-style-export.mjs tests/web/style-preservation.mjs`

## Task 11 — Allow raster import to accept the same recommendation

Files:
- `web/src/raster/raster-import.js`
- `web/src/raster/generated-profile.js`
- `tests/web/raster-import.mjs`
- `tests/web/jpeg-hdr.mjs`

Changes:
1. extend raster import options with `styleRecommendation`.
2. after generated profile creation, derive `profile.mn54` from the validated recommendation.
3. preserve all existing raster/HDR/detail behavior.
4. do not alter generated Styles coefficients because a style was recommended.
5. expose recommendation in result metadata/report.

Tests:
- JPEG/PNG imports write expected recommended 0x54.
- HDR JPEG keeps recalculated/preserved gain-map behavior.
- detail on/off combinations still work.
- invalid recommendation reverts/fails to Standard without aborting import.

Verification:
- `node --test tests/web/raster-import.mjs tests/web/jpeg-hdr.mjs`

## Task 12 — Orchestrate recommendation before Styles creation

Files:
- `web/app.js`
- `web/src/ui/ai-strings.js`
- `tests/web/ai-feature-controls.mjs`
- new `tests/web/ai-style-orchestration.mjs`

Raster flow:
1. if Suggested Styles enabled, decode/analyze source before calling `importRaster`.
2. pass recommendation into raster import.
3. if recommendation fails, note warning and call raster import with Standard/default state.

HEIC non-native flow:
1. classify native-preservation route first.
2. do not invoke recommender for complete native 16+ Styles.
3. for non-native patch route, use existing decoder/sample path to feed recommender before `patchInWorker`.
4. pass recommendation through worker options.

Combination behavior:
- Detail may run before recommendation when it actually changes pixels, so recommendation describes the pixels that will receive Styles.
- AI Portrait remains after Styles creation and must preserve the recommended marker.
- Suggested Styles can be enabled independently of Detail/Portrait.

Progress strings:
- preparing Style AI;
- analyzing photo;
- Suggested Style applied;
- recommendation unavailable, Standard retained.

Tests:
- disabled feature never imports/downloads recommender modules.
- native complete file never invokes recommender.
- detail+style uses post-detail pixels for recommendation.
- style+portrait final file preserves the recommended marker.

Verification:
- `node --test tests/web/ai-style-orchestration.mjs tests/web/ai-feature-controls.mjs tests/web/ai-portrait-export.mjs`

## Task 13 — Worker transport for HEIC recommendation options

Files:
- `web/src/media/heic-processing.js`
- `web/src/media/heic-worker.js`
- `tests/web/heic-worker.mjs`

Changes:
- ensure `styleRecommendation` is structured-clone safe and passed into `patch()`.
- validate again inside worker boundary before metadata mutation.
- never pass embeddings/reference bank through the HEIC worker; only the small final recommendation record.

Tests:
- valid recommendation crosses worker boundary.
- malformed recommendation is rejected.
- existing operations unaffected.

Verification:
- `node --test tests/web/heic-worker.mjs`

## Task 14 — Cache/service-worker/lifecycle integration

Files:
- `web/src/core/cache-cleanup.js`
- `web/sw.js`
- `web/app.js`
- `tests/web/lifecycle.mjs`
- `tests/web/startup.mjs`

Changes:
1. add new JS modules/reference-bank asset to app shell as appropriate.
2. keep large ONNX assets lazy, not BOOT_SHELL.
3. clear style session on history/cache cleanup.
4. Clear cache removes the recommender ONNX assets.
5. reference bank may remain in the versioned UI cache because it is small and versioned.

Tests:
- first visit with Suggested Styles off does not request TinyCLIP.
- cache cleanup removes TinyCLIP.
- offline UI remains bootable without model.

Verification:
- `node --test tests/web/lifecycle.mjs tests/web/startup.mjs`

## Task 15 — Full regression and device validation package

Automated regression:
- all `tests/web/*.mjs`.
- Python tests if currently part of project CI.
- check service-worker shell references.
- ensure no private reference image/path appears in public files.

Recommended commands:
- `node --test tests/web/*.mjs`
- `python -m pytest` or the repository's existing Python test command.

Physical iPhone validation matrix:
1. iPhone 15 HEIC, Suggested Styles only.
2. iPhone 15 HEIC, Suggested Styles + AI Portrait.
3. raster JPEG/PNG, Suggested Styles only.
4. raster HDR JPEG, Suggested Styles + Detail.
5. low-confidence photo fallback.
6. native iPhone 16 complete Styles control: selection/payload remains untouched.

For each production-style output:
- import into Photos;
- open Edit;
- verify expected Style selected;
- verify Tone/Color/Palette values;
- adjust values and save;
- reopen and edit again;
- for Portrait combination, verify aperture and Portrait Lighting remain editable.

## Implementation order and commit boundaries

Suggested commits:
1. `test/ui: make AI quality level shared with Suggested Styles`
2. `feat(styles): add validated style selection metadata`
3. `feat(ai): add style reference bank and quality policy`
4. `feat(ai): add TinyCLIP image-only inference`
5. `feat(ai): add deterministic style recommender`
6. `feat(tools): add private reference bank builder`
7. `feat(styles): apply recommendations to non-native HEIC and raster`
8. `feat(ui): wire Suggested Styles into processing and lifecycle`
9. `test: add combined style portrait and native bypass regressions`
10. `docs: record device validation results`

Because the current CodexPro server is in `bash=safe` mode, git staging/commits may need to be performed by the user or by restarting CodexPro with a trusted mode that permits those git actions.

## Stop conditions

Do not ship/enable production Suggested Styles if any of these remain true:
- the reference bank does not validate all 16 style IDs;
- the TinyCLIP image-only model asset is not hash-pinned;
- native iPhone 16+ bypass tests fail;
- recommended 0x54 does not survive AI Portrait;
- physical Photos testing does not reopen with the expected editable selection.
