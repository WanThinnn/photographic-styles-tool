// Manual UI fixture: real shell/result modules, no image pipeline, models or SW.
import {applyLanguage,pickLanguage,t} from '/src/ui/i18n.js';
import {AI_STRINGS} from '/src/ui/ai-strings.js';
import {getAppShell} from '/src/ui/shell/app-shell.js';
import {createResultView} from '/src/ui/results/result-view.js';
const $=id=>document.getElementById(id),T=key=>t($('lang').value,key);
const fixtureParams=new URL(location.href).searchParams;
const requestedLanguage=fixtureParams.get('lang');
$('lang').value=['vi','en','zh'].includes(requestedLanguage)?requestedLanguage:pickLanguage();applyLanguage($('lang').value);
if(['light','dark'].includes(fixtureParams.get('theme')))document.documentElement.dataset.theme=fixtureParams.get('theme');
const shell=getAppShell();
$('lang').addEventListener('change',()=>{applyLanguage($('lang').value);shell.render();});
$('boot').textContent='UI fixture — no image processing or model downloads';
const urls=new Set(),cleanups=new Set();
const row=createResultView({list:$('list'),T,aiText:()=>AI_STRINGS.en,
  resultUrls:urls,resultCleanups:cleanups,aiCandidates:[],livePhotos:[],liveMovies:new Map(),
  aiFeatures:{enabled:()=>false},refreshHistoryButton(){},shell});
const tools=document.createElement('div');tools.className='fixture-tools';
tools.style.cssText='display:flex;gap:8px;flex-wrap:wrap;padding:12px;border:1px dashed currentColor;margin-bottom:16px';
document.querySelector('main').prepend(tools);
if(fixtureParams.get('state')==='resource-error'){
  tools.hidden=true;
  const boot=$('boot');boot.replaceChildren();boot.className='err app-error-banner';
  const icon=document.createElement('span');icon.className='app-error-icon';icon.setAttribute('aria-hidden','true');
  icon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.5M12 16.5h.01"/></svg>';
  const copy=document.createElement('span');copy.className='app-error-copy';copy.textContent=T('err.resources');
  const retry=document.createElement('button');retry.className='app-error-retry';retry.type='button';retry.textContent=T('btn.retry');
  boot.append(icon,copy,retry);
}
let result,version=0;
function action(label,fn){const button=document.createElement('button');button.type='button';button.textContent=label;button.addEventListener('click',fn);tools.append(button);}
action('Add sample result',()=>{
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#dce6f5"/><circle cx="300" cy="180" r="90" fill="#697db0"/><path d="M100 400q200-200 400 0" fill="#697db0"/></svg>';
  result=row('UI sample '+(++version),new File([svg],'sample.svg',{type:'image/svg+xml'}));
  result.output(new File(['fixture output '+version],'UI-test-'+version+'.HEIC'),{metadata:false});
  result.set(T('st.ready'),'ok');
});
action('Pending output',()=>result?.outputPending(true));
action('Publish new output',()=>{
  result?.output(new File(['fixture updated '+(++version)],'UI-test-'+version+'.HEIC'),{metadata:false});
  result?.outputPending(false);
});
action('Add failed result',()=>row('Failed UI sample').set('Simulated failure — the original is kept.','err'));
action('Light',()=>document.documentElement.dataset.theme='light');
action('Dark',()=>document.documentElement.dataset.theme='dark');
action('200% text',()=>document.documentElement.style.fontSize='200%');
action('Normal text',()=>document.documentElement.style.fontSize='');

// Hold a real gesture state for visual inspection without timing a screenshot
// between physical pointerdown/up. These controls never ship in the app.
const lensPointer=777;
function lensEvent(type,tab){
  const rect=tab.getBoundingClientRect();
  return new PointerEvent(type,{bubbles:true,pointerId:lensPointer,isPrimary:true,
    button:0,clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2});
}
action('Hold History lens',()=>{
  const tab=document.querySelector('[data-screen="history"]');
  tab.dispatchEvent(lensEvent('pointerdown',tab));
});
action('Drag lens to Guide',()=>{
  const tab=document.querySelector('[data-screen="guide"]');
  document.dispatchEvent(lensEvent('pointermove',tab));
});
action('Release tab lens',()=>{
  const tab=document.querySelector('[data-screen="guide"]');
  document.dispatchEvent(lensEvent('pointerup',tab));
});
