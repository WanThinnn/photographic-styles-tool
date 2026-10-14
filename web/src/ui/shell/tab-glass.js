// Liquid Glass tab gesture ported from ionic-theme-ios27's measured UIKit samples.
// Presentation previews do not navigate; release commits one real destination.
// Geometry is cached on press and moves are frame-coalesced to avoid repeated
// layout reads while iOS WebKit composites the glass material.
const TAB_PRESS_FRAMES=[
  [0,0,0,0,0],
  [.033,.091,4.26,1.52,.148],
  [.067,.312,13.28,2.89,.46],
  [.1,.551,21.99,2.24,.752],
  [.133,.736,25.94,2.77,.951],
  [.167,.858,24.35,6.03,1.052],
  [.2,.932,22.72,8.41,1.081],
  [.267,.985,21.55,10.38,1.058],
  [.333,1.003,17.89,13.98,1.01],
  [.4,1.015,13.54,18.42,1],
  [.467,1.018,11.3,20.75,1],
  [.6,1.005,12.36,19.72,1],
  [.733,.993,14.75,17.27,1],
  [.9,1,16,16,1],
];
const TAB_RELEASE_SAMPLES=[
  [0,1],[.033,.85],[.067,.58],[.1,.31],[.133,.15],[.167,.055],
  [.2,.01],[.267,-.01],[.367,-.004],[.45,0],
];
const BAR_EXPANSION_PT=14.14;
const HELD_EXTRA_PT=16;

