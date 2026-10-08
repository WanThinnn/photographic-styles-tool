import {normalizeDisparity,inferenceGeometry} from './ai-portrait-container.js';
import {discoverHeic,dimensionsForItem,irotAngleForItem,imirAxisForItem} from './heif.js';
import {aiSourceCanvas,rgbSample} from './ai-portrait-source.js';
import {inferDepth,awaitAiSource} from './ai-inference.js';

export async function createAiPortrait(data,onProgress=()=>{},sourceFile=null,{signal}={}) {
  if (!navigator.gpu) throw Error('WEBGPU');
  if (!globalThis.crossOriginIsolated) throw Error('ISOLATION');
  let canvas,source;
  try {
    onProgress('loading');
    const d=discoverHeic(data),[w,h]=dimensionsForItem(d.props,d.primary);
    // Keep aspect ratio and a multiple of the network patch size. Bounding the
    // longest edge limits mobile GPU allocations without stretching the subject.
    const input=inferenceGeometry(w,h);
    const orientation={angle:irotAngleForItem(data,d.props,d.primary),mirror:imirAxisForItem(data,d.props,d.primary)};
    const scale=Math.min(1,768/Math.max(w,h)),width=Math.max(2,Math.round(w*scale/2)*2),height=Math.max(2,Math.round(h*scale/2)*2);
    source=await awaitAiSource(()=>aiSourceCanvas(data,{width,height,...orientation},sourceFile),signal);
    signal?.throwIfAborted();
    const rgb=rgbSample(source,input.width,input.height),previewRgb=rgbSample(source,width,height);
    source.width=source.height=0;source=null;
    const {values,mh,mw}=await inferDepth(rgb,input,{signal,onProgress});
    const map=normalizeDisparity(values);
    canvas=document.createElement('canvas');canvas.width=mw;canvas.height=mh;
    const ctx=canvas.getContext('2d'),image=ctx.createImageData(mw,mh);
    for(let i=0;i<map.length;i++){image.data.set([map[i],map[i],map[i],255],i*4);}ctx.putImageData(image,0,0);
    const resized=document.createElement('canvas');resized.width=width;resized.height=height;
    const rctx=resized.getContext('2d',{willReadFrequently:true});rctx.drawImage(canvas,0,0,width,height);
    const rgba=rctx.getImageData(0,0,width,height).data,gray=new Uint8Array(width*height);
    for(let i=0;i<gray.length;i++)gray[i]=rgba[i*4];resized.width=resized.height=0;
    return {gray,width,height,previewRgb,orientation,sourceData:data,sourceFile,sourceWidth:w,sourceHeight:h};
  } finally { if(canvas)canvas.width=canvas.height=0;if(source)source.width=source.height=0; }
}
