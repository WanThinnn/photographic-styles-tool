// Render copy before downloading the converter's module graph. The HTML also
// carries English fallbacks, so a cold/failed script load never leaves blank UI.
import {applyLanguage,pickLanguage,rememberLanguage,t} from './i18n.js';
import {AI_STRINGS} from './ai-strings.js';
const selector=document.getElementById('lang'),boot=document.getElementById('boot');
// Native selects can match :focus-visible after a tap. Keep keyboard focus on
// the surrounding pill, without painting a rectangular ring inside it on iOS.
for(const control of [selector,document.getElementById('depth-model')]){
  control.addEventListener('pointerdown',()=>control.setAttribute('data-pointer-focus',''));
  control.addEventListener('blur',()=>control.removeAttribute('data-pointer-focus'));
  control.addEventListener('keydown',()=>control.removeAttribute('data-pointer-focus'));
}
const formatTip=document.getElementById('ios-format-tip'),drop=document.getElementById('drop');
const ios=/iPhone|iPad|iPod/i.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1;
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
  applyLanguage(lang);document.getElementById('ai-portrait-label').textContent=strings.toggle;
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
  boot.textContent=t(selector.value,'err.resources');boot.className='err';
  const retry=document.createElement('button');retry.className='dl alt';retry.type='button';
  retry.textContent=t(selector.value,'btn.retry');retry.onclick=()=>location.reload();
  boot.append(document.createElement('br'),retry);
}
