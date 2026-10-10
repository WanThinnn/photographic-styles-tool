import test from 'node:test';import assert from 'node:assert/strict';
import {refineDepth,refineDepthEdges,depthEnvelope,shapeAiDisparity,AI_DISPARITY_MAX} from '../../web/src/portrait/ai-depth-refinement.js';
import {portraitAssembler,latestSettingsWriter} from '../../web/src/portrait/ai-portrait-assembler.js';
import {protectPersonDepth} from '../../web/src/portrait/person-depth-guidance.js';
import {inferDepth} from '../../web/src/portrait/ai-inference.js';

test('F depth response preserves ordering and reduces near-object defocus relative to distant background',()=>{
  const original=Uint8Array.of(2,65,118,166,255),shaped=shapeAiDisparity(original);
  assert.deepEqual(original,Uint8Array.of(2,65,118,166,255),'never alter the input');
  assert.deepEqual(shaped,Uint8Array.of(23,129,173,206,255));
  const beforeNear=original[3]-original[1],afterNear=(shaped[3]-shaped[1])*AI_DISPARITY_MAX;
  const beforeFar=original[1]-original[0],afterFar=(shaped[1]-shaped[0])*AI_DISPARITY_MAX;
  assert.ok(afterNear<beforeNear);assert.ok(afterFar>beforeFar);
  const ramp=shapeAiDisparity(Uint8Array.from({length:256},(_,i)=>i));
  assert.equal(ramp[0],0);assert.equal(ramp[255],255);
  assert.ok(ramp.every((v,i)=>i===0||v>=ramp[i-1]));
});

test('fast depth envelope matches a square scan at borders, tiny dimensions and tied values',()=>{
  for(const [w,h]of [[1,1],[1,19],[19,1],[23,17]])for(const radius of [0,1,4,32]){
    const values=Float32Array.from({length:w*h},(_,i)=>(i*79%13)/13),[minimum,maximum]=depthEnvelope(values,w,h,radius);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      let min=1,max=0;
      for(let ay=Math.max(0,y-radius);ay<=Math.min(h-1,y+radius);ay++)for(let ax=Math.max(0,x-radius);ax<=Math.min(w-1,x+radius);ax++){
        min=Math.min(min,values[ay*w+ax]);max=Math.max(max,values[ay*w+ax]);
      }
      assert.equal(minimum[y*w+x],Math.fround(min*255));assert.equal(maximum[y*w+x],Math.fround(max*255));
    }
  }
});

test('person guidance protects an eroded confident edge without expanding it into background or uncertain hair',()=>{
  const w=128,h=24,gray=new Uint8Array(w*h),person=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x;gray[i]=x>=65?190+y:x===64?145:35;person[i]=x>=65?255:x===64?240:0;
  }
  const original=gray.slice(),fixed=protectPersonDepth(gray,person,w,h);
  for(let y=0;y<h;y++)assert.ok(fixed[y*w+64]>gray[y*w+64],'confident eroded subject boundary moves toward interior');
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(x!==64)assert.equal(fixed[y*w+x],gray[y*w+x],'background and subject 3D shape stay intact');
  assert.deepEqual(gray,original,'input map is immutable');
  person.fill(128);assert.deepEqual(protectPersonDepth(gray,person,w,h),gray,'uncertain matte cannot pull depth forward');
  person.fill(0);assert.deepEqual(protectPersonDepth(gray,person,w,h),gray,'empty template masks do nothing');
  person.fill(255);assert.deepEqual(protectPersonDepth(gray,person,w,h),gray,'no segmentation boundary means no correction');
  person.fill(240);const shallow=new Uint8Array(w*h).fill(100);assert.deepEqual(protectPersonDepth(shallow,person,w,h),shallow);
  assert.throws(()=>protectPersonDepth(gray,person,0,h),/geometry/);
});

test('slow settings writes serialize and coalesce intermediate slider values; flush awaits the newest',async()=>{
  const calls=[],releases=[];let active=0,maxActive=0;
  const write=latestSettingsWriter(async(value,isCurrent)=>{
    active++;maxActive=Math.max(active,maxActive);calls.push(value);
    await new Promise(resolve=>releases.push(resolve));active--;
    if(value===1)assert.equal(isCurrent(),false);
  });
  const first=write(1);await Promise.resolve();
  write(2);const latest=write(3);assert.equal(first,latest);
  releases.shift()();await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(calls,[1,3]);assert.equal(active,1);releases.shift()();await latest;
  assert.equal(maxActive,1);assert.equal(active,0);
  const last=write(4);await Promise.resolve();releases.shift()();await last;assert.deepEqual(calls,[1,3,4]);
});

test('a stale settings error does not discard the newest requested write',async()=>{
  let reject;const calls=[];
  const write=latestSettingsWriter(async value=>{calls.push(value);if(value===1)await new Promise((_,fail)=>reject=fail);});
  const first=write(1);await Promise.resolve();write(2);reject(Error('old request failed'));await first;
  assert.deepEqual(calls,[1,2]);
});

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

test('RGB edge refinement reduces depth bleeding without fabricating texture geometry',()=>{
  const w=128,h=32,rgb=new Uint8Array(w*h*3),ramp=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    rgb.set(x<64?[18,35,190]:[200,40,20],(y*w+x)*3);
    ramp[y*w+x]=Math.round(255*Math.max(0,Math.min(1,(x-57)/14)));
  }
  const refined=refineDepthEdges(ramp,rgb,w,h);
  const error=map=>{let total=0;for(let y=0;y<h;y++)for(let x=61;x<=66;x++)total+=Math.abs(map[y*w+x]-(x<64?0:255));return total;};
  assert.ok(error(refined)<error(ramp)*.85,`colour-guided boundary error ${error(refined)} vs ${error(ramp)}`);
  for(let i=0;i<ramp.length;i++)assert.ok(Math.abs(refined[i]-ramp[i])<=24,'RGB textures cannot create a deep hole');
  const constant=new Uint8Array(w*h).fill(132);
  assert.deepEqual(refineDepthEdges(constant,rgb,w,h),constant,'a colour edge alone is not a depth boundary');
  assert.deepEqual(ramp.slice(0,45),refined.slice(0,45),'distant flat background remains intact');
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
