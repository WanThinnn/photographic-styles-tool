// Private pinhole-projection experiment. This is not measured calibration or a
// production Photos Portrait exporter. The native render blob is diagnostic.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {discoverHeic,extractItemData,auxUriForItem,DEPTH_URI,propertyBoxBytes,dimensionsForItem,itemOrientation} from '../web/src/raster/heif.js';
import {attachAiDepth} from '../web/src/ai-portrait-container.js';
import {appleDepthAuxc} from '../web/src/apple-depth-metadata.js';

const [workingC,nativeBatch,nativeAssets,jpegBatch,jpegAssets,output]=process.argv.slice(2);
assert.ok(output,'Pass working V4 C, native V3 batch/assets, JPEG V3 batch/assets, new output');
assert.ok(!fs.existsSync(output),'Never overwrite a tested batch');
const read=file=>new Uint8Array(fs.readFileSync(file));
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const enc=new TextEncoder(),dec=new TextDecoder();
const depthId=d=>[...d.infos.keys()].find(id=>auxUriForItem(d.props,id)===DEPTH_URI);
const fields=['IntrinsicMatrixReferenceWidth','IntrinsicMatrixReferenceHeight','IntrinsicMatrix','ExtrinsicMatrix',
  'PixelSize','LensDistortionCoefficients','InverseLensDistortionCoefficients','LensDistortionCenterOffsetX','LensDistortionCenterOffsetY'];

function focalExif(payload) {
  assert.ok(payload.length>=12);
  const outer=new DataView(payload.buffer,payload.byteOffset,payload.byteLength);
  const start=outer.getUint32(0)+4,tiff=payload.subarray(start);
  const order=String.fromCharCode(...tiff.subarray(0,2));assert.ok(['II','MM'].includes(order));
  const v=new DataView(tiff.buffer,tiff.byteOffset,tiff.byteLength),le=order==='II';
  const u16=p=>v.getUint16(p,le),u32=p=>v.getUint32(p,le);
  assert.equal(u16(2),42);
  function ifd(p) {
    assert.ok(p>=8&&p+2<=tiff.length);const n=u16(p),m=new Map();
    assert.ok(p+2+n*12+4<=tiff.length);
    for(let i=0;i<n;i++){const e=p+2+i*12;m.set(u16(e),e);}return m;
  }
  const root=ifd(u32(4)),ptr=root.get(0x8769);assert.ok(ptr!==undefined&&u16(ptr+2)===4&&u32(ptr+4)===1);
  const exif=ifd(u32(ptr+8));
  function scalar(tag) {
    const e=exif.get(tag);if(e===undefined)return null;
    assert.equal(u32(e+4),1);const type=u16(e+2);
    if(type===3)return u16(e+8);if(type===4)return u32(e+8);
    assert.equal(type,5);const off=u32(e+8),den=u32(off+4);assert.ok(den>0);return u32(off)/den;
  }
  const result={focalMm:scalar(0x920a),focal35Mm:scalar(0xa405),digitalZoom:scalar(0xa404)};
  assert.ok(result.focalMm>0&&result.focal35Mm>0,'Estimate requires this photo\'s focal EXIF; no donor/fallback focal length');
  return result;
}
const reference=read(workingC),rd=discoverHeic(reference),rid=depthId(rd);
const side=rd.refs.find(r=>r.type==='cdsc'&&r.to.includes(rid)).from;
const xml=dec.decode(extractItemData(reference,rd,side));
assert.ok(xml.includes('<apdi:FloatMinValue>0</apdi:FloatMinValue>')&&xml.includes('<apdi:FloatMaxValue>1</apdi:FloatMaxValue>'));
assert.ok(xml.includes('<depthData:Quality>high</depthData:Quality>'));
let withoutCalibration=xml;
for(const name of fields) {
  const re=new RegExp(`<depthData:${name}>[\\s\\S]*?<\\/depthData:${name}>`,'g');
  assert.equal([...withoutCalibration.matchAll(re)].length,1,name);
  withoutCalibration=withoutCalibration.replace(re,'');
}
function cohort(batch,assets) {
  const base=read(path.join(batch,'A_NoDepth.HEIC')),d=discoverHeic(base);assert.equal(depthId(d),undefined);
  const geometry=JSON.parse(fs.readFileSync(path.join(assets,'inference.json')));
  assert.deepEqual(geometry.orientation,itemOrientation(base,d.props,d.primary));
  const [w,h]=dimensionsForItem(d.props,d.primary);
  assert.ok(Math.abs(geometry.width/geometry.height-w/h)<.01);
  return {base,d,w,h,focal:focalExif(extractItemData(base,d,d.exifItem)),
    depth:{payload:read(path.join(assets,'payload.bin')),hvcc:read(path.join(assets,'hvcc.bin')),width:geometry.width,height:geometry.height}};
}
const cohorts={native:cohort(nativeBatch,nativeAssets),jpeg:cohort(jpegBatch,jpegAssets)};
const scalar=(name,n)=>`<depthData:${name}>${n}</depthData:${name}>`;
const sequence=(name,values)=>`<depthData:${name}><rdf:Seq>${values.map(n=>`<rdf:li>${n}</rdf:li>`).join('')}</rdf:Seq></depthData:${name}>`;
const specs=[['A_5129_EstimatedCalibration','native',1],['B_JPEG_EstimatedCalibration','jpeg',1],
  ['C_JPEG_EstimatedCalibration_WithZoom','jpeg',cohorts.jpeg.focal.digitalZoom]];
