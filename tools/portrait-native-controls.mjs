// Private controls: separate scalar-value changes from EXIF serialization.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {box,concat,be} from '../web/src/box.js';
import {discoverHeic,extractItemData,auxUriForItem,DEPTH_URI} from '../web/src/raster/heif.js';
import {getMakerNoteBlob,extractAppleMakerNoteTag,injectAppleMakerNoteTag} from '../web/src/exif.js';

const [acceptedPath,failedPath,output]=process.argv.slice(2);
assert.ok(output,'Pass accepted V5 A, failed V7 A and a fresh output directory');
assert.ok(!fs.existsSync(output),'Never overwrite a previous batch');
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
function source(file) {
  const data=new Uint8Array(fs.readFileSync(file)),d=discoverHeic(data);
  const item=d.iloc.items.get(d.exifItem);
  assert.equal(item.constructionMethod,0);assert.equal(item.extents.length,1);
  assert.equal(d.iloc.offsetSize,4);assert.equal(d.iloc.lengthSize,4);assert.equal(d.iloc.baseOffsetSize,0);
  return {file,data,d,exif:extractItemData(data,d,d.exifItem),extent:item.extents[0]};
}
const accepted=source(acceptedPath),failed=source(failedPath);
function flagLocation(exif) {
  const mn=getMakerNoteBlob(exif),little=String.fromCharCode(mn[12],mn[13])==='II';
  const v=new DataView(mn.buffer,mn.byteOffset,mn.byteLength);
  for(let i=0;i<v.getUint16(14,little);i++) {
    const p=16+i*12;
    if(v.getUint16(p,little)!==0x1f)continue;
    assert.equal(v.getUint16(p+2,little),9);assert.equal(v.getUint32(p+4,little),1);
    return {relative:mn.byteOffset-exif.byteOffset+p+8,little,value:v.getInt32(p+8,little)};
  }
  throw Error('Missing Photos feature flag');
}
assert.equal(flagLocation(accepted.exif).value,1);assert.equal(flagLocation(failed.exif).value,0);

function rewriteUnchanged(c) {
  const payload=extractAppleMakerNoteTag(c.exif,0x1f).payload;
  const exif=injectAppleMakerNoteTag(c.exif,payload,0x1f,9);
  // Byte-blob helper count correction, identical to the V7 serialization path.
  const mn=getMakerNoteBlob(exif),little=flagLocation(c.exif).little;
  const v=new DataView(mn.buffer,mn.byteOffset,mn.byteLength);
  for(let i=0;i<v.getUint16(14,little);i++) {
    const p=16+i*12;if(v.getUint16(p,little)===0x1f){v.setUint32(p+4,1,little);break;}
  }
  assert.equal(flagLocation(exif).value,1);
  const data=concat([c.data,box('mdat',exif)]);
  data.set(be(c.data.length+8,4),c.extent.offsetPos);
  data.set(be(exif.length,4),c.extent.lengthPos);
  return data;
}
function inlineFlag(c,value) {
  const {relative,little}=flagLocation(c.exif),pos=c.extent.offset+relative;
  const data=c.data.slice();new DataView(data.buffer).setInt32(pos,value,little);
  const restored=data.slice();restored.set(c.data.subarray(pos,pos+4),pos);
  assert.deepEqual(restored,c.data,'Only the four inline flag bytes may change');
  return data;
}
const specs=[
  ['A_5129_RewriteUnchanged',accepted,rewriteUnchanged(accepted),'same flag 1; same V7 EXIF rewrite'],
  ['B_5129_InlineFlagZero',accepted,inlineFlag(accepted,0),'only inline flag 1 -> 0; no EXIF rewrite'],
  ['C_5129_RestoreFlagOne',failed,inlineFlag(failed,1),'V7 A: inline flag 0 -> 1; retain its rewritten EXIF'],
];
const results=[];
for(const [name,c,data,change] of specs) {
  const d=discoverHeic(data);
  assert.deepEqual(d.infos,c.d.infos);assert.deepEqual(d.refs,c.d.refs);assert.deepEqual(d.props,c.d.props);
  let preserved=0;
  for(const id of c.d.infos.keys())if(id!==c.d.exifItem) {
    assert.deepEqual(extractItemData(data,d,id),extractItemData(c.data,c.d,id));preserved++;
  }
  const exif=extractItemData(data,d,d.exifItem),flag=flagLocation(exif).value;
  const depth=[...d.infos.keys()].find(id=>auxUriForItem(d.props,id)===DEPTH_URI);
  results.push({name,data,report:{file:name+'.HEIC',source:path.resolve(c.file),sourceSha256:hash(c.data),
    sha256:hash(data),bytes:data.length,change,flag,preservedNonExifItems:preserved,
    depthPayloadSha256:hash(extractItemData(data,d,depth)),photosEditing:'Pending control test'}});
}
// C and A must resolve to identical EXIF values and identical serialization.
const a=discoverHeic(results[0].data),c=discoverHeic(results[2].data);
assert.deepEqual(extractItemData(results[0].data,a,a.exifItem),extractItemData(results[2].data,c,c.exifItem));
fs.mkdirSync(output,{recursive:true});
for(const r of results)fs.writeFileSync(path.join(output,r.name+'.HEIC'),r.data,{flag:'wx'});
fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify({results:results.map(r=>r.report)},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(results.map(r=>r.report),null,2));
