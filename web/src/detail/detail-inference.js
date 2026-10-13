import {detailModel} from './detail-models.js';

const ROOT=new URL('../../vendor/ai-detail/',import.meta.url);
const makeWorker=()=>new Worker(new URL('./detail-worker.js',import.meta.url),{type:'module'});
const RETAIN_MS=90000;
let retained=null,retainTimer=null;

function fail(message){const error=new Error(message);error.code='AI_DETAIL_UNAVAILABLE';return error;}
function terminate(worker){try{worker?.terminate();}catch{}}
export function releaseDetailWorkers(){
  clearTimeout(retainTimer);retainTimer=null;
  if(retained)for(const worker of retained.workers)terminate(worker);
  retained=null;
}
function acquireRetained(key,count){
  clearTimeout(retainTimer);retainTimer=null;
  if(!retained||retained.key!==key||retained.workers.length!==count){
    releaseDetailWorkers();
    retained={key,workers:Array.from({length:count},()=>makeWorker())};
  }
  return retained.workers;
}
function keepRetainedWarm(){
  clearTimeout(retainTimer);
  retainTimer=setTimeout(releaseDetailWorkers,RETAIN_MS);
}

export function recommendedDetailWorkers(modelId,provider,{hardwareConcurrency=globalThis.navigator?.hardwareConcurrency??1,
  isolated=globalThis.crossOriginIsolated===true,shared=typeof SharedArrayBuffer==='function'}={}){
  const model=detailModel(modelId);
  if(provider!=='webgpu'||!isolated||!shared||hardwareConcurrency<8)return 1;
  const desktopCap=hardwareConcurrency>=12?4:2;
  return Math.max(1,Math.min(desktopCap,model.webgpuWorkers??1));
}

export function recommendedWasmThreads({hardwareConcurrency=globalThis.navigator?.hardwareConcurrency??1,
  isolated=globalThis.crossOriginIsolated===true}={}){
  if(!isolated)return 1;
  return Math.max(1,Math.min(4,hardwareConcurrency-1));
}

function validateInput(image,provider){
  if(!['wasm','webgpu'].includes(provider))throw Error('Invalid AI detail provider');
  if(!image||image.data?.length!==image.width*image.height*4||!Number.isInteger(image.width)||!Number.isInteger(image.height))
    throw Error('Invalid detail input');
}

function singleWorkerInference(image,{modelId,provider,signal,onProgress,workerFactory,timeoutMs,maxTotalMs,wasmThreads,
  worker=null,retainWorker=false}){
 return new Promise((resolve,reject)=>{
   const current=worker||workerFactory();let timer,totalTimer,settled=false;
   const finish=(error,result)=>{
     if(settled)return;settled=true;clearTimeout(timer);clearTimeout(totalTimer);
     signal?.removeEventListener('abort',cancel);
     current.onmessage=null;current.onerror=null;
     if(!retainWorker)terminate(current);
     else if(error)releaseDetailWorkers();
     error?reject(error):resolve(result);
   };
   const cancel=()=>finish(signal.reason||new DOMException('Aborted','AbortError'));
   const arm=()=>{clearTimeout(timer);timer=setTimeout(()=>finish(new DOMException('AI detail stage timed out','TimeoutError')),timeoutMs);};arm();
   totalTimer=setTimeout(()=>finish(new DOMException('AI detail exceeded total time budget','TimeoutError')),maxTotalMs);
   signal?.addEventListener('abort',cancel,{once:true});
   current.onerror=event=>{event.preventDefault?.();finish(fail('AI detail worker crashed'));};
   current.onmessage=({data})=>{
     if(data.stage){arm();onProgress({stage:data.stage,progress:data.progress});return;}
     if(data.error){finish(fail(data.error));return;}
     if(data.result)finish(null,data.result);
   };
   const rgba=new Uint8ClampedArray(image.data);
   try{
     current.postMessage({modelId,provider,width:image.width,height:image.height,rgba,assetRoot:ROOT.href,wasmThreads},[rgba.buffer]);
   }catch(error){finish(error);}
 });
}

