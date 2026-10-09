// Private subsystem isolation; not a proposal to remove features from the app.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {boxes,topBox,box,concat,be} from '../web/src/box.js';
import {discoverHeic,extractItemData,removeItems,parseIloc} from '../web/src/raster/heif.js';
import {getMakerNoteBlob,extractAppleMakerNoteTag} from '../web/src/exif.js';
import {URI_TEXTURE_STYLES} from '../web/src/texture.js';

const [sourcePath,directory]=process.argv.slice(2);
assert.ok(directory&&!fs.existsSync(directory),'Pass V15 C and fresh directory');
const source=new Uint8Array(fs.readFileSync(sourcePath)),d=discoverHeic(source);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
assert.equal(hash(source),'0d1c4f7669b9347aae1e045e6553450a86d4cf58a1c77fc6891a7c752da629ca');
const textureId=[...d.infos].find(([,info])=>info.uri===URI_TEXTURE_STYLES)?.[0];
assert.ok(textureId!==undefined&&d.deltaGrid!==null&&d.stylesItem!==null);
// Only remove the active Styles/Texture metadata and the StyleDelta graph.
// Human/skin mattes, linear thumbnail, AI depth and lighting sidecar stay exact.
const removed=new Set([d.stylesItem,textureId,d.deltaGrid,...d.deltaTiles]);
for(const ref of d.refs)if(ref.type==='cdsc'&&ref.to.length&&ref.to.every(id=>removed.has(id)))removed.add(ref.from);
assert.ok(!removed.has(d.primary)&&!removed.has(d.exifItem)&&!removed.has(d.linearThumb));
const oldExif=extractItemData(source,d,d.exifItem),newExif=oldExif.slice();
const mn=getMakerNoteBlob(newExif),view=new DataView(mn.buffer,mn.byteOffset,mn.byteLength),little=String.fromCharCode(mn[12],mn[13])==='II';
const count=view.getUint16(14,little),kept=[],otherTags=[];
assert.ok(16+count*12+4<=mn.length);
for(let i=0;i<count;i++) {
  const off=16+12*i,tag=view.getUint16(off,little);
  if(tag===0x54)continue;
  kept.push(mn.slice(off,off+12));otherTags.push(tag);
}
assert.equal(kept.length,count-1);
const next=mn.slice(16+count*12,20+count*12);
view.setUint16(14,kept.length,little);
for(let i=0;i<kept.length;i++)mn.set(kept[i],16+12*i);
mn.set(next,16+12*kept.length);
mn.fill(0,20+12*kept.length,20+12*count);
// Do not shift the old MakerNote data area; other entries' offsets remain valid.
for(const tag of otherTags)assert.deepEqual(extractAppleMakerNoteTag(newExif,tag),extractAppleMakerNoteTag(oldExif,tag));
assert.throws(()=>extractAppleMakerNoteTag(newExif,0x54));
const meta=removeItems(source.slice(d.meta.off,d.meta.off+d.meta.size),removed);
const keptBoxes=[...boxes(source,0,source.length)].filter(b=>b.type!=='mdat').map(b=>b.type==='meta'?meta:source.slice(b.off,b.off+b.size));
const iloc=parseIloc(meta,topBox(meta,'meta'));let cursor=keptBoxes.reduce((n,b)=>n+b.length,0)+8;const chunks=[];
for(const [id,item] of iloc.items) {
  if(item.constructionMethod===1)continue;
  assert.equal(item.constructionMethod,0);assert.equal(item.baseOffset,0);
  if(id===d.exifItem)assert.equal(item.extents.length,1);
  for(const [i,extent] of item.extents.entries()) {
    const old=d.iloc.items.get(id).extents[i],payload=id===d.exifItem?newExif:source.slice(old.offset,old.offset+old.length);
    meta.set(be(cursor,iloc.offsetSize),extent.offsetPos);meta.set(be(payload.length,iloc.lengthSize),extent.lengthPos);
    cursor+=payload.length;chunks.push(payload);
  }
}
const data=concat([...keptBoxes,box('mdat',concat(chunks))]),after=discoverHeic(data);
assert.equal(after.stylesItem,null);assert.equal(after.deltaGrid,null);
assert.ok(![...after.infos.values()].some(i=>i.uri===URI_TEXTURE_STYLES));
assert.deepEqual([...after.infos.keys()],[...d.infos.keys()].filter(id=>!removed.has(id)));
const expectedRefs=d.refs.filter(r=>!removed.has(r.from)).map(r=>({...r,to:r.to.filter(id=>!removed.has(id))})).filter(r=>r.to.length);
assert.deepEqual(after.refs,expectedRefs);
for(const id of after.infos.keys()) {
  assert.deepEqual(after.infos.get(id),d.infos.get(id));
  assert.deepEqual(after.props.associations.get(id),d.props.associations.get(id));
  assert.deepEqual(extractItemData(data,after,id),id===d.exifItem?newExif:extractItemData(source,d,id));
}
for(const p of d.props.properties){const q=after.props.properties[p.index-1];assert.deepEqual(data.slice(q.box.off,q.box.off+q.box.size),source.slice(p.box.off,p.box.off+p.box.size));}
const variants=[{file:'A_With_Styles_Texture_Control.HEIC',data:source,styles:true},
  {file:'B_Portrait_Only_NoStylesTexture.HEIC',data,styles:false}];
const report={source:path.resolve(sourcePath),sourceSha256:hash(source),diagnosticOnly:true,productionChanged:false,
  broadStylesColourInvestigationPaused:true,exifItem:d.exifItem,removedItems:[...removed].sort((a,b)=>a-b),removedMakerNoteTag:0x54,
  note:'Remove active Styles/Texture subsystem to isolate Edit darkening. Keep all human mattes, linear thumbnail, depth, REND/calibration. Orphan Texture mattes remain intentionally to avoid confounding mask removal. Not a finished Portrait exporter.',
  variants:variants.map(v=>({file:v.file,bytes:v.data.length,sha256:hash(v.data),stylesTexturePresent:v.styles,
    items:v.styles?d.infos.size:after.infos.size,mainDepthRENDAndMasksExact:true}))};
fs.mkdirSync(directory,{recursive:true});
for(const v of variants)fs.writeFileSync(path.join(directory,v.file),v.data,{flag:'wx'});
fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify(report));
