import {inferenceGeometry} from './ai-portrait-container.js';
import {refineDepth} from './ai-depth-refinement.js';
import {discoverHeic,dimensionsForItem} from '../core/heif.js';
import {itemOrientation} from '../raster/heif.js';
import {aiSourceCanvas,rgbSample} from './ai-portrait-source.js';
import {inferDepth,awaitAiSource,depthInputBudgets,canRetryDepth} from './ai-inference.js';
import {readPersonGuidance} from './person-depth-guidance.js';

export async function createAiPortrait(data,onProgress=()=>{},sourceFile=null,{signal,provider='webgpu'}={}) {
  if (provider==='webgpu'&&!navigator.gpu) throw Error('WEBGPU');
  if (!globalThis.crossOriginIsolated) throw Error('ISOLATION');
  let source;
  try {
    onProgress('loading');
    const d=discoverHeic(data),[w,h]=dimensionsForItem(d.props,d.primary);
    // Keep aspect ratio and a multiple of the network patch size. Bounding the
    // longest edge limits mobile GPU allocations without stretching the subject.
    const budgets=depthInputBudgets(navigator,provider),input=inferenceGeometry(w,h,budgets[0]);
    const orientation=itemOrientation(data,d.props,d.primary);
    const scale=Math.min(1,1024/Math.max(w,h)),width=Math.max(2,Math.round(w*scale/2)*2),height=Math.max(2,Math.round(h*scale/2)*2);
    // Decode real primary pixels at model resolution, rather than enlarging
    // the old preview and passing invented detail to the depth model.
    source=await awaitAiSource(()=>aiSourceCanvas(data,{width:Math.max(input.width,width),height:Math.max(input.height,height),...orientation},sourceFile),signal);
    signal?.throwIfAborted();
    const previewRgb=rgbSample(source,width,height);let inferred,used,person=null;
    try{person=await readPersonGuidance(data,width,height);}catch(error){console.warn('Optional person guidance unavailable',error);}
    signal?.throwIfAborted();
    for(const edge of budgets){
      used=inferenceGeometry(w,h,edge);
      try{inferred=await inferDepth(rgbSample(source,used.width,used.height),used,{signal,provider,onProgress,guidance:{rgb:previewRgb,person,width,height}});break;}
      catch(error){
        signal?.throwIfAborted();
        if(edge===budgets.at(-1)||!canRetryDepth(error))throw error;
        onProgress('qualityFallback');
      }
    }
    // Custom providers may return float values. The production worker refines
    // the map off the UI thread and quantizes only after guided resampling.
    const gray=inferred.gray||refineDepth(inferred.values,inferred.mw,inferred.mh,previewRgb,width,height);
    return {gray,width,height,previewRgb,orientation,sourceData:data,sourceFile,sourceWidth:w,sourceHeight:h,inferenceWidth:used.width,inferenceHeight:used.height,provider};
  } finally { if(source)source.width=source.height=0; }
}
