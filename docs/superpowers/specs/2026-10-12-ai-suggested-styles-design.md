# AI Suggested Styles for non-native photos — design

Date: 2026-10-12
Branch: `feature/ai-ml-processing`

## Goal

Add an opt-in **AI Suggested Styles** feature for photos that are not complete native iPhone 16+ Styles captures. The first supported scope is iPhone 15 and older iPhones plus other cameras/raster imports already handled by Stylio's non-native Styles pipeline.

The feature analyzes the photo locally, chooses a Photographic Style and recommends the initial Tone/Color/Palette state, then writes that state into the same editable HEIC Styles graph Stylio already builds. Existing optional AI Portrait and AI Detail processing remain independent and can be combined with the recommendation.

Native iPhone 16/17/18+ preservation behavior is explicitly out of scope for this first release.

## Product behavior

Add a third opt-in AI feature under the existing AI master switch:

- Depth Effect with Portrait Lighting
- Sharpen Photo
- **Suggested Styles**

The existing three-position Lite / Standard / Pro selector remains the single shared AI quality control. No second quality selector is introduced.

The quality levels mean:

| Level | Style recommender budget | Intent |
|---|---|---|
| Lite | 1 global 224px embedding + low-cost image statistics + small neighbor set | fastest recommendation |
| Standard | global embedding + 4 overlapping regional embeddings + full image statistics + medium neighbor set | default balance |
| Pro | global embedding + multi-scale regional analysis (up to 9 local views) + robust aggregation + larger neighbor set | slower, more detailed reasoning and more stable parameter estimates |

The same selector continues to choose the existing Lite/Standard/Pro Depth and AI Detail models. For Suggested Styles it controls **analysis depth**, not a second downloaded style model.

UI copy must make that shared behavior clear. The selected level applies to every enabled AI feature.

## Runtime model

Use a pinned, integrity-checked TinyCLIP ViT-8M/16 image encoder in ONNX format. Runtime uses the **image encoder only**; there is no text prompt, tokenizer, user-entered description, caption model, or model training in the browser.

The source model family is TinyCLIP ViT-8M/16 Text-3M YFCC15M. The ONNX community conversion is MIT-licensed. A build-time packaging step must export an **image-only** ONNX graph: FP16 for WebGPU and INT8 for WASM/CPU. The browser must never download the text encoder or tokenizer.

The model is downloaded only when Suggested Styles is actually enabled and a photo is processed, following the repository's current verified-model/cache pattern.

## Scene-aware decision layer and reference diagnostics

Recommendation uses a **scene-aware decision layer**. TinyCLIP image embeddings are projected onto a small set of build-time semantic/mood axes (for example dramatic↔soft, vivid↔restrained, warm/cozy↔cool/crisp, dreamy↔grounded, natural↔stylized, people↔non-people, colorful↔monochrome). The text tower/tokenizer are used only by the build tool to generate pinned axis vectors; they are never shipped or invoked at runtime.

Runtime combines:
- multi-view TinyCLIP semantic-axis scores,
- deterministic image statistics (linear-light brightness, contrast, chroma/saturation, warmth, shadows/highlights),
- a balanced 16-Style profile matrix with a small natural-looking prior,
- cross-view agreement and top-score margin for confidence.

The 16 native styles-ref files calibrate/validate Style identities and metadata, but visual nearest-neighbor retrieval no longer decides the winning Style. The reference bank remains useful for diagnostics and research only.

Balanced policy: Standard/Natural/Neutral/Luminous receive only a small prior. Expressive Styles may win whenever semantic and photographic evidence agree strongly; ambiguous or internally inconsistent evidence falls back to Standard.

A build-time tool creates a compact reference bank from private/native reference photos. Source photos are never shipped. Only these derived records are packaged:

```js
{
  embedding: Float32Array,  // normalized TinyCLIP image embedding
  styleId: Number,
  tone: Number,
  color: Number,
  palette: Number,
  sourceClass: String       // audit metadata, no filename/user identity
}
```

Curated native iPhone 16/17 references may seed the bank when they retain a complete accepted Styles graph. Newer iPhone 18+ captures may also seed it when the validated native `0x65` capture record is present and the `0x54` marker uses the compatible schema. The Apple MakerNote `0x54` values provide the selected style and its pad state. Generated/reconstructed files, incomplete legacy exports, incompatible marker schemas, and compatibility-compromise fixtures must be excluded.

The packaged bank is bound to the exact pinned image-encoder model ID and source revision that produced its embeddings. It contains no source pixels, filenames, EXIF, timestamps, location, faces, or other personal metadata.

