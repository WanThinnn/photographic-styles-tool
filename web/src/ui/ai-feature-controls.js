/**
 * The master switch starts Portrait by default. Other effects are opt-in.
 * Turning the group off clears enabled
 * effects and dispatches their change handlers so running jobs can be cancelled.
 */
export function createAiFeatureControls({master,features,isAvailable=()=>true}){
  if(!master||!features||typeof features!=='object')throw new TypeError('AI controls are required');
  const controls=new Map(Object.entries(features));
  const enabled=name=>{
    const control=controls.get(name);
    if(!control)throw new RangeError('Unknown AI feature');
    return Boolean(master.checked&&control.checked);
  };
  const sync=()=>{
    const available=Boolean(isAvailable());
    master.disabled=!available;
    for(const control of controls.values())control.disabled=!available;
  };
  for(const control of controls.values())control.addEventListener('change',()=>{
    if(control.checked&&!master.checked){
      // A feature selected from AI Settings implicitly enables the group without
      // also forcing Portrait on. The outer Smart Enhance switch reflects it.
      master.checked=true;
      sync();
    }
  });
  master.addEventListener('change',()=>{
    if(master.checked){
      const portrait=controls.get('portrait');
      if(portrait&&!portrait.checked){
        portrait.checked=true;
        portrait.dispatchEvent(new Event('change'));
      }
    }else{
      for(const control of controls.values()){
        if(!control.checked)continue;
        control.checked=false;
        // Reuse feature-specific teardown/cancellation instead of running it twice.
        control.dispatchEvent(new Event('change'));
      }
    }
    sync();
  });
  sync();
  return {enabled,sync};
}

export function showAiSettingsHintOnce({hint,settings,storage}){
  // The gradient ring remains as a quiet affordance after discovery; only its
  // first-run motion and explanatory copy are one-shot.
  const key='stylio-ai-settings-hint-v2';
  const summary=settings.querySelector('summary')||document.getElementById('open-ai-settings');
  try{
    storage??=globalThis.localStorage;
    if(storage?.getItem(key)==='opened'){summary.classList.add('ai-settings-discovered');return;}
  }catch{} // Storage restrictions must not break the AI controls.
  hint.hidden=false;
  summary.setAttribute('aria-describedby',hint.id);
  summary.addEventListener('click',()=>{
    hint.hidden=true;
    summary.removeAttribute('aria-describedby');
    summary.classList.add('ai-settings-discovered');
    try{storage?.setItem(key,'opened');}catch{}
  },{once:true});
}
