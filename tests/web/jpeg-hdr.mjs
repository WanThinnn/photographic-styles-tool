import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildAiPortrait} from '../../web/src/portrait/ai-portrait-export.js';
import {extractItemData} from '../../web/src/raster/heif.js';
import {extractJpegHdr,parseAdaptiveHdrXmp,encodeTmapMetadata,yuv420Tile,iccColr,yuv420ToRgba,decodeGainLog,encodeGainLog,rebaseGainMapRgba,srgbToLinear,parseTmapMetadata} from '../../web/src/raster/jpeg-hdr.js';
import {buildRasterHeic,targetGeometry} from '../../web/src/raster/raster-import.js';
import {buildGeneratedProfile} from '../../web/src/raster/generated-profile.js';
import {generateSyntheticHevc} from '../../web/src/raster/synthetic-hevc.js';
import {box,concat,be,topBox,metaChildren,findChild,boxes} from '../../web/src/raster/box.js';
import {discoverHeic,extractItem,propertyBoxBytes,dimensionsForItem} from '../../web/src/raster/heif.js';
import {readExifOrientation} from '../../web/src/raster/exif.js';
import {describeHeic} from '../../web/src/ui/result-metadata.js';
const text=s=>new TextEncoder().encode(s);
const segment=(marker,data)=>concat([Uint8Array.of(255,marker),be(data.length+2,2),data]);
function icc(name){
 const words=concat([...name].map(c=>be(c.charCodeAt(0),2))),profile=new Uint8Array(148+28+words.length),v=new DataView(profile.buffer);
 v.setUint32(0,profile.length);profile.set(text('acsp'),36);v.setUint32(128,1);
 profile.set(text('desc'),132);v.setUint32(136,148);v.setUint32(140,28+words.length);
 profile.set(text('mluc'),148);v.setUint32(156,1);v.setUint32(160,12);profile.set(text('enUS'),164);
 v.setUint32(168,words.length);v.setUint32(172,28);profile.set(words,176);return profile;
}
const baseIcc=icc('Display P3'),alternateIcc=icc('Display P3; SMPTE ST 2084 PQ');
const iccSegment=p=>segment(226,concat([text('ICC_PROFILE\0'),Uint8Array.of(1,1),p]));
const sof=(w,h)=>segment(192,concat([Uint8Array.of(8),be(h,2),be(w,2),Uint8Array.of(3,1,34,0,2,17,1,3,17,1)]));
function xmp(prefix='HDRToneMap'){
 return `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:${prefix}="http://ns.adobe.com/hdr-gain-map/1.0/">`
  +['Version:1','BaseRenditionIsHDR:0','BaseHeadroom:0','AlternateHeadroom:3.83289'].map(s=>{const [k,v]=s.split(':');return `<${prefix}:${k}>${v}</${prefix}:${k}>`;}).join('')
  +`<${prefix}:ChannelMetadata><rdf:Seq>`+[-.275635,-.288086,-1.15918].map(min=>`<rdf:li rdf:parseType="Resource">`+
    Object.entries({GainMapMin:min,GainMapMax:3.8125,Gamma:1,OffsetSDR:.015625,OffsetHDR:.015625}).map(([k,v])=>`<${prefix}:${k}>${v}</${prefix}:${k}>`).join('')+'</rdf:li>').join('')
  +`</rdf:Seq></${prefix}:ChannelMetadata></rdf:Description></rdf:RDF></x:xmpmeta>`;
}
function jpegFixture(little=false,{gainXml=xmp(),baseProfile=baseIcc,alternateProfile=alternateIcc}={}){
 const gain=concat([Uint8Array.of(255,216),segment(225,concat([text('http://ns.adobe.com/xap/1.0/\0'),text(gainXml)])),...(alternateProfile?[iccSegment(alternateProfile)]:[]),sof(1512,2016),Uint8Array.of(255,217)]);
 const pre=concat([Uint8Array.of(255,216),iccSegment(baseProfile),sof(3024,4032)]);
 const t=new Uint8Array(82),v=new DataView(t.buffer);t.set(text(little?'II':'MM'));v.setUint16(2,42,little);v.setUint32(4,8,little);v.setUint16(8,3,little);
 for(const [i,tag,type,count,value] of [[0,0xb000,7,4,0],[1,0xb001,4,1,2],[2,0xb002,7,32,50]]){
  const p=10+i*12;v.setUint16(p,tag,little);v.setUint16(p+2,type,little);v.setUint32(p+4,count,little);v.setUint32(p+8,value,little);
 }
 t.set(text('0100'),18);
 const length=pre.length+90+2;
 v.setUint32(50,0x20030000,little);v.setUint32(54,length,little);
 v.setUint32(70,gain.length,little);v.setUint32(74,length-(pre.length+8),little);
 return concat([pre,segment(226,concat([text('MPF\0'),t])),Uint8Array.of(255,217),gain]);
}
test('MPF big/little endian locate a real RGB HDR auxiliary and both colour profiles',()=>{
 for(const little of [false,true]){
  const hdr=extractJpegHdr(jpegFixture(little));
  assert.deepEqual([hdr.width,hdr.height,hdr.gainWidth,hdr.gainHeight],[3024,4032,1512,2016]);
  assert.deepEqual(hdr.baseIcc,baseIcc);assert.deepEqual(hdr.alternateIcc,alternateIcc);
  assert.equal(hdr.metadata.channels.length,3);assert.equal(hdr.metadata.alternateHeadroom,3.83289);
 }
});

