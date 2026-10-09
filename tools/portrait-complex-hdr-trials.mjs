// Private cross-scene probe. Capture calibration and REND remain borrowed;
// main samples, HDR, AI depth, thumbnails and any detected faces belong to JPEG.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {boxes,topBox,box,be,concat} from '../web/src/box.js';
import {discoverHeic,extractItemData,propertyBoxBytes,dimensionsForItem,itemOrientation,
  auxUriForItem,DEPTH_URI,MATTE_URIS,parseIloc,appendIpcoProperty,repointItemProperty,associateItemProperty,replaceIdatItem,removeItems} from '../web/src/raster/heif.js';
import {extractJpegHdr,iccColr,encodeTmapMetadata} from '../web/src/raster/jpeg-hdr.js';
import {extractRasterExif,readExifOrientation} from '../web/src/raster/exif.js';
import {extractAppleMakerNoteTag,injectAppleMakerNoteTag,getMakerNoteBlob} from '../web/src/exif.js';
import {parseBplist,buildBplist,BplistReal} from '../web/src/bplist.js';
import {appleDepthAuxc} from '../web/src/apple-depth-metadata.js';
import {addTexture,URI_TEXTURE_STYLES} from '../web/src/texture.js';
import {hasSoftSkinData} from '../web/src/soft-skin-container.js';

