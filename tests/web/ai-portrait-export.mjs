import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildAiPortrait} from '../../web/src/portrait/ai-portrait-export.js';
import {portraitEligibility} from '../../web/src/portrait/ai-portrait-container.js';
import {buildRasterHeic,targetGeometry} from '../../web/src/raster/raster-import.js';
import {generateSyntheticHevc} from '../../web/src/raster/synthetic-hevc.js';
import {buildGeneratedProfile} from '../../web/src/raster/generated-profile.js';
import {discoverHeic,extractItemData,propertyBoxBytes,auxUriForItem,DEPTH_URI,dimensionsForItem,itemOrientation,appendIpcoProperty,setItemPropertyAssociations,removeItems} from '../../web/src/raster/heif.js';
import {hasTexture} from '../../web/src/raster/texture.js';
import {extractAppleMakerNoteTag,injectAppleMakerNoteTag,exifCameraModel} from '../../web/src/core/exif.js';
import {parseBplist,buildBplist,BplistReal} from '../../web/src/core/bplist.js';
import {rebuildHeic} from '../../web/src/styles/graft.js';
import {topBox,concat,be,box} from '../../web/src/core/box.js';
import {buildAppleStyleExif} from '../../web/src/raster/exif.js';
import {styleCapabilities} from '../../web/src/styles/style-capabilities.js';
import {photoContentIdentifier} from '../../web/src/media/live-photo.js';
const template=JSON.parse(fs.readFileSync(new URL('../../web/src/portrait/portrait-template.json',import.meta.url)));
const fixture=JSON.parse(fs.readFileSync(new URL('./raster-hevc.fixture.json',import.meta.url)));
const assets=await generateSyntheticHevc(null,async(_,o)=>{
  const a=o.pixelFormat!=='gray'?fixture.assets.delta:o.width===768?fixture.assets.textureMask:fixture.assets.mask;
  return {...a,hvcc:Uint8Array.from(a.hvcc),payload:Uint8Array.from(a.payload)};
});
function photo(width,height,name='48-12'){
  const p=buildGeneratedProfile(name,assets),d=discoverHeic(p.meta),g=targetGeometry({width,height});
  const codec=propertyBoxBytes(p.meta,d.props,d.primaryTiles[0],'hvcC'),payload=Uint8Array.of(0,0,0,4,38,1,0,0);
  if(name==='45-15'){
    // Independent large native-layout fixture, not the raster 48/12 importer.
    const values=new Map(p.retained),chunks=[];
    for(const id of [...d.primaryTiles,...p.manifest.donor_hdr_tiles,d.thumbnail,d.linearThumb])values.set(id,payload);
    values.set(d.exifItem,buildAppleStyleExif(p.mn54));
    let cursor=p.ftyp.length+p.meta.length+8;
    for(const [id,item]of d.iloc.items){if(item.constructionMethod===1)continue;
      const value=values.get(id);p.meta.set(be(cursor,4),item.extents[0].offsetPos);p.meta.set(be(value.length,4),item.extents[0].lengthPos);
      cursor+=value.length;chunks.push(value);
    }
    return concat([p.ftyp,p.meta,box('mdat',concat(chunks))]);
  }
  return buildRasterHeic(p,{main:Array(g.primaryTiles).fill(payload),mainHvcc:codec,
    thumb:payload,thumbHvcc:codec,hdr:payload,hdrHvcc:codec},null,null,g);
}
const depth={payload:assets.mask.payload,hvcc:assets.mask.hvcc,width:64,height:64};
function withoutThumbnail(source){
  const before=discoverHeic(source),ft=topBox(source,'ftyp'),ftyp=source.slice(ft.off,ft.off+ft.size);
  const meta=removeItems(source.slice(before.meta.off,before.meta.off+before.meta.size),[before.thumbnail]);
  const graph=discoverHeic(meta),chunks=[];let cursor=ftyp.length+meta.length+8;
  for(const [id,item]of graph.iloc.items){
    if(item.constructionMethod===1)continue;
    const payload=extractItemData(source,before,id),extent=item.extents[0];
    meta.set(be(cursor,graph.iloc.offsetSize),extent.offsetPos);meta.set(be(payload.length,graph.iloc.lengthSize),extent.lengthPos);
    chunks.push(payload);cursor+=payload.length;
  }
  return concat([ftyp,meta,box('mdat',concat(chunks))]);
}
function withMarker(source,marker){
  const d=discoverHeic(source),ft=topBox(source,'ftyp');
  const exif=injectAppleMakerNoteTag(extractItemData(source,d,d.exifItem),marker);
  return rebuildHeic(source,d,source.slice(ft.off,ft.off+ft.size),source.slice(d.meta.off,d.meta.off+d.meta.size),new Map([[d.exifItem,exif]]));
}
function selectedStyle(source){
  const d=discoverHeic(source);
  return extractAppleMakerNoteTag(extractItemData(source,d,d.exifItem));
}
function withStyles(source,blob){
  const d=discoverHeic(source),ft=topBox(source,'ftyp');
  return rebuildHeic(source,d,source.slice(ft.off,ft.off+ft.size),source.slice(d.meta.off,d.meta.off+d.meta.size),new Map([[d.stylesItem,blob]]));
}

