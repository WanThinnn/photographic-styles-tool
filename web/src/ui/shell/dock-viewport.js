// A viewport-sized CSS host owns resting geometry, without viewport units.
// WebKit's innerHeight/clientHeight/dvh can all be stale on a cold launch.
// VisualViewport is used only after Search actually opens a software keyboard.
export function bindDockViewport({win=window,doc=document}={}){
  const dock=doc.querySelector('.app-dock'),input=doc.getElementById('history-search');
  const field=doc.getElementById('history-search-field'),viewport=win.visualViewport;
  const chrome=doc.getElementById('app-chrome'),style=chrome?.style||dock?.style;
  if(!dock?.style||!input)return ()=>{};
  const later=win.setTimeout?.bind(win)||setTimeout,clearLater=win.clearTimeout?.bind(win)||clearTimeout;
  const requestFrame=win.requestAnimationFrame?.bind(win)||(fn=>later(fn,0));
  const cancelFrame=win.cancelAnimationFrame?.bind(win)||clearLater;
  let frame=null,keyboardSignal=false;
  const clearKeyboard=()=>{
    style.removeProperty('--dock-keyboard-offset');
    dock.style.removeProperty('--dock-viewport-bottom');
    dock.style.removeProperty('--dock-keyboard-offset');
    dock.style.removeProperty('--dock-shell-height');
  };
  clearKeyboard();
  if(!viewport)return clearKeyboard;
  const searchFocused=()=>doc.activeElement===input&&field?.hidden===false&&dock.classList?.contains?.('is-searching');
  const update=()=>{
    frame=null;
    if(!keyboardSignal||!searchFocused()||Math.abs(viewport.scale-1)>.01){clearKeyboard();return;}
    const bottom=Number(viewport.height)+Number(viewport.offsetTop);
    const layoutHeight=Number(chrome?.getBoundingClientRect?.().bottom)||Number(win.innerHeight);
    const offset=Number.isFinite(bottom)&&Number.isFinite(layoutHeight)?layoutHeight-bottom:0;
    if(bottom>0&&offset>=80&&offset<=Math.min(420,layoutHeight*.65)){
      style.setProperty('--dock-keyboard-offset',offset+'px');
    }else clearKeyboard();
  };
  const schedule=()=>{if(frame===null)frame=requestFrame(update);};
  const viewportResize=()=>{if(searchFocused())keyboardSignal=true;schedule();};
  const viewportScroll=()=>{if(keyboardSignal)schedule();};
  const focus=()=>{keyboardSignal=false;clearKeyboard();};
  const reset=()=>{
    keyboardSignal=false;clearKeyboard();
    if(frame!==null){cancelFrame(frame);frame=null;}
  };
  viewport.addEventListener('resize',viewportResize);viewport.addEventListener('scroll',viewportScroll);
  input.addEventListener('focus',focus);input.addEventListener('blur',reset);
  const orientationReset=()=>reset();
  win.addEventListener('resize',viewportResize);win.addEventListener('pagehide',clearKeyboard);
  win.addEventListener('pageshow',reset);win.addEventListener('orientationchange',orientationReset);
  const visibility=()=>{if(doc.visibilityState==='visible')reset();else clearKeyboard();};
  doc.addEventListener?.('visibilitychange',visibility);
  return ()=>{
    clearKeyboard();
    if(frame!==null)cancelFrame(frame);
    viewport.removeEventListener('resize',viewportResize);viewport.removeEventListener('scroll',viewportScroll);
    input.removeEventListener('focus',focus);input.removeEventListener('blur',reset);
    win.removeEventListener('resize',viewportResize);win.removeEventListener('pagehide',clearKeyboard);
    win.removeEventListener('pageshow',reset);win.removeEventListener('orientationchange',orientationReset);
    doc.removeEventListener?.('visibilitychange',visibility);
  };
}
