// Private transfer-signalling isolation. No pixel/model/Styles edits.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {boxes,box,topBox,concat,be} from '../web/src/box.js';
import {discoverHeic,extractItemData,propertyBoxBytes,appendIpcoProperty,repointItemProperty,parseIloc} from '../web/src/raster/heif.js';
import {rasterColr} from '../web/src/raster/raster-color.js';
import {hevcSpsColor} from '../web/src/raster/hevc-color.js';

const [sourcePath,directory]=process.argv.slice(2);
assert.ok(directory&&!fs.existsSync(directory),'Pass V15 C and a fresh directory');
const source=new Uint8Array(fs.readFileSync(sourcePath)),d=discoverHeic(source);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
assert.equal(hash(source),'0d1c4f7669b9347aae1e045e6553450a86d4cf58a1c77fc6891a7c752da629ca');
const ids=[d.primary,...d.primaryTiles,d.thumbnail];
const oldColr=propertyBoxBytes(source,d.props,d.primary,'colr');
for(const id of ids) {
  assert.deepEqual(propertyBoxBytes(source,d.props,id,'colr'),oldColr);
  if(id===d.primary)continue;
  const codec=propertyBoxBytes(source,d.props,id,'hvcC'),sps=hevcSpsColor(codec.subarray(topBox(codec,'hvcC').hdr));
  assert.deepEqual([sps.primaries,sps.transfer,sps.matrix,sps.fullRange],[12,1,6,true]);
}
const b=topBox(oldColr,'colr');
assert.equal(new TextDecoder().decode(oldColr.subarray(b.hdr,b.hdr+4)),'prof');
const originalICC=oldColr.subarray(b.hdr+4),icc=originalICC.slice(),view=new DataView(icc.buffer),trcs=new Set();
assert.equal(view.getUint32(0),icc.length);
const oldParameters=[2.4,1/1.055,0.055/1.055,1/12.92,0.04045];
for(let i=0;i<view.getUint32(128);i++) {
  const p=132+i*12,name=new TextDecoder().decode(icc.subarray(p,p+4));
  if(!['rTRC','gTRC','bTRC'].includes(name))continue;
  const off=view.getUint32(p+4),size=view.getUint32(p+8);
  assert.equal(size,32);assert.equal(new TextDecoder().decode(icc.subarray(off,off+4)),'para');assert.equal(view.getUint16(off+8),3);
  for(let j=0;j<5;j++)assert.ok(Math.abs(view.getInt32(off+12+j*4)/65536-oldParameters[j])<1/65536);
  trcs.add(off);
}
assert.equal(trcs.size,1,'This ICC shares one curve across R/G/B');
const parameters=[1/0.45,1/1.099,0.099/1.099,1/4.5,0.081];
for(const off of trcs)for(let j=0;j<5;j++)view.setInt32(off+12+j*4,Math.round(parameters[j]*65536));
// ICC v4 profile ID hashes the profile with flags, rendering intent and ID zeroed.
assert.equal(icc[8],4);
const hashInput=icc.slice();hashInput.fill(0,44,48);hashInput.fill(0,64,68);hashInput.fill(0,84,100);
icc.set(crypto.createHash('md5').update(hashInput).digest(),84);
const allowed=new Set([...Array.from({length:16},(_,i)=>84+i),...[...trcs].flatMap(off=>Array.from({length:20},(_,i)=>off+12+i))]);
for(let i=0;i<icc.length;i++)if(!allowed.has(i))assert.equal(icc[i],originalICC[i]);
const correctedICC=box('colr',concat([new TextEncoder().encode('prof'),icc]));
const nclx=rasterColr({primaries:'smpte432',transfer:'bt709',matrix:'smpte170m',fullRange:true});
function assemble(color) {
  let meta=source.slice(d.meta.off,d.meta.off+d.meta.size),index;
  [meta,index]=appendIpcoProperty(meta,color);
  for(const id of ids) {
    const association=d.props.associations.get(id).find(a=>d.props.properties[a.index-1].type==='colr');
    assert.ok(association);meta=repointItemProperty(meta,id,association.index,index);
  }
  const kept=[...boxes(source,0,source.length)].filter(b=>b.type!=='mdat').map(b=>b.type==='meta'?meta:source.slice(b.off,b.off+b.size));
  const iloc=parseIloc(meta,topBox(meta,'meta'));let cursor=kept.reduce((n,b)=>n+b.length,0)+8;const chunks=[];
  for(const [id,item] of iloc.items) {
    if(item.constructionMethod===1)continue;
    assert.equal(item.constructionMethod,0);assert.equal(item.baseOffset,0);
    for(const [i,extent] of item.extents.entries()) {
      const old=d.iloc.items.get(id).extents[i],payload=source.slice(old.offset,old.offset+old.length);
      meta.set(be(cursor,iloc.offsetSize),extent.offsetPos);meta.set(be(payload.length,iloc.lengthSize),extent.lengthPos);
      cursor+=payload.length;chunks.push(payload);
    }
  }
  const data=concat([...kept,box('mdat',concat(chunks))]),after=discoverHeic(data);
  assert.deepEqual(after.infos,d.infos);assert.deepEqual(after.refs,d.refs);
  for(const id of d.infos.keys()) {
    assert.deepEqual(extractItemData(data,after,id),extractItemData(source,d,id));
    const before=d.props.associations.get(id)||[],actual=after.props.associations.get(id)||[];
    assert.equal(actual.length,before.length);
    for(let i=0;i<before.length;i++) {
      const type=d.props.properties[before[i].index-1].type;
      assert.equal(actual[i].essential,before[i].essential);
      if(ids.includes(id)&&type==='colr')assert.deepEqual(propertyBoxBytes(data,after.props,id,'colr'),color);
      else assert.deepEqual(actual[i],before[i]);
    }
  }
  for(const p of d.props.properties){const q=after.props.properties[p.index-1];assert.deepEqual(data.slice(q.box.off,q.box.off+q.box.size),source.slice(p.box.off,p.box.off+p.box.size));}
  return data;
}
const variants=[{file:'A_V15_Standard_Control.HEIC',data:source,description:'Inherited P3 ICC with sRGB TRC; encoded samples use BT.709'},
  {file:'B_Matched_NCLX_BT709.HEIC',data:assemble(nclx),description:'P3/BT.709/SMPTE170M/full-range nclx matches encoded VUI'},
  {file:'C_Matched_ICC_BT709.HEIC',data:assemble(correctedICC),description:'P3 ICC with inverse BT.709 curve; same matrix, white point, other tags and header except profile ID'}];
