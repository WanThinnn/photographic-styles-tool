import test from 'node:test';
import assert from 'node:assert/strict';
import {applyStyleDisplayRgba,shouldRenderStyleDisplay,styleDisplayParameters} from '../../web/src/recommend/style-display-render.js';

const rec=(styleId,tone,color,palette=1,extra={})=>({styleId,tone,color,palette,confidence:.9,level:'standard',...extra});
const pixels=Uint8ClampedArray.from([
  24,48,72,255,
  96,128,160,255,
  210,180,120,255,
  0,0,0,255,
]);

test('only a genuinely neutral Standard skips the display rendition',()=>{
  const standard=rec(1,0,0,1),tuned=rec(1,.18,-.12,.7),fallback={...tuned,fallback:true};
  assert.equal(shouldRenderStyleDisplay(standard),false);
  assert.equal(shouldRenderStyleDisplay(tuned),true);
  assert.equal(shouldRenderStyleDisplay(fallback),true);
  assert.deepEqual(applyStyleDisplayRgba(pixels,standard),pixels);
  assert.notDeepEqual(applyStyleDisplayRgba(pixels,tuned),pixels);
  assert.notDeepEqual(applyStyleDisplayRgba(pixels,fallback),pixels);
});

test('Dramatic display rendition is deterministic, bounded and keeps black padding black',()=>{
  const dramatic=rec(11,-.75,.2,.99);
  assert.equal(shouldRenderStyleDisplay(dramatic),true);
  const first=applyStyleDisplayRgba(pixels,dramatic),second=applyStyleDisplayRgba(pixels,dramatic);
  assert.deepEqual(first,second);assert.notDeepEqual(first,pixels);
  assert.deepEqual([...first.slice(12,16)],[0,0,0,255]);
  assert.ok([...first].every(value=>Number.isInteger(value)&&value>=0&&value<=255));
  const before=Math.max(...pixels.slice(0,3))-Math.min(...pixels.slice(0,3));
  const after=Math.max(...first.slice(0,3))-Math.min(...first.slice(0,3));
  assert.ok(after>=before*.75);
});

test('B&W Styles remove chroma while expressive colour Styles retain it',()=>{
  const muted=applyStyleDisplayRgba(pixels,rec(15,.4,0,.5));
  for(let i=0;i<12;i+=4)assert.ok(Math.max(muted[i],muted[i+1],muted[i+2])-Math.min(muted[i],muted[i+1],muted[i+2])<=1);
  const vibrant=applyStyleDisplayRgba(pixels,rec(8,-.3,.33,1));
  assert.notDeepEqual(vibrant,pixels);
  assert.ok(styleDisplayParameters(rec(8,-.3,.33,1)).saturation>0);
});
