import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ensureLegacyTextureToneCurve} from '../../web/src/texture-compatibility.js';
import {parseBplist,buildBplist,BplistReal} from '../../web/src/bplist.js';
import {addTexture,repairTextureCurve,URI_TEXTURE_STYLES} from '../../web/src/texture.js';
import {executeJob} from '../../web/src/heic-worker.js';
import {discoverHeic,extractItem,idatItemBytes,propertyBoxBytes} from '../../web/src/heif.js';
import {loadProfile} from '../../web/src/zip.js';
import {be,box,concat} from '../../web/src/box.js';
const directory='C:/Users/WanThinnn/Downloads/Error-Styles/iCloud Photos/';

test('legacy missing curve gets identity samples while preserving native values and real types',()=>{
  const original=buildBplist(new Map([
    ['0',14],['1',new Uint8Array([3,17,200])],['2',true],['5',0],
    ['6',new Map([['highKey',new BplistReal(1)],['blackPoint',new BplistReal(0)]])],
    ['i',new Map([['Gain',new BplistReal(2.728759765625)]])],['h',new BplistReal(.68218994140625)],
  ]));
  const output=ensureLegacyTextureToneCurve(original);assert.ok(output.added);
  const styles=parseBplist(output.data),curve=styles.get('3');
  assert.deepEqual([...curve.slice(0,4)],[1,1,0,0]);assert.equal(curve.length,516);
  const view=new DataView(curve.buffer,curve.byteOffset,curve.byteLength);
  for(let i=0;i<256;i++)assert.equal(view.getUint16(4+i*2,true),i*257);
  styles.delete('3');assert.deepEqual(styles,parseBplist(original));
  const typed=parseBplist(output.data,{preserveReals:true});
  for(const key of ['highKey','blackPoint'])assert.ok(typed.get('6').get(key) instanceof BplistReal);
  assert.equal(typed.get('5'),0);
  assert.equal(ensureLegacyTextureToneCurve(output.data).data,output.data,'idempotent');
});

test('existing tone curves and unvalidated versions are left byte-identical',()=>{
  for(const version of [14,15,16,131087,131088]){
    const values=new Map([['0',version],['1',new Uint8Array([1,2,3])]]);
    if(version===14)values.set('3',new Uint8Array([9,8,7]));
    const blob=buildBplist(values),result=ensureLegacyTextureToneCurve(blob);
    assert.equal(result.data,blob);assert.equal(result.added,false);
  }
});

test('portable legacy graph relocates only the extended Styles and preserves every other payload',async()=>{
  const profile=await loadProfile(new Uint8Array(fs.readFileSync(new URL('../../web/profiles/48-12.zip',import.meta.url))));
  const meta=profile.meta.slice(),d=discoverHeic(meta),chunks=[];let cursor=profile.ftyp.length+meta.length+8;
  for(const [id,item] of d.iloc.items){
    if(item.constructionMethod!==0||!item.extents.length)continue;
    let payload=profile.retained.get(id)||new Uint8Array([0,0,0,4,38,1,id&255,0]);
    if(id===d.stylesItem){const pl=parseBplist(payload);pl.delete('3');pl.delete('k');pl.set('0',14);payload=buildBplist(pl);}
    meta.set(be(cursor,d.iloc.offsetSize),item.extents[0].offsetPos);meta.set(be(payload.length,d.iloc.lengthSize),item.extents[0].lengthPos);
    cursor+=payload.length;chunks.push(payload);
  }
  const source=concat([profile.ftyp,meta,box('mdat',concat(chunks))]),before=discoverHeic(source);
  const {data,report}=await executeJob({operation:'texture',data:source}),after=discoverHeic(data);
  assert.equal(report.toneCurveAdded,true);
  assert.equal(repairTextureCurve(data).data,null,'already compatible Texture needs no repair');
  for(const [id,item] of before.iloc.items){
    if(id===before.stylesItem)continue;
    const read=(bytes,g)=>item.constructionMethod===0?extractItem(bytes,g.iloc,id):idatItemBytes(bytes,id,g.meta);
    assert.deepEqual(read(data,after),read(source,before),`payload ${id}`);
  }
  const extended=parseBplist(extractItem(data,after.iloc,after.stylesItem));
  extended.delete('3');assert.deepEqual(extended,parseBplist(extractItem(source,before.iloc,before.stylesItem)));
  const texture=[...after.infos].find(([,info])=>info.uri===URI_TEXTURE_STYLES)[0];
  assert.ok(after.iloc.items.get(texture).extents[0].offset>after.iloc.items.get(before.stylesItem).extents[0].offset);
});

