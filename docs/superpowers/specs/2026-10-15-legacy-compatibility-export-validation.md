# Legacy Compatibility Export — validation, fixtures and release matrix

Date: 2026-10-15  
Branch: `feature/legacy-compatibility-export`  
Status: **automated structural validation implemented; physical Apple Photos qualification remains mandatory for real future contracts**

## 1. Purpose

Legacy Compatibility Export cannot be considered correct from static parsing alone.

A structurally valid HEIC can still fail in Apple Photos in ways that desktop tests cannot detect:

- Styles controls may not appear;
- Texture/Grain may render incorrectly;
- Soft Skin/Glow may turn black or fail to save;
- Portrait aperture may work but Lighting may not;
- HDR may be decoded with the wrong transfer interpretation;
- Photos may accept import but discard an edit on save;
- a file may work once and lose editability after save/reopen.

This document defines the evidence required before a source adapter or target baseline is treated as production-compatible.

### Current implementation / release gate state

The branch now has the complete structural safety foundation:

- canonical contract fingerprinting and unknown-resource detection run before Apple-specific mutation;
- current known iPhone 16/17 contracts remain on the existing native path;
- older/non-native input continues through the existing mature import/porting path;
- unsupported future HEIF/container/essential-property contracts are preserve-only and keep source bytes unchanged;
- eligible iPhone 16/17 editing-layer changes can use the bounded generic recovery path, which preserves proven photographic/HDR/depth roles and rebuilds only the known editing contract;
- the target registry is explicit and currently marks its baseline as structural-only, not physically qualified;
- the real source-adapter registry is intentionally empty until a genuine future source contract is captured and researched;
- deterministic conversion plans, mutation-budget checks, output self-checks, sanitized inspector/comparer/manifest tooling, stable diagnostic error codes and a compatibility Details report are implemented.

Automated regression currently records **313 passing tests, 15 optional fixture skips and 0 failures** across the compatibility path and the existing native/non-native/Portrait/HDR/UI pipelines used for this work. PWA asset checks, VI/EN/ZH copy checks, static-release checks, target-manifest build/validation and syntax checks also pass.

Release gates remain deliberately split:

- **Gate A (Safe Mode / structural firewall): complete.**
- **Generic editing-layer recovery: structurally exercised, but it is not a source-specific future adapter and is not evidence of future Apple Photos behavior.**
- **Gate B (real adapter / device-qualified experimental export): closed** because no genuine future changed-contract fixture and no physically validated source adapter exist.
- **Gate C (normal user claim of a specific future-iOS conversion): closed** until the full physical matrix below passes.

The compatibility result shown in the web UI therefore reports preservation/rebuild facts without claiming that an arbitrary future contract has been “verified by Apple Photos.” Exact contract IDs remain developer diagnostics.

## 2. Validation layers

Every adapter must pass all applicable layers.

### Layer 1 — parser validity

The output must:

- parse successfully with Stylio's own HEIF discovery;
- expose all required target roles;
- have valid item extents;
- have valid property associations;
- have valid references;
- contain no dangling references;
- contain no duplicate target contract families;
- classify as the intended target profile.

### Layer 2 — preservation integrity

Payloads declared preserved must remain byte-identical.

At minimum compare hashes for:

- primary image/grid;
- primary tiles;
- delta grid/tiles;
- HDR grid/tiles;
- thumbnail;
- linear thumbnail;
- native depth;
- matte payloads that are intentionally reused;
- unrelated metadata items.

Any changed preserved resource is a hard failure.

### Layer 3 — semantic metadata verification

Verify:

- Styles schema and selected Style;
- Tone/Color/Palette state;
- Texture contract and preset state;
- Grain seed/state;
- Soft Skin people metadata;
- matte role mapping;
- depth descriptor;
- focus/aperture state;
- Portrait renderer metadata;
- HDR declaration/headroom;
- MakerNote fields intentionally mapped.

### Layer 4 — Apple Photos import

The output must import as a new asset without:

- import error;
- invisible/blank image;
- unexpected SDR-only rendering;
- corruption warning;
- duplicate/incorrect Live Photo association.

### Layer 5 — Apple Photos edit controls

Applicable controls must appear.

### Layer 6 — edit/save/reopen

Each relevant control must be changed, saved, Photos closed/reopened, and editability checked again.

### Layer 7 — round-trip structural inspection

Where practical, export/share the Photos-saved result and inspect how Photos rewrote the graph.

The round trip is evidence of what Photos truly accepted, not merely what it displayed before save.

## 3. Fixture taxonomy

Fixtures must be categorized by role.

### 3.1 Baseline fixtures

