import {waitForVisiblePage} from '../../ui/processing-scheduler.js';

// One FIFO shared by picker, drop and optional reprocessing. A lane never runs
// two jobs at once; changing the limit affects the next start, not an active job.
export function createTaskQueue({run,concurrency=()=>1,onChange=()=>{},waitUntilVisible=waitForVisiblePage}={}){
  const waiting=[],active=new Set();
  let scheduled=false;
  const snapshot=()=>({active:active.size,queued:waiting.length,pending:active.size+waiting.length});
  const notify=()=>onChange(snapshot());
  function pump(){
    scheduled=false;
    const limit=concurrency()===2?2:1;
    while(active.size<limit&&waiting.length){
      const index=waiting.findIndex(job=>job.lane===undefined||!active.has(job.lane));
      if(index<0)break;
      const job=waiting.splice(index,1)[0];
      const lane=job.lane??([0,1].find(index=>!active.has(index)));
      active.add(lane);notify();
      Promise.resolve().then(waitUntilVisible).then(()=>run(job.value,lane))
        .then(job.resolve,job.reject).finally(()=>{active.delete(lane);notify();schedule();});
    }
  }
  function schedule(){if(!scheduled){scheduled=true;queueMicrotask(pump);}}
  return {
    enqueue(values){
      const jobs=values.map(value=>new Promise((resolve,reject)=>{
        waiting.push({value,lane:value.lane,resolve,reject});
      }));
      notify();schedule();return Promise.all(jobs);
    },
    refresh:schedule,
    snapshot,
  };
}
