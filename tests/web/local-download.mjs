import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {downloadResponse, pruneDownloads, DOWNLOAD_TTL} from '../../web/src/local-download.js';

function memoryCache() {
  const entries = new Map();
  const key = request => typeof request === 'string' ? request : request.url;
  return {
    async keys() { return [...entries.keys()].map(url => new Request(url)); },
    async match(request) { return entries.get(key(request))?.clone(); },
    async put(request, response) { entries.set(key(request), response.clone()); },
    async delete(request) { return entries.delete(key(request)); },
  };
}

test('named HEIC response keeps file bytes and original date in download headers', async () => {
  const path='C:/Users/WanThinnn/Downloads/IMG_0612.HEIC';
  const bytes=fs.existsSync(path)?fs.readFileSync(path):Uint8Array.of(1,2,3);
  const response=downloadResponse(new Blob([bytes],{type:'image/heic'}),
    'ảnh "test".HEIC', Date.parse('2026-10-03T17:14:19.879+07:00'),1000);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),Buffer.from(bytes));
  assert.equal(response.headers.get('Last-Modified'),'Sat, 03 Oct 2026 10:14:19 GMT');
  assert.equal(response.headers.get('Content-Type'),'image/heic');
  assert.equal(response.headers.get('Content-Length'),String(bytes.length));
  assert.match(response.headers.get('Content-Disposition'),/^inline;.*filename\*=UTF-8''/);
  assert.ok(!response.headers.get('Content-Disposition').includes('"test"'));
  assert.equal(Number(response.headers.get('X-Local-Expires')),1000+DOWNLOAD_TTL);
  assert.equal(downloadResponse(new Blob([]),'no-date.HEIC').headers.get('Last-Modified'),null);
});

test('temporary download cleanup removes expired files while retaining live downloads', async () => {
  const cache=memoryCache();
  await cache.put('https://example.test/expired',downloadResponse(new Blob(['old']),'old',undefined,0));
  await cache.put('https://example.test/live',downloadResponse(new Blob(['new']),'new',undefined,DOWNLOAD_TTL));
  await pruneDownloads(cache,DOWNLOAD_TTL);
  assert.equal(await cache.match('https://example.test/expired'),undefined);
  assert.ok(await cache.match('https://example.test/live'));
});

test('worker serves local exports under a GitHub Pages subpath without any network request', async () => {
  const listeners={},cache=memoryCache(); let networkCalls=0;
  const scope='https://example.test/photographic-styles-tool/';
  vm.runInNewContext(fs.readFileSync('web/sw.js','utf8'),{
    self:{registration:{scope},location:{origin:'https://example.test'},
      addEventListener:(type,fn)=>listeners[type]=fn},
    caches:{open:async()=>cache},URL,Response,Headers,Date,
    fetch:async()=>{networkCalls++;throw Error('Network must not be used');},
  });
  const url=scope+'__local_download__/uuid/photo.HEIC';
  await cache.put(url,downloadResponse(new Blob(['exact image bytes'],{type:'image/heic'}),'photo.HEIC',1000));
  const dispatch=async request=>{
    let pending;
    listeners.fetch({request,respondWith:promise=>pending=promise});
    return pending;
  };
  const response=await dispatch(new Request(url));
  assert.equal(response.status,200);
  assert.equal(await response.text(),'exact image bytes');
  const missing=await dispatch(new Request(scope+'__local_download__/missing/photo.HEIC'));
  assert.equal(missing.status,410);
  await cache.put(url,downloadResponse(new Blob(['expired']),'photo.HEIC',undefined,0));
  assert.equal((await dispatch(new Request(url))).status,410);
  assert.equal(await cache.match(url),undefined);
  assert.equal(networkCalls,0);
  let protocol;
  listeners.message({data:'local-download-v1',ports:[{postMessage:v=>protocol=v}]});
  assert.equal(protocol,'local-download-v1');
});
