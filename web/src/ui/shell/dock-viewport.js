// Resting dock placement is CSS-driven, but standalone iOS WebKit can report a
// too-small viewport unit after relaunch. Keep one explicit shell-height value
// from the real layout viewport, and reserve VisualViewport only for Search's
// software keyboard.
export function bindDockViewport({win=window,doc=document}={}){
  const dock=doc.querySelector('.app-dock'),input=doc.getElementById('history-search');
  const field=doc.getElementById('history-search-field'),viewport=win.visualViewport;
  if(!dock?.style||!input)return ()=>{};
  const later=win.setTimeout?.bind(win)||setTimeout,clearLater=win.clearTimeout?.bind(win)||clearTimeout;
  const requestFrame=win.requestAnimationFrame?.bind(win)||(fn=>later(fn,0));
  const cancelFrame=win.cancelAnimationFrame?.bind(win)||clearLater;
  let frame=null,shellFrame=null,keyboardSignal=false,retryTimers=[];
  const standalone=()=>win.matchMedia?.('(display-mode: standalone)')?.matches===true||win.navigator?.standalone===true;
  const clearKeyboard=()=>{
    dock.style.removeProperty('--dock-viewport-bottom');
    dock.style.removeProperty('--dock-keyboard-offset');
  };
  const applyShellHeight=()=>{
    shellFrame=null;
    if(!standalone())return;
    const docHeight=Number(doc.documentElement?.clientHeight)||0;
    const inner=Number(win.innerHeight)||0;
    const measured=Math.max(inner,docHeight);
    if(measured>0)dock.style.setProperty('--dock-shell-height',measured+'px');
  };
  const scheduleShell=()=>{
    if(shellFrame===null)shellFrame=requestFrame(applyShellHeight);
  };
  const refreshShell=()=>{
    for(const timer of retryTimers)clearLater(timer);
    retryTimers=[];
    if(!standalone())return;
    scheduleShell();
    for(const delay of [80,240,520]){
      let timer;
      timer=later(()=>{
        retryTimers=retryTimers.filter(id=>id!==timer);
        scheduleShell();
      },delay);
      retryTimers.push(timer);
    }
  };
  if(!viewport){
    refreshShell();
    return ()=>{
      if(shellFrame!==null)cancelFrame(shellFrame);
      for(const timer of retryTimers)clearLater(timer);
      dock.style.removeProperty('--dock-shell-height');
    };
  }
  const searchFocused=()=>doc.activeElement===input&&field?.hidden===false&&dock.classList?.contains?.('is-searching');
  const update=()=>{
    frame=null;
    if(!keyboardSignal||!searchFocused()||Math.abs(viewport.scale-1)>.01){clearKeyboard();return;}
    const bottom=Number(viewport.height)+Number(viewport.offsetTop),layoutHeight=Number(win.innerHeight);
    const offset=Number.isFinite(bottom)&&Number.isFinite(layoutHeight)?layoutHeight-bottom:0;
    if(bottom>0&&offset>=80&&offset<=Math.min(420,layoutHeight*.65)){
      dock.style.setProperty('--dock-viewport-bottom',bottom+'px');
      dock.style.setProperty('--dock-keyboard-offset',offset+'px');
    }else clearKeyboard();
  };
  const schedule=()=>{if(frame===null)frame=requestFrame(update);};
  const viewportResize=()=>{if(searchFocused())keyboardSignal=true;else refreshShell();schedule();};
  const viewportScroll=()=>{if(keyboardSignal)schedule();};
  const focus=()=>{keyboardSignal=false;clearKeyboard();};
  const reset=()=>{
    keyboardSignal=false;clearKeyboard();
    if(frame!==null){cancelFrame(frame);frame=null;}
    refreshShell();
  };
  viewport.addEventListener('resize',viewportResize);viewport.addEventListener('scroll',viewportScroll);
  input.addEventListener('focus',focus);input.addEventListener('blur',reset);
  const orientationReset=()=>reset();
  win.addEventListener('resize',refreshShell);win.addEventListener('pagehide',clearKeyboard);
  win.addEventListener('pageshow',reset);win.addEventListener('orientationchange',orientationReset);
  const visibility=()=>{if(doc.visibilityState==='visible')reset();else clearKeyboard();};
  doc.addEventListener?.('visibilitychange',visibility);
  clearKeyboard();refreshShell();
  return ()=>{
    clearKeyboard();
    if(frame!==null)cancelFrame(frame);
    if(shellFrame!==null)cancelFrame(shellFrame);
    for(const timer of retryTimers)clearLater(timer);
    retryTimers=[];
    dock.style.removeProperty('--dock-shell-height');
    viewport.removeEventListener('resize',viewportResize);viewport.removeEventListener('scroll',viewportScroll);
    input.removeEventListener('focus',focus);input.removeEventListener('blur',reset);
    win.removeEventListener('resize',refreshShell);win.removeEventListener('pagehide',clearKeyboard);
    win.removeEventListener('pageshow',reset);win.removeEventListener('orientationchange',orientationReset);
    doc.removeEventListener?.('visibilitychange',visibility);
  };
}