function adobeXmp(){
 return `<rdf:Description xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:gm="http://ns.adobe.com/hdr-gain-map/1.0/" gm:Version="1.0" gm:BaseRenditionIsHDR="False" gm:Gamma="1" gm:HDRCapacityMax="3.863412">`
  +`<gm:GainMapMin><rdf:Seq>${[-3.591797,-.02243,-.916016].map(n=>`<rdf:li>${n}</rdf:li>`).join('')}</rdf:Seq></gm:GainMapMin>`
  +`<gm:GainMapMax><rdf:Seq>${[3.849609,3.837891,3.835938].map(n=>`<rdf:li>${n}</rdf:li>`).join('')}</rdf:Seq></gm:GainMapMax></rdf:Description>`;
}
test('Adobe RGB gain maps retain per-channel bounds, scalar defaults and capacity',()=>{
 const metadata=parseAdaptiveHdrXmp(adobeXmp());
 assert.deepEqual(metadata.channels.map(c=>c.min),[-3.591797,-.02243,-.916016]);
 assert.deepEqual(metadata.channels.map(c=>c.max),[3.849609,3.837891,3.835938]);
 assert.equal(metadata.baseHeadroom,0);assert.equal(metadata.alternateHeadroom,3.863412);
 for(const c of metadata.channels){assert.equal(c.gamma,1);assert.equal(c.baseOffset,1/64);assert.equal(c.alternateOffset,1/64);}
 assert.equal(encodeTmapMetadata(metadata).length,142);
 const hdr=extractJpegHdr(jpegFixture(false,{gainXml:adobeXmp(),alternateProfile:null}));
 assert.equal(hdr.primaries,'smpte432');assert.equal(hdr.alternateIcc,null);
 assert.deepEqual(hdr.metadata,metadata);
 assert.throws(()=>parseAdaptiveHdrXmp(adobeXmp().replace('IsHDR="False"','IsHDR="True"')),{code:'err.hdrjpeg'});
 assert.throws(()=>parseAdaptiveHdrXmp(adobeXmp().replace('gm:Gamma="1"','gm:Gamma="0"')),{code:'err.hdrjpeg'});
 assert.throws(()=>parseAdaptiveHdrXmp(adobeXmp().replace('<rdf:li>3.837891</rdf:li>','')),{code:'err.hdrjpeg'});
});

