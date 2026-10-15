# Legacy Compatibility Export — implementation plan

Date: 2026-10-15  
Branch: `feature/legacy-compatibility-export`  
Status: **Compatibility Firewall v2 implementation complete for structural safety: fingerprint/signature v2, graph preflight, semantic boundary policy, target/adapters gates, plan v3, two-way mutation budget, atomic fallback and developer tooling; future source-specific qualification remains fixture-driven**

## 1. Scope of this plan

This plan describes how to build Legacy Compatibility Export after the architecture in `../specs/2026-10-15-legacy-compatibility-export-design.md` is accepted.

The implementation must be staged. The first useful deliverable is not a “27.3 → 27.0.1 converter”; it is a **future-contract detection and fail-closed layer**. True conversion is added only after future source fixtures exist and a specific adapter can be proven.

The order matters because an eager exporter without a global compatibility firewall would increase risk.

## 2. Workstream overview

Implementation should be divided into the following phases:

1. baseline evidence capture;
2. contract fingerprinting;
3. global compatibility classification;
4. Future Contract Safe Mode;
5. target-profile registry;
6. dry-run conversion plans and mutation budgets;
7. first source adapter;
8. target graph builder;
9. Styles conversion;
10. Texture/Soft Skin conversion;
11. Portrait conversion;
12. HDR conversion;
13. result reporting and UX;
14. full regression and physical-device qualification;
15. controlled rollout.

No phase should be skipped merely because a future source appears visually similar to the current format.

## 3. Phase 0 — freeze the current behavior as evidence

Before implementation, record the current known behavior.

### 3.1 Preserve current supported schemas

Lock regression fixtures for native Styles schemas currently accepted by `styleCapabilities()`:

- 13
- 14
- 16
- 131087
- 131088

Tests must prove that introducing the new compatibility layer does not change successful handling of these files.

### 3.2 Preserve current Texture behavior

Capture tests for:

- native files already carrying the 2026 `texture_styles` URI;
- native files without Texture where current additive Texture is valid;
- iOS 18/legacy schema 13 missing-tone-curve repair;
- files where `nativeTextureCapture()` recognizes the current next-generation capture record;
- files where Texture must not be duplicated.

### 3.3 Preserve current Portrait behavior

Freeze tests for:

- AI Portrait on supported completed Styles;
- existing native depth preservation;
- legacy Portrait restoration;
- Portrait renderer graph preservation;
- focus/aperture edits;
- Styles payload byte preservation.

### 3.4 Preserve current HDR behavior

Freeze tests for:

- unchanged HDR resources;
- legacy Apple gain-map normalization;
- already-normalized HDR no-op;
- HDR + Portrait integration.

The new compatibility layer must not quietly alter these established paths.

## 4. Phase 1 — establish the target baseline evidence set

Legacy Export needs a concrete target family before conversion code exists.

### 4.1 Capture requirements

Use original, unedited Camera captures from the intended known-good iOS 27.0.x release on the primary reference hardware, initially iPhone 16 Pro.

Collect variants covering:

- 1× main camera;
- telephoto;
- ultrawide if available in the same feature set;
- default resolution;
- 24 MP;
- 48 MP where applicable;
- Photographic Styles Standard;
- at least one non-Standard Style;
- multiple Tone/Color states;
- HDR on/native;
- Portrait capture;
- Photo-mode capture with native depth where applicable;
- Texture/Grain states;
- Soft Skin/Glow states where directly capturable;
- Live Photo;
- Portrait initially on/off if both generate distinct contracts.

Do not derive the baseline from files previously processed by Stylio.

### 4.2 Evidence naming

Private fixtures should use neutral IDs, not user-facing filenames, for manifests and tests.

Example evidence IDs:

`baseline-16pro-main24-style-standard-a`

`baseline-16pro-tele-style-bright-a`

`baseline-16pro-portrait-hdr-a`

The actual photo files remain private/ignored.

