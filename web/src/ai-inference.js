// Termination releases the worker and its GPU session, including hung inference.
export function awaitAiSource(create, signal) {
  if (!signal) return create();
  return new Promise((resolve,reject) => {
    if(signal.aborted){reject(signal.reason);return;}
    let cancelled=false;
    const abort=()=>{cancelled=true;reject(signal.reason);};
    signal.addEventListener('abort',abort,{once:true});
    Promise.resolve().then(create).then(canvas=>{
      signal.removeEventListener('abort',abort);
      if(cancelled)canvas.width=canvas.height=0;else resolve(canvas);
    },error=>{signal.removeEventListener('abort',abort);reject(error);});
  });
}
export function inferDepth(rgb, input, {signal, timeoutMs = 120000, onProgress = () => {}, workerFactory = () => new Worker(new URL('./ai-inference-worker.js',import.meta.url),{type:'module'})} = {}) {
  return new Promise((resolve,reject) => {
    if(signal?.aborted){reject(signal.reason || new DOMException('Cancelled','AbortError'));return;}
    const worker = workerFactory();
    const finish = (error,result) => { clearTimeout(timer);signal?.removeEventListener('abort',abort);worker.terminate();error?reject(error):resolve(result); };
    const abort = () => finish(signal.reason || new DOMException('Cancelled','AbortError'));
    const timer = setTimeout(() => finish(new DOMException('AI timed out','TimeoutError')),timeoutMs);
    signal?.addEventListener('abort',abort,{once:true});
    worker.onerror = () => finish(Error('AI worker failed'));
    worker.onmessage = ({data}) => {if(data.stage)onProgress(data.stage);else finish(data.error?Error(data.error):null,data.result);};
    try { worker.postMessage({rgb,input},[rgb.buffer]); } catch(error) {finish(error);}
  });
}
