# Legacy Compatibility Export — architecture and design

Date: 2026-10-15  
Branch: `feature/legacy-compatibility-export`  
Status: **design only — no implementation in this branch**

## 1. Purpose

Stylio needs a deliberate compatibility path for future Apple photo contracts.

The motivating case is simple: a user may keep an iPhone 16 Pro for years, update to a later iOS release such as 27.2, 27.3 or 28, and then discover that Apple has changed the internal HEIF/Photographic Styles/Texture/Portrait contract written by Camera. The normal Stylio pipeline must not guess at that contract. Instead, once the new source contract has been studied and an explicit adapter exists, Stylio should be able to export a **new copy** using a previously validated Apple Photos contract that is already known to work.

The product name for that path is **Legacy Compatibility Export**.

The important distinction is:

> Legacy Compatibility Export is a structural contract conversion, not an iOS-version-string rewrite.

Changing EXIF `Software` from “27.3” to “27.0.1” does not convert HEIF item relationships, Photographic Styles schemas, Texture metadata, mattes, HDR representations, Portrait rendering metadata or MakerNote semantics. Stylio must never claim a downgrade merely because a label changed.

The target is therefore a **known-good compatibility contract family** derived from validated fixtures. “iOS 27.0.1” is a human description of the initial baseline we intend to preserve, not the conversion algorithm.

## 2. Design goals

The feature must:

1. preserve original image payloads whenever the target contract can reuse them;
2. convert only contracts whose source semantics have been explicitly understood;
3. rebuild a target Apple Photos graph from a validated baseline rather than editing unknown future structures in place;
4. preserve HDR, Styles, Texture/Grain, Soft Skin, Portrait depth and Portrait Lighting whenever a verified mapping exists;
5. fail closed for unknown source contracts;
6. never overwrite the user's original file;
7. never lie by changing only an iOS/EXIF version string;
8. make every mutation auditable and testable;
9. be idempotent for already-compatible files;
10. use file contents, not OS version labels, as the compatibility decision.

The feature should also make the rest of Stylio safer. A future Texture or Styles contract that is not yet understood must be recognized as “unknown Apple photo contract” before the normal additive Texture path can accidentally graft a second, older contract beside it.

## 3. Non-goals

This feature does **not** attempt to:

- bypass cryptographic signatures or device attestation;
- defeat a hypothetical Apple security restriction;
- decompile Apple binaries;
- emulate every future Apple Photos feature automatically;
- infer undocumented semantics from field names alone;
- preserve an unknown future feature by blindly copying it into an older graph;
- rewrite the source file in place;
- promise that a future Photos renderer will forever accept a historical contract;
- use EXIF `Software`, build number or iOS version as the primary compatibility gate;
- remove a future Texture/Portrait/Styles resource merely because Stylio does not recognize it.

If a future contract cannot be mapped safely, the correct output is **no compatibility conversion** and an explanatory compatibility report.

## 4. Current repository behavior

The existing code already contains several pieces of the required safety model.

### 4.1 Styles contract gate

`web/src/styles/style-capabilities.js` classifies the actual Styles plist, not the EXIF iOS label. The currently understood native schemas are:

- `13`
- `14`
- `16`
- `131087`
- `131088`

Unknown native schemas are marked non-editable. Existing Portrait and Soft Skin paths use this to avoid rewriting unverified native Styles data.

This is the correct direction and should become one input to the broader compatibility classifier.

### 4.2 Native Styles preservation

`web/src/styles/style-preservation.js` recognizes complete native Styles graphs and selected Style state carried in MakerNote `0x54`. Native Styles are preserved instead of being replaced by the non-native porting path.

### 4.3 Current Texture detection

`web/src/styles/texture.js` currently recognizes the known Texture item URI:

`tag:apple.com,2026:photo:metadata:texture_styles`

`hasTexture()` therefore answers whether the **known 2026 Texture contract** is present. It does not prove that no newer Texture contract exists.

`nativeTextureCapture()` in `style-preservation.js` also recognizes the currently observed next-generation capture record through MakerNote `0x65` on iPhone 18+.

These checks are sufficient for the current known fixtures, but they are not a future-contract firewall.

### 4.4 Portrait safety

`web/src/portrait/ai-portrait-container.js` and `web/src/portrait/ai-portrait-export.js` already reject unverified Styles contracts for generated/rebuilt Portrait graphs. Existing native depth is not replaced by the AI depth attachment path.

The current Portrait exporter also checks structural assumptions such as one-extent item layouts and preserves the completed Styles payload byte-exact where required.

