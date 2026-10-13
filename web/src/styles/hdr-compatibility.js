import {discoverHeic,extractItemData,auxUriForItem,URI_HDR_GAIN,DEPTH_URI,appendIpcoProperty,auxcBox,
  setItemPropertyAssociations,setItemReference,addItems,dimensionsForItem,displayDimensions,
  irotAngleForItem,ispeBox,propertyBoxBytes,replaceItemPropertyWithSource} from '../raster/heif.js';
import {topBox,boxes,box,concat,be} from '../core/box.js';
import {rebuildHeic} from './graft.js';
import {encodeTmapMetadata,bt709ToLinear} from '../raster/jpeg-hdr.js';
import {extractAppleMakerNoteTag,getMakerNoteBlob} from '../core/exif.js';
import {hevcSpsColor} from '../raster/hevc-color.js';

const text=s=>new TextEncoder().encode(s);
const LEGACY_HDR_XMP='http://ns.apple.com/HDRGainMap/1.0/';
const LEGACY_HDR_VERSION=131072;
const P3_PQ_COLR=box('colr',concat([text('nclx'),be(12,2),be(16,2),be(6,2),new Uint8Array([128])]));
const PIXI_RGB10=box('pixi',concat([new Uint8Array(4),new Uint8Array([3,10,10,10])]));
const IROT_IDENTITY=box('irot',new Uint8Array([0]));

function p3BaseColor(colr){
  if(!(colr instanceof Uint8Array)||colr.length<12)return false;
  if(String.fromCharCode(...colr.slice(8,12))==='nclx')
    return new DataView(colr.buffer,colr.byteOffset,colr.byteLength).getUint16(12)===12;
  const needle='Display P3';
  // Apple ICC profiles store the profile description as ordinary ASCII in some
  // legacy HEICs and UTF-16 in others. Accept either exact representation.
  for(let i=0;i+needle.length<=colr.length;i++){
    let ascii=true;
    for(let j=0;j<needle.length;j++)ascii&&=colr[i+j]===needle.charCodeAt(j);
    if(ascii)return true;
  }
  for(let i=0;i+needle.length*2<=colr.length;i++){
    let big=true,little=true;
    for(let j=0;j<needle.length;j++){
      const code=needle.charCodeAt(j);
      big&&=colr[i+j*2]===0&&colr[i+j*2+1]===code;
      little&&=colr[i+j*2]===code&&colr[i+j*2+1]===0;
    }
    if(big||little)return true;
  }
  return false;
}

function appleLegacyHeadroom(data,d){
  if(d.exifItem===null||d.exifItem===undefined)return null;
  try{
    const exif=extractItemData(data,d,d.exifItem),mn=getMakerNoteBlob(exif);
    const little=String.fromCharCode(mn[12],mn[13])==='II';
    const rational=id=>{
      const tag=extractAppleMakerNoteTag(exif,id);
      if(tag.type!==10||tag.payload.length!==8)return null;
      const v=new DataView(tag.payload.buffer,tag.payload.byteOffset,tag.payload.byteLength);
      const den=v.getUint32(4,little);if(!den)return null;
      return v.getInt32(0,little)/den;
    };
    const maker33=rational(0x21),maker48=rational(0x30);
    if(!Number.isFinite(maker33)||!Number.isFinite(maker48))return null;
    let stops;
    if(maker33<1)stops=maker48<=0.01?-20*maker48+1.8:-0.101*maker48+1.601;
    else stops=maker48<=0.01?-70*maker48+3:-0.303*maker48+2.303;
    const headroom=2**Math.max(stops,0);
    return Number.isFinite(headroom)&&headroom>1&&headroom<=32?headroom:null;
  }catch{return null;}
}

function legacyHdrHeadroom(data,d){
  const matches=[];
  for(const ref of d.refs){
    if(ref.type!=='cdsc'||!ref.to.includes(d.hdrGrid)||d.infos.get(ref.from)?.type!=='mime')continue;
    const xml=new TextDecoder().decode(extractItemData(data,d,ref.from));
    if(!xml.includes(LEGACY_HDR_XMP))continue;
    const version=Number(/<HDRGainMap:HDRGainMapVersion>([^<]+)</.exec(xml)?.[1]);
    let headroom=Number(/<HDRGainMap:HDRGainMapHeadroom>([^<]+)</.exec(xml)?.[1]);
    if(version===65536&&!Number.isFinite(headroom))headroom=appleLegacyHeadroom(data,d);
    if([65536,LEGACY_HDR_VERSION].includes(version)&&Number.isFinite(headroom)&&headroom>1&&headroom<=32)
      matches.push({id:ref.from,headroom,version,xml});
  }
  return matches.length===1?matches[0]:null;
}

