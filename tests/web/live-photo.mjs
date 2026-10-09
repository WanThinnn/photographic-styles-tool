import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {box,concat,be} from '../../web/src/core/box.js';
import {photoContentIdentifier,moviePairingMetadata,validateLivePair,livePhotoPackage} from '../../web/src/media/live-photo.js';
import {readZip} from '../../web/src/core/zip.js';
import {addTexture} from '../../web/src/styles/texture.js';
import {discoverHeic, extractItem} from '../../web/src/core/heif.js';
const txt=s=>new TextEncoder().encode(s);
const root='C:/Users/WanThinnn/Downloads/iCloud Photos (1)/iCloud Photos/';
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