### 4.3 Baseline audit output

For each fixture, record:

- canonical contract fingerprint;
- graph-role inventory;
- Styles schema and key set;
- MakerNote role values relevant to Styles/Texture/Portrait/HDR;
- Texture URI and plist key set;
- matte URI inventory;
- depth representation;
- Portrait renderer sidecars;
- HDR representation;
- tile topology;
- exact item/property/reference graph summary.

### 4.4 Baseline family decision

Do not force all captures into one baseline if the fixture audit shows multiple legitimate structures.

The target registry should reflect the actual family needed to preserve behavior.

## 5. Phase 2 — implement canonical contract fingerprinting

Proposed future module:

`web/src/compatibility/contract-fingerprint.js`

### 5.1 Inputs

The fingerprint should operate on the existing HEIF discovery structures where possible rather than reparsing everything.

### 5.2 Required sections

The canonical result should have stable sections such as:

- container;
- items;
- references;
- properties;
- roles;
- styles;
- texture;
- portrait;
- hdr;
- exifEvidence;
- unknownAppleResources.

### 5.3 Canonicalization rules

To make tests stable:

- sort item summaries by semantic role then item ID;
- sort URI sets lexically;
- normalize graph references;
- report dimensions numerically;
- hash opaque payloads rather than embedding them;
- distinguish “missing” from “unreadable”;
- preserve raw schema numbers;
- never normalize an unknown schema to a known one.

### 5.4 Privacy-safe diagnostic mode

A second serializer should remove:

- filenames;
- timestamps;
- GPS;
- image hashes that could identify private fixtures if unnecessary;
- content identifiers;
- raw MakerNote payloads.

It should retain only contract-relevant structure.

## 6. Phase 3 — implement the compatibility registry

Proposed future module:

`web/src/compatibility/contract-registry.js`

The registry should contain:

- known source contract signatures;
- known compatible supersets;
- known target profiles;
- source-adapter IDs;
- test evidence references;
- release qualification state.

No entry should be keyed only by “iOS 27.3” or “iPhone 16 Pro”.

A version/device can be attached as evidence metadata, not as the match condition.

## 7. Phase 4 — central compatibility classifier

Proposed future module:

`web/src/compatibility/contract-classifier.js`

The classifier should run once near the start of HEIC processing.

### 7.1 Required outputs

Conceptual result:

```text
status
sourceContractId
targetCandidates
unknownCriticalResources
safeOperations
warnings
```

### 7.2 Safe-operation capability map

Instead of individual modules making ad-hoc choices, classification should produce operation permissions:

- mayPreserveNative;
- mayAddTexture;
- mayRepairTexture;
- mayAddSoftSkin;
- mayRebuildStyles;
- mayAddAiPortrait;
- mayRestorePortrait;
- mayNormalizeHdr;
- mayLegacyExport.

A future unknown contract should set all Apple-specific mutation permissions to false.

### 7.3 Integration point

The classifier should be computed before the branch in `web/src/app/processing/file-processor.js` that decides between native preservation, Texture addition, repair and full Styles porting.

No Texture/Portrait/Soft Skin mutation should begin before this classification exists.

## 8. Phase 5 — Future Contract Safe Mode

This is the first production-worthy milestone.

### 8.1 Behavior

For `unknown-apple-contract`:

- preserve source bytes;
- do not add Texture;
- do not repair Texture;
- do not generate Soft Skin;
- do not add AI Portrait;
- do not rebuild Styles;
- do not run compatibility HDR transformations whose assumptions are not proven for the source;
- show an informational compatibility message.

### 8.2 Why this ships before Legacy Export

Safe Mode protects users immediately after an Apple format change, even before an adapter exists.

Without it, the app may confuse “not recognized” with “missing” and append an old contract to a file that already contains a new one.

### 8.3 Regression target

Existing known fixtures must remain on the same processing routes they use today.

## 9. Phase 6 — target profile registry

