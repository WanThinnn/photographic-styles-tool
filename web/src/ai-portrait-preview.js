import {createBokehRenderer} from './ai-bokeh.js';
import {displayPointToStored} from './raster/heif.js';
// Preview only. Export keeps the unblurred primary and editable Portrait depth.
export function portraitPreview(result,host,strings,onSettings,{onPending=()=>{}}={}){
  const {width:w,height:h,gray,previewRgb:rgb,orientation:{angle,mirror}}=result;
  let renderer=null;
  const ensureRenderer=()=>{
    if(renderer)return renderer;
    const source=document.createElement('canvas');source.width=w;source.height=h;
    try{
      const ctx=source.getContext('2d'),pixels=ctx.createImageData(w,h);
      for(let i=0;i<gray.length;i++){const p=i*4,k=i*3;pixels.data[p]=rgb[k];pixels.data[p+1]=rgb[k+1];pixels.data[p+2]=rgb[k+2];pixels.data[p+3]=255;}
      ctx.putImageData(pixels,0,0);renderer=createBokehRenderer(source,gray,w,h,{angle,mirror});return renderer;
    }finally{source.width=source.height=0;}
  };
  const releaseRenderer=()=>{renderer?.close();renderer=null;};
  const view=document.createElement('canvas'),swap=angle===90||angle===270;
  view.width=swap?h:w;view.height=swap?w:h;view.className='ai-preview';
  const frame=document.createElement('button');frame.type='button';frame.className='ai-preview-frame';frame.setAttribute('aria-label',strings.focusKeyboard||strings.focus);
  const marker=document.createElement('span');marker.className='ai-focus-marker';marker.hidden=true;marker.setAttribute('aria-hidden','true');frame.append(view,marker);
  const blur=document.createElement('input');blur.type='range';blur.min='0';blur.max='20';blur.value='8';
  const label=document.createElement('label');label.textContent=strings.blur;label.append(blur);
  const instruction=document.createElement('p');instruction.className='live-note';instruction.textContent=strings.focus;
  const reset=document.createElement('button');reset.type='button';reset.className='ai-reset';reset.textContent=strings.reset;
  const state=document.createElement('p');state.className='ai-preview-state';state.setAttribute('role','status');
  host.append(instruction,frame,label,reset,state);
  let x=.5,y=.5,displayX=.5,displayY=.5,pending=null,timer=null,version=0,disposed=false,lastCommitted=0,inFlight=null;
  const settings=()=>({focusX:x,focusY:y,aperture:Math.max(1.4,Math.min(16,4.5*2**((8-Number(blur.value))/5)))});
  const draw=()=>{
    const focus=gray[Math.min(h-1,Math.floor(y*h))*w+Math.min(w-1,Math.floor(x*w))];
    const active=ensureRenderer();active.draw({focus,blur:Number(blur.value)});view.getContext('2d').drawImage(active.canvas,0,0);
  };
  const commit=()=>{
    clearTimeout(timer);timer=null;
    if(disposed||lastCommitted===version)return inFlight||Promise.resolve();
    const current=version,chosen=settings();lastCommitted=current;
    inFlight=Promise.resolve().then(()=>onSettings(chosen,()=>!disposed&&version===current)).then(()=>{
      if(!disposed&&version===current){state.textContent='';onPending(false);}
    }).catch(error=>{
      console.warn('Portrait settings update failed',error);
      if(!disposed&&version===current){state.textContent=strings.updateFailed;lastCommitted=0;}
    });
    return inFlight;
  };
  const changed=()=>{
    version++;onPending(true);state.textContent=strings.updating;
    marker.hidden=false;marker.style.left=`${displayX*100}%`;marker.style.top=`${displayY*100}%`;
    if(pending!==null)cancelAnimationFrame(pending);
    pending=requestAnimationFrame(()=>{pending=null;try{draw();}catch(error){console.warn('Preview unavailable',error);state.textContent=strings.previewFailed;}});
    clearTimeout(timer);timer=setTimeout(commit,220);
  };
  const focus=(a,b)=>{
    displayX=Math.max(0,Math.min(1,a));displayY=Math.max(0,Math.min(1,b));
    const point=displayPointToStored(displayX,displayY,angle,mirror);x=point.x;y=point.y;changed();
  };
  frame.addEventListener('click',e=>{const r=view.getBoundingClientRect(),keyboard=e.detail===0&&e.target===frame;
    focus(keyboard?.5:(e.clientX-r.left)/r.width,keyboard?.5:(e.clientY-r.top)/r.height);});
  frame.addEventListener('keydown',e=>{
    const delta={ArrowLeft:[-.025,0],ArrowRight:[.025,0],ArrowUp:[0,-.025],ArrowDown:[0,.025]}[e.key];
    if(delta){e.preventDefault();focus(displayX+delta[0],displayY+delta[1]);}
  });
  blur.addEventListener('input',changed);blur.addEventListener('change',commit);
  reset.addEventListener('click',()=>{blur.value='8';focus(.5,.5);commit();});draw();
  // Histories can contain many photos. Keep live GPU contexts only for previews
  // that are visible; their canvas snapshots and settings survive suspension.
  const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{if(!entries[0].isIntersecting)releaseRenderer();}):null;
  observer?.observe(frame);
  const toggle=()=>{if(!host.open)releaseRenderer();};host.addEventListener('toggle',toggle);
  const dispose=()=>{disposed=true;clearTimeout(timer);if(pending!==null)cancelAnimationFrame(pending);observer?.disconnect();host.removeEventListener('toggle',toggle);releaseRenderer();view.width=view.height=0;host.replaceChildren();};
  dispose.flush=commit;return dispose;
}
