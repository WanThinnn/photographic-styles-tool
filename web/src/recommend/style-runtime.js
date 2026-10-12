import {styleQuality} from './style-quality.js';
import {styleImageStatistics} from './style-analysis.js';
import {validateStylePrototypes} from './style-prototypes.js';
import {inferStyleEmbeddings,releaseStyleRecommender as releaseInference,canRetryStyleOnCpu} from './style-inference.js';
import {recommendStyle} from './style-recommender.js';

const ASSET_ROOT=new URL('../../vendor/ai-style/',import.meta.url);
const prototypePromises=new Map();

export class StyleRecommendationError extends Error{
  constructor(message,cause){
    super(message);this.name='StyleRecommendationError';this.code='STYLE_RECOMMENDATION_UNAVAILABLE';this.cause=cause;
  }
}

async function loadPrototypes(level){
  if(!prototypePromises.has(level))prototypePromises.set(level,(async()=>{
    const response=await fetch(new URL(`style-prototypes-${level}.json`,ASSET_ROOT),{cache:'no-cache'});
    if(!response.ok)throw Error(`Suggested Styles ${level} prototypes are not installed`);
    return validateStylePrototypes(await response.json(),level);
  })().catch(error=>{prototypePromises.delete(level);throw error;}));
  return prototypePromises.get(level);
}

export async function recommendStyleRgb(image,{level='standard',provider='wasm',signal,onProgress=()=>{}}={}){
  try{
    const quality=styleQuality(level);
    onProgress({stage:'styleSemantics'});
    const prototypes=await loadPrototypes(level);
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
    return recommendStyle({prototypes,level,embeddings,statistics});
  }catch(error){
    if(error?.name==='AbortError'||error?.name==='TimeoutError'||error instanceof StyleRecommendationError)throw error;
    throw new StyleRecommendationError(String(error?.message||error),error);
  }
}

export function releaseStyleRecommender(){
  releaseInference();prototypePromises.clear();
}
