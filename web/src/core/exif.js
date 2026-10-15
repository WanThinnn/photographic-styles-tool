// Apple MakerNote surgery: preserve the target's Exif and inject only tag 0x54.
// Port of the corresponding functions in photographic_style_port.py.

import { concat, be } from "./box.js";
import { TIFF_TYPE_SIZES } from "./heif.js";

const tiffU = (d, off, n, little) => {
  let v = 0;
  if (little) { for (let i = n - 1; i >= 0; i--) v = v * 256 + d[off + i]; }
  else { for (let i = 0; i < n; i++) v = v * 256 + d[off + i]; }
  return v;
};

const tiffBytes = (value, n, little) => {
  const b = be(value, n);
  return little ? b.reverse() : b;
};

/** Camera model from the root TIFF IFD; missing/malformed metadata is unknown. */
export function exifCameraModel(exifPayload) {
  if (!exifPayload || exifPayload.length < 12) return null;
  const start = tiffU(exifPayload, 0, 4, false) + 4;
  const tiff = exifPayload.subarray(start);
  const order = String.fromCharCode(...tiff.subarray(0, 2));
  if (tiff.length < 8 || !['II', 'MM'].includes(order)) return null;
  const little = order === 'II';
  if (tiffU(tiff, 2, 2, little) !== 42) return null;
  const offset = tiffU(tiff, 4, 4, little);
  if (offset < 8 || offset + 2 > tiff.length) return null;
  const count = tiffU(tiff, offset, 2, little);
  if (offset + 2 + count * 12 + 4 > tiff.length) return null;
  for (let i = 0; i < count; i++) {
    const entry = offset + 2 + i * 12;
    if (tiffU(tiff, entry, 2, little) !== 0x0110) continue;
    if (tiffU(tiff, entry + 2, 2, little) !== 2) return null;
    const size = tiffU(tiff, entry + 4, 4, little);
    const at = size <= 4 ? entry + 8 : tiffU(tiff, entry + 8, 4, little);
    if (size < 1 || size > 128 || at + size > tiff.length) return null;
    return new TextDecoder().decode(tiff.subarray(at, at + size)).replace(/\0.*$/s, '');
  }
  return null;
}

function locateExifMakerNoteEntry(exifPayload) {
  // The Exif item payload starts with a 4-byte offset to the TIFF header.
  if (!exifPayload || exifPayload.length < 12) throw new Error("Exif payload is truncated");
  const tiffStart = tiffU(exifPayload, 0, 4, false) + 4;
  if (!Number.isSafeInteger(tiffStart) || tiffStart < 4 || tiffStart > exifPayload.length - 8)
    throw new Error("Exif TIFF offset is invalid");
  const tiff = exifPayload.subarray(tiffStart);
  const order = String.fromCharCode(tiff[0], tiff[1]);
  if (order !== "II" && order !== "MM") throw new Error("Unknown TIFF byte order");
  const little = order === "II";
  if (tiffU(tiff, 2, 2, little) !== 42) throw new Error("Invalid TIFF magic");
  const table=(offset,label)=>{
    if(!Number.isSafeInteger(offset)||offset<8||offset+2>tiff.length)
      throw new Error(label+" offset is invalid");
    const count=tiffU(tiff,offset,2,little);
    if(count>4096||offset+2+count*12+4>tiff.length)
      throw new Error(label+" table is truncated");
    return count;
  };
  const ifd0 = tiffU(tiff, 4, 4, little);
  const n0 = table(ifd0,"IFD0");
  let p = ifd0 + 2;
  let exifIfd = null;
  for (let i = 0; i < n0; i++) {
    if (tiffU(tiff, p, 2, little) === 0x8769) {
      if(tiffU(tiff,p+2,2,little)!==4||tiffU(tiff,p+4,4,little)!==1)
        throw new Error("Unsupported ExifIFD pointer");
      exifIfd = tiffU(tiff, p + 8, 4, little);
      break;
    }
    p += 12;
  }
  if (exifIfd === null) throw new Error("ExifIFD pointer 0x8769 not found");
  const ne = table(exifIfd,"ExifIFD");
  p = exifIfd + 2;
  for (let i = 0; i < ne; i++) {
    if (tiffU(tiff, p, 2, little) === 0x927c) return { tiffStart, tiff, little, entry: p };
    p += 12;
  }
  throw new Error("Apple MakerNote tag 0x927c not found");
}

