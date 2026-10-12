import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {be, concat} from '../../web/src/core/box.js';
import {exifCameraModel,injectAppleMakerNoteTag} from '../../web/src/core/exif.js';
import {buildBplist,BplistReal} from '../../web/src/core/bplist.js';
import {styleReconstructionRisk,preserveNativeStyles,nativeTextureCapture} from '../../web/src/styles/style-preservation.js';
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

function nativeStyleExif(model) {
  const value=new TextEncoder().encode(model+'\0');
  const signature=new TextEncoder().encode('Apple iOS');
  const maker=concat([signature,new Uint8Array(3),new TextEncoder().encode('MM'),be(0,2),new Uint8Array(4)]);
  const tiff=concat([
    new TextEncoder().encode('MM'),be(42,2),be(8,4),
    be(2,2),
    be(0x0110,2),be(2,2),be(value.length,4),be(76,4),
    be(0x8769,2),be(4,2),be(1,4),be(38,4),
    new Uint8Array(4),
    be(1,2),be(0x927c,2),be(7,2),be(maker.length,4),be(56,4),new Uint8Array(4),
    maker,value,
  ]);
  const base=concat([be(6,4),new TextEncoder().encode('Exif\0\0'),tiff]);
  const marker=buildBplist(new Map([
    ['0',1],['1',new BplistReal(0)],['2',new BplistReal(0)],['3',new BplistReal(1)],
    ['4',1],['5',1],['6',4],['7',0],
  ]));
  return injectAppleMakerNoteTag(base,marker,0x54,7);
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

test('iPhone 16+ requires real native Styles evidence instead of the camera model alone', () => {
  for (const model of ['iPhone 16 Pro', 'iPhone 17', 'iPhone 17 Pro Max', 'iPhone 18 Pro']) {
    const thirdParty = modelExif(model);
    assert.equal(preserveNativeStyles(thirdParty,discovery(thirdParty)),false);
    assert.equal(styleReconstructionRisk(thirdParty,discovery(thirdParty)),null);
    assert.equal(preserveNativeStyles(thirdParty,discovery(thirdParty,2,3)),true);

    const data=nativeStyleExif(model);
    assert.equal(exifCameraModel(data),model);
    assert.deepEqual(styleReconstructionRisk(data,discovery(data)), {
      cameraModel: model, nativeStylesMissing: true, hdrGainMapMissing: true,
    });
    assert.equal(styleReconstructionRisk(data,discovery(data,2,3)),null);
    assert.equal(styleReconstructionRisk(data,discovery(data,null,3)).hdrGainMapMissing,false);
    assert.equal(preserveNativeStyles(data,discovery(data)),true);
  }
  for (const model of ['iPhone 15 Pro', 'iPhone 13', 'iPhone Air', 'Android', 'iPhone 1600notamodel', '']) {
    const data = modelExif(model);
    assert.equal(styleReconstructionRisk(data, discovery(data)), null);
    assert.equal(preserveNativeStyles(data,discovery(data)),false);
  }
});

const nativeFilmDirectory=new URL('../private-fixtures/Film_Halation_V1/',import.meta.url);
test('native iPhone 18 Film capture is detected without grafted Texture metadata',{
  skip:!fs.existsSync(new URL('IMG_0243.HEIC',nativeFilmDirectory)),
},()=>{
  const native18=new Uint8Array(fs.readFileSync(new URL('IMG_0243.HEIC',nativeFilmDirectory)));
  const d18=discoverHeic(native18);
  assert.equal(d18.stylesItem,null);
  assert.equal(nativeTextureCapture(native18,d18),true);

  const older=new Uint8Array(fs.readFileSync(new URL('IMG_7864.HEIC',nativeFilmDirectory)));
  const d16=discoverHeic(older);
  assert.equal(nativeTextureCapture(older,d16),false);
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
