# DNG import

The DNG path adapts the existing LibRaw worker in `ref/Elio-backup`. It decodes
RAW samples with camera white balance and colour calibration into 8-bit sRGB,
then uses the unchanged raster-to-HEIC Styles converter. A temporary lossless
PNG carries compact capture Exif; its orientation is reset because LibRaw already
applies the source rotation. The output is HEIC, not a RAW DNG. RAW edit latitude,
HDR and the camera's proprietary rendering are not retained or promised.

Decoder assets are libraw-wasm 1.6.0, loaded on demand from jsDelivr and checked
against pinned SHA-256 hashes. Photos are sent only to a local worker, never to
the CDN. Cross-origin isolation is required. The worker is terminated after each
decode to release its WASM heap before the HEIC encoder starts.

The memory bound is 12 million output pixels. Larger tiled RGB LinearRaw DNGs
can be decoded tile by tile; other oversized RAW layouts fail before decoding.
JPEG XL compressed DNG is explicitly unsupported by this decoder. Supported
camera variants still require tests with actual DNG files.

Browser validation: `IMG_0368.DNG` (DNG 1.6, lossless JPEG RGB tiles, 4032×3024)
completed through tile decode, HEIC Styles export and GPU depth inference.
The HEIC output is 4000×3000 and retains its source capture date, timezone and
subseconds. `IMG_0665.PNG` also completed Styles export and GPU depth inference.
These tests do not validate Apple Photos Styles/Portrait controls or all cameras.

PNG input remains supported through the raster converter. HEIC output has no
transparent alpha plane; this is a still-photo conversion, not a lossless PNG
container round trip.
