import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {imageFormat} from '../../web/src/image-format.js';
import {targetGeometry, buildRasterHeic} from '../../web/src/raster/raster-import.js';
import {generateSyntheticHevc} from '../../web/src/raster/synthetic-hevc.js';
import {buildGeneratedProfile} from '../../web/src/raster/generated-profile.js';
import {discoverHeic, dimensionsForItem, extractItem, auxUriForItem, MATTE_URIS,
  propertyBoxBytes} from '../../web/src/raster/heif.js';
import {readExifOrientation} from '../../web/src/raster/exif.js';
import {hasTexture} from '../../web/src/raster/texture.js';
import {rgbaToI420} from '../../web/src/raster/raster-color.js';
import {box, concat, be} from '../../web/src/raster/box.js';

test('signatures distinguish HEIC and AVIF regardless of file extension', () => {
  const text = s => new TextEncoder().encode(s);
  const ftyp = (...brands) => box('ftyp', concat([text(brands[0]), be(0,4), ...brands.slice(1).map(text)]));
  assert.equal(imageFormat(ftyp('mif1','avif')), 'avif');
  assert.equal(imageFormat(ftyp('heic','mif1')), 'heic');
  assert.equal(imageFormat(Uint8Array.of(255,216,255)), 'jpeg');
  assert.equal(imageFormat(Uint8Array.of(137,80,78,71,13,10,26,10)), 'png');
  assert.equal(imageFormat(text('RIFF0000WEBP')), 'webp');
  assert.equal(imageFormat(text('GIF89a')), 'gif');
  assert.equal(imageFormat(text('<svg>')), 'unknown');
  assert.equal(imageFormat(Uint8Array.of(137,80,0,0,0,0,0,0)), 'unknown');
});

test('portrait, landscape, small, high-resolution and panorama geometry fits every grid', () => {
  for (const [width,height] of [[900,600],[600,900],[7,5],[8000,6000],[48000,600],[600,48000]]) {
    const g = targetGeometry({width,height});
    assert.ok(g.primaryTiles <= 48);
    assert.ok(g.hdrColumns*g.hdrRows <= 12);
    assert.ok(g.deltaColumns*g.deltaRows <= 30);
    assert.ok(Math.abs((g.displayWidth/g.displayHeight)/(width/height)-1) < 0.01);
    if(width===900) assert.deepEqual([g.displayWidth,g.displayHeight], [900,600]);
  }
  assert.throws(()=>targetGeometry({width:0,height:100}));
});

test('software colour conversion preserves black/white and RGB endpoint ranges', () => {
  for (const [color,expected] of [[[0,0,0],[16,128,128]],[[255,255,255],[235,128,128]],
    [[255,0,0],[63,102,240]],[[0,255,0],[173,42,26]],[[0,0,255],[32,240,118]]]) {
    const rgba = Uint8ClampedArray.from(Array(4).fill([...color,255]).flat());
    assert.deepEqual([...rgbaToI420(rgba,2,2)], [...Array(4).fill(expected[0]), ...expected.slice(1)]);
  }
});

const fixture = JSON.parse(fs.readFileSync(new URL('./raster-hevc.fixture.json',import.meta.url)));
const assets = await generateSyntheticHevc(null, async (_, options) => {
  const asset = options.pixelFormat !== 'gray' ? fixture.assets.delta
    : options.width === 768 ? fixture.assets.textureMask : fixture.assets.mask;
  return {...asset, hvcc:Uint8Array.from(asset.hvcc), payload:Uint8Array.from(asset.payload)};
});

test('new raster container keeps own tiles, independent Main10 thumbnail and removes donor Portrait masks', () => {
  const profile = buildGeneratedProfile('48-12',assets), d = discoverHeic(profile.meta);
  const geometry = targetGeometry({width:900,height:600});
  const payload = Uint8Array.of(0,0,0,4,38,1,0,0);
  const codec = propertyBoxBytes(profile.meta,d.props,d.primaryTiles[0],'hvcC');
  const linear = {...assets.delta, width:768,height:1024,
    pixi:box('pixi',Uint8Array.of(0,0,0,0,3,10,10,10)),colr:assets.delta.colr};
  const output = buildRasterHeic(profile,{main:Array(geometry.primaryTiles).fill(payload),
    mainHvcc:codec,thumb:payload,thumbHvcc:codec,hdr:payload,hdrHvcc:codec,
    linearThumbnail:linear},null,null,geometry);
  const result = discoverHeic(output);
  assert.deepEqual(dimensionsForItem(result.props,result.primary),[600,900]);
  assert.equal(result.primaryTiles.length,geometry.primaryTiles);
  for(const id of result.primaryTiles) assert.deepEqual(extractItem(output,result.iloc,id),payload);
  assert.equal(readExifOrientation(extractItem(output,result.iloc,result.exifItem)),6);
  assert.deepEqual(dimensionsForItem(result.props,result.linearThumb),[768,1024]);
  assert.ok(result.stylesItem !== null);
  assert.ok(hasTexture(result.infos));
  assert.equal([...result.infos.keys()].some(id => auxUriForItem(result.props,id) === MATTE_URIS.portraiteffectsmatte),false);
});