Proposed future module:

`web/src/compatibility/target-registry.js`

Target profiles should be generated from audited baseline evidence and represented as sanitized manifests plus any existing compatible metadata templates already used elsewhere in Stylio.

### 9.1 Target selection dimensions

Select using capabilities and graph shape, for example:

- has HDR;
- has Styles;
- has Texture;
- has depth;
- needs Portrait renderer;
- Live Photo still;
- tile topology class;
- primary geometry class.

### 9.2 No private pixels in target assets

A target profile may include sanitized metadata/template bytes only when necessary. It must never ship:

- photo image payloads;
- GPS;
- capture timestamp;
- content identifiers;
- user-specific metadata.

Build tools should verify this.

## 10. Phase 7 — conversion plan and mutation budget

Proposed future modules:

- `conversion-plan.js`
- `mutation-budget.js`

Legacy Export should create a dry-run plan before assembly.

### 10.1 Dry-run requirements

The plan must explicitly list:

- source contract;
- target profile;
- items preserved;
- items translated;
- items rebuilt;
- items dropped;
- properties/references changed;
- MakerNote fields changed;
- resources re-encoded;
- information loss.

### 10.2 Budget enforcement

The final output verifier should compare real changes against the plan.

If actual mutations exceed the declared budget, fail the export.

### 10.3 Plan stability

The same source + same adapter + same target should produce the same plan deterministically.

## 11. Phase 8 — adapter interface

Proposed future directory:

`web/src/compatibility/adapters/`

Each adapter should be isolated.

### 11.1 Adapter responsibilities

An adapter should expose conceptually:

- exact match predicate;
- semantic extractor;
- compatibility constraints;
- supported target profiles;
- mutation budget template;
- known loss disclosure.

### 11.2 Adapter selection rule

Multiple adapters must never “sort of match”.

If zero match: preserve-only.

If more than one matches: internal error and preserve-only.

Exactness matters more than convenience.

## 12. Phase 9 — first true future adapter workflow

When the first changed future format arrives:

1. collect original fixture(s);
2. inspect with read-only fingerprint tooling;
3. compare against current known baseline;
4. isolate structural changes;
5. create same-scene/same-setting A/B captures where possible;
6. manipulate one setting at a time in Camera/Photos;
7. map changed fields to visible behavior;
8. document every inferred semantic;
9. implement an adapter only after evidence is sufficient;
10. keep unknown variants rejected.

The source adapter should initially be narrow. Broaden it only after more fixtures prove the contract family.

## 13. Phase 10 — Styles adapter

Implementation should reuse existing Styles parsing/building primitives.

### 13.1 Extract

Recover:

- schema;
- selection state;
- Tone;
- Color;
- Palette/intensity;
- target-derived scene statistics;
- person/skin statistics;
- light maps;
- coefficients whose semantics are actually understood.

### 13.2 Map

Construct a field-by-field mapping table:

| Future field | Meaning | Target field | Conversion | Evidence |
|---|---|---|---|---|
| ... | ... | ... | ... | ... |

No field enters production mapping without evidence.

### 13.3 Rebuild

Prefer rebuilding the target Styles payload from source semantics and target-photo-derived data, not from a donor file.

### 13.4 Verify

Check:

- selected Style;
- Tone/Color/Palette;
- Photos Styles UI;
- save/reopen;
- visual rendering sanity;
- output payload classifies as the target schema.

## 14. Phase 11 — Texture/Soft Skin adapter

This phase should not begin until global unknown-Texture detection exists.

### 14.1 Detect future Texture

Inventory:

- item URI;
- plist version/keys;
- MakerNote evidence;
- matte family;
- instance references;
- sidecars;
- preset/strength/grain fields.

### 14.2 Semantic experiments

Use controlled A/B tests:

- Texture off vs on;
- multiple Texture presets;
- multiple Grain levels;
- Soft Skin levels;
- Glow levels;
- same face/no face;
- one face/multiple faces.