The diagnostic bank must contain all 16 validated style IDs at least once before it is used for calibration/audit comparisons. Runtime Suggested Styles does not depend on the bank: availability is governed by the verified image encoder plus `semantic-axes.json`. Missing or invalid runtime semantic assets fail closed to conservative Standard.

## Style identifiers and default state

The recommender treats Apple MakerNote `0x54` key `4` as the selected Style index and keys `1`, `2`, `3` as Tone, Color, and Palette/Intensity state. The full 16-style table is now locally validated against `D:/Downloads/styles-ref`; each curated native-complete file matches its folder Style ID and pad state. The local Bright reference resolves the earlier external-table discrepancy in favor of Tone -0.50 / Color +0.50:

| ID | Style | Tone | Color | Palette |
|---:|---|---:|---:|---:|
| 1 | Standard | 0.00 | 0.00 | 1.00 |
| 4 | Amber | 0.20 | 0.20 | 1.00 |
| 14 | Gold | 0.20 | 0.10 | 0.85 |
| 3 | Rose Gold | -0.20 | -0.20 | 0.75 |
| 16 | Bright | -0.50 | 0.50 | 1.00 |
| 2 | Neutral | 0.40 | -0.10 | 0.80 |
| 5 | Cool Rose | 0.35 | -0.10 | 0.75 |
| 8 | Vibrant | -0.30 | 0.33 | 1.00 |
| 6 | Natural | -0.70 | -0.15 | 1.00 |
| 12 | Luminous | 0.35 | 0.30 | 1.00 |
| 11 | Dramatic | -0.76 | 0.19 | 1.00 |
| 7 | Quiet | 0.50 | 0.45 | 1.00 |
| 9 | Cozy | -0.75 | -0.20 | 1.00 |
| 10 | Ethereal | 0.68 | -0.15 | 1.00 |
| 15 | Muted B&W | 0.40 | 0.00 | 0.50 |
| 13 | Stark B&W | -1.00 | 0.00 | 0.50 |

The table is a metadata mapping, not the recommendation algorithm.

## Recommendation algorithm

For each analyzed view:

1. Decode the current pre-Styles image path already used by Stylio.
2. Resize/crop to TinyCLIP's expected 224px input and normalize exactly as the pinned model requires.
3. Run the image encoder and L2-normalize the embedding.
4. Query cosine similarity against the reference bank.
5. Aggregate neighbors with distance-weighted voting for `styleId`.
6. Within the winning style, compute robust weighted estimates for Tone, Color and Palette.
7. Refine those values with bounded deterministic image statistics (linear luminance percentiles, contrast, saturation/chroma, highlight/shadow occupancy and white-balance tendency).
8. Clamp every value to the observed/validated Apple range before writing metadata.

Lite uses one global view. Standard and Pro average multiple view embeddings before retrieval and also measure variation between local views; high disagreement reduces confidence rather than forcing a strong style.

The recommender returns:

```js
{
  styleId,
  styleName,
  tone,
  color,
  palette,
  confidence,
  level: 'lite' | 'standard' | 'pro'
}
```

No random decisions are allowed. The same photo, model asset, bank version and quality level must produce the same recommendation.

## Confidence and fallback

A recommendation is considered confident only when both conditions hold:

- the winning style has sufficient weighted support; and
- the margin over the second-best style exceeds a level-specific threshold.

Low confidence falls back to Standard with conservative, near-neutral Tone/Color/Palette refinement.

Pro is not allowed to invent stronger edits simply because it is Pro. It spends more inference budget and should improve stability/parameter precision.

## Metadata application

This first release applies recommendations only to the **non-native Styles construction path**.

Before writing:

- reject complete native iPhone 16+ Styles captures from this feature path;
- preserve the source primary/HDR/depth resources under the existing rules;
- build the normal non-native Styles graph first;
- replace the generated MakerNote `0x54` selection state with the recommendation;
- do not substitute native scene calibration coefficients from unrelated reference photos;
- keep Styles plist scene statistics/light maps derived from the target photo as the existing pipeline already does.

Reference-bank records influence only the selected style and bounded pad values. No donor image payload, native coefficient map, delta map, light map, depth, matte or HDR data is copied from a reference image.

AI Portrait runs against the same result so the final HEIC can simultaneously contain editable Portrait depth/lighting and the recommended initial Style state.

## Texture / Film scope

The existing Texture/Grain graft remains enabled exactly as today.

