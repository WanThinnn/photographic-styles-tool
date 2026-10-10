import {createBokehRenderer} from './ai-bokeh.js';
import {displayPointToStored} from '../raster/heif.js';
import {latestSettingsWriter} from './ai-portrait-assembler.js';
const APERTURES=[1.4,1.6,1.8,2,2.2,2.5,2.8,3.2,3.5,4,4.5,5,5.6,6.3,7.1,8,9,10,11,13,14,16,null];
const DEFAULT_APERTURE=APERTURES.indexOf(4.5);
const selectedAperture=input=>APERTURES[Number(input.value)];
const apertureLabel=value=>value===null?'Off':`f/${value<10?value.toFixed(1):value}`;
// Keep the existing preview calibration. Off draws the unblurred source.
const previewBlur=value=>value===null?0:Math.max(0,8-5*Math.log2(value/4.5));
// A native range owns touch, keyboard and assistive-technology interaction.
// The ruler is decorative; its wave follows the value without a render loop.
function apertureControl(input,strings){
  const control=document.createElement('label');control.className='ai-aperture';
  const heading=document.createElement('span');heading.className='ai-aperture-heading';
  const caption=document.createElement('span');caption.textContent=strings.aperture;
  const value=document.createElement('output');value.className='ai-aperture-value';
  heading.append(caption,value);
  const track=document.createElement('span');track.className='ai-aperture-track';
  const ruler=document.createElement('span');ruler.className='ai-aperture-ruler';ruler.setAttribute('aria-hidden','true');
  const ticks=Array.from({length:APERTURES.length},(_,i)=>{
    const tick=document.createElement('span');tick.className='ai-aperture-tick';tick.style.left=`${i/(APERTURES.length-1)*100}%`;ruler.append(tick);return tick;
  });
  const selection=document.createElement('span');selection.className='ai-aperture-selection';ruler.append(selection);
  input.step='1';input.setAttribute('aria-label',strings.aperture);
  track.append(ruler,input);control.append(heading,track);
  let adjusting=false;
  const update=()=>{
    const position=Number(input.value)/(APERTURES.length-1);
    value.textContent=apertureLabel(selectedAperture(input));input.setAttribute('aria-valuetext',value.textContent);
    selection.style.left=`${position*100}%`;
    ticks.forEach((tick,i)=>{
      const distance=(i/(APERTURES.length-1)-position)/.12;
      const wave=adjusting?Math.exp(-distance*distance)*1.6:0;
      tick.style.transform=`translateX(-50%) scaleY(${1+wave})`;
    });
  };
  const active=enabled=>{adjusting=enabled;control.classList.toggle('is-adjusting',enabled);update();};
  const events=new AbortController(),options={signal:events.signal};
  input.addEventListener('pointerdown',()=>active(true),options);
  window.addEventListener('pointerup',()=>{if(adjusting)active(false);},options);
  window.addEventListener('pointercancel',()=>{if(adjusting)active(false);},options);
  window.addEventListener('blur',()=>{if(adjusting)active(false);},options);
  input.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(e.key))active(true);},options);
  input.addEventListener('keyup',()=>active(false),options);
  input.addEventListener('blur',()=>active(false),options);
  input.addEventListener('input',update,options);update();
  return {element:control,update,dispose:()=>events.abort()};
}
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
  const marker=document.createElement('span');marker.className='ai-focus-marker';marker.hidden=true;marker.setAttribute('aria-hidden','true');
  marker.innerHTML='<svg viewBox="0 0 100 100" aria-hidden="true"><path vector-effect="non-scaling-stroke" d="M1 1h98v98H1zM50 1v8M50 91v8M1 50h8M91 50h8"/></svg>';frame.append(view,marker);
  const blur=document.createElement('input');blur.type='range';blur.min='0';blur.max=String(APERTURES.length-1);blur.value=String(DEFAULT_APERTURE);
  const aperture=apertureControl(blur,strings);
  const instruction=document.createElement('p');instruction.className='ai-focus-hint';instruction.textContent=strings.focus;
  const reset=document.createElement('button');reset.type='button';reset.className='ai-reset';reset.title=strings.reset;reset.setAttribute('aria-label',strings.reset);
  reset.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3 4 7l4 4M4 7h8a8 8 0 1 1-8 8"/></svg>';
  const toolbar=document.createElement('div');toolbar.className='ai-preview-toolbar';
  const title=document.createElement('h3');title.className='ai-preview-title';title.textContent=strings.preview;
  const progress=document.createElement('span');progress.className='ai-preview-progress';progress.hidden=true;progress.setAttribute('role','status');
  const spinner=document.createElement('span');spinner.className='ai-spinner';spinner.setAttribute('aria-hidden','true');
  spinner.innerHTML='<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"><circle cx="20" cy="20" r="15" opacity=".18"/><path d="M20 5a15 15 0 1 1-15 15" opacity=".75"/></svg>';
  const progressLabel=document.createElement('span');progressLabel.className='ai-accessible-text';progressLabel.textContent=strings.updating;
  progress.append(spinner,progressLabel);toolbar.append(progress,title,reset);
  const state=document.createElement('p');state.className='ai-preview-state';state.setAttribute('role','status');
  host.append(toolbar,frame,instruction,aperture.element,state);
  const showUpdating=busy=>{progress.hidden=!busy;host.setAttribute('aria-busy',String(busy));};
  let x=.5,y=.5,displayX=.5,displayY=.5,pending=null,timer=null,version=0,disposed=false,lastCommitted=0,inFlight=null;
  const writeLatest=latestSettingsWriter(({chosen,current},isLatest)=>onSettings(chosen,()=>!disposed&&version===current&&isLatest()));
  // The saved HEIC always starts with Portrait off and keeps editable depth.
  // Off is a preview state, not an invalid zero aperture in its depth metadata.
  const settings=()=>({focusX:x,focusY:y,aperture:selectedAperture(blur)??16});
  const draw=()=>{
    if(document.hidden)return;
    const focus=gray[Math.min(h-1,Math.floor(y*h))*w+Math.min(w-1,Math.floor(x*w))];
    const active=ensureRenderer();active.draw({focus,blur:previewBlur(selectedAperture(blur))});view.getContext('2d').drawImage(active.canvas,0,0);
  };
  const commit=()=>{
    clearTimeout(timer);timer=null;
    if(disposed||lastCommitted===version)return inFlight||Promise.resolve();
    const current=version,chosen=settings();lastCommitted=current;
    inFlight=writeLatest({chosen,current}).then(()=>{
      if(!disposed&&version===current){showUpdating(false);state.textContent='';onPending(false);}
    }).catch(error=>{
      console.warn('Portrait settings update failed',error);
      if(!disposed&&version===current){showUpdating(false);state.textContent=strings.updateFailed;lastCommitted=0;}
    });
    return inFlight;
  };
  const changed=()=>{
    version++;onPending(true);showUpdating(true);state.textContent='';
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
  reset.addEventListener('click',()=>{blur.value=String(DEFAULT_APERTURE);aperture.update();focus(.5,.5);commit();});draw();
  // Histories can contain many photos. Keep live GPU contexts only for previews
  // that are visible; their canvas snapshots and settings survive suspension.
  const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{host.classList.toggle('is-suspended',!entries[0].isIntersecting);if(!entries[0].isIntersecting)releaseRenderer();}):null;
  observer?.observe(frame);
  const suspend=()=>{if(pending!==null){cancelAnimationFrame(pending);pending=null;}releaseRenderer();};
  const visibility=()=>{if(document.hidden)suspend();};
  document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',suspend);
  const dispose=()=>{disposed=true;clearTimeout(timer);if(pending!==null)cancelAnimationFrame(pending);aperture.dispose();observer?.disconnect();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',suspend);releaseRenderer();view.width=view.height=0;host.replaceChildren();};
  dispose.flush=commit;return dispose;
}