test('unknown Styles contracts are preserved instead of silently downgraded into Portrait',()=>{
  const base=photo(900,600),d=discoverHeic(base),plist=parseBplist(extractItemData(base,d,d.stylesItem),{preserveReals:true});
  plist.set('0',999);plist.set('future-resource',new Uint8Array([9,3,42]));
  const source=withStyles(base,buildBplist(plist)),saved=source.slice();
  assert.deepEqual(styleCapabilities(source),{native:true,schema:999,editable:false});
  assert.equal(portraitEligibility(source),'unverified-styles');
  assert.throws(()=>buildAiPortrait(source,depth,template),/Unsupported Styles schema/);assert.deepEqual(source,saved);
  plist.set('0',14);
  const known=withStyles(base,buildBplist(plist)),output=buildAiPortrait(known,depth,template).data,after=discoverHeic(output);
  assert.deepEqual(extractItemData(output,after,after.stylesItem),extractItemData(known,discoverHeic(known),discoverHeic(known).stylesItem),'unknown keys in a supported opaque payload survive byte-exactly');
});

test('flag-bearing native v16 Styles remain eligible for still Portrait without a MOV',()=>{
  const base=photo(900,600),d=discoverHeic(base),plist=parseBplist(extractItemData(base,d,d.stylesItem),{preserveReals:true});
  plist.set('0',131088);
  const source=withStyles(base,buildBplist(plist)),before=discoverHeic(source);
  assert.deepEqual(styleCapabilities(source),{native:true,schema:131088,editable:true});
  assert.equal(portraitEligibility(source),null);
  const output=buildAiPortrait(source,depth,template).data,after=discoverHeic(output);
  assert.deepEqual(extractItemData(output,after,after.stylesItem),extractItemData(source,before,before.stylesItem));
  assert.equal(parseBplist(extractItemData(output,after,after.stylesItem)).get('0'),131088);
});

const liveFixture=new URL('../private-fixtures/LivePhoto_0471/IMG_0471.HEIC',import.meta.url);
test('reported iPhone 16 Pro Live Photo builds editable still Portrait with native colour and HDR intact',{
  skip:!fs.existsSync(liveFixture),
},()=>{
  const source=new Uint8Array(fs.readFileSync(liveFixture)),saved=source.slice(),before=discoverHeic(source);
  assert.ok(photoContentIdentifier(source));assert.equal(portraitEligibility(source),null);
  const output=buildAiPortrait(source,depth,template).data,after=discoverHeic(output);
  assert.deepEqual(source,saved);
  assert.deepEqual(extractItemData(output,after,after.stylesItem),extractItemData(source,before,before.stylesItem));
  assert.deepEqual(selectedStyle(output),selectedStyle(source));
  for(const [a,b]of[[before.primary,after.primary],[before.deltaGrid,after.deltaGrid],[before.hdrGrid,after.hdrGrid]]){
    const aa=before.refs.find(r=>r.type==='dimg'&&r.from===a).to,bb=after.refs.find(r=>r.type==='dimg'&&r.from===b).to;
    assert.equal(aa.length,bb.length);
    aa.forEach((id,i)=>assert.deepEqual(extractItemData(output,after,bb[i]),extractItemData(source,before,id)));
  }
  assert.ok([...after.infos.keys()].some(id=>auxUriForItem(after.props,id)===DEPTH_URI));
});
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

