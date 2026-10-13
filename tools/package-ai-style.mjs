/**
 * Package locally-exported TinyCLIP image encoders for Suggested Styles.
 *
 * The inputs MUST be image-only graphs:
 *   float32 pixel_values [1,3,224,224] -> float32 image_embeds [1,512]
 *
 * Usage:
 *   node tools/package-ai-style.mjs --wasm path/to/tinyclip-image-int8.onnx \
 *     --webgpu path/to/tinyclip-image-fp16.onnx
 */
import {mkdir,readFile,writeFile,copyFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {STYLE_MODEL_ID,STYLE_MODEL_INPUT,STYLE_MODEL_REVISION} from '../web/src/recommend/style-model.js';

const root=fileURLToPath(new URL('../web/vendor/ai-style/',import.meta.url));
const argv=process.argv.slice(2),flags={};
for(let i=0;i<argv.length;i+=2){
  const key=argv[i]?.replace(/^--/,'');
  if(!['wasm','webgpu'].includes(key)||!argv[i+1])throw Error('Provide exactly --wasm and --webgpu ONNX paths');
  flags[key]=argv[i+1];
}
if(!flags.wasm||!flags.webgpu||Object.keys(flags).length!==2)throw Error('Provide exactly --wasm and --webgpu ONNX paths');

const specs={
  wasm:{file:'tinyclip-image-int8.onnx',precision:'int8'},
  webgpu:{file:'tinyclip-image-fp16.onnx',precision:'fp16'},
};
const models={};
await mkdir(root,{recursive:true});
for(const [provider,spec] of Object.entries(specs)){
  const source=resolve(flags[provider]),size=(await stat(source)).size;
  if(!/\.onnx$/i.test(source)||size<100_000||size>300_000_000)throw Error(`Invalid ${provider} TinyCLIP ONNX file`);
  const bytes=await readFile(source),sha256=createHash('sha256').update(bytes).digest('hex');
  await copyFile(source,resolve(root,spec.file));
  models[provider]={...spec,bytes:size,sha256,inputName:STYLE_MODEL_INPUT.inputName,
    inputShape:[...STYLE_MODEL_INPUT.shape],outputName:STYLE_MODEL_INPUT.outputName,embeddingDimensions:STYLE_MODEL_INPUT.embeddingDimensions};
  console.log(`${provider}: ${(size/1048576).toFixed(1)} MiB sha256=${sha256}`);
}
const manifest={
  schema:1,model:STYLE_MODEL_ID,revision:STYLE_MODEL_REVISION,
  input:{
    size:STYLE_MODEL_INPUT.size,channels:STYLE_MODEL_INPUT.channels,layout:STYLE_MODEL_INPUT.layout,shape:[...STYLE_MODEL_INPUT.shape],
    inputName:STYLE_MODEL_INPUT.inputName,outputName:STYLE_MODEL_INPUT.outputName,
    embeddingDimensions:STYLE_MODEL_INPUT.embeddingDimensions,
    mean:[...STYLE_MODEL_INPUT.mean],std:[...STYLE_MODEL_INPUT.std],
  },
  models,
};
await writeFile(resolve(root,'assets.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Packaged image-only TinyCLIP assets. Run tools/verify-ai-style-model.mjs before publishing.');
