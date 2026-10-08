// JPEG MPF extraction and Apple Adaptive HDR -> ISO 21496-1 tmap metadata.
// No donor headroom, gamma, offsets or channel ranges are substituted.
import {box,concat,be} from './box.js';

const text=new TextDecoder(), enc=new TextEncoder();
const HDR_NS='http://ns.adobe.com/hdr-gain-map/1.0/';
export function hdrJpegError(message) {return Object.assign(new Error(message),{code:'err.hdrjpeg'});}
const fail=message=>{throw hdrJpegError(message);};
const starts=(data,value)=>data.length>=value.length&&value.every((v,i)=>data[i]===v);
const MPF=enc.encode('MPF\0'),ICC=enc.encode('ICC_PROFILE\0'),XMP=enc.encode('http://ns.adobe.com/xap/1.0/\0');

function jpegHeader(bytes,start=0,end=bytes.length) {
 if(start<0||end>bytes.length||start+4>end||bytes[start]!==255||bytes[start+1]!==216)fail('Invalid MPF JPEG start');
 const segments=[];let width,height,components,precision,p=start+2;
 while(p+2<=end){
  if(bytes[p++]!==255)fail('Invalid JPEG marker');
  while(bytes[p]===255)p++;
  const marker=bytes[p++];if(marker===218||marker===217)break;
  if(marker===1||marker>=208&&marker<=215)continue;
  if(p+2>end)fail('Truncated JPEG segment');
  const length=bytes[p]*256+bytes[p+1];
  if(length<2||p+length>end)fail('Truncated JPEG segment');
  const data=bytes.subarray(p+2,p+length);
  segments.push({marker,data,offset:p+2});
  if([192,193,194].includes(marker)){
   if(data.length<6)fail('Truncated JPEG dimensions');
   [precision,height,width,components]=[data[0],data[1]*256+data[2],data[3]*256+data[4],data[5]];
  }
  p+=length;
 }
 return {segments,width,height,components,precision};
}
function iccProfile(header) {
 const parts=header.segments.filter(s=>s.marker===226&&starts(s.data,ICC));
 if(!parts.length)return null;
 const count=parts[0].data[13];
 if(!count||parts.length!==count)fail('Incomplete JPEG ICC profile');
 const ordered=new Array(count);
 for(const {data} of parts){const i=data[12]-1;if(i<0||i>=count||ordered[i]||data[13]!==count)fail('Invalid JPEG ICC sequence');ordered[i]=data.subarray(14);}
 const profile=concat(ordered);
 if(profile.length<132||new DataView(profile.buffer,profile.byteOffset,profile.byteLength).getUint32(0)!==profile.length
   ||text.decode(profile.subarray(36,40))!=='acsp')fail('Invalid JPEG ICC profile');
 return profile;
}
function iccName(profile){
 if(!profile)return '';
 const view=new DataView(profile.buffer,profile.byteOffset,profile.byteLength),n=view.getUint32(128);
 if(132+n*12>profile.length)fail('Truncated ICC tag table');
 for(let i=0;i<n;i++){
  const p=132+i*12,o=view.getUint32(p+4),size=view.getUint32(p+8);
  if(o+size>profile.length)fail('Truncated ICC tag');
  if(text.decode(profile.subarray(p,p+4))==='desc'&&text.decode(profile.subarray(o,o+4))==='mluc'){
   if(size<28)fail('Invalid ICC description');
   const length=view.getUint32(o+20),offset=view.getUint32(o+24);
   if(offset+length>size)fail('Invalid ICC description');
   return new TextDecoder('utf-16be').decode(profile.subarray(o+offset,o+offset+length));
  }
 }
 return '';
}
function mpfImages(segment,bytes) {
 const t=segment.data.subarray(4),v=new DataView(t.buffer,t.byteOffset,t.byteLength);
 if(t.length<8)fail('Truncated MPF TIFF');
 const order=text.decode(t.subarray(0,2)),little=order==='II';
 if(!['II','MM'].includes(order)||v.getUint16(2,little)!==42)fail('Invalid MPF TIFF');
 const at=(p,n)=>{if(p<0||p+n>t.length)fail('MPF offset out of range');return p;};
 const ifd=v.getUint32(4,little),count=v.getUint16(at(ifd,2),little);
 let number,entries;
 for(let i=0;i<count;i++){
  const p=at(ifd+2+i*12,12),tag=v.getUint16(p,little),type=v.getUint16(p+2,little),n=v.getUint32(p+4,little);
  if(tag===0xb001){if(type!==4||n!==1)fail('Invalid MPF image count');number=v.getUint32(p+8,little);}
  if(tag===0xb002){if(type!==7||n%16)fail('Invalid MPF entry table');entries={offset:v.getUint32(p+8,little),length:n};}
 }
 if(!number||number>16||!entries||entries.length!==number*16)fail('Invalid MPF image table');
 at(entries.offset,entries.length);
 const images=[];
 for(let i=0;i<number;i++){
  const p=entries.offset+i*16,length=v.getUint32(p+4,little),relative=v.getUint32(p+8,little);
  const start=relative===0?0:segment.offset+4+relative,end=start+length;
  if(length<4||end>bytes.length||bytes[end-2]!==255||bytes[end-1]!==217)fail('Truncated MPF image');
  if(images.some(image=>start<image.end&&end>image.start))fail('Overlapping MPF images');
  images.push({start,end,bytes:bytes.subarray(start,end),...jpegHeader(bytes,start,end)});
 }
 if(images[0].start!==0)fail('MPF primary image missing');
 return images;
}
const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function parseAdaptiveHdrXmp(xml) {
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))fail('Unsupported HDR XMP declarations');
 const declarations=[...xml.matchAll(/xmlns:([A-Za-z_][\w.-]*)\s*=\s*["']([^"']+)["']/g)];
 const prefix=declarations.find(([, ,uri])=>uri===HDR_NS)?.[1];
 if(!prefix||!xml.includes(prefix+':ChannelMetadata'))fail('Unsupported JPEG HDR metadata');
 const name=escape(prefix);
 const number=(field,source=xml)=>{
  const value=new RegExp(`<${name}:${field}\\b[^>]*>\\s*([-+0-9.eE]+)\\s*</${name}:${field}\\s*>`).exec(source)?.[1]
   ??new RegExp(`\\b${name}:${field}\\s*=\\s*["']([-+0-9.eE]+)["']`).exec(source)?.[1];
  if(value===undefined||!Number.isFinite(Number(value)))fail('Missing HDR '+field);
  return Number(value);
 };
 if(number('Version')!==1||number('BaseRenditionIsHDR')!==0)fail('Unsupported HDR base rendition/version');
 const baseHeadroom=number('BaseHeadroom'),alternateHeadroom=number('AlternateHeadroom');
 if(baseHeadroom<0||alternateHeadroom<=baseHeadroom||alternateHeadroom>32)fail('Invalid HDR headroom');
 const channelBlock=new RegExp(`<${name}:ChannelMetadata\\b[^>]*>([\\s\\S]*?)</${name}:ChannelMetadata\\s*>`).exec(xml)?.[1];
 if(channelBlock===undefined)fail('Invalid HDR channel metadata');
 const rdf=escape(declarations.find(([, ,uri])=>uri==='http://www.w3.org/1999/02/22-rdf-syntax-ns#')?.[1]||'rdf');
 const channels=[...channelBlock.matchAll(new RegExp(`<${rdf}:li\\b[^>]*>([\\s\\S]*?)</${rdf}:li\\s*>`,'g'))].map(([,part])=>{
  const min=number('GainMapMin',part),max=number('GainMapMax',part),gamma=number('Gamma',part),baseOffset=number('OffsetSDR',part),alternateOffset=number('OffsetHDR',part);
  if(min>max||Math.abs(min)>32||Math.abs(max)>32||gamma<=0||gamma>32||baseOffset<0||alternateOffset<0||baseOffset>16||alternateOffset>16)fail('Invalid HDR channel');
  return {min,max,gamma,baseOffset,alternateOffset};
 });
 if(![1,3].includes(channels.length))fail('Unsupported HDR channel count');
 return {baseHeadroom,alternateHeadroom,channels,useBaseColorSpace:true};
}