test('edited Styles images without ordinary thumbnails retain their own images in Portrait',()=>{
  const source=withoutThumbnail(photo(4032,3024)),saved=source.slice(),before=discoverHeic(source);
  assert.equal(before.thumbnail,null);
  const output=buildAiPortrait(source,depth,template).data,after=discoverHeic(output);
  assert.deepEqual(source,saved);assert.equal(after.thumbnail,null);
  assert.ok(!after.refs.some(ref=>ref.type==='thmb'),'no borrowed or dangling thumbnail');
  for(const [from,to]of [[before.primary,after.primary],[before.hdrGrid,after.hdrGrid],[before.deltaGrid,after.deltaGrid],[before.linearThumb,after.linearThumb],[before.stylesItem,after.stylesItem]]){
    assert.deepEqual(extractItemData(output,after,to),extractItemData(source,before,from));
    const oldTiles=before.refs.find(ref=>ref.type==='dimg'&&ref.from===from)?.to||[];
    const newTiles=after.refs.find(ref=>ref.type==='dimg'&&ref.from===to)?.to||[];
    oldTiles.forEach((id,i)=>assert.deepEqual(extractItemData(source,before,id),extractItemData(output,after,newTiles[i])));
  }
  assert.deepEqual(selectedStyle(output),selectedStyle(source));assert.equal(portraitEligibility(output),'existing-depth');
});

const editedFixture=new URL('../private-fixtures/IMG_1015.HEIC',import.meta.url);
test('reported edited IMG_1015 without thumbnail accepts Portrait and preserves Styles',{skip:!fs.existsSync(editedFixture)},()=>{
  const source=new Uint8Array(fs.readFileSync(editedFixture)),before=discoverHeic(source);
  assert.equal(before.thumbnail,null);
  const output=buildAiPortrait(source,depth,template).data,after=discoverHeic(output);
  assert.equal(after.thumbnail,null);assert.equal(portraitEligibility(output),'existing-depth');
  assert.deepEqual(selectedStyle(output),selectedStyle(source));
  assert.deepEqual(extractItemData(output,after,after.stylesItem),extractItemData(source,before,before.stylesItem));
  for(const [from,to]of [[before.primary,after.primary],[before.deltaGrid,after.deltaGrid]]){
    const oldTiles=before.refs.find(ref=>ref.type==='dimg'&&ref.from===from).to,newTiles=after.refs.find(ref=>ref.type==='dimg'&&ref.from===to).to;
    oldTiles.forEach((id,i)=>assert.deepEqual(extractItemData(source,before,id),extractItemData(output,after,newTiles[i])));
  }
});

