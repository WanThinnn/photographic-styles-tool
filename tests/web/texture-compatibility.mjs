import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ensureLegacyTextureToneCurve} from '../../web/src/styles/texture-compatibility.js';
import {preserveNativeStyles} from '../../web/src/styles/style-preservation.js';
import {parseBplist,buildBplist,BplistReal} from '../../web/src/core/bplist.js';
import {addTexture,repairTextureCurve,URI_TEXTURE_STYLES,TEXTURE_STYLES_BLOB,textureStylesPayload} from '../../web/src/styles/texture.js';
import {TEXTURE_STYLES_BLOB as RASTER_TEXTURE_STYLES_BLOB,addTexture as addRasterTexture} from '../../web/src/raster/texture.js';
import {discoverHeic as discoverRasterHeic,extractItem as extractRasterItem} from '../../web/src/raster/heif.js';
import {parseBplist as parseRasterBplist} from '../../web/src/raster/bplist.js';
import {executeJob} from '../../web/src/media/heic-worker.js';
import {discoverHeic,extractItem,idatItemBytes,propertyBoxBytes} from '../../web/src/core/heif.js';
import {loadProfile} from '../../web/src/core/zip.js';
import {be,box,concat} from '../../web/src/core/box.js';
const directory='C:/Users/WanThinnn/Downloads/Error-Styles/iCloud Photos/';
const ios18Directory='C:/Users/WanThinnn/Downloads/16-pro-iOS-18-error-black/';

test('reported iOS 18 telephoto Styles v13 is Texture-compatible through the native-preserving worker route',
  {skip:!fs.existsSync(ios18Directory+'IMG_3435_orgirnal.HEIC')},async()=>{
  const source=new Uint8Array(fs.readFileSync(ios18Directory+'IMG_3435_orgirnal.HEIC'));
  const before=discoverHeic(source);
  const original=extractItem(source,before.iloc,before.stylesItem);
  const native=parseBplist(original);
  assert.equal(native.get('0'),13);assert.equal(native.has('3'),false);
  const {data,report}=await executeJob({operation:'texture',data:source,opts:{preserveStyles:true}});
  const after=discoverHeic(data),styles=parseBplist(extractItem(data,after.iloc,after.stylesItem));
  assert.equal(styles.get('3')?.length,516,'legacy Texture contract must have the neutral tone curve');
  assert.equal(report.toneCurveAdded,true);
  styles.delete('3');assert.deepEqual(styles,native,'no replacement of native schema, coefficients, maps or statistics');
  for(const [id,item]of before.iloc.items){
    if(id===before.stylesItem)continue;
    const read=(bytes,d)=>item.constructionMethod===0?extractItem(bytes,d.iloc,id):idatItemBytes(bytes,id,d.meta);
    assert.deepEqual(read(data,after),read(source,before),'untouched source item '+id);
  }
});

test('Texture keeps the native iPhone19,2 renderer profile on every generated path',()=>{
  assert.equal(parseBplist(TEXTURE_STYLES_BLOB).get('HardwareModel'),'iPhone19,2');
  assert.equal(parseBplist(RASTER_TEXTURE_STYLES_BLOB).get('HardwareModel'),'iPhone19,2');
  const perPhoto=parseBplist(textureStylesPayload(null,37));
  assert.equal(perPhoto.get('HardwareModel'),'iPhone19,2');
  assert.equal(perPhoto.get('FilmGrainSeed'),37);
});


const brightFixture=new URL('../private-fixtures/Film_Halation_V1/IMG_7864.HEIC',import.meta.url);
test('native Bright IMG_7864 keeps Styles and Exif byte-exact when Texture is added',{skip:!fs.existsSync(brightFixture)},()=>{
  const source=new Uint8Array(fs.readFileSync(brightFixture)),before=discoverHeic(source);
  assert.equal(preserveNativeStyles(source,before),true);
  const originalStyles=extractItem(source,before.iloc,before.stylesItem);
  const originalExif=extractItem(source,before.iloc,before.exifItem);
  const {data}=addTexture(source,{preserveStyles:true}),after=discoverHeic(data);
  assert.deepEqual(extractItem(data,after.iloc,after.stylesItem),originalStyles);
  assert.deepEqual(extractItem(data,after.iloc,after.exifItem),originalExif);
  const textureId=[...after.infos].find(([,info])=>info.uri===URI_TEXTURE_STYLES)[0];
  const texture=parseBplist(extractItem(data,after.iloc,textureId));
  assert.equal(texture.get('HardwareModel'),'iPhone19,2');
  assert.equal(texture.get('Preset'),'Standard');
});

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
  for(const version of [13,14,15,16,131087,131088]){
    const values=new Map([['0',version],['1',new Uint8Array([1,2,3])]]);
    if(version===13||version===14)values.set('3',new Uint8Array([9,8,7]));
    const blob=buildBplist(values);
    for(const preserveStyles of [false,true]){
      const result=ensureLegacyTextureToneCurve(blob,{preserveStyles});
      assert.equal(result.data,blob);assert.equal(result.added,false);
    }
  }
});

test('native-preserving route leaves opaque or malformed Styles untouched',()=>{
  for(const blob of [new Uint8Array(),new TextEncoder().encode('unrecognized native Styles'),buildBplist([1,2])]){
    assert.deepEqual(ensureLegacyTextureToneCurve(blob,{preserveStyles:true}),{data:blob,added:false});
    assert.throws(()=>ensureLegacyTextureToneCurve(blob));
  }
});