### 4.5 HDR compatibility

`web/src/styles/hdr-compatibility.js` already demonstrates the correct adapter philosophy: it detects a specific known legacy HDR representation, transforms the actual gain-map representation when necessary, updates the declaration coherently and validates assumptions. It does not merely rename a version.

Legacy Compatibility Export should use this same philosophy for every Apple-specific contract.

### 4.6 HEIF structural guards

Current mutators reject unsupported `iloc`, `iref`, property or extent layouts instead of trying to write through structures they do not understand. Those guards must remain and should move earlier into compatibility preflight.

## 5. Current gap this feature must close

The largest future-facing gap is not Styles; it is **contract discovery before mutation**.

Today, a hypothetical future file could contain a new Texture implementation that does not use the 2026 URI and does not match MakerNote `0x65`. If `hasTexture()` returns false, an older additive Texture graph could potentially be appended even though the file already contains a newer Texture system.

Example:

```text
future source
  ├─ tag:apple.com,2027:photo:metadata:texture_styles_v2
  ├─ new matte family
  └─ new MakerNote record

current detector
  └─ does not see 2026 texture_styles
       ↓
could incorrectly classify "Texture missing"
       ↓
could append 2026 Texture beside Texture v2
```

Legacy Compatibility Export must introduce a broad Apple-contract inventory and a single compatibility gate that runs before any Apple-specific mutation.

## 6. Core principle: contract identity, not iOS identity

A source photo must be classified from a canonical **contract fingerprint**.

The fingerprint should include, at minimum:

- `ftyp` brands;
- HEIF meta version;
- `iloc` version, field widths, construction methods and extent shapes;
- `iinf/infe` item types, content types and URI names;
- `iref` relationship types and graph topology;
- `ipco/ipma` property types and essential flags;
- auxiliary URIs;
- grid dimensions and tile topology;
- primary, HDR, delta, thumbnail and linear-thumbnail roles;
- Styles item presence and parsed schema identifier;
- known/unknown Styles plist keys;
- MakerNote tags relevant to Styles/Texture/Portrait/HDR;
- known Texture item URI and Texture plist fields;
- all unknown `tag:apple.com` namespaces;
- depth item encoding, auxiliary descriptor and sidecar families;
- HDR gain-map/tmap representation;
- REND/rendering sidecars where present;
- Live Photo identifiers where relevant;
- camera model and capture class only as supporting evidence, not as the main decision.

The fingerprint should be serializable to canonical JSON for tests and diagnostics. Raw photo bytes, faces, GPS and other personal metadata must not be included in a report intended for issue sharing.

## 7. Compatibility classification

A future classifier should return a state richer than a boolean.

Proposed conceptual states:

| State | Meaning | Mutation policy |
|---|---|---|
| `baseline` | already matches a validated target profile | no-op |
| `known-compatible` | newer label/device, but actual contract is already understood | normal processing allowed |
| `known-convertible` | source differs, explicit adapter exists | Legacy Export allowed |
| `known-preserve-only` | source understood enough to preserve but not to translate | no Legacy Export |
| `unknown-apple-contract` | Apple-specific resources are present but semantics are unverified | absolutely no Apple-specific mutation |
| `unsupported-container` | parser/layout itself is not safe to rewrite | no mutation |
| `non-native` | ordinary raster/non-native HEIC path | existing Stylio behavior |

Classification must happen before:

- adding Texture;
- repairing Texture;
- generating Soft Skin resources;
- rebuilding Styles;
- adding/rebuilding Portrait;
- normalizing HDR for a target renderer.

No downstream module should independently decide that an unknown future Apple file is safe to modify.

## 8. Target baseline is a family, not one magic file

“Convert to iOS 27.0.1” must not become one monolithic donor template.

Apple Camera writes different graphs depending on capture mode, resolution, HDR, Portrait, lens, Styles state and auxiliary resources. The compatibility target therefore needs a **baseline profile family**.

A target profile may be selected by capabilities such as:

- Styles only;
- Styles + Texture;
- Styles + Texture + Soft Skin;
- Styles + HDR;
- Styles + Texture + HDR;
- Styles + native depth;
- Styles + Texture + native depth;
- Styles + Texture + native depth + Portrait renderer;
- Live Photo variants where the still-image contract differs;
- primary/delta/HDR tile topology classes.

The first baseline should be established from validated, original iPhone 16 Pro fixtures captured on the chosen known-good iOS 27.0.x release. We must not assume in advance that every profile uses Styles schema `16`; the fixture audit decides the exact target contract.

