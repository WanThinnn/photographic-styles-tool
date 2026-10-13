# Suggested Styles AI assets

Suggested Styles uses zero-shot image/text embeddings. It does not train on a
photo dataset and does not ship a text encoder or tokenizer to the browser.
Only image-only ONNX graphs and build-time style prototype vectors are shipped.

## Runtime tiers

| Level | Encoder | License | Views | Embedding |
| --- | --- | --- | ---: | ---: |
| Lite | TinyCLIP ViT-8M/16 | MIT | 3 | 512 |
| Standard | TinyCLIP ViT-39M/16 | MIT | 9 | 512 |
| Pro | SigLIP2 Base patch16 224 | Apache-2.0 | 17 | 768 |

No MobileCLIP or other Apple model weight is included. `assets.json` pins the
exact upstream revision, byte length, SHA-256, preprocessing contract, and the
INT8 WASM / FP16 WebGPU asset for every tier. License texts are stored in
`licenses/`.

The runtime downloads only the chosen tier/provider. Large ONNX files are kept
in the SHA-verified model cache and are not duplicated by the service worker.

## Zero-shot style prototypes

`tools/style-prototype-prompts.json` contains reviewable English positive and
negative prompts for the 14 supported colour Styles. B&W IDs 13 and 15 are
intentionally absent, so they cannot be recommended.

`style-prototypes-{lite,standard,pro}.json` contains normalized prompt means in
the exact embedding space of its matching image encoder. At runtime every crop
is compared directly with these vectors. The global view has extra weight;
support across crops, top-two margin, and dispersion determine confidence.
Genuine cross-view disagreement fails closed to Standard. Image statistics only
refine tone, colour, and Palette, whose injected value remains conservatively
capped.

## Rebuilding and verification

Install the Python build dependencies documented at the top of
`tools/build-ai-style-models.py`, then run:

```text
python -u tools/build-ai-style-models.py
```

The builder:

1. resolves and pins each upstream repository revision;
2. extracts `pixel_values -> image_embeds` and the build-only text tower;
3. exports INT8 and FP16 image-only graphs;
4. executes each graph through ONNX Runtime;
5. projects the reviewed prompts into per-tier prototype files;
6. writes the schema-2 manifest and license files.

An interrupted build can resume: completed model variants and matching
prototypes are hashed and reused. `node tools/verify-ai-style-model.mjs` performs
an independent manifest, hash, I/O, and inference check when
`onnxruntime-node` is installed.

## Reference-bank diagnostics

`reference-bank.json` is retained only for private-corpus audits and research
comparisons. It is not consulted by the recommendation runtime and never gates
Suggested Styles availability. Original pixels, filenames, EXIF, timestamps,
GPS, face metadata, and free-form source metadata must never enter that file.
