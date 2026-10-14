// Render copy before downloading the converter's module graph. The HTML also
// carries English fallbacks, so a cold/failed script load never leaves blank UI.
import {applyLanguage,pickLanguage,rememberLanguage,t} from './i18n.js';
import {AI_STRINGS} from './ai-strings.js';
import {getAppShell} from './shell/app-shell.js';
const shell=getAppShell();
const selector=document.getElementById('lang'),boot=document.getElementById('boot');
function showBootError(message,retryLabel){
  boot.replaceChildren();boot.className='err app-error-banner';
  const icon=document.createElement('span');icon.className='app-error-icon';icon.setAttribute('aria-hidden','true');
  icon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.5M12 16.5h.01"/></svg>';
  const copy=document.createElement('span');copy.className='app-error-copy';copy.textContent=message;
  const retry=document.createElement('button');retry.className='app-error-retry';retry.type='button';retry.textContent=retryLabel;retry.onclick=()=>location.reload();
  boot.append(icon,copy,retry);
}
const previewToggle=document.getElementById('result-preview');
const previewKey='stylio-result-preview-v1';
const themeKey='stylio-theme-v1',themeButtons=[...document.querySelectorAll('[data-theme-value]')];
let themeTransitionTimer;
function currentTheme(){try{const value=localStorage.getItem(themeKey);return ['light','dark','system'].includes(value)?value:'system';}catch{return 'system';}}
function applyTheme(theme,{persist=false,animate=false}={}){
  const root=document.documentElement;
  if(animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
    root.classList.add('theme-transition');void root.offsetWidth;
    clearTimeout(themeTransitionTimer);
    themeTransitionTimer=setTimeout(()=>root.classList.remove('theme-transition'),280);
  }
  if(theme==='system')delete root.dataset.theme;
  else root.dataset.theme=theme;
  for(const button of themeButtons){
    const selected=button.dataset.themeValue===theme;
    button.classList.toggle('is-selected',selected);button.setAttribute('aria-pressed',String(selected));
  }
  if(persist)try{localStorage.setItem(themeKey,theme);}catch{}
}
applyTheme(currentTheme());
for(const button of themeButtons)button.addEventListener('click',()=>applyTheme(button.dataset.themeValue,{persist:true,animate:true}));

const topBar=document.querySelector('.top');
let topBarFrame=0;
function syncTopBarDivider(){
  topBarFrame=0;
  topBar?.classList.toggle('has-scroll-divider',window.scrollY>12);
}
function queueTopBarDivider(){
  if(!topBarFrame)topBarFrame=requestAnimationFrame(syncTopBarDivider);
}
window.addEventListener('scroll',queueTopBarDivider,{passive:true});
window.addEventListener('pageshow',syncTopBarDivider);
syncTopBarDivider();

const installGuide=document.getElementById('ios-install-guide');
const installGuideContinue=document.getElementById('install-guide-continue');
const appMain=document.querySelector('main');
const userAgent=navigator.userAgent||'';
const iphoneSafari=/iPhone|iPod/i.test(userAgent)
  &&/AppleWebKit/i.test(userAgent)
  &&/Safari/i.test(userAgent)
  &&!/(CriOS|FxiOS|EdgiOS|OPiOS)/i.test(userAgent);
const standalone=navigator.standalone===true||matchMedia('(display-mode: standalone)').matches;
function closeInstallGuide(){
  installGuide.hidden=true;
  document.body.classList.remove('is-install-guide-open');
  appMain?.removeAttribute('inert');
}
if(iphoneSafari&&!standalone){
  installGuide.hidden=false;
  document.body.classList.add('is-install-guide-open');
  appMain?.setAttribute('inert','');
}
installGuideContinue?.addEventListener('click',closeInstallGuide);

