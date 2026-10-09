import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {box,concat,be} from '../../web/src/core/box.js';
import {photoContentIdentifier,moviePairingMetadata,validateLivePair,livePhotoPackage,createLivePhotoExport} from '../../web/src/media/live-photo.js';
import {readZip} from '../../web/src/core/zip.js';
import {addTexture} from '../../web/src/styles/texture.js';
import {discoverHeic, extractItem} from '../../web/src/core/heif.js';
import {injectAppleMakerNoteTag} from '../../web/src/core/exif.js';
import {buildAppleStyleExif} from '../../web/src/raster/exif.js';
import {buildGeneratedProfile} from '../../web/src/raster/generated-profile.js';
import {generateSyntheticHevc} from '../../web/src/raster/synthetic-hevc.js';
const txt=s=>new TextEncoder().encode(s);
const root='C:/Users/WanThinnn/Downloads/iCloud Photos (1)/iCloud Photos/';
const codecFixture=JSON.parse(fs.readFileSync(new URL('./raster-hevc.fixture.json',import.meta.url)));
const assets=await generateSyntheticHevc(null,async(_,options)=>{
  const asset=options.pixelFormat!=='gray'?codecFixture.assets.delta:options.width===768?codecFixture.assets.textureMask:codecFixture.assets.mask;
  return {...asset,hvcc:Uint8Array.from(asset.hvcc),payload:Uint8Array.from(asset.payload)};
});
function pairedPhoto(identifier,pixel=1){
  const profile=buildGeneratedProfile('48-12',assets),graph=discoverHeic(profile.meta),chunks=[];
  const exif=injectAppleMakerNoteTag(buildAppleStyleExif(profile.mn54),txt(identifier+'\0'),0x11,2);
  let offset=profile.ftyp.length+profile.meta.length+8;
  for(const [id,item]of graph.iloc.items){
    if(item.constructionMethod===1)continue;
    const payload=id===graph.exifItem?exif:graph.primaryTiles.includes(id)?Uint8Array.of(pixel):profile.retained.get(id)||Uint8Array.of(0);
    profile.meta.set(be(offset,graph.iloc.offsetSize),item.extents[0].offsetPos);
    profile.meta.set(be(payload.length,graph.iloc.lengthSize),item.extents[0].lengthPos);
    offset+=payload.length;chunks.push(payload);
  }
  return concat([profile.ftyp,profile.meta,box('mdat',concat(chunks))]);
}
function movie(id,fullBox=true) {
  const key=box('mdta',txt('com.apple.quicktime.content.identifier'));
  const keys=box('keys',concat([be(0,4),be(1,4),key]));
  const entry=concat([be(8+8+8+id.length,4),be(1,4),box('data',concat([be(1,4),be(0,4),txt(id)]))]);
  const meta=box('meta',concat([...(fullBox?[be(0,4)]:[]),keys,box('ilst',entry)]));
  return box('moov',concat([meta,box('trak',box('free',txt('com.apple.quicktime.still-image-time')))]));
}
test('MOV parser reads ISO and QuickTime metadata; rejects malformed box sizes',()=>{
  for(const fullBox of [true,false])assert.deepEqual(moviePairingMetadata(movie('test-identifier',fullBox)),
    {contentIdentifier:'test-identifier',hasStillImageTimeKey:true});
  assert.throws(()=>moviePairingMetadata(new Uint8Array([0,0,0,99,109,111,111,118])),/Invalid MOV/);
  assert.throws(()=>moviePairingMetadata(box('mdat',txt('com.apple.quicktime.content.identifier'))),/no movie metadata/);
});

test('Live Photo ZIP follows final Portrait, focus updates and toggle restoration; late MOV also pairs',async()=>{
  const source=pairedPhoto('live-test-identifier'),mov=movie('live-test-identifier'),published=[];
  const exporter=createLivePhotoExport(source,{onReady:result=>published.push(result),onError:assert.fail});
  const normal=new File([source],'photo_Styles.HEIC');
  const portrait=new File([pairedPhoto('live-test-identifier',2)],'photo_Portrait.HEIC');
  const focus=new File([pairedPhoto('live-test-identifier',3)],'photo_Portrait.HEIC');
  await exporter.setOutput(portrait);assert.equal(published.length,0);
  await exporter.setMovie(mov);
  for(const file of [focus,normal,focus]){
    await exporter.setOutput(file);
    const latest=published.at(-1),files=await readZip(latest.data),manifest=JSON.parse(new TextDecoder().decode(files.get('pair.json')));
    assert.equal(latest.file,file);assert.equal(latest.name,file.name.replace(/\.[^.]+$/,'')+'_LivePhoto.zip');
    assert.deepEqual(files.get(manifest.photo),new Uint8Array(await file.arrayBuffer()));
    assert.deepEqual(files.get(manifest.movie),mov);assert.equal(manifest.contentIdentifier,'live-test-identifier');
  }
  assert.equal(published.length,4);exporter.dispose();
});

