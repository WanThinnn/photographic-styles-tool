import test from 'node:test';
import assert from 'node:assert/strict';
import {STYLE_SELECTIONS} from '../../web/src/recommend/style-selection.js';
import {styleModelSpec} from '../../web/src/recommend/style-model.js';
import {validateStylePrototypes} from '../../web/src/recommend/style-prototypes.js';
import {recommendStyle,SUGGESTED_STYLE_PALETTE_MAX} from '../../web/src/recommend/style-recommender.js';

const IDS=Object.keys(STYLE_SELECTIONS).map(Number).filter(id=>id!==13&&id!==15);
const unit=(index,dimensions=512)=>{const value=new Array(dimensions).fill(0);value[index]=1;return value;};
function prototypes(level='standard'){
  const spec=styleModelSpec(level),dimensions=spec.input.embeddingDimensions;
  return validateStylePrototypes({schema:1,model:spec.id,revision:'a'.repeat(40),dimensions,negativeWeight:.35,
    styles:Object.fromEntries(IDS.map((id,index)=>[id,{name:STYLE_SELECTIONS[id].name,
      positive:unit(index,dimensions),negative:unit(index+100,dimensions)}]))},level);
}
const neutralStats={p10:.03,p25:.08,p50:.18,p75:.30,p90:.45,contrast:.42,lumaIqr:.22,
  shadowRatio:.2,highlightRatio:.03,chromaMean:.24,chromaMedian:.22,saturationMedian:.32,
  saturationP90:.55,warmth:0,samples:1000};

test('zero-shot recommender is deterministic, color-only and metadata-bounded',()=>{
  const model=prototypes(),embedding=Float32Array.from(unit(7));
  const first=recommendStyle({prototypes:model,level:'standard',embeddings:Array(9).fill(embedding),statistics:neutralStats});
  const second=recommendStyle({prototypes:model,level:'standard',embeddings:Array(9).fill(embedding),statistics:neutralStats});
  assert.deepEqual(first,second);assert.equal(first.styleId,IDS[7]);assert.notEqual(first.styleId,13);assert.notEqual(first.styleId,15);
  assert.ok(first.tone>=-1&&first.tone<=1);assert.ok(first.color>=-1&&first.color<=1);
  assert.ok(first.palette>=0&&first.palette<=SUGGESTED_STYLE_PALETTE_MAX);
});

test('automatic injected Styles keep a conservative Palette ceiling',()=>{
  const model=prototypes();
  for(const index of [0,4,10]){
    const result=recommendStyle({prototypes:model,level:'standard',embeddings:Array(9).fill(Float32Array.from(unit(index))),statistics:neutralStats});
    assert.ok(result.palette<=.70);
  }
});

test('genuine cross-view disagreement fails closed to Standard',()=>{
  const model=prototypes(),embeddings=Array.from({length:9},(_,index)=>Float32Array.from(unit(index)));
  const result=recommendStyle({prototypes:model,level:'standard',embeddings,statistics:neutralStats});
  assert.equal(result.styleId,1);assert.equal(result.fallback,true);
});

test('Pro validates and scores 768-dimensional SigLIP2 prototypes',()=>{
  const model=prototypes('pro'),embedding=Float32Array.from(unit(3,768));
  const result=recommendStyle({prototypes:model,level:'pro',embeddings:Array(17).fill(embedding),statistics:neutralStats});
  assert.equal(result.styleId,IDS[3]);assert.equal(result.fallback,false);
});