Original Camera captures from the target known-good 27.0.x contract family.

Purpose:

- define target profiles;
- establish accepted graph topology;
- validate target templates/manifests.

### 3.2 Future-source fixtures

Original Camera captures from a future iOS whose contract differs.

Purpose:

- define source adapter;
- establish changed semantics.

### 3.3 A/B semantic fixtures

Pairs differing in exactly one user-visible setting.

Examples:

- Standard Style vs Bright;
- Tone 0 vs Tone +0.5;
- Texture off vs on;
- Grain low vs high;
- Soft Skin off vs on;
- Portrait aperture f/4.5 vs f/2.0;
- Portrait Lighting Natural vs Studio.

Purpose:

- map metadata to behavior.

### 3.4 Negative fixtures

Files intentionally outside an adapter's supported domain.

Examples:

- new unknown Styles schema variant;
- unknown Apple URI;
- unsupported `iloc` version;
- multiple depth items;
- unexpected essential property;
- malformed plist;
- future Texture v2 variant not yet mapped.

Purpose:

- prove fail-closed behavior.

### 3.5 Synthetic regression fixtures

Small generated containers used only for parser/classifier edge cases.

They do not substitute for physical Apple Photos validation.

## 4. Minimum iPhone 16 Pro baseline matrix

The initial target evidence set should cover, where the device/software permits:

| Case | Lens | Resolution | Styles | HDR | Texture | Portrait/depth | Live Photo |
|---|---|---:|---|---|---|---|---|
| A | 1× | default | Standard | native | none | none | off |
| B | 1× | 24 MP | Standard | native | known | none | off |
| C | 1× | 24 MP | non-Standard | native | known | none | off |
| D | 1× | 24 MP | non-Standard | native | known | depth/Portrait | off |
| E | tele | default | Standard | native | known | none | off |
| F | tele | default | non-Standard | native | known | none | off |
| G | ultrawide | default | Standard | native | known | none | off |
| H | 1× | 48 MP | Standard | native | as available | none | off |
| I | 1× | default | Standard | native | known | none | on |
| J | 1× | default | non-Standard | native | known | depth | on |

If a mode cannot produce one of these combinations, record it as not applicable rather than synthesizing a fake native fixture.

## 5. Future iOS comparison protocol

When a new iOS version is suspected of changing the contract:

1. preserve at least one known-good old fixture from the same device;
2. capture a new unedited file with the same lens/resolution/Style settings;
3. compare contract fingerprints;
4. compare payload-role hashes;
5. compare Styles schema/key sets;
6. compare MakerNote contract evidence;
7. compare Texture URI/plist/matte sets;
8. compare Portrait/depth graph;
9. compare HDR representation;
10. distinguish cosmetic metadata changes from rendering-contract changes.

A changed EXIF `Software` field alone is not evidence of a new source contract.

## 6. Contract-change severity levels

Use a severity label during research.

### C0 — label-only

Examples:

- Software string changes;
- build identifiers change;
- non-rendering metadata added.

Expected action: no adapter; normal processing should continue.

### C1 — additive optional metadata

Known contract plus new non-essential fields that Photos ignores when absent.

Expected action: preserve unknown fields; verify no mutation needed.

### C2 — known subsystem schema extension

Example: Styles schema increments but most semantics map directly.

Expected action: explicit adapter after evidence.

### C3 — graph/topology change

New item URI, new matte family, new reference topology, new rendering sidecar.

Expected action: dedicated source adapter and target rebuild.

### C4 — payload representation change

Depth/HDR/Texture data encoding changes.

Expected action: representation adapter; possibly re-encode only the affected auxiliary data.

### C5 — target cannot express new feature

Future feature has no known equivalent in the 27.0 baseline.

Expected action: disclose information loss or block export.

## 7. Styles validation matrix

For each supported adapter, validate at least:

| Test | Required |
|---|---|
| Styles controls appear | yes |
| original selected Style represented correctly | yes |
| Tone value preserved/mapped | yes |
| Color value preserved/mapped | yes |
| Palette/intensity preserved/mapped if applicable | yes |
| switch to another Style | yes |
| save edit | yes |
| close/reopen retains Style editability | yes |
| revert behavior works | recommended |
| unrelated source payload hashes preserved | yes |

Use at least Standard and one expressive Style.

If possible include Bright because its historically distinctive pad state is useful as a mapping sanity check.

## 8. Texture / Grain validation matrix

For a target carrying Texture:

| Test | Required |
|---|---|
| Texture control appears | yes |
| Grain control appears | yes |
| no black render | yes |
| changing Texture is visible | yes |
| changing Grain is visible | yes |
| save succeeds | yes |
| close/reopen succeeds | yes |
| second edit succeeds | yes |
| no duplicate Texture contract | yes |
| target 2026 matte family complete | yes |