if(previewToggle){
  try{previewToggle.checked=localStorage.getItem(previewKey)!=='off';}catch{previewToggle.checked=true;}
  previewToggle.addEventListener('change',()=>{try{localStorage.setItem(previewKey,previewToggle.checked?'on':'off');}catch{}});
}
// Native selects can match :focus-visible after a tap. Keep keyboard focus on
// the surrounding pill, without painting a rectangular ring inside it on iOS.
for(const control of [selector,document.getElementById('depth-model')]){
  control.addEventListener('pointerdown',()=>control.setAttribute('data-pointer-focus',''));
  control.addEventListener('blur',()=>control.removeAttribute('data-pointer-focus'));
  control.addEventListener('keydown',()=>control.removeAttribute('data-pointer-focus'));
}
const formatTip=document.getElementById('ios-format-tip'),drop=document.getElementById('drop');
const ios=/iPhone|iPad|iPod/i.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1;
// Standalone Stylio behaves like a native photo app: page zoom would detach the
// fixed glass dock from the app shell. The viewport/CSS handle modern Safari;
// gesture events cover iOS WebKit builds that still allow pinch despite them.
if(ios){
  const stopPageZoom=event=>event.preventDefault();
  for(const type of ['gesturestart','gesturechange','gestureend'])document.addEventListener(type,stopPageZoom,{passive:false});
}
const formatTipKey='photo-format-tip-dismissed-v1';
let formatTipDismissed=false;
try{formatTipDismissed=localStorage.getItem(formatTipKey)==='1';}catch{}
formatTip.hidden=!ios||formatTipDismissed;
if(!formatTip.hidden)drop.setAttribute('aria-describedby','ios-format-copy');
document.getElementById('ios-format-dismiss').addEventListener('click',()=>{
  formatTip.hidden=true;drop.removeAttribute('aria-describedby');
  try{localStorage.setItem(formatTipKey,'1');}catch{}
});
function render(){
  const lang=selector.value,strings=AI_STRINGS[lang]||AI_STRINGS.en;
  document.getElementById('enhance-ai-label').textContent=strings.masterToggle;
  applyLanguage(lang);document.getElementById('ai-portrait-label').textContent=strings.toggle;
  shell.render();
  document.getElementById('ai-portrait-hint').textContent=strings.hint;
  document.getElementById('ai-settings-label').textContent=strings.settings;
  document.getElementById('gpu-acceleration-label').textContent=strings.acceleration;
  document.getElementById('gpu-acceleration-hint').textContent=strings.accelerationHint;
  for(const [id,key]of [['depth-model-label','model'],['depth-model-hint','modelHint'],['clear-assets-label','cleanup'],['clear-assets-hint','cleanupHint']])document.getElementById(id).textContent=strings[key];
  boot.textContent=t(lang,'st.preparing');
}
selector.value=pickLanguage();render();
const change=()=>{rememberLanguage(selector.value);render();};
selector.addEventListener('change',change);

const refreshApp=document.getElementById('refresh-app'),refreshStatus=document.getElementById('refresh-app-status');
refreshApp?.addEventListener('click',async()=>{
  refreshApp.disabled=true;refreshStatus.textContent=t(selector.value,'settings.updating');
  try{
    const registration=await navigator.serviceWorker?.getRegistration?.('./')||await navigator.serviceWorker?.getRegistration?.();
    await registration?.update?.();
    if(globalThis.caches){
      const names=await caches.keys();
      await Promise.all(names.filter(name=>name.startsWith('photographic-style-port-')).map(name=>caches.delete(name)));
    }
    try{await fetch(new URL('./index.html',location.href),{cache:'reload'});}catch{}
    await new Promise(resolve=>setTimeout(resolve,220));
    location.reload();
  }catch(error){
    console.warn('App update failed',error);
    refreshStatus.textContent=t(selector.value,'settings.updatefailed');
    refreshApp.disabled=false;
  }
});
async function loadApplication(){
  let lastError;
  for(let attempt=0;attempt<3;attempt++){
    try{
      await import(attempt===0?'../../app.js':`../../app.js?boot-retry=${attempt}-${Date.now()}`);
      return;
    }catch(error){
      lastError=error;
      if(attempt<2)await new Promise(resolve=>setTimeout(resolve,250*(attempt+1)));
    }
  }
  throw lastError;
}
try{
  await loadApplication();
  selector.removeEventListener('change',change);
}catch(error){
  console.error('Application scripts unavailable',error);
  showBootError(t(selector.value,'err.resources'),t(selector.value,'btn.retry'));
}
