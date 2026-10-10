# Photographic Style Port: facts

How `photographic_style_port.py` changes the metadata of a normal HEIC so that Apple Photos
offers the Photographic Styles palette (风格 / 调色板), Portrait editing and, on iOS 27,
Texture/Grain (质感 / 颗粒). It covers everything tried from the early V-series experiments to
v0.6.2: what worked, what failed, and what is still open. Usage, testing and the version history
are in the [README](README.md).

**Status labels**

| Status | Meaning |
|---|---|
| ✅ **Proven** | Tested in Apple Photos on a device: the control appears, has a visible effect, and survives save → reopen → re-edit |
| ☑️ **Solid** | Verified at file level (libheif opens it; payloads byte- or pixel-identical; structure matches native files) or by calibration against native files, but not phone-tested on its own |
| 🔍 **Investigate** | A hypothesis, known gap, donor-derived value or unknown meaning; needs more work before it is final |

---

## 1. Overview

Photos decides which editing controls to offer from **what the file contains**, not from the
camera model. Each control appears when the file carries the data that control reads. The
renderer already runs on older iPhones; what an older photo lacks is the data. The port adds
it, and the decoded photo stays pixel-identical to the original. ☑️

### Design principle
Anything software can calculate or approximate is not considered a hardware-specific feature,
so writing it into a photo is not considered adding a hardware-only capability. The end goal
is a port that writes only five kinds of data:

1. **Format declarations**: item types, URIs, schema and pixel-format fields that describe
   what the file contains and how it is laid out.
2. **The photo's own data**: pixels, HDR, Exif, depth, mattes and sidecars, rearranged but not
   altered.
3. **Values calculated from the photo**: scalars such as tone statistics.
4. **Maps calculated from the photo**: images and grids such as light maps and the linear
   thumbnail.
5. **Neutral defaults**: software stand-ins for capture-time results the port cannot reproduce
   (identity, flat, empty). They claim nothing about the scene.

Exif `Make` / `Model` are never changed, so a ported photo still names the camera that took it.

Today the port also takes a structural template and a few values from a **donor**, a
normalized native iPhone 16 file embedded in the script. Donor-derived data is not part of the
end goal and remains an **open issue** (§8).

For where every piece of metadata stands today, see the status sheet in §2.1.

---

## 2. Metadata: status and requirements

### 2.1 Status sheet

Every piece of metadata the port writes, what kind of data it is (§1), and its status.

A row can be ✅ and still have an open point: it works, but something about it is not yet
understood or not yet in its final form.

**Photo data and container**

| Metadata | Port writes | Kind | Status | Open point |
|---|---|---|---|---|
| Primary image tiles + `hvcC`/`colr` | The photo's own, pixel-identical | Photo's own | ✅ | – |
| HDR gain-map tiles + `hvcC` | The photo's own | Photo's own | ☑️ | HDR rendering not tested on its own |
| HDR XMP sidecar (headroom) | The photo's own | Photo's own | ☑️ | – |
| `tmap` geometry (`ispe`/`irot`) | The photo's own, or derived from the primary | Photo's own | ☑️ | – |
| `tmap` payload (gain-map parameters) | The photo's own (since v0.5.1); a photo without one keeps none (v0.6.2) | Photo's own | ✅ | Donor's only on the `--graph donor` fallback |
| Ordinary thumbnail | The photo's own, or encoded from the primary if missing | Photo's own / map | ✅ | – |
| Exif, Make/Model unchanged | The photo's own | Photo's own | ✅ | – |
| Orientation `irot` / `imir` | The photo's own | Photo's own | ✅ | – |
| Item graph (IDs, `iref`, `ipma`, `ipco`, grids) | The photo's own, plus the style items (v0.6.2, §3); donor template only for sizes without a known StyleDeltaMap | Photo's own / format | ✅ | Standard full port does not reconstruct 48 MP / 640-pixel delta tiles; native add-texture keeps existing ones (§3) |
| `mdat` and `iloc` offsets | Rebuilt | Format | ✅ | – |

**Style palette**

| Metadata | Port writes | Kind | Status | Open point |
|---|---|---|---|---|
| MakerNote `0x54` | Fixed 8-key record, neutral pad | Format | ✅ | Members `1`/`2` vary with capture (likely the Tone/Color pad, §8); `4`, `6` vary too; the rest unknown |
| Styles item (`metadata:styles`) | New item | Format | ✅ | – |
| Styles `0` (schema), `e`/`f`, `g`, key `3` header | Fixed values | Format | ✅ | – |
| Styles `1` coefficients | Identity | Neutral approximation | ✅ | Identity intensifies Styles on native IMG_0754 in device isolation (§10.11); native values not reconstructed |
| Styles `3` tone curve | Identity | Neutral | ✅ | Native values not reproduced (affects the look, §9) |
| Styles `c`/`d` light maps, flat (default) | Constants | Neutral | ✅ | – |
| Styles `c`/`d` light maps, `--light-maps target` | Calculated from the photo | Map | ✅ | Stored orientation, no flip (fixed in v0.6.2, §4.1) |
| Styles `6` tone statistics | Calculated from the photo | Value | ☑️ | – |
| Styles `6` `highKey` | **Donor's** | Donor | 🔍 | Derivation unknown (§8) |
| Styles `i` (HDR range, `Gain`) | **Donor's** | Donor | 🔍 | Neither follows headroom or generation alone (§8) |
| Styles `h` | **Donor's** | Donor | 🔍 | Equals `Gain / 4` in all 30 native files; calculable once `Gain` is resolved (§8) |
| Styles `2` | **Donor's** (`True`) | Donor | ☑️ | `True` in all 30 native files: a format declaration (§8) |
| Styles `4`, `5`, `j` | **Donor's** | Donor | 🔍 | All three vary between native files; unknown (§8) |
| Styles `k` / `l` | Not written | – | ✅ | Not needed; `False` in every native file that has them |
| Delta map | Neutral constant tile | Neutral | ✅ | – |
| Linear thumbnail, `generate` | Encoded from the photo with its own `hvcC` | Map | ✅ | irot 90/270 were stored 180° off up to v0.6.1, causing a glow on some photos; fixed (§4.4) |
| Linear thumbnail, `reuse-thumbnail` | The photo's own thumbnail | Photo's own | ✅ | – |

**People layers and Portrait**

