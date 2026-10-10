// Safari may throttle a hidden tab. Start the next conversion only after the
// page is visible, rather than keeping a multi-photo batch running off screen.
export function waitForVisiblePage(doc=globalThis.document){
  if(!doc?.hidden)return Promise.resolve();
  return new Promise(resolve=>{
    const visible=()=>{if(!doc.hidden){doc.removeEventListener('visibilitychange',visible);resolve();}};
    doc.addEventListener('visibilitychange',visible);visible();
  });
}