const [nativePath,jpegPath,directory]=process.argv.slice(2);
assert.ok(directory&&!fs.existsSync(directory),'Pass native reference, original HDR JPEG, and a fresh directory');
const source=new Uint8Array(fs.readFileSync(nativePath)),d=discoverHeic(source);
const jpeg=new Uint8Array(fs.readFileSync(jpegPath)),hdr=extractJpegHdr(jpeg),web=path.resolve('web');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
assert.ok(hdr);assert.equal(readExifOrientation(extractRasterExif(jpeg)),1);
assert.deepEqual([hdr.width,hdr.height,hdr.gainWidth,hdr.gainHeight],[3024,4032,1512,2016]);
assert.deepEqual(dimensionsForItem(d.props,d.primary),[4032,3024]);
assert.deepEqual(itemOrientation(source,d.props,d.primary),{angle:270,mirror:null});
const depthId=[...d.infos.keys()].find(id=>auxUriForItem(d.props,id)===DEPTH_URI);
const skyId=[...d.infos.keys()].find(id=>auxUriForItem(d.props,id)===MATTE_URIS.semanticskymatte);
const depthSide=d.refs.find(r=>r.type==='cdsc'&&r.to.includes(depthId)).from;
const gainIds=d.refs.find(r=>r.type==='dimg'&&r.from===d.hdrGrid).to;
const gainSide=d.refs.find(r=>r.type==='cdsc'&&r.to.includes(d.hdrGrid)).from;
const tmapId=[...d.infos].find(([,i])=>i.type==='tmap')[0];
assert.equal(gainIds.length,12);assert.equal(d.deltaTiles.length,30);
const artifacts=new Map();let textureSource,completed;
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
  const match=url.pathname.match(/^\/artifact\/([a-z0-9-]+)$/);
  if(req.method==='POST'&&match){let size=0;const chunks=[];
    req.on('data',b=>{size+=b.length;if(size>64*1024*1024)req.destroy();else chunks.push(b);});
    req.on('end',()=>{if(artifacts.has(match[1])){res.writeHead(409);res.end();return;}
      artifacts.set(match[1],new Uint8Array(Buffer.concat(chunks)));res.end('ok');});return;}
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  if(url.pathname==='/target.jpeg'){res.end(jpeg);return;}
  if(url.pathname==='/texture.heic'){res.end(textureSource);return;}
  if(url.pathname==='/probe'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Complex HDR scene probe</title>');return;}
  const file=path.resolve(web,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(web+path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(file,(err,b)=>{if(err){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',['.js','.mjs'].includes(path.extname(file))?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(b);});
});
function pack(input,meta,replacements=new Map()){
  const graph=discoverHeic(input);
  for(const [id,p] of replacements)if(graph.iloc.items.get(id).constructionMethod===1)meta=replaceIdatItem(meta,id,p);
  const kept=[...boxes(input,0,input.length)].filter(b=>b.type!=='mdat')
    .map(b=>b.type==='meta'?meta:input.slice(b.off,b.off+b.size));
  const iloc=parseIloc(meta,topBox(meta,'meta'));let cursor=kept.reduce((n,b)=>n+b.length,0)+8;const chunks=[];
  for(const [id,item] of iloc.items){
    if(item.constructionMethod===1)continue;assert.equal(item.constructionMethod,0);assert.equal(item.baseOffset,0);
    if(replacements.has(id))assert.equal(item.extents.length,1);
    for(const [i,extent] of item.extents.entries()){
      const old=graph.iloc.items.get(id).extents[i],p=replacements.get(id)||input.slice(old.offset,old.offset+old.length);
      meta.set(be(cursor,iloc.offsetSize),extent.offsetPos);meta.set(be(p.length,iloc.lengthSize),extent.lengthPos);
      cursor+=p.length;chunks.push(p);
    }
  }
  assert.ok(cursor<2**32);return concat([...kept,box('mdat',concat(chunks))]);
}
function replaceProperties(meta,values){
  const indices=new Map();
  for(const [id,list] of values)for(const [type,value] of list){
    const old=d.props.associations.get(id).find(a=>d.props.properties[a.index-1].type===type);
    assert.ok(old||type==='colr',`${id}/${type}`);
    const key=hash(value);let index=indices.get(key);
    if(index===undefined){[meta,index]=appendIpcoProperty(meta,value);indices.set(key,index);}
    meta=old?repointItemProperty(meta,id,old.index,index):associateItemProperty(meta,id,index,false);
  }
  return meta;
}
function stripStyles(input){
  const g=discoverHeic(input),tid=[...g.infos].find(([,i])=>i.uri===URI_TEXTURE_STYLES)[0];
  const removed=new Set([tid,g.stylesItem,g.deltaGrid,...g.deltaTiles]);
  for(const r of g.refs)if(r.type==='cdsc'&&r.to.length&&r.to.every(id=>removed.has(id)))removed.add(r.from);
  const exif=extractItemData(input,g,g.exifItem).slice(),mn=getMakerNoteBlob(exif);
  const view=new DataView(mn.buffer,mn.byteOffset,mn.byteLength),little=String.fromCharCode(mn[12],mn[13])==='II';
  const count=view.getUint16(14,little),entries=[];
  for(let i=0;i<count;i++)if(view.getUint16(16+i*12,little)!==0x54)entries.push(mn.slice(16+i*12,28+i*12));
  assert.equal(entries.length,count-1);const next=mn.slice(16+12*count,20+12*count);
  view.setUint16(14,entries.length,little);entries.forEach((e,i)=>mn.set(e,16+12*i));
  mn.set(next,16+12*entries.length);mn.fill(0,20+12*entries.length,20+12*count);
  const data=pack(input,removeItems(input.slice(g.meta.off,g.meta.off+g.meta.size),removed),new Map([[g.exifItem,exif]]));
  const after=discoverHeic(data);assert.equal(after.stylesItem,null);assert.equal(after.deltaGrid,null);
  for(const id of after.infos.keys())if(id!==g.exifItem)assert.deepEqual(extractItemData(data,after,id),extractItemData(input,g,id));
  return {data,removed:[...removed]};
}
let browser;
try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const {chromium}=createRequire(import.meta.url)('C:/Users/WanThinnn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const context=await browser.newContext();
  const {ORT_ASSETS}=await import('../web/src/vision/ort-assets.js');
  await context.route('**/*',route=>{
    const i=ORT_ASSETS.findIndex(a=>a.url===route.request().url());
    if(i>=0)return route.fulfill({path:path.resolve(`tests/web/.cache/soft-skin/${i}.bin`),
      headers:{'Access-Control-Allow-Origin':'*','Cross-Origin-Resource-Policy':'cross-origin'},
      contentType:i<2?'text/javascript':i===2?'application/wasm':'application/octet-stream'});
    return route.continue();
  });
  const page=await context.newPage();page.on('console',m=>console.log(m.text().slice(0,200)));
  await page.goto(`http://127.0.0.1:${server.address().port}/probe`);
  const inference=await page.evaluate(async({mainIds,gainIds,depthId,skyId,skyDims,thumb,linear})=>{
    const {encodeHevcPixels,decodeJpegYuv,decodeHevcYuv,decodeHevcLuma,releaseHevcEncoder}=await import('/src/raster/ffmpeg-hevc.js');
    const {extractJpegHdr,yuv420Tile}=await import('/src/raster/jpeg-hdr.js');
    const {topBox}=await import('/src/box.js');
    const {rgbaToI420,srgbToBt709Rgba}=await import('/src/raster/raster-color.js');
    const {encodeLinearThumbnail10}=await import('/src/raster/linear-thumbnail.js');
    const {inferDepth}=await import('/src/ai-inference.js');
    const {rgbSample}=await import('/src/ai-portrait-source.js');
    const {normalizeDisparity,inferenceGeometry}=await import('/src/ai-portrait-container.js');
    const jpeg=new Uint8Array(await(await fetch('/target.jpeg')).arrayBuffer()),hdr=extractJpegHdr(jpeg);
    const image=await createImageBitmap(new Blob([hdr.base],{type:'image/jpeg'}));
    const canvas=document.createElement('canvas');canvas.width=4032;canvas.height=3024;
    const ctx=canvas.getContext('2d',{colorSpace:'display-p3',alpha:false,willReadFrequently:true});
    if(ctx.getContextAttributes().colorSpace!=='display-p3')throw Error('P3 canvas unavailable');
    ctx.translate(2016,1512);ctx.rotate(-Math.PI/2);ctx.drawImage(image,-1512,-2016);ctx.resetTransform();image.close();
    const put=async(key,b)=>{const r=await fetch('/artifact/'+key,{method:'POST',body:b});if(!r.ok)throw Error('Artifact transfer failed');};
    const digest=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
    const save=async(id,e)=>{await put(`${id}-payload`,e.payload);await put(`${id}-hvcc`,e.hvcc);};
    const samples=[],color={primaries:hdr.primaries,transfer:'iec61966-2-1',matrix:'smpte170m',fullRange:true};
    try{
      const geom=inferenceGeometry(4032,3024),rgb=rgbSample(canvas,geom.width,geom.height);
      const inferred=await inferDepth(rgb,geom,{onProgress:s=>console.log('Depth',s)}),map=normalizeDisparity(inferred.values);
      const small=document.createElement('canvas');small.width=inferred.mw;small.height=inferred.mh;
      const sc=small.getContext('2d'),p=sc.createImageData(small.width,small.height);
      for(let i=0;i<map.length;i++)p.data.set([map[i],map[i],map[i],255],4*i);sc.putImageData(p,0,0);
      const dc=document.createElement('canvas');dc.width=768;dc.height=576;const dt=dc.getContext('2d');dt.drawImage(small,0,0,768,576);
      const rgba=dt.getImageData(0,0,768,576).data,gray=Uint8Array.from({length:768*576},(_,i)=>rgba[4*i]);
      const de=await encodeHevcPixels(gray,{width:768,height:576,pixelFormat:'gray',fullRange:true,lossless:true});
      const db=topBox(de.hvcc,'hvcC'),dr=await decodeHevcLuma(de.hvcc.subarray(db.hdr),de.payload,{width:768,height:576});
      if(!dr.bytes.every((v,i)=>v===gray[i]))throw Error('Depth readback differs');
      await save(depthId,de);await put('depth-gray',gray);
      await put('depth-preview',new Uint8Array(await(await new Promise(r=>dc.toBlob(r,'image/png'))).arrayBuffer()));
      for(const [bytes,w,h,ids,cols,label] of [[hdr.base,3024,4032,mainIds,8,'main'],[hdr.gain,1512,2016,gainIds,4,'gain']]){
        // Rotate both raw planes CCW to the native reference's stored geometry.
        // Bypass browser colour/HDR processing completely for these samples.
        const raw=await decodeJpegYuv(bytes,{width:w,height:h,orientation:8});
        for(const [i,id] of ids.entries()){
          const tile=yuv420Tile(raw.bytes,raw.width,raw.height,i%cols,Math.floor(i/cols));
          const e=await encodeHevcPixels(tile,{width:512,height:512,pixelFormat:'yuv420p',lossless:true,...color});
          const read=await decodeHevcYuv(e.hvcc.subarray(8),e.payload,{width:512,height:512});
          if(read.length!==tile.length||!read.every((v,j)=>v===tile[j]))throw Error('HDR sample readback differs');
          await save(id,e);samples.push({id,plane:label,sampleSha256:await digest(tile),sampleBytes:tile.length,exact:true});
          console.log(`${label} tile ${i+1}/${ids.length}: exact`);
        }
      }
      // The donor sky matte must not claim sky at positions from another scene.
      const sky=await encodeHevcPixels(new Uint8Array(skyDims[0]*skyDims[1]),{width:skyDims[0],height:skyDims[1],pixelFormat:'gray',fullRange:true});
      await save(skyId,sky);
      const th=document.createElement('canvas');th.width=416;th.height=312;
      const tc=th.getContext('2d',{colorSpace:'display-p3',alpha:false,willReadFrequently:true});tc.drawImage(canvas,0,0,416,312);
      const te=await encodeHevcPixels(rgbaToI420(srgbToBt709Rgba(tc.getImageData(0,0,416,312).data),416,312,
        {primaries:'smpte432',transfer:'bt709',matrix:'smpte170m',fullRange:true}),
        {width:416,height:312,pixelFormat:'yuv420p',primaries:'smpte432',transfer:'bt709',matrix:'smpte170m',fullRange:true});
      await save(thumb,te);const le=await encodeLinearThumbnail10(canvas);await save(linear,le);
      return {model:'Depth-Anything-V2-Small',depthSha256:await digest(gray),samples,
        mainAndGainFrom:'Original HDR JPEG raw YUV, identical CCW rotation',sky:'Empty replacement; no borrowed spatial sky mask'};
    }finally{releaseHevcEncoder();canvas.width=canvas.height=0;}
  },{mainIds:d.primaryTiles,gainIds,depthId,skyId,skyDims:dimensionsForItem(d.props,skyId),thumb:d.thumbnail,linear:d.linearThumb});
  const replacements=new Map(),properties=new Map();
  for(const id of [...d.primaryTiles,...gainIds,depthId,skyId,d.thumbnail,d.linearThumb]){
    replacements.set(id,artifacts.get(`${id}-payload`));properties.set(id,[['hvcC',artifacts.get(`${id}-hvcc`)]]);
  }
  const neutralRoot='tests/private-fixtures/Portrait_NeutralDelta_V18';
  const neutral=Object.fromEntries(['payload','hvcc','colr'].map(k=>[k,new Uint8Array(fs.readFileSync(`${neutralRoot}/neutral-${k}.bin`))]));
  for(const id of d.deltaTiles){replacements.set(id,neutral.payload);properties.set(id,[['hvcC',neutral.hvcc],['colr',neutral.colr]]);}
  properties.set(d.deltaGrid,[['colr',neutral.colr]]);
  for(const id of [d.primary,...d.primaryTiles]){
    const old=properties.get(id)||[];old.push(['colr',iccColr(hdr.baseIcc)]);properties.set(id,old);
  }
  // Gain RGB carries numerical values; its alternative ICC belongs to tmap.
  const {rasterColr}=await import('../web/src/raster/raster-color.js');
  const gainColr=rasterColr({primaries:hdr.primaries,transfer:'iec61966-2-1',matrix:'smpte170m',fullRange:true});
  for(const id of [d.hdrGrid,...gainIds]){
    const old=properties.get(id)||[];old.push(['colr',gainColr]);properties.set(id,old);
  }
  properties.set(tmapId,[['colr',iccColr(hdr.alternateIcc)]]);
  replacements.set(tmapId,encodeTmapMetadata(hdr.metadata));replacements.set(gainSide,hdr.xmp);
  let unit=new TextDecoder().decode(extractItemData(source,d,depthSide));
  for(const [name,value] of [['FloatMinValue',0],['FloatMaxValue',1]]){
    const re=new RegExp(`(<[\\w]+:${name}>)[^<]+(</[\\w]+:${name}>)`,'g');assert.equal([...unit.matchAll(re)].length,1);
    unit=unit.replace(re,(_,open,close)=>open+value+close);
  }
  replacements.set(depthSide,new TextEncoder().encode(unit));properties.get(depthId).push(['auxC',appleDepthAuxc()]);
  const tag=extractAppleMakerNoteTag(extractItemData(source,d,d.exifItem)),marker=parseBplist(tag.payload,{preserveReals:true});
  marker.set('1',new BplistReal(0));marker.set('2',new BplistReal(0));marker.set('4',1);
  let exif=injectAppleMakerNoteTag(extractItemData(source,d,d.exifItem),buildBplist(marker),0x54,tag.type);
  const jpegExif=extractRasterExif(jpeg),hdrMakerTags=[];
  for(const id of [0x21,0x30]){
    let own,fromSource=true;
    try{own=extractAppleMakerNoteTag(jpegExif,id);}
    catch(error){
      assert.equal(error.message,'Apple MakerNote tag 0x927c not found');fromSource=false;
      // No source Apple headroom flags: stop the native reference's additional
      // headroom/gain from describing this JPEG. Its HDR is in source tmap/XMP.
      const old=extractAppleMakerNoteTag(exif,id),mn=getMakerNoteBlob(exif),little=String.fromCharCode(mn[12],mn[13])==='II';
      const payload=new Uint8Array(8),v=new DataView(payload.buffer);v.setInt32(0,1,little);v.setInt32(4,1,little);
      own={type:old.type,payload};
    }
    assert.ok([5,10].includes(own.type)&&own.payload.length===8);
    if(fromSource){const from=getMakerNoteBlob(jpegExif),to=getMakerNoteBlob(exif);
      assert.equal(String.fromCharCode(from[12],from[13]),String.fromCharCode(to[12],to[13]));}
    exif=injectAppleMakerNoteTag(exif,own.payload,id,own.type);
    const mn=getMakerNoteBlob(exif),v=new DataView(mn.buffer,mn.byteOffset,mn.byteLength),little=String.fromCharCode(mn[12],mn[13])==='II';
    for(let i=0;i<v.getUint16(14,little);i++)if(v.getUint16(16+12*i,little)===id)v.setUint32(20+12*i,1,little);
    assert.deepEqual(extractAppleMakerNoteTag(exif,id),own);hdrMakerTags.push({id,fromSource,neutralIfAbsent:!fromSource});
  }
  replacements.set(d.exifItem,exif);
  const scene=pack(source,replaceProperties(source.slice(d.meta.off,d.meta.off+d.meta.size),properties),replacements);
  const graph=discoverHeic(scene);
  for(const id of d.infos.keys())assert.deepEqual(extractItemData(scene,graph,id),replacements.get(id)||extractItemData(source,d,id));
  assert.deepEqual(graph.refs,d.refs);
  textureSource=addTexture(scene).data;
  const skin=await page.evaluate(async()=>{
    const {extractJpegHdr}=await import('/src/raster/jpeg-hdr.js');
    const {generateRasterFaceMattes}=await import('/src/vision/face-mattes.js');
    const {installSoftSkin}=await import('/src/soft-skin-container.js');
    const jpeg=new Uint8Array(await(await fetch('/target.jpeg')).arrayBuffer()),hdr=extractJpegHdr(jpeg);
    const image=await createImageBitmap(new Blob([hdr.base],{type:'image/jpeg'}));
    const canvas=document.createElement('canvas');canvas.width=3024;canvas.height=4032;
    canvas.getContext('2d',{colorSpace:'srgb',alpha:false}).drawImage(image,0,0);image.close();
    try{
      const result=await generateRasterFaceMattes(canvas,270,null,{onProgress:p=>console.log('Soft Skin',p.stage)});
      const bytes=new Uint8Array(await(await fetch('/texture.heic')).arrayBuffer());
      const output=result.state==='generated'?installSoftSkin(bytes,result,{nativeStyles:true}):bytes;
      const response=await fetch('/artifact/completed',{method:'POST',body:output});if(!response.ok)throw Error('Output transfer failed');
      if(result.debugArtifacts?.overlay)await fetch('/artifact/face-overlay',{method:'POST',body:result.debugArtifacts.overlay});
      return {state:result.state,faces:result.faces,refinement:result.refinement||[],
        note:'No detected face is not evidence of no person; Soft Skin uses face gating.'};
    }finally{canvas.width=canvas.height=0;const {releaseOrtModels}=await import('/src/vision/ort-vision.js');await releaseOrtModels();
      const {releaseHevcEncoder}=await import('/src/raster/ffmpeg-hevc.js');releaseHevcEncoder();}
  });
  completed=artifacts.get('completed');assert.ok(completed?.length);
  const full=discoverHeic(completed),stripped=stripStyles(completed);
  for(const id of [d.primary,...d.primaryTiles,d.hdrGrid,...gainIds,tmapId,gainSide,depthId,depthSide,d.thumbnail,d.linearThumb])
    assert.deepEqual(extractItemData(completed,full,id),extractItemData(scene,graph,id));
  assert.deepEqual(propertyBoxBytes(completed,full.props,d.primary,'colr'),iccColr(hdr.baseIcc));
  assert.deepEqual(propertyBoxBytes(completed,full.props,tmapId,'colr'),iccColr(hdr.alternateIcc));
  const baselinePath='tests/private-fixtures/IDG_20251020_HDR_Fixed.HEIC',baseline=new Uint8Array(fs.readFileSync(baselinePath)),bd=discoverHeic(baseline);
  const bt=[...bd.infos].find(([,i])=>i.type==='tmap')[0];
  assert.deepEqual(extractItemData(baseline,bd,bt),encodeTmapMetadata(hdr.metadata));
  const variants=[{file:'A_HDR_Styles_Texture_NoAIDepth.HEIC',data:baseline},
    {file:'B_HDR_AI_Portrait_NoStylesTexture.HEIC',data:stripped.data},
    {file:'C_HDR_AI_Portrait_Styles_Texture.HEIC',data:completed}];
  const report={original:path.resolve(jpegPath),originalSha256:hash(jpeg),nativeReference:path.resolve(nativePath),nativeSha256:hash(source),
    diagnosticOnly:true,productionChanged:false,broadStyleColourFittingPaused:true,
    warning:'B/C retain native capture calibration, REND and Styles coefficients from 5129. EXIF camera/date are reference data, not source attribution. HDR/base/AI depth/thumbnails/face resources are from original JPEG. Empty sky replacement. Device eligibility/effects remain unverified.',
    baseline:path.resolve(baselinePath),baselineSha256:hash(baseline),hdrMetadata:hdr.metadata,hdrMakerTags,
    originalGain:{offset:Buffer.from(jpeg).indexOf(Buffer.from(hdr.gain)),bytes:hdr.gain.length,sha256:hash(hdr.gain)},
    inference,skin,depthId,depthSide,gainIds,gainSide,tmapId,primaryIds:d.primaryTiles,
    strippedItems:stripped.removed,softSkin:hasSoftSkinData(completed),
    variants:variants.map(v=>({file:v.file,bytes:v.data.length,sha256:hash(v.data),items:discoverHeic(v.data).infos.size}))};
  fs.mkdirSync(directory,{recursive:true});
  for(const v of variants)fs.writeFileSync(path.join(directory,v.file),v.data,{flag:'wx'});
  for(const key of ['depth-gray','depth-preview','face-overlay'])if(artifacts.has(key))
    fs.writeFileSync(path.join(directory,key+(key==='depth-gray'?'.bin':'.png')),artifacts.get(key),{flag:'wx'});
  fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log(JSON.stringify({directory,skin,variants:report.variants,checkedYuvBytes:inference.samples.reduce((n,s)=>n+s.sampleBytes,0)}));
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
