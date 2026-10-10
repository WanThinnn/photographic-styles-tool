# AI Detail model comparison — 2026-10-10

## Decision

**Production Standard is now RT-Focuser 2025 at a conservative 25% blend with the input.** The shared UI remains Standard by default, so Depth stays Standard while Detail uses a newer mobile-oriented deblur network. Full-strength RT-Focuser is too aggressive on already-sharp images; the 25% blend preserves clean detail while retaining useful deblur/noise improvement.

**Treat Fatality DeBlur / Pro as an aggressive deblur mode, not universally higher-quality output.** A full-strength restoration on a clean photo can alter real detail and can create hallucinations or oversharpening. An adaptive confidence gate or conservative blend with the original should be considered before enabling it widely.

Do **not** move ReFocus Cleanly or RealPLKSR Denoise into production tiers based on file size alone. Their training targets differ.

## How this was tested

- Executed with `python tools/benchmark-ai-detail-models.py` on the local Windows CodexPro workspace; ONNX Runtime CPU.
- Public-domain scikit-image Eileen Collins/astronaut photo, downsampled to 256×256.
- Scenarios: clean; Gaussian blur σ=1.1 px; 11-pixel horizontal motion blur; additive RGB Gaussian noise σ=0.032 in 0..1; JPEG quality 45.
- Compared output against the original downsampled reference with PSNR and SSIM. Measured timings below exclude model session initialization.
- Candidate model assets and test photo are cached in ignored `tests/web/.cache/ai-detail-eval/`; the **production manifest and weights were NOT changed**.

| Model | Weights on disk | Blur ΔPSNR (dB) | Noise ΔPSNR (dB) | JPEG ΔPSNR (dB) | SSIM of clean input after model | CPU 256² time (approx) |
|---|---:|---:|---:|---:|---:|---:|
| Lite — 1× SPAN | 1.57 MiB | +0.31 | −0.94 | −0.12 | 0.9956 | 0.3–0.5 s |
| Old Standard — 1× RPLKSR-S | 9.10 MiB | +0.22 | −0.00 | +0.00 | 0.9948 | ~3–5 s |
| New Standard — RT-Focuser 2025, 25% blend | 22.62 MiB | +0.20 | +0.36 | +0.04 | ~0.9966 | ~0.5 s full model; blend cost negligible |
| Pro — 1× Fatality DeBlur | 63.77 MiB | +3.15 | −3.88 | −5.42 | 0.9413 | 14.7–15.5 s |
| Candidate — 1× RealPLKSR Denoise | 28.5 MiB | +0.15 | −4.33 | −4.28 | 0.9347 | 8.9–10 s |
| Candidate — 1× ReFocus Cleanly | 63.77 MiB | +1.46 | −2.11 | −2.59 | 0.9649 | 15.4–17.1 s |

Interpretation:
- Positive PSNR delta means the result moves closer to the known original *for this synthetic degradation*, not necessarily more aesthetically pleasing.
- Pro gains most on explicitly blurred input, but changes already-sharp images much more.
- Denoise improves noisy-image SSIM (+0.0434) while worsening PSNR (−4.33 dB), demonstrating that a single metric cannot determine perceptual quality.
- Full-strength RT-Focuser improves synthetic 11-pixel motion blur by +1.73 dB PSNR / +0.111 SSIM but is too strong on clean photos. A 25% blend still improves motion blur by about +0.67 dB, Gaussian blur by +0.20 dB, noise by +0.36 dB and JPEG by +0.04 dB while keeping clean-image SSIM around 0.9966.
- Browser WebGPU measured RT-Focuser at ~156 ms/tile for 256² and ~325 ms/tile for 512² after warmup; the old RPLKSR-S was ~2459 ms/tile at 256² on the same machine.
- A test on a single public photo, 256×256 and artificial degradations **is not a valid global ranking**, mobile performance metric, or a substitute for side-by-side evaluations on original camera photos.

## License/provenance risk

Original model records in OpenModelDB identify these licenses:
- SPAN SuperScale (Lite): **CC BY-NC-SA 4.0**
  https://openmodeldb.info/models/1x-SuperScale
- RT-Focuser 2025 (Standard): **MIT**, pinned to upstream commit `4c8e12d28c2801f34cc1153e9ad8702b7bce657a`.
  https://github.com/ReaganWu/RT-Focuser
- RPLKSR-S SuperScale (former Standard): **CC BY-NC-SA 4.0**
  https://openmodeldb.info/models/1x-SuperScale-RPLKSR-S
- Fatality DeBlur (Pro): **CC BY-NC-SA 4.0**
  https://openmodeldb.info/models/1x-Fatality-DeBlur
- ReFocus Cleanly: **CC BY-NC-SA 4.0**
  https://openmodeldb.info/models/1x-ReFocus-Cleanly

Hugging Face's ONNX collection says its files have **mixed original licenses**; ONNX conversion does not relicense training weights.

**Do not bundle these model weights in a public/commercial distribution without reviewing rights and license obligations.** The `huggingworld` mirror's repository-level MIT tag is not proof of license rights in each separately authored model.

## Next validation

1. Run a representative suite of actual camera photographs: naturally sharp, slight focus miss, motion blur, high ISO noise, skin/hair, foliage, text and fine geometry.
2. Compare visually at 100% plus PSNR/SSIM where true paired reference images exist; inspect oversharpening, halos and false textures.
3. Benchmark the complete multi-tile path under Safari on supported iPhones and with memory limits.
4. Separately validate editable HEIC/Styles/Texture/Portrait output on the device before enabling AI on native HEIC/HDR.
5. Validate the RT-Focuser 25% blend on real iPhone motion blur, faces/hair, foliage and text before increasing blend strength; keep full-strength deblur out of Standard.