export function bindTabGlass({nav,tabs,select,win=window,doc=document}){
  if(!win.PointerEvent)return ()=>{};
  let pointer=null,timer=null,suppressClick=false,moveFrame=null,pendingMove=null,keyboardState=null;
  const reduced=()=>win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const now=()=>win.performance?.now?.()??Date.now();
  const clearTimer=()=>{if(timer!==null)win.clearTimeout(timer);timer=null;};
  const geometry=()=>{
    const bar=nav.getBoundingClientRect(),rects=tabs.map(tab=>tab.getBoundingClientRect());
    const baseLeft=rects[0].left-bar.left;
    return {
      bar,baseLeft,rects,
      lefts:rects.map(rect=>rect.left-bar.left),
      centers:rects.map(rect=>rect.left-bar.left+rect.width/2),
      widths:rects.map(rect=>rect.width),
      heights:rects.map(rect=>rect.height||Math.max(1,(bar.height||60)-8)),
    };
  };
  const criticallyDamped=time=>1-Math.exp(-18*time)*(1+18*time);
  const pressSample=(state,elapsedMs)=>{
    const time=Math.max(0,Math.min(.9,elapsedMs/1000));
    let next=TAB_PRESS_FRAMES.findIndex(frame=>frame[0]>=time);
    if(next<0)next=TAB_PRESS_FRAMES.length-1;
    const before=TAB_PRESS_FRAMES[Math.max(0,next-1)],after=TAB_PRESS_FRAMES[next];
    const span=Math.max(.0001,after[0]-before[0]),mix=Math.max(0,Math.min(1,(time-before[0])/span));
    const lerp=(a,b)=>a+(b-a)*mix;
    const extraX=state.sameSelection?HELD_EXTRA_PT*criticallyDamped(time):lerp(before[2],after[2]);
    const extraY=state.sameSelection?HELD_EXTRA_PT*criticallyDamped(time):lerp(before[3],after[3]);
    return {
      lensX:1+extraX/state.lensWidth,
      lensY:1+extraY/state.lensHeight,
    };
  };
  const configurePressGeometry=state=>{
    state.lensWidth=Math.max(1,state.widths[state.index]||1);
    state.lensHeight=Math.max(1,state.heights[state.index]||Math.max(1,(state.bar.height||60)-8));
    const activeIndex=tabs.findIndex(tab=>tab.getAttribute?.('aria-current')==='page');
    state.sameSelection=activeIndex<0||activeIndex===state.index;
    TAB_PRESS_FRAMES.forEach((frame,index)=>{
      const time=frame[0],sample=pressSample(state,time*1000);
      nav.style.setProperty(`--ios27-lens-sx-${index}`,String(sample.lensX));
      nav.style.setProperty(`--ios27-lens-sy-${index}`,String(sample.lensY));
    });
    state.heldBarScale=1+BAR_EXPANSION_PT/state.bar.width;
    state.heldLensX=1+HELD_EXTRA_PT/state.lensWidth;
    state.heldLensY=1+HELD_EXTRA_PT/state.lensHeight;
    nav.style.setProperty('--ios27-bar-held-scale',String(state.heldBarScale));
    nav.style.setProperty('--ios27-lens-held-sx',String(state.heldLensX));
    nav.style.setProperty('--ios27-lens-held-sy',String(state.heldLensY));
  };
  const configureRelease=(state,current)=>{
    TAB_RELEASE_SAMPLES.forEach(([time,remaining],index)=>{
      nav.style.setProperty(`--ios27-release-sx-${index}`,String(1+(current.lensX-1)*remaining));
      nav.style.setProperty(`--ios27-release-sy-${index}`,String(1+(current.lensY-1)*remaining));
    });
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
    setPreview(index,offset);
    return {...g,index,previewIndex:index};
  };
  const reset=()=>{
    nav.classList.remove('is-pressing','is-dragging','is-releasing');
    nav.style.removeProperty('--lens-offset');
    nav.style.removeProperty('--ios27-drag-lens-sx');
    nav.style.removeProperty('--ios27-drag-lens-sy');
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
    if(cancel){reset();return;}
    suppressClick=true;
    select(tabs[state.index].dataset.screen);
    const current=state.dragging
      ?{lensX:state.dragLensX??state.heldLensX,lensY:state.dragLensY??state.heldLensY}
      :pressSample(state,now()-state.startedAt);
    configureRelease(state,current);
    nav.classList.remove('is-pressing','is-dragging');
    nav.style.removeProperty('--lens-offset');
    if(reduced()){reset();return;}
    nav.classList.add('is-releasing');
    timer=win.setTimeout(()=>{timer=null;reset();},450);
  };
  const down=event=>{
    if(pointer||event.button!==0||event.isPrimary===false)return;
    const target=event.target.closest?.('[data-screen]'),index=tabs.indexOf(target);
    if(index<0)return;
    clearTimer();reset();suppressClick=false;
    const g=geometry();
    pointer={id:event.pointerId,index,previewIndex:-1,startX:event.clientX,startY:event.clientY,lastX:event.clientX,lastMoveAt:now(),dragging:false,startedAt:now(),...g};
    configurePressGeometry(pointer);
    setPreview(index,g.lefts[index]-g.baseLeft);
    nav.classList.add('is-pressing');
    try{nav.setPointerCapture(event.pointerId);}catch{}
  };
  const applyMove=event=>{
    moveFrame=null;
    if(!pointer||pointer.id!==event.pointerId)return;
    const dx=event.clientX-pointer.startX,dy=event.clientY-pointer.startY;
    if(!pointer.dragging&&Math.abs(dy)>8&&Math.abs(dy)>Math.abs(dx)){release(true);return;}
    if(Math.abs(dx)<3&&!pointer.dragging)return;
    const movedAt=now(),elapsed=Math.max(1,movedAt-pointer.lastMoveAt),velocity=Math.abs(event.clientX-pointer.lastX)/elapsed;
    pointer.lastX=event.clientX;pointer.lastMoveAt=movedAt;
    if(!pointer.dragging){
      const current=pressSample(pointer,movedAt-pointer.startedAt);
      pointer.dragging=true;
      nav.classList.remove('is-pressing');
      nav.classList.add('is-dragging');
      nav.style.setProperty('--ios27-drag-lens-sx',String(current.lensX));
      nav.style.setProperty('--ios27-drag-lens-sy',String(current.lensY));
    }
    const stretch=Math.min(HELD_EXTRA_PT,32*velocity*velocity);
    pointer.dragLensX=pointer.heldLensX+stretch/pointer.lensWidth;
    pointer.dragLensY=pointer.heldLensY-stretch/pointer.lensHeight;
    nav.style.setProperty('--ios27-drag-lens-sx',String(pointer.dragLensX));
    nav.style.setProperty('--ios27-drag-lens-sy',String(pointer.dragLensY));
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
    clearTimer();keyboardState=preview(index);keyboardState.startedAt=now();configurePressGeometry(keyboardState);nav.classList.add('is-pressing');
  };
  const keyup=event=>{
    if(!['Enter',' '].includes(event.key))return;
    keyboardState=null;clearTimer();reset();
  };
  const blur=()=>{cancel();keyboardState=null;clearTimer();cancelMoveFrame();reset();};
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
