/**
 * Verify packaged Suggested Styles model files and, when available, their ONNX I/O.
 *
 * Usage:
 *   node tools/verify-ai-style-model.mjs
 *
 * Install onnxruntime-node to perform graph/session verification. Integrity and
 * manifest validation always run; absence of onnxruntime-node is reported as a
 * verification blocker rather than silently treating the assets as verified.
 */
import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {STYLE_MODEL_LEVELS,validateStyleModelManifest} from '../web/src/recommend/style-model.js';

const root=fileURLToPath(new URL('../web/vendor/ai-style/',import.meta.url));
const manifest=validateStyleModelManifest(JSON.parse(await readFile(resolve(root,'assets.json'),'utf8')));
let ort;
try{ort=await import('onnxruntime-node');}
catch{throw Error('onnxruntime-node is required to verify the packaged Suggested Styles graph contracts');}

for(const level of STYLE_MODEL_LEVELS){
  const model=manifest.models[level];
  for(const [provider,asset] of Object.entries(model.providers)){
    const file=resolve(root,asset.file),size=(await stat(file)).size,bytes=await readFile(file);
    const sha256=createHash('sha256').update(bytes).digest('hex');
    if(size!==asset.bytes)throw Error(`${level}/${provider}: byte length mismatch`);
    if(sha256!==asset.sha256)throw Error(`${level}/${provider}: SHA-256 mismatch`);
    const session=await ort.InferenceSession.create(file,{executionProviders:['cpu']});
    try{
      if(session.inputNames.length!==1||session.inputNames[0]!==asset.inputName)
        throw Error(`${level}/${provider}: expected one ${asset.inputName} input`);
      if(!session.outputNames.includes(asset.outputName))
        throw Error(`${level}/${provider}: missing ${asset.outputName} output`);
      const pixels=new Float32Array(model.input.shape.reduce((a,b)=>a*b,1));
      const tensor=new ort.Tensor('float32',pixels,asset.inputShape);
      const output=(await session.run({[asset.inputName]:tensor},[asset.outputName]))[asset.outputName];
      if(!output||output.data.length!==model.input.embeddingDimensions||!Array.from(output.data).every(Number.isFinite))
        throw Error(`${level}/${provider}: invalid image embedding output`);
      console.log(`${level}/${provider}: VERIFIED ${(size/1048576).toFixed(1)} MiB sha256=${sha256}`);
    }finally{await session.release?.();}
  }
}
