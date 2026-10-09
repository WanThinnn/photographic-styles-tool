// Capture-state diagnostic only. Frozen V12 C is the safe reference; V13 rejected.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {discoverHeic,extractItemData} from '../web/src/raster/heif.js';
import {extractAppleMakerNoteTag,injectAppleMakerNoteTag,getMakerNoteBlob} from '../web/src/exif.js';
import {parseBplist,buildBplist,BplistReal} from '../web/src/bplist.js';
import {box,concat,be} from '../web/src/box.js';

const [sourcePath,directory]=process.argv.slice(2);
assert.ok(directory && !fs.existsSync(directory),'Pass accepted V12 C and a fresh directory');
const source=new Uint8Array(fs.readFileSync(sourcePath)),d=discoverHeic(source);
const exif=extractItemData(source,d,d.exifItem),tag=extractAppleMakerNoteTag(exif);
assert.equal(tag.type,7);
const original=parseBplist(tag.payload,{preserveReals:true});
assert.ok(original.get('1') instanceof BplistReal && original.get('2') instanceof BplistReal);
assert.equal(original.get('4'),16);
function tags(exif) {
  const mn=getMakerNoteBlob(exif),little=String.fromCharCode(mn[12],mn[13])==='II';
  const view=new DataView(mn.buffer,mn.byteOffset,mn.byteLength),count=view.getUint16(14,little),result=new Map();
  assert.ok(16+count*12+4<=mn.length);
  for(let i=0;i<count;i++) {
    const id=view.getUint16(16+i*12,little),value=extractAppleMakerNoteTag(exif,id);
    result.set(id,{type:value.type,payload:value.payload.slice()});
  }
  return result;
}
const beforeTags=tags(exif),variants=[{file:'A_V12_Accepted_Control.HEIC',data:source,changes:[]}];
for(const [file,changes] of [
  ['B_CapturePad_Zero.HEIC',[['1',new BplistReal(0)],['2',new BplistReal(0)]]],
  ['C_CapturePad_Zero_Field4_One.HEIC',[['1',new BplistReal(0)],['2',new BplistReal(0)],['4',1]]]
]) {
  const marker=parseBplist(tag.payload,{preserveReals:true});
  for(const [key,value] of changes)marker.set(key,value);
  const newExif=injectAppleMakerNoteTag(exif,buildBplist(marker),0x54,tag.type);
  const afterTags=tags(newExif);
  assert.deepEqual([...afterTags.keys()],[...beforeTags.keys()]);
  for(const [id,value] of beforeTags)if(id!==0x54)assert.deepEqual(afterTags.get(id),value,`MakerNote ${id}`);
  const actual=parseBplist(afterTags.get(0x54).payload,{preserveReals:true});
  assert.deepEqual(actual,marker);
  for(const [key,value] of original)if(!changes.some(([k])=>k===key))assert.deepEqual(actual.get(key),value);
  const item=d.iloc.items.get(d.exifItem);
  assert.equal(item.constructionMethod,0);assert.equal(item.extents.length,1);
  assert.equal(d.iloc.offsetSize,4);assert.equal(d.iloc.lengthSize,4);assert.equal(d.iloc.baseOffsetSize,0);
  const data=concat([source,box('mdat',newExif)]),extent=item.extents[0];
  data.set(be(source.length+8,4),extent.offsetPos);data.set(be(newExif.length,4),extent.lengthPos);
  const after=discoverHeic(data);
  assert.deepEqual(after.infos,d.infos);assert.deepEqual(after.refs,d.refs);assert.deepEqual(after.props,d.props);
  for(const id of d.infos.keys())if(id!==d.exifItem)assert.deepEqual(extractItemData(data,after,id),extractItemData(source,d,id));
  // Byte-exact source prefix except the two declared EXIF extent fields.
  const restored=data.slice(0,source.length);
  restored.set(be(extent.offset,4),extent.offsetPos);restored.set(be(extent.length,4),extent.lengthPos);
  assert.deepEqual(restored,source);
  variants.push({file,data,changes:changes.map(([key,v])=>({key,value:v instanceof BplistReal?v.value:v}))});
}
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const report={source:path.resolve(sourcePath),sourceSha256:hash(source),originalItems:d.infos.size,exifItem:d.exifItem,
  diagnosticOnly:true,productionChanged:false,colourAlgorithmInvestigationPaused:true,
  originalCaptureState:Object.fromEntries([...original].map(([k,v])=>[k,v instanceof BplistReal?v.value:v])),
  texturePreset:'Standard',
  note:'Only captured Styles selection/pad is isolated. Field 4 meaning is not independently proven; value 1 matches the upstream 8-key default marker. Borrowed Styles/HDR/calibration remain. No smoothing/colour algorithm change.',
  variants:variants.map(v=>({file:v.file,bytes:v.data.length,sha256:hash(v.data),changes:v.changes,
    otherMakerNoteTagsExact:true,nonExifItemsExact:134,textureAndRoughnessExact:true}))};
fs.mkdirSync(directory,{recursive:true});
for(const v of variants)fs.writeFileSync(path.join(directory,v.file),v.data,{flag:'wx'});
fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify(report));
