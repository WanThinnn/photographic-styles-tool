import {
  discoverHeic,extractItem,propertyBoxBytes,dimensionsForItem,
  replaceItemPropertyWithSource,ispeBox,
} from '../core/heif.js';
import {topBox,metaChildren,findChild,concat} from '../core/box.js';
import {rebuildHeic} from '../styles/graft.js';
import {decodeHevcYuv,decodeHevcLuma,encodeHevcPixels} from '../raster/ffmpeg-hevc.js';
import {hevcSpsColor} from '../raster/hevc-color.js';
import {rgbaToI420,rasterColr} from '../raster/raster-color.js';
import {
  yuv420ToRgba,rebaseGainMapRgba,parseTmapMetadata,encodedToLinear,
} from '../raster/jpeg-hdr.js';
import {encodeSelectedLinearThumbnail} from '../raster/linear-thumbnail.js';
import {enhanceRasterImage,assertDetailRasterAllowed} from './detail-raster.js';

const clamp=value=>Math.max(0,Math.min(1,value));
const linearToSrgb=value=>{value=Math.max(0,value);return clamp(value<=.0031308?12.92*value:1.055*value**(1/2.4)-.055);};
const linearToBt709=value=>{value=Math.max(0,value);return clamp(value<.018?4.5*value:1.099*value**.45-.099);};

export function convertTransferRgba(rgba,from='bt709',to='srgb'){
 if(from===to||(from==='iec61966-2-1'&&to==='srgb')||(from==='srgb'&&to==='iec61966-2-1'))
   return new Uint8ClampedArray(rgba);
 const output=new Uint8ClampedArray(rgba.length);
 for(let p=0;p<rgba.length;p+=4){
  for(let c=0;c<3;c++){
   const linear=encodedToLinear(rgba[p+c]/255,from);
   const encoded=(to==='srgb'||to==='iec61966-2-1')?linearToSrgb(linear)
     :['bt709','smpte170m'].includes(to)?linearToBt709(linear):NaN;
   if(!Number.isFinite(encoded))throw Error('Unsupported HEIC transfer conversion');
   output[p+c]=Math.round(255*encoded);
  }
  output[p+3]=rgba[p+3];
 }
 return output;
}

export function resampleRgba(source,sourceWidth,sourceHeight,width,height){
 if(source.length!==sourceWidth*sourceHeight*4||![sourceWidth,sourceHeight,width,height].every(Number.isInteger)
   ||Math.min(sourceWidth,sourceHeight,width,height)<1)throw Error('Invalid RGBA resample geometry');
 if(sourceWidth===width&&sourceHeight===height)return new Uint8ClampedArray(source);
 const out=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++){
  const sy=Math.max(0,Math.min(sourceHeight-1,(y+.5)*sourceHeight/height-.5));
  const y0=Math.floor(sy),y1=Math.min(sourceHeight-1,y0+1),fy=sy-y0;
  for(let x=0;x<width;x++){
   const sx=Math.max(0,Math.min(sourceWidth-1,(x+.5)*sourceWidth/width-.5));
   const x0=Math.floor(sx),x1=Math.min(sourceWidth-1,x0+1),fx=sx-x0,p=(y*width+x)*4;
   for(let c=0;c<4;c++){
    const a=source[(y0*sourceWidth+x0)*4+c],b=source[(y0*sourceWidth+x1)*4+c];
    const d=source[(y1*sourceWidth+x0)*4+c],e=source[(y1*sourceWidth+x1)*4+c];
    out[p+c]=Math.round((a+(b-a)*fx)*(1-fy)+(d+(e-d)*fx)*fy);
   }
  }
 }
 return out;
}