Where Soft Skin/Glow applies:

| Test | Required |
|---|---|
| face detected/rendered | yes |
| Soft Skin control works | yes |
| Glow works | yes |
| no all-black/invalid face region | yes |
| save succeeds | yes |
| reopen retains editability | yes |
| multi-face case | recommended |

## 9. Portrait validation matrix

For a source with native depth or generated target Portrait renderer:

| Test | Required |
|---|---|
| Portrait control appears | yes |
| initial on/off state as designed | yes |
| aperture changes | yes |
| focus/tap-to-focus works if supported | yes |
| Natural Light | yes |
| Studio Light | yes |
| Contour Light | yes |
| Stage Light | yes where device/Photos offers |
| Stage Light Mono | yes where offered |
| High-Key Mono | yes where offered |
| save succeeds | yes |
| close/reopen retains aperture | yes |
| close/reopen retains Lighting editability | yes |
| native depth payload hash preserved when declared preserved | yes |

Visual acceptance must check subject/background separation, not merely that a slider moves.

## 10. HDR validation matrix

HDR validation must include both structural and visual checks.

### 10.1 Structural

- primary color properties;
- HDR auxiliary/tmap role;
- headroom declaration;
- gain-map payload hash if preserved;
- codec properties;
- target graph references.

### 10.2 Visual

On a physical HDR-capable iPhone:

- compare source and target at normal Photos display;
- inspect bright highlights;
- inspect skin tones;
- inspect deep shadows;
- test Portrait bokeh if combined;
- test low-power/SDR presentation where relevant;
- verify no washed-out, crushed or over-bright result.

### 10.3 Save/reopen

HDR appearance must remain correct after Photos saves an edit.

## 11. Live Photo validation

If Legacy Export supports Live Photo stills:

- preserve content identifier semantics;
- preserve pairing with motion resource;
- verify Photos displays Live indicator;
- play motion;
- edit still;
- save;
- reopen;
- verify motion remains paired.

A still-only compatible HEIC is not sufficient evidence for Live Photo support.

If motion pairing is not included in the initial feature, Legacy Export should explicitly refuse Live Photo conversion rather than silently break the pair.

## 12. Container validation

For every output:

- `ftyp` valid;
- one primary item;
- all item IDs unique;
- all extents in bounds;
- no overlap unless valid by design;
- `iloc` widths sufficient;
- `iref` references resolve;
- `ipma` associations resolve;
- essential properties exist;
- construction methods supported;
- no orphan target metadata items;
- no old future contract leftovers when adapter declares they are removed;
- no duplicate 2026 Texture items;
- no duplicate depth role.

## 13. Mutation-budget validation

Each adapter test should materialize a before/after mutation report.

It must prove that every byte-level change belongs to one of:

- target graph rebuild;
- explicitly translated metadata;
- explicitly re-encoded auxiliary payload;
- extent/offset updates caused by assembly.

Unexpected changes are failures even if Photos happens to open the file.

## 14. Preservation hash manifest

Create a semantic hash manifest rather than hashing only the whole file.

Conceptual categories:

```text
primary/grid
primary/tile/*
delta/grid
delta/tile/*
hdr/grid
hdr/tile/*
thumbnail
linear-thumbnail
depth
matte/<role>
styles
texture
exif
sidecar/<role>
```

This makes it possible to state precisely that the primary and HDR image data were preserved even when metadata offsets changed.

## 15. Idempotence tests

### 15.1 Baseline no-op

Input already matching target:

- classifier → baseline;
- Legacy Export should not rebuild;
- output bytes should equal input bytes where API design permits.

### 15.2 Converted output no-op

Future source → converted target → run Legacy Export again:

- no new items;
- no file growth;
- no duplicate Texture;
- no duplicate mattes;
- no duplicate Portrait sidecars;
- no semantic changes.

## 16. Safe Mode negative tests

Construct or collect sources with:

- Styles schema 999;
- unknown `tag:apple.com,2027:...` rendering URI;
- unknown MakerNote Texture-like payload;
- new required essential property;
- unexpected `iref` type attached to Styles/Texture;
- unsupported `iloc` layout.

Expected result:

- no Apple-specific mutation;
- byte-identical preserved source;
- diagnostic reason present;
- no false “Texture missing” classification.

## 17. Adapter boundary tests

An adapter must reject near-matches.

If adapter A was researched for:

`future-contract-X revision 1`

then synthetic/real variants with:

- schema number changed;
- required key missing;
- unexpected required key;
- URI changed;
- depth representation changed;
- reference topology changed

