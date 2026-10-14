// Lightweight press/drag lens, adapted from ionic-theme-ios27 (MIT notice in web/).
// Presentation previews do not navigate; release commits one real destination.
// Native button clicks/keyboard semantics remain available without Pointer Events.
export function bindTabGlass({nav,tabs,select,win=window,doc=document}){
  if(!win.PointerEvent)return ()=>{};
  let pointer=null,timer=null,suppressClick=false;
  const reduced=()=>win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const clearTimer=()=>{if(timer!==null)win.clearTimeout(timer);timer=null;};
  const preview=index=>{
    tabs.forEach((tab,i)=>tab.classList.toggle('is-previewed',i===index));
    nav.style.setProperty('--lens-center',center(tabs[index])+'px');
  };
  const center=tab=>{
    const bar=nav.getBoundingClientRect(),rect=tab.getBoundingClientRect();
    return rect.left-bar.left+rect.width/2;
  };
  const reset=()=>{
    nav.classList.remove('is-pressing','is-releasing');
    nav.style.removeProperty('--lens-center');
    tabs.forEach(tab=>tab.classList.remove('is-previewed'));
  };
  const release=(cancel=false)=>{
    if(!pointer)return;
    const state=pointer;pointer=null;
    try{nav.releasePointerCapture(state.id);}catch{}
    if(!cancel){
      suppressClick=true;
      select(tabs[state.index].dataset.screen);
    }
    nav.classList.remove('is-pressing');
    tabs.forEach(tab=>tab.classList.remove('is-previewed'));
    nav.style.removeProperty('--lens-center');
    if(cancel||reduced()){reset();return;}
    nav.classList.add('is-releasing');
    timer=win.setTimeout(()=>{timer=null;reset();},220);
  };
  const down=event=>{
    if(pointer||event.button!==0||event.isPrimary===false)return;
    const target=event.target.closest?.('[data-screen]'),index=tabs.indexOf(target);
    if(index<0)return;
    clearTimer();reset();suppressClick=false;
    pointer={id:event.pointerId,index,startX:event.clientX,startY:event.clientY,dragging:false};
    preview(index);nav.classList.add('is-pressing');
    try{nav.setPointerCapture(event.pointerId);}catch{}
  };
  const move=event=>{
    if(!pointer||pointer.id!==event.pointerId)return;
    const dx=event.clientX-pointer.startX,dy=event.clientY-pointer.startY;
    if(!pointer.dragging&&Math.abs(dy)>8&&Math.abs(dy)>Math.abs(dx)){release(true);return;}
    if(Math.abs(dx)<4&&!pointer.dragging)return;
    pointer.dragging=true;
    const bar=nav.getBoundingClientRect(),x=event.clientX-bar.left;
    let nearest=0;
    tabs.forEach((tab,index)=>{if(Math.abs(center(tab)-x)<Math.abs(center(tabs[nearest])-x))nearest=index;});
    pointer.index=nearest;
    tabs.forEach((tab,index)=>tab.classList.toggle('is-previewed',index===nearest));
    const first=center(tabs[0]),last=center(tabs.at(-1));
    nav.style.setProperty('--lens-center',Math.max(first,Math.min(last,x))+'px');
  };
  const up=event=>{
    if(!pointer||pointer.id!==event.pointerId)return;
    move(event);if(!pointer)return;
    const bar=nav.getBoundingClientRect();
    release(event.clientX<bar.left-8||event.clientX>bar.right+8||event.clientY<bar.top-24||event.clientY>bar.bottom+24);
  };
  const cancel=()=>release(true);
  const click=event=>{
    // Pointer release owns the destination; a synthetic click may still name the
    // originally pressed tab after dragging. Never navigate to that stale target.
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
  const blur=()=>{cancel();clearTimer();reset();};
  nav.addEventListener('pointerdown',down);
  doc.addEventListener('pointermove',move);doc.addEventListener('pointerup',up);
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
