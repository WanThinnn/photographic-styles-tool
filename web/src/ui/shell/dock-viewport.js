// CSS owns the resting dock position. VisualViewport is used only for a real
// Search keyboard resize. Standalone iOS PWAs can resume with a stale fixed
// compositor snapshot; repeated hidden one-pixel scroll nudges refresh that
// snapshot after WebKit finishes restoring the Home Screen scene.
export function bindDockViewport({win=window,doc=document}={}){
  const dock=doc.querySelector('.app-dock'),input=doc.getElementById('history-search');
  const field=doc.getElementById('history-search-field'),viewport=win.visualViewport;
  if(!dock||!input||!viewport)return ()=>{};
  const later=win.setTimeout?.bind(win)||setTimeout,cancelLater=win.clearTimeout?.bind(win)||clearTimeout;
  let frame=null,keyboardSignal=false,recalibrateFrame=null,restoreFrame=null,retryTimers=[];
  const standalone=()=>win.matchMedia?.('(display-mode: standalone)')?.matches===true||win.navigator?.standalone===true;
  const clear=()=>{
    dock.style.removeProperty('--dock-viewport-bottom');
    dock.style.removeProperty('--dock-keyboard-offset');
  };
  const searchFocused=()=>doc.activeElement===input&&field?.hidden===false&&dock.classList?.contains?.('is-searching');
  const update=()=>{
    frame=null;
    if(!keyboardSignal||!searchFocused()||Math.abs(viewport.scale-1)>.01){clear();return;}
    const bottom=Number(viewport.height)+Number(viewport.offsetTop),layoutHeight=Number(win.innerHeight);
    const offset=Number.isFinite(bottom)&&Number.isFinite(layoutHeight)?layoutHeight-bottom:0;
    if(bottom>0&&offset>=80&&offset<=Math.min(420,layoutHeight*.65)){
      dock.style.setProperty('--dock-viewport-bottom',bottom+'px');
      dock.style.setProperty('--dock-keyboard-offset',offset+'px');
    }else clear();
  };
  const schedule=()=>{if(frame===null)frame=win.requestAnimationFrame(update);};
  const cancelPulse=()=>{
    if(recalibrateFrame!==null){win.cancelAnimationFrame(recalibrateFrame);recalibrateFrame=null;}
    if(restoreFrame!==null){win.cancelAnimationFrame(restoreFrame);restoreFrame=null;}
    dock.classList?.remove?.('is-viewport-recalibrating');
  };
  const cancelRecalibration=()=>{
    cancelPulse();
    for(const timer of retryTimers)cancelLater(timer);
    retryTimers=[];
  };
  const pulseViewport=()=>{
    if(!standalone()||typeof win.scrollTo!=='function'||searchFocused()||doc.visibilityState==='hidden')return;
    cancelPulse();
    dock.classList?.add?.('is-viewport-recalibrating');
    recalibrateFrame=win.requestAnimationFrame(()=>{
      recalibrateFrame=null;
      const x=Number(win.scrollX)||0,y=Number(win.scrollY)||0,delta=y>0?-1:1;
      win.scrollTo(x,y+delta);
      restoreFrame=win.requestAnimationFrame(()=>{
        restoreFrame=null;win.scrollTo(x,y);
        // Force a geometry read before revealing the composited glass layer.
        void dock.getBoundingClientRect?.();
        dock.classList?.remove?.('is-viewport-recalibrating');
      });
    });
  };
  const recalibrate=()=>{
    keyboardSignal=false;clear();cancelRecalibration();
    if(!standalone()||searchFocused())return;
    // The first pulse handles normal launches. Delayed retries cover the iOS
    // warm-resume path where fixed/backdrop layers settle hundreds of ms later.
    pulseViewport();
    for(const delay of [90,280,650]){
      let timer;
      timer=later(()=>{
        retryTimers=retryTimers.filter(id=>id!==timer);
        pulseViewport();
      },delay);
      retryTimers.push(timer);
    }
  };
  const viewportResize=()=>{if(searchFocused())keyboardSignal=true;schedule();};
  const viewportScroll=()=>{if(keyboardSignal)schedule();};
  const focus=()=>{cancelRecalibration();keyboardSignal=false;clear();};
  const reset=()=>{keyboardSignal=false;clear();if(frame!==null){win.cancelAnimationFrame(frame);frame=null;}cancelRecalibration();};
  const resume=()=>{reset();recalibrate();};
  viewport.addEventListener('resize',viewportResize);viewport.addEventListener('scroll',viewportScroll);
  input.addEventListener('focus',focus);input.addEventListener('blur',reset);
  win.addEventListener('pagehide',reset);win.addEventListener('pageshow',resume);win.addEventListener('orientationchange',resume);
  const visibility=()=>{if(doc.visibilityState!=='visible')reset();else recalibrate();};
  doc.addEventListener?.('visibilitychange',visibility);
  recalibrate();
  return ()=>{
    reset();
    viewport.removeEventListener('resize',viewportResize);viewport.removeEventListener('scroll',viewportScroll);
    input.removeEventListener('focus',focus);input.removeEventListener('blur',reset);
    win.removeEventListener('pagehide',reset);win.removeEventListener('pageshow',resume);win.removeEventListener('orientationchange',resume);
    doc.removeEventListener?.('visibilitychange',visibility);
  };
}
