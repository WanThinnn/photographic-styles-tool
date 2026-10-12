import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregateStyleEmbeddings,orientStyleImage,styleImageStatistics,styleViewRects} from '../../web/src/recommend/style-analysis.js';
import {STYLE_EMBEDDING_DIMENSIONS} from '../../web/src/recommend/style-reference-bank.js';

function solid(width,height,r,g,b){
  const data=new Uint8Array(width*height*3);
  for(let i=0;i<data.length;i+=3){data[i]=r;data[i+1]=g;data[i+2]=b;}
  return {data,width,height};
}
test('stored HEIF samples are deterministically mapped to display orientation before TinyCLIP',()=>{
  const data=new Uint8Array(2*3*3);
  for(let i=0;i<6;i++)data.fill(i+1,i*3,i*3+3);
  const reds=image=>Array.from({length:image.width*image.height},(_,i)=>image.data[i*3]);
  const rotated=orientStyleImage({data,width:2,height:3},{angle:90,mirror:null});
  assert.deepEqual([rotated.width,rotated.height],[3,2]);
  assert.deepEqual(reds(rotated),[2,4,6,1,3,5]);
  assert.deepEqual(reds(orientStyleImage({data,width:2,height:3},{angle:180,mirror:null})),[6,5,4,3,2,1]);
  assert.deepEqual(reds(orientStyleImage({data,width:2,height:3},{angle:0,mirror:1})),[2,1,4,3,6,5]);
});

test('quality levels increase spatial analysis without leaving portrait, landscape, square or tiny images',()=>{
  for(const [width,height] of [[4032,3024],[3024,4032],[512,512],[3,2]]){
    const lite=styleViewRects(width,height,'lite'),standard=styleViewRects(width,height,'standard'),pro=styleViewRects(width,height,'pro');
    assert.equal(lite.length,1);assert.equal(standard.length,5);assert.equal(pro.length,9);
    for(const rect of pro)assert.ok(rect.x>=0&&rect.y>=0&&rect.x+rect.width<=width&&rect.y+rect.height<=height);
  }
});
test('image statistics preserve expected brightness and warmth ordering',()=>{
  const dark=styleImageStatistics(solid(32,32,20,20,20));
  const bright=styleImageStatistics(solid(32,32,230,230,230));
  const warm=styleImageStatistics(solid(32,32,220,100,40));
  const cool=styleImageStatistics(solid(32,32,40,100,220));
  const middle=styleImageStatistics(solid(32,32,128,128,128));
  assert.ok(dark.p50<bright.p50);assert.ok(middle.p50>.21&&middle.p50<.22,'luminance statistics must be linear-light');
  assert.ok(warm.warmth>cool.warmth);
  assert.ok(warm.chromaMean>dark.chromaMean);assert.ok(warm.chromaMedian>dark.chromaMedian);
  assert.deepEqual(styleImageStatistics(solid(32,32,220,100,40)),warm);
  assert.ok(Number.isFinite(warm.lumaIqr));
});
test('embedding aggregation is normalized and deterministic',()=>{
  const a=new Float32Array(STYLE_EMBEDDING_DIMENSIONS);a[0]=1;
  const b=new Float32Array(STYLE_EMBEDDING_DIMENSIONS);b[1]=1;
  const first=aggregateStyleEmbeddings([a,b]),second=aggregateStyleEmbeddings([a,b]);
  const norm=Math.sqrt(first.embedding.reduce((s,v)=>s+v*v,0));
  assert.ok(Math.abs(norm-1)<1e-5);
  assert.deepEqual([...first.embedding],[...second.embedding]);
  assert.equal(first.disagreement,second.disagreement);
});
