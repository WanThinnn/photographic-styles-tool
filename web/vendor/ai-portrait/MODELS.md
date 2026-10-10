# Depth model assets

The UI names are Lite, Standard and Pro. Files are fetched by
`tools/download-ai-portrait.mjs`; uploaded photos are never sent to these sources.

| UI | Source | Revision | Format |
| --- | --- | --- | --- |
| Lite | onnx-community/depth-anything-v2-small | 4472b7362082ad9968fee890ca0f1e5aca36b93d | q4 |
| Standard | onnx-community/depth-anything-v2-small | 4472b7362082ad9968fee890ca0f1e5aca36b93d | fp32 |
| Pro | onnx-community/depth-anything-v3-small | 0b6a7f3bf5595f9950b91389e0da3a0de130324c | fp32 with external weights |

V2: https://github.com/DepthAnything/Depth-Anything-V2
V3: https://github.com/ByteDance-Seed/Depth-Anything-3
ONNX conversions: https://huggingface.co/onnx-community

V2 Small and V3 Small use Apache 2.0. Full licenses are retained in
MODEL-LICENSE.txt and PRO-MODEL-LICENSE.txt. Artifact URLs, sizes and SHA-256
checksums are recorded in assets.json. Model version alone does not guarantee
better hair or Portrait Lighting in Apple's renderer.
