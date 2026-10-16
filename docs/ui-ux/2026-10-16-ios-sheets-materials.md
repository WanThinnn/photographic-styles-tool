# iOS sheets and dark glass — 2026-10-16

Cache release: **v221**. The user confirmed the v206/v207 dock placement works
on their iPhone. Its host, scrollability workaround, offsets and tab geometry
are retained.

## References

- [Apple: Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets)
  and [Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass):
  scoped modal tasks, rounded sheet edges with content clearance, readable
  scrolling content and a distinct navigation/control layer.
- Local `ref/ionic-theme-ios27/src/styles/components/ion-modal.scss`,
  `styles/utils/_glass.scss`, `styles/utils/dark/ion-tabs.scss` and
  `sheets-of-glass/animations.ts`: floating lower corners, vertical dark rim,
  transparent moving dark lens and final 200ms handoff to resting selection.
- Local `ref/ios27-design-system`: spacing, typography and touch targets.

Web materials approximate the native optical effect; no UIKit/refraction parity
is claimed.

## AI Settings

The missing bottom rim was reproducible: the mobile rule removed the bottom
border and flattened its corners, while the entire dialog scrolled. The sheet
now retains four rounded corners and an inset rim, leaves a bottom gap, fixes
its handle/header in the frame, and scrolls only its body. It fits its content
and caps height against its fixed containing viewport including safe areas.
Short and landscape screens scroll the options without moving the rim/header.

The handle/header allow downward drag dismissal. Control presses, horizontal or
upward movement, short drags, cancellation and teardown cannot accidentally
close it. The body keeps native scrolling. Escape, close button, outside
dismissal, focus restoration and reduced motion remain.

Subtitles are concise in VI/EN/ZH. The groups use leading icons, aligned
separators and a shared privacy note. Feature bindings and processing are intact.

**User preference overrides the initial restyle:** switches return to the prior
63×44px control. The entire Model-control stylesheet matches committed v207:
blue capsule, stops, knob, mapping and inline placement remain. Only the copy
column shrinks in narrow sheets; the control remains at least 128px wide and
44px high.

## Dark toolbar glass

The prior bright radial highlight, side ring and outer shadow made the lens
look embossed. Dark chrome now follows the reference's vertical rim and small
inset shadows. Resting selection uses black at 72%; a moving/held tab lens stays
transparent with a subtle black border and inner shadow. Its final 200ms of
release blends into the resting selection. The dark bar uses 6px blur, 150%
saturation and 1.23 brightness; held icons use 118% brightness / .95 opacity.

Light keeps its own material. Reduced transparency, increased contrast and
forced colors suppress optical treatment; reduced motion suppresses deformation.
No continuous lighting animation or nested lens backdrop filter was added.

## App-wide audit

| Surface | Result |
| --- | --- |
| Process/header/dock/loading | Keep device-accepted geometry, inset grey picker, themed artwork and startup. |
| AI Settings | Floating sheet, internal scroll, full rim, concise copy, header drag, original control sizes. |
| History/Activity | Keep native cards, queue/progress and anchored actions; menu targets increase from 36px to 44px. |
| Photo workspace | Keep full-screen photo presentation, safe header, original image aspect ratio and floating exports. |
| Guide | Mobile chevrons replace visible “See more” links; native details expansion remains. |
| Settings | Keep grouped rows, appearance and native selects; restore original switches. |
| Confirmation/error/install guide | Keep scoped alerts, safe cancel focus, localized errors and focus ownership. |

## Validation

- **375 web tests passed, 15 optional private-fixture skips, zero failures.**
- **50 browser checks passed**, including 24 sheet combinations across 320×568,
  402×874, 844×390 and 768×1024, three languages and both appearances.
- Browser assertions cover complete rim, stable header during scrolling, original
  switch/Model geometry, Model levels, sheet swipe, dark rest/hold/release,
  reduced motion, forced colors, History menu targets, Photo, Guide and confirm.
