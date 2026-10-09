// Frozen private trials, not a production Portrait reconstruction promise.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {boxes,topBox,box,concat,be} from '../web/src/box.js';
import {discoverHeic,extractItemData,removeItems,parseIloc,auxUriForItem,
  propertyBoxBytes,DEPTH_URI,dimensionsForItem,itemOrientation} from '../web/src/raster/heif.js';
import {addTexture,hasTexture} from '../web/src/texture.js';
import {attachAiDepth} from '../web/src/ai-portrait-container.js';
import {appleDepthAuxc,appleDepthXmp} from '../web/src/apple-depth-metadata.js';

const [input,assets,output]=process.argv.slice(2);
assert.ok(input&&assets&&output,'Pass HEIC, AI assets directory and fresh output directory');
assert.ok(!fs.existsSync(output),'Use a new output directory');
const read=file=>new Uint8Array(fs.readFileSync(file));
const original=read(input),originalDiscovery=discoverHeic(original);
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const geometry=JSON.parse(fs.readFileSync(path.join(assets,'inference.json')));
assert.deepEqual(geometry.orientation,itemOrientation(original,originalDiscovery.props,originalDiscovery.primary));
const [w,h]=dimensionsForItem(originalDiscovery.props,originalDiscovery.primary);
assert.ok(Math.abs(geometry.width/geometry.height-w/h)<.01,'Depth must match source geometry');
assert.equal(geometry.sps.chroma,0);assert.equal(geometry.sps.luma,8);assert.equal(geometry.sps.fullRange,true);
const depth={payload:read(path.join(assets,'payload.bin')),hvcc:read(path.join(assets,'hvcc.bin')),
  width:geometry.width,height:geometry.height};
const originalDepth=[...originalDiscovery.infos.keys()].find(id=>auxUriForItem(originalDiscovery.props,id)===DEPTH_URI);
const removed=new Set();let nativeXmp=null;
if(originalDepth!==undefined) {
  removed.add(originalDepth);
  for(const ref of originalDiscovery.refs)if(ref.type==='cdsc'&&ref.to.includes(originalDepth)) {
    removed.add(ref.from);
    if(originalDiscovery.infos.get(ref.from)?.type==='mime')nativeXmp=extractItemData(original,originalDiscovery,ref.from);
  }
}

function withoutNativeDepth() {
  if(!removed.size)return original;
  const meta=removeItems(original.slice(originalDiscovery.meta.off,originalDiscovery.meta.off+originalDiscovery.meta.size),removed);
  const iloc=parseIloc(meta,topBox(meta,'meta'));
  const kept=[...boxes(original,0,original.length)].filter(b=>b.type!=='mdat').map(b=>b.type==='meta'?meta:original.slice(b.off,b.off+b.size));
  let cursor=kept.reduce((n,b)=>n+b.length,0)+8;const chunks=[];
  for(const [id,item] of iloc.items) {
    if(item.constructionMethod!==0)continue;
    assert.equal(item.baseOffset,0);assert.equal(item.extents.length,1);
    const payload=extractItemData(original,originalDiscovery,id);
    meta.set(be(cursor,iloc.offsetSize),item.extents[0].offsetPos);
    chunks.push(payload);cursor+=payload.length;
  }
  const result=concat([...kept,box('mdat',concat(chunks))]);
  const d=discoverHeic(result);
  assert.ok(![...d.infos.keys()].some(id=>auxUriForItem(d.props,id)===DEPTH_URI));
  for(const [id] of d.infos)assert.deepEqual(extractItemData(result,d,id),extractItemData(original,originalDiscovery,id));
  return result;
}

