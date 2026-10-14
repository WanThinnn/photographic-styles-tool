# Upstream CLI and research reference

This document keeps the technical, command-line and upstream material that was intentionally removed from the short project README.

Stylio's primary user-facing product is the browser/PWA app. The Python implementation remains valuable as a reference implementation, batch-processing tool and reverse-engineering test bed.

## Upstream heritage

Stylio builds on [Shalielie by nathanatgit](https://github.com/nathanatgit/Shalielie).

The repository retains the original MIT copyright and permission notice. Stylio's browser/PWA UI, AI-assisted processing, multilingual interface, HDR/Portrait preservation work and newer compatibility layers are maintained separately by Elio (WanThinnn).

Historically, Shalielie demonstrated that Apple Photos' Photographic Styles editing path depends on file metadata and auxiliary image resources rather than only on the camera model recorded in Exif. Stylio keeps that interoperability work while moving the main experience toward an on-device web app.

## Python CLI

Requirements:

- Python 3.12+
- `uv` is the recommended environment manager
- full encoder mode uses `ffmpeg` and `heif-convert`
- the repository includes a Windows `heif-convert` shim backed by pillow-heif

Install:

```bash
git clone https://github.com/WanThinnn/photographic-styles-tool.git
cd photographic-styles-tool
uv sync
```

Full-mode dependencies:

| OS | Packages |
| --- | --- |
| Debian / Ubuntu | `sudo apt install ffmpeg libheif-examples` |
| macOS | `brew install ffmpeg libheif` |
| Windows | `winget install Gyan.FFmpeg`, then add the repository `tools/` directory to PATH |

Basic use:

```bash
uv run photographic_style_port.py patch INPUT.HEIC OUTPUT.HEIC
```

The output should be transferred to the iPhone **as a file**. Some Photos sharing/export paths render or convert the image and can strip editing resources.

Useful commands:

```bash
uv run photographic_style_port.py profiles
uv run photographic_style_port.py inspect PHOTO.HEIC
uv run photographic_style_port.py extract-donor DONOR.HEIC PROFILE.zip
```

Useful flags include `--report`, `--zip`, `--light-maps target`, `--scene-stats donor`, `--linear-thumb reuse-thumbnail` and `--texture off`.

### No-encoder mode

```bash
uv run photographic_style_port.py patch IN.HEIC OUT.HEIC \
  --linear-thumb reuse-thumbnail --scene-stats donor --light-maps flat
```

This mode reuses the photo's own thumbnail and can run without ffmpeg or heif-convert. It is useful for reproducibility and for comparing the browser implementation against the Python reference, but it cannot recover an embedded thumbnail that is missing from the source.

## What the port changes

For the classic HEIC port, the goal is to preserve the photo's own image data and add the metadata/resources Apple Photos expects for editing.

Depending on the source and mode, the implementation may add or repair:

- Photographic Styles property lists and MakerNote metadata
- a linear thumbnail and scene statistics
- light-map resources
- Texture/Grain metadata and related semantic mattes
- Portrait depth/XMP compatibility resources
- per-photo Soft Skin/person information when source data exists

The browser build also contains workflows that do not exist in the original upstream CLI, including raster/DNG import, local AI-generated Portrait depth, Smart Enhance, model-driven Adaptive Styles and browser-side thumbnail generation.

For the current evidence behind each written metadata item, see [../../facts.md](../../facts.md).

## Compatibility and limits

Important limitations:

- Results are experimental and are not validated by Apple.
- A recognized editing palette does not guarantee that every adjustment behaves exactly like a native capture.
- Edited/exported Photos files can omit native Styles, HDR or Portrait resources that no tool can reconstruct perfectly from absent input data.
- Texture/Grain requires a compatible iOS/Photos version.
- AI-generated Portrait depth is an estimate, not the original camera depth map.
- The CLI's Soft Skin path relies on person/skin/Portrait data already present in the source; Stylio's browser app can supplement some missing information locally with AI.
- Keep original files and compare outputs on copies.

More current browser-specific compatibility notes live in [../web/processing-guide.md](../web/processing-guide.md).

## How to validate a port

A meaningful device test checks more than whether the palette appears:

1. The expected editing controls appear.
2. Switching styles visibly changes the photo.
3. Tone and colour controls respond.
4. Save, reopen and re-edit work.
5. No donor-region artefacts appear.
6. The main image is not corrupted.
7. Portrait appears only when preserved or intentionally generated.
8. Person/background adjustments remain spatially sensible.
9. Texture/Grain appears on supported Photos versions.

Transfer test images as files and change one variable at a time.

## Research milestones

The detailed experiment log is preserved in [../../facts.md](../../facts.md). The most important historical milestones are:

| Milestone | Finding |
| --- | --- |
| V4–V8 | Editing depends on valid style metadata and a linear thumbnail whose image data matches its own `hvcC`. |
| v0.1.1 | Moving tile data without matching `hvcC`/`colr` can corrupt the primary image. |
| v0.2 | Neutral delta maps removed donor-region behaviour. |
| v0.3.1 | Tone statistics needed to be computed in linear light. |
| v0.3.2 | Correct semantic mattes allow people/background to respond separately. |
| v0.4.3 | Portrait depth also needs its corresponding XMP sidecar. |
| v0.4.4 | Reusing the embedded thumbnail enables a deterministic no-encoder path. |
| v0.5.x | Texture/Grain requires `texture_styles` plus the 2026 semantic matte set. |
| v0.6.x | Per-photo face/skin data improved Soft Skin and donor-derived state was further reduced. |

For exact A/B notes, byte-level findings and current open questions, use `facts.md` rather than this summary.

## Agent and developer use

The repository includes a reusable coding-agent skill in [../../skills/photographic-style-port/](../../skills/photographic-style-port/).

Developer utilities include:

- `inspect` for HEIC style-related item structure
- `extract-donor` for donor profile generation
- `tools/style_dump.py` for item graph / Exif / MakerNote inspection
- `tools/texture_variants.py` for Texture/Grain experiments
- `tests/web/` for browser/reference regression checks

See [../web/browser-guide.md](../web/browser-guide.md) for browser architecture and local setup.

## License and disclaimer

The project uses the [MIT License](../../LICENSE) and retains the upstream copyright notice.

Apple, iPhone, Apple Photos and Photographic Styles are trademarks of Apple Inc. No Apple software, source code or SDK is included or redistributed. The project is independent, experimental and not endorsed by Apple.
