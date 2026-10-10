/**
 * Package three *locally validated, converted* ONNX models for static hosting.
 * No model files are generated from arbitrary weights and no unverifiable URLs
 * are inserted into the runtime. Missing/mismatched weights make AI fail closed.
 *
 * Usage:
 *   node tools/package-ai-detail.mjs --lite path/to/span.onnx \
 *      --standard path/to/rt-focuser.onnx \
 *      --pro path/to/fatality-deblur.onnx
 *
 * Uniform I/O contract: RGB float32 [1,3,H,W] -> RGB float32 [1,3,H,W],
 * RGB in [0,1]. Use only verified same-resolution restoration models.
 */
import {mkdir,readFile,writeFile,copyFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../web/vendor/ai-detail/',import.meta.url));
const flags=Object.fromEntries(process.argv.slice(2).reduce((out,arg,i,all)=>{
  if(i%2===0)out.push([arg.slice(2),all[i+1]]);
  return out;
},[]));
const specs={
  lite:{file:'lite.onnx',family:'span',channels:3,layout:'rgb',output:'rgb'},
  standard:{file:'standard.onnx',family:'rt-focuser',channels:3,layout:'rgb',output:'rgb'},
  pro:{file:'pro.onnx',family:'fatality-deblur',channels:3,layout:'rgb',output:'rgb'},
};
if(Object.keys(specs).some(id=>!flags[id])||Object.keys(flags).some(id=>!specs[id])){
  console.error('Provide exactly --lite, --standard, --pro paths to validated ONNX files');
  process.exitCode=1;
}else{
  const sources=[];
  for(const [id,config] of Object.entries(specs)){
    const source=resolve(flags[id]),size=(await stat(source)).size;
    if(!source.endsWith('.onnx')||size<100||size>300_000_000)throw Error(`Invalid ${id} ONNX weight file`);
    const bytes=await readFile(source);
    const sha256=createHash('sha256').update(bytes).digest('hex');
    sources.push({id,source,sha256,bytes:size,config});
  }
  await mkdir(root,{recursive:true});
  const models={};
  for(const source of sources){
    await copyFile(source.source,resolve(root,source.config.file));
    models[source.id]={...source.config,bytes:source.bytes,sha256:source.sha256};
    console.log(`${source.id}: ${(source.bytes/1048576).toFixed(1)} MiB sha256=${source.sha256}`);
  }
  await writeFile(resolve(root,'assets.json'),JSON.stringify({schema:1,models},null,2)+'\n');
  console.log('Done. Test each model with the same RGB fixture and Safari before publishing.');
}
