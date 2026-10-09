// Private, byte-local classification probe on files already containing depth.
// It does not synthesize depth or establish arbitrary-photo editing support.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {extractRasterExif} from '../web/src/raster/exif.js';
import {getMakerNoteBlob,extractAppleMakerNoteTag} from '../web/src/core/exif.js';
import {discoverHeic,extractItemData,auxUriForItem,DEPTH_URI} from '../web/src/raster/heif.js';

const [jpeg,heic,output]=process.argv.slice(2);
assert.ok(output,'Pass Focos JPEG, separate merged HEIC and a fresh directory');
assert.ok(!fs.existsSync(output),'Never overwrite original files or a previous batch');
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
function jpegExifLocation(data) {
  assert.equal(data[0],255);assert.equal(data[1],216);
  let p=2;
  while(p+4<data.length) {
    assert.equal(data[p++],255);while(data[p]===255)p++;
    const marker=data[p++];if(marker===218||marker===217)break;
    if(marker===1||marker>=208&&marker<=215)continue;
    const size=data[p]*256+data[p+1];assert.ok(size>=2&&p+size<=data.length);
    if(marker===225&&new TextDecoder().decode(data.subarray(p+2,p+8))==='Exif\0\0')return {offset:p+2,length:size-2};
    p+=size;
  }
  throw Error('Missing JPEG EXIF APP1');
}
const specs=[['A_Focos_CaptureTypePortrait.JPEG',jpeg,'jpeg',10],['B_Merged_CaptureTypePortrait.HEIC',heic,'heic',12]];
const results=[];
for(const [name,file,format,expected] of specs) {
  const source=new Uint8Array(fs.readFileSync(file));let exif,exifFileOffset,d;
  if(format==='jpeg') {
    exif=extractRasterExif(source);const loc=jpegExifLocation(source);
    assert.equal(exif.length,loc.length+4);
    assert.deepEqual(exif.subarray(4),source.subarray(loc.offset,loc.offset+loc.length));
    exifFileOffset=loc.offset-4;
  } else {
    d=discoverHeic(source);const item=d.iloc.items.get(d.exifItem);
    assert.equal(item.constructionMethod,0);assert.equal(item.extents.length,1);
    assert.equal(item.baseOffset,0);exifFileOffset=item.extents[0].offset;
    exif=extractItemData(source,d,d.exifItem);
    assert.ok([...d.infos.keys()].some(id=>auxUriForItem(d.props,id)===DEPTH_URI));
  }
  const mn=getMakerNoteBlob(exif),little=new TextDecoder().decode(mn.subarray(12,14))==='II';
  const v=new DataView(mn.buffer,mn.byteOffset,mn.byteLength);let relative;
  for(let i=0;i<v.getUint16(14,little);i++) {
    const p=16+i*12;if(v.getUint16(p,little)!==0x14)continue;
    assert.equal(v.getUint16(p+2,little),9);assert.equal(v.getUint32(p+4,little),1);
    assert.equal(v.getInt32(p+8,little),expected);
    relative=mn.byteOffset-exif.byteOffset+p+8;break;
  }
  assert.ok(relative!==undefined);
  const pos=exifFileOffset+relative,data=source.slice();
  new DataView(data.buffer).setInt32(pos,2,little);
  const restored=data.slice();restored.set(source.subarray(pos,pos+4),pos);
  assert.deepEqual(restored,source,'Only the existing capture-type scalar bytes may change');
  const afterExif=format==='jpeg'?extractRasterExif(data):extractItemData(data,discoverHeic(data),d.exifItem);
  const after=extractAppleMakerNoteTag(afterExif,0x14);
  assert.equal(after.type,9);assert.equal(after.payload.length,4);
  assert.equal(new DataView(after.payload.buffer,after.payload.byteOffset,4).getInt32(0,little),2);
  assert.deepEqual(extractAppleMakerNoteTag(afterExif,0x1f),extractAppleMakerNoteTag(exif,0x1f));
  if(d) {
    const check=discoverHeic(data);assert.deepEqual(check,d);
    for(const id of d.infos.keys())if(id!==d.exifItem)
      assert.deepEqual(extractItemData(data,check,id),extractItemData(source,d,id));
  }
  results.push({name,data,report:{file:name,source:path.resolve(file),format,sourceBytes:source.length,
    sourceSha256:hash(source),sha256:hash(data),captureTypeBefore:expected,captureTypeAfter:2,
    flagFileOffset:pos,flagByteOrder:little?'little':'big',
    changedBytes:[...data.keys()].filter(i=>data[i]!==source[i]),
    allOtherBytesExact:true,photosEditing:'Unverified; supplied originals lack Edit aperture'}});
}
fs.mkdirSync(output,{recursive:true});
for(const r of results)fs.writeFileSync(path.join(output,r.name),r.data,{flag:'wx'});
fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify({results:results.map(r=>r.report)},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(results.map(r=>r.report),null,2));