`IMG_0924.HEIC` (iPhone 16 Pro) confirms the older-generation Texture path contains both the 2023 Styles graph and the 2026 `texture_styles` + 12 matte contract, matching the architecture Stylio currently grafts. It also uses `HardwareModel=iPhone19,2`.

However, no validated field has yet been established for Texture/Film strength. `texture_styles.Preset=Standard` is also known not to be the Photographic Style selector.

Therefore v1 does **not** auto-write a Texture/Film preset or strength from the AI recommendation. The recommender API may reserve optional texture fields, but production metadata stays unchanged until a same-file device A/B establishes the selector and strength semantics.

## Shared AI quality UI

The current `#depth-model` control becomes the authoritative shared AI quality state without adding a duplicate selector.

Implementation should rename internal concepts away from “depth-only” where safe (for example `selectedAiLevel()`) while preserving stored preference compatibility with the existing `depth-model` localStorage key for this release.

Required copy:

Vietnamese:
`Lite nhanh hơn; Pro phân tích kỹ hơn để cho kết quả AI chi tiết và đề xuất Styles tốt hơn. Mức đã chọn áp dụng cho mọi tính năng AI.`

English:
`Lite is faster; Pro analyzes more deeply for finer AI results and better Style suggestions. The selected level applies to all AI features.`

Chinese:
`Lite 处理更快；Pro 会进行更深入的分析，以获得更细致的 AI 结果和更好的风格建议。所选级别应用于所有 AI 功能。`

## Components

New modules should be isolated under `web/src/styles/` or a dedicated `web/src/recommend/` directory:

- `style-recommender-model.js`: pinned model manifest, preprocessing contract and integrity metadata.
- `style-recommender-inference.js`: worker/session lifecycle and image embeddings.
- `style-reference-bank.js`: packaged bank parser, validation, cosine retrieval.
- `style-recommender.js`: multi-view policy, statistics, confidence, deterministic output.
- `style-selection.js`: validated Style ID/name/default tuple mapping and MakerNote state builder.

A build/dev tool generates the reference bank from explicitly selected private reference files; it must never run as part of the public web app.

Existing `web/app.js` orchestrates the feature and passes the shared AI level. Existing Styles assembly remains responsible for HEIC graph construction.

## Download, cache and privacy

- Nothing is uploaded.
- The original photo remains on device.
- The style model is lazy-downloaded only when Suggested Styles is enabled.
- Asset SHA-256 is pinned and verified before execution.
- Clear cache removes the style model alongside other downloaded AI assets.
- The reference bank is a small static derived asset bundled/cached with the shell or model package.
- No private reference photo is committed or published.

## Failure handling

Suggested Styles is additive. If model download, integrity validation, inference, bank loading or recommendation fails:

- continue normal Styles processing;
- use the existing neutral Standard selection;
- show a bounded AI recommendation warning in Details;
- do not fail the photo conversion;
- do not affect AI Portrait or AI Detail if those features can still run.

Cancellation through the AI master switch aborts recommendation work using the existing cancellation lifecycle.

## Tests

Add deterministic tests for:

1. shared Lite/Standard/Pro state reaches Depth, Detail and Suggested Styles;
2. Lite uses the smallest recommendation inference budget; Pro uses the largest;
3. reference-bank validation rejects malformed dimensions, NaN embeddings and unsupported style IDs;
4. kNN voting and tie/margin behavior;
5. low-confidence fallback to Standard;
6. Tone/Color/Palette bounds;
7. MakerNote output for all validated style IDs;
8. non-native HEIC output opens structurally and preserves original primary/HDR/depth payloads under existing guarantees;
9. AI Portrait + Suggested Styles retains editable Portrait resources and recommended selection state;
10. native iPhone 16+ complete Styles input bypasses Suggested Styles mutation;
11. cache cleanup releases/removes the recommender model;
12. vi/en/zh UI strings and accessibility state;
13. no extra model download when Suggested Styles is disabled.

Physical iPhone validation is required before calling the metadata behavior proven: import into Photos, open Edit, verify the recommended Style/Tone/Color/Palette is initially selected, adjust it, Save, reopen and re-edit. Combined AI Portrait output must also verify aperture and Portrait Lighting remain editable.

## Non-goals for v1

- modifying complete native iPhone 16/17/18+ Styles selections;
- recreating Apple's native per-scene style coefficients;
- auto-selecting Texture/Film preset or strength;
- training or fine-tuning a model;
- user text prompts;
- cloud inference;
- semantic segmentation / DETR.