- PWA assets/i18n pass. The gesture module is cached in both boot and app graphs.
- Run `node tools/smoke-mobile-shell.mjs`. Optional environment variables:
  `STYLIO_PLAYWRIGHT_MODULE`, `STYLIO_BROWSER_EXECUTABLE`,
  `STYLIO_DEVICE_SCALE_FACTOR`, `STYLIO_UI_ARTIFACT_DIR`.
  Requests stay on localhost; no user photos or model inference are involved.
- Physical iPhone sheet gestures and optical appearance still need acceptance.
  The user's successful dock check is preserved; browser tests do not replace it.

## v209 — AirPods corners, stable launch and centered held lens

The user's native AirPods card takes precedence over the generic 32pt sheet
reference. Mobile AI Settings now has broader shoulders: a responsive 64px
circular fallback, and a continuous superellipse where `corner-shape` is
supported. The continuous curve uses a larger extent to retain the broad,
smooth tangent seen in the screenshot. Content, switches and Model stay intact;
desktop sheets and resting dock positioning are unchanged.
The continuous frame uses its border for the rim; inset shadow strokes are
omitted there because they produced a second, circular contour at the bottom.

The initial loading ring was 30px including its border under content-box sizing.
The main stylesheet's universal border-box reset changed it to 24px. Explicit
border-box sizing with a 30px outer diameter in critical CSS keeps the initial
appearance through stylesheet arrival. The app mark remains 76px in both themes.

The held lens used animated individual `scale` with positional translation in
`transform`. That scaled the translation itself: Process has a zero offset, but
History was displaced by about 17px, with increasing drift farther right. Moving
position to individual `translate` applies it before scale. All lens transitions
use that property; the measured reference deformation and material are retained.

Validation: **375 web tests pass, 15 optional skips, zero failures; 54 browser
checks pass at 1× and 3× device scale**. Startup checks compare artwork/ring dimensions before and after
the delayed stylesheet in both themes. Four new hold checks read the browser's
actual transformed pseudo-element border quad, with less than 1px center error
required for each tab. Resting end-lens insets are also read from the actual quad.

## v210 — Reduce phone curvature and remove the footer note

Device feedback rejected the broad AirPods treatment. Remove the 64px circular /
106px continuous overrides entirely. AI Settings now uses a modest 36–44px
circular radius on phone-width viewports (up to 600px), reaching 44px at 402px.
iPad and desktop keep the existing shared 32px radius. This avoids tying the
dialog shape to a single accessory card or to `corner-shape` support.

Remove the privacy footer from AI Settings and its unused styles. The final
Model row retains its lower group corners through the existing last-child rule;
control geometry, scroll behavior, launch sizing and toolbar fixes are retained.

Validation: 27 targeted stylesheet/gesture checks, 54 browser scenarios at 3×
device scale, and the PWA asset check pass. Browser coverage includes 24 sheet
size/language/appearance combinations, original controls and internal scrolling.

## v211 — Lower the phone sheet and align its lower corners

On a phone with a 34px bottom safe area, the previous frame gap was 22px
(`safe-area - 12px`), while its side gaps were 8px. Phone AI Settings now uses
an 8px bottom gap as well, lowering its frame by 14px in that case. The shared
height cap uses the same gap. Home-indicator clearance moves inside the scrolling
body: bottom padding is at least 24px or the remaining safe area, whichever is
larger. Top phone corners stay at 36–44px; lower corners become 40–48px to follow
the supplied iPhone bezel more closely. Tablet/desktop geometry stays unchanged.

The browser smoke additionally emulates a 34px bottom safe area and verifies
matching 8px side/bottom gaps and at least 26px internal bottom padding.

Validation: 55 browser scenarios at 3× device scale, 27 targeted stylesheet /
gesture checks and the PWA asset check pass.

## v212 — Camera-reference continuous phone frame

The supplied Camera screenshot is 1206×2622px (402×874pt at 3×). Its measured
side and bottom gaps are approximately 24px / 8pt. Sampling the lower-left
outline gives a continuous superellipse fit with about 92pt corner extent and
exponent 3.77 (roughly 1.7 screenshot pixels RMS residual). A circular 44/48pt
radius cannot reproduce the long, smooth transition into the straight edges.