function pooledWorkerInference(image,{modelId,provider,signal,onProgress,workerFactory,timeoutMs,maxTotalMs,workerCount,wasmThreads,
  retainedWorkers=null}){
 const model=detailModel(modelId),tile=model.tile,pad=model.overlap,step=tile-2*pad;
 const nx=Math.ceil(image.width/step),ny=Math.ceil(image.height/step),totalTiles=nx*ny;
 const count=Math.max(1,Math.min(workerCount,totalTiles));
 if(count===1)return singleWorkerInference(image,{modelId,provider,signal,onProgress,workerFactory,timeoutMs,maxTotalMs,wasmThreads,
   worker:retainedWorkers?.[0],retainWorker:Boolean(retainedWorkers)});
 return new Promise((resolve,reject)=>{
   const sharedInput=new SharedArrayBuffer(image.data.byteLength),sharedOutput=new SharedArrayBuffer(image.data.byteLength);
   new Uint8ClampedArray(sharedInput).set(image.data);
   const assignments=Array.from({length:count},()=>[]);
   for(let index=0;index<totalTiles;index++)assignments[index%count].push(index);
   const workers=retainedWorkers||assignments.map(()=>workerFactory()),done=Array(count).fill(0);
   const keep=Boolean(retainedWorkers),announced=new Set();let timer,totalTimer,settled=false,completed=0;
   const terminateAll=()=>{for(const worker of workers)terminate(worker);};
   const finish=(error,result)=>{
     if(settled)return;settled=true;clearTimeout(timer);clearTimeout(totalTimer);
     signal?.removeEventListener('abort',cancel);
     for(const worker of workers){worker.onmessage=null;worker.onerror=null;}
     if(!keep)terminateAll();else if(error)releaseDetailWorkers();
     error?reject(error):resolve(result);
   };
   const cancel=()=>finish(signal.reason||new DOMException('Aborted','AbortError'));
   const arm=()=>{clearTimeout(timer);timer=setTimeout(()=>finish(new DOMException('AI detail stage timed out','TimeoutError')),timeoutMs);};arm();
   totalTimer=setTimeout(()=>finish(new DOMException('AI detail exceeded total time budget','TimeoutError')),maxTotalMs);
   signal?.addEventListener('abort',cancel,{once:true});
   workers.forEach((worker,index)=>{
     worker.onerror=event=>{event.preventDefault?.();finish(fail('AI detail worker crashed'));};
     worker.onmessage=({data})=>{
       if(data.error){finish(fail(data.error));return;}
       if(data.stage){
         arm();
         if(data.stage==='inference'&&data.progress){
           done[index]=data.progress.done;
           onProgress({stage:'inference',progress:{done:done.reduce((a,b)=>a+b,0),total:totalTiles},workers:count});
         }else if(!announced.has(data.stage)){
           announced.add(data.stage);onProgress({stage:data.stage,workers:count});
         }
         return;
       }
       if(data.complete&&++completed===count)
         finish(null,{data:new Uint8ClampedArray(sharedOutput),width:image.width,height:image.height});
     };
     try{
       worker.postMessage({modelId,provider,width:image.width,height:image.height,assetRoot:ROOT.href,
         sharedInput,sharedOutput,tileIndices:assignments[index],wasmThreads});
     }catch(error){finish(error);}
   });
 });
}

/**
 * Tile inference with model-aware WebGPU worker pooling. Real browser workers are
 * retained briefly so a second photo can reuse compiled ONNX sessions; injected
 * test workers keep the old one-shot lifecycle.
 */
export function inferDetailTiles(image,{modelId='lite',provider='wasm',signal,onProgress=()=>{},
  workerFactory=makeWorker,timeoutMs=180000,maxTotalMs=300000,workerCount=null,wasmThreads=null}={}){
  let model;
  try{model=detailModel(modelId);validateInput(image,provider);}catch(error){return Promise.reject(error);}
  if(signal?.aborted)return Promise.reject(signal.reason||new DOMException('Aborted','AbortError'));
  const threads=wasmThreads??(provider==='wasm'?recommendedWasmThreads():1);
  const desired=workerCount??recommendedDetailWorkers(modelId,provider);
  const canPool=desired>1&&typeof SharedArrayBuffer==='function'&&(globalThis.crossOriginIsolated===true||workerCount!==null);
  const count=canPool?Math.min(desired,model.webgpuWorkers??1):1;
  const persistent=workerFactory===makeWorker;
  const key=`${modelId}:${provider}:${threads}:${count}`;
  const workers=persistent?acquireRetained(key,count):null;
  const promise=canPool
    ?pooledWorkerInference(image,{modelId,provider,signal,onProgress,workerFactory,timeoutMs,maxTotalMs,
      workerCount:count,wasmThreads:threads,retainedWorkers:workers})
    :singleWorkerInference(image,{modelId,provider,signal,onProgress,workerFactory,timeoutMs,maxTotalMs,
      wasmThreads:threads,worker:workers?.[0],retainWorker:persistent});
  if(!persistent)return promise;
  return promise.then(result=>{keepRetainedWarm();return result;},error=>{releaseDetailWorkers();throw error;});
}