Compare only one changed user-visible control at a time.

### 14.3 Mapping

If the future contract is a superset of 2026, map only validated common semantics.

Future-only effects must be either:

- preserved by a target representation, or
- disclosed as unsupported/lost.

Do not silently approximate a future effect with a different 2026 effect.

### 14.4 Target rebuild

Use the existing 2026 Texture graph primitives only after the adapter confirms that target semantics are correct.

## 15. Phase 12 — Portrait adapter

### 15.1 Classify native depth first

Determine whether source depth payload is already compatible with the target.

If yes:

- preserve compressed depth byte-exact;
- translate only surrounding graph/sidecars as needed.

If no:

- block Portrait Legacy Export until the new depth representation is understood.

### 15.2 Renderer mapping

Map:

- focus;
- aperture;
- Portrait on/off semantics;
- rendering parameters;
- lighting state if encoded in file;
- camera-specific calibration roles.

### 15.3 Lighting qualification

At least these modes should be tested where available:

- Natural;
- Studio;
- Contour;
- Stage;
- Stage Mono;
- High-Key Mono.

A valid file that opens but renders lighting incorrectly is not considered successful.

## 16. Phase 13 — HDR adapter

### 16.1 Prefer byte preservation

If target Photos accepts the future source HDR representation within the baseline graph, keep it.

### 16.2 Translate only proven representations

If conversion is required:

- document input transfer equation;
- document target transfer equation;
- convert samples coherently;
- re-encode only the auxiliary HDR resource;
- quantify round-trip error;
- update metadata declaration in lock-step.

### 16.3 Reject ambiguous HDR

Unknown gain-map encoding, unknown tmap semantics or uncertain headroom means no conversion.

Never flatten primary HDR into SDR as a hidden fallback.

## 17. Phase 14 — assembly strategy

The builder should create the target graph deterministically.

### 17.1 Reuse existing container primitives

Reuse existing helpers for:

- HEIF parsing;
- item creation/removal;
- property association;
- references;
- payload extraction;
- graph rebuilding.

Do not create a second HEIF parser under compatibility code.

### 17.2 Copy roles by semantics

Do not rely on source item IDs matching target item IDs.

Build a semantic role map:

- primary;
- primary tile N;
- delta grid/tile;
- HDR grid/tile;
- thumbnail;
- linear thumbnail;
- Styles;
- Texture;
- matte role;
- depth;
- sidecar role.

### 17.3 Final self-check

Before returning bytes:

- rediscover output;
- fingerprint output;
- verify target profile match;
- verify mutation budget;
- verify required payload hashes;
- verify no duplicate contract families;
- verify all references resolve.

## 18. Phase 15 — UI integration

UI work should come after the exporter is validated.

### 18.1 Entry point

Recommended first user-facing location:

Result Details / Advanced action:

**Legacy Compatibility Export**

Do not make it a default global toggle initially.

### 18.2 Availability

Show only when:

- classifier says `known-convertible`;
- a validated adapter exists;
- a target profile is available.

Unknown files should show:

**New Apple photo format detected. Stylio preserved this photo without modifying its editing contract.**

### 18.3 Loss disclosure

If the adapter cannot preserve a future-only feature, require a clear warning before export.

### 18.4 Output naming

Use a suffix such as:

`_LegacyCompatible.HEIC`

Do not encode a misleading fake source iOS version in the filename.

## 19. Phase 16 — compatibility report UI

Details should show concise information such as:

- source format: newer Apple photo contract;
- target: validated legacy Apple Photos contract;
- original image data preserved: yes/no;
- HDR preserved: yes/converted/unsupported;
- Portrait depth preserved: yes/no/not present;
- Texture translated: yes/no/not present;
- information loss: none/list.

Developer diagnostics can show exact contract IDs.

## 20. Phase 17 — tests

Automated tests should be divided into layers.

### 20.1 Pure fingerprint tests

