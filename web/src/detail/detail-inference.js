import {detailModel,validateDetailAsset} from './detail-models.js';
const ROOT=new URL('../../vendor/ai-detail/',import.meta.url);
function fail(message){const error=new Error(message);error.code='AI_DETAIL_UNAVAILABLE';return error;}
/** Single session per invocation, transferable tensors, cancel by worker termination. */
export function inferDetailTiles(image,{modelId='standard',provider='wasm',signal,onProgress=()=>{},
  workerFactory=()=>new Worker(new URL('./detail-worker.js',import.meta.url),{type:'module'}),timeoutMs=180000,maxTotalMs=300000}={}){
  try { detailModel(modelId); } catch (error) { return Promise.reject(error); }
  if(!['wasm','webgpu'].includes(provider))return Promise.reject(Error('Invalid AI detail provider'));
  if(!image||image.data?.length!==image.width*image.height*4||!Number.isInteger(image.width)||!Number.isInteger(image.height))
    return Promise.reject(Error('Invalid detail input'));
  if(signal?.aborted)return Promise.reject(signal.reason||new DOMException('Aborted','AbortError'));
  return new Promise((resolve,reject)=>{
    const worker=workerFactory();let timer,totalTimer,settled=false;
    const finish=(error,result)=>{
      if(settled)return;settled=true;clearTimeout(timer);clearTimeout(totalTimer);
      signal?.removeEventListener('abort',cancel);worker.terminate();
      error?reject(error):resolve(result);
    };
    const cancel=()=>finish(signal.reason||new DOMException('Aborted','AbortError'));
    const arm=()=>{clearTimeout(timer);timer=setTimeout(()=>finish(new DOMException('AI detail stage timed out','TimeoutError')),timeoutMs);};arm();
    totalTimer=setTimeout(()=>finish(new DOMException('AI detail exceeded total time budget','TimeoutError')),maxTotalMs);
    signal?.addEventListener('abort',cancel,{once:true});
    worker.onerror=event=>{event.preventDefault?.();finish(fail('AI detail worker crashed'));};
    worker.onmessage=({data})=>{
      if(data.stage){arm();onProgress(data.stage,data.progress);return;}
      if(data.error){finish(fail(data.error));return;}
      if(data.result)finish(null,data.result);
    };
    const rgba=new Uint8ClampedArray(image.data);
    try { worker.postMessage({modelId,provider,width:image.width,height:image.height,rgba,assetRoot:ROOT.href},[rgba.buffer]); }
    catch(error){finish(error);}
  });
}
