import {inferDetailTiles} from './detail-inference.js';
import {enhanceDetail} from './detail-processing.js';

// Explicitly fail before allocating full 24/48 MP RGBA + model tensor on Safari.
// A future tiled-session implementation can lift this limit without downscaling.
export const MAX_DETAIL_PIXELS=12_500_000;
export function assertDetailRasterAllowed(width,height,{hdr=false}={}){
 if(hdr)throw Error('AI detail enhancement of HDR requires gain-map-safe re-encoding');
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||
   width*height>MAX_DETAIL_PIXELS)throw Error('AI detail memory limit exceeded; original photo preserved');
}
/**
 * Opt-in SDR pixel stage, before existing raster HEVC assembly.
 * Never mutates the decoded original, HEIF metadata, EXIF or auxiliary items.
 * Caller MUST dispose result canvas in finally.
 */
export async function enhanceRasterImage(image,{modelId='standard',provider='wasm',signal,onProgress=()=>{},
 infer=inferDetailTiles}={}){
 const {width,height}=image;
 assertDetailRasterAllowed(width,height);
 signal?.throwIfAborted?.();
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 try{
   const ctx=canvas.getContext('2d',{colorSpace:'srgb',willReadFrequently:true,alpha:false});
   if(!ctx)throw Error('AI detail canvas unavailable');
   ctx.drawImage(image,0,0,width,height);
   const source=ctx.getImageData(0,0,width,height,{colorSpace:'srgb'});
   if(source.colorSpace&&source.colorSpace!=='srgb')throw Error('AI detail requires colour-managed sRGB');
   const restored=await infer(source,{modelId,provider,signal,onProgress});
   signal?.throwIfAborted?.();
   if(restored?.data?.length!==source.data.length||restored.width!==width||restored.height!==height)
     throw Error('AI detail returned incompatible dimensions');
   // Edge-aware finishing stays conservative after learned restoration.
   const processed=enhanceDetail(restored,{preset:'natural',strength:35,signal});
   ctx.putImageData(new ImageData(processed.data,width,height),0,0);
   return canvas;
 }catch(error){canvas.width=canvas.height=0;throw error;}
}
