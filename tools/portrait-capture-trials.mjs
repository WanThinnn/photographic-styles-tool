// Private classification ablation. No capture flags are production defaults.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {box,concat,be} from '../web/src/box.js';
import {discoverHeic,extractItemData,auxUriForItem,DEPTH_URI} from '../web/src/raster/heif.js';
import {getMakerNoteBlob,extractAppleMakerNoteTag,injectAppleMakerNoteTag} from '../web/src/exif.js';

const [nativePath,jpegPath,output]=process.argv.slice(2);
assert.ok(output,'Pass accepted V5 A, failed V5 B and a new output directory');
assert.ok(!fs.existsSync(output),'Never overwrite an existing batch');
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
function source(file) {
  const data=new Uint8Array(fs.readFileSync(file)),d=discoverHeic(data);
  return {file,data,d,exif:extractItemData(data,d,d.exifItem)};
}
const native=source(nativePath),jpeg=source(jpegPath);
function tags(exif) {
  const mn=getMakerNoteBlob(exif),little=String.fromCharCode(mn[12],mn[13])==='II';
  const view=new DataView(mn.buffer,mn.byteOffset,mn.byteLength),count=view.getUint16(14,little),result=new Map();
  assert.ok(16+count*12+4<=mn.length);
  for(let i=0;i<count;i++) {
    const tag=view.getUint16(16+i*12,little);
    const value=extractAppleMakerNoteTag(exif,tag);
    result.set(tag,{type:value.type,payload:value.payload.slice()});
  }
  return {result,little};
}
const nativeTags=tags(native.exif),jpegTags=tags(jpeg.exif);
for(const tag of [0x14,0x1f]) {
  assert.equal(nativeTags.result.get(tag)?.type,9);
  assert.equal(nativeTags.result.get(tag)?.payload.length,4);
  assert.ok(!jpegTags.result.has(tag),'The JPEG control must lack the target tags');
}
const nativeNumber=tag=>new DataView(nativeTags.result.get(tag).payload.buffer).getInt32(0,nativeTags.little);
assert.equal(nativeNumber(0x14),12);assert.equal(nativeNumber(0x1f),1);
function setScalar(exif,tag,value) {
  const little=tags(exif).little,bytes=new Uint8Array(4);
  new DataView(bytes.buffer).setInt32(0,value,little);
  const out=injectAppleMakerNoteTag(exif,bytes,tag,9);
  // The production helper was designed for byte blobs and sets count to byte
  // length. A private int32 scalar must instead have TIFF element count ONE.
  const mn=getMakerNoteBlob(out),v=new DataView(mn.buffer,mn.byteOffset,mn.byteLength);
  let found=false;
  for(let i=0;i<v.getUint16(14,little);i++) {
    const p=16+i*12;if(v.getUint16(p,little)!==tag)continue;
    v.setUint32(p+4,1,little);found=true;break;
  }
  assert.ok(found);
  assert.deepEqual(extractAppleMakerNoteTag(out,tag),{type:9,payload:bytes});
  return out;
}
const specs=[
  ['A_5129_FeatureFlagZero',native,[[0x1f,0]]],
  ['B_JPEG_FeatureFlagOne',jpeg,[[0x1f,nativeNumber(0x1f)]]],
  ['C_JPEG_CaptureTypeScene',jpeg,[[0x14,nativeNumber(0x14)]]],
  ['D_JPEG_BothFlags',jpeg,[[0x1f,nativeNumber(0x1f)],[0x14,nativeNumber(0x14)]]],
];
const results=[];
for(const [name,c,changes] of specs) {
  let exif=c.exif;
  for(const [tag,value] of changes)exif=setScalar(exif,tag,value);
  const before=tags(c.exif).result,after=tags(exif).result,changed=new Set(changes.map(([tag])=>tag));
  for(const [tag,value] of before)if(!changed.has(tag))assert.deepEqual(after.get(tag),value,`MakerNote ${tag}`);
  for(const tag of after.keys())assert.ok(before.has(tag)||changed.has(tag));
  for(const [tag,value] of changes) {
    const t=after.get(tag);assert.equal(t.type,9);assert.equal(t.payload.length,4);
    assert.equal(new DataView(t.payload.buffer,t.payload.byteOffset,4).getInt32(0,tags(exif).little),value);
  }
  const d=c.d,item=d.iloc.items.get(d.exifItem);
  assert.equal(d.iloc.offsetSize,4);assert.equal(d.iloc.lengthSize,4);assert.equal(d.iloc.baseOffsetSize,0);
  assert.equal(item.constructionMethod,0);assert.equal(item.extents.length,1);
  const data=concat([c.data,box('mdat',exif)]);
  data.set(be(c.data.length+8,4),item.extents[0].offsetPos);
  data.set(be(exif.length,4),item.extents[0].lengthPos);
  const check=discoverHeic(data);
  assert.deepEqual(check.infos,d.infos);assert.deepEqual(check.refs,d.refs);assert.deepEqual(check.props,d.props);
  assert.deepEqual(extractItemData(data,check,check.exifItem),exif);
  // Nothing in the original file is rewritten except the EXIF item's locator.
  const restored=data.slice(0,c.data.length);
  restored.set(be(item.extents[0].offset,4),item.extents[0].offsetPos);
  restored.set(be(item.extents[0].length,4),item.extents[0].lengthPos);
  assert.deepEqual(restored,c.data);
  let preserved=0;
  for(const id of d.infos.keys())if(id!==d.exifItem) {
    assert.deepEqual(extractItemData(data,check,id),extractItemData(c.data,d,id));preserved++;
  }
  const depth=[...check.infos.keys()].find(id=>auxUriForItem(check.props,id)===DEPTH_URI);
  assert.ok(depth!==undefined);
  results.push({name,data,report:{file:name+'.HEIC',source:path.resolve(c.file),sourceSha256:hash(c.data),
    sha256:hash(data),bytes:data.length,changedMakerNoteTags:changes.map(([tag,value])=>({tag,value})),
    unchangedOtherMakerNoteTags:before.size-[...changed].filter(tag=>before.has(tag)).length,
    preservedNonExifItems:preserved,depthPayloadSha256:hash(extractItemData(data,check,depth)),
    photosEditing:'Pending; EXIF classification experiment only'}});
}
fs.mkdirSync(output,{recursive:true});
for(const r of results)fs.writeFileSync(path.join(output,r.name+'.HEIC'),r.data,{flag:'wx'});
fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify({results:results.map(r=>r.report)},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(results.map(r=>r.report),null,2));
