// The device-accepted Camera contour applies only to the outer phone sheet.
// Content groups keep their original, restrained CSS corner radii.
const QUARTER=Array.from({length:65},(_,index)=>{
  const angle=index/64*Math.PI/2,power=2/3.77;
  return [1-Math.max(0,Math.cos(angle))**power,1-Math.max(0,Math.sin(angle))**power];
});
QUARTER[0]=[0,1];QUARTER[64]=[1,0];

export function continuousSheetPath(width,height,inset=0){
  const w=width-2*inset,h=height-2*inset;
  if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0)return '';
  const extent=Math.min(92,width*.24,w/2,h/2);
  const n=value=>Number((value+inset).toFixed(3));
  const corner=map=>QUARTER.slice(1).map(([x,y])=>{
    const point=map(x*extent,y*extent);return `L${n(point[0])} ${n(point[1])}`;
  }).join(' ');
  return `M${n(0)} ${n(extent)} ${corner((x,y)=>[x,y])} H${n(w-extent)} `+
    `${corner((x,y)=>[w-y,x])} V${n(h-extent)} ${corner((x,y)=>[w-x,h-y])} `+
    `H${n(extent)} ${corner((x,y)=>[y,h-x])} Z`;
}

export function bindContinuousSheetFrame({sheet,win=window}){
  const empty={refresh(){},dispose(){}};
  if(!win.ResizeObserver)return empty;
  const frame=sheet.querySelector('.sheet-frame'),clip=frame?.querySelector('clipPath'),outline=frame?.querySelector('.sheet-frame-outline');
  if(!clip||!outline)return empty;
  const query=win.matchMedia('(max-width:600px)');
  let lastSize='';
  const refresh=()=>{
    if(!query.matches){
      sheet.removeAttribute('data-continuous-frame');sheet.style.removeProperty('clip-path');lastSize='';return;
    }
    if(!sheet.open)return;
    sheet.setAttribute('data-continuous-frame','');
    const style=win.getComputedStyle(sheet),width=parseFloat(style.width),height=parseFloat(style.height);
    if(!(width>0&&height>0))return;
    const size=`${width},${height}`;if(size===lastSize)return;lastSize=size;
    frame.setAttribute('viewBox',`0 0 ${width} ${height}`);
    clip.querySelector('path').setAttribute('d',continuousSheetPath(width,height));
    outline.setAttribute('d',continuousSheetPath(width,height,.25));
    sheet.style.setProperty('clip-path',`url("#${clip.id}")`);
  };
  const observer=new win.ResizeObserver(refresh);observer.observe(sheet);
  query.addEventListener('change',refresh);refresh();
  return {refresh,dispose(){observer.disconnect();query.removeEventListener('change',refresh);sheet.removeAttribute('data-continuous-frame');sheet.style.removeProperty('clip-path');}};
}
