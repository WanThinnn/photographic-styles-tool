// The dock uses CSS dvh normally. Only a focused Search needs the visual
// viewport (the keyboard shrinks it without necessarily changing dvh).
// Never keep a keyboard inset after blur, and never compensate pinch zoom.
export function bindDockViewport({win=window,doc=document}={}){
  const dock=doc.querySelector('.app-dock'),input=doc.getElementById('history-search');
  const viewport=win.visualViewport;
  if(!dock||!input||!viewport)return ()=>{};
  let frame=null;
  const update=()=>{
    frame=null;
    if(doc.activeElement!==input||Math.abs(viewport.scale-1)>.01){
      dock.style.removeProperty('--dock-viewport-bottom');return;
    }
    const bottom=viewport.height+viewport.offsetTop;
    if(Number.isFinite(bottom)&&bottom>0)dock.style.setProperty('--dock-viewport-bottom',bottom+'px');
    else dock.style.removeProperty('--dock-viewport-bottom');
  };
  const schedule=()=>{if(frame===null)frame=win.requestAnimationFrame(update);};
  const blur=()=>{dock.style.removeProperty('--dock-viewport-bottom');schedule();};
  viewport.addEventListener('resize',schedule);viewport.addEventListener('scroll',schedule);
  input.addEventListener('focus',schedule);input.addEventListener('blur',blur);
  win.addEventListener('pageshow',schedule);win.addEventListener('orientationchange',schedule);
  return ()=>{
    if(frame!==null)win.cancelAnimationFrame(frame);
    viewport.removeEventListener('resize',schedule);viewport.removeEventListener('scroll',schedule);
    input.removeEventListener('focus',schedule);input.removeEventListener('blur',blur);
    win.removeEventListener('pageshow',schedule);win.removeEventListener('orientationchange',schedule);
    dock.style.removeProperty('--dock-viewport-bottom');
  };
}
