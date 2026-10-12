import {discoverHeic,extractItem,propertyBoxBytes,dimensionsForItem,replaceItemPropertyWithSource} from '../core/heif.js';
import {topBox} from '../core/box.js';
import {rebuildHeic} from '../styles/graft.js';
import {decodeHevcYuv,encodeHevcPixels,releaseHevcEncoder} from '../raster/ffmpeg-hevc.js';
import {hevcSpsColor} from '../raster/hevc-color.js';
import {rgbaToI420} from '../raster/raster-color.js';
import {yuv420ToRgba} from '../raster/jpeg-hdr.js';
import {applyStyleDisplayRgba,shouldRenderStyleDisplay} from './style-display-render.js';

function hvcRecord(data,d,iid){
  const property=propertyBoxBytes(data,d.props,iid,'hvcC');
  if(!property)throw Error('Suggested Style display item has no hvcC');
  const box=topBox(property,'hvcC');
  return property.subarray(box.off+box.hdr,box.off+box.size);
}
function colorFromSps(sps){
  if(sps.luma!==8||sps.chromaDepth!==8||sps.chroma!==1)throw Error('Suggested Style display requires an 8-bit 4:2:0 primary');
  // Apple photo tiles commonly leave primaries/transfer unspecified in the SPS
  // and carry Display P3 in the colr/ICC property. The established lossless
  // primary re-encode path signals those samples as P3 + BT.709 while preserving
  // the original ICC property byte-for-byte.
  const primaries={1:'bt709',12:'smpte432'}[sps.primaries]||(sps.primaries===2?'smpte432':null);
  const transfer={1:'bt709',6:'smpte170m',13:'iec61966-2-1'}[sps.transfer]||(sps.transfer===2?'bt709':null);
  const matrix={1:'bt709',5:'bt470bg',6:'smpte170m'}[sps.matrix];
  if(!primaries||!transfer||!matrix||typeof sps.fullRange!=='boolean')throw Error('Suggested Style display has unsupported HEIC colour signalling');
  return {primaries,transfer,matrix,fullRange:sps.fullRange};
}
function assertSameColor(encoded,source){
  for(const [key,value] of Object.entries({
    primaries:{bt709:1,smpte432:12}[source.primaries],
    transfer:{bt709:1,smpte170m:6,'iec61966-2-1':13}[source.transfer],
    matrix:{bt709:1,bt470bg:5,smpte170m:6}[source.matrix],
    fullRange:source.fullRange,
  }))if(encoded.sps?.[key]!==value)throw Error(`Suggested Style display encoder changed ${key}`);
  if(encoded.sps?.luma!==8||encoded.sps?.chromaDepth!==8||encoded.sps?.chroma!==1)
    throw Error('Suggested Style display encoder changed pixel format');
}
async function renderItem(data,d,iid,recommendation,onProgress){
  const [width,height]=dimensionsForItem(d.props,iid);
  if(![width,height].every(value=>Number.isInteger(value)&&value>=2&&value%2===0))throw Error('Suggested Style display has invalid item geometry');
  const record=hvcRecord(data,d,iid),color=colorFromSps(hevcSpsColor(record));
  const yuv=await decodeHevcYuv(record,extractItem(data,d.iloc,iid),{width,height},onProgress);
  const rgba=yuv420ToRgba(yuv,width,height,{matrix:color.matrix,fullRange:color.fullRange});
  const styled=applyStyleDisplayRgba(rgba,recommendation),encoded=await encodeHevcPixels(
    rgbaToI420(styled,width,height,color),{width,height,pixelFormat:'yuv420p',...color,lossless:false,crf:18},onProgress);
  assertSameColor(encoded,color);
  return encoded;
}

/**
 * Bake a lightweight display rendition into the ordinary primary/thumbnail only.
 * The linear thumbnail, StyleDeltaMap, Styles plist and 0x54 selection stay intact,
 * so Photos Edit continues to use the editable Styles graph. For HDR, the original
 * gain map remains attached to the newly styled SDR base; this makes the suggestion
 * visible immediately while retaining the source highlight modulation and headroom.
 */
export async function renderSuggestedStyleDisplay(data,recommendation,{onProgress=()=>{}}={}){
  if(!shouldRenderStyleDisplay(recommendation))return {data,rendered:false,reason:'neutral'};
  const d=discoverHeic(data);
  if(!d.primaryTiles?.length)return {data,rendered:false,reason:'primary'};
  let meta=data.slice(d.meta.off,d.meta.off+d.meta.size);
  const payloads=new Map();
  try{
    for(let index=0;index<d.primaryTiles.length;index++){
      const iid=d.primaryTiles[index],encoded=await renderItem(data,d,iid,recommendation,onProgress);
      payloads.set(iid,encoded.payload);
      meta=replaceItemPropertyWithSource(meta,iid,'hvcC',encoded.hvcc);
      onProgress({stage:'styleDisplay',done:index+1,total:d.primaryTiles.length});
    }
    if(d.thumbnail!==null){
      const encoded=await renderItem(data,d,d.thumbnail,recommendation,onProgress);
      payloads.set(d.thumbnail,encoded.payload);
      meta=replaceItemPropertyWithSource(meta,d.thumbnail,'hvcC',encoded.hvcc);
    }
    const ft=topBox(data,'ftyp'),ftyp=data.slice(ft.off,ft.off+ft.size);
    return {data:rebuildHeic(data,d,ftyp,meta,payloads),rendered:true,changedItems:[...payloads.keys()]};
  }finally{releaseHevcEncoder();}
}
