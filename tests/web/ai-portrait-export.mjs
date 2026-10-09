import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildAiPortrait} from '../../web/src/ai-portrait-export.js';
import {portraitEligibility} from '../../web/src/ai-portrait-container.js';
import {buildRasterHeic,targetGeometry} from '../../web/src/raster/raster-import.js';
import {generateSyntheticHevc} from '../../web/src/raster/synthetic-hevc.js';
import {buildGeneratedProfile} from '../../web/src/raster/generated-profile.js';
import {discoverHeic,extractItemData,propertyBoxBytes,auxUriForItem,DEPTH_URI,dimensionsForItem} from '../../web/src/raster/heif.js';
import {hasTexture} from '../../web/src/raster/texture.js';
import {extractAppleMakerNoteTag,injectAppleMakerNoteTag,exifCameraModel} from '../../web/src/exif.js';
import {parseBplist,buildBplist,BplistReal} from '../../web/src/bplist.js';
import {rebuildHeic} from '../../web/src/graft.js';
import {topBox} from '../../web/src/box.js';
const template=JSON.parse(fs.readFileSync(new URL('../../web/src/portrait-template.json',import.meta.url)));
const fixture=JSON.parse(fs.readFileSync(new URL('./raster-hevc.fixture.json',import.meta.url)));
const assets=await generateSyntheticHevc(null,async(_,o)=>{
  const a=o.pixelFormat!=='gray'?fixture.assets.delta:o.width===768?fixture.assets.textureMask:fixture.assets.mask;
  return {...a,hvcc:Uint8Array.from(a.hvcc),payload:Uint8Array.from(a.payload)};
});
function photo(width,height){
  const p=buildGeneratedProfile('48-12',assets),d=discoverHeic(p.meta),g=targetGeometry({width,height});
  const codec=propertyBoxBytes(p.meta,d.props,d.primaryTiles[0],'hvcC'),payload=Uint8Array.of(0,0,0,4,38,1,0,0);
  return buildRasterHeic(p,{main:Array(g.primaryTiles).fill(payload),mainHvcc:codec,
    thumb:payload,thumbHvcc:codec,hdr:payload,hdrHvcc:codec},null,null,g);
}
const depth={payload:assets.mask.payload,hvcc:assets.mask.hvcc,width:64,height:64};
function withMarker(source,marker){
  const d=discoverHeic(source),ft=topBox(source,'ftyp');
  const exif=injectAppleMakerNoteTag(extractItemData(source,d,d.exifItem),marker);
  return rebuildHeic(source,d,source.slice(ft.off,ft.off+ft.size),source.slice(d.meta.off,d.meta.off+d.meta.size),new Map([[d.exifItem,exif]]));
}
function selectedStyle(source){
  const d=discoverHeic(source);
  return extractAppleMakerNoteTag(extractItemData(source,d,d.exifItem));
}
test('editable Portrait keeps own primary, HDR, delta, thumbnails and Texture across geometries',()=>{
  for(const[w,h]of[[900,600],[3024,4032],[1200,1200],[8000,1000]]){
    const source=photo(w,h),before=discoverHeic(source);
    const output=buildAiPortrait(source,depth,template).data,after=discoverHeic(output);
    for(const[oldId,newId]of[[before.primary,after.primary],[before.hdrGrid,after.hdrGrid],
      [before.deltaGrid,after.deltaGrid],[before.thumbnail,after.thumbnail],[before.linearThumb,after.linearThumb]]){
      assert.deepEqual(extractItemData(output,after,newId),extractItemData(source,before,oldId));
      for(const type of ['ispe','hvcC','colr','irot','imir'])
        assert.deepEqual(propertyBoxBytes(output,after.props,newId,type),propertyBoxBytes(source,before.props,oldId,type));
    }
    before.primaryTiles.forEach((id,i)=>assert.deepEqual(extractItemData(source,before,id),extractItemData(output,after,after.primaryTiles[i])));
    assert.ok(hasTexture(after.infos));
    const id=[...after.infos.keys()].find(id=>auxUriForItem(after.props,id)===DEPTH_URI);
    assert.deepEqual(dimensionsForItem(after.props,id),[64,64]);
    assert.deepEqual(extractItemData(output,after,id),depth.payload);
    assert.equal(portraitEligibility(output),'existing-depth');
    const flag=extractAppleMakerNoteTag(extractItemData(output,after,after.exifItem),0x1f);
    const marker=parseBplist(extractAppleMakerNoteTag(extractItemData(output,after,after.exifItem)).payload);
    assert.equal(marker.get('4'),1);assert.equal(marker.get('1'),0);assert.equal(marker.get('2'),0);
    assert.deepEqual(flag.payload,Uint8Array.of(0,0,0,1));
    assert.equal(exifCameraModel(extractItemData(output,after,after.exifItem)),null,'no reference camera attribution');
    assert.throws(()=>buildAiPortrait(output,depth,template),/Existing depth/);
  }
});
test('native Styles payload is exact when opted into AI; normal input is immutable',()=>{
  const source=photo(900,600),saved=source.slice(),before=discoverHeic(source);
  const out=buildAiPortrait(source,depth,template,{nativeStyles:true}).data,after=discoverHeic(out);
  assert.deepEqual(source,saved);
  assert.deepEqual(extractItemData(out,after,after.stylesItem),extractItemData(source,before,before.stylesItem));
  assert.deepEqual(extractAppleMakerNoteTag(extractItemData(out,after,after.exifItem)),
    extractAppleMakerNoteTag(extractItemData(source,before,before.exifItem)),'native selected Style marker retained');
});