test('larger native delta/HDR grids extend the Portrait graph without losing tiles',()=>{
  const source=photo(900,600,'45-15'),a=discoverHeic(source);
  assert.equal(a.deltaTiles.length,48);
  const output=buildAiPortrait(source,depth,template,{nativeStyles:true}).data,b=discoverHeic(output);
  for(const [before,after]of [[a.primary,b.primary],[a.deltaGrid,b.deltaGrid],[a.hdrGrid,b.hdrGrid]]){
    const old=a.refs.find(r=>r.type==='dimg'&&r.from===before).to,newTiles=b.refs.find(r=>r.type==='dimg'&&r.from===after).to;
    assert.equal(newTiles.length,old.length);
    old.forEach((id,i)=>{
      assert.deepEqual(extractItemData(output,b,newTiles[i]),extractItemData(source,a,id));
      for(const type of ['ispe','hvcC','colr'])assert.deepEqual(propertyBoxBytes(output,b.props,newTiles[i],type),propertyBoxBytes(source,a.props,id,type));
    });
  }
  assert.equal(b.refs.find(r=>r.type==='dimg'&&r.from===b.hdrGrid).to.length,15);
  assert.deepEqual(extractItemData(output,b,b.stylesItem),extractItemData(source,a,a.stylesItem));
});
test('Portrait retains complete generated and native Styles, including per-photo skin statistics',()=>{
  const base=photo(900,600),bd=discoverHeic(base);
  for(const blob of [extractItemData(base,bd,bd.stylesItem),Uint8Array.from(Buffer.from(template.styles,'base64'))]){
    const styles=parseBplist(blob,{preserveReals:true});
    // A detected face's measured statistics must not be exchanged for the
    // capture template's empty person/skin blocks while retaining its masks.
    styles.get('6').set('ToneMappedImageSkinBased',new Map([['p50',new BplistReal(.4123)],['highKey',new BplistReal(1)]]));
    const source=withStyles(base,buildBplist(styles)),saved=source.slice(),before=discoverHeic(source);
    for(const settings of [{},{focusX:.2,focusY:.8,aperture:2}]){
      const out=buildAiPortrait(source,depth,template,settings).data,after=discoverHeic(out);
      assert.deepEqual(source,saved);
      assert.deepEqual(extractItemData(out,after,after.stylesItem),extractItemData(source,before,before.stylesItem));
      assert.deepEqual(selectedStyle(out),selectedStyle(source),'selected Style marker retained');
    }
  }
});

test('one-step generated Styles plus Portrait matches the successful re-upload route',()=>{
  const source=photo(900,600),d=discoverHeic(source);
  // Previously false replaced the completed Styles with reference camera
  // coefficients, while true preserved them after download/re-upload.
  const direct=buildAiPortrait(source,depth,template,{nativeStyles:false}).data;
  const reuploaded=buildAiPortrait(source.slice(),depth,template,{nativeStyles:true}).data;
  assert.deepEqual(direct,reuploaded);
  const after=discoverHeic(direct);
  assert.deepEqual(extractItemData(direct,after,after.stylesItem),extractItemData(source,d,d.stylesItem));
});

test('exported depth uses the same ordered rotation/mirror transform as the primary',()=>{
  const base=photo(900,600),d=discoverHeic(base),ft=topBox(base,'ftyp');
  for(const order of [['irot','imir'],['imir','irot']]){
    let meta=base.slice(d.meta.off,d.meta.off+d.meta.size);const indices=[];
    for(const type of order){let index;[meta,index]=appendIpcoProperty(meta,box(type,Uint8Array.of(type==='irot'?1:0)));indices.push([index,true]);}
    const own=(d.props.associations.get(d.primary)||[]).filter(a=>!['irot','imir'].includes(d.props.properties[a.index-1].type));
    meta=setItemPropertyAssociations(meta,d.primary,[...own.map(a=>[a.index,a.essential]),...indices]);
    const source=rebuildHeic(base,d,base.slice(ft.off,ft.off+ft.size),meta,new Map());
    const output=buildAiPortrait(source,depth,template).data,after=discoverHeic(output);
    const id=[...after.infos.keys()].find(id=>auxUriForItem(after.props,id)===DEPTH_URI);
    assert.deepEqual(itemOrientation(output,after.props,id),itemOrientation(output,after.props,after.primary));
    const types=i=>(after.props.associations.get(i)||[]).map(a=>after.props.properties[a.index-1].type).filter(t=>['irot','imir'].includes(t));
    assert.deepEqual(types(id),order);assert.deepEqual(types(after.primary),order);
  }
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
