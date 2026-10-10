// Serialize expensive writes and skip intermediate slider positions. All callers
// await the newest requested write; an older failure cannot swallow newer work.
export function latestSettingsWriter(write){
  let latest,version=0,active=null;
  return value=>{
    latest=value;version++;
    if(!active)active=Promise.resolve().then(async()=>{try{
      let written=0;
      while(written!==version){
        const current=version,value=latest;
        try{await write(value,()=>current===version);}
        catch(error){if(current===version)throw error;}
        written=current;
      }
    }finally{active=null;}});
    return active;
  };
}

// The worker owns source/depth buffers until the result is removed. Focus edits
// never parse/copy large HEIC containers on the UI thread.
export function portraitAssembler(source,depth,template,{signal,workerFactory=()=>new Worker(new URL('./ai-portrait-export-worker.js',import.meta.url),{type:'module'})}={}){
  const worker=workerFactory(),pending=new Map();let next=0,closed=false;
  const dispose=(error=new DOMException('Portrait result released','AbortError'))=>{
    if(closed)return;closed=true;worker.terminate();signal?.removeEventListener('abort',abort);
    for(const call of pending.values()){clearTimeout(call.timer);call.reject(error);}pending.clear();
  };
  const abort=()=>dispose(signal.reason);
  worker.onerror=()=>dispose(Error('Portrait assembly failed'));
  worker.onmessage=({data})=>{const call=pending.get(data.id);if(!call)return;
    pending.delete(data.id);clearTimeout(call.timer);data.error?call.reject(Error(data.error)):call.resolve(data.result);
  };
  const build=settings=>new Promise((resolve,reject)=>{
    if(closed){reject(new DOMException('Portrait result released','AbortError'));return;}
    const id=++next,timer=setTimeout(()=>dispose(Error('Portrait assembly timed out')),120000);
    pending.set(id,{resolve,reject,timer});
    try{worker.postMessage({id,settings});}catch(error){dispose(error);}
  });
  signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted){dispose(signal.reason);return {build,dispose};}
  try{worker.postMessage({source,depth,template},[...new Set([source.buffer,depth.payload.buffer,depth.hvcc.buffer])]);}catch(error){dispose(error);}
  return {build,dispose};
}
