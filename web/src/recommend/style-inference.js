import {styleViewRects} from './style-analysis.js';
import {styleQuality} from './style-quality.js';
import {styleModelSpec} from './style-model.js';

const makeWorker=()=>new Worker(new URL('./style-inference-worker.js',import.meta.url),{type:'module'});
let retained=null,retainTimer=null;
const RETAIN_MS=90000;

export function shouldRetainStyleWorker({userAgent='',platform='',maxTouchPoints=0}=globalThis.navigator||{}){
  const ios=/iPhone|iPad|iPod/i.test(userAgent)||(platform==='MacIntel'&&maxTouchPoints>1);
  const safari=/Safari/i.test(userAgent)&&!/Chrome|Chromium|CriOS|FxiOS|Edg\/|EdgiOS|OPR\/|Android|Firefox/i.test(userAgent);
  return !(ios||safari);
}
export function canRetryStyleOnCpu(error){
  if(!error||['AbortError','TimeoutError'].includes(error.name))return false;
  return /(out.of.memory|memory allocation failed|no available backend|backend.*found|device.*lost|buffer.*(size|limit|failed)|allocat)/i.test(String(error.message||error));
}

export function releaseStyleRecommender(){
  clearTimeout(retainTimer);retainTimer=null;
  try{retained?.terminate();}catch{}retained=null;
}
function worker(){
  clearTimeout(retainTimer);retainTimer=null;
  retained??=makeWorker();return retained;
}
function keepWarm(){clearTimeout(retainTimer);retainTimer=setTimeout(releaseStyleRecommender,RETAIN_MS);}
function validateEmbeddings(values,expected,dimensions){
  if(!Array.isArray(values)||values.length!==expected)throw Error('Suggested Styles worker returned the wrong view count');
  return values.map(value=>{
    if(!(value instanceof Float32Array)||value.length!==dimensions)throw Error('Suggested Styles worker returned an invalid embedding');
    let norm2=0;for(const item of value){if(!Number.isFinite(item))throw Error('Suggested Styles worker returned non-finite embedding');norm2+=item*item;}
    const norm=Math.sqrt(norm2);if(!Number.isFinite(norm)||Math.abs(norm-1)>1e-3)throw Error('Suggested Styles worker returned an unnormalized embedding');
    return value;
  });
}

export function inferStyleEmbeddings(image,{level='standard',provider='wasm',signal,onProgress=()=>{},workerFactory=worker,timeoutMs=180000}={}){
  try{
    styleQuality(level);
    if(!['wasm','webgpu'].includes(provider))throw new RangeError('Unsupported Suggested Styles provider');
    if(!image||!Number.isInteger(image.width)||!Number.isInteger(image.height)||image.width<1||image.height<1)throw new TypeError('Invalid Suggested Styles image');
    const length=image.data?.length,pixels=image.width*image.height;
    if(length!==pixels*3&&length!==pixels*4)throw new TypeError('Suggested Styles image must contain packed RGB or RGBA pixels');
  }catch(error){return Promise.reject(error);}
  if(signal?.aborted)return Promise.reject(signal.reason||new DOMException('Aborted','AbortError'));
  const views=styleViewRects(image.width,image.height,level);
  const dimensions=styleModelSpec(level).input.embeddingDimensions;
  return new Promise((resolve,reject)=>{
    const current=workerFactory(),persistent=workerFactory===worker;let timer,settled=false;
    const finish=(error,result)=>{
      if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);
      current.onmessage=null;current.onerror=null;
      if(!persistent)try{current.terminate();}catch{}
      if(error){if(persistent)releaseStyleRecommender();reject(error);}else{
        if(persistent){if(shouldRetainStyleWorker())keepWarm();else releaseStyleRecommender();}
        resolve(result);
      }
    };
    const arm=()=>{clearTimeout(timer);timer=setTimeout(()=>finish(new DOMException('Suggested Styles timed out','TimeoutError')),timeoutMs);};arm();
    const cancel=()=>finish(signal.reason||new DOMException('Aborted','AbortError'));
    signal?.addEventListener('abort',cancel,{once:true});
    current.onerror=event=>{event.preventDefault?.();finish(Error('Suggested Styles worker crashed'));};
    current.onmessage=({data})=>{
      if(data.stage){arm();onProgress(data);return;}
      if(data.error){finish(Error(data.error));return;}
      if(data.result){try{finish(null,validateEmbeddings(data.result.embeddings,views.length,dimensions));}catch(error){finish(error);}return;}
    };
    const rgb=image.data instanceof Uint8Array||image.data instanceof Uint8ClampedArray
      ?new Uint8Array(image.data):Uint8Array.from(image.data||[]);
    try{current.postMessage({level,provider,width:image.width,height:image.height,rgb,views},[rgb.buffer]);}
    catch(error){finish(error);}
  });
}