for(const name of ['IMG_0757.HEIC','IMG_0766.HEIC'])test(`repair existing Texture: ${name} preserves every non-Styles item and adds no duplicate mattes`,{skip:!fs.existsSync(directory+name)},async()=>{
  const source=new Uint8Array(fs.readFileSync(directory+name)),before=discoverHeic(source);
  const {data,report}=await executeJob({operation:'repair-texture',data:source}),after=discoverHeic(data);
  assert.equal(report.toneCurveAdded,true);assert.deepEqual(after.infos,before.infos);assert.deepEqual(after.refs,before.refs);
  for(const [id,item] of before.iloc.items){
    if(id===before.stylesItem)continue;
    const read=(bytes,g)=>item.constructionMethod===0?extractItem(bytes,g.iloc,id):idatItemBytes(bytes,id,g.meta);
    assert.deepEqual(read(data,after),read(source,before),`payload ${id}`);
  }
  const styles=parseBplist(extractItem(data,after.iloc,after.stylesItem));assert.equal(styles.get('3').length,516);
  styles.delete('3');assert.deepEqual(styles,parseBplist(extractItem(source,before.iloc,before.stylesItem)));
  assert.equal(repairTextureCurve(data).data,null);
});

for(const name of ['IMG_4850.HEIC','IMG_4137.HEIC'])test(`reported Texture failure: ${name} adds only tone curve; preserves HDR, depth, masks, Exif and native version`,{skip:!fs.existsSync(directory+name)},async()=>{
  const source=new Uint8Array(fs.readFileSync(directory+name)),before=discoverHeic(source);
  const direct=addTexture(source),{data,report}=await executeJob({operation:'texture',data:source});
  assert.deepEqual(data,direct.data);assert.equal(report.toneCurveAdded,true);
  const after=discoverHeic(data),originalStyles=parseBplist(extractItem(source,before.iloc,before.stylesItem));
  const styles=parseBplist(extractItem(data,after.iloc,after.stylesItem));
  assert.equal(styles.get('0'),14);assert.equal(styles.has('k'),false);assert.equal(styles.get('3').length,516);
  styles.delete('3');assert.deepEqual(styles,originalStyles);
  for(const [id,item] of before.iloc.items){
    if(id!==before.stylesItem){
      const read=(bytes,d)=>item.constructionMethod===0?extractItem(bytes,d.iloc,id):idatItemBytes(bytes,id,d.meta);
      assert.deepEqual(read(data,after),read(source,before),`Original payload ${id}`);
    }
    for(const association of before.props.associations.get(id)||[]){
      const type=before.props.properties[association.index-1].type;
      assert.deepEqual(propertyBoxBytes(data,after.props,id,type),propertyBoxBytes(source,before.props,id,type));
    }
  }
  for(const ref of before.refs)assert.ok(after.refs.some(r=>JSON.stringify(r)===JSON.stringify(ref)));
  const textureId=[...after.infos].find(([,info])=>info.uri===URI_TEXTURE_STYLES)[0];
  assert.equal(parseBplist(extractItem(data,after.iloc,textureId)).get('TextureStylePostProcessedPeopleData').length,2);
  const prototype=new URL(`../private-fixtures/texture-compatibility/${name.replace('.HEIC','_C_IdentityCurve.HEIC')}`,import.meta.url);
  if(fs.existsSync(prototype)){
    const tested=new Uint8Array(fs.readFileSync(prototype)),d=discoverHeic(tested);
    assert.deepEqual(parseBplist(extractItem(data,after.iloc,after.stylesItem)),parseBplist(extractItem(tested,d.iloc,d.stylesItem)),'matches device-tested C values');
  }
});