function isoHdrGainMapXmp(legacy){
  const version=/<HDRGainMap:HDRGainMapVersion>[^<]+<\/HDRGainMap:HDRGainMapVersion>/;
  const headroom=/<HDRGainMap:HDRGainMapHeadroom>[^<]+<\/HDRGainMap:HDRGainMapHeadroom>/;
  let xml=legacy.xml.replace(version,
    `<HDRGainMap:HDRGainMapVersion>${LEGACY_HDR_VERSION}</HDRGainMap:HDRGainMapVersion>`);
  const value=`<HDRGainMap:HDRGainMapHeadroom>${legacy.headroom.toFixed(9)}</HDRGainMap:HDRGainMapHeadroom>`;
  if(headroom.test(xml))xml=xml.replace(headroom,value);
  else xml=xml.replace(`</HDRGainMap:HDRGainMapVersion>`,`</HDRGainMap:HDRGainMapVersion>${value}`);
  if(xml===legacy.xml||!xml.includes(value))throw Error('Legacy HDR metadata conversion failed');
  return text(xml);
}

const clamp01=value=>Math.max(0,Math.min(1,value));

/**
 * Apple's pre-ISO map stores a Rec.709-encoded linear multiplier, whereas an
 * ISO tmap stores normalized log2 gain. Treating the old bytes as ISO samples
 * makes bright edges too strong and lets them visibly cut back through Portrait
 * blur. Convert the samples before adding a tmap; endpoints remain exact and the
 * 8-bit round-trip error stays below one ISO gain-map code value.
 */
export function normalizeAppleLegacyGainSamples(samples,headroom){
  const stops=Math.log2(headroom);
  if(!(samples instanceof Uint8Array)||!Number.isFinite(stops)||stops<=0||stops>5)
    throw Error('Invalid legacy HDR gain map');
  const out=new Uint8Array(samples.length);
  for(let i=0;i<samples.length;i++){
    const linear=bt709ToLinear(samples[i]/255);
    out[i]=Math.round(255*clamp01(Math.log2(1+(headroom-1)*linear)/stops));
  }
  return out;
}

function hvccRecord(bytes){
  const b=topBox(bytes,'hvcC');
  return bytes.subarray(b.off+b.hdr,b.off+b.size);
}

/**
 * Prepare an Apple legacy gain map for the ISO tmap Portrait path. This is the
 * only lossy-looking step in the compatibility route, but the HEVC write itself
 * is lossless: only the mathematically different Apple-vs-ISO transfer is
 * remapped. Primary pixels, depth, Styles, and every unrelated payload remain
 * byte-identical.
 */
export async function normalizeLegacyPortraitHdrGain(data,{onProgress=()=>{},codec=null}={}){
  const d=discoverHeic(data);
  if(d.hdrGrid===null||[...d.infos].some(([,info])=>info.type==='tmap'))return null;
  if(auxUriForItem(d.props,d.hdrGrid)!==URI_HDR_GAIN)return null;
  const legacy=legacyHdrHeadroom(data,d);
  if(!legacy||!p3BaseColor(propertyBoxBytes(data,d.props,d.primary,'colr')))return null;
  // 0x20000 already declares the logarithmic representation consumed by tmap.
  // Never run the 0x10000 transfer conversion twice after a Photos round-trip.
  if(legacy.version===LEGACY_HDR_VERSION)return {data,headroom:legacy.headroom,maxError:0,
    changedItems:[],alreadyNormalized:true};
  if(legacy.version!==65536)return null;
  const items=d.hdrTiles.length?d.hdrTiles:[d.hdrGrid];
  if(items.some(id=>d.infos.get(id)?.type!=='hvc1'))return null;
  codec??=await import('../raster/ffmpeg-hevc.js');
  let meta=data.slice(d.meta.off,d.meta.off+d.meta.size);
  const payloads=new Map();let maxError=0;
  for(let i=0;i<items.length;i++){
    const id=items[i],[width,height]=dimensionsForItem(d.props,id);
    if(![width,height].every(n=>Number.isInteger(n)&&n>=2&&n<=8192&&n%2===0))
      throw Error('Unsupported legacy HDR gain-map geometry');
    const hvcc=propertyBoxBytes(data,d.props,id,'hvcC');
    if(!hvcc)throw Error('Legacy HDR gain map has no decoder configuration');
    const record=hvccRecord(hvcc),sps=hevcSpsColor(record);
    if(sps.chroma!==0||sps.luma!==8||sps.chromaDepth!==8||sps.fullRange!==true)
      throw Error('Unsupported legacy HDR gain-map encoding');
    const decoded=await codec.decodeHevcLuma(record,extractItemData(data,d,id),{width,height},onProgress);
    const normalized=normalizeAppleLegacyGainSamples(decoded.bytes,legacy.headroom);
    const encoded=await codec.encodeHevcPixels(normalized,{width,height,pixelFormat:'gray',
      primaries:'unspecified',transfer:'unspecified',matrix:'unspecified',fullRange:true,lossless:true},onProgress);
    if(encoded.sps?.chroma!==0||encoded.sps?.luma!==8||encoded.sps?.fullRange!==true)
      throw Error('Legacy HDR gain-map encoder changed the sample contract');
    payloads.set(id,encoded.payload);meta=replaceItemPropertyWithSource(meta,id,'hvcC',encoded.hvcc);
    for(let p=0;p<decoded.bytes.length;p++){
      const apple=1+(legacy.headroom-1)*bt709ToLinear(decoded.bytes[p]/255);
      const iso=2**((normalized[p]/255)*Math.log2(legacy.headroom));
      maxError=Math.max(maxError,Math.abs(apple-iso));
    }
    onProgress({stage:'legacyHdrNormalize',done:i+1,total:items.length});
  }
  // The representation and its declaration are one contract. Leaving 0x10000
  // here makes Photos interpret the already-logarithmic samples as legacy
  // Rec.709 gain and can make it discard the editable tmap on import.
  payloads.set(legacy.id,isoHdrGainMapXmp(legacy));
  const ft=topBox(data,'ftyp'),output=rebuildHeic(data,d,data.slice(ft.off,ft.off+ft.size),meta,payloads);
  return {data:output,headroom:legacy.headroom,maxError,changedItems:items};
}