assert.ok(specs[2][2]>1,'Zoom variant must have a source EXIF ratio greater than one');
const results=[];
for(const [name,key,zoom] of specs) {
  const c=cohorts[key];
  // CIPA diagonal 35mm equivalence, square pixels; EXIF crop/distortion is not
  // enough to reconstruct a measured camera matrix. Zoom interpretation is a probe.
  const fpx=c.focal.focal35Mm*zoom*Math.hypot(c.w,c.h)/Math.hypot(36,24);
  const pixelSize=c.focal.focalMm/fpx,cx=c.w/2,cy=c.h/2;
  const calibration=scalar('IntrinsicMatrixReferenceWidth',c.w)+scalar('IntrinsicMatrixReferenceHeight',c.h)
    +sequence('IntrinsicMatrix',[fpx,0,0,0,fpx,0,cx,cy,1])
    +sequence('ExtrinsicMatrix',[1,0,0,0,1,0,0,0,1,0,0,0])+scalar('PixelSize',pixelSize)
    +sequence('LensDistortionCoefficients',Array(8).fill(0))+sequence('InverseLensDistortionCoefficients',Array(8).fill(0))
    +scalar('LensDistortionCenterOffsetX',cx)+scalar('LensDistortionCenterOffsetY',cy);
  const resultXml=withoutCalibration.replace('</rdf:Description>',calibration+'</rdf:Description>');
  const data=attachAiDepth(c.base,c.depth,{xmp:enc.encode(resultXml),auxc:appleDepthAuxc()});
  const d=discoverHeic(data),id=depthId(d);
  assert.deepEqual(extractItemData(data,d,id),c.depth.payload);
  assert.deepEqual(propertyBoxBytes(data,d.props,id,'hvcC'),c.depth.hvcc);
  for(const [iid,info] of c.d.infos) {
    assert.deepEqual(d.infos.get(iid),info);
    assert.deepEqual(extractItemData(data,d,iid),extractItemData(c.base,c.d,iid),`Original item ${iid}`);
    for(const a of c.d.props.associations.get(iid)||[]) {
      const type=c.d.props.properties[a.index-1].type;
      assert.deepEqual(propertyBoxBytes(data,d.props,iid,type),propertyBoxBytes(c.base,c.d.props,iid,type));
    }
  }
  for(const ref of c.d.refs)assert.ok(d.refs.some(r=>JSON.stringify(r)===JSON.stringify(ref)));
  results.push({name,data,xml:resultXml,report:{file:name+'.HEIC',sourceFocalExif:c.focal,geometry:{width:c.w,height:c.h},
    projection:{focalPixels:fpx,pixelSizeMm:pixelSize,zoomMultiplier:zoom,principalPoint:[cx,cy],distortion:'assumed zero'},
    estimated:true,qualityLabel:'high (eligibility diagnostic, not measured AI accuracy)',
    renderParameters:'same native REND blob; JPEG use is a private cross-scene diagnostic only',
    bytes:data.length,sha256:hash(data),sourceSha256:hash(c.base),depthPayloadSha256:hash(c.depth.payload),codecSha256:hash(c.depth.hvcc),
    preservedItems:c.d.infos.size,photosEditing:'Requires device verification'}});
}
fs.mkdirSync(output,{recursive:true});
for(const r of results){fs.writeFileSync(path.join(output,r.name+'.HEIC'),r.data,{flag:'wx'});fs.writeFileSync(path.join(output,r.name+'.xml'),r.xml,{flag:'wx'});}
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({workingReferenceSha256:hash(reference),variants:results.map(r=>r.report)},null,2),{flag:'wx'});
console.log(JSON.stringify({output,variants:results.map(r=>r.report)},null,2));
