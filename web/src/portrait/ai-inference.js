// Termination releases the worker and its GPU session, including hung inference.
// A WebKit process termination bypasses catch/fallback entirely. Start within
// the original mobile budget instead of probing larger allocations on Safari.
export function depthInputBudgets({userAgent='',platform='',maxTouchPoints=0}=globalThis.navigator||{}){
  const ios=/iPhone|iPad|iPod/i.test(userAgent)||(platform==='MacIntel'&&maxTouchPoints>1);
  const safari=/Safari/i.test(userAgent)&&!/Chrome|Chromium|Edg\/|OPR\/|Android|Firefox/i.test(userAgent);
  return ios||safari?[518]:[1036,770,518];
}
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
export function inferDepth(rgb, input, {signal, guidance,timeoutMs = 120000, onProgress = () => {}, workerFactory = () => new Worker(new URL('./ai-inference-worker.js',import.meta.url),{type:'module'})} = {}) {
  return new Promise((resolve,reject) => {
    if(signal?.aborted){reject(signal.reason || new DOMException('Cancelled','AbortError'));return;}
    const worker = workerFactory();let settled=false;
    const finish = (error,result) => { if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);worker.terminate();error?reject(error):resolve(result); };
    const abort = () => finish(signal.reason || new DOMException('Cancelled','AbortError'));
    let timer;
    const arm=()=>{clearTimeout(timer);timer=setTimeout(() => finish(new DOMException('AI timed out','TimeoutError')),timeoutMs);};arm();
    signal?.addEventListener('abort',abort,{once:true});
    worker.onerror = () => finish(Error('AI worker failed'));
    worker.onmessage = ({data}) => {
      if(data.stage){if(data.stage==='download')clearTimeout(timer);else arm();onProgress(data.stage,data.progress);}
      else finish(data.error?Error(data.error):null,data.result);
    };
    try { worker.postMessage({rgb,input,guidance},[rgb.buffer]); } catch(error) {finish(error);}
  });
}