/**
 * Promote a normalized copy of Apple's legacy auxiliary gain-map HDR into the
 * derived-image graph used by newer editable Portrait captures. The preparation
 * step above changes only the gain representation; image and depth samples stay
 * untouched. The tmap then exposes one coherent HDR rendition to the editor.
 */
export function promoteLegacyPortraitHdr(data,{normalizedGain=false}={}){
  const d=discoverHeic(data);
  // Raw Apple gain-map samples do not obey ISO's logarithmic sample equation.
  // A metadata-only tmap was device-tested and made HDR bokeh visibly wrong.
  if(!normalizedGain)return null;
  if(d.hdrGrid===null||[...d.infos].some(([,info])=>info.type==='tmap'))return null;
  if(auxUriForItem(d.props,d.hdrGrid)!==URI_HDR_GAIN)return null;
  const depths=[...d.infos.keys()].filter(id=>auxUriForItem(d.props,id)===DEPTH_URI);
  if(depths.length!==1)return null;
  const legacy=legacyHdrHeadroom(data,d);
  if(!legacy||legacy.version!==LEGACY_HDR_VERSION
    ||!p3BaseColor(propertyBoxBytes(data,d.props,d.primary,'colr')))return null;

  const alternate=Math.log2(legacy.headroom);
  if(!(alternate>0&&alternate<=5))return null;
  const metadata=encodeTmapMetadata({baseHeadroom:0,alternateHeadroom:alternate,useBaseColorSpace:true,
    channels:[{min:0,max:alternate,gamma:1,baseOffset:0,alternateOffset:0}]});
  const [pw,ph]=dimensionsForItem(d.props,d.primary);
  const [dw,dh]=displayDimensions(pw,ph,irotAngleForItem(data,d.props,d.primary));

  let meta=data.slice(d.meta.off,d.meta.off+d.meta.size),ids;
  [meta,ids]=addItems(meta,[{key:'legacy-hdr-tmap',itemType:'tmap',refType:'dimg',
    refTo:[d.primary,d.hdrGrid],boxes:[ispeBox(dw,dh),P3_PQ_COLR,PIXI_RGB10,IROT_IDENTITY]}]);
  const tmap=ids.get('legacy-hdr-tmap');

  // Native HDR Portrait graphs associate editing resources with both renditions.
  // The gain map itself remains auxiliary only to the SDR base because tmap already
  // consumes it as its second derived-image input.
  for(const ref of d.refs){
    if(ref.from===d.hdrGrid||!['auxl','cdsc','thmb'].includes(ref.type)
      ||!ref.to.includes(d.primary)||ref.to.includes(tmap))continue;
    meta=setItemReference(meta,ref.type,ref.from,[...ref.to,tmap]);
  }

  const m=topBox(meta,'meta');
  const altr=box('altr',concat([new Uint8Array(4),be(1,4),be(2,4),be(tmap,4),be(d.primary,4)]));
  meta=box('meta',concat([meta.slice(m.off+m.hdr,m.off+m.hdr+4),
    ...[...boxes(meta,m.off+m.hdr+4,m.off+m.size)].map(b=>meta.slice(b.off,b.off+b.size)),
    box('grpl',altr)]));

  const ft=topBox(data,'ftyp');
  const output=rebuildHeic(data,d,data.slice(ft.off,ft.off+ft.size),meta,new Map([[tmap,metadata]]));
  const after=discoverHeic(output),mapped=[...after.infos].find(([,info])=>info.type==='tmap')?.[0];
  const inputs=mapped===undefined?null:after.refs.find(r=>r.type==='dimg'&&r.from===mapped)?.to;
  if(!inputs||inputs.length!==2||inputs[0]!==after.primary||inputs[1]!==after.hdrGrid)
    throw Error('Legacy HDR tmap promotion failed');
  return {data:output,tmap:mapped,headroom:legacy.headroom};
}

