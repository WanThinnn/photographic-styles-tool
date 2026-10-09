// Diagnostic for a depthless SDR JPEG fitted into the accepted native graph.
// Remove ONLY HDR belonging to another capture. Never a production HDR stripper.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {boxes,topBox,box,concat,be} from '../web/src/box.js';
import {discoverHeic,extractItemData,auxUriForItem,URI_HDR_GAIN,removeItems,parseIloc} from '../web/src/raster/heif.js';
import {extractAppleMakerNoteTag,injectAppleMakerNoteTag,getMakerNoteBlob} from '../web/src/exif.js';

const [sourcePath,directory]=process.argv.slice(2);
assert.ok(directory && !fs.existsSync(directory),'Pass accepted V14 C and a fresh output directory');
const source=new Uint8Array(fs.readFileSync(sourcePath)),d=discoverHeic(source);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
// Restrict to the audited JPEG scene, not an actual native HDR photograph.
assert.equal(hash(source),'cec0f6326afc439d7da4da55f9d1caa9dc4100e63755cc80d0d02a3bab34dede');
const gains=[...d.infos.keys()].filter(id=>auxUriForItem(d.props,id)===URI_HDR_GAIN);
const tmaps=[...d.infos].filter(([,i])=>i.type==='tmap').map(([id])=>id);
assert.deepEqual(gains,[62]);assert.deepEqual(tmaps,[102]);
const removed=new Set([...gains,...tmaps]);
// Follow only the gain-map grid's descendants. A tmap also points to the main;
// following all tmap descendants would incorrectly delete the photograph.
const visit=id=>{for(const ref of d.refs.filter(r=>r.from===id&&r.type==='dimg'))
  for(const child of ref.to){if(!removed.has(child)){removed.add(child);visit(child);}}};
for(const gain of gains)visit(gain);
for(const ref of d.refs)if(ref.type==='cdsc'&&ref.to.length&&ref.to.every(id=>removed.has(id)))removed.add(ref.from);
assert.deepEqual([...removed].sort((a,b)=>a-b),[50,51,52,53,54,55,56,57,58,59,60,61,62,100,102]);
assert.ok(!removed.has(d.primary)&&!removed.has(d.exifItem)&&!removed.has(d.stylesItem));
for(const ref of d.refs)if(ref.type==='dimg'&&!removed.has(ref.from))assert.ok(ref.to.every(id=>!removed.has(id)));

