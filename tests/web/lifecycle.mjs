import test from 'node:test';
import assert from 'node:assert/strict';
import {inferDepth,awaitAiSource,depthWorkerFailure,canRetryDepth} from '../../web/src/portrait/ai-inference.js';
import {releaseLibheif} from '../../web/src/codecs/libheif-lifecycle.js';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {waitForVisiblePage} from '../../web/src/ui/processing-scheduler.js';
import {clearDownloadedAssets} from '../../web/src/core/cache-cleanup.js';
import {MODEL_CACHE_NAME} from '../../web/src/core/model-download.js';
import {depthModel,asDisparity} from '../../web/src/portrait/depth-models.js';

test('download cleanup is scoped and preserves photos, shell, and sibling projects',async()=>{
  const entries=new Map([
    [MODEL_CACHE_NAME,new Map([
      ['https://example.com/tool/vendor/ai-portrait/pro-model.onnx_data?sha256=p',new Response('weights',{headers:{'content-length':'7'}})],
      ['https://example.com/other/vendor/ai-portrait/model.onnx',new Response('other')],
      ['https://example.com/tool/photo.heic',new Response('photo')],
    ])],
    ['photographic-style-port-v100',new Map([['https://example.com/tool/index.html',new Response('shell')]])],
    ['unrelated-app',new Map([['https://example.com/tool/vendor/ai-portrait/model.onnx',new Response('other cache')]])],
  ]);
  const cacheStorage={keys:async()=>[...entries.keys()],open:async name=>{
    const map=entries.get(name);return {keys:async()=>[...map.keys()].map(url=>({url})),match:async r=>map.get(r.url),delete:async r=>map.delete(r.url)};
  }};
  assert.deepEqual(await clearDownloadedAssets({cacheStorage,base:'https://example.com/tool/'}),{count:1,bytes:7});
  assert.equal(entries.get(MODEL_CACHE_NAME).size,2);assert.equal(entries.get('photographic-style-port-v100').size,1);assert.equal(entries.get('unrelated-app').size,1);
  assert.deepEqual(await clearDownloadedAssets({cacheStorage,base:'https://example.com/tool/'}),{count:0,bytes:0});
  await assert.rejects(clearDownloadedAssets({cacheStorage:null}),/unavailable/);
});

test('depth choices reject unknown models and convert positive V3 depth to near-bright disparity',()=>{
  assert.equal(depthModel().label,'Standard');assert.equal(depthModel('lite').files.length,1);assert.equal(depthModel('pro').rank,5);
  assert.throws(()=>depthModel('__proto__'),/Unsupported/);
  const depth=Float32Array.of(1,2,4);assert.deepEqual(asDisparity(depth,'depth'),Float32Array.of(1,.5,.25));assert.deepEqual(depth,Float32Array.of(1,2,4));
  for(const value of [0,-1,NaN,Infinity])assert.throws(()=>asDisparity(Float32Array.of(value),'depth'),/Invalid/);
});

test('a hidden photo batch waits for visibility and then removes its listener',async()=>{
  const doc=new EventTarget();doc.hidden=true;let done=false;
  const pending=waitForVisiblePage(doc).then(()=>done=true);
  await Promise.resolve();doc.dispatchEvent(new Event('visibilitychange'));await Promise.resolve();assert.equal(done,false);
  doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));await pending;assert.equal(done,true);
  await waitForVisiblePage(doc);
});

test('CPU selection reaches the depth worker explicitly, invalid providers do not start a worker',async()=>{
  let worker,terminated=0;
  const result=await inferDepth(new Uint8Array(3),{width:1,height:1},{provider:'wasm',workerFactory:()=>worker={
    postMessage(message){assert.equal(message.provider,'wasm');assert.equal(message.modelId,'standard');queueMicrotask(()=>worker.onmessage({data:{result:{gray:Uint8Array.of(42)}}}));},
    terminate(){terminated++;},
  }});
  assert.deepEqual(result.gray,Uint8Array.of(42));assert.equal(terminated,1);
  await assert.rejects(inferDepth(new Uint8Array(3),{}, {provider:'unknown',workerFactory:()=>{throw Error('should not start');}}),/Unsupported depth provider/);
});

test('cancelling source preparation releases the queue and discards late canvases',async()=>{
  const controller=new AbortController(),canvas={width:10,height:10};let complete;
  const pending=awaitAiSource(()=>new Promise(resolve=>complete=resolve),controller.signal);
  await Promise.resolve();controller.abort();await assert.rejects(pending,error=>error.name==='AbortError');
  complete(canvas);await Promise.resolve();await Promise.resolve();
  assert.equal(canvas.width,0);assert.equal(canvas.height,0);
});

test('AI abort and deadline terminate inference workers',async()=>{
  for(const mode of ['abort','timeout']){
    let terminated=0;const controller=new AbortController();
    const pending=inferDepth(new Uint8Array(3),{width:1,height:1},{signal:controller.signal,timeoutMs:5,workerFactory:()=>({postMessage(){},terminate(){terminated++;}})});
    if(mode==='abort')controller.abort();
    await assert.rejects(pending,error=>error.name===(mode==='abort'?'AbortError':'TimeoutError'));
    assert.equal(terminated,1);
  }
});

