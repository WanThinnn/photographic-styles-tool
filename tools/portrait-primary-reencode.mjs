// Private same-photo diagnostic, not an arbitrary-photo Portrait exporter.
// Run from the repository root. Never overwrite an earlier device-test batch.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {boxes,topBox,box,concat,be} from '../web/src/box.js';
import {discoverHeic,extractItemData,propertyBoxBytes,dimensionsForItem,
  parseIloc,appendIpcoProperty,repointItemProperty} from '../web/src/raster/heif.js';

const [input,directory]=process.argv.slice(2);
assert.ok(input&&directory,'Pass known-good native HEIC and a fresh output directory');
assert.ok(!fs.existsSync(directory),'Never overwrite a tested batch');
const source=new Uint8Array(fs.readFileSync(input)),original=discoverHeic(source);
assert.ok(original.primaryTiles.length&&original.stylesItem!==null);
assert.equal(original.iloc.baseOffsetSize,0);
const web=path.resolve('web'),artifacts=new Map(),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const types={'.js':'text/javascript','.wasm':'application/wasm','.json':'application/json'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
  const artifact=url.pathname.match(/^\/artifact\/(\d+)\/(payload|hvcc)$/);
  if(req.method==='POST'&&artifact&&original.primaryTiles.includes(Number(artifact[1]))) {
    const chunks=[];let size=0;
    req.on('data',b=>{size+=b.length;if(size>8*1024*1024)req.destroy();else chunks.push(b);});
    req.on('end',()=>{if(artifacts.has(url.pathname)){res.writeHead(409);res.end();return;}
      artifacts.set(url.pathname,new Uint8Array(Buffer.concat(chunks)));res.end('ok');});return;
  }
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  if(url.pathname==='/source.heic'){res.end(source);return;}
  if(url.pathname==='/probe'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Same-photo Portrait control</title>');return;}
  const file=path.resolve(web,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(web+path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(data);});
});

function rebuild(replacements,codecs) {
  let meta=source.slice(original.meta.off,original.meta.off+original.meta.size);
  const indices=new Map();
  for(const id of original.primaryTiles) {
    const codec=codecs.get(id),key=hash(codec);let index=indices.get(key);
    if(index===undefined){[meta,index]=appendIpcoProperty(meta,codec);indices.set(key,index);}
    const old=original.props.associations.get(id).find(a=>original.props.properties[a.index-1].type==='hvcC');
    assert.ok(old);meta=repointItemProperty(meta,id,old.index,index);
  }
  // Repack all external extents; embedded idat and other top-level boxes stay exact.
  const kept=[...boxes(source,0,source.length)].filter(b=>b.type!=='mdat').map(b=>
    b.type==='meta'?meta:source.slice(b.off,b.off+b.size));
  const iloc=parseIloc(meta,topBox(meta,'meta')),chunks=[];
  let cursor=kept.reduce((n,b)=>n+b.length,0)+8;
  for(const [id,item] of iloc.items) {
    if(item.constructionMethod===1)continue;
    assert.equal(item.constructionMethod,0);
    assert.equal(item.baseOffset,0);
    if(replacements.has(id))assert.equal(item.extents.length,1);
    const old=original.iloc.items.get(id);
    for(let i=0;i<item.extents.length;i++) {
      const extent=old.extents[i],data=replacements.get(id)||source.slice(extent.offset,extent.offset+extent.length);
      assert.ok(cursor<2**(iloc.offsetSize*8)&&data.length<2**(iloc.lengthSize*8));
      meta.set(be(cursor,iloc.offsetSize),item.extents[i].offsetPos);
      meta.set(be(data.length,iloc.lengthSize),item.extents[i].lengthPos);
      chunks.push(data);cursor+=data.length;
    }
  }
  assert.ok(cursor<2**32);
  return concat([...kept,box('mdat',concat(chunks))]);
}

