import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {STYLE_IDS,styleSelection} from '../../web/src/recommend/style-selection.js';
import {formatStyleParameters} from '../../web/src/ui/result-metadata.js';

test('Standard Details show Tone and Color without Palette',()=>{
  for(const palette of [undefined,0,.7,1]){
    assert.equal(formatStyleParameters({styleId:1,tone:.02,color:.01,palette}),
      'Standard · Tone +0.02 · Color +0.01');
  }
});

test('every non-Standard Style keeps Palette in Details',()=>{
  for(const id of STYLE_IDS.filter(id=>id!==1)){
    assert.equal(formatStyleParameters({styleId:id,tone:-.02,color:.01,palette:.7}),
      `${styleSelection(id).name} · Tone -0.02 · Color +0.01 · Palette 0.70`);
  }
});

test('result notes use the shared parameter formatter, including existing fallback handling',()=>{
  const source=readFileSync(new URL('../../web/src/app/processing/photo-analysis.js',import.meta.url),'utf8');
  const note=source.slice(source.indexOf('function styleResultNote('),source.indexOf('function adaptiveStyleCompletionNotice('));
  assert.match(note,/formatStyleParameters\(recommendation\)/);
  assert.match(note,/recommendation\.fallback.*styleFallback/);
  assert.doesNotMatch(note,/recommendation\.palette/);
});
