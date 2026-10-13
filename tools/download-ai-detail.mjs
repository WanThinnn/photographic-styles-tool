/**
 * Download the three independently selected, 1x RGB ONNX restoration models
 * into the user's LOCAL workspace. No original photos ever leave the browser.
 *
 * Assets are pinned by revision AND SHA256, streamed to temporary files and
 * renamed only after integrity verification. Safe to rerun; no model is
 * redownloaded when its local digest matches.
 *
 * node tools/download-ai-detail.mjs
 */
import {createWriteStream,createReadStream} from 'node:fs';
import {mkdir,readFile,rename,rm,writeFile,stat} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

export const SOURCES={
 lite:{
   family:'span',label:'Lite',file:'lite.onnx',
   repository:'notaneimu/onnx-image-models',
   revision:'e4cafda1199bcec66a76b10025aafb655cd0ff30',
   remote:'1x-SuperScale_SPAN.onnx',
   sha256:'3c5982964e9040a655bd8edcbb3a12f5455311419af7b47a0a1e19ee3767c5f4',
   // Model-file licensing must be reviewed individually before redistributing.
   license:'upstream-review-required',
 },
 standard:{
   family:'rt-focuser',label:'Standard',file:'standard.onnx',
   repository:'ReaganWu/RT-Focuser',
   revision:'4c8e12d28c2801f34cc1153e9ad8702b7bce657a',
   remote:'Pretrained_Weights/rt_focuser_wint8_afp32.onnx',
   url:'https://raw.githubusercontent.com/ReaganWu/RT-Focuser/4c8e12d28c2801f34cc1153e9ad8702b7bce657a/Pretrained_Weights/rt_focuser_wint8_afp32.onnx',
   sha256:'3e1747165694696996d98c23867275a4c0c0372ad7e9943162498ce245288fd5',
   license:'MIT',
 },
 pro:{
   family:'fatality-deblur',label:'Pro',file:'pro.onnx',
   repository:'notaneimu/onnx-image-models',
   revision:'42bc0d52e3f9f015b3f0106912c5342462ef0569',
   remote:'1x-Fatality-DeBlur.onnx',
   sha256:'4ce978edc3c65c56be22a1d6eb5415997d79dbf52ed09a67605e56de6ef7aaa0',
   license:'upstream-review-required',
 },
};
const root=fileURLToPath(new URL('../web/vendor/ai-detail/',import.meta.url));
async function digestFile(path){
 try{
  const hash=createHash('sha256');
  for await(const buf of createReadStream(path))hash.update(buf);
  return hash.digest('hex');
 }catch(error){if(error.code==='ENOENT')return null;throw error;}
}
async function get(id,spec){
 const path=join(root,spec.file);
 if(await digestFile(path)===spec.sha256){console.log(id+': verified existing download');return (await stat(path)).size;}
 const url=spec.url||`https://huggingface.co/${spec.repository}/resolve/${spec.revision}/${encodeURIComponent(spec.remote)}?download=true`;
 const response=await fetch(url,{headers:{'user-agent':'photographic-styles-tool/ai-detail-download'}});
 if(!response.ok||!response.body)throw Error(`${id}: model request failed ${response.status} ${url}`);
 const partial=path+'.partial';
 let written=0;
 try{
  const hash=createHash('sha256');
  const chunks=Readable.fromWeb(response.body);
  chunks.on('data',chunk=>{written+=chunk.length;hash.update(chunk);});
  await pipeline(chunks,createWriteStream(partial));
  const actual=hash.digest('hex');
  if(actual!==spec.sha256)throw Error(`${id}: checksum mismatch (expected ${spec.sha256}, actual ${actual}, downloaded ${written} bytes)`);
  await rename(partial,path);
  console.log(`${id}: ${(written/1048576).toFixed(2)} MiB, SHA-256 verified`);
  return written;
 }catch(error){await rm(partial,{force:true});throw error;}
}
await mkdir(root,{recursive:true});
const manifest={schema:1,source:'Pinned 1x RGB restoration ONNX models',models:{}};
for(const [id,spec] of Object.entries(SOURCES)){
 const bytes=await get(id,spec);
 const url=spec.url||`https://huggingface.co/${spec.repository}/resolve/${spec.revision}/${encodeURIComponent(spec.remote)}`;
 manifest.models[id]={
  family:spec.family,file:spec.file,bytes,sha256:spec.sha256,channels:3,layout:'rgb',output:'rgb',
  repository:spec.repository,revision:spec.revision,sourceUrl:url,license:spec.license,
 };
}
await writeFile(join(root,'assets.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Downloaded 3 local ONNX models and wrote verified manifest; validate inference before production.');