test('Indigo ICC v2 descriptions identify Display P3 without an alternate gain-map ICC',()=>{
 const name=text('Display P3\0'),profile=new Uint8Array(160+name.length),v=new DataView(profile.buffer);
 v.setUint32(0,profile.length);profile.set(text('acsp'),36);v.setUint32(128,1);
 profile.set(text('desc'),132);v.setUint32(136,148);v.setUint32(140,12+name.length);
 profile.set(text('desc'),148);v.setUint32(156,name.length);profile.set(name,160);
 const hdr=extractJpegHdr(jpegFixture(true,{gainXml:adobeXmp(),baseProfile:profile,alternateProfile:null}));
 assert.deepEqual(hdr.baseIcc,profile);assert.equal(hdr.primaries,'smpte432');
});
test('ordinary JPEG is SDR; recognized truncated or unsupported HDR never silently becomes SDR',()=>{
 const sdr=concat([Uint8Array.of(255,216),sof(20,20),Uint8Array.of(255,217)]);
 assert.equal(extractJpegHdr(sdr),null);assert.equal(extractJpegHdr(text('not JPEG')),null);
 assert.equal(extractJpegHdr(Uint8Array.of(255,216,255)),null);
 assert.throws(()=>extractJpegHdr(jpegFixture().slice(0,-10)),{code:'err.hdrjpeg'});
 assert.throws(()=>extractJpegHdr(concat([sdr.slice(0,-2),segment(225,text('http://ns.adobe.com/hdr-gain-map/1.0/')),Uint8Array.of(255,217)])),{code:'err.hdrjpeg'});
 assert.throws(()=>extractJpegHdr(concat([sdr.slice(0,-2),segment(226,text('urn:iso:std:iso:ts:21496:-1\0')),Uint8Array.of(255,217)])),{code:'err.hdrjpeg'});
 assert.throws(()=>parseAdaptiveHdrXmp(xmp().replace('<HDRToneMap:Gamma>1','<HDRToneMap:Gamma>0')),{code:'err.hdrjpeg'});
 assert.throws(()=>parseAdaptiveHdrXmp(xmp().replace('<HDRToneMap:Version>1','<HDRToneMap:Version>2')),{code:'err.hdrjpeg'});
});
test('tmap preserves signed per-channel ranges, headroom/gamma/offsets and namespace-independent XMP',()=>{
 const metadata=parseAdaptiveHdrXmp(xmp('gm')),bytes=encodeTmapMetadata(metadata),v=new DataView(bytes.buffer);
 assert.equal(bytes.length,142);assert.equal(bytes[5],0xc0);
 assert.equal(v.getUint32(14)/v.getUint32(18),3.83289);
 for(let i=0;i<3;i++){
  const p=22+i*40;
  assert.equal(v.getInt32(p)/v.getUint32(p+4),metadata.channels[i].min);
  assert.equal(v.getUint32(p+16)/v.getUint32(p+20),1);
  assert.equal(v.getInt32(p+24)/v.getUint32(p+28),.015625);
 }
});
test('tmap encode/parse round-trips single and RGB channel metadata',()=>{
 const variants=[
  {baseHeadroom:0,alternateHeadroom:3,channels:[{min:0,max:3,gamma:1,baseOffset:.015625,alternateOffset:.015625}],useBaseColorSpace:true},
  {baseHeadroom:.25,alternateHeadroom:4.25,channels:[
   {min:-1,max:3.1,gamma:1.2,baseOffset:.01,alternateOffset:.02},
   {min:-.5,max:3.2,gamma:.9,baseOffset:.01,alternateOffset:.02},
   {min:-.25,max:3.3,gamma:1.1,baseOffset:.01,alternateOffset:.02}],useBaseColorSpace:false},
 ];
 for(const metadata of variants){
  const parsed=parseTmapMetadata(encodeTmapMetadata(metadata));
  assert.equal(parsed.channels.length,metadata.channels.length);
  assert.equal(parsed.useBaseColorSpace,metadata.useBaseColorSpace);
  assert.ok(Math.abs(parsed.baseHeadroom-metadata.baseHeadroom)<1e-6);
  assert.ok(Math.abs(parsed.alternateHeadroom-metadata.alternateHeadroom)<1e-6);
  parsed.channels.forEach((channel,i)=>{
   for(const key of ['min','max','gamma','baseOffset','alternateOffset'])
    assert.ok(Math.abs(channel[key]-metadata.channels[i][key])<1e-6,`${key} mismatch`);
  });
 }
});

test('YUV tile extraction keeps all gain-map channels, placement and neutral padding',()=>{
 const w=6,h=4,y=Array.from({length:24},(_,i)=>i),u=[31,32,33,34,35,36],v=[71,72,73,74,75,76];
 const tile=yuv420Tile(Uint8Array.from([...y,...u,...v]),w,h,1,0,4);
 assert.deepEqual([...tile.subarray(0,4)],[4,5,0,0]);assert.deepEqual([...tile.subarray(12,16)],[22,23,0,0]);
 assert.deepEqual([...tile.subarray(16,20)],[33,128,36,128]);assert.deepEqual([...tile.subarray(20)],[73,128,76,128]);
});

