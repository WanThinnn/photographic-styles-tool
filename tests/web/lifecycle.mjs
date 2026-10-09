import test from 'node:test';
import assert from 'node:assert/strict';
import {inferDepth,awaitAiSource,depthWorkerFailure,canRetryDepth} from '../../web/src/portrait/ai-inference.js';
import {releaseLibheif} from '../../web/src/codecs/libheif-lifecycle.js';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

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
