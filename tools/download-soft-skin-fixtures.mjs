import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {ORT_ASSETS} from '../web/src/vision/ort-assets.js';
const directory=new URL('../tests/web/.cache/soft-skin/',import.meta.url);
await mkdir(directory,{recursive:true});
for(const [index,asset] of ORT_ASSETS.entries()){
  const file=new URL(`${index}.bin`,directory);
  let bytes;try{bytes=await readFile(file);}catch{}
  const hash=b=>createHash('sha256').update(b).digest('hex');
  if(bytes && hash(bytes)===asset.sha256){console.log(`${asset.resource}: cached`);continue;}
  const response=await fetch(asset.url,{signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw Error(`${asset.resource}: HTTP ${response.status}`);
  bytes=new Uint8Array(await response.arrayBuffer());
  if(hash(bytes)!==asset.sha256)throw Error(`${asset.resource}: SHA-256 mismatch`);
  await writeFile(file,bytes);
  console.log(`${asset.resource}: verified ${(bytes.length/1048576).toFixed(2)} MB`);
}
