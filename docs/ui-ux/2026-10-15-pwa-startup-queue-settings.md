# PWA startup, queue and processing settings — 2026-10-15

Follow-up: the user confirmed v206/v207 places the dock correctly on iPhone.
Its geometry remains in v208; see
[iOS sheets and dark glass](2026-10-16-ios-sheets-materials.md) for current
sheet and control behavior.

This update supersedes the v196 viewport-settling approach in the earlier UI
handoff. Cache version: **v207**. Both the v204 `100dvh` attempt and the v205
fixed-host-only change failed physical iPhone feedback. The current revision
also normalizes standalone document scrollability, as described below.

## Toolbar and startup

- Resting dock placement belongs to `#app-chrome`, an unfiltered fixed `inset:0`
  host outside `<main>`. Flex layout aligns the relative dock to the host's safe
  bottom. It uses no viewport-height units, measured pixel height, scroll locks
  or launch polling. Glass remains on the child controls. This differs from the
  earlier failed body-lock/internal-scroll architecture: the document still
  scrolls normally. VisualViewport applies only after focused Search receives a
  keyboard resize; clearance is measured against the chrome bounds. Blur,
  backgrounding and orientation changes clear that offset.
- v206 responds to the user's new observation that Settings is correct while
  the other destinations jump up. Settings is long and scrollable; the empty
  destinations were exactly viewport height. Standalone detection now runs in
  the early head script, and `main` reserves `calc(100lvh + 1px)` in that mode.
  Every destination therefore keeps a scrollable root, including a dismissed
  first-run notice or empty History. The dock still aligns to its own host;
  neither physical-screen nor JS viewport heights position it. This is a targeted
  mitigation for the observed content-length boundary, pending device acceptance.
- Search Close retains input focus on pointerdown until click. Otherwise blur
  removes keyboard clearance and moves Close out from under the finger before
  activation. Keyboard/assistive click activation remains intact.
- The launch mark/spinner and background are inline HTML/CSS. The main stylesheet
  loads without blocking this first paint. Bootstrap waits for the stylesheet
  and application readiness before dismissing the launch screen. Reduced motion
  disables spinning; a slow boot exposes Retry and failed imports show the
  existing error banner.
- The launch glyph now reproduces the actual light/dark SVG artwork inline.
  Critical CSS follows saved Light/Dark preferences or system appearance before
  the external stylesheet loads, including a live system appearance change.
- The installed service-worker release serves cached app HTML/scripts/styles
  immediately. Missing files fall back to the network. Model manifests and
  independently verified model downloads retain their own policies. Browser SW
  update checks and the explicit Update action remain available.
- First-time cross-origin-isolation setup can still require one navigation after
  initial worker claim. Warm resumes do not reload themselves. iOS can suspend or
  terminate the process; caching makes the next launch independent of the network,
  rather than claiming a web app can prevent OS termination.
- Profile prefetch and IndexedDB history restoration do not gate the controls.
  Encoder/WASM heaps are not warmed just by opening the app. If the initial page
  has no controller yet, offline preparation is sent to the worker after activation.

## Queue and concurrency

All selected files register History rows synchronously, before processing starts.
Registration/history restoration is batched; progress does not reconstruct every
unchanged History card. Queued files retain a waiting icon and do not decode
thumbnails. Activity shows each running/updating photo and a running/waiting count.

`task-queue.js` owns picker, drop and optional Portrait reprocessing. Default is
one job; Parallel processing opts into at most two. Turning it off lets active jobs
finish and changes subsequent starts. Work waits for the page to be visible.

The second lane uses a lazy same-origin `processing-lane.html` realm with its own
module graph, HEIC worker, decoder, encoders and AI runtime. Existing cleanup methods
terminate singleton workers, so sharing those singletons between two photos would
be incorrect. Live Photo pairing remains one parent session. Optional reprocessing
keeps lane affinity; clearing History disposes the lane after result cleanup.

Ready outputs remain in IndexedDB. Incomplete queue entries are session-only: if
iOS terminates the process, select unfinished originals again. The History queue
note makes this explicit.

## Working Settings

- Default save action selects the primary Share or Download action, including on
  existing results. Sharing falls back to Download when unsupported. Nothing is
  automatically saved/shared without a user gesture.
