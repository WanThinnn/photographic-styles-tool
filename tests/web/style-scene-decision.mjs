import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreStyleScene,scenePhotoFeatures} from '../../web/src/recommend/style-scene-decision.js';

const baseSemantic={
  dramatic:0,airy:0,energetic:0,warmMood:0,dreamy:0,natural:0,people:0,colorful:0,
};
const stats=(overrides={})=>({
  p10:.03,p25:.08,p50:.18,p75:.30,p90:.45,contrast:.42,lumaIqr:.22,
  shadowRatio:.20,highlightRatio:.03,chromaMean:.24,chromaMedian:.22,
  saturationMedian:.32,saturationP90:.55,warmth:0,samples:1000,...overrides,
});
function decide(semantic,statistics=stats(),level='standard'){
  return scoreStyleScene({semantic:{...baseSemantic,...semantic},statistics,level,meanDispersion:.05});
}

test('balanced scene policy selects expressive styles only with coherent evidence',()=>{
  assert.equal(decide({dramatic:.9,airy:-.7,energetic:.3,natural:-.3},
    stats({p50:.06,contrast:.72,shadowRatio:.55})).winner.styleName,'Dramatic');
  assert.equal(decide({airy:.9,dreamy:.25,people:.5,dramatic:-.6},
    stats({p50:.34,contrast:.20,saturationMedian:.28})).winner.styleName,'Luminous');
  assert.equal(decide({warmMood:.95,energetic:-.35,dreamy:.15},
    stats({warmth:.18,p50:.12,contrast:.30})).winner.styleName,'Cozy');
  assert.equal(decide({energetic:.9,colorful:.95,dramatic:.2},
    stats({saturationMedian:.62,chromaMedian:.48,contrast:.5})).winner.styleName,'Vibrant');
  assert.equal(decide({colorful:-.95,dramatic:.9,airy:-.35},
    stats({saturationMedian:.03,chromaMedian:.02,contrast:.78})).winner.styleName,'Dramatic');
});

test('automatic recommendations never select either destructive B&W preset',()=>{
  const cases=[
    [{colorful:-1,dramatic:1,airy:-.5},stats({saturationMedian:0,chromaMedian:0,contrast:.9})],
    [{colorful:-1,dramatic:-.4,airy:.3,dreamy:.2},stats({saturationMedian:0,chromaMedian:0,contrast:.15})],
  ];
  for(const [semantic,statistics] of cases){
    const result=decide(semantic,statistics);
    assert.ok(![13,15].includes(result.winner.styleId));
    assert.ok(result.scores.every(style=>![13,15].includes(style.styleId)));
  }
});

test('ambiguous evidence stays in the natural-looking family',()=>{
  const result=decide({});
  assert.ok(['Standard','Natural','Neutral','Luminous'].includes(result.winner.styleName));
  assert.ok(result.scores[0].score>=result.scores[1].score);
  assert.equal(result.ambiguous,false,'a close but internally coherent choice is still actionable');
});

test('coherent multi-view evidence is not rejected only because absolute TinyCLIP scores are modest',()=>{
  const semantic={...baseSemantic,dramatic:-.074,airy:.172,energetic:-.057,warmMood:-.426,
    dreamy:.173,natural:-.077,people:-.297,colorful:-.126};
  const result=scoreStyleScene({semantic,semanticViews:Array(5).fill(semantic),statistics:stats(),
    level:'standard',meanDispersion:.021,maxDispersion:.029});
  assert.equal(result.winner.styleName,'Ethereal');
  assert.equal(result.support,1);
  assert.equal(result.ambiguous,false);
});

test('cross-view dispersion reduces confidence instead of vetoing a stable style decision',()=>{
  const semantic={...baseSemantic,dramatic:.9,airy:-.7,energetic:.3,natural:-.3};
  const coherent=scoreStyleScene({semantic,semanticViews:Array(5).fill(semantic),
    statistics:stats({p50:.06,contrast:.72,shadowRatio:.55}),level:'standard'});
  const dispersed=scoreStyleScene({semantic,semanticViews:Array(5).fill(semantic),
    statistics:stats({p50:.06,contrast:.72,shadowRatio:.55}),level:'standard',meanDispersion:.2,maxDispersion:.8});
  assert.equal(dispersed.winner.styleName,'Dramatic');
  assert.equal(dispersed.ambiguous,false);
  assert.ok(dispersed.confidence<coherent.confidence);
});

test('photo statistics normalize into bounded scene features',()=>{
  const value=scenePhotoFeatures(stats({p50:.5,contrast:.9,saturationMedian:.8,warmth:.4}));
  for(const number of Object.values(value))assert.ok(Number.isFinite(number)&&number>=-1&&number<=1);
});
