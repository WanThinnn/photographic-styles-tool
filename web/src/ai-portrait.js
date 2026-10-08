import {normalizeDisparity,inferenceGeometry} from './ai-portrait-container.js';
import {discoverHeic,dimensionsForItem,irotAngleForItem,imirAxisForItem} from './heif.js';
import {aiSourceCanvas,rgbSample} from './ai-portrait-source.js';

const ASSETS = new URL('../vendor/ai-portrait/',import.meta.url);
export async function createAiPortrait(data,onProgress=()=>{},sourceFile=null) {
  if (!navigator.gpu) throw Error('WEBGPU');
  if (!globalThis.crossOriginIsolated) throw Error('ISOLATION');
  const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw Error('WEBGPU');
  const ort=await import('../vendor/ai-portrait/ort.webgpu.min.mjs');
  ort.env.webgpu.powerPreference='high-performance';
  ort.env.wasm.wasmPaths=ASSETS.href;ort.env.wasm.numThreads=1;
  let session,canvas,outputs,source;
  try {
    onProgress('loading');
    const d=discoverHeic(data),[w,h]=dimensionsForItem(d.props,d.primary);
    // Keep aspect ratio and a multiple of the network patch size. Bounding the
    // longest edge limits mobile GPU allocations without stretching the subject.
    const input=inferenceGeometry(w,h),count=input.width*input.height;
    const orientation={angle:irotAngleForItem(data,d.props,d.primary),mirror:imirAxisForItem(data,d.props,d.primary)};
    const scale=Math.min(1,768/Math.max(w,h)),width=Math.max(2,Math.round(w*scale/2)*2),height=Math.max(2,Math.round(h*scale/2)*2);
    source=await aiSourceCanvas(data,{width,height,...orientation},sourceFile);
    const rgb=rgbSample(source,input.width,input.height),previewRgb=rgbSample(source,width,height);
    source.width=source.height=0;source=null;
    session=await ort.InferenceSession.create(new URL('model.onnx',ASSETS).href,{executionProviders:['webgpu']});
    const tensor=new Float32Array(3*count),mean=[.485,.456,.406],std=[.229,.224,.225];
    for(let p=0;p<count;p++)for(let c=0;c<3;c++)tensor[c*count+p]=(rgb[p*3+c]/255-mean[c])/std[c];
    onProgress('inference');
    outputs=await session.run({[session.inputNames[0]]:new ort.Tensor('float32',tensor,[1,3,input.height,input.width])});
    const output=outputs[session.outputNames[0]],values=await output.getData();
    const map=normalizeDisparity(values),mh=output.dims.at(-2),mw=output.dims.at(-1);
    canvas=document.createElement('canvas');canvas.width=mw;canvas.height=mh;
    const ctx=canvas.getContext('2d'),image=ctx.createImageData(mw,mh);
    for(let i=0;i<map.length;i++){image.data.set([map[i],map[i],map[i],255],i*4);}ctx.putImageData(image,0,0);
    const resized=document.createElement('canvas');resized.width=width;resized.height=height;
    const rctx=resized.getContext('2d',{willReadFrequently:true});rctx.drawImage(canvas,0,0,width,height);
    const rgba=rctx.getImageData(0,0,width,height).data,gray=new Uint8Array(width*height);
    for(let i=0;i<gray.length;i++)gray[i]=rgba[i*4];resized.width=resized.height=0;
    for(const t of Object.values(outputs))t.dispose();outputs=null;
    await session.release();session=null;
    return {gray,width,height,previewRgb,orientation,sourceData:data,sourceFile,sourceWidth:w,sourceHeight:h};
  } finally { if(outputs)for(const t of Object.values(outputs))t.dispose();if(session)await session.release();if(canvas)canvas.width=canvas.height=0;if(source)source.width=source.height=0; }
}