test('depth errors retain runtime codes and retry only inference/resource failures',()=>{
  for(const error of [0,17,'GPU compute failed',Error('GPU compute failed')]){
    const message=depthWorkerFailure(error,'inference');
    assert.equal(message.error,String(error?.message??error));assert.equal(message.errorStage,'inference');
    assert.ok(canRetryDepth(Object.assign(Error(message.error),{stage:message.errorStage})));
  }
  assert.ok(canRetryDepth(Object.assign(Error('Buffer allocation failed'),{stage:'modelLoading'})));
  assert.ok(!canRetryDepth(Object.assign(Error('AI model integrity check failed'),{stage:'download'})));
  assert.ok(!canRetryDepth(Object.assign(Error('model unsupported'),{stage:'modelLoading'})));
  assert.ok(!canRetryDepth(Object.assign(Error('WEBGPU'),{stage:'inference'})));
  for(const name of ['AbortError','TimeoutError'])assert.ok(!canRetryDepth(Object.assign(Error('failed'),{stage:'inference',name})));
});

test('worker error envelopes never resolve as missing depth and release the failed worker',async()=>{
  for(const message of [{error:0,errorStage:'inference'},{error:'GPU compute failed',errorStage:'inference'},{error:undefined},{}]){
    let worker,terminated=0;
    const pending=inferDepth(new Uint8Array(3),{width:1,height:1},{workerFactory:()=>worker={
      postMessage(){queueMicrotask(()=>{worker.onmessage({data:{stage:'inference'}});worker.onmessage({data:message});});},
      terminate(){terminated++;},
    }});
    await assert.rejects(pending,error=>error.stage==='inference'&&canRetryDepth(error));
    assert.equal(terminated,1);
  }
});
test('libheif frees every image handle before its native context',()=>{
  const calls=[],decoder={decoder:123};
  releaseLibheif({heif_context_free:context=>calls.push(context)},decoder,[{free:()=>calls.push('primary')},{free:()=>calls.push('other')}]);
  assert.deepEqual(calls,['primary','other',123]);assert.equal(decoder.decoder,null);
  releaseLibheif({},decoder);assert.equal(calls.length,3);
});
test('network responses and isolation survive denied cache or quota failures',async()=>{
  for(const denied of [false,true]){
    const events={};let installed,claimed=false;
    const cache={put:async()=>{throw Error('quota');},addAll:async()=>{throw Error('quota');}};
    const context={URL,Headers,Response,console:{warn(){}},caches:{open:async()=>{if(denied)throw Error('denied');return cache;},keys:async()=>{throw Error('denied');}},fetch:async()=>new Response('fresh'),self:{location:{origin:'https://example.com'},addEventListener:(name,callback)=>events[name]=callback,skipWaiting:()=>{installed=true;},clients:{claim:()=>{claimed=true;}}}};
    runInNewContext(readFileSync(new URL('../../web/sw.js',import.meta.url),'utf8'),context);
    for(const event of ['install','activate']){let pending;events[event]({waitUntil:value=>pending=value});await pending;}
    assert.ok(installed&&claimed);
    let pending;events.fetch({request:{method:'GET',url:'https://example.com/app.js',mode:'cors'},respondWith:value=>pending=value});
    const response=await pending;assert.equal(await response.text(),'fresh');assert.equal(response.headers.get('Cross-Origin-Embedder-Policy'),'require-corp');
  }
});

test('UI updates retain pinned depth dependencies without caching a second model copy',async()=>{
  const events={},opened=[],deleted=[],fetched=[];
  const dependency='photographic-style-depth-assets-4472b736-ort-1.22.0';
  runInNewContext(readFileSync(new URL('../../web/sw.js',import.meta.url),'utf8'),{
    URL,Headers,Response,console,caches:{keys:async()=>['photographic-style-port-v1',dependency,'photographic-style-encoder-assets-v1'],
      delete:async name=>deleted.push(name),open:async name=>{opened.push(name);return {match:async()=>new Response('pinned'),put:async()=>{}};}},
    fetch:async request=>{fetched.push(typeof request==='string'?request:request.url);return new Response('network');},
    self:{location:{origin:'https://example.com'},addEventListener:(name,fn)=>events[name]=fn,clients:{claim:async()=>{}}},
  });
  let pending;events.activate({waitUntil:p=>pending=p});await pending;
  assert.ok(deleted.includes('photographic-style-port-v1'));assert.ok(!deleted.includes(dependency));assert.ok(!deleted.includes('photographic-style-encoder-assets-v1'));
  const request=filename=>({method:'GET',url:'https://example.com/vendor/ai-portrait/'+filename,mode:'cors'});
  events.fetch({request:request('ort.webgpu.min.mjs'),respondWith:p=>pending=p});assert.equal(await(await pending).text(),'pinned');
  assert.deepEqual(opened,[dependency]);assert.equal(fetched.length,0);
  events.fetch({request:request('model.onnx?sha256=known'),respondWith:p=>pending=p});assert.equal(await(await pending).text(),'network');
  assert.deepEqual(opened,[dependency],'model storage belongs to the downloader, not a duplicate SW cache');
  events.fetch({request:request('assets.json'),respondWith:p=>pending=p});assert.equal(await(await pending).text(),'network');
  assert.equal(fetched.length,2,'manifest revalidates instead of trusting old dependency metadata');
});
