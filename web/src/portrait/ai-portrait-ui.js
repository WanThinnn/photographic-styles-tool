import {renderBokeh} from './ai-bokeh.js';
import {displayPointToStored} from '../raster/heif.js';
export {AI_STRINGS} from '../ui/ai-strings.js';

export function blurPreview(result,host,strings,exportImage) {
  const {width:w,height:h,gray,previewRgb:rgb,orientation:{angle,mirror}}=result;
  const source=document.createElement('canvas');source.width=w;source.height=h;
  const ctx=source.getContext('2d'),image=ctx.createImageData(w,h);
  for(let i=0;i<gray.length;i++){image.data.set([rgb[i*3],rgb[i*3+1],rgb[i*3+2],255],i*4);}ctx.putImageData(image,0,0);
  const view=document.createElement('canvas'),swap=angle===90||angle===270;
  view.width=swap?h:w;view.height=swap?w:h;view.className='ai-preview';
  const vctx=view.getContext('2d');
  const label=document.createElement('label');label.textContent=strings.blur;
  const slider=document.createElement('input');slider.type='range';slider.min='0';slider.max='20';slider.value='8';label.append(slider);
  const focusLabel=document.createElement('label');focusLabel.textContent=strings.focus;
  const focusSlider=document.createElement('input');focusSlider.type='range';focusSlider.min='0';focusSlider.max='255';focusLabel.append(focusSlider);
  const save=document.createElement('button');save.className='dl alt';save.textContent=strings.flat;save.type='button';
  const output=document.createElement('div');output.className='bokeh-output';
  const status=document.createElement('p');status.className='ai-status';
  let outputUrl=null;
  function focusAt(x,y){
    const samples=[];
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)samples.push(gray[Math.max(0,Math.min(h-1,y+dy))*w+Math.max(0,Math.min(w-1,x+dx))]);
    samples.sort((a,b)=>a-b);return samples[12];
  }
  let focus=focusAt(Math.floor(w/2),Math.floor(h/2)),pending=null;
  focusSlider.value=String(focus);
  function invalidate(){if(outputUrl)URL.revokeObjectURL(outputUrl);outputUrl=null;output.replaceChildren();status.textContent=strings.changed;}
  function draw(){
    const rendered=renderBokeh(source,gray,w,h,{focus,blur:Number(slider.value),angle,mirror});
    try{vctx.drawImage(rendered.canvas,0,0);}finally{rendered.close();}
  }
  function schedule(){invalidate();if(pending===null)pending=requestAnimationFrame(()=>{pending=null;draw();});}
  slider.addEventListener('input',schedule);
  focusSlider.addEventListener('input',()=>{focus=Number(focusSlider.value);schedule();});
  view.addEventListener('click',event=>{
    const rect=view.getBoundingClientRect();
    const {x,y}=displayPointToStored((event.clientX-rect.left)/rect.width,(event.clientY-rect.top)/rect.height,angle,mirror);
    focus=focusAt(Math.floor(x*w),Math.floor(y*h));focusSlider.value=String(focus);schedule();
  });
  save.addEventListener('click',async()=>{
    save.disabled=slider.disabled=focusSlider.disabled=true;view.style.pointerEvents='none';invalidate();status.textContent=strings.encoding;
    try{
      const result=await exportImage({focus,blur:Number(slider.value)}),file=result.file;
      outputUrl=URL.createObjectURL(file);const download=document.createElement('a');download.className='dl alt';download.href=outputUrl;download.download=file.name;download.textContent=strings.download;
      if(navigator.canShare?.({files:[file]})){
        const share=document.createElement('button');share.className='dl';share.type='button';share.textContent=strings.save;
        share.addEventListener('click',async()=>{share.disabled=true;try{await navigator.share({files:[file]});}catch(error){if(error.name!=='AbortError')status.textContent=strings.exportFailed;}finally{share.disabled=false;}});output.append(share);
      }
      output.append(download);status.textContent=strings.done+(result.resized?' '+strings.resized:'');
    }catch(error){console.warn('Bokeh HEIC export failed',error);status.textContent=strings.exportFailed;}
    finally{save.disabled=slider.disabled=focusSlider.disabled=false;view.style.pointerEvents='';}
  });
  const actions=document.createElement('div');actions.className='bokeh-actions';actions.append(save,status,output);
  host.append(view,label,focusLabel,actions);draw();
  return () => {
    if (pending !== null) cancelAnimationFrame(pending);
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    outputUrl = null;
    source.width = source.height = view.width = view.height = 0;
    host.replaceChildren();
  };
}
