// Cross-scene diagnostic only. Native capture/REND/HDR/mattes remain deliberately
// retained to test eligibility; neither variant is a valid production export.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {boxes,topBox,box,be,concat} from '../web/src/box.js';
import {discoverHeic,extractItemData,propertyBoxBytes,dimensionsForItem,itemOrientation,
  auxUriForItem,DEPTH_URI,parseIloc,appendIpcoProperty,repointItemProperty} from '../web/src/raster/heif.js';
import {appleDepthAuxc} from '../web/src/apple-depth-metadata.js';

const [nativePath,jpegPath,directory]=process.argv.slice(2);
assert.ok(directory,'Pass native reference, depthless JPEG and fresh output directory');
assert.ok(!fs.existsSync(directory),'Previous device-test batches are immutable');
const source=new Uint8Array(fs.readFileSync(nativePath)),d=discoverHeic(source);
const jpeg=new Uint8Array(fs.readFileSync(jpegPath)),web=path.resolve('web');
const depthId=[...d.infos.keys()].find(id=>auxUriForItem(d.props,id)===DEPTH_URI);
assert.ok(depthId!==undefined&&d.thumbnail!==null&&d.linearThumb!==null);
assert.deepEqual(dimensionsForItem(d.props,d.primary),[4032,3024]);
assert.deepEqual(itemOrientation(source,d.props,d.primary),{angle:270,mirror:null});
const changedIds=[...d.primaryTiles,depthId,d.thumbnail,d.linearThumb];
const depthSide=d.refs.find(r=>r.type==='cdsc'&&r.to.includes(depthId)).from;
const nativeXmp=new TextDecoder().decode(extractItemData(source,d,depthSide));
const artifacts=new Map(),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
  const match=url.pathname.match(/^\/artifact\/([a-z0-9-]+)$/);
  if(req.method==='POST'&&match){let length=0;const chunks=[];
    req.on('data',b=>{length+=b.length;if(length>16*1024*1024)req.destroy();else chunks.push(b);});
    req.on('end',()=>{if(artifacts.has(match[1])){res.writeHead(409);res.end();return;}
      artifacts.set(match[1],new Uint8Array(Buffer.concat(chunks)));res.end('ok');});return;}
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  if(url.pathname==='/source.heic'){res.end(source);return;}
  if(url.pathname==='/target.jpeg'){res.end(jpeg);return;}
  if(url.pathname==='/probe'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Portrait scene diagnostic</title>');return;}
  const file=path.resolve(web,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(web+path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(file,(err,b)=>{if(err){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.mjs')?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(b);});
});

function assemble(replacements,codecs,extraProperties=new Map()) {
  let meta=source.slice(d.meta.off,d.meta.off+d.meta.size);const indices=new Map();
  for(const [id,newProps] of [...codecs].map(([id,v])=>[id,[['hvcC',v]]]).concat([...extraProperties])) {
    for(const [type,value] of newProps){
      const old=d.props.associations.get(id).find(a=>d.props.properties[a.index-1].type===type);assert.ok(old);
      const key=hash(value);let index=indices.get(key);
      if(index===undefined){[meta,index]=appendIpcoProperty(meta,value);indices.set(key,index);}
      meta=repointItemProperty(meta,id,old.index,index);
    }
  }
  const kept=[...boxes(source,0,source.length)].filter(b=>b.type!=='mdat').map(b=>b.type==='meta'?meta:source.slice(b.off,b.off+b.size));
  const iloc=parseIloc(meta,topBox(meta,'meta'));let cursor=kept.reduce((n,b)=>n+b.length,0)+8;const chunks=[];
  for(const [id,item] of iloc.items){
    if(item.constructionMethod===1)continue;assert.equal(item.constructionMethod,0);assert.equal(item.baseOffset,0);
    if(replacements.has(id))assert.equal(item.extents.length,1);
    for(const [i,extent] of item.extents.entries()){
      const old=d.iloc.items.get(id).extents[i],data=replacements.get(id)||source.slice(old.offset,old.offset+old.length);
      meta.set(be(cursor,iloc.offsetSize),extent.offsetPos);meta.set(be(data.length,iloc.lengthSize),extent.lengthPos);
      cursor+=data.length;chunks.push(data);
    }
  }
  assert.ok(cursor<2**32);return concat([...kept,box('mdat',concat(chunks))]);
}
function verify(bytes,replacements,codecs,extraProperties=new Map()){
  const after=discoverHeic(bytes);assert.deepEqual(after.refs,d.refs);assert.deepEqual([...after.infos],[...d.infos]);
  let preserved=0;
  for(const [id] of d.iloc.items){assert.deepEqual(extractItemData(bytes,after,id),replacements.get(id)||extractItemData(source,d,id),`Item ${id}`);if(!replacements.has(id))preserved++;}
  for(const p of d.props.properties){const q=after.props.properties[p.index-1];assert.deepEqual(bytes.slice(q.box.off,q.box.off+q.box.size),source.slice(p.box.off,p.box.off+p.box.size));}
  for(const [id,associations] of d.props.associations){const list=after.props.associations.get(id);assert.equal(list.length,associations.length);
    for(const [i,a] of associations.entries()){const type=d.props.properties[a.index-1].type;
      const expected=type==='hvcC'?codecs.get(id):extraProperties.get(id)?.find(([t])=>t===type)?.[1];
      assert.equal(list[i].essential,a.essential);
      if(expected)assert.deepEqual(propertyBoxBytes(bytes,after.props,id,type),expected);else assert.deepEqual(list[i],a);
    }}
  return {bytes:bytes.length,sha256:hash(bytes),unchangedNativePayloads:preserved,
    portraitControls:'Unverified; requires independent import and actual effect test'};
}

let browser;
try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const {chromium}=createRequire(import.meta.url)('C:/Users/WanThinnn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page=await browser.newPage();page.on('console',m=>console.log(m.text().slice(0,220)));
  await page.goto(`http://127.0.0.1:${server.address().port}/probe`);
  const inference=await page.evaluate(async({ids,depthId,thumb,linear})=>{
    const {encodeHevcPixels,decodeHevcYuv,decodeHevcLuma,releaseHevcEncoder}=await import('/src/raster/ffmpeg-hevc.js');
    const {topBox}=await import('/src/box.js');
    const {rgbaToI420,srgbToBt709Rgba}=await import('/src/raster/raster-color.js');
    const {encodeLinearThumbnail10}=await import('/src/raster/linear-thumbnail.js');
    const {inferDepth}=await import('/src/ai-inference.js');
    const {rgbSample}=await import('/src/ai-portrait-source.js');
    const {normalizeDisparity,inferenceGeometry}=await import('/src/ai-portrait-container.js');
    const target=new Uint8Array(await(await fetch('/target.jpeg')).arrayBuffer());
    const image=await createImageBitmap(new Blob([target],{type:'image/jpeg'}));
    const canvas=document.createElement('canvas');canvas.width=4032;canvas.height=3024;
    const ctx=canvas.getContext('2d',{colorSpace:'display-p3',alpha:false,willReadFrequently:true});
    if(ctx.getContextAttributes().colorSpace!=='display-p3')throw Error('P3 canvas unavailable');
    ctx.fillStyle='white';ctx.fillRect(0,0,4032,3024);ctx.save();ctx.translate(2016,1512);ctx.rotate(-Math.PI/2);
    const scale=Math.min(3024/image.width,4032/image.height),dw=image.width*scale,dh=image.height*scale;
    ctx.drawImage(image,-dw/2,-dh/2,dw,dh);ctx.restore();image.close();
    const put=async(key,bytes)=>{const r=await fetch('/artifact/'+key,{method:'POST',body:bytes});if(!r.ok)throw Error('Artifact transfer failed');};
    const digest=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
    const tile=document.createElement('canvas');tile.width=tile.height=512;
    const tc=tile.getContext('2d',{colorSpace:'display-p3',alpha:false,willReadFrequently:true});
    const color={primaries:'smpte432',transfer:'bt709',matrix:'smpte170m',fullRange:true};const samples=[];
    try{
      const input=inferenceGeometry(4032,3024),rgb=rgbSample(canvas,input.width,input.height);
      const inferred=await inferDepth(rgb,input,{onProgress:s=>console.log('AI',s)});
      const map=normalizeDisparity(inferred.values),small=document.createElement('canvas');small.width=inferred.mw;small.height=inferred.mh;
      const sc=small.getContext('2d'),pixels=sc.createImageData(small.width,small.height);
      for(let i=0;i<map.length;i++)pixels.data.set([map[i],map[i],map[i],255],4*i);sc.putImageData(pixels,0,0);
      const dc=document.createElement('canvas');dc.width=768;dc.height=576;const dctx=dc.getContext('2d');dctx.drawImage(small,0,0,768,576);
      const rgba=dctx.getImageData(0,0,768,576).data,gray=Uint8Array.from({length:768*576},(_,i)=>rgba[4*i]);
      const de=await encodeHevcPixels(gray,{width:768,height:576,pixelFormat:'gray',fullRange:true,lossless:true});
      const db=topBox(de.hvcc,'hvcC'),dr=await decodeHevcLuma(de.hvcc.subarray(db.hdr),de.payload,{width:768,height:576});
      if(!dr.bytes.every((v,i)=>v===gray[i]))throw Error('Depth readback differs');
      await put(`${depthId}-payload`,de.payload);await put(`${depthId}-hvcc`,de.hvcc);await put('depth-gray',gray);
      await put('depth-preview',new Uint8Array(await(await new Promise(r=>dc.toBlob(r,'image/png'))).arrayBuffer()));
      for(const [i,id] of ids.entries()){
        tc.fillStyle='black';tc.fillRect(0,0,512,512);tc.drawImage(canvas,-(i%8)*512,-Math.floor(i/8)*512);
        const p=rgbaToI420(srgbToBt709Rgba(tc.getImageData(0,0,512,512).data),512,512,color);
        const e=await encodeHevcPixels(p,{width:512,height:512,pixelFormat:'yuv420p',lossless:true,...color});
        const b=topBox(e.hvcc,'hvcC'),read=await decodeHevcYuv(e.hvcc.subarray(b.hdr),e.payload,{width:512,height:512});
        if(!read.every((v,j)=>v===p[j])||read.length!==p.length)throw Error('Main readback differs');
        await put(`${id}-payload`,e.payload);await put(`${id}-hvcc`,e.hvcc);
        samples.push({id,width:512,height:512,sampleBytes:p.length,sampleSha256:await digest(p),exactReadback:true});
        console.log(`Scene tile ${i+1}/${ids.length}: exact readback`);
      }
      const th=document.createElement('canvas');th.width=416;th.height=312;
      const thc=th.getContext('2d',{colorSpace:'display-p3',alpha:false,willReadFrequently:true});thc.drawImage(canvas,0,0,416,312);
      const p=rgbaToI420(srgbToBt709Rgba(thc.getImageData(0,0,416,312).data),416,312,color);
      const te=await encodeHevcPixels(p,{width:416,height:312,pixelFormat:'yuv420p',lossless:true,...color});
      await put(`${thumb}-payload`,te.payload);await put(`${thumb}-hvcc`,te.hvcc);
      const le=await encodeLinearThumbnail10(canvas);
      if(le.width!==1024||le.height!==768)throw Error('Linear geometry differs from native');
      await put(`${linear}-payload`,le.payload);await put(`${linear}-hvcc`,le.hvcc);
      const preview=document.createElement('canvas');preview.width=576;preview.height=768;
      const pc=preview.getContext('2d');pc.translate(288,384);pc.rotate(Math.PI/2);pc.drawImage(canvas,-384,-288,768,576);
      await put('scene-preview',new Uint8Array(await(await new Promise(r=>preview.toBlob(r,'image/png'))).arrayBuffer()));
      return {model:'Depth-Anything-V2-Small',graySha256:await digest(gray),geometry:{width:768,height:576,angle:270,mirror:null},
        sourceFit:{scale,displayWidth:dw,displayHeight:dh,mode:'contain; no aspect stretch'},samples};
    }finally{releaseHevcEncoder();canvas.width=canvas.height=0;}
  },{ids:d.primaryTiles,depthId,thumb:d.thumbnail,linear:d.linearThumb});
  const replacements=new Map(),codecs=new Map();
  for(const id of changedIds){const p=artifacts.get(`${id}-payload`),c=artifacts.get(`${id}-hvcc`);assert.ok(p?.length&&c?.length);replacements.set(id,p);codecs.set(id,c);}
  const b=assemble(replacements,codecs);
  let unit=nativeXmp;
  for(const [name,value] of [['FloatMinValue',0],['FloatMaxValue',1]]){
    const regex=new RegExp(`(<[\\w]+:${name}>)[^<]+(</[\\w]+:${name}>)`,'g');assert.equal([...unit.matchAll(regex)].length,1);
    unit=unit.replace(regex,(_,open,close)=>open+value+close);
  }
  const unitReplacements=new Map(replacements);unitReplacements.set(depthSide,new TextEncoder().encode(unit));
  const extra=new Map([[depthId,[['auxC',appleDepthAuxc()]]]]),c=assemble(unitReplacements,codecs,extra);
  const variants=[{file:'A_Native_5129_Control.HEIC',data:source,replace:new Map(),codecs:new Map()},
    {file:'B_JPEG_AI_NativeRange.HEIC',data:b,replace:replacements,codecs},
    {file:'C_JPEG_AI_UnitRange.HEIC',data:c,replace:unitReplacements,codecs,extra}];
  const report={nativeReference:path.resolve(nativePath),nativeSha256:hash(source),jpeg:path.resolve(jpegPath),jpegSha256:hash(jpeg),
    diagnosticOnly:true,productionChanged:false,textureAdded:false,
    warning:'Native EXIF, calibration, REND, HDR gain map, semantic mattes and Styles resources remain from 5129. This is deliberate eligibility isolation, not a valid per-scene export. Do not assess HDR/colour parity or present it as genuine capture metadata.',
    inference,primaryIds:d.primaryTiles,depthId,depthSide,thumbnail:d.thumbnail,linearThumbnail:d.linearThumb,
    variants:variants.map(v=>({file:v.file,...verify(v.data,v.replace,v.codecs,v.extra)}))};
  fs.mkdirSync(directory,{recursive:true});
  for(const v of variants)fs.writeFileSync(path.join(directory,v.file),v.data,{flag:'wx'});
  for(const key of ['depth-gray','depth-preview','scene-preview'])fs.writeFileSync(path.join(directory,key+(key==='depth-gray'?'.bin':'.png')),artifacts.get(key),{flag:'wx'});
  fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log(JSON.stringify({directory,variants:report.variants,depth:inference.geometry}));
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