export function getMakerNoteBlob(exifPayload) {
  const { tiff, little, entry } = locateExifMakerNoteEntry(exifPayload);
  const typ = tiffU(tiff, entry + 2, 2, little);
  const cnt = tiffU(tiff, entry + 4, 4, little);
  const unit = TIFF_TYPE_SIZES[typ];
  if (!unit) throw new Error(`Unsupported MakerNote TIFF type ${typ}`);
  const total = unit * cnt;
  if (!Number.isSafeInteger(total) || total < 0 || total > tiff.length)
    throw new Error("Invalid MakerNote size");
  if (total <= 4) return tiff.subarray(entry + 8, entry + 8 + total);
  const off = tiffU(tiff, entry + 8, 4, little);
  if (!Number.isSafeInteger(off) || off < 0 || off + total > tiff.length)
    throw new Error("MakerNote payload is out of bounds");
  return tiff.subarray(off, off + total);
}

/** Semantic Exif/TIFF inventory excluding Apple MakerNote contents and offsets.
 *
 * Compatibility recovery is allowed to rebuild MakerNote editing records, but
 * capture metadata such as camera identity, date, exposure and GPS must remain
 * untouched. Pointer entries are represented by their presence while their
 * target IFDs are traversed semantically, so harmless offset relocation does
 * not look like a metadata change.
 */
export function listExifMetadataEntries(exifPayload) {
  if (!exifPayload || exifPayload.length < 12) throw new Error("Exif payload is truncated");
  const tiffStart = tiffU(exifPayload, 0, 4, false) + 4;
  const tiff = exifPayload.subarray(tiffStart);
  if (tiff.length < 8) throw new Error("Exif TIFF offset is invalid");
  const order = String.fromCharCode(tiff[0], tiff[1]);
  if (!["II", "MM"].includes(order)) throw new Error("Unknown TIFF byte order");
  const little = order === "II";
  if (tiffU(tiff, 2, 2, little) !== 42) throw new Error("Invalid TIFF magic");

  const POINTERS = new Map([[0x8769, "exif"], [0x8825, "gps"], [0xa005, "interop"]]);
  const entries = [], visited = new Set();
  let totalEntries = 0;

  const walk = (offset, label, followNext = false) => {
    if (!offset || visited.has(offset)) return;
    if (offset < 8 || offset + 2 > tiff.length) throw new Error("Exif IFD offset is invalid");
    visited.add(offset);
    const count = tiffU(tiff, offset, 2, little);
    if (count > 4096 || offset + 2 + count * 12 + 4 > tiff.length)
      throw new Error("Exif IFD table is truncated");
    totalEntries += count;
    if (totalEntries > 8192) throw new Error("Exif metadata has too many entries");

    for (let i = 0; i < count; i++) {
      const p = offset + 2 + i * 12;
      const tag = tiffU(tiff, p, 2, little);
      const type = tiffU(tiff, p + 2, 2, little);
      const itemCount = tiffU(tiff, p + 4, 4, little);
      const unit = TIFF_TYPE_SIZES[type];
      if (!unit) throw new Error("Unsupported Exif TIFF type");
      const bytes = unit * itemCount;
      if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > tiff.length)
        throw new Error("Exif entry size is invalid");

      if (tag === 0x927c) continue; // Apple MakerNote is verified separately.
      const child = POINTERS.get(tag);
      if (child) {
        if (type !== 4 || itemCount !== 1) throw new Error("Unsupported Exif IFD pointer");
        const childOffset = tiffU(tiff, p + 8, 4, little);
        entries.push({ifd: label, tag, type, count: itemCount, pointer: child});
        walk(childOffset, child, false);
        continue;
      }

      const at = bytes <= 4 ? p + 8 : tiffU(tiff, p + 8, 4, little);
      if (at < 0 || at + bytes > tiff.length) throw new Error("Exif entry payload is out of bounds");
      entries.push({ifd: label, tag, type, count: itemCount, payload: tiff.slice(at, at + bytes)});
    }

    if (followNext) {
      const next = tiffU(tiff, offset + 2 + count * 12, 4, little);
      if (next) walk(next, label === "ifd0" ? "ifd1" : label + "-next", true);
    }
  };

  const ifd0 = tiffU(tiff, 4, 4, little);
  walk(ifd0, "ifd0", true);
  return entries.sort((a, b) =>
    a.ifd.localeCompare(b.ifd) || a.tag - b.tag || a.type - b.type || a.count - b.count);
}

