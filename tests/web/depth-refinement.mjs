import test from 'node:test';import assert from 'node:assert/strict';
import {refineDepth} from '../../web/src/ai-depth-refinement.js';
import {portraitAssembler} from '../../web/src/ai-portrait-assembler.js';
import {inferDepth} from '../../web/src/ai-inference.js';

test('RGB-guided depth keeps a true silhouette sharp while preserving near/far direction',()=>{
  const w=48,h=8,rgb=new Uint8Array(w*h*3);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)rgb.set(x<w/2?[20,30,200]:[200,40,20],(y*w+x)*3);
  const depth=refineDepth(Float32Array.of(2,2,6,6,2,2,6,6),4,2,rgb,w,h);
  for(let y=0;y<h;y++){
    assert.ok(depth[y*w+23]<20,'background must not gather foreground depth');
    assert.ok(depth[y*w+24]>235,'subject remains near at the silhouette');
  }
  // Texture on one surface must not fabricate a new depth layer.
  for(let y=0;y<h;y++)for(let x=0;x<12;x++)rgb.set(x%2?[255,255,255]:[0,0,0],(y*w+x)*3);
  const textured=refineDepth(Float32Array.of(2,2,6,6,2,2,6,6),4,2,rgb,w,h);
  for(let y=0;y<h;y++)for(let x=0;x<12;x++)assert.equal(textured[y*w+x],0);
  assert.throws(()=>refineDepth(Float32Array.of(1,NaN),2,1,new Uint8Array(6),2,1),/Invalid AI/);
  assert.throws(()=>refineDepth(Float32Array.of(1,1),2,1,new Uint8Array(6),2,1),/flat/);
});

test('assembly worker abort/disposal rejects outstanding settings and releases buffers',async()=>{
  let terminated=0;const messages=[],controller=new AbortController();
  const assembler=portraitAssembler(new Uint8Array(10),{payload:new Uint8Array(2),hvcc:new Uint8Array(3)},{},{signal:controller.signal,
    workerFactory:()=>({postMessage:message=>messages.push(message),terminate(){terminated++;}})});
  const pending=assembler.build({focusX:.2});controller.abort();
  await assert.rejects(pending,error=>error.name==='AbortError');
  await assert.rejects(assembler.build(),error=>error.name==='AbortError');
  assembler.dispose();assert.equal(terminated,1);assert.equal(messages.length,2);
});

test('streaming model download is not incorrectly limited by the GPU phase deadline',async()=>{
  const events=[];let worker,terminated=0;
  const pending=inferDepth(new Uint8Array(3),{width:1,height:1},{timeoutMs:20,onProgress:stage=>events.push(stage),workerFactory:()=>worker={
    postMessage(){queueMicrotask(()=>worker.onmessage({data:{stage:'download',progress:{loaded:1}}}));
      setTimeout(()=>{worker.onmessage({data:{stage:'inference'}});worker.onmessage({data:{result:{gray:Uint8Array.of(2)}}});},45);},terminate(){terminated++;}}});
  assert.deepEqual((await pending).gray,Uint8Array.of(2));assert.deepEqual(events,['download','inference']);assert.equal(terminated,1);
});