test('reported processed v13 repairs without altering any other container data',
  {skip:!fs.existsSync(ios18Directory+'IMG_1529_processed.HEIC')},async()=>{
  const source=new Uint8Array(fs.readFileSync(ios18Directory+'IMG_1529_processed.HEIC')),before=discoverHeic(source);
  const native=parseBplist(extractItem(source,before.iloc,before.stylesItem),{preserveReals:true});
  assert.equal(native.get('0'),13);assert.equal(native.has('3'),false);
  const {data}=repairTextureCurve(source,{preserveStyles:true}),after=discoverHeic(data);
  assert.deepEqual(after.infos,before.infos);assert.deepEqual(after.refs,before.refs);assert.deepEqual(after.props,before.props);
  const styles=parseBplist(extractItem(data,after.iloc,after.stylesItem),{preserveReals:true});
  assert.equal(styles.get('3').length,516);styles.delete('3');assert.deepEqual(styles,native);
  const extent=before.iloc.items.get(before.stylesItem).extents[0];
  for(let i=0;i<source.length;i++){
    if(i>=extent.offsetPos&&i<extent.offsetPos+4||i>=extent.lengthPos&&i<extent.lengthPos+4)continue;
    assert.equal(data[i],source[i],'unchanged original byte '+i);
  }
  const worker=await executeJob({operation:'repair-texture',data:source,opts:{preserveStyles:true}});
  assert.deepEqual(worker.data,data,'worker does not change HDR registration on this file');
  assert.equal(repairTextureCurve(data,{preserveStyles:true}).data,null);
});

async function legacyPhoto(version=14){
  const profile=await loadProfile(new Uint8Array(fs.readFileSync(new URL('../../web/profiles/48-12.zip',import.meta.url))));
  const meta=profile.meta.slice(),d=discoverHeic(meta),chunks=[];let cursor=profile.ftyp.length+meta.length+8;
  for(const [id,item] of d.iloc.items){
    if(item.constructionMethod!==0||!item.extents.length)continue;
    let payload=profile.retained.get(id)||new Uint8Array([0,0,0,4,38,1,id&255,0]);
    if(id===d.stylesItem){const pl=parseBplist(payload);pl.delete('3');pl.delete('k');pl.set('0',version);payload=buildBplist(pl);}
    meta.set(be(cursor,d.iloc.offsetSize),item.extents[0].offsetPos);meta.set(be(payload.length,d.iloc.lengthSize),item.extents[0].lengthPos);
    cursor+=payload.length;chunks.push(payload);
  }
  return concat([profile.ftyp,meta,box('mdat',concat(chunks))]);
}

test('native-preserving schema 13 route adds only its missing curve and repairs existing Texture idempotently',async()=>{
  const source=await legacyPhoto(13),before=discoverHeic(source);
  const {data,report}=await executeJob({operation:'texture',data:source,opts:{preserveStyles:true}});
  assert.equal(report.toneCurveAdded,true);
  const after=discoverHeic(data),styles=parseBplist(extractItem(data,after.iloc,after.stylesItem));
  const original=parseBplist(extractItem(source,before.iloc,before.stylesItem));
  assert.equal(styles.get('3')?.length,516);styles.delete('3');assert.deepEqual(styles,original);
  for(const [id,item]of before.iloc.items){
    if(id===before.stylesItem)continue;
    const read=(bytes,g)=>item.constructionMethod===0?extractItem(bytes,g.iloc,id):idatItemBytes(bytes,id,g.meta);
    assert.deepEqual(read(data,after),read(source,before),'preserved source item '+id);
  }
  // Simulate an earlier web export that added Texture while retaining the missing curve.
  const broken=data.slice(),extent=after.iloc.items.get(after.stylesItem).extents[0];
  const native=extractItem(source,before.iloc,before.stylesItem);
  broken.set(native,extent.offset);broken.set(be(native.length,after.iloc.lengthSize),extent.lengthPos);
  const repaired=await executeJob({operation:'repair-texture',data:broken,opts:{preserveStyles:true}});
  assert.equal(repaired.report.toneCurveAdded,true);
  const fixed=discoverHeic(repaired.data);
  assert.deepEqual(fixed.infos,after.infos);assert.deepEqual(fixed.refs,after.refs);
  assert.deepEqual(parseBplist(extractItem(repaired.data,fixed.iloc,fixed.stylesItem)),
    parseBplist(extractItem(data,after.iloc,after.stylesItem)));
  for(const [id,item]of after.iloc.items){
    if(id===after.stylesItem)continue;
    const read=(bytes,g)=>item.constructionMethod===0?extractItem(bytes,g.iloc,id):idatItemBytes(bytes,id,g.meta);
    assert.deepEqual(read(repaired.data,fixed),read(broken,after),'repaired source item '+id);
  }
  assert.equal(repairTextureCurve(repaired.data,{preserveStyles:true}).data,null);
  for(const version of [14,15,16,131087,131088,999]){
    const blob=buildBplist(new Map([['0',version],['1',new Uint8Array([1,2,3])]]));
    assert.equal(ensureLegacyTextureToneCurve(blob,{preserveStyles:true}).data,blob,'native policy for schema '+version);
  }
});

test('portable legacy graph relocates only the extended Styles and preserves every other payload',async()=>{
  const source=await legacyPhoto(),before=discoverHeic(source);
  const rasterData=addRasterTexture(source).data,rasterAfter=discoverRasterHeic(rasterData);
  const rasterTexture=[...rasterAfter.infos].find(([,info])=>info.uri===URI_TEXTURE_STYLES)[0];
  assert.equal(parseRasterBplist(extractRasterItem(rasterData,rasterAfter.iloc,rasterTexture)).get('HardwareModel'),'iPhone19,2');
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