Each profile needs a machine-readable manifest describing structure, not private image data.

Conceptual manifest:

```json
{
  "contractId": "apple-photos-27.0-baseline/styles-texture-hdr-v1",
  "sourceEvidence": "private-device-fixture-set",
  "styles": {
    "schema": 16,
    "requiredKeys": ["..."],
    "optionalKeys": ["..."]
  },
  "texture": {
    "uri": "tag:apple.com,2026:photo:metadata:texture_styles",
    "requiredMatteUris": ["..."]
  },
  "portrait": {
    "depthEncoding": "verified-contract-id",
    "renderer": "verified-template-id"
  },
  "hdr": {
    "representation": "verified-contract-id"
  },
  "container": {
    "ilocLayouts": ["..."],
    "requiredRelations": ["..."]
  }
}
```

The values above are illustrative. Actual identifiers must be generated only after fixture inspection.

## 9. Source adapters and target builders

Legacy Compatibility Export should separate two responsibilities.

### 9.1 Source adapter

A source adapter understands one specific future contract or contract family.

Responsibilities:

- positively identify the source contract;
- parse its semantic state;
- reject ambiguous variants;
- expose normalized semantics to the exporter;
- declare which source payloads may be reused byte-for-byte;
- declare which source resources must not be copied to the target;
- declare information loss, if any.

A source adapter must never be selected merely because the iOS version string is greater than 27.0.

Example conceptual output:

```js
{
  contractId: 'apple-camera-27.3-styles17-texture2',
  confidence: 'exact',
  semantics: {
    styleSelection: { id, tone, color, palette },
    stylesSceneData: ...,
    texture: { preset, grainSeed, peopleData, ... },
    portrait: { depthRole, focus, aperture, lightingState, ... },
    hdr: { representation, headroom, ... }
  },
  reusable: {
    primary: true,
    primaryTiles: true,
    hdrTiles: 'conditional',
    depth: true
  },
  losses: []
}
```

### 9.2 Target builder

The target builder emits one selected known-good baseline profile.

Responsibilities:

- create the validated item/reference/property graph;
- transplant only compatible source payloads;
- rebuild metadata from normalized semantics;
- preserve camera-specific values where the target contract accepts them;
- use sanitized reference metadata only where a compatibility template is truly required;
- perform a mutation-budget self-check;
- emit a compatibility report.

The source adapter must not write target bytes directly. This separation prevents future-source assumptions from leaking throughout the existing Styles/Texture/Portrait code.

## 10. Conversion pipeline

The proposed high-level pipeline is:

```text
input HEIC
   ↓
read-only discovery
   ↓
canonical contract fingerprint
   ↓
compatibility registry
   ├─ baseline / known-compatible → no downgrade required
   ├─ known-convertible          → choose exact source adapter
   └─ unknown                    → preserve-only; stop
                                     
known-convertible
   ↓
extract normalized semantics
   ↓
choose target baseline profile
   ↓
build conversion plan (dry run)
   ↓
validate mutation budget
   ↓
assemble target graph
   ↓
structural + byte-preservation self-check
   ↓
save NEW copy
   ↓
physical Apple Photos validation for adapter release
```

The dry-run plan should be inspectable before bytes are changed.

Example conceptual plan:

```text
Source: apple-camera-27.3/styles17-texture2
Target: apple-photos-27.0-baseline/styles-texture-hdr-v1

PRESERVE BYTE-EXACT:
  primary grid + 48 tiles
  HDR grid + 12 tiles
  thumbnail
  EXIF except explicitly mapped MakerNote entries

TRANSLATE:
  Styles v17 → baseline Styles contract
  Texture v2 → 2026 texture_styles
  future person mattes → 2026 matte roles

REBUILD:
  item/reference graph
  Styles sidecars
  Texture sidecars

DROP AFTER VERIFIED SEMANTIC CONVERSION:
  future-only Texture v2 metadata items

NOT TOUCHED:
  capture time
  GPS
  camera model
  content identifier
```

If the plan contains an unclassified Apple resource that could affect rendering, conversion must stop.

## 11. Mutation budget

Every adapter must declare an explicit mutation budget.

The exporter should record:

- item IDs/payload roles allowed to change;
- properties allowed to change;
- references allowed to change;
- EXIF/MakerNote tags allowed to change;
- items allowed to be newly created;
- source items allowed to be omitted from the target;
- payloads required to remain byte-identical.

