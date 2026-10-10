import test from 'node:test';
import assert from 'node:assert/strict';
import {faceCropRect,blendFaceConfidence,skinDetailVariance,personMatteAlpha} from '../../web/src/vision/face-refinement.js';
import {peopleEntry} from '../../web/src/vision/face-mattes.js';

test('face crops are square in pixels, bounded and include edge faces without coordinate stretching',()=>{
  for(const [width,height] of [[1024,768],[768,1024]])for(const x of [0,.4,.85]){
    const face={x,y:.35,width:.15,height:.2},crop=faceCropRect(face,width,height);
    assert.equal(crop.width,crop.height);assert.ok(crop.x>=0&&crop.y>=0);
    assert.ok(crop.x+crop.width<=width&&crop.y+crop.height<=height);
    assert.ok(crop.x<=x*width&&crop.x+crop.width>=(x+.15)*width);
  }
});
test('local skin refinement preserves unrelated pixels and blends probability without strengthening it',()=>{
  const base=new Uint8ClampedArray(100).fill(60),detail=new Uint8ClampedArray(16).fill(180),gate=new Uint8ClampedArray(100);
  for(let y=3;y<7;y++)for(let x=3;x<7;x++)gate[y*10+x]=255;
  const result=blendFaceConfidence(base,detail,gate,10,10,{x:2,y:2,width:6,height:6},4,4);
  assert.equal(result.applied,true);assert.equal(base[44],60);assert.equal(result.plane[44],180);
  for(let i=0;i<100;i++)if(!gate[i])assert.equal(result.plane[i],base[i]);
  assert.ok(result.plane.every(v=>v>=60&&v<=180));
  const failed=blendFaceConfidence(base,new Uint8ClampedArray(16),gate,10,10,{x:2,y:2,width:6,height:6},4,4);
  assert.equal(failed.applied,false);assert.equal(failed.plane,base);
});
test('independent face passes preserve earlier refinement outside the next face',()=>{
  const base=new Uint8ClampedArray(400).fill(10),gate=new Uint8ClampedArray(400),nextGate=gate.slice();
  for(let y=5;y<10;y++)for(let x=2;x<7;x++){gate[y*20+x]=255;nextGate[y*20+x+10]=255;}
  const first=blendFaceConfidence(base,new Uint8ClampedArray(16).fill(220),gate,20,20,{x:1,y:4,width:7,height:7},4,4);
  const next=blendFaceConfidence(first.plane,new Uint8ClampedArray(16).fill(150),nextGate,20,20,{x:11,y:4,width:7,height:7},4,4);
  assert.equal(next.plane[6*20+4],220);assert.equal(next.plane[6*20+14],150);
});
test('detail roughness rejects a broad lighting gradient but responds to fine skin texture',()=>{
  const w=20,h=20,mask=new Uint8Array(w*h).fill(255);
  const gradient=Float32Array.from({length:w*h},(_,i)=>.2+(i%w)*.01+Math.floor(i/w)*.01);
  const textured=Float32Array.from(gradient,(v,i)=>v+((i%w+Math.floor(i/w))%2?.02:-.02));
  assert.ok(skinDetailVariance(gradient,mask,w,h)<1e-12);
  assert.ok(skinDetailVariance(textured,mask,w,h)>.001);
  assert.equal(skinDetailVariance(textured,new Uint8Array(w*h),w,h),0);
});
test('D roughness changes only the smoothing scalar while keeping face colour and eye statistics',()=>{
  const landmarks=Array.from({length:478},(_,i)=>({x:.2+(i%20)*.005,y:.3+Math.floor(i/20)*.005,z:0}));
  const stats={averageColor:[.7,.5,.4],roughness:.02,detailRoughness:.00015};
  const legacy=peopleEntry(landmarks,{...stats,detailRoughness:undefined},'FSINCInstanceMask9',0,null);
  const selected=peopleEntry(landmarks,stats,'FSINCInstanceMask9',0,null);
  const smoothing=selected.get('imageStats').get('SkinSmoothingStandalone');
  assert.equal(smoothing.get('SkinSmoothFaceRoughness'),stats.detailRoughness);
  const eyes=selected.get('imageStats').get('UnderEyeBrightening');
  assert.equal(eyes.get('LeftEyeLumaVariance'),stats.roughness);
  assert.equal(eyes.get('RightEyeLumaVariance'),stats.roughness);
  const restored=structuredClone(selected);
  restored.get('imageStats').get('SkinSmoothingStandalone').set('SkinSmoothFaceRoughness',stats.roughness);
  assert.deepEqual(restored,legacy);
  const flat=peopleEntry(landmarks,{...stats,detailRoughness:0},'FSINCInstanceMask9',0,null);
  assert.equal(flat.get('imageStats').get('SkinSmoothingStandalone').get('SkinSmoothFaceRoughness'),0);
});
test('generated person opacity removes the background confidence floor without a hard edge',()=>{
  for(const value of [0,9,21,32])assert.equal(personMatteAlpha(value),0);
  for(const value of [224,251,255])assert.equal(personMatteAlpha(value),255);
  assert.equal(personMatteAlpha(128),128);
  const values=Array.from({length:256},(_,i)=>personMatteAlpha(i));
  for(let i=1;i<values.length;i++){
    assert.ok(values[i]>=values[i-1]);
    assert.ok(values[i]-values[i-1]<=2,'preserve a gradual hair/edge transition');
  }
});