/** Null for ordinary SDR JPEG; recognized unsupported/broken HDR must never fall back to SDR. */
export function extractJpegHdr(bytes) {
 if(bytes[0]!==255||bytes[1]!==216)return null;
 const metadataText=text.decode(bytes);
 const hasHdrSignal=metadataText.includes(HDR_NS)||metadataText.includes('urn:com:apple:photo:2020:aux:hdrgainmap')
  ||metadataText.includes('urn:iso:std:iso:ts:21496:-1');
 let primary;
 try{primary=jpegHeader(bytes);}catch(error){if(hasHdrSignal)throw error;return null;}
 const mpf=primary.segments.find(s=>s.marker===226&&starts(s.data,MPF));
 if(!mpf){if(hasHdrSignal)fail('HDR JPEG has no MPF image table');return null;}
 let images;
 try{images=mpfImages(mpf,bytes);}catch(error){if(hasHdrSignal)throw error;return null;}
 const candidates=images.slice(1).map(image=>({...image,xmp:image.segments.filter(s=>s.marker===225&&starts(s.data,XMP)).map(s=>text.decode(s.data.subarray(XMP.length))).join('\n')}))
  .filter(image=>image.xmp.includes(HDR_NS));
 if(!candidates.length){if(hasHdrSignal)fail('HDR gain map missing from MPF');return null;}
 if(candidates.length!==1)fail('Multiple HDR gain maps are unsupported');
 const gain=candidates[0],base=images[0];
 for(const image of [base,gain])if(image.precision!==8||![1,3].includes(image.components)||!image.width||!image.height
  ||image.width%2||image.height%2||image.width>8192||image.height>8192)fail('Unsupported HDR JPEG dimensions/channels');
 const metadata=parseAdaptiveHdrXmp(gain.xmp),baseIcc=iccProfile(base),alternateIcc=iccProfile(gain);
 const baseName=iccName(baseIcc),alternateName=iccName(alternateIcc);
 const primaries=!baseIcc||/sRGB/i.test(baseName)?'bt709':/^Display P3$/.test(baseName)?'smpte432':null;
 if(!primaries||!alternateIcc||!(primaries==='smpte432'?/^Display P3;/.test(alternateName):/sRGB|Rec\. ?709/i.test(alternateName)))
  fail('Unsupported HDR JPEG colour profiles');
 // Gain-map ICC describes the alternate HDR rendition (e.g. P3/PQ), not the
 // numerical gain samples. Decode samples without browser ICC/HDR tone mapping.
 // Remove the now-stale MPF pointer from the isolated base stream. Some browser
 // decoders try to follow it and reject a base-only JPEG with an absent auxiliary.
 const baseOnly=concat([base.bytes.subarray(0,mpf.offset-4),base.bytes.subarray(mpf.offset+mpf.data.length)]);
 return {base:baseOnly,gain:gain.bytes,width:base.width,height:base.height,gainWidth:gain.width,gainHeight:gain.height,
  baseIcc,alternateIcc,metadata,xmp:enc.encode(gain.xmp),primaries};
}

