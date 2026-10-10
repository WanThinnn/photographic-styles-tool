import test from 'node:test';
import assert from 'node:assert/strict';
import {detailModel,validateDetailAsset} from '../../web/src/detail/detail-models.js';
import {inferDetailTiles,recommendedDetailWorkers,recommendedWasmThreads} from '../../web/src/detail/detail-inference.js';
import {assertDetailRasterAllowed} from '../../web/src/detail/detail-raster.js';

test('3 verified AI families are separately selected and bounded',()=>{
 assert.equal(detailModel('lite').family,'1x SuperScale SPAN');
 assert.equal(detailModel('standard').family,'1x SuperScale RPLKSR-S');
 assert.equal(detailModel('pro').family,'1x Fatality DeBlur');
 assert.equal(detailModel('lite').tile,384);
 assert.equal(detailModel('standard').webgpuWorkers,4);
 assert.equal(detailModel('pro').webgpuWorkers,1);
 assert.throws(()=>detailModel('random'),RangeError);
});

test('desktop WebGPU uses measured worker pool while Pro stays single-session',()=>{
 const desktop={hardwareConcurrency:12,isolated:true,shared:true};
 assert.equal(recommendedDetailWorkers('lite','webgpu',desktop),2);
 assert.equal(recommendedDetailWorkers('standard','webgpu',desktop),4);
 assert.equal(recommendedDetailWorkers('pro','webgpu',desktop),1);
 assert.equal(recommendedDetailWorkers('standard','wasm',desktop),1);
 assert.equal(recommendedDetailWorkers('standard','webgpu',{...desktop,hardwareConcurrency:8}),2);
 assert.equal(recommendedDetailWorkers('standard','webgpu',{...desktop,hardwareConcurrency:6}),1);
 assert.equal(recommendedWasmThreads({hardwareConcurrency:12,isolated:true}),4);
 assert.equal(recommendedWasmThreads({hardwareConcurrency:12,isolated:false}),1);
});
test('reject invalid/truncated model manifests instead of silently substituting a model',()=>{
 const valid={file:'model.onnx',family:'rplksr',bytes:200,sha256:'a'.repeat(64),
   channels:3,layout:'rgb',output:'rgb'};
 assert.equal(validateDetailAsset(valid),valid);
 assert.throws(()=>validateDetailAsset({...valid,sha256:'x'.repeat(64)}));
 assert.throws(()=>validateDetailAsset({...valid,channels:4}));
 assert.throws(()=>validateDetailAsset({...valid,output:'rgb-upscale'}));
});
test('SDR memory and HDR constraints fail before inference',()=>{
 assert.doesNotThrow(()=>assertDetailRasterAllowed(4032,3024));
 assert.throws(()=>assertDetailRasterAllowed(6000,4000),/memory limit/);
 assert.throws(()=>assertDetailRasterAllowed(1024,1024,{hdr:true}),/HDR/);
});
test('worker-backed AI results do not mutate caller pixels or fall back to a fake model',async()=>{
 const image={width:4,height:4,data:new Uint8ClampedArray(64).fill(80)};
 const source=image.data.slice();
 let posted,terminated=0,worker;
 const factory=()=>worker={
   postMessage(message){posted=message;queueMicrotask(()=>this.onmessage({data:{result:{data:new Uint8ClampedArray(message.rgba),width:4,height:4}}}));},
   terminate(){terminated++;},
 };
 const result=await inferDetailTiles(image,{modelId:'lite',provider:'wasm',workerFactory:factory,timeoutMs:1000});
 assert.deepEqual(image.data,source);
 assert.notStrictEqual(posted.rgba,image.data);
 assert.equal(result.width,4);
 assert.equal(terminated,1);
 await assert.rejects(inferDetailTiles(image,{modelId:'unknown',workerFactory:factory}),/Unsupported detail model/);
});

test('explicit worker pool shares one image buffer and aggregates progress safely',async()=>{
 const width=800,height=4,image={width,height,data:new Uint8ClampedArray(width*height*4)};
 for(let i=0;i<image.data.length;i++)image.data[i]=i%251;
 let terminated=0,created=0,lastProgress;
 const factory=()=>{
  created++;
  return {
   postMessage(message){
    const input=new Uint8ClampedArray(message.sharedInput),output=new Uint8ClampedArray(message.sharedOutput);
    output.set(input);
    queueMicrotask(()=>{
     this.onmessage({data:{stage:'inference',progress:{done:message.tileIndices.length,total:message.tileIndices.length}}});
     this.onmessage({data:{complete:true}});
    });
   },
   terminate(){terminated++;},
  };
 };
 const result=await inferDetailTiles(image,{modelId:'lite',provider:'webgpu',workerCount:2,workerFactory:factory,
   timeoutMs:1000,onProgress:progress=>{if(progress.stage==='inference')lastProgress=progress;}});
 assert.equal(created,2);assert.equal(terminated,2);
 assert.deepEqual(result.data,image.data);
 assert.equal(lastProgress.progress.done,lastProgress.progress.total);
 assert.equal(lastProgress.workers,2);
});

test('total time budget terminates an unresponsive model worker',async()=>{
  let terminated=0;
  await assert.rejects(inferDetailTiles({width:2,height:2,data:new Uint8ClampedArray(16)},{
    workerFactory:()=>({postMessage(){},terminate(){terminated++;}}),timeoutMs:1000,maxTotalMs:10
  }),/total time budget/);
  assert.equal(terminated,1);
});

test('abort terminates session; no fallback if AI is cancelled',async()=>{
 const c=new AbortController();
 let terminated=0;
 const promise=inferDetailTiles({width:2,height:2,data:new Uint8ClampedArray(16)},{
   signal:c.signal,workerFactory:()=>({postMessage(){},terminate(){terminated++;}}),timeoutMs:2000
 });
 c.abort();
 await assert.rejects(promise,/aborted|Abort/i);
 assert.equal(terminated,1);
});