- Keep screen awake uses the [Screen Wake Lock API](https://www.w3.org/TR/screen-wake-lock/)
  only during visible active work. It releases on completion, disabling or hiding;
  late request completions are released too. Unsupported browsers disable the
  control and explain why; rejected requests keep processing usable.
- Parallel processing persists and explains higher memory/battery/heat use.
- Original-format reminder replaces the nonfunctional Prefer original format mock.
  It actually controls the iOS Format → Current reminder and can restore a
  previously dismissed tip. The web app cannot force the system picker to provide
  originals; processed copies remain HEIC.
- Update/clear/reset actions cannot interrupt queued processing.

## Validation

- All web suites importing `node:test`: **372 passed, 15 optional private-fixture
  skips, 0 failures**. PWA/i18n, static release, syntax and diff whitespace checks pass.
- Regression tests reproduce stale JS viewport heights, network-blocked cached
  boot and missing queued rows before the fix; tests also cover lane affinity,
  concurrency changes, failure recovery, visible-page scheduling, working persisted
  preferences and Wake Lock lifecycle/races.
- Real desktop Chromium at 390×844: both JS heights fixed at 756, dock bottom 834;
  three HEICs completed with two independent runtime lanes, History showed 2 active
  + 1 queued and Activity showed both active photos. No uncaught page errors.
- Real browser tests exercised the iOS reminder/dismiss/restore flow via Safari UA,
  primary save-action changes and a gesture-triggered Share with a mocked share API.
- Real service worker cached 188 app resources and successfully reopened with the
  browser fully offline. The loading screen was also captured with CSS withheld.
- The repeatable `tools/smoke-mobile-shell.mjs` checks **21 browser scenarios**:
  four combinations of saved/system theme with CSS blocked, live theme changes,
  320/390/402/430/768/844/1280 widths in both appearances, stale `innerHeight`,
  lifecycle events, short/long destination scrollability and tab restoration,
  end-lens concentricity, real Search taps/keyboard clearance,
  production bootstrap, Safari install-guide inertness and AI Settings presentation.
  No uncaught page errors. The command writes screenshots/report to
  `artifact/mobile-review/`; review copies are retained outside the checkout.
  Run with `node tools/smoke-mobile-shell.mjs`; it needs an available Playwright
  installation and Chromium. Optional `STYLIO_PLAYWRIGHT_MODULE` and
  `STYLIO_BROWSER_EXECUTABLE` select local installations. External requests are blocked.
  The latest run also used `STYLIO_DEVICE_SCALE_FACTOR=3` and touch support.
- Physical iPhone cold launch, OS eviction/reopen, keyboard/safe-area geometry,
  heat/peak memory under parallel AI/RAW work and actual iOS share/Wake Lock behavior
  still require device testing. Chromium emulation is not an iOS qualification.

## Mobile presentation refinement (v205–v206)

Read against `ref/ionic-theme-ios27` (floating safe-area defaults, glass material
and tab interaction docs) and `ref/ios27-design-system` (typography, layouts and
native glass measurements). Keep the existing small vanilla app; no Ionic runtime
or additional material/animation dependency is added.

Mobile uses a 76pt header region with 32pt brand artwork, 16pt content
margins, leading 34pt large title, 15pt supporting copy and 17pt option labels.
At the user's request, v207 restores the inset grey photo-picker panel inside
the grouped surface, with the former 12pt frame and 190pt minimum picker height.
The inset fill uses the theme background so Dark appearance stays coordinated.
Photo content retains its original geometry; glass remains navigation/control
chrome. Touch chrome suppresses text-selection/callout artifacts while photo,
filename, help and editable-field selection remains available.

v206 lowers the header controls by 16pt: top content padding is safe-area + 24pt,
and main content moves down by the same amount to preserve clearance. This keeps
the brand/help controls farther from the system status region.

The selected lens had a confirmed CSS sizing defect. The element-only global
`*` reset excludes pseudo-elements; its `::before` border was added outside the
declared one-tab width, and percentage translations multiplied that extra width
at the last tab. Explicit `box-sizing:border-box` fixes both rest size and the
translation step. At 402px viewport width, the measured Settings lens top and
right insets now both equal 5 CSS pixels, instead of 5 and -3 in the original
desktop reproduction. The moving/held Liquid Glass animation remains available.

The user's device feedback overrides prior desktop successes. WebKit issue
[301994](https://bugs.webkit.org/show_bug.cgi?id=301994) documents a related
standalone viewport/status-region problem, but does not prove this app's root
cause. A system-owned region outside the WebView cannot be reclaimed with CSS.
The new host removes app-level viewport-unit/containing-block dependencies;
it is an implementation awaiting physical cold-launch acceptance, not a claim
that every iOS compositor/viewport bug has been solved.
