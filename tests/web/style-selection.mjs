import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseBplist,BplistReal} from '../../web/src/core/bplist.js';
import {STYLE_IDS,STYLE_SELECTIONS,buildStyleMarker,styleSelection,validateStyleRecommendation} from '../../web/src/recommend/style-selection.js';

test('all sixteen validated Style ids build an eight-key 0x54 marker',()=>{
  assert.equal(STYLE_IDS.length,16);
  for(const id of STYLE_IDS){
    const preset=styleSelection(id);
    const marker=parseBplist(buildStyleMarker({styleId:id,tone:preset.tone,color:preset.color,palette:preset.palette,confidence:1,level:'standard'}));
    assert.equal(marker.get('0'),1);
    assert.equal(marker.get('4'),id);
    assert.equal(marker.get('5'),1);
    assert.equal(marker.get('6'),4);
    assert.equal(marker.get('7'),0);
    assert.equal(marker.get('1'),preset.tone);
    assert.equal(marker.get('2'),preset.color);
    assert.equal(marker.get('3'),preset.palette);
    const typed=parseBplist(buildStyleMarker({styleId:id,tone:preset.tone,color:preset.color,palette:preset.palette,confidence:1,level:'standard'}),{preserveReals:true});
    for(const key of ['1','2','3'])assert.ok(typed.get(key) instanceof BplistReal,`Style ${id} key ${key} must stay a bplist real`);
  }
});

test('curated native references calibrate all sixteen default pad states',()=>{
  const bank=JSON.parse(readFileSync(new URL('../../web/vendor/ai-style/reference-bank.json',import.meta.url),'utf8'));
  assert.equal(bank.records.length,16);
  for(const record of bank.records){
    const preset=STYLE_SELECTIONS[record.styleId];
    assert.ok(preset,'missing Style '+record.styleId);
    assert.ok(Math.abs(record.tone-preset.tone)<1e-5,preset.name+' tone drift');
    assert.ok(Math.abs(record.color-preset.color)<1e-5,preset.name+' color drift');
    assert.ok(Math.abs(record.palette-preset.palette)<1e-5,preset.name+' palette drift');
  }
});

test('project-proven Standard and Bright ids remain stable',()=>{
  assert.equal(STYLE_SELECTIONS[1].name,'Standard');
  assert.equal(STYLE_SELECTIONS[16].name,'Bright');
  assert.deepEqual([STYLE_SELECTIONS[16].tone,STYLE_SELECTIONS[16].color,STYLE_SELECTIONS[16].palette],[-.5,.5,1]);
});

test('Standard excludes Palette but retains the neutral eight-key marker',()=>{
  for(const palette of [undefined,0,.7,1]){
    const value={styleId:1,tone:.02,color:.01,...(palette===undefined?{}:{palette})};
    const recommendation=validateStyleRecommendation(value);
    assert.equal(recommendation.palette,1);
    assert.equal(recommendation.tone,.02);
    assert.equal(recommendation.color,.01);
    const marker=parseBplist(buildStyleMarker(value));
    assert.equal(marker.size,8);
    assert.equal(marker.get('3'),1);
    assert.equal(marker.get('1'),.02);
    assert.equal(marker.get('2'),.01);
  }
});

test('all other Styles, including B&W, retain their Palette parameter',()=>{
  for(const id of STYLE_IDS){
    assert.equal(styleSelection(id).hasPalette,id!==1);
    if(id===1)continue;
    const value={styleId:id,tone:0,color:0,palette:.37};
    assert.equal(validateStyleRecommendation(value).palette,.37);
    assert.equal(parseBplist(buildStyleMarker(value)).get('3'),.37);
    assert.throws(()=>validateStyleRecommendation({...value,palette:undefined}),RangeError);
  }
});

test('recommendation validation rejects unsupported or unsafe values',()=>{
  assert.throws(()=>validateStyleRecommendation({styleId:17,tone:0,color:0,palette:1}),RangeError);
  assert.throws(()=>validateStyleRecommendation({styleId:1,tone:Infinity,color:0,palette:1}),RangeError);
  assert.throws(()=>validateStyleRecommendation({styleId:1,tone:0,color:2,palette:1}),RangeError);
  assert.throws(()=>validateStyleRecommendation({styleId:1,tone:0,color:0,palette:-.1}),RangeError);
});
