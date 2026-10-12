import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inferStyleEmbeddings,shouldRetainStyleWorker,canRetryStyleOnCpu} from '../../web/src/recommend/style-inference.js';
import {STYLE_EMBEDDING_DIMENSIONS} from '../../web/src/recommend/style-reference-bank.js';

const image={width:4,height:3,data:new Uint8Array(4*3*3).fill(127)};
const workerSource=readFileSync(new URL('../../web/src/recommend/style-inference-worker.js',import.meta.url),'utf8');
const oneHot=index=>{const value=new Float32Array(STYLE_EMBEDDING_DIMENSIONS);value[index%value.length]=1;return value;};

function respondingWorker(makeResult){
  let worker,terminated=0,message;
  worker={
    postMessage(payload){
      message=payload;
      queueMicrotask(()=>worker.onmessage({data:{result:{embeddings:makeResult(payload)}}}));
    },
    terminate(){terminated++;},
  };
  return {worker,get terminated(){return terminated;},get message(){return message;}};
}

test('WebGPU uses basic ORT graph optimization for the generated FP16 image-only graph',()=>{
  assert.match(workerSource,/provider==='webgpu'\)sessionOptions\.graphOptimizationLevel='basic'/);
});

test('Safari and iOS do not retain the TinyCLIP worker beside later AI models',()=>{
  for(const device of [
    {userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0) AppleWebKit/605.1.15 Version/27.0 Mobile Safari/604.1'},
    {userAgent:'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 CriOS/140 Mobile Safari/604.1'},
    {userAgent:'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/27.0 Safari/605.1.15'},
    {userAgent:'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15',platform:'MacIntel',maxTouchPoints:5},
  ])assert.equal(shouldRetainStyleWorker(device),false);
  assert.equal(shouldRetainStyleWorker({userAgent:'Mozilla/5.0 AppleWebKit/537.36 Chrome/140.0 Safari/537.36'}),true);
  assert.equal(canRetryStyleOnCpu(Error('no available backend found. ERR: [webgpu] RangeError: Out of memory')),true);
  assert.equal(canRetryStyleOnCpu(Object.assign(Error('cancelled'),{name:'AbortError'})),false);
});

test('inference transports shared provider/level budget and accepts normalized embeddings',async()=>{
  const fake=respondingWorker(payload=>payload.views.map((_,index)=>oneHot(index)));
  const result=await inferStyleEmbeddings(image,{level:'standard',provider:'wasm',workerFactory:()=>fake.worker});
  assert.equal(result.length,5);
  assert.equal(fake.message.provider,'wasm');
  assert.equal(fake.message.views.length,5);
  assert.equal(fake.message.rgb.length,image.data.length);
  assert.equal(fake.terminated,1);
});

test('invalid worker embedding shape or normalization fails closed',async()=>{
  for(const bad of [
    [new Float32Array(12)],
    [new Float32Array(STYLE_EMBEDDING_DIMENSIONS)],
    [Float32Array.from({length:STYLE_EMBEDDING_DIMENSIONS},()=>NaN)],
  ]){
    const fake=respondingWorker(()=>bad);
    await assert.rejects(inferStyleEmbeddings(image,{level:'lite',workerFactory:()=>fake.worker}),/embedding|normalized/i);
    assert.equal(fake.terminated,1);
  }
});

test('abort before run never constructs a worker',async()=>{
  const controller=new AbortController();controller.abort();
  let constructed=0;
  await assert.rejects(inferStyleEmbeddings(image,{signal:controller.signal,workerFactory:()=>{constructed++;throw Error('unexpected');}}),
    error=>error.name==='AbortError');
  assert.equal(constructed,0);
});

test('abort and timeout release an active style worker',async()=>{
  for(const mode of ['abort','timeout']){
    let terminated=0;
    const worker={postMessage(){},terminate(){terminated++;}};
    const controller=new AbortController();
    const pending=inferStyleEmbeddings(image,{level:'lite',signal:controller.signal,timeoutMs:5,workerFactory:()=>worker});
    if(mode==='abort')controller.abort();
    await assert.rejects(pending,error=>error.name===(mode==='abort'?'AbortError':'TimeoutError'));
    assert.equal(terminated,1);
  }
});

test('bad image pixels are rejected before worker construction',async()=>{
  let constructed=0;
  await assert.rejects(inferStyleEmbeddings({width:2,height:2,data:new Uint8Array(3)},{workerFactory:()=>{constructed++;return {};}}),/packed RGB/);
  assert.equal(constructed,0);
});