test('Bright preset and non-neutral Tone/Colour survive both AI routes and focus changes',()=>{
  const base=photo(900,600),marker=parseBplist(selectedStyle(base).payload,{preserveReals:true});
  // Captured selection from the reported IMG_0932 (Bright, adjusted pad).
  marker.set('1',new BplistReal(-.5));marker.set('2',new BplistReal(.5));marker.set('4',16);
  const source=withMarker(base,buildBplist(marker)),expected=selectedStyle(source),saved=source.slice();
  for(const nativeStyles of [false,true])for(const settings of [{},{focusX:.1,focusY:.8,aperture:2}]){
    const output=buildAiPortrait(source,depth,template,{nativeStyles,...settings}).data;
    assert.deepEqual(selectedStyle(output),expected,'selected preset/pad must not come from the neutral capture template');
    if(nativeStyles){
      const a=discoverHeic(source),b=discoverHeic(output);
      assert.deepEqual(extractItemData(output,b,b.stylesItem),extractItemData(source,a,a.stylesItem));
    }
  }
  assert.deepEqual(source,saved);
});

test('a corrupt input selection cannot silently fall back to Standard',()=>{
  const source=photo(900,600),broken=selectedStyle(source).payload.subarray(0,40);
  assert.throws(()=>buildAiPortrait(withMarker(source,broken),depth,template),/Invalid binary plist/);
});
test('public reference contains metadata only, without photographic payloads or attribution',()=>{
  assert.deepEqual(Object.keys(template).sort(),['depthXmp','description','ftyp','maker','makerLittle','meta','styles','version'].sort());
  assert.ok(!template.maker.some(t=>[3,0x17,0x20,0x25,0x2b].includes(t.id)||t.type===2));
  const sizes={1:1,3:2,4:4,5:8,7:1,9:4,10:8,16:8,17:8,18:8};
  for(const t of template.maker)assert.equal(t.count*sizes[t.type],Buffer.from(t.payload,'base64').length,'MakerNote count must describe the rebuilt payload');
  const meta=Uint8Array.from(Buffer.from(template.meta,'base64')),d=discoverHeic(meta);
  for(const item of d.iloc.items.values())if(item.constructionMethod===0)
    for(const e of item.extents){assert.equal(e.offset,0);assert.equal(e.length,0);}
  assert.doesNotMatch(JSON.stringify(template),/2026-02-11|IMG_5129|WanThinnn|CreateDate/);
});
test('truncated Styles marker is rejected instead of allocating from a corrupt trailer',()=>{
  const marker=Uint8Array.from(Buffer.from(template.maker.find(t=>t.id===84).payload,'base64'));
  assert.throws(()=>parseBplist(marker.subarray(0,115)),/Invalid binary plist/);
  assert.equal(parseBplist(marker).get('4'),1);
});
test('focus/aperture changes reuse every encoded image and depth payload',()=>{
  const source=photo(900,600),a=buildAiPortrait(source,depth,template).data;
  const b=buildAiPortrait(source,depth,template,{focusX:.2,focusY:.7,aperture:2.8}).data;
  const ad=discoverHeic(a),bd=discoverHeic(b);
  for(const[id,info]of ad.infos)if(['hvc1','grid'].includes(info.type))
    assert.deepEqual(extractItemData(a,ad,id),extractItemData(b,bd,id));
  const did=[...bd.infos.keys()].find(id=>auxUriForItem(bd.props,id)===DEPTH_URI),side=bd.refs.find(r=>r.type==='cdsc'&&r.to.includes(did)).from;
  assert.match(new TextDecoder().decode(extractItemData(b,bd,side)),/SimulatedAperture>2.800000/);
});
