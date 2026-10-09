# Optimization status — 2026-10-09

The browser preserves native Styles/HDR/depth and exports optional editable
Portrait. Implementation details and device experiment history are in
[facts.md](facts.md); runtime requirements are in [web/README.md](web/README.md).

## Implemented

- AI cancellation terminates the inference worker. GPU phases have a two-minute
  deadline; downloads have a separate stall timeout and the optional operation
  has an overall time limit.
- Portable regression, language, PWA, license-copy and module-path checks gate
  CI. Pages publishing checks Portrait export and photo preservation.
- Offline storage is best-effort: cache/quota failures do not discard successful
  network responses or prevent online use.
- The serialized file queue releases per-photo decoded samples; removing a row
  releases its preview, assembler and download URLs. Offscreen previews release
  their GPU renderer.
- Focus/aperture edits reuse encoded image/depth payloads, run assembly in a
  worker and expose only the latest combined download.
- Source is grouped by function, and obsolete A/B generators and unused exporters
  have been removed. License notices remain in distributed outputs.
- Safari/iOS start GPU inference at maximum edge 630, with 518 as a fallback on
  caught resource errors, instead of probing 1036/770. Process termination can
  still bypass fallback; the higher mobile budget needs physical-device validation.
  Primary-image guidance and exported depth remain at maximum edge 1024.

## Still needs device validation

Confirm the reported inference-stage reload is resolved on the user's Safari.
Measure peak memory and latency for large HEIC/JPEG HDR/DNG images, repeated AI
jobs and clear/reprocess cycles on physical devices. Chrome with a Safari
user-agent verifies budget selection and paths, not WebKit/Metal behavior.

Styles colour calibration and the serverless Shortcuts proposal are paused at
the user's request. Native coefficients must stay untouched; higher depth input
resolution should follow measured stability, not a chip-name assumption.