function hvccRecord(data,d,iid){
 const property=propertyBoxBytes(data,d.props,iid,'hvcC');
 if(!property)throw Error(`HEIC item ${iid} has no hvcC`);
 const b=topBox(property,'hvcC');
 return property.subarray(b.off+b.hdr,b.off+b.size);
}
function colorFromRecord(record,{allowMonochrome=false}={}){
 const sps=hevcSpsColor(record);
 if(sps.luma!==8||sps.chromaDepth!==8||![1,...(allowMonochrome?[0]:[])].includes(sps.chroma))
  throw Error('AI HDR requires native Main8 4:2:0 primary or monochrome gain tiles');
 const primaries={1:'bt709',2:'unspecified',12:'smpte432'}[sps.primaries];
 const transfer={1:'bt709',2:'unspecified',6:'smpte170m',13:'iec61966-2-1'}[sps.transfer];
 const matrix={1:'bt709',2:'unspecified',5:'bt470bg',6:'smpte170m'}[sps.matrix];
 if(!primaries||!transfer||!matrix||!sps.video||typeof sps.fullRange!=='boolean')
  throw Error('Unsupported native HEIC colour signalling for AI detail');
 if(sps.chroma===1&&[primaries,transfer,matrix].includes('unspecified'))
  throw Error('AI HDR primary/gain RGB colour signalling is ambiguous');
 return {primaries,transfer,matrix,fullRange:sps.fullRange,chroma:sps.chroma,sps};
}
function sameColor(a,b){
 return ['primaries','transfer','matrix','fullRange','chroma'].every(key=>a[key]===b[key]);
}
async function decodeGrid(data,d,gridId,tileIds,onProgress,stage,{allowMonochrome=false}={}){
 if(!tileIds.length)throw Error(`${stage} grid has no tiles`);
 const [width,height]=dimensionsForItem(d.props,gridId),[tileWidth,tileHeight]=dimensionsForItem(d.props,tileIds[0]);
 if(![width,height,tileWidth,tileHeight].every(n=>Number.isInteger(n)&&n>0&&n%2===0))
  throw Error(`Invalid ${stage} grid geometry`);
 const columns=Math.ceil(width/tileWidth),rows=Math.ceil(height/tileHeight);
 if(columns*rows!==tileIds.length)throw Error(`${stage} grid layout does not match dimg tiles`);
 const firstRecord=hvccRecord(data,d,tileIds[0]),color=colorFromRecord(firstRecord,{allowMonochrome});
 const rgba=new Uint8ClampedArray(width*height*4);
 for(let i=0;i<tileIds.length;i++){
  const iid=tileIds[i],[tw,th]=dimensionsForItem(d.props,iid);
  if(tw!==tileWidth||th!==tileHeight)throw Error(`${stage} tile dimensions differ`);
  const record=hvccRecord(data,d,iid),tileColor=colorFromRecord(record,{allowMonochrome});
  if(!sameColor(color,tileColor))throw Error(`${stage} tile colour descriptions differ`);
  let tile;
  if(color.chroma===0){
   const decoded=await decodeHevcLuma(record,extractItem(data,d.iloc,iid),{width:tw,height:th},onProgress);
   tile=new Uint8ClampedArray(tw*th*4);
   for(let p=0;p<decoded.bytes.length;p++){
    const q=p*4,value=decoded.bytes[p];tile[q]=tile[q+1]=tile[q+2]=value;tile[q+3]=255;
   }
  }else{
   const decoded=await decodeHevcYuv(record,extractItem(data,d.iloc,iid),{width:tw,height:th},onProgress);
   tile=yuv420ToRgba(decoded,tw,th,{matrix:color.matrix,fullRange:color.fullRange});
  }
  const col=i%columns,row=Math.floor(i/columns),copyWidth=Math.min(tw,width-col*tw),copyHeight=Math.min(th,height-row*th);
  for(let y=0;y<copyHeight;y++){
   const from=y*tw*4,to=((row*th+y)*width+col*tw)*4;
   rgba.set(tile.subarray(from,from+copyWidth*4),to);
  }
  onProgress?.({stage,done:i+1,total:tileIds.length});
 }
 return {rgba,width,height,tileWidth,tileHeight,columns,rows,color};
}
function modelCanvas(rgba,width,height,colorSpace){
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d',{alpha:false,willReadFrequently:true,colorSpace});
 if(!ctx)throw Error('Native HDR AI canvas unavailable');
 const actual=ctx.getContextAttributes?.().colorSpace;
 if(actual&&actual!==colorSpace)throw Error(`Native HDR AI canvas lost ${colorSpace}`);
 let pixels;try{pixels=new ImageData(rgba,width,height,{colorSpace});}
 catch(error){if(colorSpace!=='srgb')throw Error('Display P3 ImageData unavailable');pixels=new ImageData(rgba,width,height);}
 ctx.putImageData(pixels,0,0);return canvas;
}
function sampleCanvas(canvas,width,height,color){
 const colorSpace=color.primaries==='smpte432'?'display-p3':'srgb',tmp=document.createElement('canvas');
 tmp.width=width;tmp.height=height;
 const ctx=tmp.getContext('2d',{alpha:false,willReadFrequently:true,colorSpace});
 if(!ctx)throw Error('Native HDR sampling canvas unavailable');
 ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(canvas,0,0,width,height);
 const pixels=ctx.getImageData(0,0,width,height,{colorSpace});
 const srgb=new Uint8ClampedArray(pixels.data);tmp.width=tmp.height=0;
 return convertTransferRgba(srgb,'srgb',color.transfer);
}
function tileRgba(source,width,height,column,row,tileWidth,tileHeight){
 const out=new Uint8ClampedArray(tileWidth*tileHeight*4);
 for(let i=3;i<out.length;i+=4)out[i]=255;
 const x=column*tileWidth,y=row*tileHeight,copyWidth=Math.max(0,Math.min(tileWidth,width-x)),copyHeight=Math.max(0,Math.min(tileHeight,height-y));
 for(let line=0;line<copyHeight;line++){
  const from=((y+line)*width+x)*4,to=line*tileWidth*4;
  out.set(source.subarray(from,from+copyWidth*4),to);
 }
 return out;
}
function expectedSps(color){
 return {primaries:{bt709:1,unspecified:2,smpte432:12}[color.primaries],
  transfer:{bt709:1,unspecified:2,smpte170m:6,'iec61966-2-1':13}[color.transfer],
  matrix:{bt709:1,unspecified:2,bt470bg:5,smpte170m:6}[color.matrix],fullRange:color.fullRange,chroma:color.chroma};
}
function verifyEncoded(encoded,color){
 const expected=expectedSps(color);
 const keys=color.chroma===0?['fullRange','chroma']:['primaries','transfer','matrix','fullRange','chroma'];
 for(const key of keys)
  if(encoded.sps?.[key]!==expected[key])throw Error(`AI HEIC encoder changed ${key}: ${encoded.sps?.[key]} (expected ${expected[key]})`);
 if(encoded.sps?.luma!==8||encoded.sps?.chromaDepth!==8)throw Error('AI HEIC encoder changed bit depth');
 // A monochrome gain map is numerical data. Primaries/transfer/matrix do not
 // alter decoded gray Y samples; retain the source colr/item metadata and
 // require only Main8 monochrome + exact full/limited range from the codec.
}
async function encodeGrid(rgba,layout,onProgress,stage){
 const {width,height,tileWidth,tileHeight,columns,rows,color}=layout,payloads=[],hvcc=[];
 for(let i=0;i<columns*rows;i++){
  const tile=tileRgba(rgba,width,height,i%columns,Math.floor(i/columns),tileWidth,tileHeight);
  let pixels,pixelFormat;
  if(color.chroma===0){
   pixels=new Uint8Array(tileWidth*tileHeight);
   for(let p=0;p<pixels.length;p++)pixels[p]=tile[p*4];
   pixelFormat='gray';
  }else{pixels=rgbaToI420(tile,tileWidth,tileHeight,color);pixelFormat='yuv420p';}
  const encoded=await encodeHevcPixels(pixels,{width:tileWidth,height:tileHeight,pixelFormat,...color},onProgress);
  verifyEncoded(encoded,color);payloads.push(encoded.payload);hvcc.push(encoded.hvcc);
  onProgress?.({stage,done:i+1,total:columns*rows});
 }
 return {payloads,hvcc};
}
function itemData(data,d,iid){
 const item=d.iloc.items.get(iid);
 if(!item)throw Error(`No HEIC item ${iid}`);
 if(item.constructionMethod===0)return extractItem(data,d.iloc,iid);
 if(item.constructionMethod!==1)throw Error(`Unsupported HEIC item construction method ${item.constructionMethod}`);
 const idat=findChild(metaChildren(data,d.meta),'idat');
 if(!idat)throw Error('HEIC idat box missing');
 return concat(item.extents.map(extent=>{
  const start=idat.off+idat.hdr+item.baseOffset+extent.offset,end=start+extent.length;
  if(start<idat.off+idat.hdr||end>idat.off+idat.size)throw Error(`HEIC item ${iid} exceeds idat`);
  return data.slice(start,end);
 }));
}
function findTmap(data,d){
 const entries=[...d.infos].filter(([,info])=>info.type==='tmap');
 for(const [iid] of entries){
  const inputs=d.refs.find(ref=>ref.type==='dimg'&&ref.from===iid)?.to;
  if(inputs?.length===2&&inputs[0]===d.primary&&inputs[1]===d.hdrGrid)
   return {iid,metadata:parseTmapMetadata(itemData(data,d,iid))};
 }
 throw Error('Native HDR has no supported ISO 21496-1 tmap relation');
}