function assemble(replacementExif=null) {
  const meta=removeItems(source.slice(d.meta.off,d.meta.off+d.meta.size),removed);
  const kept=[...boxes(source,0,source.length)].filter(b=>b.type!=='mdat')
    .map(b=>b.type==='meta'?meta:source.slice(b.off,b.off+b.size));
  const iloc=parseIloc(meta,topBox(meta,'meta'));
  let cursor=kept.reduce((n,b)=>n+b.length,0)+8;const chunks=[];
  for(const [id,item] of iloc.items){
    if(item.constructionMethod===1)continue;
    assert.equal(item.constructionMethod,0);assert.equal(item.baseOffset,0);
    if(replacementExif&&id===d.exifItem)assert.equal(item.extents.length,1);
    for(const [i,extent] of item.extents.entries()) {
      const old=d.iloc.items.get(id).extents[i];
      const payload=replacementExif&&id===d.exifItem?replacementExif:source.slice(old.offset,old.offset+old.length);
      meta.set(be(cursor,iloc.offsetSize),extent.offsetPos);meta.set(be(payload.length,iloc.lengthSize),extent.lengthPos);
      cursor+=payload.length;chunks.push(payload);
    }
  }
  assert.ok(cursor<2**32);return concat([...kept,box('mdat',concat(chunks))]);
}
const oldExif=extractItemData(source,d,d.exifItem);
let neutralExif=oldExif;
const changedTags=[];
for(const tag of [0x21,0x30]) {
  const value=extractAppleMakerNoteTag(neutralExif,tag);
  assert.ok([5,10].includes(value.type));assert.equal(value.payload.length,8);
  const mn=getMakerNoteBlob(neutralExif),little=String.fromCharCode(mn[12],mn[13])==='II';
  const read=new DataView(value.payload.buffer,value.payload.byteOffset,8);
  const old=[read.getInt32(0,little),read.getInt32(4,little)];
  const payload=new Uint8Array(8),v=new DataView(payload.buffer);v.setInt32(0,1,little);v.setInt32(4,1,little);
  neutralExif=injectAppleMakerNoteTag(neutralExif,payload,tag,value.type);
  // Blob helper counts bytes; rational TIFF entries must count ONE element.
  const outMn=getMakerNoteBlob(neutralExif),view=new DataView(outMn.buffer,outMn.byteOffset,outMn.byteLength);
  for(let i=0;i<view.getUint16(14,little);i++) {
    const off=16+12*i;if(view.getUint16(off,little)===tag)view.setUint32(off+4,1,little);
  }
  assert.deepEqual(extractAppleMakerNoteTag(neutralExif,tag),{type:value.type,payload});
  changedTags.push({tag,type:value.type,oldRational:old,newRational:[1,1]});
}
const variants=[{file:'A_V14_Standard_Control.HEIC',data:source,graphRemoved:false,exifChanged:false},
  {file:'B_Without_Borrowed_HDR_Graph.HEIC',data:assemble(),graphRemoved:true,exifChanged:false},
  {file:'C_Without_Borrowed_HDR_NeutralHeadroom.HEIC',data:assemble(neutralExif),graphRemoved:true,exifChanged:true}];
for(const variant of variants) {
  const after=discoverHeic(variant.data),expectedIds=[...d.infos.keys()].filter(id=>!variant.graphRemoved||!removed.has(id));
  assert.deepEqual([...after.infos.keys()],expectedIds);
  if(variant.graphRemoved){
    assert.ok(![...after.infos].some(([id,i])=>i.type==='tmap'||auxUriForItem(after.props,id)===URI_HDR_GAIN));
    const refs=d.refs.filter(r=>!removed.has(r.from)).map(r=>({...r,to:r.to.filter(id=>!removed.has(id))})).filter(r=>r.to.length);
    assert.deepEqual(after.refs,refs);
  }else assert.deepEqual(after.refs,d.refs);
  for(const id of expectedIds) {
    assert.deepEqual(after.infos.get(id),d.infos.get(id));
    assert.deepEqual(after.props.associations.get(id),d.props.associations.get(id));
    assert.deepEqual(extractItemData(variant.data,after,id),variant.exifChanged&&id===d.exifItem?neutralExif:extractItemData(source,d,id));
  }
  for(const p of d.props.properties){const q=after.props.properties[p.index-1];
    assert.deepEqual(variant.data.slice(q.box.off,q.box.off+q.box.size),source.slice(p.box.off,p.box.off+p.box.size));}
}
const report={source:path.resolve(sourcePath),sourceSha256:hash(source),diagnosticOnly:true,productionChanged:false,
  broadColourInvestigationPaused:true,sourceScene:'IMG_7454.JPEG (SDR, no depth, no native HDR)',
  removedItems:[...removed].sort((a,b)=>a-b),exifItem:d.exifItem,changedTags,
  note:'Removes borrowed HDR of 5129, not HDR of the actual JPEG. Styles/REND/calibration still borrowed. Fresh-import Edit/Portrait/Texture verification required.',
  variants:variants.map(v=>({file:v.file,bytes:v.data.length,sha256:hash(v.data),hdrGraphRemoved:v.graphRemoved,
    neutralHeadroom:v.exifChanged,remainingItems:v.graphRemoved?d.infos.size-removed.size:d.infos.size,
    mainStylesTextureDepthAndRENDExact:true}))};
fs.mkdirSync(directory,{recursive:true});
for(const v of variants)fs.writeFileSync(path.join(directory,v.file),v.data,{flag:'wx'});
fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify(report));
