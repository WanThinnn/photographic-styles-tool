// Opt-in AI assets are local: uploaded photos never leave the browser.
import {mkdir, writeFile, readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root = new URL('../web/vendor/ai-portrait/', import.meta.url);
await mkdir(root, {recursive:true});
// Subsequent runs/CI use the recorded immutable revision and checksums.
let pinned;
try { pinned=JSON.parse(await readFile(new URL('assets.json',root),'utf8')); } catch(error) { if(error.code!=='ENOENT')throw error; }
if(pinned){
  for(const [name,entry] of Object.entries(pinned.files)){
    let data;try{data=new Uint8Array(await readFile(new URL(name,root)));}catch{}
    const hash=data&&createHash('sha256').update(data).digest('hex');
    if(hash===entry.sha256){console.log(`${name}: verified local asset`);continue;}
    const res=await fetch(entry.url);if(!res.ok)throw Error(`${name}: ${res.status}`);
    data=new Uint8Array(await res.arrayBuffer());
    if(data.length!==entry.bytes||createHash('sha256').update(data).digest('hex')!==entry.sha256)throw Error(`${name}: integrity mismatch`);
    await writeFile(new URL(name,root),data);console.log(`${name}: downloaded and verified`);
  }
  process.exit(0);
}
const api = await fetch('https://huggingface.co/api/models/onnx-community/depth-anything-v2-small');
if (!api.ok) throw Error(`Model revision: ${api.status}`);
const {sha} = await api.json();
const assets = {
  'model.onnx': `https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/${sha}/onnx/model.onnx`,
  'preprocessor_config.json': `https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/${sha}/preprocessor_config.json`,
  'MODEL-LICENSE.txt': 'https://raw.githubusercontent.com/DepthAnything/Depth-Anything-V2/main/LICENSE',
};
for (const name of ['ort.webgpu.min.mjs','ort-wasm-simd-threaded.jsep.mjs','ort-wasm-simd-threaded.jsep.wasm'])
  assets[name] = `https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/${name}`;
const manifest = {model:'onnx-community/depth-anything-v2-small', revision:sha, runtime:'onnxruntime-web@1.22.0', files:{}};
for (const [name, url] of Object.entries(assets)) {
  const res = await fetch(url); if (!res.ok) throw Error(`${name}: ${res.status}`);
  const data = new Uint8Array(await res.arrayBuffer());
  await writeFile(new URL(name, root), data);
  manifest.files[name] = {url, bytes:data.length, sha256:createHash('sha256').update(data).digest('hex')};
  console.log(`${name}: ${(data.length/1048576).toFixed(1)} MiB`);
}
await writeFile(new URL('assets.json', root), JSON.stringify(manifest,null,2)+'\n');
