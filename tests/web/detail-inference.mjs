import test from 'node:test';
import assert from 'node:assert/strict';
import {detailModel,validateDetailAsset} from '../../web/src/detail/detail-models.js';
import {inferDetailTiles} from '../../web/src/detail/detail-inference.js';
import {assertDetailRasterAllowed} from '../../web/src/detail/detail-raster.js';

test('3 verified AI families are separately selected and bounded',()=>{
 assert.equal(detailModel('lite').family,'1x SuperScale SPAN');
 assert.equal(detailModel('standard').family,'1x SuperScale RPLKSR-S');
 assert.equal(detailModel('pro').family,'1x Fatality DeBlur');
 assert.throws(()=>detailModel('random'),RangeError);
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
