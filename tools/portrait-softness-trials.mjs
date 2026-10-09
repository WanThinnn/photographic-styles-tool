// Private single-variable probe, following accepted V12 C. Never changes production.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {discoverHeic,propertyBoxBytes} from '../web/src/heif.js';
import {discoverHeic as inspect,extractItemData} from '../web/src/raster/heif.js';
import {parseBplist,buildBplist,BplistReal} from '../web/src/bplist.js';
import {rebuildHeic} from '../web/src/graft.js';
import {topBox} from '../web/src/box.js';
import {URI_TEXTURE_STYLES} from '../web/src/texture.js';

const [sourcePath,directory]=process.argv.slice(2);
assert.ok(directory,'Pass accepted V12 C and a fresh output directory');
assert.ok(!fs.existsSync(directory),'Do not overwrite an existing trial');
const source=new Uint8Array(fs.readFileSync(sourcePath)),d=discoverHeic(source),before=inspect(source);
const textureId=[...before.infos].find(([,info])=>info.uri===URI_TEXTURE_STYLES)?.[0];
assert.ok(textureId!==undefined,'Texture required');
const original=parseBplist(extractItemData(source,before,textureId),{preserveReals:true});
const people=original.get('TextureStylePostProcessedPeopleData');
assert.equal(people.length,1,'This frozen cohort has one face');
const smoothing=entry=>entry.get('imageStats').get('SkinSmoothingStandalone');
const old=smoothing(people[0]).get('SkinSmoothFaceRoughness');
assert.ok(old instanceof BplistReal && old.value>0 && Number.isFinite(old.value));
const variants=[{file:'A_V12_Accepted_Control.HEIC',data:source,roughness:old.value}];
for(const [file,value] of [['B_Roughness_OneTenth.HEIC',old.value/10],['C_Roughness_Zero.HEIC',0]]) {
  // Parse anew to retain real-vs-integer types of every other plist field.
  const plist=parseBplist(extractItemData(source,before,textureId),{preserveReals:true});
  smoothing(plist.get('TextureStylePostProcessedPeopleData')[0]).set('SkinSmoothFaceRoughness',new BplistReal(value));
  const data=rebuildHeic(source,d,source.subarray(0,topBox(source,'ftyp').size),
    source.subarray(d.meta.off,d.meta.off+d.meta.size),new Map([[textureId,buildBplist(plist)]]));
  const after=inspect(data);
  assert.deepEqual(after.infos,before.infos);assert.deepEqual(after.refs,before.refs);
  assert.deepEqual(after.props,before.props);
  const result=parseBplist(extractItemData(data,after,textureId),{preserveReals:true});
  assert.deepEqual(smoothing(result.get('TextureStylePostProcessedPeopleData')[0]).get('SkinSmoothFaceRoughness'),new BplistReal(value));
  smoothing(result.get('TextureStylePostProcessedPeopleData')[0]).set('SkinSmoothFaceRoughness',old);
  assert.deepEqual(result,original,'No other Texture field may change');
  for(const [id] of before.infos) {
    if(id!==textureId)assert.deepEqual(extractItemData(data,after,id),extractItemData(source,before,id),`Payload ${id}`);
    for(const assoc of before.props.associations.get(id)||[]) {
      const type=before.props.properties[assoc.index-1].type;
      assert.deepEqual(propertyBoxBytes(data,after.props,id,type),propertyBoxBytes(source,before.props,id,type));
    }
  }
  variants.push({file,data,roughness:value});
}
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const report={source:path.resolve(sourcePath),sourceSha256:sha(source),
  diagnosticOnly:true,productionChanged:false,colourInvestigationPaused:true,
  variable:'TextureStylePostProcessedPeopleData[0].imageStats.SkinSmoothingStandalone.SkinSmoothFaceRoughness',
  textureId,originalItems:before.infos.size,
  note:'Lower roughness improved an earlier IMG_0783 comparison, but direction/strength is not calibrated. Zero is a diagnostic boundary, not a proposed default.',
  variants:variants.map(v=>({file:v.file,bytes:v.data.length,sha256:sha(v.data),roughness:v.roughness,
    otherTextureFieldsExact:true,otherPayloadsExact:true,masksStylesDepthAndLightingUnchanged:true}))};
fs.mkdirSync(directory,{recursive:true});
for(const v of variants)fs.writeFileSync(path.join(directory,v.file),v.data,{flag:'wx'});
fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify(report));
