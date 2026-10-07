import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {exifDateFields, photoCaptureDate} from '../../web/src/photo-date.js';
import {buildRasterExif} from '../../web/src/raster/raster-import.js';
import {concat,be} from '../../web/src/box.js';

function datedExif() {
  const le = (n,size) => be(n,size).reverse(), text = s => new TextEncoder().encode(s+'\0');
  const parts=[Uint8Array.of(73,73,42,0,0,0,0,0)]; let length=8;
  const append = b => {const offset=length;parts.push(b);length+=b.length;return offset;};
  const table = fields => {
    const entries=fields.map(([tag,value])=>{
      const bytes=text(value), offset=append(bytes);
      return concat([le(tag,2),le(2,2),le(bytes.length,4),bytes.length>4?le(offset,4):concat([bytes,new Uint8Array(4-bytes.length)])]);
    });
    return append(concat([le(fields.length,2),...entries,new Uint8Array(4)]));
  };
  const date=table([[0x9003,'2018:04:05 06:07:08'],[0x9004,'2018:04:05 06:07:08'],
    [0x9011,'+07:00'],[0x9012,'+07:00'],[0x9291,'456'],[0x9292,'456']]);
  const time=text('2026:10:08 12:00:00'), timeOffset=append(time);
  const root=append(concat([le(2,2),le(0x0132,2),le(2,2),le(time.length,4),le(timeOffset,4),
    le(0x8769,2),le(4,2),le(1,4),le(date,4),new Uint8Array(4)]));
  const tiff=concat(parts);tiff.set(le(root,4),4);
  return concat([be(6,4),new TextEncoder().encode('Exif\0\0'),tiff]);
}

test('raster EXIF keeps capture date, timezone and fractional seconds independently of modification date',()=>{
  const original=datedExif();
  const output=buildRasterExif(new TextEncoder().encode('test-style-marker'),7,original,
    {storedWidth:600,storedHeight:900});
  assert.deepEqual(exifDateFields(output),exifDateFields(original));
  assert.equal(exifDateFields(output).original,'2018:04:05 06:07:08');
  assert.equal(exifDateFields(output).offsetOriginal,'+07:00');
  assert.equal(exifDateFields(output).subsecOriginal,'456');
});

for(const [original,processed] of [
  ['C:/Users/WanThinnn/Downloads/IMG_1739.HEIC','C:/Users/WanThinnn/Downloads/IMG_1739_ExperimentalStyle.HEIC'],
  ['ref/Elio-backup/tests/IMG_0269.HEIC','ref/Elio-backup/tests/IMG_0269_texture_only.HEIC'],
]) test(`capture time is identical after processing ${original}`,{skip:!fs.existsSync(original)||!fs.existsSync(processed)},()=>{
  const read = path => photoCaptureDate(new Uint8Array(fs.readFileSync(path)));
  const before=read(original); assert.ok(before);
  assert.deepEqual(read(processed),before);
  if(before.subsec && before.timestamp!==undefined) assert.equal(before.timestamp%1000,
    Number(before.subsec.slice(0,3).padEnd(3,'0')));
});

test('missing and malformed date metadata is not replaced with the current time',()=>{
  assert.deepEqual(exifDateFields(null),{});
  assert.deepEqual(exifDateFields(Uint8Array.of(1,2,3)),{});
});
