// Private on-device diagnostics. Neither variant is a validated production fix.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {be, box, concat, topBox} from '../web/src/box.js';
import {discoverHeic, extractItem, parseIloc, parseIinf, addItems, findItemsByType,
  propertyBoxBytes, idatItemBytes} from '../web/src/heif.js';
import {extractAppleMakerNoteTag} from '../web/src/exif.js';
import {graftStyleGraph} from '../web/src/graft.js';
import {addTextureItems, softSkinPeople, filmGrainSeed, hasTexture,
  URI_TEXTURE_STYLES} from '../web/src/texture.js';

const [sourcePath, exportPath, directory, stage] = process.argv.slice(2);
assert.ok(sourcePath && exportPath && directory, 'Pass original, its processed export, and output directory');
const source = new Uint8Array(fs.readFileSync(sourcePath));
const exported = new Uint8Array(fs.readFileSync(exportPath));
const a = discoverHeic(source), b = discoverHeic(exported);
assert.equal(a.stylesItem, null, 'This diagnostic requires a source without native Styles');
assert.ok(b.stylesItem !== null && b.linearThumb !== null);
for (const [id, item] of a.iloc.items) {
  if (id === a.exifItem || item.constructionMethod !== 0) continue;
  assert.deepEqual(extractItem(exported, b.iloc, id), extractItem(source, a.iloc, id),
    `Export item ${id} must belong to this exact source photo`);
}
const originalExif = extractItem(source, a.iloc, a.exifItem);

function restoreExif(data) {
  const d = discoverHeic(data), item = d.iloc.items.get(d.exifItem);
  assert.equal(item.constructionMethod, 0);
  assert.equal(item.extents.length, 1);
  assert.equal(d.iloc.offsetSize, 4);
  assert.equal(d.iloc.lengthSize, 4);
  assert.equal(d.iloc.baseOffsetSize, 0);
  const result = concat([data, box('mdat', originalExif)]);
  result.set(be(data.length + 8, 4), item.extents[0].offsetPos);
  result.set(be(originalExif.length, 4), item.extents[0].lengthPos);
  return result;
}

function appendGraph(meta, payloads) {
  const delta = meta.length - a.meta.size, m = meta.slice();
  const iloc = parseIloc(m, topBox(m, 'meta'));
  assert.equal(iloc.offsetSize, 4);
  assert.equal(iloc.lengthSize, 4);
  assert.equal(iloc.baseOffsetSize, 0);
  const tail = source.subarray(a.meta.off + a.meta.size);
  let cursor = a.meta.off + meta.length + tail.length + 8;
  const blobs = [];
  for (const [id, item] of iloc.items) {
    if (item.constructionMethod !== 0) continue;
    if (payloads.has(id)) {
      assert.equal(item.extents.length, 1);
      const payload = payloads.get(id);
      m.set(be(cursor, 4), item.extents[0].offsetPos);
      m.set(be(payload.length, 4), item.extents[0].lengthPos);
      blobs.push(payload); cursor += payload.length;
    } else {
      for (const extent of item.extents) {
        assert.ok(extent.offset >= a.meta.off + a.meta.size);
        m.set(be(extent.offset + delta, 4), extent.offsetPos);
      }
    }
  }
  assert.ok(cursor < 2 ** 32);
  return concat([source.subarray(0, a.meta.off), m, tail, box('mdat', concat(blobs))]);
}

function validate(data, preserveExif = true) {
  const d = discoverHeic(data);
  for (const [id, item] of a.iloc.items) {
    const read = (bytes, graph) => item.constructionMethod === 0
      ? extractItem(bytes, graph.iloc, id) : idatItemBytes(bytes, id, graph.meta);
    if (preserveExif || id !== a.exifItem)
      assert.deepEqual(read(data, d), read(source, a), `Source payload ${id} changed`);
    const types = (a.props.associations.get(id) || []).map(p => a.props.properties[p.index - 1].type);
    for (const type of types) assert.deepEqual(propertyBoxBytes(data, d.props, id, type),
      propertyBoxBytes(source, a.props, id, type), `Source property ${id}/${type} changed`);
  }
  for (const ref of a.refs) assert.ok(d.refs.some(r => r.type === ref.type && r.from === ref.from
    && JSON.stringify(r.to) === JSON.stringify(ref.to)), 'Original reference missing');
  return {styles: d.stylesItem !== null, texture: hasTexture(d.infos),
    originalPayloadsPreserved: a.iloc.items.size - (preserveExif ? 0 : 1),
    originalExifPreserved: preserveExif};
}

const marker = extractAppleMakerNoteTag(originalExif);
const lt = b.linearThumb;
const thumbnail = {sample: extractItem(exported, b.iloc, lt),
  hvcC: propertyBoxBytes(exported, b.props, lt, 'hvcC'),
  ispe: propertyBoxBytes(exported, b.props, lt, 'ispe'),
  pixi: propertyBoxBytes(exported, b.props, lt, 'pixi')};
const [stylesData] = graftStyleGraph(source, a, extractItem(exported, b.iloc, b.stylesItem),
  marker.payload, marker.type, thumbnail, false, true);
const [textureMeta, texturePayloads] = addTextureItems(source.slice(a.meta.off, a.meta.off + a.meta.size),
  a.primary, softSkinPeople(source, a), filmGrainSeed(source, a));
let variants = [
  ['IMG_0548_A_StylesOnly_OriginalExif.HEIC', restoreExif(stylesData)],
  ['IMG_0548_B_TextureMetadataOnly_OriginalExif.HEIC', appendGraph(textureMeta, texturePayloads)],
];
if (stage === 'stage2') {
  // Isolate the texture record from the twelve synthetic semantic mattes.
  const infos = parseIinf(textureMeta, topBox(textureMeta, 'meta'));
  const textureId = [...infos].find(([, info]) => info.uri === URI_TEXTURE_STYLES)?.[0];
  assert.ok(textureId !== undefined);
  const [meta, assigned] = addItems(source.slice(a.meta.off, a.meta.off + a.meta.size), [{
    key: 'texture-record', itemType: 'uri ', itemName: 'metadata',
    contentType: URI_TEXTURE_STYLES, refType: 'cdsc',
    refTo: [a.primary, ...findItemsByType(a.infos, 'tmap').slice(0, 1)],
  }]);
  const textureOnly = appendGraph(meta,
    new Map([[assigned.get('texture-record'), texturePayloads.get(textureId)]]));
  // Unlike A, retain the tool's Styles marker so the Styles renderer can activate.
  const exportedMarker = extractAppleMakerNoteTag(extractItem(exported, b.iloc, b.exifItem));
  const [activeStyles] = graftStyleGraph(source, a, extractItem(exported, b.iloc, b.stylesItem),
    exportedMarker.payload, exportedMarker.type, thumbnail, false, true);
  variants = [
    ['IMG_0548_C_TextureRecord_NoAddedMattes.HEIC', textureOnly],
    ['IMG_0548_D_ActiveStyles_NoTexture.HEIC', activeStyles, false],
  ];
}
fs.mkdirSync(directory, {recursive: true});
for (const [name, data, preserveExif = true] of variants) {
  const checked = validate(data, preserveExif), destination = path.join(directory, name);
  fs.writeFileSync(destination, data, {flag: 'wx'});
  console.log(JSON.stringify({destination, ...checked, photosUI: 'requires iPhone test'}));
}
