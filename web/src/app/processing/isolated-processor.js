// Independent JS realm for the opt-in second lane. The existing encoders,
// decoders and AI runtimes own singleton workers; sharing them between photos
// would let one job's cleanup terminate another job. Files stay on this origin.
export function createIsolatedProcessor(dependencies,{doc=globalThis.document,timeoutMs=20000}={}){
  let frame,ready;
  function load(){
    if(ready)return ready;
    ready=new Promise((resolve,reject)=>{
      frame=doc.createElement('iframe');
      frame.className='processing-lane';frame.tabIndex=-1;frame.setAttribute('aria-hidden','true');
      frame.title='Photo processing';
      const timer=setTimeout(()=>fail(Error('Parallel processing could not start')),timeoutMs);
      function fail(error){clearTimeout(timer);frame?.remove();frame=null;ready=null;reject(error);}
      frame.addEventListener('error',()=>fail(Error('Parallel processing unavailable')),{once:true});
      frame.addEventListener('load',()=>{
        try{
          const runtime=frame.contentWindow.stylioProcessingLane;
          if(!runtime)throw Error('Parallel processing runtime unavailable');
          const processor=runtime.create(dependencies);
          clearTimeout(timer);resolve({processor,runtime});
        }catch(error){fail(error);}
      },{once:true});
      frame.src=new URL('../../../processing-lane.html',import.meta.url).href;
      doc.body.append(frame);
    });
    return ready;
  }
  return {
    async handleFile(file,ui){const {processor}=await load();return processor.handleFile(file,ui);},
    async releaseResources(){if(ready)await (await ready).runtime.releaseResources();},
    dispose(){frame?.remove();frame=null;ready=null;},
  };
}
