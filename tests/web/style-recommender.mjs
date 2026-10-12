import test from 'node:test';
import assert from 'node:assert/strict';
import {STYLE_EMBEDDING_DIMENSIONS} from '../../web/src/recommend/style-reference-bank.js';
import {STYLE_MODEL_ID,STYLE_MODEL_REVISION} from '../../web/src/recommend/style-model.js';
import {SEMANTIC_AXIS_IDS,validateSemanticAxes} from '../../web/src/recommend/style-semantic-axes.js';
import {recommendStyle} from '../../web/src/recommend/style-recommender.js';

const unit=index=>{const value=new Float32Array(STYLE_EMBEDDING_DIMENSIONS);value[index]=1;return value;};
function axes(){
  const axisMap=Object.fromEntries(SEMANTIC_AXIS_IDS.map((id,index)=>[id,{
    positive:Array.from(unit(index*2)),negative:Array.from(unit(index*2+1)),temperature:4,
  }]));
  return validateSemanticAxes({schema:1,model:STYLE_MODEL_ID,revision:STYLE_MODEL_REVISION,
    dimensions:STYLE_EMBEDDING_DIMENSIONS,axes:axisMap});
}
const neutralStats={p10:.03,p25:.08,p50:.18,p75:.30,p90:.45,contrast:.42,lumaIqr:.22,
  shadowRatio:.2,highlightRatio:.03,chromaMean:.24,chromaMedian:.22,saturationMedian:.32,
  saturationP90:.55,warmth:0,samples:1000};

test('scene-aware recommender is deterministic and metadata-bounded',()=>{
  const first=recommendStyle({axes:axes(),level:'standard',embeddings:[unit(0),unit(0),unit(0),unit(0),unit(0)],statistics:neutralStats});
  const second=recommendStyle({axes:axes(),level:'standard',embeddings:[unit(0),unit(0),unit(0),unit(0),unit(0)],statistics:neutralStats});
  assert.deepEqual(first,second);
  assert.ok(first.styleId>=1&&first.styleId<=16);
  assert.ok(first.tone>=-1&&first.tone<=1);
  assert.ok(first.color>=-1&&first.color<=1);
  assert.ok(first.palette>=0&&first.palette<=1);
});

test('low-confidence semantic disagreement fails closed to Standard',()=>{
  const embeddings=[unit(0),unit(1),unit(2),unit(3),unit(4)];
  const result=recommendStyle({axes:axes(),level:'standard',embeddings,statistics:neutralStats});
  assert.equal(result.styleId,1);
  assert.equal(result.fallback,true);
});