let base=withoutNativeDepth();
if(!hasTexture(discoverHeic(base).infos))base=addTexture(base).data;
const baseline=discoverHeic(base);
assert.ok(baseline.stylesItem!==null&&hasTexture(baseline.infos));
assert.ok(![...baseline.infos.keys()].some(id=>auxUriForItem(baseline.props,id)===DEPTH_URI));
const minimal=appleDepthXmp();
const portraitFields=`<blur:SimulatedAperture xmlns:blur="http://ns.apple.com/depthBlurEffect/1.0/">4.5</blur:SimulatedAperture>
<lighting:EffectStrength xmlns:lighting="http://ns.apple.com/portraitLightingEffect/2.0/">0.5</lighting:EffectStrength>`;
const withPortrait=new TextEncoder().encode(new TextDecoder().decode(minimal).replace('</rdf:Description>',portraitFields+'</rdf:Description>'));
const variants=[['A_NoDepth',base,'No depth; Styles and Texture ready'],
  ['B_AI_AppleDepth',attachAiDepth(base,depth),'AI depth; Apple pixel metadata and depth descriptor; no capture calibration'],
  ['C_AI_ApertureLighting',attachAiDepth(base,depth,{xmp:withPortrait}),'Same AI depth; adds initial aperture/lighting values only']];
if(nativeXmp) {
  // This is deliberately restricted to the same source photo. Not donor
  // calibration, and never a general JPEG/native Portrait reconstruction.
  let xml=new TextDecoder().decode(nativeXmp);
  const min=Number(xml.match(/<[^>]*:FloatMinValue>([^<]+)</)?.[1]);
  const max=Number(xml.match(/<[^>]*:FloatMaxValue>([^<]+)</)?.[1]);
  assert.ok(Number.isFinite(min)&&Number.isFinite(max));
  // Depth is still AI-generated and relative; the scale is a diagnostic choice.
  const testDepth={...depth,floatMin:min,floatMax:max};
  variants.push(['D_AI_SamePhotoRendering',attachAiDepth(base,testDepth,{xmp:nativeXmp,auxc:appleDepthAuxc(testDepth)}),
    'Same AI depth; retains this exact photo\'s calibration/blur metadata as an isolation test. Not transferable to other photos.']);
}

const report=[];
for(const [name,data,description] of variants) {
  const d=discoverHeic(data);
  let checked=0;
  for(const [id] of baseline.infos) {
    assert.deepEqual(extractItemData(data,d,id),extractItemData(base,baseline,id),`Baseline payload ${id} changed`);checked++;
    assert.deepEqual(d.infos.get(id),baseline.infos.get(id));
    for(const assoc of baseline.props.associations.get(id)||[]) {
      const prop=baseline.props.properties[assoc.index-1];
      assert.deepEqual(propertyBoxBytes(data,d.props,id,prop.type),propertyBoxBytes(base,baseline.props,id,prop.type));
    }
  }
  for(const ref of baseline.refs)assert.ok(d.refs.some(r=>r.type===ref.type&&r.from===ref.from&&JSON.stringify(r.to)===JSON.stringify(ref.to)));
  const id=[...d.infos.keys()].find(id=>auxUriForItem(d.props,id)===DEPTH_URI);
  if(id!==undefined)assert.deepEqual(extractItemData(data,d,id),depth.payload);
  report.push({file:name+'.HEIC',description,bytes:data.length,sha256:hash(data),preservedBasePayloads:checked,
    depth:id!==undefined,hdr:d.hdrGrid!==null,styles:d.stylesItem!==null,
    photosPortraitApertureLighting:'Requires physical iPhone verification'});
}
fs.mkdirSync(output,{recursive:true});
for(let i=0;i<variants.length;i++)fs.writeFileSync(path.join(output,report[i].file),variants[i][1],{flag:'wx'});
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({source:input,sourceSha256:hash(original),
  removedNativeDepthItems:[...removed],model:'Depth-Anything-V2-Small',depthGeometry:geometry,
  aiGraySha256:hash(read(path.join(assets,'gray.bin'))),aiPayloadSha256:hash(depth.payload),variants:report},null,2),{flag:'wx'});
console.log(JSON.stringify({output,removedNativeDepthItems:[...removed],variants:report},null,2));
