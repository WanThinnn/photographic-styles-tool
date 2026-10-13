import test from 'node:test';
import assert from 'node:assert/strict';
import {enhanceDetail,DETAIL_PRESETS} from '../../web/src/detail/detail-processing.js';

function photo(width,height,paint){
 const data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const p=(y*width+x)*4,rgba=paint(x,y);
   data.set(rgba,p);
 }
 return {width,height,data};
}
test('presets available',()=>assert.deepEqual(Object.keys(DETAIL_PRESETS),['natural','balanced','crisp']));
test('strength 0 returns isolated exact copy',()=>{
 const src=photo(8,8,(x,y)=>[x*20,y*20,90,255]);
 const result=enhanceDetail(src,{strength:0});
 assert.deepEqual(result.data,src.data);
 assert.notStrictEqual(result.data,src.data);
 result.data[0]=255;
 assert.equal(src.data[0],0);
});
test('uniform and transparent pixels unchanged',()=>{
 const src=photo(8,8,()=>[100,100,100,255]);
 assert.deepEqual(enhanceDetail(src,{strength:100}).data,src.data);
 const transparent=photo(8,8,()=>[0,60,90,0]);
 assert.deepEqual(enhanceDetail(transparent).data,transparent.data);
});
test('contrast edges sharpen with bounded RGB movement, alpha preserved',()=>{
 const src=photo(16,8,(x)=>[x<8?80:170,x<8?90:180,x<8?100:190,220]);
 const before=Uint8ClampedArray.from(src.data);
 const out=enhanceDetail(src,{preset:'crisp',strength:100});
 assert.deepEqual(src.data,before);
 assert.ok(out.data.some((v,i)=>i%4!==3&&v!==before[i]));
 for(let i=0;i<before.length;i+=4){
   for(let c=0;c<3;c++)assert.ok(Math.abs(out.data[i+c]-before[i+c])<=23);
   assert.equal(out.data[i+3],220);
 }
});
test('invalid input and aborted task fail closed',()=>{
 const src=photo(5,5,()=>[120,120,120,255]);
 assert.throws(()=>enhanceDetail({...src,width:100}),RangeError);
 assert.throws(()=>enhanceDetail(src,{preset:'nonexistent'}),RangeError);
 assert.throws(()=>enhanceDetail(src,{strength:101}),RangeError);
 const controller=new AbortController();controller.abort();
 assert.throws(()=>enhanceDetail(src,{signal:controller.signal}),/cancelled/);
});
