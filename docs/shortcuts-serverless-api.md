# Shortcuts serverless API proposal

Status: reviewed contract, not an implemented or deployed processing service.
The website remains local processing; this separate opt-in API uploads a photo
to the selected server. The existing `shortcut-server` is a LAN-only Python
service, not this API: it lacks the current JPEG HDR and AI Portrait pipeline.

## Request and result

`POST /v1/process?portrait=false` with the original photo as the raw request body.
Authenticate with `Authorization: Bearer <personal token>`; never embed a shared
public token in a distributed Shortcut. Allow HEIC, JPEG and PNG in the first
implementation. DNG requires a separate native RAW adapter before being advertised.

Styles and Texture/Grain are always included. `portrait=true` opts into depth
inference and editable Portrait. Preserve existing depth instead of generating
replacement depth. A Live Photo's HEIC is processed as a still photo; no MOV is
required. Preserve native Styles, selected preset, HDR and original imagery.
Automatically supplement missing Soft Skin using the same person/face checks as
the website. Do not run segmentation when face detection finds no usable face.

Optional `focusX`/`focusY` are normalized **display** coordinates in [0, 1],
defaulting to the centre; convert them with the same ordered rotation/mirror
transform as the website. `aperture` defaults to 4.5, range 1–22. These settings
apply only when new Portrait depth is added. Portrait starts off in the saved
file; enable it in Photos to edit aperture and lighting.

Return the final HEIC directly in the POST response with `Content-Type: image/heic`
and a sanitized `Content-Disposition: attachment` filename. No second GET or
base64 encoding is necessary. Use response headers to describe the actual
result: `X-Portrait-Result: added|preserved|off` and
`X-Soft-Skin-Result: added|preserved|no-face|unavailable`.

Errors return JSON with a stable code and readable message. Unknown contracts,
HDR conversion failures, or requested Portrait failures return 422, rather than
silently returning SDR or a file missing the requested feature. Never label
server output as compatible with all future versions of Photos.

## Runtime and deployment

Prefer a Cloud Run container for the first implementation. It can package native
codecs and ONNX Runtime alongside the shared JavaScript container logic. Follow
the requested GPU inference policy for depth, without a whole-model CPU fallback.
Use a GPU execution provider on the server rather than assuming Safari's WebGPU
runtime is available there. Benchmark cold/warm latency before deciding whether
queued jobs are necessary. Cloud Run offers NVIDIA L4 GPU instances, requiring
at least 4 vCPU and 16 GiB RAM, with scale-to-zero support. This requires a cloud
project and billing; no paid resources have been created.
Source: [Cloud Run GPU support](https://docs.cloud.google.com/run/docs/configuring/services/gpu).

Plain Cloudflare Workers have a 128 MB isolate memory limit, including WASM;
the roughly 100 MB depth model alone leaves too little room for decoded photos,
inference tensors and HEVC. Workers can serve as a gateway to a container, but
should not run this complete pipeline. This is an inference from the current
pipeline and [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).

Cloud Run's HTTP/1 request limit is 32 MiB. Start with a 20 MiB file limit and a
48 megapixel decoded-image limit, concurrency 1, and benchmark memory before
setting the instance size. Stream successful responses. Cloud Run allows up to
60 minutes per request; that does not guarantee that Shortcuts will wait that
long. Test the actual Shortcut and use jobs for longer processing.
Sources: [Cloud Run quotas](https://docs.cloud.google.com/run/quotas),
[request timeout](https://docs.cloud.google.com/run/docs/configuring/request-timeout).

Standard synchronous Lambda payloads are limited to 6 MB. Larger photos need an
object-storage upload flow, so direct POST is simpler on a container service.
Source: [Lambda quotas](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html).

## Work required before a deployable API exists

1. Extract the website's orchestration behind codec/inference adapters. Reuse
   `buildAiPortrait`, the Styles/Texture graph operations, HDR parser, depth
   refinement, eligibility checks and preservation validation. Do not wrap the
   older Python patch command and claim parity with the current website.
2. Supply native HEIC/JPEG decoding and HEVC encoding, including the linear
   thumbnail and HDR gain-map path. Reuse the website's graph and coordinate
   conventions; preserve compressed native photo resources byte-exactly.
3. Implement ONNX Runtime server inference for depth and Soft Skin, with pinned
   model hashes, bounded working buffers, cached model sessions and cancellation.
4. Add token validation, per-token rate limits, bounded request streaming,
   a processing deadline and per-request temporary files removed in `finally`.
   Do not log photo contents, GPS, filenames or bearer tokens. Default to no
   persistent photo storage. Keep the model cache separate from user data.
5. Validate on real iPhones: native Bright/Standard, 24 MP Live Photo still,
   older HEIC, Indigo HDR JPEG, no-person images, depth orientation/mirroring,
   aperture/lighting, and all three Texture effects. Check byte preservation
   and cold/warm latency. Successful container assembly alone is insufficient.
6. If processing exceeds the client's timeout, add private job storage, polling
   and expiring download URLs; do not put photo bytes in public URLs or logs.

## Shortcut flow to test after implementation

Share an image/file → obtain the original file → POST its bytes with the token
and `portrait` option → verify a successful HEIC response → Save to Photo Album.
Using a converted JPEG from the Share Sheet can already lose the original
Styles/depth metadata; the API cannot recover metadata that was not sent.
The Shortcut's save action still needs testing for preservation of editing
controls. Cloud credentials, billing and production deployment are not
configured by this proposal.

Machine-readable contract: [OpenAPI](shortcuts-api.openapi.json).