After assembly, a generic verifier must compare source and output against that declaration.

An adapter is invalid if it changes anything outside its budget.

This extends the repository's existing “preserve original payloads and self-check” pattern into a formal contract.

## 12. Photographic Styles conversion

Styles conversion must be semantic and explicit.

For a future Styles schema:

1. verify the exact schema and required key set;
2. recover selected Style and pad state from the source's validated selection mechanism;
3. identify scene statistics, light maps, skin/person statistics and any new fields;
4. determine which values have a verified equivalent in the target baseline;
5. rebuild the target Styles item from target-derived/source-derived data as appropriate;
6. preserve unrelated MakerNote tags;
7. verify the resulting Photos editor state on device.

A future source schema must **not** be converted by:

- changing its schema number;
- deleting unknown keys until it parses like v16;
- copying a complete Styles blob from another photograph;
- copying scene/calibration values from an unrelated donor.

If a future field materially affects rendering and no baseline mapping is known, that adapter is not production-ready.

## 13. Texture / Grain / Soft Skin conversion

Texture is the most important future-compatibility risk because the current presence check is tied to the known 2026 URI.

The new inventory must distinguish:

- known 2026 Texture contract;
- native Texture capture metadata already understood by Stylio;
- unknown Apple Texture-like resources;
- no Texture evidence.

A future Texture contract may only be converted to the known 2026 target after same-file experiments establish semantics.

The adapter should recover, where validated:

- capture mode/preset;
- grain seed;
- Texture/Film state;
- people/face post-processing data;
- required semantic matte roles;
- instance-mask references;
- any strength/intensity values once their semantics are proven.

Unknown future Texture resources are never removed merely to “make room” for the 2026 graph.

Only an adapter that can prove equivalence may:

1. extract future Texture semantics;
2. rebuild the 2026 `texture_styles` payload;
3. build required 2026 mattes/sidecars;
4. omit the future Texture resources from the legacy target.

For iPhone 16 Pro photos that contain no native future Texture contract, the current known additive 2026 path may remain usable after the global classifier confirms that no unknown Apple rendering contract is present.

## 14. Portrait and Portrait Lighting conversion

Portrait has historically been relatively stable, but Legacy Export must still be contract-driven.

Principles:

- preserve native compressed depth byte-exact whenever its encoding is accepted by the target;
- never replace existing native depth with AI depth;
- never claim metadata can undo baked blur already present in primary pixels;
- preserve focus/aperture semantics only through validated mappings;
- use a known target Portrait renderer/template only when source semantics are understood;
- preserve source camera calibration values where target semantics permit;
- do not fabricate physical calibration from unrelated cameras.

If a future iOS changes only surrounding metadata but keeps the same accepted depth payload, the target builder should reuse that depth and translate only the renderer graph.

If a future iOS changes the depth representation itself, a dedicated depth adapter is required. Re-encoding depth should be a last resort and must be validated independently from primary-image preservation.

Portrait Lighting validation is mandatory because a file can be structurally valid while Photos renders lighting incorrectly.

## 15. HDR conversion

HDR must never be treated as a metadata-only concern.

Possible cases:

1. source HDR representation already accepted by target → preserve payload byte-exact;
2. source uses a known representation with a proven mathematical conversion → translate using a dedicated adapter;
3. source HDR representation is unknown → conversion blocked;
4. primary is SDR → no HDR conversion invented.

Primary HDR pixels should not be flattened to SDR merely to reach the legacy target.

Where a representation conversion requires re-encoding an auxiliary gain map, only that auxiliary resource may be re-encoded, and the adapter must quantify error and verify the declaration matches the new samples. This follows the existing `hdr-compatibility.js` precedent.

## 16. EXIF and MakerNote policy

The exporter must preserve EXIF identity truthfully.

Default policy:

- preserve camera make/model;
- preserve capture date/time, timezone and subseconds;
- preserve orientation semantics;
- preserve GPS unless the user separately requested metadata removal;
- preserve unknown MakerNote tags byte-exact whenever container reconstruction allows;
- rewrite only MakerNote fields that have a documented role in the selected target contract;
- do **not** rewrite EXIF `Software` simply to say “27.0.1”.

If Apple Photos compatibility ultimately requires a target-specific field that resembles an OS version, that field must be documented as part of the target contract and proven by A/B testing. It must not be introduced as a cosmetic downgrade.

## 17. Unknown Apple resource policy

The classifier should treat unknown Apple-owned namespaces conservatively.

Examples of evidence that should trigger `unknown-apple-contract`:

- unknown `tag:apple.com,...` item URI;
- unknown Apple auxiliary URI adjacent to known Styles/Texture/Portrait roles;
- a new Styles schema;
- new Texture-like MakerNote record;
- unknown rendering sidecar tied to primary/depth/Texture items;
- unknown essential property on a rendering-critical item;
- new reference type affecting known rendering items;
- known item with a structurally incompatible payload version.

Unknown generic metadata that is clearly unrelated to rendering may be preserved without blocking conversion, but that exemption must be narrow and test-backed.

## 18. iPhone 16 Pro long-term recovery scenario

The main product scenario is:

```text
iPhone 16 Pro
   ↓
updated to future iOS
   ↓
Camera begins writing a new Apple photo contract
   ↓
Stylio initially sees "unknown Apple contract"
   ↓
original is preserved; no risky mutation
   ↓
developer collects sanitized future fixtures
   ↓
new adapter is researched and device-tested
   ↓
adapter ships
   ↓
Legacy Compatibility Export
   ↓
new copy built using validated 27.0.x baseline family
   ↓
Photos still exposes editable Styles/Texture/Portrait controls
```

This is intentionally a two-stage safety model. Stylio does not need to predict Apple's future structure today. It needs to make unknown files safe today and make future adapters isolated and straightforward to add later.

## 19. Proposed module boundaries for implementation

No files in this section are to be created as code on the documentation-only branch. They are proposed architecture.

```text
web/src/compatibility/
  contract-fingerprint.js
  contract-classifier.js
  contract-registry.js
  conversion-plan.js
  mutation-budget.js
  legacy-export.js
  target-registry.js
  targets/
    photos-27-baseline.js
  adapters/
    <future-contract-id>.js
```

Possible supporting developer tools:

```text
tools/
  inspect-photo-contract.mjs
  compare-photo-contracts.mjs
  build-legacy-target-manifest.mjs
```

Possible tests:

```text
tests/web/
  compatibility-fingerprint.mjs
  compatibility-classifier.mjs
  legacy-export-plan.mjs
  legacy-export-styles.mjs
  legacy-export-texture.mjs
  legacy-export-portrait.mjs
  legacy-export-hdr.mjs
  legacy-export-preservation.mjs
```

The compatibility layer should orchestrate existing HEIF/Styles/Texture/Portrait primitives rather than duplicating parsers.

## 20. Registry design

The registry should contain exact, versioned contract IDs rather than broad “iOS >= X” rules.

Conceptually:

```js
{
  sourceContracts: {
    'apple-camera/current-known-v1': {...},
    'apple-camera/future-27.3-a': {...}
  },
  targets: {
    'apple-photos/27.0-baseline/styles-texture-hdr-a': {...}
  },
  adapters: {
    'apple-camera/future-27.3-a -> apple-photos/27.0-baseline/...': {...}
  }
}
```

Each production adapter entry should record:

- fixture evidence IDs;
- first Stylio version supporting it;
- target profile;
- expected information loss;
- automated regression suite;
- device/OS validation matrix;
- whether Photos save/reopen was tested;
- whether HDR was visually checked;
- whether Portrait Lighting was checked.

No adapter reaches production with only desktop structural tests.

## 21. Safe mode

Before any true downgrade adapter exists, the first implementation milestone should be **Future Contract Safe Mode**.

If a native Apple photo contains unrecognized rendering-critical resources:

- disable Texture addition;
- disable Texture repair;
- disable Soft Skin generation;
- disable AI Portrait/rebuild;
- disable any Styles reconstruction;
- preserve the original byte stream;
- report the detected unknown contract;
- optionally provide a sanitized diagnostic fingerprint for the user to share.

This is valuable independently of Legacy Export and prevents today's app from making a future file worse.

## 22. UX model

Legacy Compatibility Export should not silently replace normal processing.

Recommended eventual UX:

- normal processing remains default;
- if a source is known-convertible, Details may show “Legacy compatibility available”;
- an explicit action creates a second output copy;
- target is described by capability, not a fake OS downgrade promise;
- the original is never overwritten;
- if conversion drops a future-only feature, the UI must disclose it before export.

Early releases should keep this behind an Advanced/Experimental surface until enough real-device validation exists.

Suggested copy concept:

> **Legacy Compatibility Export** creates a new copy using a previously validated Apple Photos photo contract. Use it only when a newer native photo format is not yet compatible with Stylio's editing features. Your original photo is never changed.

Do not say “Downgrade iOS photo” because the phone/OS is not being downgraded.

