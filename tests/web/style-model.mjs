import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {
  STYLE_MODEL_ID,STYLE_MODEL_INPUT,STYLE_MODEL_REVISION,
  styleModel,validateStyleModelAsset,validateStyleModelManifest,
} from '../../web/src/recommend/style-model.js';
import {preprocessClipView} from '../../web/src/recommend/style-preprocess.js';

const hash='a'.repeat(64);
const manifest=()=>({
  schema:1,
  model:STYLE_MODEL_ID,
  revision:STYLE_MODEL_REVISION,
  input:{
    size:STYLE_MODEL_INPUT.size,channels:STYLE_MODEL_INPUT.channels,layout:STYLE_MODEL_INPUT.layout,shape:[...STYLE_MODEL_INPUT.shape],
    inputName:STYLE_MODEL_INPUT.inputName,outputName:STYLE_MODEL_INPUT.outputName,
    embeddingDimensions:STYLE_MODEL_INPUT.embeddingDimensions,
    mean:[...STYLE_MODEL_INPUT.mean],std:[...STYLE_MODEL_INPUT.std],
  },
  models:{
    wasm:{file:'tinyclip-image-int8.onnx',bytes:1_000_000,sha256:hash,precision:'int8',
      inputName:'pixel_values',inputShape:[1,3,224,224],outputName:'image_embeds',embeddingDimensions:512},
    webgpu:{file:'tinyclip-image-fp16.onnx',bytes:2_000_000,sha256:hash,precision:'fp16',
      inputName:'pixel_values',inputShape:[1,3,224,224],outputName:'image_embeds',embeddingDimensions:512},
  },
});

test('Suggested Styles accepts only the pinned image-only TinyCLIP contract',()=>{
  const parsed=validateStyleModelManifest(manifest());
  assert.equal(styleModel('wasm',manifest()).precision,'int8');
  assert.deepEqual(styleModel('wasm',manifest()).input.shape,[1,3,224,224]);
  assert.equal(styleModel('webgpu',manifest()).precision,'fp16');
  assert.equal(parsed.input.inputName,'pixel_values');
  assert.equal(parsed.input.outputName,'image_embeds');
  assert.throws(()=>styleModel('cpu',manifest()),RangeError);
  assert.throws(()=>validateStyleModelAsset({...manifest().models.wasm,sha256:'bad'},'wasm'),/Invalid/);
  const extra=manifest();extra.models.wasm.tokenizer='forbidden';
  assert.throws(()=>validateStyleModelManifest(extra),/Unexpected/);
  const textTower=manifest();textTower.models.wasm.inputName='input_ids';
  assert.throws(()=>validateStyleModelManifest(textTower),/Invalid/);
  const wrongOutput=manifest();wrongOutput.models.webgpu.outputName='last_hidden_state';
  assert.throws(()=>validateStyleModelManifest(wrongOutput),/Invalid/);
  const wrongDimensions=manifest();wrongDimensions.models.wasm.embeddingDimensions=768;
  assert.throws(()=>validateStyleModelManifest(wrongDimensions),/Invalid/);
  const wrongShape=manifest();wrongShape.input.size=384;
  assert.throws(()=>validateStyleModelManifest(wrongShape),/contract/);
  const wrongAssetShape=manifest();wrongAssetShape.models.wasm.inputShape=[1,3,384,384];
  assert.throws(()=>validateStyleModelManifest(wrongAssetShape),/Invalid/);
});

test('packaged TinyCLIP image-only assets match their pinned byte lengths and hashes',()=>{
  const root=new URL('../../web/vendor/ai-style/',import.meta.url);
  const production=validateStyleModelManifest(JSON.parse(readFileSync(new URL('assets.json',root),'utf8')));
  for(const provider of ['wasm','webgpu']){
    const asset=production.models[provider],bytes=readFileSync(new URL(asset.file,root));
    assert.equal(bytes.byteLength,asset.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);
  }
});

test('TinyCLIP preprocessing produces deterministic CHW 224 input',()=>{
  const image={width:2,height:2,data:Uint8Array.from([
    255,0,0,255, 0,255,0,255,
    0,0,255,255, 255,255,255,255,
  ])};
  const first=preprocessClipView(image,{x:0,y:0,width:2,height:2});
  const second=preprocessClipView(image,{x:0,y:0,width:2,height:2});
  assert.equal(first.length,3*STYLE_MODEL_INPUT.size*STYLE_MODEL_INPUT.size);
  assert.deepEqual(first,second);
  assert.ok(first.every(Number.isFinite));
});
