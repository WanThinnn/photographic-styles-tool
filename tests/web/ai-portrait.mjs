import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {addTexture} from '../../web/src/texture.js';
import {executeJob} from '../../web/src/heic-worker.js';
import {attachAiDepth,normalizeDisparity,portraitEligibility,inferenceGeometry} from '../../web/src/ai-portrait-container.js';
import {loadProfile} from '../../web/src/zip.js';
import {discoverHeic,extractItem,auxUriForItem,DEPTH_URI,propertyBoxBytes,idatItemBytes} from '../../web/src/heif.js';
import {concat,box,be,boxes} from '../../web/src/box.js';
import {renderDepthBlur} from '../../web/src/ai-portrait-blur.js';
import {displayToStoredTransform} from '../../web/src/ai-portrait-source.js';
import {itemOrientation} from '../../web/src/raster/heif.js';

test('AI source mapping honors HEIF mirror axes and ordered rotation/mirror properties',()=>{
  const bytes=Uint8Array.of(0,0),point={x:.17,y:.63},w=3088,h=2320;
  const rotate=(p,t)=>[p,{x:p.y,y:1-p.x},{x:1-p.x,y:1-p.y},{x:1-p.y,y:p.x}][t];
  const flip=(p,axis)=>axis===0?{x:p.x,y:1-p.y}:{x:1-p.x,y:p.y};
  for(const turn of [0,1,2,3])for(const axis of [null,0,1])for(const order of [false,true]){
    bytes[0]=turn;bytes[1]=axis??0;
    const associations=(order?[2,1]:[1,2]).filter(i=>i!==2||axis!==null).map(index=>({index}));
    const props={properties:[{type:'irot',box:{off:0,hdr:0}},{type:'imir',box:{off:1,hdr:0}}],associations:new Map([[7,associations]])};
    let displayed={...point};for(const {index}of associations)displayed=index===1?rotate(displayed,turn):flip(displayed,axis);
    const {angle,mirror}=itemOrientation(bytes,props,7),[a,b,c,d,e,f]=displayToStoredTransform(w,h,angle,mirror);
    assert.ok(Math.abs((a*displayed.x+c*displayed.y+e)/w-point.x)<1e-12);
    assert.ok(Math.abs((b*displayed.x+d*displayed.y+f)/h-point.y)<1e-12);
  }
});

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
test('high detail GPU input and resource fallbacks keep aspect ratio within patch rounding',()=>{
  for(const edge of [1036,770,518])for(const [w,h] of [[4032,3024],[3024,4032],[900,600],[8000,1000]]){
    const input=inferenceGeometry(w,h,edge);assert.ok(Math.max(input.width,input.height)<=edge);
    assert.equal(input.width%14,0);assert.equal(input.height%14,0);
    const scale=edge/Math.max(w,h);
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
  const footer=box('free',new Uint8Array([1,2,3,4]));
  const input=concat([materialize(profile),footer]),before=discoverHeic(input);
  assert.equal(portraitEligibility(input),null);
  const fixture=JSON.parse(readFileSync(new URL('./raster-hevc.fixture.json',import.meta.url)));
  const codec=Uint8Array.from(fixture.assets.mask.hvcc),payload=Uint8Array.from(fixture.assets.mask.payload);
  assert.throws(()=>attachAiDepth(input,{payload,hvcc:box('hvcC',codec),width:64,height:64}),/expected one hvcC box/);
  assert.throws(()=>attachAiDepth(input,{payload,hvcc:codec.subarray(8),width:64,height:64}));
  const output=attachAiDepth(input,{payload,hvcc:codec,width:64,height:64}),after=discoverHeic(output);
  for(const [id,item] of before.iloc.items)if(item.constructionMethod===0&&item.extents.length)assert.ok(Buffer.from(extractItem(input,before.iloc,id)).equals(Buffer.from(extractItem(output,after.iloc,id))),`original item ${id}`);
  for(const [id,item] of before.iloc.items)if(item.constructionMethod===1)assert.deepEqual(idatItemBytes(output,id,after.meta),idatItemBytes(input,id,before.meta));
  const free=[...boxes(output,0,output.length)].find(b=>b.type==='free');
  assert.deepEqual(output.slice(free.off,free.off+free.size),footer);
  const depth=[...after.infos.keys()].find(id=>auxUriForItem(after.props,id)===DEPTH_URI);assert.ok(depth);
  assert.deepEqual(propertyBoxBytes(output,after.props,depth,'hvcC'),codec,'codec box is not wrapped twice');
  assert.ok(after.refs.some(ref=>ref.type==='auxl'&&ref.from===depth&&ref.to.includes(after.primary)));
  assert.ok(after.refs.some(ref=>ref.type==='cdsc'&&ref.to.includes(depth)));
  const associations=after.props.associations.get(depth).map(a=>after.props.properties[a.index-1].type);
  assert.ok(associations.indexOf('auxC')<associations.indexOf('irot'));
  const sidecar=after.refs.find(ref=>ref.type==='cdsc'&&ref.to.includes(depth)).from;
  assert.ok(new TextDecoder().decode(extractItem(output,after.iloc,sidecar)).includes('http://ns.apple.com/pixeldatainfo/1.0/'));
  assert.throws(()=>attachAiDepth(output,{payload,hvcc:codec,width:64,height:64}),/Existing depth/);
  for(const type of ['irot','imir'])assert.deepEqual(propertyBoxBytes(output,after.props,depth,type),propertyBoxBytes(input,before.props,before.primary,type));
});

test('portable native Texture regression preserves every original image payload',async()=>{
  const input=materialize(profile),before=discoverHeic(input);
  const output=(await executeJob({operation:'texture',data:input})).data,after=discoverHeic(output);
  assert.deepEqual(output,addTexture(input).data);
  for(const [id,item] of before.iloc.items)if(item.constructionMethod===0&&item.extents.length)assert.deepEqual(extractItem(output,after.iloc,id),extractItem(input,before.iloc,id),`original item ${id}`);
  const metadata=await executeJob({operation:'metadata',data:output});
  assert.equal(metadata.bytes,output.byteLength);assert.ok(metadata.width>0&&metadata.height>0);
});