export const iccColr=profile=>box('colr',concat([enc.encode('prof'),profile]));
export function encodeTmapMetadata(metadata) {
 const {baseHeadroom,alternateHeadroom,channels,useBaseColorSpace}=metadata;
 if(![1,3].includes(channels.length))fail('Invalid tmap channels');
 const out=new Uint8Array(22+channels.length*40),v=new DataView(out.buffer);let p=6;
 // tmap version(8), minimum_version(16), writer_version(16), flags(8).
 out[5]=(channels.length===3?128:0)|(useBaseColorSpace?64:0);
 const rational=(value,signed=false)=>{
  const n=Math.round(value*1_000_000);
  if(!Number.isFinite(value)||n<(signed?-2147483648:0)||n>(signed?2147483647:4294967295))fail('Invalid tmap rational');
  signed?v.setInt32(p,n):v.setUint32(p,n);v.setUint32(p+4,1_000_000);p+=8;
 };
 rational(baseHeadroom);rational(alternateHeadroom);
 for(const c of channels){rational(c.min,true);rational(c.max,true);rational(c.gamma);rational(c.baseOffset,true);rational(c.alternateOffset,true);}
 return out;
}

export function yuv420Tile(source,width,height,column,row,tile=512) {
 if(width%2||height%2||source.length!==width*height*1.5||tile%2)fail('Invalid JPEG YUV samples');
 const output=new Uint8Array(tile*tile*1.5);output.fill(128,tile*tile);
 let fromOffset=0,toOffset=0;
 for(let plane=0;plane<3;plane++){
  const scale=plane?2:1,w=width/scale,h=height/scale,size=tile/scale,x=column*size,y=row*size;
  for(let line=0;line<Math.min(size,h-y);line++){
   const n=Math.max(0,Math.min(size,w-x));
   output.set(source.subarray(fromOffset+(y+line)*w+x,fromOffset+(y+line)*w+x+n),toOffset+line*size);
  }
  fromOffset+=w*h;toOffset+=size*size;
 }
 return output;
}
