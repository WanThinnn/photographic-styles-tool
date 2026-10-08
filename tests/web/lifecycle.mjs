import test from 'node:test';
import assert from 'node:assert/strict';
import {inferDepth,awaitAiSource} from '../../web/src/ai-inference.js';
import {releaseLibheif} from '../../web/src/libheif-lifecycle.js';
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