/**
 * Preprocess a native HDR HEIC before Styles/Texture/Portrait processing.
 * Only primary, HDR gain-map, thumbnail and linear-thumbnail payloads may change.
 */
export async function enhanceNativeHdrHeic(data,detail,{onProgress=()=>{}}={}){
 const d=discoverHeic(data);
 if(d.hdrGrid===null||!d.hdrTiles.length)throw Error('Native HEIC has no HDR gain map');
 const [primaryWidth,primaryHeight]=dimensionsForItem(d.props,d.primary);
 assertDetailRasterAllowed(primaryWidth,primaryHeight);
 const tmap=findTmap(data,d);
 if(!(tmap.metadata.baseHeadroom<tmap.metadata.alternateHeadroom)||!tmap.metadata.useBaseColorSpace)
  throw Error('Unsupported native HDR gain-map direction/application space');
 const primary=await decodeGrid(data,d,d.primary,d.primaryTiles,onProgress,'hdrPrimaryDecode');
 const gain=await decodeGrid(data,d,d.hdrGrid,d.hdrTiles,onProgress,'hdrGainDecode',{allowMonochrome:true});
 const colorSpace=primary.color.primaries==='smpte432'?'display-p3':'srgb';
 const modelInput=convertTransferRgba(primary.rgba,primary.color.transfer,'srgb');
 let sourceCanvas=modelCanvas(modelInput,primary.width,primary.height,colorSpace),enhanced;
 try{
  enhanced=await enhanceRasterImage(sourceCanvas,{...detail,onProgress,colorSpace});
  const restored=sampleCanvas(enhanced,primary.width,primary.height,primary.color);
  const originalAtGain=resampleRgba(primary.rgba,primary.width,primary.height,gain.width,gain.height);
  const restoredAtGain=resampleRgba(restored,primary.width,primary.height,gain.width,gain.height);
  const rebase=rebaseGainMapRgba(originalAtGain,restoredAtGain,gain.rgba,tmap.metadata,{transfer:primary.color.transfer});
  const clippedRatio=rebase.components?rebase.clipped/rebase.components:0;
  if(clippedRatio>.02)throw Error(`Native HDR gain-map range exceeded at ${(100*clippedRatio).toFixed(2)}% of components`);
  const primaryEncoded=await encodeGrid(restored,primary,onProgress,'hdrPrimaryEncode');
  const gainEncoded=await encodeGrid(rebase.rgba,gain,onProgress,'hdrGainEncode');
  let meta=data.slice(d.meta.off,d.meta.off+d.meta.size),payloads=new Map();
  d.primaryTiles.forEach((iid,i)=>{
   payloads.set(iid,primaryEncoded.payloads[i]);
   meta=replaceItemPropertyWithSource(meta,iid,'hvcC',primaryEncoded.hvcc[i]);
  });
  d.hdrTiles.forEach((iid,i)=>{
   payloads.set(iid,gainEncoded.payloads[i]);
   meta=replaceItemPropertyWithSource(meta,iid,'hvcC',gainEncoded.hvcc[i]);
  });
  if(d.thumbnail!==null){
   const [tw,th]=dimensionsForItem(d.props,d.thumbnail),thumbColor=primary.color;
   const thumbRgba=sampleCanvas(enhanced,tw,th,thumbColor),yuv=rgbaToI420(thumbRgba,tw,th,thumbColor);
   const encoded=await encodeHevcPixels(yuv,{width:tw,height:th,pixelFormat:'yuv420p',...thumbColor},onProgress);
   verifyEncoded(encoded,thumbColor);payloads.set(d.thumbnail,encoded.payload);
   meta=replaceItemPropertyWithSource(meta,d.thumbnail,'hvcC',encoded.hvcc);
   meta=replaceItemPropertyWithSource(meta,d.thumbnail,'colr',rasterColr(thumbColor));
  }
  if(d.linearThumb!==null){
   const record=hvccRecord(data,d,d.linearThumb),sps=hevcSpsColor(record),bitDepth=sps.luma===10?10:8;
   const linear=await encodeSelectedLinearThumbnail(enhanced,{bitDepth,angle:0},onProgress);
   payloads.set(d.linearThumb,linear.payload);
   meta=replaceItemPropertyWithSource(meta,d.linearThumb,'hvcC',linear.hvcc);
   meta=replaceItemPropertyWithSource(meta,d.linearThumb,'ispe',ispeBox(linear.width,linear.height));
   meta=replaceItemPropertyWithSource(meta,d.linearThumb,'pixi',linear.pixi);
   meta=replaceItemPropertyWithSource(meta,d.linearThumb,'colr',linear.colr);
  }
  const ft=topBox(data,'ftyp'),result=rebuildHeic(data,d,data.slice(ft.off,ft.off+ft.size),meta,payloads);
  return {data:result,detailApplied:true,hdr:true,
    stats:{clipped:rebase.clipped,components:rebase.components,maxError:rebase.maxError,
      changedItems:[...payloads.keys()]}};
 }finally{
  sourceCanvas.width=sourceCanvas.height=0;
  if(enhanced)enhanced.width=enhanced.height=0;
 }
}