## 23. Compatibility report

Every conversion should produce a compact internal report suitable for Details and debugging.

Fields should include:

- source contract ID;
- source fingerprint version;
- target contract ID;
- adapter ID;
- preserved payload count/bytes;
- translated contract families;
- dropped future-only resources;
- re-encoded auxiliary resources, if any;
- information-loss warnings;
- self-check result;
- output classifier result.

Do not expose private metadata unnecessarily.

## 24. Idempotence requirements

Two forms of idempotence are required.

### 24.1 Baseline input

A photo already matching the selected target baseline must be a no-op. The best behavior is to return the source bytes unchanged.

### 24.2 Reprocessed Legacy Export

Feeding a successful Legacy Export back into the exporter with the same target must not add duplicate Texture, duplicate mattes, duplicate Portrait sidecars or otherwise grow the file.

The classifier should recognize its structural target contract without relying on a Stylio-specific marker.

## 25. Failure handling

Failure must be atomic.

Before final assembly, all work occurs on copies/in memory. If any stage fails:

- do not publish a partial compatibility file;
- keep the original normal result available;
- report the stage and contract ID;
- release decoder/encoder/worker resources;
- do not retry with a weaker guessing strategy.

Examples of hard failures:

- unknown rendering-critical Apple item;
- source adapter mismatch;
- target profile cannot represent required semantic state;
- unsupported extent/property layout;
- mutation-budget violation;
- preservation hash mismatch;
- output does not reclassify as the intended target;
- required auxiliary payload cannot be rebuilt.

## 26. Privacy

All analysis remains on-device.

A sanitized compatibility fingerprint may be exportable for bug reports, but it must exclude:

- image payloads;
- thumbnails;
- faces/mattes;
- GPS;
- timestamps unless explicitly needed and redacted;
- filenames;
- content identifiers;
- serial-like identifiers.

Private fixture photos remain ignored and must never enter the deployed web bundle.

## 27. Release policy for a new future adapter

A future adapter is considered releasable only after all of the following are true:

1. original future fixtures exist;
2. source contract fingerprint is stable across more than one sample where practical;
3. every changed field/resource has an understood reason;
4. automated mutation-budget tests pass;
5. preserved image/depth/HDR payload hashes pass;
6. target output classifies as the intended baseline;
7. output imports into Apple Photos;
8. Styles controls appear and edits save;
9. Texture/Grain controls appear and edits save where applicable;
10. Soft Skin/Glow works where applicable;
11. Portrait aperture and focus work where applicable;
12. Portrait Lighting modes render and save where applicable;
13. HDR appearance is checked on a physical HDR display;
14. save → close Photos → reopen retains editability;
15. at least one round-trip through Photos is re-inspected structurally;
16. unsupported variants fail closed instead of being coerced.

## 28. Open questions requiring future fixtures

The documentation intentionally leaves these unanswered until real future samples exist:

- Will Apple increment the Styles schema or only add optional keys?
- Will Texture keep the 2026 URI and evolve its plist, or move to a new URI?
- Will new Texture generations remain representable by the 2026 contract?
- Will future Soft Skin use the same matte family?
- Will iPhone 16 Pro on future iOS adopt capture metadata previously seen only on newer hardware?
- Will Portrait keep the current depth encoding while changing only renderer metadata?
- Will HDR move to another gain-map/tmap representation?
- Will Photos continue accepting all current 27.0.x contract variants?
- Which future-only capabilities, if any, are impossible to express in the target and therefore must be disclosed as loss?

Answers must come from same-file/device experiments, not assumptions.

## 29. Relationship to existing documentation

This design extends the safety rule already recorded in `facts.md` §10.40: future format compatibility is not an iOS version downgrade.

It also builds on the current compatibility statement in `docs/web/processing-guide.md`: compatibility is based on file contents, unknown Styles schemas retain their data, and rewriting an iOS version string cannot convert an unknown contract.

This design turns those existing defensive rules into a future adapter architecture.

## 30. Definition of success

The feature succeeds when the following statement becomes true:

> Given a future Apple Camera HEIC whose contract has changed, Stylio can first preserve it safely while the contract is unknown; after an explicit source adapter has been researched and validated, Stylio can create a separate copy whose actual HEIF/Styles/Texture/Portrait/HDR structure matches a known-good baseline contract and remains editable in Apple Photos, while preserving original image data wherever the target allows.

Anything weaker than that—especially simply changing “27.3” to “27.0.1”—is not Legacy Compatibility Export.