| Metadata | Port writes | Kind | Status | Open point |
|---|---|---|---|---|
| Classic semantic mattes | The photo's own | Photo's own | ✅ | Which mattes are needed individually |
| Matte slots the photo does not fill (with or without people) | Exactly empty 2016×1512 frame (since v0.6.1; before, the donor's near-empty matte) | Neutral | ✅ | – |
| `PersonMasksValidHint` | 1.0 when mattes are carried | Value | ✅ | – |
| `PeopleRatio` / `SkinRatio` | Not written (stay 0) | – | ✅ | Not needed for Soft Skin (§7) |
| Depth map | The photo's own | Photo's own | ✅ | – |
| XMP sidecars (depth, mattes) | The photo's own, remapped | Photo's own | ✅ | – |

**Texture and Grain (iOS 27)**

| Metadata | Port writes | Kind | Status | Open point |
|---|---|---|---|---|
| `texture_styles` item | Native iPhone 18 Pro record | Native record | ✅ | – |
| `HardwareModel` | `iPhone19,2` | Native record | ✅ | Names a device other than the photo's own (§8) |
| `FilmGrainSeed` | CRC-32 of the photo's first primary tile mod 256 (since v0.6.1; before, 92 for every photo) | Value | ✅ | – |
| `TextureStylePeopleDataVersion` | 3 | Native record | ✅ | – |
| `Preset`, `CaptureType`, `CaptureMode`, `PortType` | Native values | Native record | ✅ | Not tested one at a time |
| `TextureStylePostProcessedPeopleData` (photos with people) | One entry per face: boxes and angles from the photo's face regions, a fixed landmark layout, median native colour statistics | Value / neutral | ✅ | Turned faces (beyond ~30°) less accurate (§7) |
| 2026 matte set (×12) | Empty frames; on photos with people, skin v2, face skin and person carry the photo's own skin / Portrait matte | Neutral / photo's own | ✅ | – |
| 2026 matte sidecars (×12) | Native XMP | Format | ☑️ | Not tested without the mattes |
| `semanticpersoninstances` (photos with people) | One per face: the photo's own Portrait matte, keyed XMP sidecar | Photo's own | ✅ | One matte serves every face |
| Soft Skin result | – | – | ✅ | Needs all of the above together (§7) |

### 2.2 What each control needs

Numbers refer to the item reference in §2.3.

| Control | Needs | What happens without it |
|---|---|---|
| **Style palette** | #1 MakerNote `0x54`, #2 styles item, #3 linear thumbnail with a matching `hvcC`, #4 delta map, #5 HDR/`tmap` structure | No `0x54` → no palette. Mismatched linear-thumbnail `hvcC` → palette appears but edits do nothing. |
| **People layers** (people and background styled separately) | #8 the photo's own mattes with sidecars, #9 `PersonMasksValidHint = 1.0` | People and background are styled as one layer |
| **Portrait** | #6 depth map + #7 its XMP sidecar; necessary in tested cases, not sufficient to guarantee aperture/lighting editing for every exported copy (§10) | Portrait is not offered, or is offered but does nothing; menu visibility alone does not prove full editing support |
| **Texture and Grain** (iOS 27) | #10 `texture_styles` + all twelve #11 2026 mattes (with #12 sidecars) | #10 without #11 **removes the whole palette** |
| **Soft Skin** (iOS 27) | #10 with per-face people data + #13 person instances + real skin v2, face skin and person mattes in #11 | Missing any one of them, Soft Skin looks the same as Standard (§7) |

Texture and Grain have only ever appeared as a pair; no separate requirement for either is
known.

Tested and **not** required:

| Candidate | Result ✅ |
|---|---|
| Exif `Make` / `Model`, filename, other Exif fields | Changing them does nothing. Some real iPhone 16 photos have no style data and get no palette. |
| Styles schema 16, keys `k` / `l` (iOS 26.5 / 27 additions) | Schema 14 works on iOS 27, palette and Texture/Grain included |
| 13-key `0x54` (iPhone 18) | The 8-key form works on iOS 27 |
| Item order | Does not matter |
| Native coefficients, tone curve, light maps, delta map content | Identity, flat and neutral values work |
| Matte content | Empty mattes are enough for the palette |

### 2.3 Item reference

| # | Item | Identifier | Lives in | Port writes | Evidence |
|---|---|---|---|---|---|
| 1 | Apple MakerNote tag `0x54` | Exif `0x8769` → MakerNote `0x927C` → tag `0x54` (type 7) | Exif item | 109-byte, 8-key bplist `{0:1, 1:0.0, 2:0.0, 3:1.0, 4:1, 5:1, 6:4, 7:0}`, as in every native photo shot with the pad untouched; Apple's demo shots differ in `1`/`2` (and `4`, `6`), see §8 | ✅ |
| 2 | Styles item | `uri ` item `tag:apple.com,2023:photo:metadata:styles`, `cdsc` → primary + `tmap` | `iinf` + `mdat` | Mix of calculated, neutral and donor fields (§4.1) | ✅ |
| 3 | Linear thumbnail | aux `tag:apple.com,2023:photo:aux:linearthumbnail` | `hvc1` item, own `hvcC`/`ispe`/`pixi`, shared `irot` | Encoded from the photo (Main10, 1024×768), or the photo's own thumbnail reused | ✅ |
| 4 | Style delta map | aux `tag:apple.com,2023:photo:aux:styledeltamap` | `grid` of 512×512 Main10 tiles | One constant neutral tile in every slot | ✅ |
| 5 | HDR gain map + `tmap` | aux `urn:com:apple:photo:2020:aux:hdrgainmap`; `tmap` item | `grid` + derived item | The photo's tiles, `hvcC`, `tmap` geometry, `tmap` payload (v0.5.1) and HDR XMP. | ☑️ |
| 6 | Depth map | aux `urn:mpeg:hevc:2015:auxid:2` | `hvc1` item, own `ispe`/`pixi`/`colr`/`hvcC`, shared `irot` | The photo's own item, `auxC` included | ✅ |
| 7 | Depth sidecar | `mime` `application/rdf+xml`, `cdsc` → depth; `apdi:*` ranges/formats, `depthBlurEffect:*`, `depthData:Accuracy`, `portraitLightingEffect:*` | `iinf` + `mdat` | The photo's own sidecar, remapped to the new depth item | ✅ |
| 8 | Classic semantic mattes | `urn:com:apple:photo:` `2018:aux:portraiteffectsmatte`, `2019:aux:semanticskinmatte` / `semantichairmatte` / `semanticteethmatte`, `2020:aux:semanticglassesmatte` / `semanticskymatte` | `hvc1` items + XMP sidecars | The photo's own mattes; unused slots refilled with an empty matte | ✅; which mattes are individually needed 🔍 |
| 9 | Person-mask hint | styles key `7` → `PersonMasksValidHint` | styles plist | 1.0 when the photo's mattes are carried | ✅ |
| 10 | Texture styles item | `uri ` item named `metadata`, `tag:apple.com,2026:photo:metadata:texture_styles`, `cdsc` → primary + `tmap` | `iinf` + `mdat` (216-byte bplist; ~5 KB per face with people) | The record from a native iPhone 18 Pro capture (§5.1); on photos with people, plus per-face people data (§7) | ✅ |
| 11 | 2026 matte set (×12) | `tag:apple.com,2026:photo:aux:` + `semanticnosematte`, `semanticskinmattev2`, `semanticnonfaceskinmatte`, `semanticlipsmatte`, `semanticteethmattev2`, `semanticpersonmatte`, `semanticglassesmattev2`, `semanticeyebrowsmatte`, `semantictattoomatte`, `semantichandsmatte`, `semanticearsmatte`, `semanticfaceskinmatte` | 12 `hvc1` items: shared `ispe`/`pixi`/`hvcC`, own `auxC`, primary `irot`, `auxl` → primary + `tmap` | Empty 768×576 8-bit frames (156 B each); with people, skin v2 / face skin = the photo's `semanticskinmatte` and person = its `portraiteffectsmatte`, each with that matte's `ispe`/`pixi`/`hvcC` | ✅ |
| 12 | 2026 matte sidecars (×12) | `mime` items, `cdsc` → each matte; `fsincMattes:FSINCMatteVersion 0` | `iinf` + `mdat` | Native 357-byte XMP | ☑️; never tested on its own |
| 13 | Person instances (one per face) | aux `tag:apple.com,2026:photo:aux:semanticpersoninstances` + `mime` sidecar with `fsincMattes:InstanceMaskReferenceKey` | `hvc1` items wired like #11 | The photo's `portraiteffectsmatte`; keys `FSINCInstanceMask9`, then `0`, `1`, … as native files number them | ✅ |

### 2.4 What the port writes, by kind

Sorted by the five kinds in §1. The donor row is the open issue in §8.

| Kind | Contents |
|---|---|
| Format declarations | URIs and item types of #2–#12; styles `0`, `e`/`f`, `g` (`'L00h'`, the half-float pixel format of the light maps) and the key `3` header; XMP version strings; #1 `0x54` (identical across native files, so treated as a format record; member meanings 🔍) |
| The photo's own data | Primary, HDR and thumbnail tiles with their `hvcC`/`colr`; Exif; `irot`/`imir`; `tmap` geometry; HDR XMP; #6–#8 depth, sidecars and mattes; on people photos the skin/person mattes in #11 and #13 |
| Values calculated from the photo | Styles key `6` tone statistics; #9 hint (set from whether the photo has mattes); face boxes and angles in the #10 people data (from the photo's face regions) |
| Fixed values from native Soft Skin photos | Landmark layout and colour statistics in the #10 people data (medians of 14 native faces) |
| Maps calculated from the photo | #3 linear thumbnail; light maps with `--light-maps target`; a synthesized thumbnail when the photo has none |
| Neutral defaults | Identity coefficients and tone curve; flat light maps (default); #4 neutral delta map; #11/#12 empty 2026 mattes; an exactly empty frame in every matte slot the photo does not fill |
| Taken unchanged from a native capture | #10 `texture_styles`, including `HardwareModel` and a fixed `FilmGrainSeed` (both 🔍, §8) |
| **Donor** | Styles `i`, `h`, `4`, `highKey`, `2`, `5`, `j` |

---

## 3. What `patch` does, step by step

1. **Choose a route.** A photo with no style data gets the full port. A photo that already has
   native style data (iPhone 16/17) only gets Texture/Grain added (§5.4). A photo that already
   has `texture_styles` is refused.
2. **Keep the photo's own item graph** (v0.6.2, default). A native iPhone 16+ file differs from
   an iPhone 15 photo only by a linear thumbnail, a StyleDeltaMap grid, the styles item,
   MakerNote `0x54` and the `ftyp` brands `MiHA`/`heix`. Tiles, HDR, `tmap`, Exif, mattes, depth
   and sidecars are already the photo's own, so they stay where they are, byte for byte.
3. **Add the style items** with the property bytes every native file uses (identical in 31
   native files and both donors): linear thumbnail (`ispe`, `pixi` 3×10-bit, `auxC`, `hvcC`,
   primary `irot`; `auxl` → primary + `tmap`); StyleDeltaMap grid (`colr` "Display P3 Linear"
   ICC, `ispe`, `pixi`, `auxC`, primary `irot`; descriptor in `idat`; `dimg` → 512×512 tiles with
   `ispe`/`colr`/`hvcC`); styles `uri` item named `metadata` (`cdsc` → primary + `tmap`). The
   StyleDeltaMap size comes from the native table below; a photo of another size falls back to
   the donor graph.
4. **Insert MakerNote `0x54`** into the photo's Exif (§3.3).
5. **Write the style data:** the styles plist (§4.1), a neutral delta map (§4.2) and a linear
   thumbnail made from the photo (§4.3).
6. **Add the Texture/Grain set** (§5), with Soft Skin data when the photo has people (§7).
7. **Rebuild the file:** new `ftyp` and `meta` in front, every original payload in place
   (offsets shift by the header growth), new payloads in one appended `mdat`, then a
   self-check.

| Primary (stored) | StyleDeltaMap | Tiles |
|---|---|---|
| 4032×3024 (12 MP) | 2880×2160 | 6×5 |
| 5712×4284 (24 MP) | 4096×3072 | 8×6 |
| 3088×2316 (front) | 2240×1680 | 5×4 |
| portrait-stored | the same, swapped | |

8064×6048 (48 MP) natives use 640-pixel delta tiles; reconstructing that layout is not
handled by the standard full-port route. Native `add-texture` preserves an existing
delta map rather than reconstructing it. The browser's estimated experimental geometry
is a separate, unvalidated route, not support for reproducing that native layout.

**Phone A/B** (v0.6.2): 48/12 photos with and without an encoder, a Portrait photo with a face
(Portrait, people layers, Soft Skin), and 24 MP / 12 MP re-saved photos without thumbnail or
`tmap` all work with the photo's own graph. ✅

**Donor graph** (`--graph donor`, the only route up to v0.6.1): pick a template by tile layout
(`48-12` or `45-15`), move the photo's tiles, thumbnail, orientation, `tmap`, mattes, depth and
sidecars into its item slots with their `hvcC`/`colr`, then write one fresh `mdat`.

### 3.1 Payloads travel with their decoder configuration
A compressed payload and its `hvcC` (and `colr`, where it has one) must always move together.
This was learned twice:

- **Primary tiles (v0.1 → v0.1.1).** The photo's tiles combined with the donor's `hvcC` showed
  rectangular block corruption. Moving the photo's own `hvcC` and `colr` along fixed it, and the
  output now decodes identically to the source. ✅
- **Linear thumbnail (V7 → V8).** Apple stores one VCL NAL in the payload and the VPS/SPS/PPS in
  `hvcC`. V7 replaced the payload but kept the donor's `hvcC`: the palette appeared but edits
  did nothing. Even re-encoding the *donor's own* image failed, so the problem was never the
  pixels. V8 encoded each candidate as a one-frame MP4 and moved the sample together with that
  MP4's `hvcC`. All four variants worked. ✅

When some items in a shared property slot get the photo's payloads and others keep donor
payloads, the port appends a second `hvcC` and repoints only the items that changed.

### 3.2 Template details (current mechanism; replacing it is open, §8)
- `extract-donor` turns a native iPhone 16/17 HEIC into a profile ZIP: `manifest.json`,
  `ftyp.bin`, `meta.bin`, `makernote_0x54.bin` and `payloads/<iid>.bin`. The donor's pixels,
  HDR, thumbnail, Exif and linear thumbnail are left out, so no donor image content reaches the
  output. ✅
- The two profiles are embedded in the script (zlib + base85).
- A matching tile count is not enough on its own: grid geometry, tile order, `hvcC`, `colr` and
  property associations must all line up. ☑️
- Do not rename the `smartstyle-port-donor-profile` format marker or the
  `smartstyle_makernote_*` manifest keys. They are stored inside the embedded ZIPs, and renaming
  them breaks loading.

### 3.3 MakerNote `0x54`
- Same style data, `0x54` absent → no palette; `0x54` present → palette works (V9). ✅
- Copying the donor's **whole** Exif also brings back the palette, but it carries unrelated
  donor capture state: one test showed a Portrait option on a photo with no usable subject.
  Only `0x54` is inserted. ✅

How the insertion works (`inject_apple_makernote_tag`):
1. Follow IFD0 → `0x8769` ExifIFD → `0x927C` MakerNote and require the `Apple iOS` header.
2. Rebuild the MakerNote IFD with `0x54` added or replaced, sorted by tag. If an entry is added,
   shift every out-of-line value offset by +12.
3. Append the rebuilt MakerNote at the end of the TIFF and point `0x927C` at it (type 7). The
   old MakerNote stays in place, unused, so no other Exif offset moves.

Photos taken with the old Photographic Styles (`SemanticStyle`, iPhone 15 era) have none of the
new items. Changing a preset ID cannot upgrade them; the new item graph has to be built.
☑️

---

## 4. Style data in detail

### 4.1 The styles plist, field by field

| Key | Shape | Meaning in native files | Port writes | Evidence |
|---|---|---|---|---|
| `0` | int | Schema: 14 (iOS 18.2), 15 (iOS 26.5), 16 (iOS 27) | 14 | ✅ |
| `1` | 51,840 B FP16 = 2×18×24×10×3 | Per-region 2nd-order RGB polynomial `[1,R,G,B,R²,G²,B²,RG,RB,GB]`; differs per scene | Identity | ✅ |
| `3` | 516 B = 4 B header + 256 × u16 | Global tone curve | Identity | ✅ |
| `c`, `d` | 32×32 FP16 (`e` = `f` = 32) | Light maps (tone-mapped / linear) | Flat 0.31152 / 0.20093 by default; calculated with `--light-maps target` | flat ✅; calculated ✅ (V10); current fit ☑️ |
| `6` | dict of stat blocks | `ToneMappedImage` / `LinearImage` percentiles, black/white point, `highKey` | Calculated from the photo (default); `highKey` from donor | ☑️ |
| `7` | dict | `PeopleRatio`, `SkinRatio`, `PersonMasksValidHint` | Hint 1.0 when mattes are carried; ratios never written | ☑️ |
| `g` | int | `1278226536` = `'L00h'`, pixel format of `c`/`d` | Same in every file | ☑️ |
| `i` | dict | HDR range: `OriginalRangeMin/Max`, `Gain` | Donor values | 🔍 (§8) |
| `h` | float | Exactly `i.Gain / 4` (30 of 30 native files) | Donor value | 🔍 (§8) |
| `4` | float | Unknown; 4.0–18.3, repeats exact values | Donor value | 🔍 (§8) |
| `2` | bool | `True` in all 30 native files | Donor value (`True`) | ☑️ format |
| `5`, `j` | int, float | Unknown; `5` is 0 or 2, `j` 1.0–1.33 | Donor values (0, 1.0) | 🔍 (§8) |
| `k`, `l` | bool | Added in iOS 26.5 / 27; always `False` | Absent | ✅ not needed |

Native coefficients, tone curve and light maps all differ from scene to scene (about 93% of
the key `1` bytes differ between two shots), but none of them is needed for the controls to
work.

**Calibration** (v0.3.1, regression on eight native files):
- `ToneMappedImage` holds percentiles of **linear-light** display luma (mean ratio 0.980,
  sd 0.076). v0.3.0 wrote gamma-encoded values, about 2× too high; that has since been fixed.
- `LinearImage` is the same signal × **0.166** (leave-one-out MAE 0.013).
- The light maps are stored in the primary's stored orientation, track linear luma, and clamp
  at 0.040741. The fits are `c = clamp(0.7774·L + 0.0294)` and `d = clamp(0.6542·L − 0.0128)`,
  with leave-one-out MAE 0.022 / 0.037 against 0.146 / 0.115 for the flat values.
- Orientation re-checked in v0.6.2 on 30 native files at `irot` 0, 180 and 270: the native
  `c` map matches the stored-orientation sample as is (r 0.94–0.99). The "180° rule" used up to
  v0.6.1 only cancelled the swapped 90/270 mapping (§4.4) and left 0/180 maps upside down. ☑️

### 4.2 Delta map: neutral, never the donor's
- Native delta maps are 10-bit RGB centred on 512 (about 470–560). Amplified, they show the
  scene they came from. ☑️
- With the donor's delta map, edits followed **the donor's scene regions** on the target.
  Flattening the light maps did not help; a constant neutral tile did (V11). ✅
- Editing still works with a neutral map, so it is a correction layer on top of the style, not
  the style itself: `styled ≈ F(image, style) + D(x, y)`, with `D = 0` in ports.
- Every tile gets the same neutral 512×512 Main10 sample with a matching `hvcC`.

### 4.3 Linear thumbnail
- Native: 1024×768, 10-bit HEVC Main10, sharing the primary's `irot`.
- **`generate`** (default): decode the photo, return it to its **stored** orientation, scale,
  encode Main10 with libx265, then move the sample and its `hvcC` in together. ✅
- **`reuse-thumbnail`** (v0.4.4): reuse the photo's own 8-bit thumbnail, which needs no encoder.
  Its `pixi` is shared with other items, so a new one is appended and only the linear thumbnail
  points to it. The browser reuses a present thumbnail; when absent, it generates a
  Main10 linear thumbnail locally with libheif and FFmpeg.wasm. ✅ for the tested reuse path;
  browser generation remains subject to device verification.
- With neutral coefficients, flat light maps and a neutral delta map, the linear thumbnail is
  the renderer's **only spatially varying input**. A misoriented one is therefore the main
  possible source of blocky or patchy results.

### 4.4 Orientation and `tmap`
- Both templates share **one `irot` = 270°** across the primary, thumbnail, HDR grid, delta grid
  and linear thumbnail. Until v0.3.0 this made every photo with a different orientation display
  rotated. Now the photo's own `irot` (and `imir`, if the template has a slot) replaces it.
  ☑️
- `tmap` states its size in **display** orientation and has its own `irot`. Without updating
  it, Windows Photos (which renders through `tmap`) showed a black band under landscape ports.
  v0.4.1 copies the photo's `tmap` geometry, or derives it from the primary. ☑️
- **90/270 inversion, fixed in v0.6.2** ✅: up to v0.6.1 `raw_orientation_filters` (and
  `web/src/media/decode.js`) swapped irot 90 and 270, so linear thumbnails of those photos were
  stored 180° off. An early A/B showed nothing, but a 24 MP photo at irot 270 with sky above
  trees got a glow in the sky and foliage with both the donor and the photo graph; the
  corrected rotation removed it, and a 12 MP irot-270 photo that had passed still passed. Checked against 30 native files: Apple's own linear
  thumbnails match the corrected stored-orientation sample at every irot (r 0.83–0.97), never
  the 180°-turned one.
- With the photo's own graph (v0.6.2) the photo's `irot`, `imir` and `tmap` are simply kept.

---

## 5. Texture and Grain (iOS 27, v0.5.0)

### 5.1 What iPhone 18 files add
On iOS 27, Photos on an iPhone 15 Pro offers Texture/Grain for iPhone 18 photos, so the
renderer runs on older hardware too. Compared with iPhone 16 files, iPhone 18 files add
`texture_styles` (#10), the 2026 matte set (#11) with sidecars (#12), styles schema 16 with
`k`/`l`, and a 13-key `0x54`. Only #10 and #11 matter.

`texture_styles` is a 216-byte bplist with no pixel data:

| Field | Value | Notes |
|---|---|---|
| `Preset` / `CaptureType` / `CaptureMode` / `PortType` | `Standard` / `LF` / `Still` / `PortTypeBack` | Native values; not tested separately |
| `HardwareModel` | `iPhone19,2` | The iPhone 15 Pro value keeps the controls but makes white areas glow under some styles, so it likely selects render parameters. Names a device other than the photo's own. 🔍 (§8) |
| `TextureStylePeopleDataVersion` | 3 | Absent / 0 / 1 / 2 did not help a build missing #11 |
| `FilmGrainSeed` | 92 | Grain is generated from it at render time. Up to v0.6.0 every port got this same pattern; since v0.6.1 the port writes a per-photo seed (§8) |

### 5.2 On-device tests (iPhone 15 Pro, iOS 27; one 48/12 and one 45/15 photo)

| Build | Palette | Texture/Grain |
|---|---|---|
| iPhone 18 donor profile, unmodified | ✅ | ✅ |
| … with styles v14 and 8-key `0x54` | ✅ | ✅ |
| … with `texture_styles` disabled | ✅ | ❌ |
| … with `HardwareModel` → `iPhone16,1` | ✅ | ✅ but white areas glow |
| … with the 2026 matte URIs made unrecognisable | **❌** | ❌ |
| … with `texture_styles` placed after Exif | ✅ | ✅ |
| **v0.4.4 file + `texture_styles` only** | **❌** | ❌ |
| v0.4.4 file + `TextureStylePeopleDataVersion` absent / 0 / 1 / 2 | ❌ | ❌ |
| **v0.4.4 file + `texture_styles` + 12 empty 2026 mattes (v0.5.0)** | ✅ | ✅ |

`texture_styles` without the 2026 mattes removes the whole palette; item order does not matter.
✅ The test profiles come from `tools/texture_variants.py`.

### 5.3 Why it is added on top of the iPhone 16 templates
iPhone 18 donor profiles work on photos without people but **crash on people/Portrait photos**:
their matte set does not fit the people path. Adding the texture set to the v0.4.4 templates
leaves that path untouched, and `--texture off` reproduces v0.4.4 byte for byte.

How the set is appended (`add_texture_items`):
- Shared `ispe`, `pixi` and `hvcC` once, then one `auxC` per matte.
- Properties associated in native order, `ispe, pixi, auxC, hvcC, irot` (descriptive before
  transformative, as HEIF requires).
- Then the 12 sidecars, then the `texture_styles` item.
- The result matches native iPhone 18 files: property bytes, order, essential flags,
  references, payloads and sidecars. ☑️

### 5.4 Photos that already have style data (`add-texture`)
Porting a native iPhone 16/17 photo would replace its real style data with neutral values, so
only #10–#12 are inserted:
- `meta` grows (about 2.5 KB) and every external offset shifts by exactly that amount; new
  payloads go into one small `mdat` at the end.
- Before writing, every original payload must re-extract byte-identical and every new one must
  read back as written.
- Only Apple's native layout is accepted (iloc v1 4/4/0/0, iref v0, narrow ipma).
- Tested on native photos with and without people, including one with depth. ✅

### 5.5 Photos without a thumbnail
Some copies re-saved by iOS have no thumbnail and no `tmap`. Since v0.5 the port encodes a
thumbnail from the primary (416×312, 8-bit HEVC Main, stored orientation, its own `hvcC`).
✅ This was previously unavailable in the browser. The current web app can generate a missing
thumbnail locally using the optional HEVC encoder (`web/src/codecs/linear-thumbnail.js`), requiring
cross-origin isolation and an encoder download on first use. Native `add-texture` does not
need this encoder.

---

## 6. People layers and Portrait

### 6.1 Layers in a people or Portrait photo
Each layer is a separate auxiliary image and drives a different control:

| Layer | Items | Separates | Drives | Port |
|---|---|---|---|---|
| Person and skin | Classic mattes #8 + sidecars | People, skin and hair from the background | People-aware styling | The photo's own mattes |
| Mask trust | `PersonMasksValidHint` #9 | – | Whether Photos uses the masks at all | 1.0 when mattes are carried |
| Depth | Depth map #6 + sidecar #7 | Subject from background by distance | Portrait (blur, depth effects) | The photo's own item and sidecar |
| iOS 27 people regions | 2026 mattes #11, person instances #13, people data in #10 | Faces, skin and each person | Soft Skin | The photo's own skin/Portrait mattes and face regions; other 2026 mattes empty (§7) |
| Light (not semantic) | Styles `c`/`d` | Bright from dark regions | Local tone adjustment | Flat or calculated |

### 6.2 Rules
1. **Layers come only from the photo itself.** A donor matte with content would apply the
   donor's regions to an unrelated photo, the same leak as the donor delta map. Slots the photo
   cannot fill get an empty matte.
2. **Never invent a layer.** A photo without mattes gets no people layer, and styling it as a
   whole is then correct. `PeopleRatio` / `SkinRatio` are never written; they are not matte
   coverage (on two native people photos, one matched within 10%, the other was 17× off).
3. **Mattes and depth are independent.** A Portrait of an object has depth and no mattes.
4. **A layer without its XMP sidecar does nothing.** The sidecar tells Photos how to read the
   samples. Every sidecar is carried and pointed at the item's new ID.
5. **Layers must line up with the photo:** shared primary `irot`, and `auxl` → primary + `tmap`.
6. **Each payload keeps its own `hvcC`.** Copy `auxC` byte for byte, because Apple stores extra
   `aux_subtype` data after the URI.
7. **The mask-trust flag must agree with the layers.** Real mattes with the hint at -1.0 still
   give whole-frame styling. The hint means "masks computed", not "person present"; native
   photos without people carry 1.0 too.
8. **Portrait must come from the photo's own depth**, never from donor capture state (§3.3).

New items are appended at the end of `ipco`, so no existing property index moves. Each needs one
`infe`, one `iloc` entry, one `ipma` entry and one `auxl`/`cdsc` reference.

### 6.3 History

| Version | Problem | Fix | Status |
|---|---|---|---|
| ≤ v0.3.1 | Edits worked, but **people and background changed as one layer**. Ports carried the donor's empty mattes and its `PersonMasksValidHint = -1.0` ("no usable masks"), and the photo's own mattes were dropped. | – | Observed ✅ |
| v0.3.2 | — | Carry the photo's mattes, refill unused donor slots with empty ones, set the hint to 1.0 (opt-in `--people on`) | People and background now separate ✅ |
| v0.4.0 | — | Automatic; photos without mattes come out byte-identical | ☑️ |
| v0.4.2 | Portrait missing: the depth map was dropped | Add depth as its own item, separate from the mattes; copy `auxC` byte for byte | ✅ |
| v0.4.3 | Portrait still did nothing: only half the XMP sidecars were carried | Carry every sidecar. This also replaced the donor's HDR headroom sidecar with the photo's. | ✅ |

Flat light maps (v0.3.1 note) also make tone adjustment uniform across the frame, but that is a
separate issue: they carry no people information.

---

## 7. Soft Skin (v0.6.0) ✅

Up to v0.5.1, Soft Skin looked the same as Standard on every port and every `add-texture` photo.

**What native photos carry.** Twelve native iOS 27 photos where Soft Skin works (iPhone 18,
14 faces) all have, beyond the v0.5 items:
- `texture_styles` of ~5.5 KB per face instead of 216 bytes: a
  `TextureStylePostProcessedPeopleData` array placed after `CaptureMode`, one entry per face, with
  `faceROI`, `faceSkinROI`, 76 `faceLandmarks`, `faceYaw`/`facePitch`/`faceRoll`, `instanceROI`,
  `instanceMaskReferenceKey` and `imageStats` (`Mattify`, `SkinSmoothingStandalone`,
  `UnderEyeBrightening`). The one face turned 45° has an empty `SkinSmoothingStandalone`.
- one `semanticpersoninstances` matte per face (#13), its XMP naming the key the entry uses;
- real 2026 skin v2, face skin and person mattes.

**Phone A/B** (iOS 27; add-texture photos and ports; one change at a time):

| Build | Soft Skin |
|---|---|
| v0.5 (all 2026 mattes empty, 216-byte `texture_styles`) | Same as Standard |
| Skin v2 / face skin / person mattes from the photo's own only | Same as Standard |
| People data only, or people data + instances | Same as Standard |
| Mattes + people data, no instances | Same as Standard |
| Mattes + instances, no people data | Same as Standard |
| People data + instances + skin mattes, no person matte | Looks different, but no real smoothing |
| People data + instances + skin mattes + person matte | **Works** ✅ |
| … plus `SkinRatio`/`PeopleRatio`, skin statistics in styles `6`, key `k` | Works; adds nothing |

**What the port writes** when the photo has face regions (MWG XMP), a `semanticskinmatte` and a
`portraiteffectsmatte` (Portrait-mode photos; iPhone 16+ photos of people):
- Skin v2 and face skin carry the photo's `semanticskinmatte`, person its
  `portraiteffectsmatte`, each with that matte's own `ispe`/`pixi`/`hvcC`. The other nine stay
  empty.
- One person instance per face, all carrying the Portrait matte.
- One people entry per face region. Measured against the 14 native faces: `faceROI` is the XMP
  region (centre → corner) × 0.968; the XMP `AngleInfoRoll` is the face's rotation in stored
  pixels, which places the landmarks; `faceRoll` = −(roll − irot) and `faceYaw` = yaw, in
  radians. Landmarks are a fixed median layout scaled into the face box; colour statistics are
  native medians; `instanceROI` is the full frame, so nothing is decoded (phone-tested on one-
  and three-face ports and add-texture photos ✅). Leave-one-out on
  frontal faces: centre within 1–6%, landmarks within 3–10% of face width.
- Values are rounded to 1e-6 and written by the same bplist layout in Python and the browser,
  so both builds produce identical bytes.

The upstream Python path leaves photos without face regions or either matte as v0.5.1 wrote
them: nothing is detected or invented. The browser now offers AI supplementation (§10.7).
🔍 Open: turned faces (the template is frontal), measured `instanceROI`,
and whether the colour statistics matter; a measured `instanceROI` was not needed.

---

## 8. Donor-derived data: open issues 🔍

Nothing in the final port should come from the donor (§1). Each item below must become a format
declaration, the photo's own data, a calculated value or map, or a neutral default. A value that
proves identical in every native file of a format or capture generation counts as a format
declaration. Findings come from comparing the two templates with 30 native style files
(iPhone 16, 17 and 18; iOS 18.2, 26.5 and 27, including Apple's own demo shots), with their HDR
headroom, `tmap` parameters, lenses and Exif.

| Donor data | What is known | Likely resolution | Status |
|---|---|---|---|
| **`tmap` payload** (gain-map headroom, gain min/max, gamma, offsets) | Up to v0.5.0 every port paired the donor's parameters with the photo's gain map, so HDR highlights used the wrong curve. **v0.5.1 copies the photo's own.** Re-saved photos without a `tmap` still get the donor's. | **Photo's own data** (done). Since v0.6.2 a photo without a `tmap` keeps none, as it came. | ✅ v0.5.1 / v0.6.2; re-saved photos without `tmap` phone-tested |
| **`h`** | Exactly `i.Gain / 4` in all 30 files | **Calculated**, once `Gain` is resolved | Rule known |
| **`i.OriginalRangeMax` / `Min`** | Rises with HDR headroom but is not a function of it: iPhone 18 Pro Max shots reach ~1.0 at headroom 3.4–3.9, an iPhone 17 shot at 4.84 gives 0.31, one at 3.07 gives 0.02. Min is −0.16…0. | Depends on the scene; not calculable from headroom alone | 🔍 |
| **`i.Gain`** | 14.6 (iOS 18.2); 8.4–9.8 (iOS 26.5) with one 2.29; 7.7–10.6 (iOS 27). Not a per-generation constant. | Unknown | 🔍 |
| **`4`** | 4.0–18.3; repeats exact values (5.646 ×5, 5.692 ×3, 4.031 / 4.877 ×2), so likely quantized; no link to lens, brightness, ISO or headroom | Unknown | 🔍 |
| **`highKey`** (in `6`) | 0.52–0.92 across scenes | Unknown | 🔍 |
| **`2`** | `True` in all 30 files | **Format declaration** | ☑️ |
| **`5`** | 0 or 2; both values occur with the same lens, phone and iOS | Unknown | 🔍 |
| **`j`** | 1.0 up to iOS 18.2; 1.0–1.33 on iOS 26.5/27 | Unknown | 🔍 |
| **MakerNote `0x54`** | Members `1`/`2` are 0 in every photo shot with the pad untouched and −0.84…0.99 in Apple's demo shots: very likely the Tone/Color pad position at capture. `4` (1 or 11) and `6` (4 or 8) vary too. | The port's 0/0 is the neutral pad, a **neutral default**; `4`, `6` unknown | ☑️ `1`/`2`; 🔍 `4`, `6` |
| **Donor matte bytes** (slots the photo does not fill) | Near-empty but not empty: up to 9/255, faint donor sky | **Neutral default**: an exactly empty frame on the slots' shared `hvcC` | ✅ done in v0.6.1 |
| **Item-graph template** (item IDs, `iref`, `ipma`, `ipco`, grid descriptors) | Native files add only five things to an iPhone 15 photo's graph (§3) | **The photo's own graph** plus those items, with native format declarations; the two-layout limit goes with it | ✅ done in v0.6.2 (phone-tested); donor graph kept as a fallback for unknown sizes |
| **`HardwareModel = iPhone19,2`** | The only field naming a device other than the photo's own; the iPhone 15 Pro value causes white glow | Find a setting that renders correctly without it, or document it as an exception | 🔍 |
| **`FilmGrainSeed = 92`** | Same grain pattern on every port; native photos all differ (6–264 across 15 iOS 27 files) | **Calculated** per photo: CRC-32 of the first primary tile mod 256 | ✅ done in v0.6.1 |

Done: the `tmap` copy (v0.5.1), empty matte slots and per-photo `FilmGrainSeed` (v0.6.1).
The item graph followed in v0.6.2. `4`, `5`, `j`, `highKey`, `Gain` and `OriginalRangeMax`
do not follow anything measured so far; more random photos will not settle them, controlled
captures (same scene, one setting changed) might. New tile layouts seen in native files: 45/28,
35/12 and 54/15.

---

## 9. Other open metadata questions

- **Why the look differs from a native photo.** Identity coefficients visibly contribute to
  stronger Styles on native IMG_0754 (§10.11). Identity tone curve did not visibly change
  that comparison. Flat light maps and donor values in §8 remain unresolved hypotheses. 🔍
- **Not yet isolated:** whether each classic matte is needed; whether the 2026 sidecars are
  needed on their own; whether styles keys `6`/`7` can be dropped; what `0x54` members `4`/`6`
  mean; how the two planes of the coefficient lattice are read. 🔍

## 10. Portrait editing gap reported on iPhone 16 Pro (2026-10-08) 🔍

The earlier Portrait results do not establish compatibility for every capture/export state.
Distinguish three observations: the viewing menu offers Portrait; blur can be toggled;
and Edit offers aperture (`ƒ`) and Portrait Lighting. Preserving depth and its sidecar
does not by itself prove the third observation.

Private case: original `IMG_0548.HEIC` and processed `IMG_0692.HEIC`, a front TrueDepth
capture from an iPhone 16 Pro (Exif software 18.5). The user confirms the original still
offers aperture and Portrait Lighting on the same phone. The processed copy loses those
controls. Its depth, calibration, simulated aperture 4.5, rendering parameters and
Portrait Lighting strength remain present. All 64 original external payloads other than
Exif, original references and original property bytes were preserved. MakerNote `0x54`
is the only MakerNote tag whose value changed.

User-reported device results for controlled variants:

| Variant | Result |
|---|---|
| Processed copy with byte-identical original Exif restored | Styles and Texture/Grain work; viewing menu offers Portrait, but Edit has no `ƒ`; colour changes on entering Edit |
| Styles graph without Texture, original Exif restored (A) | Styles absent; `ƒ` and Portrait Lighting still absent; colour normal |
| Original graph plus the Texture set, original Exif preserved (B) | User reports Styles and Texture available, but `ƒ` absent |

Variant B contains no 2023 `metadata:styles` item at file level. Its reported controls
must not be interpreted as proof that the documented 2023 palette requirements changed.
The exact control type and behaviour remain to be reconciled. These variants rule out
restoring Exif alone as a sufficient fix for this case; they do not identify the cause.

With the processed copy's styles plist, linear-thumbnail sample/configuration and marker
as inputs, Python `graft_style_graph` reconstructs `IMG_0692` byte for byte: 1,936,059 bytes,
SHA-256 `ac329e6d8431069bcd8b46b18f87279d746fb8fa822c5b679c67895bd3e430e6`.
Reproduce using `tools/portrait-python-parity.py ORIGINAL EXPORTED`. This verifies the
graph writer only; decoding, thumbnail generation and Styles statistics were reused
from the export rather than independently recomputed.

An independent default Python CLI run on `IMG_0548` also completed, generating its own
linear thumbnail and target scene statistics, with flat light maps and Texture enabled.
The private output `IMG_0548_PythonDefault.HEIC` is 1,693,272 bytes, SHA-256
`3766f8fab865a2aff0f64b9892d347fc7aaddb01e5cef0056797c888e6b5b957`.
All 67 non-Exif source payloads (external and idat), original references and original
property bytes are preserved. The user also tested this independent CLI output: aperture
editing remains unavailable and Styles produce strong colours. Replacing the browser
graph writer with Python therefore does not resolve this case.

The colour change on entering Edit is also unresolved. Sections 4.1, 5.1, 8 and 9
describe renderer inputs that can affect appearance; none is established as the cause
for this specific photo. Do not replace native style curves or invent Portrait metadata
based only on this report.

### 10.1 Native versus edited exports: IMG_0714 / IMG_0714-1

Further private samples supplied on the same date isolate an input-state difference:

| File | 2023 Styles / linear thumbnail / delta map | HDR gain map | Route / result |
|---|---|---|---|
| `IMG_0714.HEIC` | All present | Present | Native `add-texture`; user identifies the chosen style as Vibrant |
| `IMG_0714-1.HEIC` | All absent | Absent | Full port / experimental route; depth and a six-key style marker remain |
| `IMG_0715.HEIC` | Newly generated | Absent | User-reported output of `0714-1`: aperture unavailable, strong colours, style reset |
| `IMG_0716.HEIC` | Present | Present | Preserved native Styles plist, all 15 HDR tiles and depth payload match `0714` |

The 49 primary tile payloads in `0714-1` and `0715` are byte-identical. HDR was already
missing in `0714-1`, before conversion. Its source marker has pad values approximately
(-0.30, 0.33), member `4 = 8`, and member `5 = 0`; the full port replaces it with the
neutral eight-key marker (`1 = 2 = 0`, `4 = 1`, `5 = 1`, `6 = 4`). Member meanings must
not be inferred solely from these numbers. The native `0714` marker instead has
(-0.5, 0.5), `4 = 16`, `5 = 1`, `6 = 4`. These observations demonstrate rebuilding
Styles rather than preserving native edit resources; changing a preset label alone
cannot recover the missing curves, delta map or HDR gain map.

The user subsequently re-imported the standalone files into Photos, independently of
the pre-existing library asset: `0714-1` has neither Styles editing nor Portrait editing;
`0715` offers Styles but still has no Portrait editing. Thus, for this specific pair,
the exported source already lacks standalone editing capability before the tool runs.
The Styles in `0715` are newly constructed rather than preserved native edit resources.
Depth presence alone does not reproduce the original library asset's Portrait editor.

The browser now checks the camera model before automatically porting a file that lacks
native Styles. For camera metadata identifying iPhone 16/17, it explains the limitation and
offers an explicit **Create new Styles (experimental)** action. This detects missing
data, not whether a particular edit caused the loss. The native `add-texture` route and
older-camera porting remain unchanged. It is a safeguard, not a Portrait reconstruction
fix. Use the unmodified resource for adding Texture, then reapply edits in Photos.

A new private native output, `IMG_0714_PreserveNative_TextureGrain.HEIC`, was generated
directly from `0714` using Python `add-texture`. All 118 original external payloads,
including complete Exif and the native Styles plist, were verified byte-identical.
SHA-256: `ebcb1a2de49b047f42b9bb07d9f5e871822b1b1adf9e5015d16b11d2305f4148`.
The browser preservation regression additionally checks all original idat payloads,
property bytes and references on this native fixture. Photos UI remains an on-device check.

### 10.2 Browser preparation and cleanup (2026-10-08)

The missing-native-Styles notice is informational (blue with an information icon),
and only triggered for camera metadata identifying iPhone 16/17. Other cameras,
older iPhones and absent Model metadata retain their normal conversion route.

The first browser visit installs/claims the service worker and automatically navigates
once to apply isolation headers, before enabling photo selection. Verified encoder
assets are prepared in the background without retaining an idle WASM encoder heap.
Preparation and conversion share in-flight downloads. A platform HEVC encoder that
reports support but fails during actual encoding now falls back to software encoding.

HEIC reading, graph rebuilding, statistics and payload checks run in a module worker;
DOM-dependent decoding still runs in the page and supplies sampled RGB through messages.
Worker Texture output and analyzed full-port output were compared byte for byte against
the existing functions. This is an execution-location optimization, not a colour change.

Clearing history is available while the processing queue is idle. It revokes result URLs,
removes rows, clears retained Live Photo sources/outputs/movies, disposes bokeh previews,
and releases HEIC/encoder workers. Originals and already downloaded files are unaffected.
Fresh-profile desktop Chrome checks passed for automatic preparation, first PNG conversion,
notice placement, URL cleanup, and native HEIC processing after clearing history.
This does not substitute for an iPhone Safari/Photos test.

### 10.3 Colour research boundary

Review of §4.1, §8 and §9 still leaves the native coefficients/tone curve and donor-derived
`highKey`, `i.Gain`, `i.OriginalRangeMin/Max`, `4`, `5` and `j` without a validated reconstruction
rule for edited exports. `h = i.Gain / 4` gives no independent estimate of Gain.
Neither changing the Texture preset label nor keeping the old pad marker restores the
missing native style graph. No speculative change to these values was shipped.
Further colour optimization requires controlled captures and Photos save/reopen/re-edit
comparisons; compare those fields while changing one setting at a time and keep the
native add-texture path untouched.

Private colour test on iPhone 7 source `IMG_2132` (2026-10-08): variant A used the
current browser output; B replaced only its linear-thumbnail auxiliary with explicitly
P3-linear Main10 samples, preserving A's Styles plist and Exif. Original image payloads
and properties were checked unchanged. The user reports both render too strongly under
Styles, with B stronger than A. Thus this thumbnail replacement did not improve this
case and was not adopted as a runtime fix. It does not prove thumbnail data is irrelevant
or identify the cause. Follow-up C changes only the two main scene-statistics blocks to
donor values; D changes only c/d maps to donor flat maps. The user reports A/C are
equivalent and B/D are equivalent. These variants did not improve the reported colour;
the user stopped this research. None was adopted in the runtime.

### 10.4 AI opt-in and stable result actions

Enabling AI after conversion previously only changed the switch/hint. The app now
keeps file-backed candidates and schedules eligible results when AI is enabled,
as well as running AI when it was enabled before photo selection. Active/completed
jobs are not started twice. The preparation status and native Styles/depth skip
message are visible in the result row. Clearing history also releases these candidates.

The original Styles save/download pair stays in place while AI finishes, with an
unblurred-result label; it is no longer moved into collapsed details. A sole output
group spans the result width so the pair does not initially occupy half a desktop row.
Real WebGPU inference in fresh-profile desktop Chrome produced bokeh previews when
AI was enabled after PNG conversion and before JPEG conversion. Button x positions
and widths were equal before/after AI completion. iPhone Safari remains untested here.

### 10.5 Reliability and compact results (2026-10-08)

Result headings now show filename above the success dot and outcome, wrapping naturally on
small screens. Details report camera, dimensions, source/output sizes, capture time and
HDR/depth resources, without promising Photos Portrait controls. Metadata failures are
informational and cannot remove download buttons. Worker transfer lists only include
typed image buffers, not the numeric metadata file size. Shared icons have rounded corners.

SW installation/activation tolerate unavailable Cache Storage, and successful network
responses survive cache quota failures. AI inference runs in a terminable WebGPU worker;
the switch and per-result stop button cancel it, with a two-minute deadline. Desktop Chrome
produced previews before/after JPEG/PNG conversion. Worker WebGPU on physical iPhone Safari
still requires validation. libheif releases every returned image handle and its native
decoder context; decode failures are per image. Only identical raster box/HEVC tag helpers
were consolidated; native Texture/Styles algorithms remain unchanged.

CI now checks copy, PWA assets and behavior, including a portable synthetic native Texture
preservation fixture. Tests requiring private device photos remain explicitly optional.

### 10.6 Legacy native Texture tone-curve compatibility fix (2026-10-09)

The user reports Soft Skin/Glow/Film work on IMG_0754 and IMG_0762, but Glow/Film blacken
IMG_0757 (source IMG_4850) and IMG_0766 (source IMG_4137). All four are iPhone 16 Pro front
captures. Exif Software is 26.2 for both working captures and 18.2 for both failing ones.
Working native Styles have `0=131087`, a 516-byte `3` tone curve, and `k=false`; failing
sources have `0=14`, no `3`, and no `k`. Initial comparison identified this correlation.

Both failing sources contain two XMP faces, skin and Portrait mattes; both exports contain
two generated people entries and instances. The skin/person codec configurations match
the working examples. Missing face detection does not explain these two failures on its
own. Before the compatibility fix, web and Python `add_texture_bytes` outputs were byte-identical for each supplied source;
the IMG_4850 output also matches the supplied IMG_0757 byte for byte. IMG_0766 differs from
the current source's regenerated output in Exif/XMP, but original image/Styles/mask payloads
are preserved. Nothing demonstrates that the renderer works merely because bytes match.

`tools/texture-compatibility.py` creates private device diagnostics: A reserializes unchanged
Styles values (control); B omits added people data and uses empty 2026 mattes; C adds only an
identity tone curve; D adds that curve plus the observed newer version and k flag. All
original payloads except the deliberately rewritten Styles, codec/property bytes and refs
are checked unchanged. The user reports C and D offer all Texture effects, while A and B
blacken under Glow and have no Soft Skin effect; C and D have equal colour/brightness.
The browser therefore adopts only C: native version-14 Styles without key `3` receive
the computed 516-byte identity curve. Existing curves are left byte-identical; version,
k flag, coefficients, statistics and other values are retained. Other versions are
outside this tested fix. The parser preserves real-number types during this serialization.

The native writer deliberately replaces only that Styles payload and does not shift its
new offset again when shifting untouched original extents. Its self-check validates all
original payloads except that extension and every new/replaced item. Previously exported
Texture files can be repaired by appending only the extended Styles and updating its
extent; no Texture/matte duplication occurs. Outputs are named `_TextureFixed.HEIC`.
New exports and repairs of both supplied sources passed preservation tests and browser
Worker downloads; parsed Styles match the device-tested C variant. This is a web fix;
the author's Python source remains unchanged as the diagnostic reference.

The separate older-iPhone case is now represented by IMG_0783 (§10.7). Upstream Soft Skin
still requires source faces and both masks; the browser can generate missing data using AI.

### 10.7 AI supplementation and generated Styles baseline (2026-10-09)

IMG_0783's actual Exif reports iPhone 11 Pro Max, 2020-10-25 10:34:22 +07:00, 4032×3024.
The supplied file has a 768×576 depth auxiliary and its disparity/blur sidecar, but no MWG
face regions, skin matte, Portrait effect matte, native Styles or separate HDR gain map.
Portrait depth alone therefore cannot enable the source-only `softSkinPeople` path.

The browser adapts Elio-backup's pinned ONNX BlazeFace/478-point landmarker/SelfieMulticlass
pipeline. It runs automatically, without a user switch, when Texture lacks people entries,
skin/person mattes or instances. Original primary/HDR/depth/Exif resources are kept; native
Styles and masks are not recalibrated. Generated masks can replace empty conversion slots.
Face entries retain 76 Apple-layout landmarks, real-number types and distinct per-face IDs;
instance XMP keys match their entries. Inference resources are released before software
grayscale HEVC encoding; item insertion/self-checks run in the HEIC worker. No face or model
failure keeps the converted file usable. Models total about 34 MB, use pinned SHA-256 and
persistent cache, and no photo is uploaded. ONNX produces approximations of private Apple
data, not reconstructed capture metadata.

Real desktop Chrome inference found two faces in IMG_0783, generated masks/people/instances,
and the website processed/downloaded an enriched HEIC through its normal UI. Portable
tests verify native Styles and every untouched payload/property/reference, idempotence,
no-face behavior, real-number types and matching instance keys. The user's phone test
confirmed Soft Skin is active in both A and B, but reported less smoothing than native
iPhone 16/17 photos. Physical Safari memory behavior still requires phone tests.

Two private IMG_0783 outputs use the same AI data: A keeps prior colour metadata; B uses a
generated identity/neutral baseline with Gain=1, h=0.25, range [0,1] and adjusted high-key.
Original pixels and gain map are unchanged. The user reports A and B are equally too strong.
This experiment did not fix colour. Its default website override and raster h change were
reverted; the neutral helper remains research-only. The saved Web_SoftSkin fixture was
generated before this rollback and equals B, not the current default output. Earlier
rejected linear-thumbnail/light-map variants were not adopted. Native Styles are excluded
from colour experiments. Real browser checks also passed for JPEG supplementation, PNG
with no suitable face, and failed model downloads retaining the Styles download.

Soft Skin strength has not been calibrated against Apple's renderer. The current detector
found both faces. The initial SelfieMulticlass whole-image pass has 256x256 output; §10.8
adds per-face refinement. Low resolution can limit detail on small faces but does not prove
the cause of weaker smoothing. SkinSmoothFaceRoughness initially used face luminance variance,
not a validated Apple roughness estimator, and eye statistics reuse face-wide measurements.
These approximations and mask coverage should be isolated in controlled tests before
attributing the difference to model capacity or increasing effect strength.

### 10.8 Per-face segmentation and isolated rendering experiments (2026-10-09)

The browser now runs one padded square segmentation crop for each detected face, sequentially
and with no user switch. The existing model sees each crop at 256x256 rather than the whole
photograph. Confidence is reprojected into the original image and softly blended only inside
that face's skin contour (eyes, lips and eyebrows excluded). Failed/empty crops preserve the
whole-image fallback. No confidence multiplier is applied. Native skin masks and complete
native Soft Skin data remain protected. Transient crop/detection/statistics canvases are released.

Real Chrome inference on IMG_0783 refined both faces, with mean crop confidence 0.809 and
0.893. This confirms pipeline operation, not equivalent smoothing to Apple. At this stage,
the normal web download was byte-identical to experiment B; §10.9 switches it to D.
All seven experiment outputs retain every
source item payload except the expected MakerNote Exif update; primary/depth are unchanged.
The new local-detail roughness proxy rejects a broad illumination gradient in portable tests.
Its numerical scale is not calibrated to Apple; it became the default after device testing (§10.9).

Private outputs live under ignored `tests/private-fixtures/IMG_0783_Refinement/`:

| Variant | Isolated change |
| --- | --- |
| A_GlobalMasks | Original whole-image skin/face-skin masks; same metadata/person instances as B |
| B_FaceCrops | Per-face skin/face-skin masks; face-wide variance; previous website default |
| C_FaceCrops_NativeMedian | B, only SkinSmoothFaceRoughness replaced with upstream native median 0.0121 |
| D_FaceCrops_LocalDetail | B, only SkinSmoothFaceRoughness replaced with a local-detail residual variance; current website default |
| E_FaceCrops_LinearP3 | B, genuine P3-linear Main10 thumbnail |
| F_FaceCrops_LinearP3_Neutral | E, generated neutral colour metadata |
| G_FaceCrops_LinearPersonStats | B, only Styles person/skin statistics changed to linear-light conventions |

C/D differ from B only in the Texture plist, one roughness scalar per face. G differs from
B only in the Styles plist, using linear samples for ToneMapped person/skin blocks, scaling
LinearImage person/skin samples by 0.166, and linearizing the skin RGB channel percentiles.
Capture gain/high-key, masks, roughness, original pixels and all other item payloads are held
constant. E/F/G remain experiments and are not selected by normal website conversion.

A diagnostic comparison on native IMG_0754/0762 reused whole-image AI masks to estimate
the same regions. Across p10/p25/p50/p75/p98, ToneMapped encoded estimates had MAE
0.224–0.342 versus 0.057–0.112 with linear estimates; unscaled LinearImage estimates had
MAE 0.325–0.385 versus 0.010–0.017 with factor 0.166. This supports a metadata-convention
hypothesis, not a proven colour fix: two samples and approximate masks are insufficient
for full calibration, and it cannot explain pre-AI colour complaints on its own. Apple Photos
comparison was subsequently reported (§10.9), rejecting this hypothesis as a colour fix.

### 10.9 Device-selected Soft Skin default; colour experiments rejected (2026-10-09)

On the same IMG_0783 phone comparison the user found D's skin visibly smoother than A, B,
C, E, F and G. Glow/Film worked. The website now selects exactly D: face-crop masks with
SkinSmoothFaceRoughness calculated from local-detail residual variance. Only that smoothing
scalar changes; face colour, eye statistics, Styles metadata, thumbnails and mask encodings
are retained from B. Existing complete/native Soft Skin data continues to skip AI.

The user separately confirmed ALL variants still have excessively strong Styles colour.
E/F additionally turned skin red at maximum strength. G's closer numerical fit to two native
files did not translate into a visual improvement. E/F/G are therefore rejected for default
conversion. This evidence does not establish the renderer's cause; colour intensity on
reconstructed Styles remains unresolved. No new colour calibration is enabled by adopting D.

The native-equivalence claim remains unproven; D's observed improvement is one tested photo,
not a general calibration of Apple's roughness estimator. The preserved A–G fixtures record
the experiment as originally tested and must not be regenerated with new defaults.

Normal-browser verification after adoption produced an IMG_0783 download byte-identical to
the preserved D fixture (SHA-256 5d6ca75de9b94258451a958f9bb7eb6e92805b4e77b232196c3c44bce4c6c1e3).
The JPEG path also generated local-detail roughness for both faces while retaining the old
eye variance. Portable regression checks: 47 passed, 10 optional-fixture skips, no failures;
i18n, syntax and PWA/offline checks passed. This does not extend the physical phone result
to untested photographs or claim a colour fix.

### 10.10 No-face gating and next colour isolation (2026-10-09)

Apple's [WWDC19 segmentation-matte presentation](https://developer.apple.com/videos/play/wwdc2019/260/)
states that when there are no people in the scene, capture will not provide the Portrait/semantic
segmentation mattes (reported dimensions are zero). This documents capture/API behaviour,
not an official specification of Photos' Soft Skin rendering algorithm. The project's §7
requires per-face people entries and masks together. Upstream Python does not invent missing
people information. Elio-backup's face pipeline still calls the segmenter when no face is found
and native masks are missing; it also eagerly loads both detector and landmark models.

Our browser already returned before segmentation/encoding when it found no valid face. It now
also loads the landmark model only when BlazeFace produces a candidate. With no candidates,
only runtime plus the ~0.4 MB detector are needed; landmark (~4.9 MB) and segmentation (~16.5 MB)
weights/sessions are skipped. Detector false positives can still require landmark validation.
Missing XMP regions/mattes alone are NOT a trustworthy no-person signal on arbitrary uploads.
This is face-based gating: a person without a visible/detected face does not require generated
Soft Skin in the current pipeline. The ONNX runtime/detector are still necessary to inspect
such a file. This does not affect separately enabled AI background blur.

A fresh browser test of a blank PNG verified no landmark/segmenter network requests, successful
Styles download and the no-face detail note. The following IMG_0783 still matched the preserved
D byte for byte; JPEG supplementation retained both faces and the selected D roughness.

After gain/range, thumbnail, scene maps and person-statistics experiments failed to improve
colour, the next unisolated hypothesis is Styles key `1` coefficients and key `3` tone curve.
The author normalizes both to identity when preparing the conversion profile. Native values
are scene-dependent (§4.1/§9), so copying them from an unrelated photo is not a proven fix.

Private `tests/private-fixtures/NativeColour_Isolation/` now contains four IMG_0754 variants:
A is the exact reference file; B changes only coefficients to identity; C changes only tone
curve points to identity while retaining its header; D combines B/C. All other Styles values,
every non-Styles item payload, every source property and reference were checked unchanged.
This compares the same pixels on the same native graph and can isolate whether either
normalization contributes to the observed colour intensity. It is a cause-finding experiment,
not an implemented correction for older-iPhone images. The phone result is recorded in §10.11.

### 10.11 Identity coefficients isolated as a contributor; older-photo transfer test (2026-10-09)

The user reports IMG_0754 B (identity coefficients) and D (identity coefficients + identity
curve) are more intense than A; C (identity curve only) looks like A. Since the same pixels,
graph, other Styles fields, masks and Texture data were held constant, this isolates key `1`
normalization as a visible contributor on this native reference. It does NOT establish that
coefficients alone explain all older-iPhone intensity complaints, nor that tone curves never
matter in other scenes or rendering paths.

IMG_0754/0762 use Styles schema `0x2000f` (131087), whereas reconstructed IMG_0783 uses `14`.
A cross-schema coefficient transfer was rejected by the experimental script's version guard.
Instead, two native iPhone 16 references from this session, IMG_4850 and IMG_4137, both have
schema 14 and 51,840-byte coefficient arrays, matching the target's layout.

Private `tests/private-fixtures/IMG_0783_Coefficients/` contains A (byte-identical to the
device-selected Soft Skin D), B (only key `1` from IMG_4850) and C (only key `1` from IMG_4137).
Every other Styles value, every non-Styles item payload, every source property and reference
was checked unchanged. No cross-scene coefficients are installed by the website. Such a transfer
is a cause-finding experiment: coefficients depend on capture/scene and their plane interpretation
is not validated, so a successful transfer still would not justify a fixed donor array for all
photos. Standard colour/brightness and spatial artifacts must be compared alongside Styles.
The user tested Standard with ALL THREE controls at maximum and reports A/B/C look nearly
identical: skin is strongly red/orange and colour remains too intense. Transferring either
same-schema native coefficient array therefore did not improve this tested condition and
is rejected as a default correction. This does not negate the isolated native IMG_0754
result above or establish that coefficients are ignored by the renderer; their interaction
with the reconstructed graph and other metadata remains unknown. The controls were changed
together, so this report does not isolate an individual control's response. The user also
reports original iPhone 16/17 captures do not exhibit this problem at those settings; the
same-schema native coefficient isolation is reported below. Do not claim native colour
parity, enable donor coefficients, or overwrite the tested fixtures. Soft Skin D
remains the default; there is still no validated colour correction for reconstructed Styles.

The next isolated pair, `tests/private-fixtures/NativeV14_Coefficients/`, uses the known
working IMG_0757_TextureFixed (device-selected C compatibility repair). A is its exact
copy; B changes only key `1` to identity. All other Styles values, non-Styles payloads,
properties, associations, item infos and references pass preservation assertions. This
tests the coefficient effect on native schema 14 at the reported Standard/max settings,
without transferring another scene's coefficients onto IMG_0783. A difference from the
earlier native pair cannot be attributed to schema alone because the scenes also differ.
The user reports B is slightly pinker, fresher in colour and brighter than A with all three
controls at maximum in Standard. This confirms a visible coefficient effect in the native
v14 reference too, but the reported shift is mild, unlike the severe red/orange IMG_0783
result. It is not evidence of a quantitative response curve or proof that coefficients
are irrelevant on reconstructed Styles. Together with the unsuccessful IMG_0783 transfers,
it rejects a coefficient-only transplant as the demonstrated fix. Remaining interactions
with capture-dependent fields, scene statistics and other rendering resources are not
isolated. This pair does not change the website's colour or Soft Skin; no colour fix is
claimed, and no additional donor values are adopted on this evidence.

The user subsequently chose to stop investigating skin colour. Keep this research
deferred; do not generate further colour variants or change the selected Soft Skin D
as part of the separate HDR issue below.

### 10.12 Real Adaptive HDR JPEG dropped by the SDR raster route (2026-10-09)

The supplied `IDG_20251020_121945_809.JPEG` is 2,612,099 bytes, Exif iPhone 16 Pro,
2025-10-20 12:19:45.809 +07:00. MPF identifies a 3024x4032 base JPEG and a
1512x2016 three-channel gain-map JPEG (starts at byte 2,201,336). The base ICC is
Display P3; the auxiliary's ICC describes the alternate Display P3/PQ rendition.
Adaptive HDR XMP has base headroom 0, alternate headroom 3.832890, gamma 1 per
channel, SDR/HDR offsets 0.015625; min gains are [-0.275635,-0.288086,-1.159180],
max gains [3.812500,3.816406,3.810547]. These are measured source fields, not donor
parameters. The reported `IMG_0816.HEIC` is 1,579,869 bytes with a neutral gain grid
and no HDR XMP/tmap. The previous `importRaster` always created a black compatibility
auxiliary, so this is confirmed loss of real JPEG HDR, not inferred from file size.

The browser now separates MPF images, validates their Adaptive HDR metadata and
supported matching colour primaries, decodes raw full-range YUV through FFmpeg
(without browser HDR/ICC rendering), and encodes independent base/gain HEVC tiles
losslessly from decoded 4:2:0 planes. Source ICCs and HDR XMP are retained; original
compressed JPEG streams are transcoded. The ISO tmap has all three source channels
and a preferred HDR alternative group; Style/Exif/thumbnail/auxiliary refs also
describe the alternative. Both JPEG planes use the same Exif orientation transform;
output item transforms and Exif orientation are upright. The existing SDR route,
native HEIC resource preservation and Soft Skin D are kept. Recognized unsupported
or malformed HDR stops before an SDR export, with VI/EN/ZH information. Supported
HDR over the existing 48/12 tile budget also stops rather than resizing the maps.

Normal Chrome UI exported private `IDG_20251020_HDR_Fixed.HEIC`, 8,851,220 bytes,
3024x4032, 12 distinct gain tiles, exact base/alternate ICCs and HDR XMP, the source
capture time and a 142-byte tmap carrying the parsed source values. Decoded HEVC
Y/U/V of the first base and first gain tile matches their JPEG-decoded 4:2:0 input
in all 786,432 tested sample values. This is not full-image RGB byte equivalence.
The larger output follows lossless HEVC encoding of JPEG-decoded planes; size is
not an HDR validity criterion. After being asked to compare HDR against the source
JPEG and check Styles/Texture, the user confirmed this supplied HEIC works ("ok rồi").
This is device acceptance of this one output, not a quantitative HDR equivalence
measurement or validation of other JPEG HDR dialects. Physical Safari conversion
memory/performance still needs validation; this file was generated in desktop Chrome.
The change remains local and has not been deployed.

Portable regression suite: 52 passed, 10 optional fixture skips, no failures; five
new HDR tests cover endian MPF offsets, signed three-channel tmap values, unsupported
HDR rejection, Y/U/V tile placement and original metadata/container relationships.
VI/EN/ZH (115 keys) and PWA/offline checks passed; cache version is v65.
References: [Apple WWDC24 HDR](https://developer.apple.com/videos/play/wwdc2024/10177/),
[libavif tmap writer](https://github.com/AOMediaCodec/libavif/blob/main/src/write.c),
[Ultra HDR metadata conversion](https://github.com/google/libultrahdr/blob/main/lib/src/gainmapmetadata.cpp).

### 10.13 Portrait baseline: two IMG_5129 exports (2026-10-09)

The user supplied two private copies of the same iPhone 16 Pro capture (Exif iOS
26.3, 2026-02-11 01:36:52). The first `IMG_5129.HEIC` is 965,408 bytes, SHA-256
`2eff27e5b92fc598f289e6c2867254087a1fddca3de4a30453d20dcb5cc436ff`. It has a
3024x4032 primary, 576x768 disparity, HDR/tmap, but no native Styles, linear
thumbnail or style delta map. The user independently reimported this unprocessed
file into Photos and reported that aperture editing was unavailable. Do not use
this file as a known-good standalone Portrait baseline or attribute that failure
to the website.

The fuller `IMG_5129 (1).HEIC` is 2,080,206 bytes, SHA-256
`e3f10fe03f5b9065432ebb7801c69ccc8dc2db0d7fa310fe9010cfd80de04382`. It has a
4032x3024 primary, 768x576 disparity, native Styles, linear thumbnail, style
delta map, HDR and tmap. The user describes its Portrait as available but Off,
and subsequently confirmed the native A/B/C preservation batch supports both
aperture and Portrait Lighting after import. Native-depth preservation is the
accepted baseline; the open request is generating editable Portrait for photos
that have no depth.
Both depth sidecars declare relative accuracy, native hdis stored as 8-bit L008,
float range 0.735840 to 1.607422, simulated aperture 4.5, calibration and blur
rendering parameters. Their base64 RenderingParameters text hashes are identical.
Both depth auxC properties carry the same 21-byte subtype data after the URI.
Before the experiment below, `attachAiDepth` omitted that subtype and used minimal
XMP without the measured Apple pixeldatainfo layout. These are format differences,
not proven Portrait eligibility requirements. Native 8-bit
storage and relative accuracy must not be diagnosed as inherently invalid.

`tools/portrait-container-baseline.mjs` generated a frozen private A/B/C batch
from the fuller source under `tests/private-fixtures/Portrait_5129_Full_Baseline`:
A is byte-identical to the source; B reverses external payload order and rewrites
iloc offsets without changing any payload, metadata properties or references;
C uses the existing native add-Texture route. Assertions confirm all 104 source
payloads, including Exif, depth, HDR, Styles and idat, preserved in all three,
with original item infos, properties and associations. C adds no legacy tone
curve on this source. The user's device acceptance above supplements these
preservation assertions; it does not establish synthetic-depth support.

### 10.14 Synthetic depth export: Apple metadata experiment (2026-10-09)

The user explicitly requests optional AI depth after Styles/Texture on depthless
photos, with Portrait On/Off, aperture and Portrait Lighting in Apple Photos.
Existing native-depth preservation is already accepted and is not the target.

`apple-depth-metadata.js` now writes the auxiliary disparity descriptor, including
H.265 depth-representation SEI, and Apple pixeldatainfo quantization metadata.
An independently decoded native descriptor is a golden test: 16 fraction bits,
uniform disparity, min 0.73583984375 and max 1.607421875. The default synthetic map
has relative range 0..1, 8-bit L008 storage, native hdis, relative accuracy and low
quality. DepthDataVersion 65541 follows the supplied native file; its semantics
are not established. No camera matrices, pixel size or capture-specific blur
rendering parameters are fabricated. These fields are not proof of Photos
Portrait eligibility.

`exportAiDepth` encodes the actual Depth-Anything-V2-Small result as lossless
monochrome full-range HEVC and attaches it without baking blur. Native depth is
never replaced by this exporter. All source payloads, including idat, and unknown
trailing top-level boxes are preserved. The auxC property precedes orientation
properties as in the measured native graph. This experimental module is not
connected to production save/download buttons; the existing bokeh feature still
exports baked blur and makes no Photos aperture/lighting promise.

Frozen private V2 batches were generated from real local browser inference:

- `Portrait_AI_JPEG_V2`: A is the accepted depthless HDR JPEG conversion;
  B adds AI disparity and Apple metadata; C uses the identical map and additionally
  specifies initial aperture 4.5 and lighting strength 0.5. All 114 baseline item
  payloads remain byte-identical, including HDR, Styles and Texture resources.
  This is the relevant arbitrary-depthless-photo test, without native calibration.
- `Portrait_AI_5129_V2`: source depth and its XMP are physically removed before
  creating A; B/C add actual AI disparity as above. D uses the same AI map while
  retaining this exact capture's own calibration/blur sidecar and quantization
  range. All 127 baseline item payloads remain byte-identical. D isolates the
  native sidecar's effect and is not a general solution for other photos. Native
  capture Exif flags are preserved in this diagnostic cohort.

Both cohorts contain one identical encoded AI map across their depth variants;
V2 reports record geometry, source/map hashes, removed item IDs and preservation
assertions. They have not yet been tested in Photos. A positive native-cohort D
result alone would not establish support for arbitrary depthless JPEGs. Check
fresh import, actual On/Off effect, aperture blur, lighting effect and persistence
after save/reopen before promoting a variant into the website UI.

The first real-inference/export integration completed but did not decode the
exported depth. Subsequent investigation found the V2 codec error in section
10.15; do not treat these V2 files as valid depth exports or a negative result
for correctly encoded AI depth. Portable regressions at that point: 55 passed,
10 optional fixture skips, no failures; PWA and 115-key VI/EN/ZH checks passed,
cache v66. An old libheif decoder rejected the
previously accepted HDR JPEG conversion's tmap/thumbnail graph; the JPEG batch
uses the original JPEG for AI analysis, as the normal raster conversion flow does.
This does not establish that re-uploading that generated HEIC is decodable by the
old library, or validate physical Safari performance.

Apple documents manual auxiliary depth creation via AVDepthData and ImageIO:
[Creating auxiliary depth data manually](https://developer.apple.com/documentation/avfoundation/creating-auxiliary-depth-data-manually).
That documentation does not guarantee Photos aperture/lighting controls for
arbitrary synthesized maps. The descriptor bit layout was checked against
[libheif v1.17.6 HEVC parsing](https://github.com/strukturag/libheif/blob/v1.17.6/libheif/hevc.cc).

### 10.15 Failed Portrait tests; double-wrapped hvcC fixed (2026-10-09)

The user reports all tested synthetic-depth files still have no aperture control.
Inspection then found a concrete serialization defect: `encodeHevcPixels().hvcc`
already contains the complete hvcC property box. The new exporter and private
variant builder wrapped it again, producing a record starting with another box
header instead of HEVCDecoderConfigurationRecord version 1. The V1/V2 trial
codec property is malformed. Earlier preservation checks passed because they
verified source resources, not the new depth's decodability; prior integration
only completed inference/encoding and must not be called functional validation.

Both call sites now pass the complete box once; `attachAiDepth` rejects double
wrapping, raw records and invalid record versions. The portable container test
checks the actual attached codec property and rejects double wrapping. Frozen V3
batches rebuild the same A/B/C/D comparisons with the exact same model assets,
AI map and payload, fixing only the codec serialization. V1/V2 remain frozen for
forensics and should not be used for further device tests.

Chrome readback from both V3 B HEICs passed: all 442,368 stored gray values per
cohort match the AI map exactly (884,736 total), through FFmpeg's HEVC decoder
without RGB/range conversion. B/C/D share the same codec and payload within each
cohort. A second full run of real AI inference -> corrected `exportAiDepth` ->
HEIC extraction -> decoder also matches all 442,368 pixels. HDR, Styles, Texture
and every baseline item payload pass the original preservation assertions.
These checks demonstrate valid encoded depth and preservation, not Photos
Portrait eligibility. The user's V3 result is recorded in section 10.16 below.
No experimental Portrait controls are exposed
in the production UI, and no native calibration is adopted for unrelated photos.

After this fix, the 9 depth/container regressions and 7 startup/lifecycle checks
passed; PWA and 115-key VI/EN/ZH checks passed, cache v67. No colour investigation
was resumed and no files have been deployed.

### 10.16 V3 device result and isolated metadata trials (2026-10-09)

The user imported the unpacked V3 cohort and reports only
`Portrait_AI_5129_V3/D_AI_SamePhotoRendering.HEIC` has full depth and Styles in
Edit. Native-cohort B/C show a depth icon when viewing but have no depth control
in Edit. None of the JPEG cohort has the requested Portrait functionality.
This is device acceptance of D's editing UI on this exact capture. Actual blur,
lighting effect and save/reopen persistence were not separately reported.

Native-cohort B/C/D have the same AI map, encoded payload, codec, image and graph.
D additionally retains the capture's calibration and RenderingParameters, native
float range and Quality high. Therefore the native sidecar/descriptor group has
an observed eligibility effect; the result does not identify an individual field
or establish support for arbitrary photos. In particular, it is not evidence
that a larger AI model or 32-bit HEVC storage is necessary.

The native RenderingParameters value decodes to 1,352 bytes, beginning with REND,
version 7 and a little-endian size of 1,352. It is not a plist; the entries and
their capture/focus dependencies have not been established. No serialized blob
is adopted as a production donor preset.

`tools/portrait-depth-sidecar-trials.mjs` generates frozen private
`Portrait_Metadata_V4` from the V3 baselines and previously encoded AI assets:

- A: remove only RenderingParameters from working D metadata.
- B: remove only its nine camera-calibration fields, retaining render parameters.
- C: change only quantization/auxC range to 0..1, with the identical gray samples.
- D: change only Quality high to low, with the identical AI result.
- E (JPEG): add only the native render blob to V3 C, without camera calibration.
  This is a private cross-scene diagnostic. A positive result alone would not
  validate its focus or blur settings on unrelated photos or justify a default.
- F (JPEG): change only Quality low to high. This tests metadata eligibility;
  it does not improve or measure the AI map's quality.

The working reference D is reproduced byte-for-byte before trials are generated.
All native/JPEG baseline payloads (127/114 items) and their properties/references
remain exact; each cohort retains its V3-verified codec and depth payload. An
independent Python XML parser verified valid XML and exactly the intended changed
fields in all six trials. Physical V4 results are pending; prioritize A/B/E.
Production Portrait behavior and colour defaults are unchanged.

The user supplied two prose/Swift proposals for review. Apple's public method is
`dictionaryRepresentation(forAuxiliaryDataType:)`, not the proposed
`dictionaryForAuxiliaryDataType()`. The manual-depth guide specifies CFData bytes
and a description containing pixel format, width, height and bytes per row; the
proposal passes a CVPixelBuffer object as Data and omits those dimensions/stride.
The guide/method support HEIF, JPEG and DNG, contradicting the HEIC-only claim.
No verified public API guarantee was found that arbitrary MakerApple keys
ApertureValue/FocusDistance/PortraitBlurEffect enable Photos aperture editing.
The proposed kCGImagePropertyHEICSContinuousProfile constant was not located in
the checked public documentation; it must not be treated as a supported Portrait
switch. The cited WWDC21 10076 is Object Capture, not a specification for this
switch. ImageMagick discussion 3892 remains an unanswered request, not a tested
Portrait writer. The snippets recreate the main UIImage and add depth without
explicitly preserving this tool's Styles/HDR resources, and require native APIs
unavailable directly to Safari. None is adopted as a drop-in website fix.

References: [manual auxiliary depth](https://developer.apple.com/documentation/avfoundation/creating-auxiliary-depth-data-manually),
[dictionary representation](https://developer.apple.com/documentation/avfoundation/avdepthdata/dictionaryrepresentation(forauxiliarydatatype:)),
[Object Capture session](https://developer.apple.com/videos/play/wwdc2021/10076/),
[original ImageMagick discussion](https://github.com/ImageMagick/ImageMagick/discussions/3892).

### 10.17 V4 device outcomes and estimated-calibration trial (2026-10-09)

The user reports all 5129 A/B/C/D show the Portrait icon when viewing, but Edit
differs. A (RenderingParameters removed) has no aperture; Portrait Lighting UI
remains but renders black or has no effect. B (calibration group removed) and D
(Quality low) have neither aperture nor lighting. C (range 0..1) has working
aperture, lighting and Styles. JPEG E/F have Styles only, with no aperture or
lighting. Thus viewing-time classification is not evidence of editing support.

On this exact native graph and AI map, removing the render blob or calibration
group, or declaring Quality low, each breaks editing relative to the working
reference. This does not prove every calibration field is required, or that
these three ingredients are sufficient on arbitrary inputs. The 0..1 range
works on this capture; the donor's native min/max need not be used for that case.
Changing Quality to high is an eligibility experiment, not a measured upgrade
to the map or a substitute for the remaining metadata.

`tools/portrait-calibration-trials.mjs` generates frozen private
`Portrait_Calibration_V5`. All variants retain the verified 0..1 descriptor,
relative accuracy, high Quality label and native render blob from working V4 C.
Only calibration is replaced with a pinhole approximation. It is derived from
the individual photo's EXIF actual focal length, 35mm equivalent focal length,
stored dimensions and, in one probe, its digital zoom. Principal point is
assumed centered, square pixels and no distortion are assumed, and extrinsics
are identity. These are estimated modeling assumptions, not measured lens
calibration. No unrelated camera's matrix/distortion, forced Portrait capture
flags, or new model outputs are introduced.

- A uses 5129's 6.764999866 mm actual focal length / 48 mm equivalent at
  4032x3024; approximate focal pixels 5591.377978, pixel size 0.0012098985 mm.
  It changes only calibration relative to the accepted V4 C.
- B uses the JPEG's 15.659999847 mm actual / 120 mm equivalent at 3024x4032;
  approximate focal pixels 13978.444945, pixel size 0.0011202963 mm.
- C uses the same JPEG with its EXIF DigitalZoomRatio 2 as an additional
  multiplier; approximate focal pixels 27956.889890, pixel size 0.0005601481 mm.
  B/C isolate zoom interpretation. The source's crop/distortion/equivalence
  conventions are not fully recovered from EXIF.

Projection formula is f_px = f_35mm * hypot(width,height) / hypot(36,24), and
pixelSize = actualFocalLength / f_px (with zoom multiplier in the C probe).
CIPA defines equivalence using the image diagonal; Apple likewise describes
nominal 35mm focal length as diagonal field of view. Applying this formula to
the exported image is an approximation: crop, correction and metadata rounding
can differ from camera calibration, so a positive control is required.

An independent Python TIFF reader verified these source EXIF focal values.
The builder preserves every baseline item payload (127 native / 114 JPEG),
properties and references, including original EXIF/HDR/Styles/Texture. AI depth
and codec hashes match the previously decoded V3 assets. A separate Python XML
parser checks unchanged non-calibration metadata, matrix ordering/dimensions,
zero distortion and independently recomputes every projection. ZIP CRC and HEIC
hashes pass. Physical V5 outcomes are pending. The cross-scene render blob still
has unknown focus/tuning dependencies and is not adopted as a website default;
production UI, HDR, Soft Skin and colour behavior remain unchanged.

Sources: [Apple camera calibration](https://developer.apple.com/documentation/avfoundation/avcameracalibrationdata),
[Apple nominal focal length](https://developer.apple.com/documentation/avfoundation/avcapturedevice/nominalfocallengthin35mmfilm),
[CIPA diagonal-equivalence definition](https://www.cipa.jp/std/documents/e/DCG-X001-2018_E.pdf).

### 10.18 V5 device outcomes, actual depth readback and brand isolation (2026-10-09)

The user reports V5 A has full editing support; V5 B/C have Styles only.
Estimated pinhole calibration therefore works on this native 5129 graph with
its retained capture metadata and same-scene rendering parameters. It does not
establish a general Portrait exporter for photos originally without depth.
Neither tested digital-zoom interpretation makes the JPEG graph editable.

B/C do contain AI depth. Readback used the actual user-unpacked files under
`tests/private-fixtures/Portrait_Calibration_V5_Test/Portrait_Calibration_V5`.
Both contain hvc1 depth item 125, 576x768, a 61,703-byte payload with SHA256
`66e4c0a7f6a71acf771059ec5f7f7a68b27598d7646d6e3990f80ce440b422ab`,
auxl links to primary item 1 and tmap item 98, and the depth XMP sidecar.
Decoding the depth HEVC from each actual HEIC reproduces all 442,368 AI gray
samples exactly. Their map is neither missing nor blank. PNGs generated from
those decoded samples and `readback.json` are in `Portrait_V5_Verification`.
Photos not showing Portrait controls is not evidence of absent file depth.

The accepted native graph declares compatible brands mif1, MiHB, MiHA, heix,
MiHE, MiPr, heic, miaf and tmap. The generated JPEG graph declares only mif1 and
heic; attachAiDepth currently preserves that ftyp. Both depth codecs use HEVC
profile 4. These observations motivate a format-declaration probe; they do not
prove that heix or MiPr enables Portrait, or that adding a brand establishes
all its conformance requirements. The meaning of MiPr remains unverified.

`tools/portrait-brand-trials.mjs` produces frozen `Portrait_Brands_V6` from V5 B:
A adds only compatible heix; B only MiPr; C both. Major brand and minor version
remain unchanged. No AI rerun, camera calibration, render parameters, capture
flags, EXIF, HDR or Styles change. Each file preserves all 116 item payloads,
every property and reference, and the exact depth payload. Only ftyp and the
required absolute iloc offset shifts differ. Byte comparison after undoing
those offsets verifies the entire original tail; an independent Python check
verifies brand additions and unchanged non-meta top-level boxes. V6 device
results are pending. These private diagnostic files, including the existing
cross-scene render blob, are not production defaults or website output.

### 10.19 V6 device outcome and capture-classification isolation (2026-10-09)

The user reports all three V6 HEIC files still lack Portrait controls. Adding
heix alone, MiPr alone or both is therefore insufficient on this exact JPEG
conversion. This does not prove brands never matter in combination with other
conditions. The tested outputs are already HEIC, not JPEG with a changed suffix;
"JPEG cohort" describes the input's origin, not the output format.

Depth payload/descriptor, sidecar references and property ordering were also
compared between accepted V5 A and failed V5 B. Both use the same writer and
valid single hvcC; their depth geometry/transforms differ with their source
geometry. No missing depth item or sidecar was found. The remaining source
metadata differs: native A has Apple MakerNote 0x14 value 12 and 0x1f value 1;
the generated JPEG cohort lacks both tags. ExifTool's primary Apple.pm describes
0x14 as ImageCaptureType (12 = Scene, 2 = Portrait), and 0x1f as
PhotosAppFeatureFlags, set when a person/pet is detected. These descriptions
do not establish a Photos aperture-enabling switch.

`tools/portrait-capture-trials.mjs` generates frozen private
`Portrait_Capture_V7`. A changes only 0x1f to zero on the accepted native V5 A,
providing a negative-control probe. B adds only 0x1f=1 to failed V5 B; C adds
only 0x14=12; D adds both. It does not force Portrait capture type 2, transplant
camera data, identifiers or complete donor EXIF, or rerun AI. All non-EXIF item
payloads (128 native / 115 JPEG), properties, references and original file bytes
other than the EXIF locator remain exact. All unrelated MakerNote tag values
are checked unchanged. The byte-blob injection helper's count is explicitly
corrected in this private tool to ONE TIFF element for each int32 scalar.
Capture flags are diagnostic declarations, not proven detection or production
defaults. V7 device outcomes are pending.

An independent Python HEIF/TIFF reader verifies both scalar tags have signed
int32 type and count one, their requested values, unchanged root/EXIF fields
outside MakerNote, and unchanged unrelated MakerNote values including 64-bit
entries. ZIP CRC and all archived file hashes also pass.

Reference: [ExifTool Apple MakerNote definitions](https://raw.githubusercontent.com/exiftool/exiftool/master/lib/Image/ExifTool/Apple.pm).

### 10.20 V7 device outcome and EXIF-write controls (2026-10-09)

The user reports V7 A can toggle Portrait and shows the aperture icon in Edit,
but neither aperture nor lighting has a working effect. V7 B/C/D have no
Portrait controls. Adding capture type 12 and/or feature flag 1 is insufficient
on that JPEG-derived HEIC graph. No production classification flags are added.

V7 A simultaneously changed the flag value and used the EXIF/MakerNote writer,
so the failure cannot yet be attributed solely to the flag. V8 separates these
variables: A rewrites accepted V5 A with flag 1 unchanged, using the same writer
as V7; B sets flag 0 directly in accepted V5 A without rewriting EXIF; C restores
flag 1 directly in failed V7 A, retaining its EXIF serialization. All remain
native-graph controls with the same AI depth; none is a new arbitrary-photo fix.
A/C have identical active EXIF bytes. All 128 non-EXIF items, properties and
references are checked exact; B/C change only the four inline scalar bytes.
V8 device results are pending.

V8 A and C additionally have identical complete-file SHA256
`db48c1d44571e7d31b60f0933809d197f07187a1a63aea1ebbd72f172a2e6adb`.
Thus only A/B are packaged for device testing; C needs no separate import.
The independent Python TIFF reader verifies unchanged non-MakerNote fields,
unchanged other MakerNote values, and correct int32/count-one flag values.

The actual original JPEG IDG_20251020_121945_809.JPEG has 1,106 bytes of EXIF
and no MakerNote 0x927c. Thus there is no original Apple MakerNote to restore
on this JPEG cohort. Its minimal Apple MakerNote is generated for Styles;
absence of original capture metadata is not evidence that valid depth is absent.
The Elio backup's portrait-matte code handles foreground segmentation; its
depth code copies existing source depth/sidecars. No verified implementation
that builds arbitrary editable Apple Photos Portrait metadata was found there.

### 10.21 V8 results, Depth Sampler review and separate Focos/merged inputs (2026-10-09)

The user confirms V8 A has working aperture and lighting. V8 B can toggle
Portrait but cannot adjust aperture or lighting. For the tested native 5129
graph, the EXIF-write path works and directly setting PhotosAppFeatureFlags
to zero disables the editing effects. This establishes the effect of that
field on this graph, not sufficiency of setting it to one on arbitrary photos.
The user's objective remains all-camera ordinary photos with genuinely working
Photos aperture/lighting after adding AI depth, not only native-graph controls.

Reviewed shu223/iOS-Depth-Sampler at commit
`ed5c96f9d753fce86a633f069defd3458e90a8c5`; 24 Swift files and associated
Metal/docs were downloaded read-only into an ignored private reference snapshot.
DepthImagePickableViewController filters existing depthEffectPhotos and loads
their file representation. CGImageSource+Depth reads auxiliary dictionaries
and constructs AVDepthData from existing data. PortraitMatteViewController uses
CIBlendWithMask to display background removal inside its own app. VideoCapture
uses AVCaptureDepthDataOutput and synchronization for camera-supplied depth.
No CGImageDestination writer, Photos asset-creation/export path, synthetic
depth model, or implementation enabling arbitrary Photos aperture editing was
found in the reviewed Swift files. Its bundled JPEG examples have native depth
metadata, DepthDataVersion 65538, high/relative quality and older REND version 2;
they are readers' fixtures, not verified all-camera editable exports. They
must not be represented as Focos references or as proof of working Photos ƒ.

The user then supplied a new directory containing FC_20261009_0001.JPEG
(3,161,062 bytes) and IMG_0897.HEIC (271,185 bytes), and explicitly confirmed
they are TWO DIFFERENT photos. Both show Portrait when viewing but lack Edit
aperture/lighting according to the user; neither is a known-good editing reference.
The JPEG comes from Focos, is 3024x4032, has camera iPhone 16 Pro in EXIF,
Apple capture type 10 and Photos feature flag 1. It embeds disparity metadata
with high/relative quality, version 65541, range 0.492432..4.582031,
calibration reference 3024x4032, aperture 2.8, lighting strength 0.5 and its
own 1,352-byte REND version 7. That blob differs from 5129's; it is not replaced.
Its second JPEG stream starts at byte 3,113,146 and decodes as a 576x768
monochrome image; the first stream is 3024x4032 RGB. The separate auxiliary
image is therefore present, not only an empty depth metadata declaration.

The separate HEIC is 1200x900 with no root camera model, capture type 12 and
feature flag 1. It contains depth hvc1 item 9 at 768x576, auxl to primary 7,
and XMP item 10 describing high/relative depth version 65541, range
0.007843..0.992188, calibration reference 4032x3024, aperture 2.8 and lighting
strength 0.5 with a 1,352-byte REND version 7. The reference dimensions differ
from stored pixels; the same aspect ratio alone is not proof of correct
calibration/focus. Do not copy EXIF, calibration, rendering parameters or depth
between these two unrelated inputs.

`tools/portrait-file-classification.mjs` creates private Focos_Classification_V9:
A changes only the Focos JPEG's existing int32 capture type 10 to 2;
B changes only the separate HEIC's existing value 12 to 2. ExifTool describes
2 as Portrait, but this is an isolated diagnostic declaration, not a production
capture claim or proven solution. No HEIC conversion, model rerun, EXIF rebuild,
or data transplantation occurs. File sizes stay exact; byte comparison verifies
that only the inline four-byte scalar region differs (one actual changed byte
in each). Depth, image pixels, render blobs, feature flags and all other file
bytes stay exact. The user confirms both V9 files are recognized as Portrait
when viewing, but neither has aperture or Portrait Lighting editing controls.
Changing ImageCaptureType to Portrait is therefore insufficient for both of
these inputs. Production UI is unchanged.
An independent Python JPEG/HEIC TIFF parser verifies the count-one signed
int32 tag changes and every other EXIF/MakerNote value; ZIP CRC/hashes pass.

References: [Depth Sampler source](https://github.com/shu223/iOS-Depth-Sampler),
[auxiliary data reader](https://github.com/shu223/iOS-Depth-Sampler/blob/master/iOS-Depth-Sampler/Utils/CGImageSource%2BDepth.swift),
[matte demo](https://github.com/shu223/iOS-Depth-Sampler/blob/master/iOS-Depth-Sampler/Samples/Portrait-Matte/PortraitMatteViewController.swift).

### 10.22 Review of supplied Portrait analysis and REND structure (2026-10-09)

The supplied analysis usefully separates aperture from lighting and proposes
investigating rendering parameters. Its proposed four "root causes" are not
established diagnoses. V4/V5/V8 demonstrate changes on the native 5129 graph;
they do not specify a general Apple Photos import contract for arbitrary photos.
V9 now confirms that a Portrait capture declaration alone is insufficient.
Successful pixel readback also does not prove all HEIF graph/metadata details
are correct or rule out further container issues.

Corrections checked against the current code and reference files:

- Depth auxC uses `urn:mpeg:hevc:2015:auxid:2`, not the Apple disparity URI
  proposed by the analysis. The auxl reference runs from auxiliary depth to
  primary (and applicable tmap), not primary to depth.
- The depth range descriptor uses the H.265 depth_representation SEI encoding,
  not an Apple-specific floating-point format. Payload type 177 and prefix
  SEI NAL unit type 39 are different identifiers.
- RenderingParameters is in `http://ns.apple.com/depthBlurEffect/1.0/`, with
  the observed prefix depthBlurEffect; it is not a depthData namespace field.
- Apple MakerNote 0x0017 is described by ExifTool as LivePhotoVideoIndex, not
  SubjectArea. Standard EXIF SubjectArea is 0x9214. Capture type 12 is labelled
  Scene by ExifTool; a specific iPhone subject-detection meaning is unverified.
- Apple's manual auxiliary-depth article writes auxiliary data using
  CGImageDestinationAddAuxiliaryDataInfo. It documents creating/attaching depth
  and supports JPEG, HEIF and DNG dictionaries; it does not promise that the
  imported result enables Photos aperture/lighting editing. The cited public
  API documentation is not evidence that face landmarks and a portrait matte
  are mandatory/sufficient Photos import conditions. The report's
  CIPortraitLighting link could not be verified as a public API reference.

A read-only Base64/binary comparison of native 5129, the supplied Focos JPEG,
and IMG_0897 finds all three REND version-7 blobs are 1,352 bytes. Each has a
16-byte header followed by 167 eight-byte records, with the same unique
16-bit key / 16-bit type-code sequence and four-byte values (149 type-code 1,
18 type-code 2). This is an observed structural pattern, not decoded semantics:
no key is yet proven to mean focus plane, falloff, aperture or circle of
confusion. Against native 5129, Focos differs in 208 bytes / 64 value records;
IMG_0897 differs in 202 bytes / the same 64 records. Both contain REND despite
lacking working Edit controls, so REND presence alone is insufficient.

The Depth Sampler's two older bundled JPEGs instead contain 320-byte REND
version-2 blobs. The report's universal fixed 1,352-byte assertion is false;
version-7 record parsing must not be applied to version 2.

The next justified research direction is to identify specific rendering keys
and validate image/depth/calibration transforms before synthesizing scene
parameters, while testing aperture separately from lighting. Cross-scene REND
transplantation and adding another segmentation model are not demonstrated
solutions. No production metadata or GUI behavior changes were made for this
review; editable Portrait for arbitrary photos remains unverified.

References: [Apple manual auxiliary depth](https://developer.apple.com/documentation/avfoundation/creating-auxiliary-depth-data-manually),
[ExifTool Apple definitions](https://raw.githubusercontent.com/exiftool/exiftool/master/lib/Image/ExifTool/Apple.pm),
[ExifTool EXIF definitions](https://raw.githubusercontent.com/exiftool/exiftool/master/lib/Image/ExifTool/Exif.pm).

### 10.23 Same-photo main-encoder/container isolation V10 (2026-10-09)

The user authorized the staged plan: test re-encoding a known-good native photo
first, then test another scene with its own depth only after the same-photo
control is accepted. `tools/portrait-primary-reencode.mjs` creates the immutable
private `Portrait_Primary_V10` batch from full IMG_5129 (1).HEIC:

- A_Original_5129 is byte-identical to the accepted original, SHA256
  `e3f10fe03f5b9065432ebb7801c69ccc8dc2db0d7fa310fe9010cfd80de04382`.
- B_Lossless_Reencoded_Main re-encodes only the 48 primary 512x512 HEVC tiles,
  preserving the 4032x3024 primary geometry, original grid and orientation.
  It decodes directly to full-range 8-bit 4:2:0 samples, then uses the website's
  FFmpeg.wasm/x265 encoder with lossless mode, primaries 12 (smpte432), transfer
  1 (bt709), matrix 6 (smpte170m), and full range. No RGB/ICC conversion or
  cropping occurs. Only primary tile payloads and their hvcC associations change;
  new codec properties are appended without altering any original property.
  All 56 remaining item payloads, including the same photo's depth, HDR, Styles,
  EXIF and depth rendering sidecar, remain byte-exact.
- C_Container_Control uses the same append-codec/repoint/repack writer as B,
  but appends the original hvcC and keeps all 104 original item payloads exact.
  It isolates this serialization path from the new encoded bitstreams.

All original item IDs/infos, references, descriptive properties and other
associations are asserted unchanged. Original idat and non-mdat top-level
boxes are retained. Each new tile is decoded back and compared byte-for-byte
with its own source Y/U/V samples. A second browser check decodes all 48 tiles
from the FINAL assembled B HEIC and verifies their source-sample SHA256 values:
18,874,368 decoded sample bytes match. An independent Python iloc/idat parser
checks all 104 active payloads in every variant; only B's 48 primary payloads
differ. ZIP CRC, contents and file hashes also pass.

B is 8,942,556 bytes versus A's 2,080,206 and C's 2,080,777 because this probe
uses lossless encoding; it is not a production size/performance target. Reports
and Vietnamese import instructions accompany `Portrait_Primary_V10_Test.zip`.
No source input or earlier test batch is overwritten. No production GUI,
Portrait export behavior, model, or website deployment is changed.

The user confirms all three V10 variants work normally with aperture and
Portrait Lighting. Save/reopen persistence was not separately specified.
On this exact same-photo input, both the re-encoded main and the new codec
association/container path retain editing. This permits the next scene test;
it does not rule out all encoder/container problems for other inputs or
establish an arbitrary-photo solution. V10 intentionally keeps native Styles
and does not add Texture; the user noticed its absence and this is expected.

### 10.24 Depthless JPEG scene substituted into native reference, V11 (2026-10-09)

After V10 acceptance, `tools/portrait-scene-trials.mjs` creates an immutable
private `Portrait_Scene_V11` batch. The input is IMG_7454.JPEG, 214,098 bytes,
896x1195, EXIF orientation 1, no camera model, one JPEG SOI stream and no
Apple depth namespace/auxiliary disparity declaration. It is a clear face
against a largely uniform background. All AI input is RGB from this JPEG;
no native 5129 depth pixels are used for B/C.

The source is fitted without aspect stretching into the reference's displayed
3024x4032 extent (upscaling for this structural diagnostic), then rotated
counterclockwise into stored 4032x3024 coordinates. Both the primary and AI
map inherit the reference's irot=270 transform. Depth-Anything-V2-Small runs
on the same stored scene, producing normalized relative disparity at 768x576.
The actual encoded depth SHA256 is
`cec3f2b37c3f44f046890bd382fe3babdcb8e7afa11f371cd90d13c6f01cb285`.
Decoded scene/depth previews were visually checked for alignment and subject
separation. Main tiles use P3 canvas samples converted to the signalled BT.709
transfer and full-range SMPTE170M YUV, followed by lossless website x265.
The normal thumbnail and P3-linear Main10 thumbnail are regenerated from the
new scene, not left as 5129 previews.

- A_Native_5129_Control is the original, byte-exact accepted native file.
- B_JPEG_AI_NativeRange replaces 48 primary tiles, the depth, normal thumbnail
  and linear thumbnail (51 payloads total). It retains native quantization
  range, depth sidecar and auxC range descriptor.
- C_JPEG_AI_UnitRange uses the exact same scene and depth as B, changing only
  depth FloatMinValue/FloatMaxValue to 0/1 and the corresponding auxC descriptor.
  Native REND, calibration, aperture and lighting settings otherwise stay exact.

This is deliberately NOT a complete per-scene exporter. Native 5129 EXIF,
camera/focus calibration, REND, HDR gain map, semantic mattes and Styles maps
remain as diagnostic controls. They describe another capture and must not be
promoted as correct generated metadata. Appearance/HDR/lighting can therefore
be wrong; no colour/HDR fidelity claim follows from this batch. The reference
still has no added Texture. A successful B/C only demonstrates an intermediate
cross-scene eligibility path; all borrowed data would still need removal or
reconstruction for the actual photo before production use.

Assertions preserve original item IDs/infos, references, properties and
unrelated associations. Final-file main readback verifies all 48 tiles against
18,874,368 generated Y/U/V sample bytes. BOTH final B/C depth items decode
exactly to all 442,368 generated gray pixels. An independent Python iloc/idat
parser checks all 104 payloads; B keeps 53 native payloads exact, C keeps 52,
and B/C differ only in the depth XMP payload plus its declared auxC property.
It also verifies the unit sidecar differs only in the two range fields.
ZIP CRC and archived hashes pass. Reports, previews and Vietnamese instructions
are in `Portrait_Scene_V11_Test.zip`. No production UI/export or deployment
changes were made. The user confirms B/C have functional depth/aperture and
Portrait Lighting. Save/reopen persistence was not separately confirmed.
This establishes an accepted cross-scene diagnostic with the JPEG's own AI
depth, but still does not validate the borrowed capture/colour/HDR resources
or establish a complete arbitrary-photo production exporter. Texture was
intentionally absent. The stronger Styles colour remains a paused investigation
at the user's explicit request.

### 10.25 Portrait and Texture coexistence probe, V12 (2026-10-09)

After V11 B/C device acceptance, `tools/portrait-texture-trials.mjs` creates
the immutable private `Portrait_Texture_V12` batch from accepted V11 C:

- A_V11_Accepted_Control is byte-identical to V11 C.
- B_Portrait_Texture uses production addTexture, adding 12 empty 2026 matte
  slots and Texture metadata. No tone curve is added; it has no human masks.
- C_Portrait_Texture_AI_SoftSkin adds the existing per-face crop/local-detail
  AI pipeline using the SAME JPEG and display/stored orientation as V11.
  One face is found and refined. Texture people data, 2026 masks, semantic skin
  and Portrait Effects Matte are added. Native Styles mode preserves the
  entire Styles plist exactly; no colour/preset/statistics changes are made.

The accepted V11/native 5129 graph has only a legacy semantic SKY matte, no
semantic skin or Portrait Effects Matte. Its working Lighting is therefore
a counterexample to treating those two masks as universally mandatory for
Photos Lighting on this tested graph; it is not a general import specification.

All 104 V11 item payloads remain byte-exact in A/B/C. The writer also verifies
original item infos, references and associated property values. Independent
Python iloc/idat parsing confirms all 104 payloads; final B/C depth readback
matches every one of 442,368 source pixels. ZIP CRC and file hashes pass.
Reports and Vietnamese instructions accompany Portrait_Texture_V12_Test.zip.

The user accepts V12 C and confirms Soft Skin, Glow and Film all work; Soft Skin
is relatively subtle and not sufficiently smooth. Save/reopen persistence was
not separately confirmed. The scene still carries V11's borrowed EXIF/calibration/REND/HDR/Styles
resources; this is a coexistence diagnostic, not a correct per-scene exporter.
Production UI/export and deployment remain unchanged. Colour investigation
remains paused; C's entire original Styles payload is byte-exact.

### 10.26 Soft Skin roughness-only strength probe, V13 (2026-10-09)

The accepted V12 C uses the device-selected face-crop/local-detail pipeline
from section 10.9. Its one generated face has local-detail roughness
0.0001650231649452065. The user reports active but relatively weak smoothing.
This is not evidence of a weak model: mask coverage and Apple's interpretation
of the uncalibrated roughness proxy remain separate possible causes.

`tools/portrait-softness-trials.mjs` produces an immutable Portrait_Softness_V13
batch: A is byte-identical to V12 C, B changes only that face's
SkinSmoothFaceRoughness to one tenth, and C changes it to real-valued zero.
These are isolated diagnostic values, not new production defaults or measured
Apple-equivalent roughness. Previous IMG_0783 D acceptance motivates probing
lower roughness, but does not establish a monotonic strength response or
that zero is valid/effective in Apple's renderer.

The only changed item payload is Texture item 130. Its other plist fields
remain semantically exact with real/integer types retained by the JS writer.
All 134 other payloads and every original item/info/reference/property remain
exact, including skin/person masks, main pixels, Styles, depth and lighting
sidecar. An independent Python iloc/idat parser checks all 135 items and
plistlib confirms only the roughness scalar changes. ZIP CRC/hashes pass.
The user reports V13 C (zero roughness) breaks Glow and Soft Skin, blackening
the person. Reject this diagnostic boundary; do not adopt zero as a default.
V13 B is temporarily usable but smoothing remains weak. The user also reports
entering Edit selects Bright + Soft Skin, and manually selecting Standard
darkens the image/skin. This is a newly reported Edit-state issue, not proof
that B's roughness change caused it; its captured Styles marker is identical
to V12 C and the original 5129 reference. No V13 variant is adopted.
No AI inference is repeated, no model/masks
are changed, no colour work is resumed and no production/deployment changes
are made. This batch retains the diagnostic borrowed resources of V11/V12.

### 10.27 Captured Styles state isolation after V13 rejection, V14 (2026-10-09)

A read-only `tools/portrait-preset-audit.mjs` comparison finds the original
5129, V12 C and V13 B share identical Styles and MakerNote 0x54 data. Their
captured marker has fields 1=0.30386266112327576, 2=0.5, 4=16, whereas added
Texture declares Preset=Standard. There is no explicit Bright/Soft Skin preset
string in the inspected Texture plist. The non-neutral captured pad and
borrowed colour/HDR resources are possible contributors, not established causes
of the user's Edit transition. Field 4's semantic meaning remains unproven.

`tools/portrait-capture-style-trials.mjs` freezes Portrait_CaptureStyle_V14:
A is accepted V12 C, B changes only 0x54 fields 1/2 to real-valued zero, C
additionally changes field 4 to integer 1, matching the upstream default
8-field marker's value. This does not relabel/edit Texture or modify the
Styles algorithm. Every variant retains V12's positive local-detail roughness;
V13's zero/lower-roughness candidates are not used.

All 134 non-EXIF item payloads, item infos, properties and references remain
byte-exact, including Texture/person data, masks, main, depth, REND, Styles
and HDR. Every other MakerNote tag remains exact; unchanged 0x54 fields and
their real-vs-integer values are preserved. Independent Python iloc/idat,
TIFF/MakerNote and plistlib checks confirm these constraints; ZIP CRC/hashes
pass. The user reports B still selects Bright on entering Edit; C selects
Standard and is preferable. Both retain working Soft Skin, Glow, Film,
aperture and Portrait Lighting. Skin remains dark/dull after entering Edit,
whereas the viewing image beforehand is bright with normal skin. Supplied
JPEG examples show the AFTER-Edit appearance; the subsequent single image
is explicitly V14 C. No before-Edit image was supplied for quantitative pairing.
Save/reopen persistence is not separately confirmed. On this cohort, changing
field 4 from 16 to 1 with the same zero pad changes the default selected style;
this does not establish all possible preset ID meanings. The residual darkening
is not solved by the captured-state correction. This is only a captured-state diagnostic
with inherited borrowed resources. Production/deployment are unchanged,
and broad Styles colour/strength investigation remains paused.

### 10.28 Borrowed HDR isolation for the Edit darkening, V15 (2026-10-09)

V11-V14 deliberately carried native 5129 HDR resources although their new main
pixels came from SDR IMG_7454.JPEG. The user confirms viewing-to-Edit darkening
persists at Standard in V14 C. The mismatched gain map/tmap is a separate
candidate for that transition; no causal conclusion is made before device testing.

`tools/portrait-borrowed-hdr-trials.mjs` restricts input by SHA256 to accepted
V14 C and creates an immutable Portrait_BorrowedHDR_V15 batch. A is byte-exact
V14 C. B removes ONLY the borrowed gain-map grid 62, its 12 tiles 50-61,
gain-map XMP 100 and tmap 102. It retains the main grid 49 even though the
removed tmap depends on it. References/property associations to removed items
are pruned; surviving auxiliary resources still reference the main 49.
C additionally sets MakerNote HDRHeadroom 0x21 and HDRGain 0x30 to signed
rational 1/1, with correct TIFF element count 1. B retains the original EXIF
to isolate graph removal from HDR marker values. These neutral values are
diagnostic choices, not proof of complete SDR metadata reconstruction.

B retains all 120 surviving item payloads exact. C changes only EXIF 104:
its other MakerNote values including the accepted 0x54 selection remain exact.
Both preserve main, thumbnails, Styles, Texture/roughness/masks, AI depth and
REND byte-exact. All surviving item infos/property bytes/associations and
the expected pruned references are asserted. Independent Python iloc/idat
and TIFF/MakerNote parsing confirms the removed IDs, payload preservation
and two intended rational changes. ZIP CRC/hash checks pass.

The user reports BOTH V15 B/C remain dark/dull in Edit. Removing the borrowed
HDR graph and neutralizing the two HDR marker values did not solve this
transition on the tested scene. Portrait/Texture functioning and save/reopen
persistence were not separately reconfirmed for V15 in that reply. Removing
this borrowed graph is appropriate to test this SDR scene; no real source
HDR is removed and no production HDR behavior changes. Remaining Styles,
calibration, sky matte and rendering data are still diagnostic references.
No broad colour/strength algorithm work is resumed and no production/deployment
changes are made.

### 10.29 ICC/encoded transfer mismatch isolation, V16 (2026-10-09)

After V15 fails to resolve Edit darkening, a read-only colour-signalling audit
finds V11-V15 main/grid/normal-thumbnail colr properties retain native 5129's
P3 ICC. Its shared rTRC/gTRC/bTRC is parametric type 3 with fixed-point values
matching the sRGB inverse curve: gamma 2.3999939, a 0.9478607, b 0.0521393,
c 0.0773926, d 0.0404510. Encoded HEVC VUI instead declares P3 primaries 12,
BT.709 transfer 1, SMPTE170M matrix 6 and full range. Crucially V11's generation
actually applied srgbToBt709Rgba before YUV encoding. This generated sample
convention therefore does not match its retained ICC curve. Native 5129 has
the same ICC/VUI declarations, but VUI alone cannot establish Apple's actual
pixel convention; do not conclude native files are intrinsically broken.

`tools/portrait-transfer-trials.mjs` freezes Portrait_Transfer_V16 from V15 C:
A is byte-exact. B replaces the main grid, 48 tiles and normal thumbnail colr
association with P3/BT.709/SMPTE170M/full-range nclx matching the generated
samples/VUI. C instead keeps a P3 ICC form and replaces ONLY its shared curve
parameters with inverse BT.709 values (1/0.45, 1/1.099, 0.099/1.099, 1/4.5,
0.081), recomputing the ICC v4 profile ID. Other ICC tags/matrix/white point
and header bytes remain exact. The original profile description is inherited
for this private diagnostic; it is not a new public profile definition.

All 120 item payloads remain byte-exact, including HEVC codec/samples,
Styles, Texture/roughness/masks, depth, EXIF, REND and thumbnails. Only the
50 colr associations change; original ipco properties remain unmodified.
Python independently checks all active payloads, added nclx values, ICC
parameters, unchanged bytes and the profile MD5. LittleCMS independently opens
both profiles and maps an encoded neutral sample (115,115,115) to approximately
(115,115,115) with the inherited ICC versus (128,128,128) with the matched ICC.
This verifies the interpretation difference, not that Photos uses that path.
ZIP CRC/hash checks pass. The user reports BOTH V16 B/C still have dark/dull
skin. The corrected transfer declarations do not resolve the Edit appearance
on this scene and are not adopted. This rejects them as fixes; it does not
identify Photos' actual colour-management path or eliminate other interactions.
Portrait/Texture functioning and save/reopen persistence were not separately
reconfirmed in this reply.

A numerical illustration: an sRGB value 128/255 has linear value 0.2158605;
after BT.709 encoding it is 0.4522843. The old sRGB ICC interprets that as
0.1725033 linear, versus the matching BT.709 interpretation 0.2158605.
This supports a specific transfer-mismatch hypothesis without fitting any
Styles gain, coefficient or skin colour values. Broad colour/strength work
remains paused; production/export/deployment are unchanged. Remaining borrowed
Styles/calibration/REND still prevent a complete per-scene exporter claim.

ICC curve form and profile-ID rules were checked against the
[ICC v4 specification](https://www.color.org/icc1v42.pdf).

### 10.30 Active Styles/Texture removal control, V17 (2026-10-09)

After HDR and colour-signalling probes fail to fix the Edit transition, further
colour/roughness parameter sweeps stop. `tools/portrait-without-styles-trials.mjs`
restricts input by SHA256 to V15 C (the original profile, not rejected V16
corrected-profile variants) and freezes Portrait_WithoutStyles_V17. A is
byte-identical V15 C. B removes Styles plist 103, Texture plist 130, StyleDelta
grid 97 and its 30 tiles 67-96 (33 items). It also removes the active MakerNote
0x54 entry while preserving every other MakerNote payload, including real
64-bit TIFF tag types checked independently in Python. Old unreferenced
0x54 data bytes remain harmless; the MakerNote IFD/data-area offsets do not move.

B retains 87 items: the only changed surviving payload is EXIF 104. Main HEVC
samples/codecs/colour profile, regular and linear thumbnails, human/skin masks,
AI depth and REND remain byte-exact. Texture-only matte resources intentionally
remain to avoid confounding activation-data removal with mask removal. Style
Delta, Styles and Texture metadata are no longer active/declared. References
and associations to removed items are pruned, while original property values
remain exact. Independent Python iloc/idat and full MakerNote parsing verifies
every surviving payload and that only 0x54 disappears. ZIP CRC/hashes pass.

The user confirms V17 B no longer darkens/dulls skin in Edit, and separately
confirms BOTH aperture and Portrait Lighting still have working effects.
Thus active Styles/Texture data is implicated on this exact generated graph,
while the retained AI Portrait itself can render/edit without that darkening.
The result does not separate Styles from Texture or identify a particular field,
and it does not show pixels were baked darker: the main pixels are byte-exact.
B's lack of Styles/Texture is intentional subsystem isolation, not a
user-facing feature removal. Save/reopen persistence was not separately
reported. This is not a complete
per-scene Portrait exporter: borrowed calibration/REND still remain. No further
colour fitting, model change, production feature removal or deployment occurs.

### 10.31 Neutral StyleDeltaMap with active Styles/Texture, V18 (2026-10-09)

V17 B proves that working Portrait without active Styles/Texture avoids this
Edit darkening on the JPEG scene. The original V11-V16 active variants still
borrow the 30-tile StyleDeltaMap from 5129. Section 4.2 already records that
donor delta content makes editing follow donor scene regions. This motivates
removing that specific cross-scene correction, not another arbitrary colour fit.

`tools/portrait-neutral-delta-trials.mjs` restricts input to V15 C and freezes
Portrait_NeutralDelta_V18. A is byte-exact V15 C. B keeps active Styles/Texture
and changes ONLY StyleDelta tile payloads 67-96 plus their hvcC and the colr
association of those tiles/grid 97. The neutral recipe is the existing production
synthetic-hevc formula: 512x512 Main10, limited-range Y=504/U=512/V=512,
Display P3 primaries 12, linear transfer 8, BT.709 matrix 1. It is generated
locally by the website encoder in lossless mode, not copied from a photograph.

All 90 other payloads remain byte-exact, including main pixels/codecs/profile,
Styles plist/coefficients/light maps, Texture/roughness/masks, EXIF, depth,
thumbnails and REND. Item infos/references and unrelated associations remain
exact. Python independently checks all 120 payloads and confirms all 30 final
delta payloads equal the generated asset. Independent native FFmpeg Main10
readback matches all 393,216 input Y/U/V samples. ZIP CRC/hash checks pass.
The existing calibration decoder supports only 8-bit readback; the private
Main10 probe therefore uses independent FFmpeg instead, without production
decoder changes.

The user reports V18 B has all effects working and looks a few percent smoother
than A, but skin still remains dark/dull. Thus neutralizing only the donor
delta map does not solve the Edit darkening, despite retaining functioning
Portrait/Texture. Smoothing magnitude is subjective, not a measured metric.
Native 5129's Styles plist/calibration/REND still remain; B is not a complete
exporter. No broad
colour/strength fitting, Soft Skin changes, production or deployment occurs.

### 10.32 Existing neutral Styles plist fields on accepted Portrait graph, V19 (2026-10-09)

V18 retains functioning effects but still darkens skin. The Styles plist still
describes 5129's capture, so `tools/portrait-neutral-plist-trials.mjs` creates
the immutable Portrait_NeutralPlist_V19 batch from V18 B. A is byte-exact.
B replaces ONLY polynomial coefficients key 1 with the existing generator's
identity array. C additionally uses the existing generatedStyleMetadata neutral
values for keys 3,4,5,6,7,c,d,h,i,j: identity curve points, flat light maps,
neutral statistics and internally consistent SDR Gain=1/h=.25/range=[0,1].
The native curve's first four header bytes, schema value 131087, original key
set and all unlisted keys including k are preserved. No parameters are fitted
to the screenshots and no scene's coefficient array is transplanted.

Generated values originate in schema 14; keeping the native declaration does
not prove their semantic compatibility with schema 131087. This is a diagnostic
baseline, not a version upgrade or native-equivalent calibration. Older-photo
colour tests in sections 10.7-10.11 did not establish improvements from such
neutral values; V19 asks specifically about this depthless JPEG scene's default
viewing-to-Edit transition on its working Portrait graph, not maximum Styles
strength. Stronger or worse colour/texture remains a possible result.

Only Styles item 103 changes in B/C; all 119 other active payloads and every
item info/reference/property/association remain exact. Main pixels/profile,
Texture/Soft Skin/masks, EXIF, AI depth, REND and V18 neutral delta are untouched.
Independent Python iloc/idat and plistlib checks confirm all payloads, unchanged
keys, schema, identity coefficient layout and the intended neutral baselines.
ZIP CRC/hashes pass. Device comparison is pending; no model/roughness changes,
production defaults or deployment are made. Borrowed calibration/REND still
prevent an arbitrary-photo production exporter claim.

### 10.33 Complex original HDR JPEG with the Portrait research graph, V20 (2026-10-09)

The user corrected the new complex-scene input to
`C:/Users/WanThinnn/Downloads/IDG_20251020_121945_809.JPEG`;
IMG_0816.HEIC is an already processed output and must not be reused as original.
Independent EXIF inspection identifies Apple/iPhone 16 Pro, orientation 1,
3024x4032. This JPEG has Adaptive HDR but no Apple MakerNote 0x927c. A camera
model string therefore does not imply native editable Styles/Portrait resources.
The scene contains a seated person behind a cart/sign, a large umbrella and
several object distances, rather than the earlier close-up face.

`tools/portrait-complex-hdr-trials.mjs` freezes Portrait_ComplexHDR_V20:
A is byte-exact IDG_20251020_HDR_Fixed.HEIC, the earlier accepted HDR/Styles/
Texture export without AI depth. B is HDR + AI Portrait with active Styles/
Texture removed. C retains those features. B/C use the native 5129 research
graph but replace all 48 main tiles and 12 HDR gain tiles with raw JPEG YUV
decoded without browser ICC/HDR tone mapping. Both planes rotate CCW to stored
4032x3024 / 2016x1512 and retain the native 270-degree display transform.
The source base ICC, alternative ICC, 3-channel tmap and exact source HDR XMP
replace reference HDR. Gain samples remain numerical data. Missing source
Apple headroom/gain flags are neutralized to 1/1, not copied from 5129.

Depth Anything V2 Small runs on this scene; normalized disparity is encoded
losslessly as 768x576 with unit-range depth metadata. Both thumbnails come
from its base JPEG. The reference sky matte is replaced with an empty mask;
this is not a measured sky segmentation. StyleDelta uses the existing neutral
V18 asset. C keeps native Styles coefficients/REND/capture calibration and the
V14 Standard capture marker. Other EXIF camera/date fields remain reference
data; neither B nor C is a complete arbitrary-photo exporter.

Face detection returns state=none, faces=0 on the complex image. The subsequent
face-skin segmentation/refinement and people Texture metadata are skipped.
This is a concrete missed-face case, not evidence that the scene has no person.
Soft Skin cannot be assessed on this batch; it is not generated for C. No
production model/gating change is made from one image.

`tests/private-fixtures/package-complex-hdr-v20.py` independently parses iloc/
idat/IPMA and true TIFF MakerNotes. It decodes the original JPEG/gain JPEG and
all 60 final C HEVC tiles with native FFmpeg: all 23,592,960 YUV sample bytes
match the source exactly, including padding. All 442,368 final depth pixels
match the inferred map. Every B/C shared payload is exact except the EXIF
Styles marker removal; HDR XMP/tmap/profiles are checked against source and
the accepted baseline. ZIP CRC and content hashes pass. File sizes around
9 MB reflect lossless research encoding. Fresh import, actual aperture/lighting
effects, HDR display and viewing-to-Edit colour on iPhone remain pending.
No website changes, general Styles-strength fitting or deployment occurs.

V20 device feedback: the user confirms C has functioning aperture and Portrait
Lighting, retained HDR, and working Glow/Film. C becomes slightly darker/duller
when entering Edit. The user also confirms B, with active Styles/Texture and
the captured Styles MakerNote marker removed, becomes similarly dark/dull.
Thus active Styles/Texture alone cannot account for this complex HDR scene's
transition. Do not label it normal Apple Styles behaviour or extrapolate the
earlier SDR V17 result to this HDR input. Shared Portrait capture/REND/calibration
and the HDR rendering path remain candidates, not proven causes. The user then
confirms A also becomes dark/dull in Edit, while a fresh Photos import of the
original JPEG keeps its colour/brightness. This establishes a reported display
difference, not a proven pixel-colour corruption or a field-level cause. Later
V21 feedback below distinguishes HDR/SDR display for this Project Indigo input.
The transition is not solely introduced by AI Portrait, since A has none. B's actual
aperture/lighting effects have not yet been reported.
Soft Skin remains untested because face detection was empty. Original batches
are immutable; this feedback does not authorize adopting them as production
defaults or claim full exporter correctness.

### 10.34 Image-only HDR versus SDR Edit isolation, V21 (2026-10-09)

V20 A/B/C darken in Edit; the source JPEG does not. The next probe starts from
the accepted V20 A, not a borrowed Portrait capture graph.
`tools/hdr-edit-isolation-trials.mjs` freezes HDR_Edit_Isolation_V21 with no
encoding, inference, colour coefficient changes or pixel brightness adjustment.
A is byte-exact V20 A. B retains ONLY primary grid/48 tiles, ordinary thumbnail,
EXIF and its original HDR grid/12 tiles/tmap/XMP. It removes active Styles,
Texture, StyleDelta, linear thumbnail, all human/matte resources and metadata,
and the whole synthetic Apple MakerNote 0x927c entry. TIFF data areas remain
stationary; all other IFD entry offsets remain valid. B still has the preferred
HDR alternative group [98,1]. C removes only B's HDR items and now-unnecessary
alternative group, keeping every shared B/C payload exact, including EXIF.
C is an intentional SDR control, not a proposed HDR-preserving fix.

All surviving payloads/properties are checked by the generator. Independent
Python iloc/idat/Exif/group verification checks A's 114 items, B's 66, C's 51,
unchanged primary/thumbnail samples, exact surviving payloads except the
declared MakerNote removal, no dangling alternative group targets, and exact
B/C shared payloads. ZIP CRC/hashes pass. Since no codec data changes, the V20
source YUV verification remains applicable.
The comparison must distinguish C's potentially darker SDR appearance at VIEW
from additional darkening specifically on entering EDIT. Neither result alone
proves a field-level root cause. Production/deployment remain unchanged.

V21 device feedback: the user identifies the source as a Project Indigo capture.
B displays HDR while viewing, then becomes SDR/darker upon entering Edit; the
user attributes this brightness change to HDR no longer being displayed and
considers it normal for this Indigo image. C is stable on entering Edit. The
user prefers B's colour with no Styles applied over C's. This is subjective
device feedback; the exact viewing/Edit state of that colour preference is not
specified. B/C retain identical base pixels, ICC, ordinary thumbnail and EXIF,
so their different appearance implicates HDR rendition/display context rather
than a changed base-image payload. Do not report HDR permanently erased merely
from the Edit preview, assert universal Photos/Indigo behaviour, or compensate
the base pixels by increasing brightness on this evidence.

Use V21 B's no-Styles appearance as the user's preferred visual reference for
this scene. It has no Portrait/Styles and is not a full-feature production fix.
This feedback does not resolve the earlier SDR close-up's Styles-associated
dark/dull skin or validate native-equivalent Styles calibration. No further
colour-fitting or production changes are made from this result.


### 10.35 Opt-in Portrait release (2026-10-09)

The user explicitly accepts promoting the working Portrait/Lighting research
branch and defers colour-strength work. The AI switch alone enables the new
exporter; switch-off restores the normal result. Existing native depth is never
replaced. Normal `port`, Texture and HDR conversion algorithms are unchanged.

`ai-portrait-export.js` rebuilds the accepted capture structure using only the
completed photo's imagery, HDR/XMP/ICC, thumbnails, delta and Texture/face data.
A sanitized metadata-only template supplies numerical capture parameters,
native-compatible Styles coefficients and calibration/REND. No reference photo
payload, EXIF camera/date/GPS, capture time or UUID is published. The user's own
camera/date/GPS is preserved. Reference camera calibration is estimated, never
claimed as measured or physically correct AI depth. Source native Styles are
kept byte-exact. General arbitrary-geometry Photos compatibility remains unverified.

The user also requests a single workflow/download, tap-to-focus before saving,
and Portrait initially off. The new UI replaces the old flattened-bokeh export:
one output contains Styles + Texture + Portrait. Encoded depth is reused when
focus/preview blur changes; only focus/aperture metadata and container offsets
are rebuilt. The preview is approximate; its selected Focus region/aperture does
not establish that opaque REND refocus behavior matches every scene. A short
notice directs users to enable Portrait in Photos after saving. Image pixels are
never darkened/brightened to compensate for Apple's HDR Edit display behavior.
Colour fitting remains paused by instruction.

Release testing caught a malformed 0x54 marker in IMG_0935: the rebuilt payload
was 127 bytes but its TIFF element count still declared 115 bytes. The user
reported Photos crashing on Edit. Correcting the serialized count preserves the
complete binary-plist trailer; a private repaired file retains every non-Exif
payload byte-exact. The exporter now validates its final marker before returning
and compacts duplicate properties (387 to 41 on the reported file). Binary-plist
readers reject malformed trailers before trusting allocation counts. This fixes
the verified metadata defect; the user confirms the repaired file works in Photos.
The browser UI smoke check uses deterministic depth inference with real HEVC
encoding: one output pair, focus change without reinference, switch-off restoring
the normal file, switch-on reuse and history cleanup pass with no page errors.

The user then reports that captured Bright becomes Standard. IMG_0932 carries
0x54 values 1=-0.5, 2=0.5 and 4=16; the neutral capture template uses 0/0/1.
The earlier IMG_0935 repair fixed its count but retained that already-reset
selection. The exporter now always copies the completed input's entire valid
0x54 payload/type, independently of the native Styles coefficient route. This
retains preset and Tone/Colour pad without guessing their private semantics.
Source native Styles coefficients remain byte-exact. Focus/aperture rebuilds
retain the same selection; a corrupt input marker fails rather than silently
falling back to Standard. Freshly generated Styles still start at their own
Standard defaults. This does not change the paused colour-strength algorithm.
The private IMG_0932_Bright_PortraitFixed output reuses IMG_0935's accepted AI
depth and checks the original image/HDR/Styles/pad bytes exactly. The user
confirms this Bright-preserving output works. Browser verification uses the
same original Bright capture and checks selection after focus and toggle changes.

### 10.36 Cold startup, one output, 24 MP Portrait and newer Indigo HDR (2026-10-09)

The user reports an intermediate flat download flashing before the Portrait
result, AI failure on IMG_0945.HEIC, HDR conversion failure on
IDG_20261009_172734_866.jpg, and missing labels on a fresh Safari visit.
Both originals were supplied from iCloud Photos (2); neither was modified.

The normal result is now retained privately until the AI outcome is known.
Success publishes one Portrait output pair; failure/cancellation publishes the
normal fallback once. Existing depth still bypasses inference. Focus changes
reuse encoded depth; switching off restores the normal file. Live Photo pairing
and its still-image sharing notice remain separate from Portrait export.

IMG_0945 is a native Styles capture with primary 5712x4284 (45 tiles), delta
4096x3072 (48 tiles), and HDR 2856x2142 (15 tiles). The Portrait reference had
only 12 HDR slots, causing export to reject the completed AI result. Grids now
allocate additional item slots instead of rejecting valid larger layouts.
Regression and real browser export check every primary/delta/HDR tile payload,
its properties, selected preset marker and native Styles coefficients exactly.

The newer Indigo JPEG uses MPF plus Adobe hdrgm RDF per-channel bounds, base
ICC v2 Display P3 (ASCII desc), no alternate ICC, and headroom 3.863412.
The earlier supported input used Apple ChannelMetadata and an alternate ICC.
The JPEG reader now accepts Adobe scalar/RDF metadata, validates ranges/defaults
and base-SDR rendition, and declares the derived HDR rendition as extended linear
RGB in the base primaries. Source base ICC, gain samples, XMP and channel bounds
are preserved. ISO-only and unrecognized HDR remain explicit failures.
Indigo also repeats EXIF ColorSpace 0xa001 with identical values. Equal duplicate
fields are collapsed in appended active IFDs by comparing type, count and value
bytes; conflicting or unknown-size duplicates fail. Existing TIFF value areas
remain untouched, and next-IFD offsets use the original serialized entry count.

HTML now has complete fallback copy. A small bootstrap renders localization and
the language selector before the converter module graph loads. Service-worker
installation caches only the initial screen; complete offline assets warm after
startup with bounded concurrency. Browser isolation setup gates photo selection,
but libheif initialization no longer runs automatically during initial boot.
Online operation does not require full background offline caching to finish.

Desktop Chrome verification uses the actual two supplied originals and real
JPEG decode/HEVC encoding. Depth inference is a deterministic substitute and
Soft Skin detection is a no-face substitute for this UI/export smoke check;
this does not validate model quality or every Safari device's memory limits.
Both outputs retain their HDR/Styles graph, show one output pair with no visible
intermediate download, and pass focus/toggle/history cleanup checks without page
errors. The new Indigo normal HDR output is retained privately for device review.
A separate fresh-browser check verifies visible Vietnamese labels and language
switching before delayed converter loading, exactly one automatic isolation
reload, and enabled photo selection/AI controls after setup. Physical iPhone
HDR appearance and 24 MP Safari export still need user confirmation. Colour
strength fitting remains paused as requested.

Final local verification: 78 regression cases, 68 passed and 10 skipped because
their optional private fixtures were unavailable; no failures. PWA asset-list
and Vietnamese/English/Chinese copy checks also pass.

### 10.37 Non-native one-step Portrait overwrote completed Styles (2026-10-09)

The user confirms native iPhone 16+ depth/Styles works, but reports dark/dull
skin on older-camera Styles plus Portrait. The user then isolates a successful
workaround: generate Styles, download, re-upload and enable AI. IMG_0975 is the
Styles-only input and IMG_0976 its Photos-exported Portrait result.

Read-only inspection of iCloud Photos (3)/(4) identifies cameras iPhone 7 and
iPhone 13 Pro Max. IMG_0962 and IMG_0975 carry schema-14 generated Styles and
measured skin/person statistics. IMG_0969-1 retains the AI capture graph but
has schema 131087 reference Styles, including zero person/skin statistics,
despite carrying non-empty photo-specific masks and valid people ratios.
IMG_0963, IMG_0969 and IMG_0976 are rendered Photos exports: their active Styles
and delta are absent and the primary tiles have been re-encoded. They cannot
serve as byte-exact pre-export Styles controls or reconstruct lost resources.

The production code classified nativeStyles from the original upload, before
the Styles stage. False replaced the completed Styles with the Portrait
template's plist, retaining only keys 7,9,c,d. True (including re-uploaded
generated Styles) preserved the complete plist. Thus the direct route discarded
this photo's measured skin/scene statistics, coefficients, curve and gain/range
metadata while preserving its face masks. This is a verified code-path defect
consistent with the user's route isolation, not proof that each discarded field
individually causes Photos' skin rendering.

Portrait assembly now keeps the completed Styles payload byte-exact regardless
of its origin. The original-upload classification and template substitution are
removed. A final unconditional preservation check covers generated and captured
Styles. The entire selected preset/pad, primary/HDR/delta/thumbnails and existing
face masks remain preserved; capture calibration/REND and depth construction are
unchanged. This does not fit colour coefficients or resume the paused general
maximum-strength colour research. Regression covers generated/native schemas,
non-zero skin statistics, focus updates and direct/re-upload route parity.
Device confirmation of the combined effect after this change is still pending.

Local verification: 79 regression cases, 69 passed and 10 optional-fixture skips,
with no failures; PWA and three-language copy checks pass. The desktop browser
smoke uses real HEVC encoding with deterministic depth inference and no-face
Soft Skin inference substitutes. On real IMG_0962/IMG_0975 it verifies byte-exact
completed Styles/skin statistics, primary payloads and existing face masks after
Portrait export. Native 24 MP preset/Styles/HDR preservation and direct Indigo
JPEG conversion also pass; the direct raster Portrait Styles payload equals its
normal completed result exactly. No page errors or intermediate download flashes
occur. These checks establish data preservation, not quantitative skin appearance
or iPhone Photos controls; the user must confirm the new one-step output on-device.

### 10.38 Mirrored/rotated AI depth disagreed with Photos (2026-10-09)

The user reports correct-looking web preview but misplaced blur in Photos on
IMG_0978/0979 (older iPhone) and IMG_0982 from iPhone 16 Pro IMG_1096.
Both unblurred Styles input IMG_0977 and original IMG_1096 have ordered primary
properties irot=1 then imir=0, EXIF Orientation=5. Their canonical transform is
angle 90, mirror 1; stored sizes are 3088x2320 and 4032x3024 respectively.
The Photos exports have normalized portrait primary/depth orientation; 0978
and 0979 contain exactly the same compressed depth despite differing main pixels.
Rendered exports do not retain the completed Styles graph or original AI sidecar.

AI formerly read raw rotation/mirror values independently, interpreted mirror
0 as horizontal instead of HEIF's vertical reflection, and inverted rotation
and reflection in a different order. Preview and click-to-focus repeated that
convention, so picture/depth could appear mutually aligned while the exported
auxiliary was transformed by Photos according to the actual HEIF properties.
The mirrored quarter-turn cases are a concrete frame-alignment defect, separate
from relative-depth accuracy, REND semantics or colour strength.

AI now uses raster/heif itemOrientation(), composed in primary ipma order.
Both bitmap and libheif display pixels are mapped into stored coordinates with
the existing displayPointToStored convention. GPU preview and focus selection
use the same axes/order. Export copies rotation/mirror properties in the primary's
actual order rather than forcing rotation first. No model, depth quantization,
colour coefficients, camera calibration, REND or primary pixels are changed.
Prior outputs need regeneration: their misoriented AI depth is not repaired by
switching Portrait off/on. Device confirmation remains pending; matching web
preview geometry does not promise identical blur strength to Apple's renderer.

Verification adds 24 ordered rotation/mirror cases at the affine seam and an
export regression proving identical primary/depth transform order. Desktop Chrome
checks 12 angle/mirror combinations using asymmetric coloured pixel fixtures:
real bitmap decoding and a deterministic libheif display substitute recover
stored pixels exactly, GPU zero-blur preview matches independently arranged
display pixels within 1/255, and tap-to-focus returns the expected stored point.
This verifies frame mapping without asserting model accuracy or actual libheif
decode equivalence. The full suite passes 71 of 81 cases (10 optional-fixture
skips); PWA and language checks pass. Physical Photos blur alignment is pending.

### 10.39 Depth detail and interactive performance (2026-10-09)

The user subsequently confirms the one-step Styles/Portrait and orientation fixes
work smoothly, and authorizes higher depth resolution and UI/performance changes.
This confirmation applies to the earlier exporter and orientation fix; the new
depth refinement below still needs physical Photos quality comparison.

Depth Anything V2 Small now receives real primary-image pixels with maximum edge
1036 and dimensions rounded to its 14-pixel patch size. GPU allocation/device-loss
failures retry at 770, then 518; unsupported WebGPU and invalid model results do
not silently become a CPU estimate. Ray-tracing support is not evidence of WebGPU
allocation capacity. Saved depth/preview maximum edge rises from 768 to 1024.
The inference worker keeps float predictions through joint RGB-guided resampling
and quantizes once to the existing Apple-compatible 8-bit depth auxiliary.
Guidance reduces bleeding at an existing high-contrast depth boundary without
creating new layers from texture on a constant-depth surface. It cannot invent
hair, glass or occluded geometry that the relative-depth model did not recover.

Preview now reuses shaders, texture uploads and its GPU context instead of
compiling and destroying them for every frame. Offscreen/collapsed previews free
GPU resources while retaining a canvas snapshot. Source canvas disposal does not
reset the stored blur scale. Focus has a marker, keyboard arrows and reset.
HEIC assembly moves into its own Worker, which owns the completed source and
encoded depth until the result is removed. Changes debounce for 220 ms; range
release/reset commits immediately. Pending downloads are disabled, older replies
cannot overwrite newer settings, and focus updates skip redundant metadata reads.

Tone matching is automatic for generated Styles, with the existing decoder
fallback; native Styles remain unchanged. The only visible switch is AI Portrait,
with its hint revealed when enabled. Each result has a remove action that releases
its Worker, GPU resources, links and Live Photo pairing data. Clear history remains.
Model downloads report progress, use a separate 30-second stall timeout and verify
SHA-256 before inference. GPU phase timeouts remain two minutes and the full AI
flow is bounded at ten minutes. Model/runtime caches survive UI/SW updates using
content/dependency identities, rather than retaining duplicate model copies.

Desktop Chrome measured reused 768x576 preview updates at 0.6 ms median versus
9.8 ms with new contexts (ten samples each). For the real 1,938,864-byte IMG_1096
container, main-thread assembly took 110.1 ms median; Worker assembly took 91.9 ms
with a maximum 10 ms UI timer gap of 11.1 ms. These are local desktop observations,
not iPhone timing predictions. Real WebGPU inference on the supplied Indigo JPEG
used 770x1036 and produced 768x1024 depth in about 4 seconds, without fallback.
An end-to-end native IMG_1096 browser check uses real decode, model, HEVC and
assembly, retaining all primary/delta/HDR tiles, native Styles and selection
exactly; Soft Skin is a no-face substitute in that UI probe. Real Indigo HDR
conversion uses a deterministic depth substitute in its separate export probe.
Rapid settings/reset, OFF/ON while pending, row removal and URL revocation pass.
Fresh visits and 320/430/900 px light/dark layouts pass without missing labels or
horizontal overflow. Twelve orientation cases and post-disposal preview blur pass.

Local regression: 86 cases, 76 passed, ten unavailable optional-fixture skips,
zero failures. PWA asset-list and Vietnamese/English/Chinese checks pass.
Physical quality of the higher-resolution refined depth remains unverified.
Strong Styles colour fitting remains paused at the user's request.

### 10.40 Future format compatibility is not an iOS version downgrade (2026-10-09)

The user proposes converting future iOS 27.2/28 data to the current 27.0.1 label.
EXIF Software is descriptive identity; changing it alone does not transform HEIF
item relationships, codecs, Styles schemas, calibration or REND contracts.
Blindly changing bytes or schema flags could pair unknown semantics with an older
renderer declaration. The accepted current exporter already rebuilds an understood
Portrait graph from the photo's own resources and a tested metadata reference;
that is a specific adapter, not universal conversion of future Apple formats.

The new compatibility guard checks actual Styles contracts: 13, 14, 16 and the
accepted flag-bearing values 131087 and 131088. Unknown schemas retain their native additive
Texture path and Styles payload, while added Soft Skin and AI Portrait are skipped
with an informational message. A second guard in the pure Portrait builder
prevents callers from bypassing this check. Unknown keys inside supported Styles
remain byte-identical; the guard never forces schema/Software to an older value.
Regression adds a hypothetical schema 999 and opaque resource: transformation is
rejected without mutating the source; the same extra resource in schema 14 survives
Portrait export exactly. This verifies code behavior, not future Apple compatibility.

A newer iOS version can continue to work if its actual contract stays supported.
An unknown contract needs sanitized original fixtures and an explicit adapter,
followed by physical import/edit/Portrait/lighting/Texture/save/reopen checks.
Even a known schema cannot guarantee unchanged interpretation by a future Photos
renderer. MakerNote/calibration replacement remains limited to the current tested
Portrait adapter; this guard is not comprehensive version negotiation or a way to
defeat a future Apple restriction.

### 10.41 Live Photo still eligibility and focus UI (2026-10-09)

The reported IMG_0471 from the user's private ZIP has a Live Photo identifier
and native Styles declaration 131088. The preceding guard omitted this variant,
although the earlier accepted Bright photo IMG_0932 also used it. Live Photo
identity itself was never an AI exclusion. Add this observed contract explicitly,
without masking arbitrary future flags or rewriting the native declaration.
The opt-in AI route exports a still HEIC without requiring a MOV. Existing depth
still takes precedence. Unsupported contract info is shown once, rather than
both as Soft Skin compatibility and AI status text.

Regression verifies the declaration, complete Styles payload, selected preset
and all primary/delta/HDR tiles on the actual private IMG_0471. A Chrome mobile
integration run uses the real WebGPU depth model, real HEVC encoding and assembly
worker on this photo, with only optional Soft Skin face analysis substituted by
a no-face result to isolate the Portrait route. It produces 2,373,500 bytes,
retains the native imagery/HDR/Styles, and passes no-intermediate-output, focus,
reset, toggle restoration and row-disposal checks with no page exceptions.
These checks do not replace physical-device Photos import/edit validation.

The focus marker is now a thin yellow square with midpoint ticks, centred on the
selected focus coordinate; it is not automatic face detection. Browser geometry
and colour checks pass. Processing releases cached decoded samples in `finally`
after each serialized file; inference remains WebGPU with 1036/770/518 resource
budgets and no whole-model CPU fallback, as requested.

The Shortcuts serverless work is currently a proposal and OpenAPI contract in
`docs/`, not an implemented processing endpoint. It defines always-on Styles
and Texture with `portrait=true` opt-in, direct binary POST response, native
preservation and explicit processing failures. A GPU container backend requires
native codec/inference adapters and parity testing; no cloud deployment or paid
resources have been created.

### 10.42 Compact Portrait editor and aperture ruler (2026-10-09)

Replace the preview disclosure heading with a compact Portrait toolbar, a
44-pixel circular reset button at the upper right, and a short focus hint.
Pending metadata updates use an accessible indeterminate spinner instead of
visible updating text; failures remain visible beside the controls. The spinner
pauses offscreen and respects reduced motion. Export still waits for the latest
settings and uses the same single output actions.

The native range remains responsible for touch, keyboard and assistive technology.
A decorative 41-tick ruler shows a yellow selected position and a local wave while
dragging or using adjustment keys. Only tick transforms transition, for 140 ms;
reduced motion removes the transition. There is no continuous animation loop.
The ƒ readout uses exactly the existing exported aperture mapping, with finer
0.1 blur steps and localized decimals. Reset restores centre focus and ƒ 4.5.
This is a relative preview control, not a newly calibrated physical lens model.

Browser checks pass at 320/430/900 widths in light/dark mode for vi/en/zh:
18 layouts, native pointer drag and wave, range/readout/reset agreement, progress
without layout shift, accessible reset and explicit failure feedback. Twelve
rotation/mirror checks retain correct focus mapping. Targeted lifecycle,
language and Portrait export regressions pass 28/28, including native imagery,
HDR and Styles preservation. Real WebGPU and HEVC integration on IMG_0471 also
passes. Chrome automation does not replace a physical Safari interaction check.

The follow-up progress design uses the same 44-pixel circular frame as reset,
with a continuous rounded arc and a faint full-ring track inspired by the user's
Camera reference. Rotation is linear instead of a stepped spoke animation;
offscreen suspension, reduced motion and accessible status text are retained.

### 10.43 Cleanup, folder layout, attribution and Safari input budget (2026-10-09)

The maintained source is grouped into core, styles, codecs, media, ui and portrait,
alongside the existing raster, dng and vision folders. Import/export paths,
module-relative worker/model URLs, bootstrap, the offline shell, diagnostic tools,
artifact builder and tests follow the new layout. A portable module-path check
now gates CI and Pages publishing. Twenty-one superseded standalone Portrait
A/B generators and two unused baked-bokeh/depth-only exporters were removed;
historical experiment references in this document refer to earlier Git commits.
Maintained audit/build tools, regression tests, private originals and reference
checkouts are retained. Disposable root/tools Python bytecode was deleted.

README credits Elio (aka WanThinnn) as fork maintainer and nathanatgit as upstream
author. Root LICENSE retains the original MIT copyright and permission text.
The original notice is distributed and cached as web/LICENSE.txt, with an added
maintainer credit; the artifact builder also includes the original notice in
generated bundles. PWA validation allows the maintainer credit but checks the
remaining license text against the root. Bundled Depth Anything/ORT licenses remain unchanged.
Browser capability descriptions now distinguish current editable Portrait and
JPEG HDR support from the unchanged upstream CLI's capabilities.

The user reports Safari reloading during GPU inference. The former 1036-first
retry sequence cannot recover if WebKit terminates the process before JavaScript
gets an error. Safari and iOS therefore start at 518; other browsers keep the
1036/770/518 sequence. This is a precaution for suspected memory pressure, not a
confirmed crash diagnosis from a device log or a whole-model CPU fallback.
Primary-image colour guidance and saved depth remain at maximum edge 1024.
The input tensor is disposed after inference and on failure.

Local regression passes 79/89 with ten missing optional-fixture skips. A Chrome
integration run with Safari's user-agent profile executes the real WebGPU model
at at most 518, real HEVC encoding and worker assembly on IMG_0471. It produces
2,355,680 bytes and retains all primary/delta/HDR tiles and the selected Styles.
No intermediate download, rapid settings/reset, off/on restoration and row disposal
checks pass with no page exceptions. This checks the new budget and paths, not
the native Safari driver; physical Safari reload behavior still needs user testing.

### 10.44 Moderate Safari GPU detail increase (2026-10-10)

At the user's request, Safari/iOS inference now starts at maximum edge 630,
with a GPU retry at 518 only on caught resource errors. Other browsers retain
1036/770/518. The geometry validator accepts the new multiple-of-14 budget;
primary-image guidance and saved depth still use maximum edge 1024. A process
reload cannot execute this fallback, and native Safari stability remains unverified.

Twenty-five targeted depth/export/import-path regressions pass. The real WebGPU
integration probe on Chrome with Safari's user-agent starts at 630 and exports
2,356,093 bytes on IMG_0471, preserving every primary/delta/HDR tile and the
selected Styles. No intermediate download or page exceptions occur, and rapid
settings/reset, toggle restoration and row disposal checks pass. This verifies
the higher inference budget and export path, not an iPhone's memory tolerance.
PWA validation passes; the shell cache advances to v83 without invalidating models.

### 10.45 Edited HEIC without thumbnail and AI failure diagnostics (2026-10-10)

The user subsequently confirms 630 can run and identifies the failure as
"Adding Portrait" on IMG_1015.HEIC, an older-phone image edited previously.
The exact file has primary 49, Styles 84, delta grid 83 and linear thumbnail 52,
but no ordinary thumbnail. The former exporter rejected that graph before
assembly. The ordinary thumbnail is now optional: if absent, its unused reference
item is removed rather than copying an unrelated image or substituting the
linear thumbnail. Styles, primary tiles, delta tiles and the source preset stay
byte-exact. Missing Styles/delta/linear-thumbnail requirements remain enforced.

The real WebGPU browser probe on Chrome with Safari UA processes this file at
630, encodes depth and exports 2,551,808 bytes with no page exceptions. Its own
primary/delta data and selected Styles are exact; the source has no HDR map.
Rapid settings/reset, off/on restoration, row disposal and one final output pass.
Portable no-thumbnail and optional private-file regressions cover the failure;
31 targeted tests pass. PWA and language checks pass. Photos editing on the user's
device is still the final validation of aperture/lighting for this new layout.

Runtime/WASM failures may be thrown as numbers/strings. Worker error envelopes
now preserve a nonempty message and step instead of becoming an undefined depth
result. Caught inference failures can retry at the next smaller GPU input;
cancellation, timeout, download/integrity failures and unavailable WebGPU are not
retried this way. A browser integration probe injects code 17 at 630, verifies a
real model run at 518, and retains native primary/delta/HDR/preset bytes. This is
separate from the IMG_1015 assembly defect; it is not proof of that defect's cause.
Final AI failures add the step and a bounded diagnostic to Details. Completed
conversion encoder workers and decode samples are released before GPU inference
to reduce simultaneous memory use. Safari's budget remains 630/518; v84 updates
the shell while keeping model caches. Process termination still bypasses fallback.

### 10.46 iPhone edge-to-edge page background (2026-10-10)

The user's Home Screen app screenshot shows a separate light status-bar strip,
with the same problem in dark mode. HTML already has viewport-fit=cover but used
the default Apple status-bar style. It now requests black-translucent, following
Apple's standalone web-app configuration, so the background can extend beneath
the status bar. The page gradient lives on the root canvas rather than only the
body. Light/dark browser theme colors and the manifest's light launch color now
match the CSS base colors. Body content padding adds top/bottom safe areas to
the ordinary spacing and respects side cutouts in landscape. OS status icons
remain visible; this does not force Safari's browser chrome into fullscreen.

A private Chrome layout probe substitutes safe-area environment values because
the installed CDP does not support setSafeAreaInsets. Light and dark layouts at
430 portrait, 932 landscape and 320 compact widths keep the root gradient,
respect all four insets and have no horizontal overflow. Screenshots were
visually inspected. This verifies CSS layout, not native iOS status-bar rendering;
Home Screen relaunch on the user's device remains the final check. PWA validation
passes and the shell cache advances to v85, without changing depth's 630/518 policy.

### 10.47 Live Photo ZIP follows the final web output (2026-10-10)

Pair export formerly captured the initial Styles byte array and stopped updating
after its first ZIP. It now follows the same File as the HEIC download, including
Portrait focus/aperture changes, toggle-off fallback and toggle-on restoration.
A MOV selected later pairs with the current output. Revision guards discard old
asynchronous file reads and errors; disposing a row invalidates pending exports.
The current output clears/revokes the previous ZIP URL along with the still URL,
and a newly generated ZIP respects the output's existing pending-download state.

Testing with the private IMG_0471 HEIC also exposed a missing pairing identifier:
the Portrait MakerNote replacement dropped source tag 0x11. The assembler now
retains that source byte/string tag in its rebuilt table and never imports a Live
Photo identity from the reference template. Portable tests cover final ZIP bytes,
unchanged MOV bytes, late MOV, toggle/focus changes, stale reads, removal, failed
identity checks and Portrait identifier preservation. This does not change movie
frames or add a browser-to-PhotoKit importer; Photos still receives a still image
through the normal web share action.

A private browser probe used IMG_0471, deterministic substitute inference, a
real HEVC encoder/Portrait assembler and a synthetic MOV metadata container.
It verified that late MOV selection and each focus/reset/toggle update package
the exact current HEIC and unchanged MOV bytes, preserving the source pairing
identifier. It also checked removal and URL disposal. This does not validate
motion playback or native Photos import of an AI-edited Live Photo pair.

### 10.48 First-use iOS picker format reminder (2026-10-10)

iPhone/iPad users see a compact reminder below the upload area showing the
native picker path: Select photos → ••• → Options → Format → Current. Explicit
Got it dismissal is stored locally; desktop users do not see this notice. The
longer Help instructions remain available. The early page bootstrap renders
the reminder before converter loading and tolerates blocked local storage.
Vietnamese, English and Chinese copy is included, with an English HTML fallback.
A private browser layout check passed at 320/430 widths in light/dark modes,
including translated copy, dismissal/reload persistence, desktop hiding and
iPad detection with blocked storage. No horizontal overflow was observed.
The web cannot select the native picker format for the user. Shell cache v87
ships this notice and the current-output Live Photo ZIP fix.

### 10.49 Compact picker hint and native Portrait capture follow-up (2026-10-10)

The first-use picker hint now uses an unboxed inline row with its acknowledgement
beside the copy, keeping a 44px touch target. Stop AI gains 6px top spacing. Native
language-select tap highlighting and its inner rectangle are removed; keyboard
focus remains visible around the surrounding pill. A private mobile browser
probe checks light/dark, 320/430 widths, all three languages, pointer versus
keyboard focus, dismissal persistence and the cancellation spacing. Shell v88.

Private capture pairs identified by matching primary payloads: IMG_5204 (iPhone
13 Pro Max) → IMG_1029, IMG_1031 → IMG_1032 and IMG_1031-1 → IMG_1033 (iPhone 16
Pro). Depth payload hashes also match each pair. Both 1031 sources lack native
Styles, delta map, linear thumbnail and HDR before conversion; their depth XMP
contains disparity ranges but no RenderingParameters, SimulatedAperture or
Portrait Lighting parameters. Capture type remains 10/11 through processing,
whereas the independently verified complete 5129 resource has type 12 and MiPr.
These correlations are not established requirements or a validated fix.

The user initially reported originals remained editable after re-import, then
corrected IMG_5204: export to Files and re-import already removes Portrait edits
without the tool. That case therefore cannot be described as the converter
dropping native editing resources. IMG_1031-1's fresh-import state still needs
separate confirmation. Private NativePortrait_On_V1 trials isolate adding MiPr
(A), then capture classification 12 (B), then the tested reference rendering
parameters/aperture/lighting and flag 0x1f=1 (C). All retain exact photographic,
depth, Styles, Texture and source property/reference data. C borrows rendering
parameters for diagnosis; none of these changes is shipped pending actual
Photos editing/effect validation. Original photos remain untouched.

Apple documents downloading Unmodified Originals from iCloud.com separately
from Highest Resolution / Most Compatible: https://support.apple.com/en-sg/111762.
Its archive guide also describes Export Unmodified Original from Photos:
https://support.apple.com/en-us/108306. Current selects a picker format; it is
not a guarantee of an unmodified capture or complete Portrait edit resources.

### 10.50 Native depth on the accepted capture graph, V2 (2026-10-10)

Device feedback for NativePortrait_On_V1: every tested variant offers a Portrait
viewing icon, but Edit still offers Styles only, with no aperture control. Adding
MiPr, classification/enable flags and rendering parameters to the old graph is
therefore insufficient for those tests. No V1 metadata changes were deployed.

The private native-portrait-rebuild-trials.mjs now freezes
NativePortrait_Rebuild_V2 for IMG_1029 (iPhone 13) and IMG_1033 (iPhone 16).
The script detaches only the old depth item and its dedicated sidecar from an
assembly input, then runs the actual production buildAiPortrait with the exact
native compressed depth and codec. This uses the already device-tested capture
graph and complete MakerNote rather than retaining the old capture structure.
It adds no duplicate depth auxiliary and performs no inference or re-encoding.

A_WorkingCapture uses that accepted capture's depth metadata as a diagnostic
control; its range/calibration are reference values, so blur accuracy is not
established. B_NativeDepthMetadata retains the source depth property boxes,
orientation, quantization ranges and available calibration XMP, adding only the
reference rendering parameters, aperture and lighting fields. Both use the
existing exporter's reference MakerNote/renderer data. All primary/HDR/delta
tiles, Styles selection and plist, Texture and remaining input resources are
asserted byte-identical/present. Reference photographic payloads are never used.
The originals remain untouched. Subsequent device feedback confirms A for both
samples has working aperture and lighting adjustments; B still shows the viewing
icon but no aperture in Edit. A's original IMG_1033 selection was Standard because
the earlier Styles stage had already overwritten the original Bright marker.

### 10.51 Fixed web aperture stops and accepted native Portrait repair (2026-10-10)

The web ruler now uses exactly 23 positions: f/1.4, 1.6, 1.8, 2.0, 2.2, 2.5, 2.8,
3.2, 3.5, 4.0, 4.5, 5.0, 5.6, 6.3, 7.1, 8.0, 9.0, 10, 11, 13, 14, 16 and Off.
Labels retain their decimal suffixes and numeric settings export the exact stop.
Reset restores f/4.5. Off draws an unblurred preview; it retains editable depth
and writes f/16 rather than an invalid zero/null aperture. Saved Portrait starts
off at all stops. The existing preview calibration and native range interaction,
wave, debounce/latest-output guards and reduced-motion behavior are retained.

restoreNativePortrait uses the accepted V2 A adapter only for legacy capture type
10 or type 11 with Portrait enabled, with one 8-bit hvc1 depth and its dedicated
sidecar, and missing rendering parameters. It detaches that depth for assembly,
then reuses its exact compressed payload with buildAiPortrait. Complete and
next-generation Portrait-off graphs are unchanged. The Styles worker applies it
when adding a missing Styles graph; it does not run AI or re-encode camera depth.
Reference calibration/REND remain compatibility estimates, not native calibration.

Original IMG_1031-1 has a six-key MakerNote 0x54 selection: Bright (key 4 = 16),
Tone -0.5 and Colour 0.5. IMG_1033 and V2 A/B inherited the earlier generated
Standard marker. patch now carries an existing valid selection into its new
Styles graph without mutating the cached profile. The production native adapter
matches both accepted V2 A files byte-for-byte. Portable regression tests cover
legacy/on restoration, untouched off/unknown graphs, no duplicate repair, exact
depth/primary/Styles retention and six-key Bright preservation. Private checks
exercise the real worker job and originals; private photographs are not published.

### 10.52 ISO-only HDR discovery and native Portrait V4 device result (2026-10-10)

Correction to section 10.49: the IMG_1031 Portrait source exports do contain HDR.
Their ISO tmap references the base image and a 12-tile gain map, without the older
Apple hdrgainmap auxiliary label. The previous discovery code only recognized that
label and incorrectly reported no HDR. Both HEIF readers now recognize an unambiguous
tmap dependency pair; explicit auxiliary labels retain precedence. Ambiguous or
unrelated graphs do not become HDR. Original tiles and tmap parameters are retained.

The current private iCloud Photos (5) copies were paired by exact primary payloads:
IMG_1051 matches IMG_1031-1 and IMG_1052 matches IMG_1031, regardless of the user's
filename description. Both source exports lack the full Styles auxiliary graph;
their original Bright selection is still present. Recreating that graph is distinct
from preserving a complete native Styles calibration.

NativePortrait_Bright_HDR_V4 variants A/B/C complete selected marker fields;
D only registers the existing gain map with the older Apple auxC role and auxl
reference, while E combines A and D. The user reports all variants have working
Styles, aperture and Portrait Lighting; D/E also have HDR. All retain Bright and
all still have stronger colour. D therefore supplies the confirmed HDR compatibility
fix without changing the original selection fields or claiming to correct colour.
The production helper matches D byte for byte on IMG_1052. It is additive,
idempotent, guarded by the supported Styles contract and never replaces another
declared auxiliary role. It runs after Styles patch/Texture repair, before export.

The user recalls that Styles-first download/re-upload followed by AI Portrait
previously avoided stronger colour. The existing AI assembler still preserves
completed Styles and per-person statistics exactly; its one-step/re-upload
regression passes. A private comparison using both current native Portrait source
graphs and deterministic substitute face data also finds identical Styles and
all payload bytes whether native restoration precedes or follows Soft Skin.
Changing stage order is not supported as a colour fix by this evidence. This
comparison is not a physical-device render test or real face inference.

The misleading missing-Styles message no longer states that HDR or aperture
editing cannot be preserved. The web still warns when original Styles editing
data is absent, and asks users to check colours and Portrait editing. All 102
workflow regression cases complete with 92 passes, 10 optional private-fixture
skips and no failures; PWA and three-language consistency checks pass. Shell v90.

### 10.53 Native Portrait enable flag is not an editing-completeness test (2026-10-10)

The user reports a new iPhone 16 Pro capture made in Camera's Portrait mode:
IMG_1079 is the input and IMG_1080 its web output in private iCloud Photos (6).
The output shows Portrait while viewing but has no aperture control in Edit;
Bright is retained and the Style colour remains stronger. Both files have
capture type 11, enable flag 0 and the same 576x768 camera depth. Neither has
standalone depth RenderingParameters or the renderer MakerNote blob. The output
has a reconstructed schema-14 Styles graph, while the input lacks that graph.
Its HDR gain map is recognized by the corrected readers. The user-visible
capture mode cannot be inferred from this exported enable flag alone.

The prior repair skipped type-11/flag-0 exports as already working. The local
adapter now accepts both known enable values for types 10/11 when supported
Styles and a single supported camera depth/sidecar exist. Complete rendering
graphs, unknown classifications/flags/Styles and unsupported depth streams stay
unchanged. Existing-Styles and Texture repair jobs use the same native adapter
as first-use Styles jobs, so re-upload does not skip an incomplete editor graph.

Private NativePortrait_1079_V5/A_1080_NativePortraitRebuilt starts from IMG_1080
and retains exact Bright selection, Styles, Texture/people, primary/delta/HDR
payloads and original camera depth. It uses the previously accepted capture
adapter, without inference or re-encoding. B is IMG_1080 unchanged. The production
worker's repair-Texture route matches A byte for byte. All 103 workflow cases
complete with 93 passes, 10 optional fixture skips and no failures; PWA/i18n
checks pass. This local change is awaiting physical Photos aperture/lighting
validation and is not yet deployed. Colour correction remains separate.

### 10.54 Preserve native captures; reject double-blur reconstruction (2026-10-10)

The user rejects V5 A as a correct repair: HDR and aperture controls are present,
but Off still shows the old blur and aperture changes add another blur layer.
Direct FFmpeg decoding of IMG_1079 shows that blur in the primary image itself.
Its container has only one RGB image, native depth and the HDR map; every byte of
mdat is referenced, with no hidden sharp image. Native enable flags cannot prove
that the source base is sharp. The production worker no longer automatically
calls the reference-capture adapter. That adapter is diagnostic only and returns
null unless a caller explicitly confirms an unblurred base.

User policy: native Portrait already on keeps its image, depth, metadata and
viewing icon without trying to reconstruct aperture controls. Older inputs get
Styles/Texture; iPhone 16+ gets Texture only. Existing working editing resources
are retained, including the reported iPhone 13 Pro Max Portrait-off result.
The newer-iPhone path now also covers exports missing their native Styles graph;
it never recreates colour coefficients or modifies an existing Styles plist.
Legacy tone-curve repair is disabled on this path. Complete native selection,
HDR, depth and photographic payloads are byte-preserved, not normalized to a
camera preset or software version.

Private native-policy audits and browser processing of IMG_1092 verify all
original external payloads, Styles, Exif, primary tiles and HDR are unchanged.
IMG_1094 is already the processed/Photos-exported edited result, not the edited
input before processing; retaining it does not undo colour baked in earlier.
The source IMG_6246 and reported result IMG_1099 retain camera depth and a real
HDR gain map. Missing Styles auxiliary data in a later Photos export must not be
confused with whether the asset in the user's library offers editing controls.

IMG_1472.JPEG and IMG_6565.HEIC (iPhone X) have source HDR headroom metadata but no
HDR gain map. IMG_6565 has one 8-bit Display P3 RGB grid plus Exif. The reported
IMG_1086 still has no gain map; it retains headroom 63809/37837 but has acquired
a neutral HDRGain tag absent in the source. AI assembly now retains absence as
well as valid values of source headroom/HDRGain rather than inventing a newer
gain-map contract. This is a metadata correction, not a verified recovery of
legacy Photos HDR display. No fake gain map is generated. Private V6 browser
variants isolate Styles alone and Styles plus Portrait for physical testing.

Google Photos IMG_0840 is an already blurred RGB image with HDR, without depth
in the exported file. IMG_1087 also has a rendered blur in its RGB base and a
1024-square relative disparity map, but no standalone Styles editing graph in
that supplied export. These are visual references, not a matched comparison of
two unblurred inputs and two editable depth maps. The existing map identifies
the person; shoulder/collar depth transitions still need improvement.

RGB guided refinement is added after inference releases GPU resources. Its
coefficient grid is bounded to 256 pixels per edge, evaluated against full RGB,
limited to transition regions, the local depth envelope and a maximum 24/255
correction. Constant surfaces remain constant despite RGB texture. A synthetic
ramp/known colour boundary test shows lower boundary leakage; refinement of the
supplied 1024 map takes about 184 ms on the desktop, with mean absolute change
0.972/255. These are not Safari timings or proof of Google Photos parity. No
new model, CPU depth fallback or higher Safari inference budget is introduced.

All 106 selected workflow cases complete: 96 passes, 10 optional private-fixture
skips, no failures. PWA and 121-string three-language consistency checks pass.
The real browser route also completes GPU depth inference and HEIC assembly on
IMG_6565 (about 22.1 seconds total on this desktop); original primary compressed
tiles are unchanged. The native IMG_1092 route completes without replacing its
camera depth, with exact source Styles and Exif preserved. Soft Skin was mocked
as no-face in this isolated browser probe. No Safari or Photos rendering claim
is inferred from these desktop results. Shell v91.

### 10.55 Native editing regressions after the preservation policy (shell v92)

The user supplied IMG_1119/1120 and processed IMG_1121/1122 in
D:/Downloads/16pro/iCloud Photos. Both inputs already lack the Styles URI,
linear thumbnail and delta map, despite retaining Bright and pad coordinates.
Adding Texture alone does not restore Styles; the v91 native status incorrectly
implied that it did. The default incomplete-native route now preserves the
input without advertising an incomplete Texture renderer. Experimental Styles
reconstruction is explicit, retains the selected preset/pad, and warns that
missing original colour calibration can still change Photos rendering.
IMG_1119 is returned byte-identically. IMG_1120 receives only an additive HDR
role/reference for its own unambiguous ISO gain map; all payloads are identical.
Registration no longer unnecessarily depends on a Styles plist being present.

The blanket removal of native reconstruction also regressed the previously
accepted iPhone 13 Pro Max case. IMG_6246 decodes to a sharp base and uses the
legacy Photo capture class with camera depth. That contract again receives the
accepted renderer after Styles processing, without AI or re-encoding depth.
Other incomplete captures require explicit confirmation that Portrait was
turned off in Photos and the uploaded image is sharp. A compact notice appears
above output actions; an unknown state is never represented as certainly On.
Complete native renderers and Styles stay on the additive preservation route.

ExifTool's Apple.pm identifies 0x1f as PhotosAppFeatureFlags, not Portrait
On/Off; 0x14 is ImageCaptureType (2 Portrait, 10 Photo, 11 Manual Focus, 12 Scene).
The former is no longer interpreted as an enable state. These private fields
alone cannot establish whether edited RGB contains baked blur. The adapter
supports understood capture layouts with a confirmed sharp base, while default
diagnostic calls still do not rebuild arbitrary captures.
Source: https://github.com/exiftool/exiftool/blob/master/lib/Image/ExifTool/Apple.pm

107 selected tests complete: 97 passes, ten optional-fixture skips, no failures.
PWA validation passes. The browser probe covers both 16 Pro pairs, complete
IMG_1092, already processed IMG_1094, and automatic legacy IMG_6246 restoration.
It verifies exact original compressed primary/HDR/depth data and selected Style
parameters. The reconstructed 13 Pro file contains rendering parameters and
Styles, but the updated result still needs physical Photos effect validation.
Soft Skin is mocked as no-face only in the experimental reconstruction probe.
Private V7 comparison files are not published or committed.

### 10.56 Device feedback: preserved Bright versus restored editor (shell v93)

The user confirms the 13 Pro Portrait-Off path works again. On the supplied
16 Pro samples, saving the unchanged/default result keeps Bright in photo info,
but the imported copy has no Styles/ƒ editor. Explicit Styles reconstruction
allows Styles, and confirmed Portrait Off also allows ƒ/lighting, but the colour
still deepens in Edit. This is not evidence that the preserved preset changed
to Standard, nor evidence that turning Portrait off restores missing Styles data.

The missing-graph reconstruction previously classified these native sources as
non-native for automatic Soft Skin, allowing generated person/skin statistics
to rewrite the new Styles plist. Both the caller and the worker installer now
protect native iPhone 16+ sources independent of whether the source Styles URI
exists. Texture masks/people may still be supplemented; source selection, RGB,
HDR and the pre-supplementation Styles plist remain unchanged. A regression
simulates missing editing resources and a misclassified caller, and verifies
that older generated Styles still receive their measured statistics.

Actual browser/model processing of IMG_1119/IMG_1120 reported no suitable face
for either image. Their guarded outputs are byte-identical to the corresponding
V7 reconstructions. Therefore this guard DOES NOT resolve the observed darkening
on those examples, and these duplicate files should not be presented as a new
colour test. The default incomplete result now visibly explains that saving it
does not restore Styles/ƒ, and that reconstruction can still deepen colour even
after Portrait Off. Native Styles coefficients in complete Bright captures
IMG_0932 and IMG_1092 differ in 49,590 of 51,840 bytes; a universal replacement
cannot be inferred from matching presets. No unrelated native calibration is
copied, selection values are not neutralized, and no colour fix is claimed.


### 10.57 AI Detail HDR rebase experiment (feature/ai-ml-processing, 2026-10-11)

The opt-in AI Detail preprocessing path now has an HDR-aware implementation instead
of sharpening an SDR primary while leaving its gain map stale. For compatible ISO
21496-1 gain maps the browser parses the existing tmap headroom, per-channel
GainMapMin/GainMapMax, Gamma and SDR/HDR offsets. It reconstructs the original HDR
alternate in linear light, transfers the AI restoration's per-channel linear detail
delta to that alternate, then solves and quantizes a replacement gain map against
the restored SDR/primary image. Existing tmap metadata is kept byte-exact. If more
than 2% of gain components would exceed the declared min/max range, the AI path
fails closed and the original image is retained.

JPEG Adaptive HDR now uses this rebase before the existing generated HEIC/Styles
assembly. Native HEIC HDR has a separate browser path that decodes the photo's own
primary and gain-map grids, supports both RGB 4:2:0 gain maps and Apple's common
monochrome HEVC gain maps, runs the selected Lite/Standard/Pro restoration model,
re-encodes the primary/gain grids, regenerates the normal and linear thumbnails,
and repacks only changed external payloads. Primary codec colour/range signalling
is required to be explicit and is preserved; unsupported colour/tmap contracts
fall back to the original HEIC. Monochrome gain maps preserve decoded gray samples
and full/limited range; their primaries/transfer/matrix VUI may be absent after
x265 because those tags do not affect gray numerical gain samples.

Two real-browser Edge/WebGPU + FFmpeg.wasm end-to-end probes passed with the Lite
SPAN model. HDR_Edit_Isolation_V21/A_V20_Control_AllFeatures_NoAIDepth (3024x4032,
RGB P3/sRGB gain map) completed in ~36.4 s: 48 primary + 12 gain tiles and two
thumbnail resources changed, 49 unrelated external payloads remained byte-exact,
21 of 9,144,576 gain components clipped to the existing declared range. The
native Portrait 5129 Styles+Texture fixture (4032x3024 primary, monochrome Apple
gain map) completed in ~45.2 s: the same 62 image resources changed, 63 unrelated
payloads including Styles/Exif/depth remained byte-exact, 663 of 9,144,576 gain
components clipped, and maximum measured quantized linear-HDR solve error was
~0.00362 in the probe. The output remains 48 primary + 12 HDR tiles with the
original tmap values.

A private phone-test artifact is written to
tests/private-fixtures/AI_Detail_HDR_V1/IMG_5129_Lite_AI_HDR.HEIC. It is not
published or committed. Desktop structural tests do NOT establish Apple Photos
rendering/editability. The file still requires physical iPhone import, HDR display,
Styles/Texture, aperture and Portrait Lighting checks, including Save -> reopen ->
re-edit. Current full-resolution AI preprocessing is intentionally bounded to
12.5 megapixels to avoid unsafe mobile memory peaks; larger native HDR photos fail
closed until a streaming/tiled full-image implementation is validated.

The selected browser regression set completes 140 cases: 125 passes, 15 optional
private-fixture skips, no failures. PWA, module-path and three-language checks pass.


### 10.58 AI Detail inference concurrency and progress optimization (2026-10-11)

Performance profiling on the local Windows laptop showed that 256px tile count was
not the only bottleneck. ONNX Runtime WebGPU does not allow concurrent
`InferenceSession.run()` calls from multiple sessions in one JS realm (it throws
"Session already started"), so true concurrent inference requires separate
DedicatedWorker realms, each with its own ORT session. The production detail path
now uses a SharedArrayBuffer-backed global input/output image and assigns disjoint
global tile indices to workers. Tile cores do not overlap, so workers write
separate output regions and no band seam/stitching approximation is introduced.

Measured policy:
- Lite / SPAN: 384px tiles, up to 2 WebGPU workers.
- Standard / RPLKSR-S: 256px tiles, up to 4 WebGPU workers.
- Pro / Fatality DeBlur: 256px tiles, exactly 1 WebGPU worker; two workers were
  slower in the measured workload.
- Desktop auto-scaling: <8 logical CPUs = 1 worker; 8-11 = at most 2 workers;
  >=12 = at most 4 workers, still capped by the per-model value above.
- WASM/CPU remains one inference worker but ORT may use up to 4 WASM threads on
  cross-origin-isolated pages, avoiding nested worker oversubscription.

Direct WebGPU dynamic-shape measurements (single session, average run time) showed
that larger tiles are not universally faster: Lite 256/384/512 = 74/118/271 ms;
Standard = 2394/5659/9668 ms; Pro = 1203/2777/12103 ms. Per-pixel throughput
favoured 384 for Lite but did not justify larger tiles for Standard/Pro.

Production 768x768 Standard tests with the shared-buffer worker pool measured:
1 worker 82.6 s, 2 workers 43.4 s, 3 workers 35.0 s, 4 workers 26.1 s,
5 workers 28.8 s, 6 workers 25.4 s. Four is selected instead of six because the
~0.6 s difference is small/noisy while six duplicates 50% more sessions/VRAM.
An earlier worker-isolation benchmark also measured Pro at ~21.4 s with one worker
versus ~24.9 s with two, confirming the single-worker Pro policy.

On the real 3024x4032 Adaptive HDR JPEG
`tests/private-fixtures/HDR_Input/IDG_20251020_121945_809.JPEG`, the Lite
end-to-end browser/WebGPU/FFmpeg.wasm path dropped from ~57.3 s before this change
to ~31.4 s after 384px + two-worker inference, about a 45% wall-time reduction.
HDR remained enabled; 48 primary + 12 gain tiles and the original tmap
(headroom 0 -> 3.83289) were preserved structurally. Gain-map rebasing remained
21 clipped components out of 9,144,576 with the same measured maximum solve error.

AI Detail/HDR progress shown in the UI now uses percentages instead of raw
`done/total` counters for inference, primary/raster tile encoding, auxiliary HDR
gain-map encoding, and native HDR decode/encode phases. Service-worker shell cache
is v107.

The selected browser regression set now completes 142 cases: 127 passes,
15 optional private-fixture skips, no failures. PWA, module-path and three-language
checks pass.
