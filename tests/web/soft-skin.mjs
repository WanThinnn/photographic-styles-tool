import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadProfile} from '../../web/src/core/zip.js';
import {discoverHeic,extractItem,idatItemBytes,auxUriForItem,propertyBoxBytes,propertyForItem,MATTE_URIS} from '../../web/src/core/heif.js';
import {addTexture,URI_TEXTURE_STYLES} from '../../web/src/styles/texture.js';
import {parseBplist,buildBplist,BplistReal} from '../../web/src/core/bplist.js';
import {be,box,concat,topBox} from '../../web/src/core/box.js';
import {MATTE_2026_URIS,URI_PERSON_INSTANCES} from '../../web/src/raster/texture.js';
import {NATIVE_EMPTY_TEXTURE_MATTE as mask} from '../../web/src/raster/native-empty-texture.js';
import {installSoftSkin,hasSoftSkinData} from '../../web/src/styles/soft-skin-container.js';
import {peopleEntry} from '../../web/src/vision/face-mattes.js';
import {generatedStyleMetadata} from '../../web/src/styles/generated-style-metadata.js';
import {removeItems} from '../../web/src/raster/heif.js';
import {buildAppleStyleExif} from '../../web/src/raster/exif.js';
import {rebuildHeic} from '../../web/src/styles/graft.js';
import {extractAppleMakerNoteTag} from '../../web/src/core/exif.js';

