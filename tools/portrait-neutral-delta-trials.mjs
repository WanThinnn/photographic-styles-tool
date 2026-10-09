// Private donor correction-map isolation after accepted V17 Portrait-only control.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {boxes,topBox,box,concat,be} from '../web/src/box.js';
import {discoverHeic,extractItemData,propertyBoxBytes,appendIpcoProperty,repointItemProperty,parseIloc} from '../web/src/raster/heif.js';

const [sourcePath,directory]=process.argv.slice(2);
assert.ok(directory&&!fs.existsSync(directory),'Pass V15 C and a fresh output directory');
const source=new Uint8Array(fs.readFileSync(sourcePath)),d=discoverHeic(source),web=path.resolve('web');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
assert.equal(hash(source),'0d1c4f7669b9347aae1e045e6553450a86d4cf58a1c77fc6891a7c752da629ca');
assert.equal(d.deltaTiles.length,30);
let generated;
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
  if(url.pathname==='/probe'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Neutral Styles delta</title>');return;}
  if(url.pathname==='/generated'&&req.method==='POST') {
    let n=0;const chunks=[];req.on('data',b=>{n+=b.length;if(n>1024*1024)req.destroy();else chunks.push(b);});
    req.on('end',()=>{assert.ok(!generated);generated=JSON.parse(Buffer.concat(chunks).toString());res.end('ok');});return;
  }
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  const file=path.resolve(web,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(web+path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(file,(err,b)=>{if(err){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(b);});
});
let browser;
try {
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const {chromium}=createRequire(import.meta.url)('C:/Users/WanThinnn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/probe`);
  const info=await page.evaluate(async()=>{
    const {encodeHevcPixels,releaseHevcEncoder}=await import('/src/raster/ffmpeg-hevc.js');
    const {box,concat,be}=await import('/src/box.js');
    try {
      // Exactly the production synthetic-hevc.js neutral-delta recipe.
      const samples=new Uint16Array(512*512*3/2).fill(512);samples.fill(504,0,512*512);
      const color={primaries:'smpte432',transfer:'linear',matrix:'bt709',fullRange:false};
      const result=await encodeHevcPixels(samples,{width:512,height:512,...color,lossless:true});
      if(result.sps.primaries!==12||result.sps.transfer!==8||result.sps.matrix!==1||result.sps.fullRange||result.sps.luma!==10)
        throw Error('Neutral delta colour/depth declaration differs');
      const colr=box('colr',concat([new TextEncoder().encode('nclx'),be(12,2),be(8,2),be(1,2),new Uint8Array([0])]));
      const data={payload:Array.from(result.payload),hvcc:Array.from(result.hvcc),colr:Array.from(colr)};
      const response=await fetch('/generated',{method:'POST',body:JSON.stringify(data)});if(!response.ok)throw Error('Asset transfer failed');
      return {sps:result.sps,expectedSamples:samples.length,neutralY:504,neutralUV:512,
        readback:'Independent Main10 FFmpeg readback required before packaging'};
    }finally{releaseHevcEncoder();}
  });
  assert.ok(generated);
  const delta=Object.fromEntries(Object.entries(generated).map(([k,v])=>[k,new Uint8Array(v)]));
  let meta=source.slice(d.meta.off,d.meta.off+d.meta.size),codecIndex,colorIndex;
  [meta,codecIndex]=appendIpcoProperty(meta,delta.hvcc);[meta,colorIndex]=appendIpcoProperty(meta,delta.colr);
  const colourIds=[d.deltaGrid,...d.deltaTiles];
  for(const id of colourIds) {
    const a=d.props.associations.get(id).find(a=>d.props.properties[a.index-1].type==='colr');assert.ok(a);
    meta=repointItemProperty(meta,id,a.index,colorIndex);
    if(id!==d.deltaGrid){const c=d.props.associations.get(id).find(a=>d.props.properties[a.index-1].type==='hvcC');assert.ok(c);meta=repointItemProperty(meta,id,c.index,codecIndex);}
  }
  const kept=[...boxes(source,0,source.length)].filter(b=>b.type!=='mdat').map(b=>b.type==='meta'?meta:source.slice(b.off,b.off+b.size));
  const iloc=parseIloc(meta,topBox(meta,'meta'));let cursor=kept.reduce((n,b)=>n+b.length,0)+8;const chunks=[];
  for(const [id,item] of iloc.items){
    if(item.constructionMethod===1)continue;assert.equal(item.constructionMethod,0);assert.equal(item.baseOffset,0);
    if(d.deltaTiles.includes(id))assert.equal(item.extents.length,1);
    for(const [i,extent] of item.extents.entries()) {
      const old=d.iloc.items.get(id).extents[i],payload=d.deltaTiles.includes(id)?delta.payload:source.slice(old.offset,old.offset+old.length);
      meta.set(be(cursor,iloc.offsetSize),extent.offsetPos);meta.set(be(payload.length,iloc.lengthSize),extent.lengthPos);
      cursor+=payload.length;chunks.push(payload);
    }
  }
  const data=concat([...kept,box('mdat',concat(chunks))]),after=discoverHeic(data);
  assert.deepEqual(after.infos,d.infos);assert.deepEqual(after.refs,d.refs);
  for(const id of d.infos.keys()) {
    assert.deepEqual(extractItemData(data,after,id),d.deltaTiles.includes(id)?delta.payload:extractItemData(source,d,id));
    const associations=d.props.associations.get(id)||[];
    assert.equal(after.props.associations.get(id)?.length||0,associations.length);
    for(const [i,a] of associations.entries()) {
      const type=d.props.properties[a.index-1].type,q=after.props.associations.get(id)[i];assert.equal(q.essential,a.essential);
      const expected=type==='colr'&&colourIds.includes(id)?delta.colr:type==='hvcC'&&d.deltaTiles.includes(id)?delta.hvcc:null;
      if(expected)assert.deepEqual(propertyBoxBytes(data,after.props,id,type),expected);else assert.deepEqual(q,a);
    }
  }
  const variants=[{file:'A_Borrowed_Delta_Control.HEIC',data:source},
    {file:'B_Neutral_Delta_Styles_Texture_Portrait.HEIC',data}];
  const report={source:path.resolve(sourcePath),sourceSha256:hash(source),diagnosticOnly:true,productionChanged:false,
    broadColourFittingPaused:true,changedDeltaTiles:d.deltaTiles,changedColrItems:colourIds,
    neutralAsset:{payloadSha256:hash(delta.payload),...info},
    note:'Replace the cross-scene StyleDeltaMap with existing production neutral recipe, not new colour fitting. Original Styles coefficients/light maps remain borrowed. Device test required.',
    variants:variants.map(v=>({file:v.file,bytes:v.data.length,sha256:hash(v.data),items:after.infos.size,
      mainDepthRENDTextureMasksExifAndStylesPlistExact:true}))};
  fs.mkdirSync(directory,{recursive:true});
  for(const v of variants)fs.writeFileSync(path.join(directory,v.file),v.data,{flag:'wx'});
  for(const [key,bytes] of Object.entries(delta))fs.writeFileSync(path.join(directory,'neutral-'+key+'.bin'),bytes,{flag:'wx'});
  fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log(JSON.stringify(report));
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