test('slow old output cannot replace a newer Live Photo ZIP or recreate a removed row',async()=>{
  const source=pairedPhoto('live-test-identifier'),published=[],errors=[];
  const exporter=createLivePhotoExport(source,{onReady:r=>published.push(r),onError:e=>errors.push(e)});
  await exporter.setMovie(movie('live-test-identifier'));
  let resolveOld;
  const old={name:'old.HEIC',arrayBuffer:()=>new Promise(resolve=>{resolveOld=resolve;})};
  const pending=exporter.setOutput(old),latest=new File([source],'latest.HEIC');
  await exporter.setOutput(latest);resolveOld(source.buffer);await pending;
  assert.equal(published.length,1);assert.equal(published[0].file,latest);
  const removed=exporter.setOutput(old);exporter.dispose();resolveOld(source.buffer);await removed;
  await exporter.setOutput(latest);assert.equal(published.length,1);assert.deepEqual(errors,[]);
});

test('changed Live Photo identifier fails closed and stale read failures are ignored',async()=>{
  const source=pairedPhoto('live-test-identifier'),errors=[];
  const exporter=createLivePhotoExport(source,{onReady:()=>assert.fail('invalid pair published'),onError:e=>errors.push(e)});
  await exporter.setMovie(movie('live-test-identifier'));
  let rejectOld;
  const pending=exporter.setOutput({name:'old.HEIC',arrayBuffer:()=>new Promise((_,reject)=>{rejectOld=reject;})});
  await exporter.setOutput(new File([pairedPhoto('different-identifier')],'changed.HEIC'));
  rejectOld(Error('stale failure'));await pending;
  assert.equal(errors.length,1);assert.match(errors[0].message,/changed/);exporter.dispose();
});

test('native processing preserves a real Live Photo identifier and all original external payloads',
  {skip:!fs.existsSync(root+'IMG_0487.HEIC')||!fs.existsSync(root+'IMG_0487.MOV')},async()=>{
    const photo=new Uint8Array(fs.readFileSync(root+'IMG_0487.HEIC'));
    const mov=new Uint8Array(fs.readFileSync(root+'IMG_0487.MOV'));
    const {data:output}=addTexture(photo);
    assert.equal(photoContentIdentifier(output),photoContentIdentifier(photo));
    const before=discoverHeic(photo),after=discoverHeic(output);
    for(const [id,item] of before.iloc.items)
      if(item.constructionMethod===0)
        assert.deepEqual(extractItem(output,after.iloc,id),extractItem(photo,before.iloc,id),`item ${id}`);
    const files=await readZip(livePhotoPackage(photo,output,mov,'Processed.HEIC'));
    assert.deepEqual(files.get('Processed.MOV'),mov);
    assert.deepEqual(files.get('Processed.HEIC'),output);
    const manifest=JSON.parse(new TextDecoder().decode(files.get('pair.json')));
    assert.equal(manifest.movieUnmodified,true);
    const other=new Uint8Array(fs.readFileSync(root+'IMG_0269.MOV'));
    assert.throws(()=>validateLivePair(photo,other),/do not match/);
  });
for(const name of ['IMG_0269','IMG_0487'])test(`real ${name} Live Photo metadata and lossless pair package`,
  {skip:!fs.existsSync(root+name+'.MOV')||!fs.existsSync(root+name+'.HEIC')},async()=>{
    const photo=new Uint8Array(fs.readFileSync(root+name+'.HEIC')),mov=new Uint8Array(fs.readFileSync(root+name+'.MOV'));
    const pairing=validateLivePair(photo,mov);assert.equal(photoContentIdentifier(photo),pairing.contentIdentifier);
    const zip=await readZip(livePhotoPackage(photo,photo,mov,name+'.HEIC'));
    assert.deepEqual(zip.get(name+'.MOV'),mov);assert.deepEqual(zip.get(name+'.HEIC'),photo);
    assert.equal(JSON.parse(new TextDecoder().decode(zip.get('pair.json'))).contentIdentifier,pairing.identifier);
    assert.throws(()=>validateLivePair(photo,movie('wrong-identifier')),/do not match/);
    assert.throws(()=>livePhotoPackage(photo,new Uint8Array(0),mov),/changed/);
  });
