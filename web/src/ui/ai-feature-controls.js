/**
 * Independent, opt-in AI feature switches.
 *
 * The master switch grants access to the group; it must NEVER select an effect.
 * Each effect must be explicitly selected. Turning the group off clears enabled
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
    if(!master.checked){
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