function validate(data,replacements,codecs) {
  const d=discoverHeic(data);assert.deepEqual(d.refs,original.refs);
  assert.deepEqual([...d.infos],[...original.infos]);
  let preserved=0;
  for(const [id] of original.iloc.items) {
    const expected=replacements.get(id)||extractItemData(source,original,id);
    assert.deepEqual(extractItemData(data,d,id),expected,`Payload ${id}`);
    if(!replacements.has(id))preserved++;
  }
  for(const prop of original.props.properties) {
    const after=d.props.properties[prop.index-1];
    assert.deepEqual(data.slice(after.box.off,after.box.off+after.box.size),
      source.slice(prop.box.off,prop.box.off+prop.box.size),`Original property ${prop.index}`);
  }
  for(const [id,associations] of original.props.associations) {
    const after=d.props.associations.get(id);assert.equal(after.length,associations.length);
    for(let i=0;i<associations.length;i++) {
      const a=associations[i],type=original.props.properties[a.index-1].type;
      assert.equal(after[i].essential,a.essential);
      if(codecs.has(id)&&type==='hvcC')assert.deepEqual(propertyBoxBytes(data,d.props,id,type),codecs.get(id));
      else assert.deepEqual(after[i],a,`Association ${id}/${type}`);
    }
  }
  assert.deepEqual(dimensionsForItem(d.props,d.primary),dimensionsForItem(original.props,original.primary));
  return {bytes:data.length,sha256:hash(data),sourcePayloadsKeptExact:preserved,
    sourceReferencesKeptExact:true,sourcePropertiesKeptExact:true,
    photosApertureAndLighting:'Requires fresh import and physical iPhone test'};
}