Phone AI Settings now uses that fitted contour for both its SVG clipping path
and a fine inset SVG outline. This removes the dependence on CSS `corner-shape`
support that left Safari on circular corners in the earlier attempt. The frame
retains 8pt side/bottom gaps and internal Home-indicator clearance. The larger
continuous extent is not a circular radius: its perceived shoulder remains more
restrained than the rejected circular AirPods approximation.

Frame paths update only on opening, actual layout-size changes or the phone
breakpoint. Opening and drag transforms do not feed back into measurements.
Tablet/desktop remove the clip and use the original 32px frame. If the frame
enhancement is unavailable, the existing circular CSS remains as a fallback.
No switch, Model, processing or toolbar changes are included.

Validation: 378 web checks pass, 15 optional skips, zero failures. Three new
checks compare the curve to Camera edge samples, bound small/fractional paths,
and exercise resizing/breakpoint cleanup. All 55 browser scenarios pass at 3×,
including phone clipping/outline, 34pt safe area, original controls, sheet
scrolling/swipe, and return to 32px tablet/desktop frames. The same vector geometry
is used across browsers; physical Safari rendering still needs device acceptance.

## v213 — Centered footer, device-accepted curve retained

The user confirmed the v212 phone curvature is now correct. Retain that frame
and restore the localized “Your photos stay on your device.” note below Model,
centered across the sheet body. The final control group keeps its lower corners
when followed by the note. Model/switch controls and safe-area spacing remain.

Validation: all 55 browser scenarios at 3×, PWA assets and i18n checks pass.

## v214 — Footer occupies the existing bottom space

v213 incorrectly added the footer's normal-flow height on top of the existing
bottom padding. The note now occupies that padding: 4px above an 18px line,
with a -22px bottom margin canceling its added layout footprint. A wrapped
translation may still grow by the extra line height. The one-line footer stays
centered without increasing frame height or adding a new gap below it.

The browser smoke measures the frame both with the note visible and hidden,
and checks equal height, centered alignment and no overlap with Model.

Validation: all 56 browser scenarios at 3×, 24 stylesheet checks and PWA assets
pass. The visible/hidden footer comparison confirms no added frame height.

## v215 — Uncluttered AI header

Remove the AI Settings close button. Keep the centered title in a single header
column, move it down 6px through balanced padding, and move the grabber down 4px
without adding layout height. Downward swipe, Escape and outside dismissal remain;
the close-button binding is optional. Photo workspace keeps its own close button.
The accepted frame and current footer typography are retained. The footer check
allows a smaller frame but still rejects any added height.

Validation: 55 targeted checks, all 56 browser scenarios at 3× and PWA assets
pass, including no AI close button, swipe dismissal and Escape.

## v220 — Restore the earlier content/menu corners

The user rejects the expanded concentric/shared-group corner treatment. Restore
20px circular AI option groups, including the bottom of the Model group, and
22px Settings groups. Remove the experimental inner clip and shared group-path
observer. Confirmation, photo actions, Appearance segments and picker corners
also return to their earlier styling. AI rows are now grouped in two lightweight
wrappers that provide the original 20px clipping without changing control layout.

The previously accepted outer Camera-shaped phone sheet remains; no adaptive
corner is applied to its inner groups. Keep the X removed, the lowered header,
the footer removed and the compact inner spacing from the latest instructions.
Model and switches retain their existing dimensions and behavior.

Validation: 55 targeted checks, all 56 browser scenarios at 3× and PWA assets
pass. Browser assertions check the original 20px Model-group bottom explicitly.

## v221 — Compact centered privacy footer

Restore the localized privacy sentence below the Model group, at 12px with a
16px line height and centered alignment. On iPhone reserve 6px above the text
and 8px below it, raising the Model group by about 14px compared with v220.
Keep the accepted outer frame, the original inner corners and all controls.

Validation: 55 targeted checks and all 56 browser scenarios at 3× pass,
including measured footer size, centering and compact spacing. PWA assets and
translation consistency checks pass.