must not fall through to adapter A unless those variants were explicitly included in its evidence set.

## 18. Target-profile selection tests

Given equivalent source capabilities with different tile topologies, target selection must choose the correct baseline profile.

Examples:

- 24 MP 48/12 topology;
- 24 MP 45/15 topology;
- single-grid variants;
- no thumbnail vs thumbnail;
- depth vs no depth.

Do not use “closest profile” if exact capability requirements are not met.

## 19. Information-loss tests

If a future adapter intentionally cannot preserve a feature:

- conversion plan must list it;
- UI report must list it;
- output must not contain misleading stale metadata claiming the feature still exists;
- automated test must check that disclosure is present.

A conversion with undisclosed loss is a failure.

## 20. Photos physical test protocol

For each release-candidate adapter:

1. AirDrop/share/save the converted HEIC to the test iPhone;
2. open in Photos;
3. wait for any background analysis to complete;
4. enter Edit;
5. verify Styles;
6. verify Texture/Grain;
7. verify Soft Skin/Glow if applicable;
8. verify Portrait/aperture/focus if applicable;
9. verify each Portrait Lighting mode;
10. verify HDR visually;
11. press Done;
12. leave Photos;
13. reopen asset;
14. re-enter Edit;
15. change controls again;
16. save again;
17. optionally duplicate/revert;
18. export/share saved asset for structural round-trip inspection.

Record exact device model and iOS build.

## 21. Cross-version Photos matrix

A historical target must be checked against at least:

- the current iOS release at adapter development time;
- the future iOS release that produced the source;
- if practical, one intermediate/newer device.

Reason: the purpose is not merely to make a 27.0-style file; it is to make a 27.0-style contract that the **current Photos renderer** still accepts.

## 22. Device matrix

Initial priority:

1. iPhone 16 Pro — primary long-term source/target evidence;
2. one newer iPhone generation;
3. one older device that can run the required current Photos version, where controls are available.

The matrix expands only when there is evidence hardware changes contract interpretation.

## 23. Performance validation

Legacy Export should not unnecessarily decode/re-encode primary image data.

Measure:

- peak memory;
- conversion wall time;
- number of payloads re-encoded;
- worker lifetime;
- output size delta.

A metadata/graph conversion that unexpectedly performs full primary decode/encode should be treated as a regression unless explicitly required.

## 24. Browser matrix

Because Stylio is a browser/PWA app, validate:

- iOS Safari/PWA;
- desktop Chromium for structural tests;
- CPU fallback paths if auxiliary re-encoding is required;
- WebGPU is not a prerequisite for pure compatibility conversion unless an existing AI option is separately enabled.

Legacy Export itself should not require AI.

## 25. Error taxonomy

Use stable failure categories for diagnostics:

- `unknown-source-contract`
- `unsupported-container-layout`
- `adapter-ambiguous`
- `target-profile-missing`
- `target-disabled`
- `semantic-mapping-incomplete`
- `mutation-budget-violation`
- `payload-preservation-failed`
- `target-classification-failed`
- `auxiliary-conversion-failed`
- `physical-validation-pending`
- `preflight-failed`
- `resource-limit-exceeded`
- `ambiguous-dependency`

User-facing copy can stay simple; diagnostics should preserve the exact category.

## 26. Release evidence record

Every adapter should have a small release evidence document/table recording:

- adapter ID;
- source contract ID;
- fixture IDs;
- target profile ID;
- automated test commit;
- device model;
- source iOS build;
- Photos validation iOS build;
- Styles pass/fail;
- Texture pass/fail;
- Soft Skin pass/fail;
- Portrait pass/fail;
- Lighting pass/fail;
- HDR pass/fail;
- save/reopen pass/fail;
- known losses;
- reviewer/date.

This makes later regressions traceable.

## 27. Research notes in facts.md

When a future contract is actually investigated, `facts.md` should contain:

- raw observations;
- experiment chronology;
- rejected hypotheses;
- A/B evidence;
- exact fields that changed;
- physical-device outcomes.

The production adapter docs should summarize conclusions, while `facts.md` retains the research trail.

## 28. Acceptance criteria for “27.3 → 27.0 baseline” claim

Stylio may describe a specific adapter as providing legacy compatibility only when:

- the source was positively identified as the researched 27.3 contract;
- the output structurally matches a validated 27.0.x baseline profile;
- primary photo data is preserved where promised;
- all claimed editable controls work in current Apple Photos;
- save/reopen works;
- the output remains recognized after a second edit;
- any non-representable future feature is disclosed.