export function extractAppleMakerNoteTag(exifPayload, wantedTag = 0x54) {
  const mn = getMakerNoteBlob(exifPayload);
  const sig = String.fromCharCode(...mn.subarray(0, 9));
  if (mn.length < 20 || sig !== "Apple iOS") throw new Error("Unsupported Apple MakerNote");
  const little = String.fromCharCode(mn[12], mn[13]) === "II";
  const n = tiffU(mn, 14, 2, little);
  if (n > 4096 || 16 + n * 12 + 4 > mn.length) throw new Error("Truncated Apple MakerNote table");
  for (let i = 0; i < n; i++) {
    const p = 16 + i * 12;
    if (tiffU(mn, p, 2, little) !== wantedTag) continue;
    const typ = tiffU(mn, p + 2, 2, little);
    const cnt = tiffU(mn, p + 4, 4, little);
    const unit = TIFF_TYPE_SIZES[typ];
    if (!unit) throw new Error(`Unsupported Apple MakerNote TIFF type ${type}`);
    const total = unit * cnt;
    if (!Number.isSafeInteger(total) || total < 0 || total > mn.length)
      throw new Error("Invalid Apple MakerNote entry size");
    if (total <= 4) return { type: typ, payload: mn.slice(p + 8, p + 8 + total) };
    const off = tiffU(mn, p + 8, 4, little);
    if (off < 0 || off + total > mn.length) throw new Error("Apple MakerNote entry is out of bounds");
    return { type: typ, payload: mn.slice(off, off + total) };
  }
  throw new Error(`Apple MakerNote tag 0x${wantedTag.toString(16)} not found`);
}

/** Return a bounded semantic inventory of Apple MakerNote entries.
 *
 * This is intentionally read-only and exposes each tag's decoded payload bytes
 * without interpreting private semantics. Compatibility code uses it to prove
 * that rebuilding a legacy editing contract did not silently mutate unrelated
 * capture-time MakerNote records.
 */
export function listAppleMakerNoteTags(exifPayload) {
  const mn = getMakerNoteBlob(exifPayload);
  const sig = String.fromCharCode(...mn.subarray(0, 9));
  if (mn.length < 20 || sig !== "Apple iOS") throw new Error("Unsupported Apple MakerNote");
  const little = String.fromCharCode(mn[12], mn[13]) === "II";
  const n = tiffU(mn, 14, 2, little);
  if (n > 4096 || 16 + n * 12 + 4 > mn.length) throw new Error("Truncated Apple MakerNote table");
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = 16 + i * 12;
    const tag = tiffU(mn, p, 2, little);
    const type = tiffU(mn, p + 2, 2, little);
    const count = tiffU(mn, p + 4, 4, little);
    const unit = TIFF_TYPE_SIZES[type];
    if (!unit) throw new Error(`Unsupported Apple MakerNote TIFF type ${type}`);
    const total = unit * count;
    if (!Number.isSafeInteger(total) || total < 0 || total > mn.length)
      throw new Error("Invalid Apple MakerNote entry size");
    const at = total <= 4 ? p + 8 : tiffU(mn, p + 8, 4, little);
    if (at < 0 || at + total > mn.length) throw new Error("Apple MakerNote entry is out of bounds");
    out.push({tag, type, payload: mn.slice(at, at + total)});
  }
  return out;
}

/** Remove one Apple MakerNote entry while preserving every other entry/value.
 *
 * Legacy Compatibility Export uses this only for a private editing marker whose
 * semantics are known to conflict with the older target contract. Normal photo
 * processing never calls it.
 */
export function removeAppleMakerNoteTag(exifPayload, wantedTag) {
  const { tiffStart, tiff, little: outerLittle, entry } = locateExifMakerNoteEntry(exifPayload);
  const oldMn = getMakerNoteBlob(exifPayload);
  const sig = String.fromCharCode(...oldMn.subarray(0, 9));
  if (oldMn.length < 20 || sig !== "Apple iOS") throw new Error("Unsupported Apple MakerNote");
  const little = String.fromCharCode(oldMn[12], oldMn[13]) === "II";
  const n = tiffU(oldMn, 14, 2, little);
  const tableStart = 16;
  const oldDataStart = tableStart + n * 12 + 4;
  if (oldDataStart > oldMn.length) throw new Error("Truncated Apple MakerNote table");

  const entries = [];
  let found = false;
  for (let i = 0; i < n; i++) {
    const p = tableStart + i * 12;
    const raw = oldMn.slice(p, p + 12);
    const tag = tiffU(raw, 0, 2, little);
    const etyp = tiffU(raw, 2, 2, little);
    const cnt = tiffU(raw, 4, 4, little);
    const total = (TIFF_TYPE_SIZES[etyp] ?? 0) * cnt;
    if (tag === wantedTag) { found = true; continue; }
    entries.push({tag, raw, total});
  }
  if (!found) return exifPayload;

  const shrink = 12;
  for (const e of entries) {
    if (e.total > 4) {
      const off = tiffU(e.raw, 8, 4, little);
      if (off >= oldDataStart) e.raw.set(tiffBytes(off - shrink, 4, little), 8);
    }
  }
  const oldNextPos = tableStart + n * 12;
  const oldNext = tiffU(oldMn, oldNextPos, 4, little);
  const newNext = oldNext >= oldDataStart && oldNext !== 0 ? oldNext - shrink : oldNext;
  const oldData = oldMn.subarray(oldDataStart);
  const rebuilt = concat([
    oldMn.subarray(0, 14), tiffBytes(n - 1, 2, little),
    ...entries.map((e) => e.raw), tiffBytes(newNext, 4, little), oldData,
  ]);

  const newMnOff = tiff.length;
  const newTiff = concat([tiff, rebuilt]);
  newTiff.set(tiffBytes(7, 2, outerLittle), entry + 2);
  newTiff.set(tiffBytes(rebuilt.length, 4, outerLittle), entry + 4);
  newTiff.set(tiffBytes(newMnOff, 4, outerLittle), entry + 8);
  return concat([exifPayload.subarray(0, tiffStart), newTiff]);
}

