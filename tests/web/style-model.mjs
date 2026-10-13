import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {
  STYLE_MODEL_INPUT,STYLE_MODEL_SPECS,styleModel,styleModelSpec,
  validateStyleModelAsset,validateStyleModelManifest,
} from '../../web/src/recommend/style-model.js';
import {preprocessClipView} from '../../web/src/recommend/style-preprocess.js';

const hash='a'.repeat(64),revision='b'.repeat(40);
const asset=(level,provider)=>{
  const input=STYLE_MODEL_SPECS[level].input;
  return {file:`${level}-${provider}.onnx`,bytes:1_000_000,sha256:hash,precision:provider==='wasm'?'int8':'fp16',
    inputName:input.inputName,inputShape:[...input.shape],outputName:input.outputName,embeddingDimensions:input.embeddingDimensions};
};
const manifest=()=>({schema:2,models:Object.fromEntries(Object.entries(STYLE_MODEL_SPECS).map(([level,spec])=>[level,{
  id:spec.id,revision,license:spec.license,
  input:{size:spec.input.size,channels:spec.input.channels,layout:spec.input.layout,shape:[...spec.input.shape],
    inputName:spec.input.inputName,outputName:spec.input.outputName,embeddingDimensions:spec.input.embeddingDimensions,
    mean:[...spec.input.mean],std:[...spec.input.std]},
  providers:{wasm:asset(level,'wasm'),webgpu:asset(level,'webgpu')},
}]))});

test('Suggested Styles validates separate MIT Lite/Standard and Apache Pro contracts',()=>{
  const parsed=validateStyleModelManifest(manifest());
  assert.equal(styleModel('lite','wasm',manifest()).id,'tinyclip-vit-8m-16-image');
  assert.equal(styleModel('standard','webgpu',manifest()).id,'tinyclip-vit-39m-16-image');
  assert.equal(styleModel('pro','webgpu',manifest()).id,'siglip2-base-patch16-224-image');
  assert.equal(styleModelSpec('pro').input.embeddingDimensions,768);
  assert.equal(parsed.models.pro.license,'Apache-2.0');
  assert.throws(()=>styleModel('ultra','wasm',manifest()),RangeError);
  assert.throws(()=>styleModel('lite','cpu',manifest()),RangeError);
  assert.throws(()=>validateStyleModelAsset({...asset('lite','wasm'),sha256:'bad'},'wasm'),/Invalid/);
  const apple=manifest();apple.models.pro.id='mobileclip2-s2-image';
  assert.throws(()=>validateStyleModelManifest(apple),/Unsupported/);
  const wrongShape=manifest();wrongShape.models.pro.input.size=384;
  assert.throws(()=>validateStyleModelManifest(wrongShape),/contract/);
});

test('packaged zero-shot model assets match byte lengths and hashes',()=>{
  const root=new URL('../../web/vendor/ai-style/',import.meta.url);
  const production=validateStyleModelManifest(JSON.parse(readFileSync(new URL('assets.json',root),'utf8')));
  for(const model of Object.values(production.models))for(const provider of ['wasm','webgpu']){
    const asset=model.providers[provider],bytes=readFileSync(new URL(asset.file,root));
    assert.equal(bytes.byteLength,asset.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);
  }
});

test('preprocessing follows each model normalization contract',()=>{
  const image={width:2,height:2,data:Uint8Array.from([
    255,0,0,255, 0,255,0,255,
    0,0,255,255, 255,255,255,255,
  ])};
  for(const level of ['lite','standard','pro']){
    const input=styleModelSpec(level).input;
    const first=preprocessClipView(image,{x:0,y:0,width:2,height:2},{input});
    const second=preprocessClipView(image,{x:0,y:0,width:2,height:2},{input});
    assert.equal(first.length,3*input.size*input.size);assert.deepEqual(first,second);assert.ok(first.every(Number.isFinite));
  }
  assert.equal(STYLE_MODEL_INPUT.embeddingDimensions,512);
});