Do not make a blanket statement that “all iOS 27.3 photos can be converted” unless the fixture matrix actually covers all relevant contract variants.

## 29. Test ownership by subsystem

Suggested ownership boundaries:

- contract fingerprint/classifier → compatibility tests;
- Styles semantics → Styles tests;
- Texture/Soft Skin → texture tests;
- Portrait/depth/lighting → portrait tests;
- HDR representation → HDR tests;
- graph/payload integrity → preservation tests;
- Photos behavior → manual/device evidence.

A passing structural suite cannot override a failing physical Photos test.

## 30. Stop conditions

Research or implementation should stop and return to preserve-only when:

- two supposedly identical source captures produce materially different unexplained contracts;
- a field changes with no reproducible relation to user-visible state;
- target conversion changes primary pixels unexpectedly;
- Photos imports but cannot save edits;
- HDR behavior is visibly wrong;
- Portrait Lighting produces incorrect masks/background;
- future-only resources cannot be represented without guessing;
- source adapter requires broad wildcard matching.

These are signals to gather more evidence, not to add more heuristics.

## 31. Final release rule

A Legacy Compatibility adapter is not “working” because the file opens.

It is working only when the full chain is proven:

```text
future original
   ↓
exact source classification
   ↓
explicit semantic mapping
   ↓
known target profile
   ↓
declared mutation budget
   ↓
payload preservation checks
   ↓
Apple Photos import
   ↓
edit controls
   ↓
save
   ↓
close/reopen
   ↓
edit again
   ↓
round-trip inspection
```

This validation standard is intentionally stricter than the current normal porting path because Legacy Compatibility Export will be used specifically when Apple has changed a contract and incorrect assumptions are most dangerous.

## 32. Compatibility Firewall v2 structural qualification

The Firewall v2 automated suite now explicitly validates the conditions that must be true before generic recovery is allowed.

The compatibility-specific suite contains 56 passing tests and zero failures in the current workspace. It exercises:

- current real iPhone 16 fixtures remaining `known-compatible` and never entering recovery;
- current iPhone 18 native Texture evidence remaining on its established preservation route;
- deterministic fingerprint v2 and canonical structural signatures, including re-validation of signatures from sanitized manifests;
- MakerNote tag inventory, malformed/duplicate-tag fail-closed handling and the extended TIFF types used by real Apple fixtures;
- preflight no-op for known native input;
- bounded editing-only future recovery;
- source-byte, metadata-payload, plist, URI, per-item reference/property and extent resource limits;
- unknown essential properties;
- unknown non-essential properties attached to protected resources;
- duplicate editing contract families;
- dangling references;
- recursive editing `dimg` graph detection;
- unsupported `iloc`, `iref`, `ipma` and primary codec assumptions;
- unknown future Styles schema, unreadable Styles, new Styles keys and MakerNote `0x54` changes;
- future Texture versions and the `0x65` native Texture marker, including `0x65` appearing on iPhone 16 beside an otherwise known Texture graph;
- unknown editing reference types;
- future `photo:metadata:` tags;
- future `photo:aux:` tags being classified as photographic and therefore preserve-only;
- unknown editing resources gaining a dependency on real native depth;
- generic sanitizer preservation of primary/HDR resources;
- real iPhone 16 Pro 24 MP/HDR payload preservation;
- Live Photo content-identifier preservation;
- deterministic conversion-plan v3 allowlists and plan-authoritative MakerNote mutation permissions;
- target postflight with exact Texture-on/off expectation, duplicate-family checks and target signature reporting;
- semantic role, protected-topology and non-MakerNote capture-Exif preservation, including recursive protection and role propagation through depth/matte `dimg` descendants;
- sanitizer verification before target building and a frozen postflight boundary with no HDR/Soft Skin/AI Portrait mutation afterward;
- atomic exact-source fallback on discovery, classification, preflight, sanitizer, builder or postflight failure;
- rejection of preserved primary-tile mutation;
- rejection of undeclared output resources;
- parser fallback for recognizable but unsupported HEIC;
- worker-level preflight, safe export and normal compatibility export;
- idempotent reprocessing of converted output.

The wider regression pass used for Firewall v2 records **313 passing tests, 15 optional private-fixture skips and zero failures** across compatibility, native Styles/Texture, Portrait/depth, HDR, raster/non-native import, Live Photo, date preservation, UI/application lifecycle, Suggested Styles, startup/history and module-path checks. PWA, static-release and VI/EN/ZH copy consistency checks also pass.

This remains structural qualification only. It does not open Gate B or Gate C. A real future source contract still requires original fixtures and physical Apple Photos import → edit → save → close → reopen → edit-again evidence before an adapter may be described as device-qualified.
