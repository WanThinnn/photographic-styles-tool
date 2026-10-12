import {styleQuality} from './style-quality.js';
import {styleImageStatistics} from './style-analysis.js';
import {validateSemanticAxes} from './style-semantic-axes.js';
import {inferStyleEmbeddings,releaseStyleRecommender as releaseInference,canRetryStyleOnCpu} from './style-inference.js';
import {recommendStyle} from './style-recommender.js';

const ASSET_ROOT=new URL('../../vendor/ai-style/',import.meta.url);
const AXES_URL=new URL('semantic-axes.json',ASSET_ROOT);
let axesPromise=null;

export class StyleRecommendationError extends Error{
  constructor(message,cause){
    super(message);this.name='StyleRecommendationError';this.code='STYLE_RECOMMENDATION_UNAVAILABLE';this.cause=cause;
  }
}

async function loadAxes(){
  if(!axesPromise)axesPromise=(async()=>{
    const response=await fetch(AXES_URL,{cache:'no-cache'});
    if(!response.ok)throw Error('Suggested Styles semantic axes are not installed');
    return validateSemanticAxes(await response.json());
  })().catch(error=>{axesPromise=null;throw error;});
  return axesPromise;
}

export async function recommendStyleRgb(image,{level='standard',provider='wasm',signal,onProgress=()=>{}}={}){
  try{
    const quality=styleQuality(level);
    onProgress({stage:'styleSemantics'});
    const axes=await loadAxes();
    signal?.throwIfAborted?.();
    let embeddings;
    try{embeddings=await inferStyleEmbeddings(image,{level,provider,signal,onProgress});}
    catch(error){
      if(provider!=='webgpu'||!canRetryStyleOnCpu(error))throw error;
      releaseInference();onProgress({stage:'styleCpuFallback'});
      embeddings=await inferStyleEmbeddings(image,{level,provider:'wasm',signal,onProgress});
    }
    signal?.throwIfAborted?.();
    const statistics=styleImageStatistics(image,{sampleSize:quality.statsSize});
    return recommendStyle({axes,level,embeddings,statistics});
  }catch(error){
    if(error?.name==='AbortError'||error?.name==='TimeoutError'||error instanceof StyleRecommendationError)throw error;
    throw new StyleRecommendationError(String(error?.message||error),error);
  }
}

export function releaseStyleRecommender(){
  releaseInference();axesPromise=null;
}