// Photos' Styles/Portrait editor needs the legacy auxiliary role even when the
// original ISO tmap can already display HDR. V4 D/E validated this additive fix.
// The tested edited Bright exports use this single-channel ISO contract. Do not
// reinterpret RGB gain maps, future versions, offsets or gamma as this format.
export function editableTmapHeadroom(data,d=discoverHeic(data)){
  if(d.hdrGrid===null)return null;
  const maps=[...d.infos].filter(([,info])=>info.type==='tmap');
  if(maps.length!==1)return null;
  const [id]=maps[0],inputs=d.refs.find(r=>r.type==='dimg'&&r.from===id)?.to;
  if(inputs?.length!==2||inputs[0]!==d.primary||inputs[1]!==d.hdrGrid)return null;
  const bytes=extractItemData(data,d,id);
  if(bytes.length!==62)return null;
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.length);
  if(bytes[0]!==0||v.getUint16(1)!==0||v.getUint16(3)!==0||(bytes[5]&~0x40)!==0)return null;
  let p=6;
  const rational=(signed=false)=>{
    const n=signed?v.getInt32(p):v.getUint32(p),den=v.getUint32(p+4);p+=8;
    return den?n/den:NaN;
  };
  const base=rational(),alternate=rational(),min=rational(true),max=rational(true),
    gamma=rational(),baseOffset=rational(true),alternateOffset=rational(true);
  if(base!==0||!Number.isFinite(alternate)||alternate<=0||alternate>16
    ||min!==0||max!==alternate||gamma!==1||!Number.isFinite(baseOffset)
    ||baseOffset<0||baseOffset>1||baseOffset!==alternateOffset)return null;
  return 2**alternate;
}

export function registerTmapHdr(data,{headroom=false}={}){
  const d=discoverHeic(data);
  if(d.hdrGrid===null)return null;
  const role=auxUriForItem(d.props,d.hdrGrid);
  // Do not replace any other declared auxiliary role.
  if(role&&role!==URI_HDR_GAIN)return null;
  // The unambiguous ISO tmap relation already identifies this source gain map.
  // Native edited exports can omit Styles while retaining it; requiring Styles
  // here silently skips HDR registration precisely for those exported copies.
  let meta=data.slice(d.meta.off,d.meta.off+d.meta.size),index,changed=false;
  const payloads=new Map();
  if(!role){
    [meta,index]=appendIpcoProperty(meta,auxcBox(URI_HDR_GAIN));
    const associations=(d.props.associations.get(d.hdrGrid)||[]).map(a=>[a.index,a.essential]);
    meta=setItemPropertyAssociations(meta,d.hdrGrid,[...associations,[index,true]]);
    const previous=d.refs.find(r=>r.type==='auxl'&&r.from===d.hdrGrid)?.to||[];
    meta=setItemReference(meta,'auxl',d.hdrGrid,[...new Set([...previous,d.primary])]);
    changed=true;
  }
  if(headroom){
    const own=editableTmapHeadroom(data,d);
    // Existing HDR metadata owns the rendering contract, even if incomplete.
    const described=d.refs.filter(r=>r.type==='cdsc'&&r.to.includes(d.hdrGrid));
    const existing=described.some(r=>d.infos.get(r.from)?.type==='mime'
      &&new TextDecoder().decode(extractItemData(data,d,r.from)).includes('http://ns.apple.com/HDRGainMap/1.0/'));
    if(own!==null&&!existing){
      let ids;
      [meta,ids]=addItems(meta,[{key:'hdr-headroom',itemType:'mime',contentType:'application/rdf+xml',refType:'cdsc',refTo:[d.hdrGrid]}]);
      payloads.set(ids.get('hdr-headroom'),new TextEncoder().encode(`<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:HDRGainMap="http://ns.apple.com/HDRGainMap/1.0/"><HDRGainMap:HDRGainMapVersion>131072</HDRGainMap:HDRGainMapVersion><HDRGainMap:HDRGainMapHeadroom>${own.toFixed(9)}</HDRGainMap:HDRGainMapHeadroom></rdf:Description></rdf:RDF></x:xmpmeta>`));
      changed=true;
    }
  }
  if(!changed)return null;
  const ft=topBox(data,'ftyp');
  return rebuildHeic(data,d,data.slice(ft.off,ft.off+ft.size),meta,payloads);
}
