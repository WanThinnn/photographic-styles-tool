import test from 'node:test';
import assert from 'node:assert/strict';
import {dngFixture,tiledDngFixture} from './dng-fixture.mjs';
import {isDng,inspectDng,extractDngExif} from '../../web/src/dng/dng-tiff.js';
import {dngTilePlan} from '../../web/src/dng/dng-tiles.js';
import {developedPngExif} from '../../web/src/dng/dng-import.js';
import {decodeDng} from '../../web/src/dng/dng-decode.js';
import {imageFormat} from '../../web/src/image-format.js';
import {readExifOrientation,extractRasterExif} from '../../web/src/raster/exif.js';

test('DNG signature checks real TIFF tags and preserves capture Exif in developed PNG',()=>{
  for(const little of [true,false]){
    const dng=dngFixture({little}),original=dng.slice();
    assert.equal(isDng(dng),true);assert.equal(imageFormat(dng),'dng');
    const exif=extractDngExif(dng);assert.equal(readExifOrientation(exif),6);
    // Valid PNG signature + IHDR followed by IEND; the chunk inserter keeps both.
    const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j0xkAAAAASUVORK5CYII=','base64'));
    const out=developedPngExif(png,exif),kept=extractRasterExif(out);
    assert.equal(imageFormat(out),'png');assert.equal(readExifOrientation(kept),1);
    assert.ok(Buffer.from(kept).includes(Buffer.from('2000:01:01 00:00:00')));
    assert.deepEqual(out.subarray(0,33),png.subarray(0,33));assert.deepEqual(dng,original);
    assert.equal(isDng(dng.subarray(0,32)),false);
  }
});
test('large LinearRaw uses bounded tile decoding without discarding calibration',()=>{
  const bytes=tiledDngFixture(),plan=dngTilePlan(bytes);
  assert.ok(plan.outputWidth*plan.outputHeight<=12_000_000);
  assert.equal(plan.orientation,6);
  for(const tile of plan.tiles())assert.deepEqual(inspectDng(tile.bytes).compressions,[7]);
  assert.throws(()=>dngTilePlan(dngFixture(),1000),/large RAW requires/);
});
test('JPEG XL DNG fails explicitly before loading a runtime',async()=>{
  await assert.rejects(decodeDng(dngFixture({compression:52546})),/JPEG XL compression unsupported/);
});
