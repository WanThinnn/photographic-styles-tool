# Optimization review — 2026-10-08

This review covers the root README translations, `facts.md`, browser and AI/DNG
documentation, Shortcut server documentation, the published skill, and deployment/release
workflows. Priorities below are code-review findings, not confirmed Safari failures.
Existing native Styles/HDR/depth preservation must remain unchanged.

## Recommended next work

| Priority | Work | Reason and validation |
|---|---|---|
| 1 | Bound AI jobs and allow cancellation | `web/src/ai-portrait.js` awaits adapter/session creation, inference and readback without a deadline. The app queue waits for AI, so a stalled job can prevent subsequent processing and history cleanup. Test stalled preparation/inference, cancellation, late completion cleanup and a successful next photo. A timeout alone must not leave a GPU job or resources running indefinitely. |
| 1 | Run portable regression tests in CI | Pages currently checks PWA assets and donor profiles but not i18n or converter behavior. Add existing fixture-independent suites and sanitized/synthetic fixtures for preservation tests. Private paths currently cause some tests to skip; a passing CI job must report this separately. Add fresh-browser startup and AI-before/after-conversion smoke tests. |
| 2 | Make offline caching best-effort during online requests | `web/sw.js` opens the cache before fetching and awaits `cache.put` in the network success path. Cache storage failure can discard a valid network response. Test denied storage and quota exhaustion while ensuring the fresh-visit isolation flow still succeeds online. Offline availability should be reported separately. |
| 2 | Separate decoder availability from per-photo failures | `ensureDecode()` in `web/app.js` caches a failed decode for subsequent photos until history is cleared. One malformed input can suppress analysis for later valid inputs. Test a bad photo followed by a valid one, while preventing repeated library downloads. |
| 2 | Measure Safari memory and first-visit behavior | Worker processing and history cleanup already exist. Measure multiple large HEIC/raster/DNG files, AI previews, clear-and-reprocess and denied storage on a physical iPhone. Use measurements to decide queue limits or per-result removal; do not assume desktop Chrome results establish Safari behavior. |
| Research | Reconstruct unknown Styles colour fields | `facts.md` §§8–10 documents unresolved coefficients, curves and donor fields. Use controlled captures, changing one setting at a time, with Photos save/reopen/re-edit comparisons. Preserve native Styles; do not tune donor values by appearance alone. |

## Documentation corrections made

- Browser thumbnail generation, automatic encoder setup and isolation requirements.
- Three interface languages and the separate AI translation module.
- Photo Library exports can lose resources while remaining HEIC; neither the Python CLI
  nor the Shortcut server reconstructs missing Photos edit history.
- AI activation before/after conversion, stable output actions and SDR bokeh exports.
- Standard full-port geometry limitations are distinct from native Texture insertion
  and estimated experimental browser geometry.

No confirmed new HDR regression was established in this review: the reported iPhone 13 Pro
case was withdrawn by the user after checking. Payload preservation and HDR rendering in
Photos remain separate validation steps.