test('gain-map gamma/log encoding round-trips ISO metadata values',()=>{
 const channel={min:-1.25,max:3.5,gamma:1.7,baseOffset:.015625,alternateOffset:.015625};
 for(const log of [-1.25,-.5,0,1.25,3.5]){
  const sample=encodeGainLog(log,channel),decoded=decodeGainLog(sample,channel);
  assert.ok(Math.abs(decoded-log)<1e-10,`${log} -> ${sample} -> ${decoded}`);
 }
 assert.equal(srgbToLinear(0),0);assert.equal(srgbToLinear(1),1);
});

test('rebasing gain map transfers AI linear detail while preserving the HDR solve',()=>{
 const metadata={channels:[{min:-2,max:4,gamma:1.25,baseOffset:.015625,alternateOffset:.015625}]};
 const original=new Uint8ClampedArray([80,120,180,255, 210,150,90,255]);
 const restored=new Uint8ClampedArray([90,112,190,255, 202,160,96,255]);
 const gain=new Uint8ClampedArray([120,120,120,255, 190,190,190,255]);
 const result=rebaseGainMapRgba(original,restored,gain,metadata);
 assert.equal(result.rgba.length,gain.length);assert.equal(result.clipped,0);
 const meta=metadata.channels[0];
 for(let p=0;p<gain.length;p+=4)for(let c=0;c<3;c++){
  const oldSdr=srgbToLinear(original[p+c]/255),newSdr=srgbToLinear(restored[p+c]/255);
  const oldHdr=(oldSdr+meta.baseOffset)*2**decodeGainLog(gain[p+c]/255,meta)-meta.alternateOffset;
  const target=Math.max(0,oldHdr+newSdr-oldSdr);
  const rebuilt=(newSdr+meta.baseOffset)*2**decodeGainLog(result.rgba[p+c]/255,meta)-meta.alternateOffset;
  assert.ok(Math.abs(rebuilt-target)<.035,`HDR round-trip drift ${rebuilt-target}`);
 }
 assert.ok(result.maxError<.035);
});

test('full-range JPEG YUV gain samples convert back to neutral RGB',()=>{
 const y=Uint8Array.from([0,64,128,255]),u=Uint8Array.of(128),v=Uint8Array.of(128);
 const rgba=yuv420ToRgba(Uint8Array.from([...y,...u,...v]),2,2);
 assert.deepEqual([...rgba.filter((_,i)=>i%4===3)],[255,255,255,255]);
 for(let i=0;i<4;i++){
  const p=i*4;
  assert.ok(Math.max(Math.abs(rgba[p]-y[i]),Math.abs(rgba[p+1]-y[i]),Math.abs(rgba[p+2]-y[i]))<=1);
 }
});

