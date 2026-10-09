// Controlled private metadata trials. Never a production calibration/profile.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {discoverHeic,extractItemData,auxUriForItem,DEPTH_URI,propertyBoxBytes,dimensionsForItem,itemOrientation} from '../web/src/raster/heif.js';
import {attachAiDepth} from '../web/src/ai-portrait-container.js';
import {appleDepthAuxc} from '../web/src/apple-depth-metadata.js';

const [nativeBatch,nativeAssets,jpegBatch,jpegAssets,output]=process.argv.slice(2);
assert.ok(output,'Pass native V3 batch/assets, JPEG V3 batch/assets and fresh output');
assert.ok(!fs.existsSync(output),'Do not overwrite an earlier batch');
const read=file=>new Uint8Array(fs.readFileSync(file));
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const enc=new TextEncoder(),dec=new TextDecoder();
const depthId=d=>[...d.infos.keys()].find(id=>auxUriForItem(d.props,id)===DEPTH_URI);
function sidecar(data) {
  const d=discoverHeic(data),id=depthId(d);
  const ref=d.refs.find(r=>r.type==='cdsc'&&r.to.includes(id));
  assert.ok(ref);return dec.decode(extractItemData(data,d,ref.from));
}
// Restricted to these generated/private XMP documents, not a general XML parser.
function field(xml,namespace,name) {
  const prefixes=[...xml.matchAll(/xmlns:([A-Za-z][\w.-]*)="([^"]+)"/g)].filter(m=>m[2]===namespace).map(m=>m[1]);
  assert.equal(prefixes.length,1,`One prefix for ${namespace}`);
  const tag=prefixes[0]+':'+name;
  const expression=new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${tag}>`,'g');
  const matches=[...xml.matchAll(expression)];
  assert.equal(matches.length,1,`One ${name} element`);
  return matches[0][0];
}
function remove(xml,namespace,names) {
  for(const name of names)xml=xml.replace(field(xml,namespace,name),'');
  return xml;
}
function value(xml,namespace,name,next) {
  const old=field(xml,namespace,name);
  return xml.replace(old,old.replace(/>[^<]*</,`>${next}<`));
}
const PIXEL='http://ns.apple.com/pixeldatainfo/1.0/',DEPTH='http://ns.apple.com/depthData/1.0/',BLUR='http://ns.apple.com/depthBlurEffect/1.0/';
const calibration=['IntrinsicMatrixReferenceWidth','IntrinsicMatrixReferenceHeight','IntrinsicMatrix',
  'ExtrinsicMatrix','PixelSize','LensDistortionCoefficients','InverseLensDistortionCoefficients',
  'LensDistortionCenterOffsetX','LensDistortionCenterOffsetY'];
const reference=read(path.join(nativeBatch,'D_AI_SamePhotoRendering.HEIC'));
const nativeXml=sidecar(reference),jpegXml=sidecar(read(path.join(jpegBatch,'C_AI_ApertureLighting.HEIC')));
const scalar=(xml,namespace,name)=>Number(field(xml,namespace,name).match(/>([^<]+)</)[1]);
const min=scalar(nativeXml,PIXEL,'FloatMinValue'),max=scalar(nativeXml,PIXEL,'FloatMaxValue');
const renderer=field(nativeXml,BLUR,'RenderingParameters');
// Only the render blob crosses photos in one PRIVATE probe. No camera calibration
// crosses photos. The blob may contain scene/focus settings and is not a default.
const jpegRenderer=jpegXml.replace('</rdf:Description>',renderer.replace(/(<\/?)[\w.-]+:RenderingParameters/g,'$1trialBlur:RenderingParameters')+'</rdf:Description>')
  .replace('<rdf:Description','<rdf:Description xmlns:trialBlur="'+BLUR+'"');
const trials=[
  {name:'A_5129_NoRenderParameters',cohort:'5129',xml:remove(nativeXml,BLUR,['RenderingParameters']),min,max,change:['remove RenderingParameters']},
  {name:'B_5129_NoCalibration',cohort:'5129',xml:remove(nativeXml,DEPTH,calibration),min,max,change:calibration.map(v=>'remove '+v)},
  {name:'C_5129_UnitRange',cohort:'5129',xml:value(value(nativeXml,PIXEL,'FloatMinValue',0),PIXEL,'FloatMaxValue',1),min:0,max:1,change:['FloatMin/MaxValue and auxC descriptor range 0..1']},
  {name:'D_5129_LowQuality',cohort:'5129',xml:value(nativeXml,DEPTH,'Quality','low'),min,max,change:['Quality high -> low (metadata only, same AI map)']},
  {name:'E_JPEG_RenderParametersOnly',cohort:'JPEG',xml:jpegRenderer,min:0,max:1,change:['add native RenderingParameters only; PRIVATE cross-scene diagnostic, not a production default']},
  {name:'F_JPEG_HighQualityOnly',cohort:'JPEG',xml:value(jpegXml,DEPTH,'Quality','high'),min:0,max:1,change:['Quality low -> high (eligibility diagnostic only, no AI improvement)']},
];

function cohort(batch,assets) {
  const base=read(path.join(batch,'A_NoDepth.HEIC')),d=discoverHeic(base);
  assert.equal(depthId(d),undefined);
  const geometry=JSON.parse(fs.readFileSync(path.join(assets,'inference.json')));
  assert.deepEqual(geometry.orientation,itemOrientation(base,d.props,d.primary));
  const [w,h]=dimensionsForItem(d.props,d.primary);
  assert.ok(Math.abs(geometry.width/geometry.height-w/h)<.01);
  return {base,d,depth:{payload:read(path.join(assets,'payload.bin')),hvcc:read(path.join(assets,'hvcc.bin')),width:geometry.width,height:geometry.height}};
}
const cohorts={'5129':cohort(nativeBatch,nativeAssets),JPEG:cohort(jpegBatch,jpegAssets)};
const {base:nativeBase,depth:nativeDepth}=cohorts['5129'];
assert.deepEqual(attachAiDepth(nativeBase,{...nativeDepth,floatMin:min,floatMax:max},{xmp:enc.encode(nativeXml)}),reference,'Reference D must reproduce exactly');
const results=[];
for(const t of trials) {
  const {base,d:baseline,depth}=cohorts[t.cohort];
  const data=attachAiDepth(base,{...depth,floatMin:t.min,floatMax:t.max},{xmp:enc.encode(t.xml),auxc:appleDepthAuxc({floatMin:t.min,floatMax:t.max})});
  const d=discoverHeic(data),id=depthId(d);
  assert.deepEqual(extractItemData(data,d,id),depth.payload);
  assert.deepEqual(propertyBoxBytes(data,d.props,id,'hvcC'),depth.hvcc);
  for(const [iid,info] of baseline.infos) {
    assert.deepEqual(d.infos.get(iid),info);
    assert.deepEqual(extractItemData(data,d,iid),extractItemData(base,baseline,iid),`Source item ${iid}`);
    for(const a of baseline.props.associations.get(iid)||[]) {
      const type=baseline.props.properties[a.index-1].type;
      assert.deepEqual(propertyBoxBytes(data,d.props,iid,type),propertyBoxBytes(base,baseline.props,iid,type));
    }
  }
  for(const ref of baseline.refs)assert.ok(d.refs.some(r=>JSON.stringify(r)===JSON.stringify(ref)));
  results.push({t,data,report:{file:t.name+'.HEIC',cohort:t.cohort,change:t.change,sha256:hash(data),bytes:data.length,
    preservedItems:baseline.infos.size,depthPayloadSha256:hash(depth.payload),codecSha256:hash(depth.hvcc),xmpSha256:hash(enc.encode(t.xml)),
    photosEditing:'Requires device test; labels and render blob are diagnostic only'}});
}
fs.mkdirSync(output,{recursive:true});
for(const r of results) {
  fs.writeFileSync(path.join(output,r.report.file),r.data,{flag:'wx'});
  fs.writeFileSync(path.join(output,r.t.name+'.xml'),r.t.xml,{flag:'wx'});
}
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({referenceDHash:hash(reference),trials:results.map(r=>r.report)},null,2),{flag:'wx'});
console.log(JSON.stringify({output,files:results.map(r=>r.report)},null,2));
