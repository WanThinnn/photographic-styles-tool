import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildWebRelease} from '../../tools/build-web-release.mjs';
import {runInNewContext} from 'node:vm';
import {readFileSync} from 'node:fs';

test('static release versions the complete app graph and leaves immutable model URLs alone',async()=>{
  const temp=await mkdtemp(join(tmpdir(),'stylio-release-'));
  try{
    const source=join(temp,'web'),output=join(temp,'release'),sha='abcdef1234567';
    await mkdir(join(source,'src'),{recursive:true});await mkdir(join(source,'vendor'),{recursive:true});
    const files={
      'index.html':'<link href="styles.css"><script src="src/boot.js"></script>',
      'src/boot.js':'import "../app.js"; export {ready} from "./setup.js";',
      'app.js':'import("./src/setup.js");new Worker(new URL("./src/worker.js",import.meta.url));fetch("./vendor/model.onnx");import("./vendor/ort.mjs");',
      'sw.js':'const CACHE_PREFIX="app-";const CACHE_NAME = `${CACHE_PREFIX}v1`;const shell=["./app.js","./styles.css","./src/setup.js"];',
      'vendor/ort.js':'const url="./wasm.js";',
    };
    for(const [name,text]of Object.entries(files))await writeFile(join(source,name),text);
    await buildWebRelease(source,output,sha);
    const html=await readFile(join(output,'index.html'),'utf8'),app=await readFile(join(output,'app.js'),'utf8');
    assert.ok(html.includes(`styles.css?release=${sha}`));assert.ok(html.includes(`src/boot.js?release=${sha}`));
    assert.ok(app.includes(`./src/setup.js?release=${sha}`));assert.ok(app.includes(`./src/worker.js?release=${sha}`));
    assert.ok(app.includes('./vendor/model.onnx'));assert.ok(app.includes('"./vendor/ort.mjs"'));
    assert.equal(await readFile(join(output,'vendor/ort.js'),'utf8'),files['vendor/ort.js']);
    assert.ok((await readFile(join(output,'sw.js'),'utf8')).includes(`release-${sha}`));
    assert.equal(await readFile(join(source,'app.js'),'utf8'),files['app.js']);
    await assert.rejects(buildWebRelease(source,join(source,'nested'),sha),/outside/);
  }finally{await rm(temp,{recursive:true,force:true});}
});

test('release service worker refreshes stale unversioned requests through the CDN',async()=>{
  const events={},fetched=[];
  const source=readFileSync(new URL('../../web/sw.js',import.meta.url),'utf8')
    .replace('const RELEASE_ID = "development";','const RELEASE_ID = "abcdef1234567";');
  runInNewContext(source,{
    URL,Request,Headers,Response,console,
    caches:{open:async()=>({put:async()=>{}})},
    fetch:async request=>{fetched.push(typeof request==='string'?request:request.url);return new Response('current release');},
    self:{location:{origin:'https://example.com'},addEventListener:(name,handler)=>events[name]=handler},
  });
  let pending;
  events.fetch({request:new Request('https://example.com/styles.css'),respondWith:p=>pending=p});
  assert.equal(await(await pending).text(),'current release');
  events.fetch({request:{method:'GET',mode:'navigate',url:'https://example.com/'},respondWith:p=>pending=p});
  assert.equal(await(await pending).text(),'current release');
  assert.deepEqual(fetched,['https://example.com/styles.css?release=abcdef1234567','https://example.com/?release=abcdef1234567']);
});
