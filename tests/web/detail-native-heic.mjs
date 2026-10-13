import test from 'node:test';
import assert from 'node:assert/strict';
import {convertTransferRgba,resampleRgba} from '../../web/src/detail/detail-native-heic.js';

test('BT.709 -> sRGB -> BT.709 transfer conversion is bounded and near round-trip',()=>{
 const src=new Uint8ClampedArray([0,16,64,255, 96,128,192,255, 220,240,255,255]);
 const srgb=convertTransferRgba(src,'bt709','srgb');
 const back=convertTransferRgba(srgb,'srgb','bt709');
 assert.equal(back.length,src.length);
 for(let i=0;i<src.length;i++){
  if(i%4===3)assert.equal(back[i],255);
  else assert.ok(Math.abs(back[i]-src[i])<=2,`${i}: ${src[i]} -> ${srgb[i]} -> ${back[i]}`);
 }
});

test('RGBA bilinear resample preserves endpoints and dimensions',()=>{
 const src=new Uint8ClampedArray([
  0,0,0,255, 255,0,0,255,
  0,255,0,255, 255,255,255,255,
 ]);
 const same=resampleRgba(src,2,2,2,2);
 assert.deepEqual(same,src);assert.notStrictEqual(same,src);
 const up=resampleRgba(src,2,2,4,4);
 assert.equal(up.length,4*4*4);
 assert.equal(up[3],255);assert.equal(up.at(-1),255);
 const centre=(2*4+2)*4;
 assert.ok(up[centre]>100&&up[centre+1]>100);
});

test('invalid RGBA resample geometry is rejected',()=>{
 assert.throws(()=>resampleRgba(new Uint8ClampedArray(3),1,1,1,1),/Invalid/);
 assert.throws(()=>resampleRgba(new Uint8ClampedArray(4),1,1,0,1),/Invalid/);
});