No mutation.

Validate canonical output for:

- current known fixtures;
- unknown schema synthetic fixtures;
- unknown Apple URI synthetic fixture;
- unsupported `iloc` layout;
- unreadable Styles plist.

### 20.2 Classifier tests

Check exact states and operation permissions.

### 20.3 Safe Mode tests

Unknown Apple contract must remain byte-identical.

### 20.4 Conversion-plan tests

Plan must be deterministic and explicit.

### 20.5 Adapter tests

Each adapter gets its own fixture family.

### 20.6 Mutation-budget tests

Inject accidental changes and prove the verifier rejects them.

### 20.7 Idempotence tests

Baseline → no-op.

Converted output → second conversion no-op.

### 20.8 Existing regression suites

All current Styles/Texture/Portrait/HDR tests must continue to pass.

## 21. Phase 18 — developer tooling

### 21.1 Contract inspector

A developer tool should print:

- fingerprint;
- unknown Apple resources;
- semantic roles;
- schema/key inventories;
- relevant MakerNote summaries;
- target candidates.

### 21.2 Contract comparer

Given two fixtures, show:

- added/removed items;
- changed URI/property/reference topology;
- changed plist keys/types;
- changed relevant MakerNote tags;
- changed payload hashes;
- unchanged primary/HDR/depth data.

### 21.3 Target manifest builder

Generate sanitized target manifests from private baseline fixtures.

The build step should fail if private image payloads or identifying metadata would be embedded.

## 22. Phase 19 — future fixture research protocol

When an iOS update ships:

1. capture a baseline set before updating where possible;
2. update one device;
3. reproduce equivalent captures;
4. preserve originals before Photos edits;
5. run contract compare;
6. identify whether change is label-only or structural;
7. if structural, classify subsystem:
   - Styles;
   - Texture;
   - Portrait;
   - HDR;
   - container;
8. perform controlled A/B user-setting experiments;
9. create an evidence note in `facts.md`;
10. only then begin an adapter branch.

This avoids mixing reverse-engineering evidence with implementation guesses.

## 23. Phase 20 — rollout gates

A release should use three levels.

Current branch state: **Gate A is implemented and structurally validated.** The bounded generic iPhone 16/17 editing-layer recovery is also implemented as a fail-safe bridge, but it is not a source-specific future adapter. Gate B and Gate C remain closed because the real adapter registry is intentionally empty and no genuine future changed-contract fixture has completed physical Apple Photos validation.

### Gate A — Safe Mode only

- classifier ships;
- unknown future contracts are preserved;
- no conversion yet.

### Gate B — developer/experimental Legacy Export

- explicit adapter exists;
- hidden/advanced;
- device-tested;
- compatibility report visible.

### Gate C — normal user availability

- multiple fixture variants pass;
- save/reopen tested;
- no known corruption reports;
- target baseline remains accepted by current Photos.

## 24. Proposed branch strategy

Current branch:

`feature/legacy-compatibility-export`

This branch now contains the shared compatibility foundation and generic iPhone 16/17 recovery implementation. Future source-specific adapters should still be isolated into focused branches once real future fixtures exist.

Later implementation should preferably split into focused branches, for example:

- `feature/future-contract-safe-mode`
- `feature/legacy-contract-fingerprint`
- `feature/legacy-target-registry`
- `feature/legacy-export-adapter-<contract>`

Do not put an unverified future adapter directly into `master`.

## 25. Documentation updates required during implementation

When code work begins, update:

- `docs/web/processing-guide.md` with shipped behavior;
- `facts.md` with device evidence;
- this design if architecture changes;
- validation doc with actual tested matrix;
- README only if the feature becomes user-facing and stable.

Do not advertise Legacy Compatibility Export in the main README while it remains experimental or adapter-less.

## 26. Exit criteria for the initial Safe Mode milestone

The first implementation milestone is complete when:

