import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {STYLE_EMBEDDING_DIMENSIONS} from '../../web/src/recommend/style-reference-bank.js';
import {
  SEMANTIC_AXIS_IDS,semanticAxisFeatures,validateSemanticAxes,
} from '../../web/src/recommend/style-semantic-axes.js';
import {STYLE_MODEL_ID,STYLE_MODEL_REVISION} from '../../web/src/recommend/style-model.js';

const unit=index=>{
  const value=new Array(STYLE_EMBEDDING_DIMENSIONS).fill(0);value[index]=1;return value;
};
const manifest=()=>({
  schema:1,model:STYLE_MODEL_ID,revision:STYLE_MODEL_REVISION,dimensions:STYLE_EMBEDDING_DIMENSIONS,
  axes:Object.fromEntries(SEMANTIC_AXIS_IDS.map((id,index)=>[id,{
    positive:unit(index*2),negative:unit(index*2+1),temperature:4,
  }])),
});

test('build-time prompt source covers every runtime semantic axis without leaking into web assets',()=>{
  const prompts=JSON.parse(readFileSync(new URL('../../tools/style-axis-prompts.json',import.meta.url),'utf8'));
  assert.equal(prompts.schema,1);
  assert.deepEqual(Object.keys(prompts.axes),[...SEMANTIC_AXIS_IDS]);
  for(const axis of Object.values(prompts.axes)){
    assert.ok(Array.isArray(axis.positive)&&axis.positive.length>=3);
    assert.ok(Array.isArray(axis.negative)&&axis.negative.length>=3);
    assert.ok([...axis.positive,...axis.negative].every(value=>typeof value==='string'&&value.trim().length>8));
  }
});

test('packaged semantic axes contain vectors only and match the pinned embedding space',()=>{
  const raw=JSON.parse(readFileSync(new URL('../../web/vendor/ai-style/semantic-axes.json',import.meta.url),'utf8'));
  const parsed=validateSemanticAxes(raw);
  assert.deepEqual(Object.keys(parsed.axes),[...SEMANTIC_AXIS_IDS]);
  const serialized=JSON.stringify(raw);
  assert.doesNotMatch(serialized,/prompt|tokenizer|input_ids|attention_mask|text_embeds/);
});

test('semantic axes are pinned to the same TinyCLIP embedding space',()=>{
  const parsed=validateSemanticAxes(manifest());
  assert.deepEqual(Object.keys(parsed.axes),[...SEMANTIC_AXIS_IDS]);
  const bad=manifest();bad.revision='wrong';
  assert.throws(()=>validateSemanticAxes(bad),/Unsupported semantic axes/);
  const text=manifest();text.axes.dramatic.prompt='forbidden runtime text';
  assert.throws(()=>validateSemanticAxes(text),/Unexpected semantic axis field/);
});

test('semantic features preserve axis direction and expose multi-view disagreement',()=>{
  const axes=validateSemanticAxes(manifest());
  const a=new Float32Array(STYLE_EMBEDDING_DIMENSIONS);a[0]=1;
  const b=new Float32Array(STYLE_EMBEDDING_DIMENSIONS);b[0]=.8;b[1]=.6;
  const result=semanticAxisFeatures([a,b],axes);
  assert.ok(result.values.dramatic>0);
  assert.ok(result.dispersion.dramatic>0);
  assert.ok(result.meanDispersion>0);
  assert.equal(result.views,2);
});

test('semantic features reject malformed embeddings',()=>{
  const axes=validateSemanticAxes(manifest());
  assert.throws(()=>semanticAxisFeatures([new Float32Array(12)],axes),/dimensions/i);
});
