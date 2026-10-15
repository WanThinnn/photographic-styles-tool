// Wake locks are best-effort and apply only while visible processing is active.
// Epochs prevent a late request from leaving the screen awake after work ends.
export function createScreenAwake({nav=globalThis.navigator,doc=globalThis.document,enabled=()=>false,onState=()=>{}}={}){
  let busy=false,lock=null,pending=false,epoch=0,disposed=false;
  const wanted=()=>!disposed&&busy&&enabled()&&doc?.visibilityState!=='hidden';
  async function sync(){
    if(!wanted()){
      epoch++;const previous=lock;lock=null;
      if(previous)await previous.release().catch(()=>{});
      onState('off');return;
    }
    if(lock||pending)return;
    if(!nav?.wakeLock?.request){onState('unsupported');return;}
    const requestEpoch=epoch;pending=true;
    try{
      const acquired=await nav.wakeLock.request('screen');
      if(requestEpoch!==epoch||!wanted()){await acquired.release();return;}
      lock=acquired;onState('active');
      acquired.addEventListener?.('release',()=>{if(lock===acquired){lock=null;onState(wanted()?'unavailable':'off');}},{once:true});
    }catch{if(wanted())onState('unavailable');}
    finally{
      pending=false;
      if(requestEpoch!==epoch&&wanted())void sync();
    }
  }
  const visibility=()=>{void sync();};
  doc?.addEventListener?.('visibilitychange',visibility);
  return {
    setBusy(value){if(busy===Boolean(value))return;busy=Boolean(value);void sync();},
    refresh(){void sync();},
    dispose(){disposed=true;doc?.removeEventListener?.('visibilitychange',visibility);void sync();},
  };
}
