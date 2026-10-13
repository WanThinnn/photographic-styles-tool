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
    for(const control of controls.values())control.disabled=!available||!master.checked;
  };
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
  const key='stylio-ai-settings-hint-v1';
  try{
    storage??=globalThis.localStorage;
    if(storage?.getItem(key)==='shown')return;
    storage?.setItem(key,'shown');
  }catch{} // Storage restrictions must not break the AI controls.
  hint.hidden=false;
  const summary=settings.querySelector('summary');
  summary.setAttribute('aria-describedby',hint.id);
  summary.addEventListener('click',()=>{
    hint.hidden=true;
    summary.removeAttribute('aria-describedby');
  },{once:true});
}
