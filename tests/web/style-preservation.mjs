import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {be, concat} from '../../web/src/core/box.js';
import {exifCameraModel} from '../../web/src/core/exif.js';
import {styleReconstructionRisk} from '../../web/src/styles/style-preservation.js';
import {discoverHeic, extractItem, idatItemBytes, propertyBoxBytes} from '../../web/src/core/heif.js';
import {addTexture} from '../../web/src/styles/texture.js';

function modelExif(model, little = false) {
  const number = (value, size) => little ? be(value, size).reverse() : be(value, size);
  const value = new TextEncoder().encode(model + '\0');
  const tiff = concat([new TextEncoder().encode(little ? 'II' : 'MM'), number(42, 2), number(8, 4),
    number(1, 2), number(0x0110, 2), number(2, 2), number(value.length, 4), number(26, 4),
    new Uint8Array(4), value]);
  return concat([be(6, 4), new TextEncoder().encode('Exif\0\0'), tiff]);
}

function discovery(payload, stylesItem = null, hdrGrid = null) {
  return {stylesItem, hdrGrid, exifItem: 1, iloc: {items: new Map([[1, {
    constructionMethod: 0, baseOffset: 0, extents: [{offset: 0, length: payload.length}],
  }]])}};
}

test('camera model reader handles both TIFF byte orders and malformed metadata', () => {
  for (const little of [true, false]) {
    assert.equal(exifCameraModel(modelExif('iPhone 16 Pro', little)), 'iPhone 16 Pro');
  }
  assert.equal(exifCameraModel(null), null);
  assert.equal(exifCameraModel(modelExif('iPhone 16 Pro').subarray(0, 25)), null);
  const broken = modelExif('iPhone 16 Pro'); broken.set(be(0xffffffff, 4), 14);
  assert.equal(exifCameraModel(broken), null);
});

test('missing newer-iPhone Styles requires a reconstruction decision; native and older photos keep their routes', () => {
  for (const model of ['iPhone 16 Pro', 'iPhone 17', 'iPhone 17 Pro Max']) {
    const data = modelExif(model);
    assert.deepEqual(styleReconstructionRisk(data, discovery(data)), {
      cameraModel: model, nativeStylesMissing: true, hdrGainMapMissing: true,
    });
    assert.equal(styleReconstructionRisk(data, discovery(data, 2, 3)), null);
    assert.equal(styleReconstructionRisk(data, discovery(data, null, 3)).hdrGainMapMissing, false);
  }
  for (const model of ['iPhone 15 Pro', 'iPhone 13', 'iPhone Air', 'iPhone 18 Pro', 'Android', 'iPhone 1600notamodel', '']) {
    const data = modelExif(model);
    assert.equal(styleReconstructionRisk(data, discovery(data)), null);
  }
});

const directory = 'C:/Users/WanThinnn/Downloads/iCloud Photos/iCloud Photos/';
test('reported rendered copy lacks native Styles and HDR before processing', {
  skip: !fs.existsSync(directory + 'IMG_0714-1.HEIC'),
}, () => {
  const data = new Uint8Array(fs.readFileSync(directory + 'IMG_0714-1.HEIC'));
  const d = discoverHeic(data);
  assert.equal(d.stylesItem, null);
  assert.equal(d.linearThumb, null);
  assert.equal(d.deltaGrid, null);
  assert.equal(d.hdrGrid, null);
  assert.ok(styleReconstructionRisk(data, d));
});

test('Vibrant native original adds Texture with every original payload, reference and property preserved', {
  skip: !fs.existsSync(directory + 'IMG_0714.HEIC'),
}, () => {
  const source = new Uint8Array(fs.readFileSync(directory + 'IMG_0714.HEIC'));
  const a = discoverHeic(source);
  assert.ok(a.stylesItem !== null && a.hdrGrid !== null);
  assert.equal(styleReconstructionRisk(source, a), null);
  const {data} = addTexture(source), b = discoverHeic(data);
  for (const [id, item] of a.iloc.items) {
    const read = (bytes, graph) => item.constructionMethod === 0
      ? extractItem(bytes, graph.iloc, id) : idatItemBytes(bytes, id, graph.meta);
    assert.deepEqual(read(data, b), read(source, a), `Original item ${id}`);
    for (const association of a.props.associations.get(id) || []) {
      const type = a.props.properties[association.index - 1].type;
      assert.deepEqual(propertyBoxBytes(data, b.props, id, type),
        propertyBoxBytes(source, a.props, id, type), `Original property ${id}/${type}`);
    }
  }
  for (const ref of a.refs) assert.ok(b.refs.some(r => JSON.stringify(r) === JSON.stringify(ref)));
});