let browser;
try {
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const require=createRequire(import.meta.url);
  const {chromium}=require('C:/Users/WanThinnn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page=await browser.newPage();page.on('console',m=>console.log(m.text().slice(0,240)));
  await page.goto(`http://127.0.0.1:${server.address().port}/probe`);
  const tileReport=await page.evaluate(async()=>{
    const {discoverHeic,propertyBoxBytes,extractItemData,dimensionsForItem}=await import('/src/raster/heif.js');
    const {topBox}=await import('/src/box.js');
    const {decodeHevcYuv,encodeHevcPixels,releaseHevcEncoder}=await import('/src/raster/ffmpeg-hevc.js');
    const {readSpsInfo}=await import('/src/raster/hevc-linear-tags.js');
    const source=new Uint8Array(await(await fetch('/source.heic')).arrayBuffer()),d=discoverHeic(source),reports=[];
    const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
    const spsOf=codec=>{const b=topBox(codec,'hvcC'),record=codec.subarray(b.hdr);let pos=23,sps;
      for(let i=0;i<record[22];i++){const type=record[pos++]&63,n=(record[pos++]<<8)|record[pos++];
        for(let j=0;j<n;j++){const size=(record[pos++]<<8)|record[pos++];
          if(type===33)sps=readSpsInfo(record.subarray(pos,pos+size));pos+=size;}}
      return sps;};
    try {
      for(const [i,id] of d.primaryTiles.entries()) {
        const codec=propertyBoxBytes(source,d.props,id,'hvcC'),b=topBox(codec,'hvcC'),sps=spsOf(codec);
        if(sps.luma!==8||sps.chroma!==1||sps.chromaDepth!==8||!sps.fullRange||sps.primaries!==12||sps.transfer!==1||sps.matrix!==6)
          throw Error('Diagnostic requires this native full-range P3/BT709/SMPTE170M 8-bit layout');
        const [width,height]=dimensionsForItem(d.props,id);
        const samples=await decodeHevcYuv(codec.subarray(b.hdr),extractItemData(source,d,id),{width,height});
        const encoded=await encodeHevcPixels(samples,{width,height,pixelFormat:'yuv420p',
          primaries:'smpte432',transfer:'bt709',matrix:'smpte170m',fullRange:true,lossless:true});
        const nb=topBox(encoded.hvcc,'hvcC'),ns=spsOf(encoded.hvcc);
        for(const key of ['chroma','luma','chromaDepth','fullRange','primaries','transfer','matrix'])
          if(ns[key]!==sps[key])throw Error(`Colour declaration changed: ${key}`);
        const readback=await decodeHevcYuv(encoded.hvcc.subarray(nb.hdr),encoded.payload,{width,height});
        if(readback.length!==samples.length||!readback.every((v,j)=>v===samples[j]))throw Error(`Tile ${id} YUV changed`);
        for(const key of ['payload','hvcc']){
          const response=await fetch(`/artifact/${id}/${key}`,{method:'POST',body:encoded[key]});
          if(!response.ok)throw Error('Failed to retain encoded diagnostic tile');
        }
        reports.push({id,width,height,sampleBytes:samples.length,sampleSha256:await sha(samples),
          payloadSha256:await sha(encoded.payload),codecSha256:await sha(encoded.hvcc),exactYuvReadback:true});
        console.log(`Tile ${i+1}/${d.primaryTiles.length}: exact Y/U/V readback`);
      }
    }finally{releaseHevcEncoder();}
    return reports;
  });
  const replacements=new Map(),encodedCodecs=new Map(),nativeCodecs=new Map();
  for(const id of original.primaryTiles){
    const payload=artifacts.get(`/artifact/${id}/payload`),codec=artifacts.get(`/artifact/${id}/hvcc`);
    assert.ok(payload?.length&&codec?.length);
    const row=tileReport.find(r=>r.id===id);assert.equal(hash(payload),row.payloadSha256);assert.equal(hash(codec),row.codecSha256);
    replacements.set(id,payload);encodedCodecs.set(id,codec);
    nativeCodecs.set(id,propertyBoxBytes(source,original.props,id,'hvcC'));
  }
  const variants=[{file:'A_Original_5129.HEIC',data:source,replacements:new Map(),codecs:new Map()},
    {file:'B_Lossless_Reencoded_Main.HEIC',data:rebuild(replacements,encodedCodecs),replacements,codecs:encodedCodecs},
    {file:'C_Container_Control.HEIC',data:rebuild(new Map(),nativeCodecs),replacements:new Map(),codecs:nativeCodecs}];
  const report={source:path.resolve(input),sourceSha256:hash(source),
    purpose:'Same-photo encoder/container diagnostic; no new Portrait capability claimed',
    productionChanged:false,primaryDimensions:dimensionsForItem(original.props,original.primary),
    encoder:{runtime:'Website FFmpeg.wasm/x265',pixelFormat:'yuv420p',lossless:true,fullRange:true,
      primaries:'smpte432',transfer:'bt709',matrix:'smpte170m'},
    tiles:tileReport,variants:variants.map(v=>({file:v.file,...validate(v.data,v.replacements,v.codecs)}))};
  // All assertions pass before any on-device batch is created.
  fs.mkdirSync(directory,{recursive:true});
  for(const v of variants)fs.writeFileSync(path.join(directory,v.file),v.data,{flag:'wx'});
  fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  fs.writeFileSync(path.join(directory,'READ_ME.txt'),
    'Portrait V10: cung mot anh 5129, khong phai ban fix cho anh thuong.\n\n'+
    'A: nguyen ban da chinh duoc Portrait.\nB: ma hoa lai 48 o anh chinh lossless; Y/U/V giong tung byte.\n'+
    'C: dung lai container nhu B, giu bitstream va codec goc.\n\n'+
    'Luu tung file tu Tep vao Anh thanh ban moi. Thu Portrait On/Off, thay doi f (mo hau canh),\n'+
    'va anh sang chan dung. Can xac nhan hieu ung thuc su, khong chi icon. Luu va mo lai de kiem tra.\n'+
    'Neu A dat, C dat, B hong: khoanh vung nhom ma hoa lai/codec.\n'+
    'Neu A dat, C hong: can kiem tra container truoc khi ket luan ve codec.\n'+
    'Neu ca ba dat: tiep tuc thu anh thuong voi depth cua chinh anh do.\n', {flag:'wx'});
  console.log(JSON.stringify({directory,variants:report.variants,tilesChecked:tileReport.length}));
}finally{
  if(browser)await browser.close();
  await new Promise(r=>server.close(r));
}