const decode=(x,p)=>x>=p[4]?(p[1]*x+p[2])**p[0]:p[3]*x;
const neutral=128/255,linear=neutral<=0.04045?neutral/12.92:((neutral+0.055)/1.055)**2.4;
const encoded=linear<0.018?4.5*linear:1.099*linear**0.45-0.099;
const report={source:path.resolve(sourcePath),sourceSha256:hash(source),diagnosticOnly:true,productionChanged:false,
  broadStylesColourInvestigationPaused:true,changedColourAssociations:ids,items:d.infos.size,
  originalICCParameters:oldParameters,correctedICCParameters:parameters,
  numericalIllustration:{originalSRGB:neutral,linear,encodedBT709:encoded,decodedWithSRGB:decode(encoded,oldParameters),decodedWithBT709:decode(encoded,parameters)},
  note:'Colour-signalling mismatch is confirmed in this generated diagnostic, not a proven Photos root cause. Native Apple has same ICC/VUI declarations but its actual RGB convention is not inferred from VUI alone. No source pixels, Styles, mattes, depth, EXIF or REND changed. Remaining borrowed scene resources are still unvalidated.',
  variants:variants.map(v=>({file:v.file,bytes:v.data.length,sha256:hash(v.data),description:v.description,allItemPayloadsExact:true}))};
fs.mkdirSync(directory,{recursive:true});
for(const v of variants)fs.writeFileSync(path.join(directory,v.file),v.data,{flag:'wx'});
fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify(report));