/**
 * Preserve the target's Exif and inject or replace one MakerNote tag.
 *
 * The existing MakerNote data area is kept byte for byte: inserting a 12-byte IFD
 * entry shifts it by exactly 12, so only out-of-line value offsets are adjusted.
 * The rebuilt MakerNote is appended at the end of the TIFF block and the outer
 * 0x927c entry is repointed at it, which leaves every other target Exif offset
 * valid. This mirrors the Python implementation exactly.
 */
export function injectAppleMakerNoteTag(exifPayload, payload, wantedTag = 0x54, typ = 7) {
  const { tiffStart, tiff, little: outerLittle, entry } = locateExifMakerNoteEntry(exifPayload);
  const oldMn = getMakerNoteBlob(exifPayload);
  const sig = String.fromCharCode(...oldMn.subarray(0, 9));
  if (oldMn.length < 20 || sig !== "Apple iOS") throw new Error("Unsupported Apple MakerNote");
  const little = String.fromCharCode(oldMn[12], oldMn[13]) === "II";
  const n = tiffU(oldMn, 14, 2, little);
  const tableStart = 16;
  const oldDataStart = tableStart + n * 12 + 4;
  if (oldDataStart > oldMn.length) throw new Error("Truncated Apple MakerNote table");

  const entries = [];
  let found = false;
  for (let i = 0; i < n; i++) {
    const p = tableStart + i * 12;
    const raw = oldMn.slice(p, p + 12);
    const tag = tiffU(raw, 0, 2, little);
    const etyp = tiffU(raw, 2, 2, little);
    const cnt = tiffU(raw, 4, 4, little);
    const total = (TIFF_TYPE_SIZES[etyp] ?? 0) * cnt;
    if (tag === wantedTag) { found = true; continue; }
    entries.push({ tag, raw, total });
  }

  const grow = found ? 0 : 12;
  if (grow) {
    for (const e of entries) {
      if (e.total > 4) {
        const off = tiffU(e.raw, 8, 4, little);
        if (off >= oldDataStart) e.raw.set(tiffBytes(off + grow, 4, little), 8);
      }
    }
  }

  const oldNextPos = tableStart + n * 12;
  const oldNext = tiffU(oldMn, oldNextPos, 4, little);
  const newNext = (grow && oldNext >= oldDataStart && oldNext !== 0) ? oldNext + grow : oldNext;
  const oldData = oldMn.subarray(oldDataStart);

  const newCount = found ? n : n + 1;
  const newDataStart = tableStart + newCount * 12 + 4;
  const newPayloadOff = newDataStart + oldData.length;
  const newEntry = new Uint8Array(12);
  newEntry.set(tiffBytes(wantedTag, 2, little), 0);
  newEntry.set(tiffBytes(typ, 2, little), 2);
  newEntry.set(tiffBytes(payload.length, 4, little), 4);
  if (payload.length <= 4) newEntry.set(payload, 8);
  else newEntry.set(tiffBytes(newPayloadOff, 4, little), 8);
  entries.push({ tag: wantedTag, raw: newEntry, total: payload.length });
  entries.sort((a, b) => a.tag - b.tag);

  const rebuilt = concat([
    oldMn.subarray(0, 14), tiffBytes(newCount, 2, little),
    ...entries.map((e) => e.raw), tiffBytes(newNext, 4, little), oldData,
    payload.length > 4 ? payload : new Uint8Array(0),
  ]);

  const newMnOff = tiff.length;
  const newTiff = concat([tiff, rebuilt]);
  newTiff.set(tiffBytes(7, 2, outerLittle), entry + 2); // UNDEFINED
  newTiff.set(tiffBytes(rebuilt.length, 4, outerLittle), entry + 4);
  newTiff.set(tiffBytes(newMnOff, 4, outerLittle), entry + 8);
  return concat([exifPayload.subarray(0, tiffStart), newTiff]);
}
