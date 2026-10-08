import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {attachAiDepth,normalizeDisparity,portraitEligibility,inferenceGeometry} from '../../web/src/ai-portrait-container.js';
import {loadProfile} from '../../web/src/zip.js';
import {discoverHeic,extractItem,auxUriForItem,DEPTH_URI,propertyBoxBytes} from '../../web/src/heif.js';
import {concat,box,be} from '../../web/src/box.js';
import {renderDepthBlur} from '../../web/src/ai-portrait-blur.js';

test('portable preview blur softens background, preserves foreground and avoids dark borders',()=>{
  const w=9,h=9,rgba=new Uint8ClampedArray(w*h*4),gray=new Uint8Array(w*h);
  for(let i=0;i<gray.length;i++){
    const value=i%2?255:0;rgba.set([value,value,value,177],i*4);
    gray[i]=i===40?255:0;
  }
  const blurred=renderDepthBlur(rgba,gray,w,h,255,2);
  assert.deepEqual([...blurred.slice(160,164)],[...rgba.slice(160,164)]);
  assert.ok(blurred[4]>0&&blurred[4]<255,'background is softened');
  for(let i=0;i<gray.length;i++)assert.equal(blurred[i*4+3],177);
  assert.deepEqual(renderDepthBlur(rgba,gray,w,h,255,0),rgba);
  const white=new Uint8ClampedArray(w*h*4).fill(255);
  assert.deepEqual(renderDepthBlur(white,gray,w,h,255,20),white,'edges remain white');
  assert.throws(()=>renderDepthBlur(rgba,gray,1,1,255,2),/geometry/);
});

test('relative inverse depth retains near/far direction and rejects invalid maps',()=>{
  assert.deepEqual([...normalizeDisparity([2,4,6])],[0,128,255]);
  assert.throws(()=>normalizeDisparity([1,1]));assert.throws(()=>normalizeDisparity([0,NaN]));
});
test('background blur rejects nearer subject colours at the silhouette',()=>{
  const w=21,h=9,rgba=new Uint8ClampedArray(w*h*4),gray=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x,near=x>=10;
    gray[i]=near?255:0;rgba.set(near?[255,0,0,255]:[0,0,200,255],i*4);
  }
  const output=renderDepthBlur(rgba,gray,w,h,255,10);
  for(let i=0;i<gray.length;i++)assert.deepEqual([...output.slice(i*4,i*4+4)],[...rgba.slice(i*4,i*4+4)]);
});
test('GPU input keeps aspect ratio within patch rounding and bounds mobile memory',()=>{
  for(const [w,h] of [[4032,3024],[3024,4032],[900,600],[8000,1000]]){
    const input=inferenceGeometry(w,h);assert.ok(Math.max(input.width,input.height)<=518);
    assert.equal(input.width%14,0);assert.equal(input.height%14,0);
    const scale=518/Math.max(w,h);
    assert.ok(Math.abs(input.width-w*scale)<=7);assert.ok(Math.abs(input.height-h*scale)<=7);
  }
});

const profile=await loadProfile(new Uint8Array(readFileSync(new URL('../../web/profiles/48-12.zip',import.meta.url))));
function materialize(profile){
  const meta=profile.meta.slice(),d=discoverHeic(meta),chunks=[];let cursor=profile.ftyp.length+meta.length+8;
  for(const [id,v] of d.iloc.items){if(v.constructionMethod!==0||!v.extents.length)continue;
    const payload=profile.retained.get(id) || Uint8Array.from([0,0,0,4,38,1,id & 255,0]);
    meta.set(be(cursor,d.iloc.offsetSize),v.extents[0].offsetPos);meta.set(be(payload.length,d.iloc.lengthSize),v.extents[0].lengthPos);
    cursor+=payload.length;chunks.push(payload);
  }return concat([profile.ftyp,meta,box('mdat',concat(chunks))]);
}
test('AI appends auxiliary data without changing any existing image, HDR, Styles or Exif payload',()=>{
  const input=materialize(profile),before=discoverHeic(input);
  assert.equal(portraitEligibility(input),'native-styles');
  const fixture=JSON.parse(readFileSync(new URL('./raster-hevc.fixture.json',import.meta.url)));
  const codec=Uint8Array.from(fixture.assets.mask.hvcc),payload=Uint8Array.from(fixture.assets.mask.payload);
  const output=attachAiDepth(input,{payload,hvcc:codec,width:64,height:64}),after=discoverHeic(output);
  for(const [id,item] of before.iloc.items)if(item.constructionMethod===0&&item.extents.length)assert.ok(Buffer.from(extractItem(input,before.iloc,id)).equals(Buffer.from(extractItem(output,after.iloc,id))),`original item ${id}`);
  const depth=[...after.infos.keys()].find(id=>auxUriForItem(after.props,id)===DEPTH_URI);assert.ok(depth);
  assert.ok(after.refs.some(ref=>ref.type==='auxl'&&ref.from===depth&&ref.to.includes(after.primary)));
  assert.ok(after.refs.some(ref=>ref.type==='cdsc'&&ref.to.includes(depth)));
  assert.throws(()=>attachAiDepth(output,{payload,hvcc:codec,width:64,height:64}),/Existing depth/);
  for(const type of ['irot','imir'])assert.deepEqual(propertyBoxBytes(output,after.props,depth,type),propertyBoxBytes(input,before.props,before.primary,type));
});

test('native iPhone 16 style algorithms remain byte-identical to the deployed commit',()=>{
  // Raster encoder fallback changed intentionally; its behavior is checked separately.
  for(const file of ['web/src/texture.js','web/src/port.js','web/src/graft.js','web/src/decode.js']){
    const head=execFileSync('rtk',['proxy','git','show',`693cdc891e67778c2fb879b9a9d34d9d9a8a7eb1:${file}`],{maxBuffer:2e6});
    assert.ok(head.equals(readFileSync(file)),`${file} changed`);
  }
});