const fixture=JSON.parse(fs.readFileSync(new URL('./raster-hevc.fixture.json',import.meta.url)));
const assets=await generateSyntheticHevc(null,async(_,options)=>{
 const a=options.pixelFormat!=='gray'?fixture.assets.delta:options.width===768?fixture.assets.textureMask:fixture.assets.mask;
 return {...a,hvcc:Uint8Array.from(a.hvcc),payload:Uint8Array.from(a.payload)};
});
test('HEIC carries distinct HDR tiles, original XMP/ICC, a tmap derivation and preferred HDR alternative',()=>{
 const hdr=extractJpegHdr(jpegFixture()),profile=buildGeneratedProfile('48-12',assets),pd=discoverHeic(profile.meta);
 for(const p of pd.props.properties)if(p.type==='irot')profile.meta[p.box.off+p.box.hdr]=0;
 const geometry={...targetGeometry({width:600,height:900}),exifOrientation:1};
 const main=Array.from({length:geometry.primaryTiles},(_,i)=>Uint8Array.of(1,i));
 const gain=Array.from({length:geometry.hdrColumns*geometry.hdrRows},(_,i)=>Uint8Array.of(2,i));
 const codec=propertyBoxBytes(profile.meta,pd.props,pd.primaryTiles[0],'hvcC');
 const result=buildRasterHeic(profile,{main,mainHvcc:codec,mainColr:iccColr(hdr.baseIcc),thumb:Uint8Array.of(3),thumbHvcc:codec,
  hdrChunks:gain,hdrHvcc:codec,hdrMetadata:hdr.metadata,hdrAlternateColr:iccColr(hdr.alternateIcc),hdrXmp:hdr.xmp},null,null,geometry);
 const d=discoverHeic(result),tmap=[...d.infos].find(([,i])=>i.type==='tmap')[0];
 assert.deepEqual(extractItem(result,d.iloc,tmap),encodeTmapMetadata(hdr.metadata));
 assert.deepEqual(propertyBoxBytes(result,d.props,d.primary,'colr'),iccColr(hdr.baseIcc));
 assert.deepEqual(propertyBoxBytes(result,d.props,tmap,'colr'),iccColr(hdr.alternateIcc));
 assert.deepEqual(d.refs.find(r=>r.from===tmap&&r.type==='dimg').to,[d.primary,d.hdrGrid]);
 assert.ok(d.refs.some(r=>r.type==='cdsc'&&r.from===d.stylesItem&&r.to.includes(tmap)));
 assert.ok(d.refs.some(r=>r.type==='cdsc'&&r.from===d.exifItem&&r.to.includes(tmap)));
 assert.ok(d.refs.some(r=>r.type==='auxl'&&r.from===d.linearThumb&&r.to.includes(tmap)));
 const tiles=d.refs.find(r=>r.from===d.hdrGrid&&r.type==='dimg').to;
 tiles.forEach((id,i)=>assert.deepEqual(extractItem(result,d.iloc,id),gain[i]));
 const sidecar=d.refs.find(r=>r.type==='cdsc'&&r.to.includes(d.hdrGrid)).from;
 assert.deepEqual(extractItem(result,d.iloc,sidecar),hdr.xmp);
 assert.equal(readExifOrientation(extractItem(result,d.iloc,d.exifItem)),1);
 assert.deepEqual(dimensionsForItem(d.props,tmap),[geometry.storedWidth,geometry.storedHeight]);
 assert.deepEqual([describeHeic(result).width,describeHeic(result).height],[geometry.storedWidth,geometry.storedHeight]);
 const grpl=findChild(metaChildren(result,topBox(result,'meta')),'grpl'),altr=[...boxes(result,grpl.off+grpl.hdr,grpl.off+grpl.size)][0];
 assert.equal(altr.type,'altr');const view=new DataView(result.buffer,result.byteOffset+altr.off+altr.hdr);
 assert.equal(view.getUint32(12),tmap);assert.equal(view.getUint32(16),d.primary);
 assert.throws(()=>buildRasterHeic(profile,{main,mainHvcc:codec,thumb:Uint8Array.of(3),thumbHvcc:codec,hdrChunks:[],hdrHvcc:codec},null,null,geometry),/HDR tiles/);
 const template=JSON.parse(fs.readFileSync(new URL('../../web/src/portrait/portrait-template.json',import.meta.url)));
 const portrait=buildAiPortrait(result,{payload:assets.mask.payload,hvcc:assets.mask.hvcc,width:64,height:64},template).data;
 const p=discoverHeic(portrait),pt=[...p.infos].find(([,i])=>i.type==='tmap')[0];
 assert.deepEqual(extractItemData(portrait,p,pt),encodeTmapMetadata(hdr.metadata));
 assert.deepEqual(propertyBoxBytes(portrait,p.props,p.primary,'colr'),iccColr(hdr.baseIcc));
 assert.deepEqual(propertyBoxBytes(portrait,p.props,pt,'colr'),iccColr(hdr.alternateIcc));
 const gainTiles=p.refs.find(r=>r.type==='dimg'&&r.from===p.hdrGrid).to;
 gainTiles.forEach((id,i)=>assert.deepEqual(extractItem(portrait,p.iloc,id),gain[i]));
 const ps=p.refs.find(r=>r.type==='cdsc'&&r.to.includes(p.hdrGrid)).from;
 assert.deepEqual(extractItem(portrait,p.iloc,ps),hdr.xmp);
 const pg=findChild(metaChildren(portrait,topBox(portrait,'meta')),'grpl'),pa=[...boxes(portrait,pg.off+pg.hdr,pg.off+pg.size)][0];
 const pv=new DataView(portrait.buffer,portrait.byteOffset+pa.off+pa.hdr);
 assert.equal(pv.getUint32(12),pt);assert.equal(pv.getUint32(16),p.primary);
});
