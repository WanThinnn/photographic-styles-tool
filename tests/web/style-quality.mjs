import test from 'node:test';
import assert from 'node:assert/strict';
import {STYLE_QUALITY,styleQuality} from '../../web/src/recommend/style-quality.js';

test('Suggested Styles spends progressively more analysis budget',()=>{
  const lite=styleQuality('lite'),standard=styleQuality('standard'),pro=styleQuality('pro');
  assert.ok(lite.views<standard.views&&standard.views<pro.views);
  assert.ok(lite.k<standard.k&&standard.k<pro.k);
  assert.ok(lite.statsSize<standard.statsSize&&standard.statsSize<pro.statsSize);
  assert.ok(lite.maxSemanticDispersion>standard.maxSemanticDispersion&&standard.maxSemanticDispersion>pro.maxSemanticDispersion);
  assert.ok(lite.minScoreMargin>standard.minScoreMargin&&standard.minScoreMargin>pro.minScoreMargin);
  for(const quality of [lite,standard,pro])assert.ok(quality.minConfidence>0&&quality.minConfidence<1);
  assert.deepEqual(Object.keys(STYLE_QUALITY),['lite','standard','pro']);
});
test('unknown quality level is rejected',()=>assert.throws(()=>styleQuality('ultra'),RangeError));
