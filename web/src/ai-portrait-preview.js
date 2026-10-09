import {renderBokeh} from './ai-bokeh.js';
import {displayPointToStored} from './raster/heif.js';
// Preview only. Export keeps the unblurred primary and editable Portrait depth.
export function portraitPreview(result,host,strings,onSettings){
  const {width:w,height:h,gray,previewRgb:rgb,orientation:{angle,mirror}}=result;
  const source=document.createElement('canvas');source.width=w;source.height=h;
  const ctx=source.getContext('2d'),pixels=ctx.createImageData(w,h);
  for(let i=0;i<gray.length;i++)pixels.data.set([rgb[i*3],rgb[i*3+1],rgb[i*3+2],255],i*4);
  ctx.putImageData(pixels,0,0);
  const view=document.createElement('canvas'),swap=angle===90||angle===270;
  view.width=swap?h:w;view.height=swap?w:h;view.className='ai-preview';
  const blur=document.createElement('input');blur.type='range';blur.min='0';blur.max='20';blur.value='8';
  const label=document.createElement('label');label.textContent=strings.blur;label.append(blur);
  const instruction=document.createElement('p');instruction.className='live-note';instruction.textContent=strings.focus;
  const guidance=document.createElement('p');guidance.className='live-note';guidance.textContent=strings.ready;
  host.append(instruction,view,label,guidance);
  let x=.5,y=.5,pending=null;
  const draw=()=>{
    const focus=gray[Math.min(h-1,Math.floor(y*h))*w+Math.min(w-1,Math.floor(x*w))];
    const rendered=renderBokeh(source,gray,w,h,{focus,blur:Number(blur.value),angle,mirror});
    try{view.getContext('2d').drawImage(rendered.canvas,0,0);}finally{rendered.close();}
  };
  const changed=()=>{
    if(pending!==null)cancelAnimationFrame(pending);
    pending=requestAnimationFrame(()=>{pending=null;draw();
      onSettings({focusX:x,focusY:y,aperture:Math.max(1.4,Math.min(16,4.5*2**((8-Number(blur.value))/5)))});
    });
  };
  view.addEventListener('click',e=>{
    const r=view.getBoundingClientRect();
    const {x:a,y:b}=displayPointToStored((e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height,angle,mirror);
    x=Math.max(0,Math.min(1,a));y=Math.max(0,Math.min(1,b));changed();
  });
  blur.addEventListener('input',changed);draw();
  return ()=>{if(pending!==null)cancelAnimationFrame(pending);source.width=source.height=view.width=view.height=0;host.replaceChildren();};
}
