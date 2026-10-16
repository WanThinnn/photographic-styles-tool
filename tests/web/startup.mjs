import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareBrowser,fetchJsonWithRetry} from '../../web/src/ui/startup.js';
import {downloadModelBytes} from '../../web/src/core/model-download.js';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

test('fresh visit claims the page and reloads before photo selection', async () => {
  const listeners = new Set(); let reloads = 0;
  const serviceWorker = {
    controller: null,
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
    async register() {
      this.controller = {scriptURL: 'https://example.test/sw.js'};
      for (const listener of listeners) listener();
    },
  };
  const options = {isolated: () => false, secure: true, serviceWorker, reload: () => reloads++};
  assert.equal(await prepareBrowser(options), 'reloading');
  assert.equal(reloads, 1); assert.equal(listeners.size, 0);
  assert.equal(await prepareBrowser(options), 'ready-limited');
  assert.equal(reloads, 1, 'unsupported isolation cannot loop');
  assert.equal(await prepareBrowser({...options, isolated: () => true}), 'ready');
});

test('stalled service-worker setup falls back instead of blocking the app', async () => {
  const listeners = new Set();
  assert.equal(await prepareBrowser({isolated: () => false, secure: true, timeoutMs: 10,
    reload: () => assert.fail('must not reload'), serviceWorker: {controller: null,
      addEventListener: (_type, listener) => listeners.add(listener),
      removeEventListener: (_type, listener) => listeners.delete(listener),
      register: async () => {},
    }}),'ready-limited');
  assert.equal(listeners.size, 0);
});

test('boot JSON retries transient resource failures and reports a resource error after exhaustion',async()=>{
  let requests=0;
  const value=await fetchJsonWithRetry('profiles/index.json',{attempts:3,delayMs:0,fetchImpl:async()=>{
    requests++;
    if(requests<3)throw Error('transient');
    return new Response('{"ok":true}',{status:200,headers:{'content-type':'application/json'}});
  }});
  assert.deepEqual(value,{ok:true});assert.equal(requests,3);
  await assert.rejects(fetchJsonWithRetry('missing.json',{attempts:2,delayMs:0,
    fetchImpl:async()=>new Response('',{status:404})}),error=>error.code==='APP_RESOURCE_UNAVAILABLE');
});

test('preparation and conversion share a download; failure permits retry', async () => {
  const oldFetch = globalThis.fetch; let requests = 0;
  try {
    globalThis.fetch = async () => { requests++; await new Promise(resolve => setTimeout(resolve, 5));
      return new Response(new Uint8Array([1, 2, 3]), {headers: {'content-length': '3'}}); };
    const progress = [];
    const [a, b] = await Promise.all([downloadModelBytes('https://test.invalid/runtime'),
      downloadModelBytes('https://test.invalid/runtime', {onProgress: p => progress.push(p)})]);
    assert.deepEqual(a, b); assert.equal(requests, 1); assert.ok(progress.some(p => p.complete));
    globalThis.fetch = async () => { throw Error('network unavailable'); };
    await assert.rejects(downloadModelBytes('https://test.invalid/retry'), /network unavailable/);
    globalThis.fetch = async () => new Response(new Uint8Array([4]), {headers: {'content-length': '1'}});
    assert.deepEqual(await downloadModelBytes('https://test.invalid/retry'), new Uint8Array([4]));
  } finally { globalThis.fetch = oldFetch; }
});

test('the first screen has useful fallback copy before any converter module loads',()=>{
  const html=readFileSync(new URL('../../web/index.html',import.meta.url),'utf8');
  for(const match of html.matchAll(/<([\w]+)\b[^>]*data-i18n="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g))
    assert.ok(match[3].trim(),`empty first-visit copy: ${match[2]}`);
  assert.match(html,/id="ai-portrait-label">[^<]+</);
  assert.match(html,/src="src\/ui\/page-bootstrap.js"/);
});

test('service worker activation does not wait for the full processing/offline graph',async()=>{
  const events={},installed=[];let claimed=false,wait;
  const cache={addAll:async paths=>installed.push(...paths),match:async()=>null,put:async()=>{}};
  runInNewContext(readFileSync(new URL('../../web/sw.js',import.meta.url),'utf8'),{
    URL,Headers,Response,console,caches:{open:async()=>cache,keys:async()=>[],delete:async()=>{}},
    fetch:()=>new Promise(()=>{}),self:{addEventListener:(name,fn)=>events[name]=fn,skipWaiting:async()=>{},clients:{claim:async()=>{claimed=true;}}},
  });
  events.install({waitUntil:p=>wait=p});await wait;
  assert.ok(installed.includes('./src/ui/page-bootstrap.js'));
  assert.ok(!installed.includes('./app.js')&&!installed.some(p=>p.includes('/dng/')));
  events.activate({waitUntil:p=>wait=p});await wait;assert.ok(claimed);
});

test('cached app launches render immediately without waiting for a stalled network',async()=>{
  const events={};
  runInNewContext(readFileSync(new URL('../../web/sw.js',import.meta.url),'utf8'),{
    URL,Headers,Response,console,
    caches:{open:async()=>({match:async()=>new Response('cached app'),put:async()=>{}})},
    fetch:()=>new Promise(()=>{}),self:{location:{origin:'https://example.test'},addEventListener:(name,fn)=>events[name]=fn},
  });
  for(const request of [
    {method:'GET',mode:'navigate',url:'https://example.test/'},
    {method:'GET',mode:'cors',url:'https://example.test/app.js'},
  ]){
    let pending;
    events.fetch({request,respondWith:p=>pending=p});
    const rendered=await Promise.race([pending.then(r=>r.text()),new Promise(resolve=>setTimeout(()=>resolve('network blocked boot'),30))]);
    assert.equal(rendered,'cached app');
  }
});

test('a new parallel iframe fetches its own document instead of falling back to cached app HTML',async()=>{
  for(const offline of [false,true]){
    const events={},requested=[];
    const cache={match:async request=>request==='./index.html'?new Response('main app'):undefined,put:async()=>{}};
    runInNewContext(readFileSync(new URL('../../web/sw.js',import.meta.url),'utf8'),{
      URL,Headers,Response,console,caches:{open:async()=>cache},
      fetch:async url=>{requested.push(url);if(offline)throw Error('offline');return new Response('processing lane');},
      self:{location:{origin:'https://example.test'},addEventListener:(name,fn)=>events[name]=fn},
    });
    let pending;
    events.fetch({request:{method:'GET',mode:'navigate',destination:'iframe',url:'https://example.test/processing-lane.html'},respondWith:p=>pending=p});
    const response=await pending;
    assert.equal(requested.length,1);
    assert.equal(response.status,offline?503:200);
    const text=await response.text();assert.notEqual(text,'main app');
    if(!offline)assert.equal(text,'processing lane');
  }
});