- every HEIC receives a contract classification before Apple-specific mutation;
- an unknown Styles schema cannot receive Texture, Soft Skin or Portrait mutation;
- an unknown Texture-like Apple resource prevents old Texture injection;
- unsupported HEIF structural layouts fail before mutation;
- source bytes remain unchanged in preserve-only mode;
- current supported fixtures follow their previous successful routes;
- diagnostics explain why mutation was blocked.

## 27. Exit criteria for the first true Legacy Export adapter

The first adapter milestone is complete when:

- source contract match is exact;
- target profile is fixture-derived;
- dry-run plan is deterministic;
- mutation budget passes;
- primary image data is preserved byte-exact unless explicitly documented otherwise;
- HDR/depth preservation or conversion is verified;
- Styles UI works in Photos;
- Texture/Grain works in Photos if applicable;
- Portrait and Lighting work if applicable;
- save → close → reopen works;
- converted output is recognized as target baseline;
- running export again is a no-op;
- unknown variants are rejected.

## 28. Priority recommendation

When implementation begins, prioritize in this exact order:

1. contract fingerprint;
2. unknown Apple resource detector;
3. central classifier;
4. Safe Mode;
5. baseline manifest tooling;
6. dry-run conversion plan;
7. future adapter only when a real future format exists.

Do **not** start by writing a generic “convert any future iOS file to 27.0.1” function. Without a concrete future source contract, such code can only guess.

## 29. Final implementation rule

Every compatibility decision should be explainable as:

> “We observed this exact source contract, validated this semantic mapping, rebuilt this exact target contract, changed only these declared resources, and verified the result in Apple Photos.”

If a change cannot be explained that way, it does not belong in Legacy Compatibility Export.

## 30. Compatibility Firewall v2 hardening — implemented

The post-plan hardening pass adds a second safety boundary without changing the established native or non-native routes.

Implemented work:

- contract fingerprint format upgraded to v2 with semantic property/reference topology, unknown non-essential properties and editing-family multiplicity;
- canonical deterministic structural signatures added for exact adapter matching;
- compatibility engine, fingerprint, plan, report and target-registry versions separated;
- graph policy centralizes protected photo/HDR/depth/matte/Exif roles and editing-graph closure; protected photographic resources recursively include their `dimg` descendants so depth/matte grid tiles inherit the preservation boundary;
- strict preflight runs before compatibility profile loading, decoding or thumbnail generation;
- preflight checks resource limits, extent bounds, construction methods, dangling references, property associations, graph cycles and editing-to-photo dependencies;
- unknown Apple `photo:aux:` resources are photographic/preserve-only by default;
- target registry gained qualification metadata, invariants and a kill switch;
- future adapter descriptors require evidence, capabilities, allowed mutations, information loss and qualification; normal-user availability cannot precede physical Apple Photos validation;
- conversion plans are v3 and carry exact allowed removed IDs, target-added families, MakerNote changes and mutation policy;
- mutation budget is two-way: undeclared source mutation and undeclared output additions both fail; capture Exif outside explicitly budgeted MakerNote edits is semantically compared field-by-field and must remain unchanged;
- target postflight validates schemas, families, URI/property/reference allowlists and editing/photo boundaries;
- final semantic role diff verifies preserved photo resources independently of item IDs;
- safe exporter and worker API return the exact source on any recovery failure;
- inspector/comparer/preflight/manifest/adapter tooling was expanded for future research;
- synthetic regressions cover unknown essential/non-essential properties, duplicate contracts, dangling refs, cycles, unsupported container variants, new Apple auxiliaries, depth cross-boundary dependencies and resource limits;
- real iPhone 16 HDR, native depth and Live Photo fixtures exercise preservation invariants.

The first true source-specific adapter remains deliberately unimplemented. The registry stays empty until a genuine changed future contract is available for A/B research and physical Photos validation. This is not incomplete generic recovery; it is the release gate that prevents speculative conversion logic from becoming part of the normal pipeline.