async function fixture(model=null){
  const profile=await loadProfile(new Uint8Array(fs.readFileSync(new URL('../../web/profiles/48-12.zip',import.meta.url))));
  const meta=profile.meta.slice(),d=discoverHeic(meta),chunks=[];let cursor=profile.ftyp.length+meta.length+8;
  for(const [id,item] of d.iloc.items){
    if(item.constructionMethod!==0||!item.extents.length)continue;
    const payload=model&&id===d.exifItem?buildAppleStyleExif(profile.mn54):profile.retained.get(id)||new Uint8Array([0,0,0,4,38,1,id&255,0]);
    meta.set(be(cursor,d.iloc.offsetSize),item.extents[0].offsetPos);meta.set(be(payload.length,d.iloc.lengthSize),item.extents[0].lengthPos);
    cursor+=payload.length;chunks.push(payload);
  }
  let source=concat([profile.ftyp,meta,box('mdat',concat(chunks))]);
  if(model){
    const g=discoverHeic(source),e=extractItem(source,g.iloc,g.exifItem);
    const start=new DataView(e.buffer,e.byteOffset,4).getUint32(0)+4,t=e.subarray(start);
    const little=t[0]===73,v=new DataView(t.buffer,t.byteOffset,t.length),root=v.getUint32(4,little);
    const num=(value,size)=>little?be(value,size).reverse():be(value,size);
    const name=new TextEncoder().encode(model+'\0'),entries=[];
    for(let i=0;i<v.getUint16(root,little);i++)entries.push(t.slice(root+2+i*12,root+14+i*12));
    entries.push(concat([num(0x110,2),num(2,2),num(name.length,4),num(t.length,4)]));
    const exif=concat([e,name,num(entries.length,2),...entries,new Uint8Array(4)]);
    new DataView(exif.buffer).setUint32(start+4,t.length+name.length,little);
    source=rebuildHeic(source,g,profile.ftyp,source.slice(g.meta.off,g.meta.off+g.meta.size),new Map([[g.exifItem,exif]]));
  }
  return {source,data:addTexture(source).data};
}
function withoutEditingGraph(source){
  const d=discoverHeic(source),ft=topBox(source,'ftyp');
  const meta=removeItems(source.slice(d.meta.off,d.meta.off+d.meta.size),[d.stylesItem,d.linearThumb,d.deltaGrid,...d.deltaTiles]);
  const g=discoverHeic(meta),chunks=[];let cursor=ft.size+meta.length+8;
  for(const [id,item] of g.iloc.items){
    if(item.constructionMethod!==0)continue;
    const payload=extractItem(source,d.iloc,id),e=item.extents[0];
    meta.set(be(cursor,g.iloc.offsetSize),e.offsetPos);meta.set(be(payload.length,g.iloc.lengthSize),e.lengthPos);
    chunks.push(payload);cursor+=payload.length;
  }
  return concat([source.slice(0,ft.size),meta,box('mdat',concat(chunks))]);
}
function people(count=2){
  const instances=Array.from({length:count},(_,i)=>({...mask,referenceKey:`FSINCInstanceMask${9+i}`}));
  const texturePeopleData=instances.map(instance=>peopleEntry(Array.from({length:478},()=>({x:0.4,y:0.5,z:0})),
    {averageColor:[0,0.5,1],roughness:0},instance.referenceKey,0,null));
  return {state:'generated',faces:count,overrides:new Map([...MATTE_2026_URIS.map(uri=>[uri,mask]),[MATTE_URIS.portraiteffectsmatte,mask],[URI_PERSON_INSTANCES,{instances}]]),texturePeopleData};
}
test('Soft Skin enrichment preserves native Styles, HDR, depth, Exif and original payloads; is idempotent',async()=>{
  const {source,data}=await fixture(),before=discoverHeic(data);
  assert.equal(hasSoftSkinData(data),false);
  const result=installSoftSkin(data,people(),{nativeStyles:true,sourceBytes:source}),after=discoverHeic(result);
  assert.equal(hasSoftSkinData(result),true);
  const tex=[...before.infos].find(([,i])=>i.uri===URI_TEXTURE_STYLES)[0];
  const replaced=new Set([...before.infos.keys()].filter(id=>MATTE_2026_URIS.includes(auxUriForItem(before.props,id))));replaced.add(tex);
  for(const [id,item] of before.iloc.items){
    if(replaced.has(id))continue;
    const read=(b,d)=>item.constructionMethod===0?extractItem(b,d.iloc,id):idatItemBytes(b,id,d.meta);
    assert.deepEqual(read(result,after),read(data,before),`payload ${id}`);
    for(const assoc of before.props.associations.get(id)||[]){
      const type=before.props.properties[assoc.index-1].type;
      assert.deepEqual(propertyBoxBytes(result,after.props,id,type),propertyBoxBytes(data,before.props,id,type));
    }
  }
  for(const ref of before.refs) assert.ok(after.refs.some(r=>JSON.stringify(r)===JSON.stringify(ref)));
  const metadata=parseBplist(extractItem(result,after.iloc,tex)),entries=metadata.get('TextureStylePostProcessedPeopleData');
  assert.deepEqual(entries.map(entry=>entry.get('faceID')),[0,1]);
  assert.equal(entries[0].get('faceLandmarks').length,76);
  for(const [id,i] of after.infos){
    if(i.type==='mime'){
      const text=new TextDecoder().decode(extractItem(result,after.iloc,id));
      if(text.includes('InstanceMaskReferenceKey'))assert.ok(entries.some(e=>text.includes(e.get('instanceMaskReferenceKey'))));
    }
  }
  const typed=parseBplist(extractItem(result,after.iloc,tex),{preserveReals:true});
  assert.ok(typed.get('TextureStylePostProcessedPeopleData')[0].get('faceYaw') instanceof BplistReal);
  assert.equal(installSoftSkin(result,people(),{nativeStyles:true}),result);
});
test('no suitable face leaves the file unchanged',async()=>{
  const {data}=await fixture();assert.equal(installSoftSkin(data,{state:'none',faces:0}),data);
});
test('a missing native editing graph does not authorize Soft Skin to overwrite iPhone 16+ colour statistics',async()=>{
  for(const model of ['iPhone 16 Pro','iPhone 17','iPhone 13 Pro']){
    const {source,data}=await fixture(model),original=withoutEditingGraph(source),before=discoverHeic(data);
    assert.equal(discoverHeic(original).stylesItem,null);
    const generated=people(1);
    generated.personMetadata={peopleRatio:.75,skinRatio:.4,blocks:{
      ToneMappedImageSkinBased:new Map([['p50',.125],['highKey',.5]]),
    }};
    // Reproduce the old caller: it inferred nativeStyles=false from missing URI.
    const output=installSoftSkin(data,generated,{nativeStyles:false,sourceBytes:original}),after=discoverHeic(output);
    assert.equal(hasSoftSkinData(output),true,'Texture supplementation is still installed');
    const oldStyles=extractItem(data,before.iloc,before.stylesItem),newStyles=extractItem(output,after.iloc,after.stylesItem);
    if(model==='iPhone 13 Pro')assert.notDeepEqual(newStyles,oldStyles,'older generated Styles still receive measured person data');
    else assert.deepEqual(newStyles,oldStyles,'captured or edited native colour metadata is untouched');
    assert.deepEqual(extractAppleMakerNoteTag(extractItem(output,after.iloc,after.exifItem)),
      extractAppleMakerNoteTag(extractItem(data,before.iloc,before.exifItem)));
    for(const id of [...before.primaryTiles,...before.hdrTiles])
      assert.deepEqual(extractItem(output,after.iloc,id),extractItem(data,before.iloc,id));
  }
});
test('partial Texture repair keeps existing instances and allocates non-colliding face references',async()=>{
  const {source,data}=await fixture();
  const complete=installSoftSkin(data,people(),{nativeStyles:true,sourceBytes:source});
  const partial=complete.slice(),d=discoverHeic(partial);
  const id=[...d.infos.keys()].find(id=>auxUriForItem(d.props,id)===MATTE_2026_URIS[11]);
  const property=propertyForItem(d.props,id,'auxC');
  partial[property.box.off+property.box.hdr+4]='x'.charCodeAt(0);
  assert.equal(hasSoftSkinData(partial),false);
  const output=installSoftSkin(partial,people(),{nativeStyles:true}),after=discoverHeic(output);
  assert.equal(hasSoftSkinData(output),true);
  const texture=[...after.infos].find(([,info])=>info.uri===URI_TEXTURE_STYLES)[0];
  const entries=parseBplist(extractItem(output,after.iloc,texture)).get('TextureStylePostProcessedPeopleData');
  assert.deepEqual(entries.map(e=>e.get('instanceMaskReferenceKey')),['FSINCInstanceMask11','FSINCInstanceMask12']);
  for(const [id,item] of d.infos) if(auxUriForItem(d.props,id)===URI_PERSON_INSTANCES)
    assert.deepEqual(extractItem(output,after.iloc,id),extractItem(partial,d.iloc,id));
});
test('new Styles baseline has identity coefficients, consistent gain and bounded range',()=>{
  const pl=parseBplist(generatedStyleMetadata()),gain=pl.get('i').get('Gain');
  assert.equal(pl.get('h'),gain/4);assert.equal(gain,1);
  assert.deepEqual([...pl.get('i')],[['OriginalRangeMin',0],['OriginalRangeMax',1],['Gain',1]]);
  assert.equal(pl.get('3').length,516);
  const coefficients=pl.get('1'),c=new DataView(coefficients.buffer,coefficients.byteOffset,coefficients.byteLength);
  for(let term=0;term<30;term++)assert.equal(c.getUint16(term*2,true),[3,7,11].includes(term)?0x3c00:0);
});
