// Controlled on-device diagnostic: restore original EXIF in an export of the same photo.
// This does not establish that Photos supports Portrait and Styles together.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {discoverHeic, extractItem} from '../web/src/heif.js';
import {be, box, concat} from '../web/src/box.js';

const [originalPath, exportedPath, outputPath] = process.argv.slice(2);
assert.ok(originalPath && exportedPath && outputPath,
  'Pass original HEIC, its processed HEIC, and a new output path');
const original = new Uint8Array(fs.readFileSync(originalPath));
const exported = new Uint8Array(fs.readFileSync(exportedPath));
const source = discoverHeic(original), before = discoverHeic(exported);
assert.ok(source.exifItem !== null && before.exifItem !== null, 'Both files need EXIF');
assert.equal(source.primary, before.primary, 'Requires the original item graph');
let sourcePayloadsChecked = 0;
for (const [id, item] of source.iloc.items) {
  if (id === source.exifItem || item.constructionMethod !== 0) continue;
  assert.deepEqual(extractItem(exported, before.iloc, id), extractItem(original, source.iloc, id),
    `Original item ${id} differs; use an export of this exact photo`);
  sourcePayloadsChecked++;
}
const exif = extractItem(original, source.iloc, source.exifItem);
const location = before.iloc.items.get(before.exifItem);
assert.equal(location.constructionMethod, 0);
assert.equal(before.iloc.baseOffsetSize, 0);
assert.equal(before.iloc.offsetSize, 4);
assert.equal(before.iloc.lengthSize, 4);
assert.equal(location.extents.length, 1);
assert.ok(exported.length + 8 + exif.length < 2 ** 32);
const result = concat([exported, box('mdat', exif)]);
result.set(be(exported.length + 8, 4), location.extents[0].offsetPos);
result.set(be(exif.length, 4), location.extents[0].lengthPos);
const after = discoverHeic(result);
assert.deepEqual(extractItem(result, after.iloc, after.exifItem), exif);
assert.deepEqual(after.refs, before.refs);
assert.deepEqual(after.props, before.props);
let exportedPayloadsChecked = 0;
for (const [id, item] of before.iloc.items) {
  if (id === before.exifItem || item.constructionMethod !== 0) continue;
  assert.deepEqual(extractItem(result, after.iloc, id), extractItem(exported, before.iloc, id));
  exportedPayloadsChecked++;
}
// Exclusive creation also protects both inputs if an input path is supplied as output.
fs.writeFileSync(outputPath, result, {flag: 'wx'});
console.log(JSON.stringify({outputPath, sourcePayloadsChecked, exportedPayloadsChecked,
  originalExifRestored: true, referencesAndPropertiesUnchanged: true,
  photosPortraitAndStylesUI: 'requires iPhone verification'}, null, 2));
