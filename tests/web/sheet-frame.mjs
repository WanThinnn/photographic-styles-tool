import test from 'node:test';
import assert from 'node:assert/strict';
import {continuousSheetPath,bindContinuousSheetFrame} from '../../web/src/ui/shell/sheet-frame.js';

const points=path=>[...path.matchAll(/L([\d.-]+) ([\d.-]+)/g)].map(match=>[Number(match[1]),Number(match[2])]);
test('phone curve follows the supplied Camera contour rather than a circular radius',()=>{
  const corner=[[0,92],...points(continuousSheetPath(386,640)).slice(0,64)];
  // Screenshot edge samples in pt, relative to its 8pt side/bottom gaps.
  for(const [y,expectedX]of [[47.667,1.333],[39.333,2.667],[31,5.333],[22.667,10],[14.333,17.333],[6,29.667]]){
    const index=corner.findIndex((point,i)=>i&&point[1]<=y);
    const [x0,y0]=corner[index-1],[x1,y1]=corner[index];
    const actual=x0+(x1-x0)*(y0-y)/(y0-y1);
    assert.ok(Math.abs(actual-expectedX)<1.2,JSON.stringify({y,actual,expectedX}));
  }
});
test('continuous outline stays inside small, landscape and fractional frames',()=>{
  for(const [width,height]of [[304,490],[386,641.75],[580,280],[30,20]]){
    for(const inset of [0,.25]){
      const path=continuousSheetPath(width,height,inset);assert.ok(path.endsWith('Z'));
      assert.ok(points(path).every(([x,y])=>x>=inset&&x<=width-inset&&y>=inset&&y<=height-inset));
    }
  }
  assert.equal(continuousSheetPath(NaN,640),'');assert.equal(continuousSheetPath(386,0),'');
});

test('frame resizes while open and removes its clip when returning to tablet layout',()=>{
  const attributes=new Map(),style=new Map(),paths=new Map();let width=386,height=640,notify,disconnected=false;
  const query=new EventTarget();query.matches=true;
  const clip={id:'test-clip',querySelector:()=>({setAttribute:(_,value)=>paths.set('clip',value)})};
  const frame={querySelector:selector=>selector==='clipPath'?clip:{setAttribute:(_,value)=>paths.set('outline',value)},setAttribute:(_,value)=>paths.set('viewBox',value)};
  const sheet={open:true,querySelector:()=>frame,setAttribute:(key,value)=>attributes.set(key,value),removeAttribute:key=>attributes.delete(key),style:{setProperty:(key,value)=>style.set(key,value),removeProperty:key=>style.delete(key)}};
  const win={matchMedia:()=>query,getComputedStyle:()=>({width:String(width),height:String(height)}),ResizeObserver:class{constructor(fn){notify=fn;}observe(){}disconnect(){disconnected=true;}}};
  const binding=bindContinuousSheetFrame({sheet,win});
  assert.equal(paths.get('viewBox'),'0 0 386 640');assert.equal(style.get('clip-path'),'url("#test-clip")');
  height=520.25;notify();assert.equal(paths.get('viewBox'),'0 0 386 520.25');
  query.matches=false;query.dispatchEvent(new Event('change'));
  assert.equal(attributes.has('data-continuous-frame'),false);assert.equal(style.has('clip-path'),false);
  query.matches=true;query.dispatchEvent(new Event('change'));assert.equal(attributes.has('data-continuous-frame'),true);
  binding.dispose();assert.equal(disconnected,true);assert.equal(style.has('clip-path'),false);
});
