// Drag only the sheet's handle/header. Its content keeps native touch scrolling.
export function bindSheetDismissGesture({sheet,close,win=window}){
  const handles=[...(sheet.querySelectorAll?.('[data-sheet-drag]')||[])];
  if(!win.PointerEvent||!handles.length)return ()=>{};
  let drag=null,frame=null;
  const now=()=>win.performance?.now?.()??Date.now();
  const paint=()=>{frame=null;if(drag)sheet.style.setProperty('--sheet-drag-y',drag.offset+'px');};
  const cancelFrame=()=>{if(frame!==null){win.cancelAnimationFrame(frame);frame=null;}};
  const finish=(dismiss=false)=>{
    if(!drag)return;
    const current=drag;drag=null;cancelFrame();
    sheet.style.setProperty('--sheet-drag-y',current.offset+'px');
    sheet.classList.remove('is-dragging');
    try{sheet.releasePointerCapture(current.id);}catch{}
    if(dismiss)close();else sheet.style.removeProperty('--sheet-drag-y');
  };
  const down=event=>{
    if(drag||!sheet.open||sheet.classList.contains('is-closing')||event.isPrimary===false||event.button!==0)return;
    if(event.target?.closest?.('button,a,input,select,textarea'))return;
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,offset:0,started:now(),height:sheet.getBoundingClientRect().height};
    try{sheet.setPointerCapture(event.pointerId);}catch{}
  };
  const move=event=>{
    if(!drag||event.pointerId!==drag.id)return;
    const dy=event.clientY-drag.y,dx=event.clientX-drag.x;
    if(Math.abs(dx)>8&&Math.abs(dx)>Math.abs(dy)){finish();return;}
    drag.offset=Math.min(drag.height*.65,Math.max(0,dy));
    if(drag.offset<6)return;
    sheet.classList.add('is-dragging');
    if(frame===null)frame=win.requestAnimationFrame(paint);
  };
  const up=event=>{
    if(!drag||event.pointerId!==drag.id)return;
    move(event);if(!drag)return;
    const speed=drag.offset/Math.max(1,now()-drag.started);
    finish(drag.offset>=64||drag.offset>=28&&speed>.65);
  };
  const cancel=()=>finish();
  const reset=()=>{finish();sheet.classList.remove('is-dragging');sheet.style.removeProperty('--sheet-drag-y');};
  for(const handle of handles)handle.addEventListener('pointerdown',down);
  sheet.addEventListener('pointermove',move,{passive:true});sheet.addEventListener('pointerup',up);
  sheet.addEventListener('pointercancel',cancel);sheet.addEventListener('lostpointercapture',cancel);
  sheet.addEventListener('close',reset);win.addEventListener('pagehide',reset);
  return ()=>{
    reset();for(const handle of handles)handle.removeEventListener('pointerdown',down);
    sheet.removeEventListener('pointermove',move);sheet.removeEventListener('pointerup',up);
    sheet.removeEventListener('pointercancel',cancel);sheet.removeEventListener('lostpointercapture',cancel);
    sheet.removeEventListener('close',reset);win.removeEventListener('pagehide',reset);
  };
}
