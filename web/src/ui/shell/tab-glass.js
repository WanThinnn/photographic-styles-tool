// Lightweight press/drag lens, adapted from ionic-theme-ios27 (MIT notice in web/).
// Presentation previews do not navigate; release commits one real destination.
// Pointer moves are frame-coalesced and use cached geometry so iOS WebKit does
// not perform repeated layout reads while compositing Liquid Glass.
export function bindTabGlass({nav,tabs,select,win=window,doc=document}){
  if(!win.PointerEvent)return ()=>{};
  let pointer=null,timer=null,suppressClick=false,moveFrame=null,pendingMove=null;
  const reduced=()=>win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const clearTimer=()=>{if(timer!==null)win.clearTimeout(timer);timer=null;};
  const geometry=()=>{
    const bar=nav.getBoundingClientRect(),rects=tabs.map(tab=>tab.getBoundingClientRect());
    const baseLeft=rects[0].left-bar.left;
    return {
      bar,baseLeft,
      lefts:rects.map(rect=>rect.left-bar.left),
      centers:rects.map(rect=>rect.left-bar.left+rect.width/2),
      widths:rects.map(rect=>rect.width)
    };
  };
  const setPreview=(index,offset)=>{
    if(pointer?.previewIndex!==index){
      tabs.forEach((tab,i)=>tab.classList.toggle('is-previewed',i===index));
      if(pointer)pointer.previewIndex=index;
    }
    nav.style.setProperty('--lens-offset',offset+'px');
  };
  const preview=index=>{
    const g=geometry(),offset=g.lefts[index]-g.baseLeft;
    if(pointer)Object.assign(pointer,g);
    setPreview(index,offset);
  };
  const reset=()=>{
    nav.classList.remove('is-pressing','is-dragging','is-releasing');
    nav.style.removeProperty('--lens-offset');
    tabs.forEach(tab=>tab.classList.remove('is-previewed'));
  };
  const cancelMoveFrame=()=>{
    pendingMove=null;
    if(moveFrame!==null){win.cancelAnimationFrame(moveFrame);moveFrame=null;}
  };
  const release=(cancel=false)=>{
    if(!pointer)return;
    const state=pointer;pointer=null;cancelMoveFrame();
    try{nav.releasePointerCapture(state.id);}catch{}
    if(!cancel){
      suppressClick=true;
      select(tabs[state.index].dataset.screen);
    }
    nav.classList.remove('is-pressing','is-dragging');
    tabs.forEach(tab=>tab.classList.remove('is-previewed'));
    nav.style.removeProperty('--lens-offset');
    if(cancel||reduced()){reset();return;}
    nav.classList.add('is-releasing');
    timer=win.setTimeout(()=>{timer=null;reset();},220);
  };
  const down=event=>{
    if(pointer||event.button!==0||event.isPrimary===false)return;
    const target=event.target.closest?.('[data-screen]'),index=tabs.indexOf(target);
    if(index<0)return;
    clearTimer();reset();suppressClick=false;
    const g=geometry();
    pointer={id:event.pointerId,index,previewIndex:-1,startX:event.clientX,startY:event.clientY,dragging:false,...g};
    setPreview(index,g.lefts[index]-g.baseLeft);nav.classList.add('is-pressing');
    try{nav.setPointerCapture(event.pointerId);}catch{}
  };
  const applyMove=event=>{
    moveFrame=null;
    if(!pointer||pointer.id!==event.pointerId)return;
    const dx=event.clientX-pointer.startX,dy=event.clientY-pointer.startY;
    if(!pointer.dragging&&Math.abs(dy)>8&&Math.abs(dy)>Math.abs(dx)){release(true);return;}
    if(Math.abs(dx)<4&&!pointer.dragging)return;
    if(!pointer.dragging){pointer.dragging=true;nav.classList.add('is-dragging');}
    const x=event.clientX-pointer.bar.left,centers=pointer.centers;
    let nearest=0,best=Math.abs(centers[0]-x);
    for(let i=1;i<centers.length;i++){const distance=Math.abs(centers[i]-x);if(distance<best){best=distance;nearest=i;}}
    pointer.index=nearest;
    const width=pointer.widths[nearest],min=pointer.lefts[0],max=pointer.lefts.at(-1);
    const desired=Math.max(min,Math.min(max,x-width/2));
    setPreview(nearest,desired-pointer.baseLeft);
  };
  const move=event=>{
    if(!pointer||pointer.id!==event.pointerId)return;
    pendingMove=event;
    if(moveFrame===null)moveFrame=win.requestAnimationFrame(()=>{const next=pendingMove;pendingMove=null;if(next)applyMove(next);});
  };
  const up=event=>{
    if(!pointer||pointer.id!==event.pointerId)return;
    cancelMoveFrame();applyMove(event);if(!pointer)return;
    const bar=pointer.bar;
    release(event.clientX<bar.left-8||event.clientX>bar.right+8||event.clientY<bar.top-24||event.clientY>bar.bottom+24);
  };
  const cancel=()=>release(true);
  const click=event=>{
    if(suppressClick&&event.detail>0){suppressClick=false;event.preventDefault();event.stopImmediatePropagation();}
  };
  const keydown=event=>{
    if(!['Enter',' '].includes(event.key)||event.repeat)return;
    const index=tabs.indexOf(event.target);if(index<0)return;
    clearTimer();preview(index);nav.classList.add('is-pressing');
  };
  const keyup=event=>{
    if(!['Enter',' '].includes(event.key))return;
    clearTimer();reset();
  };
  const blur=()=>{cancel();clearTimer();cancelMoveFrame();reset();};
  nav.addEventListener('pointerdown',down);
  doc.addEventListener('pointermove',move,{passive:true});doc.addEventListener('pointerup',up);
  doc.addEventListener('pointercancel',cancel);
  nav.addEventListener('lostpointercapture',cancel);
  nav.addEventListener('click',click,true);
  nav.addEventListener('keydown',keydown);nav.addEventListener('keyup',keyup);
  win.addEventListener('blur',blur);
  return ()=>{
    blur();nav.removeEventListener('pointerdown',down);
    doc.removeEventListener('pointermove',move);doc.removeEventListener('pointerup',up);
    doc.removeEventListener('pointercancel',cancel);nav.removeEventListener('lostpointercapture',cancel);
    nav.removeEventListener('click',click,true);nav.removeEventListener('keydown',keydown);nav.removeEventListener('keyup',keyup);
    win.removeEventListener('blur',blur);
  };
}
