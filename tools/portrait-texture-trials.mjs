// Private coexistence test after V11 device acceptance. No production changes.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {discoverHeic,extractItemData,propertyBoxBytes,auxUriForItem,MATTE_URIS,
  itemOrientation,DEPTH_URI} from '../web/src/raster/heif.js';
import {addTexture,hasTexture,URI_TEXTURE_STYLES} from '../web/src/texture.js';
import {hasSoftSkinData} from '../web/src/soft-skin-container.js';
import {parseBplist} from '../web/src/bplist.js';

const [sourcePath,jpegPath,directory]=process.argv.slice(2);
assert.ok(directory,'Pass accepted V11 C, its original JPEG, and fresh output directory');
assert.ok(!fs.existsSync(directory),'Do not overwrite a tested batch');
const source=new Uint8Array(fs.readFileSync(sourcePath)),original=discoverHeic(source),web=path.resolve('web');
const sourceDepth=[...original.infos.keys()].find(i=>auxUriForItem(original.props,i)===DEPTH_URI);
assert.ok(sourceDepth!==undefined);assert.ok(!hasTexture(original.infos));
const texture=addTexture(source);assert.equal(texture.report.toneCurveAdded,false,'Colour investigation is paused; keep Styles exact');
assert.equal(hasSoftSkinData(texture.data),false,'This cohort must lack native Soft Skin before AI');
let generated;
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
  if(url.pathname==='/output.heic'&&req.method==='POST'){
    let length=0;const chunks=[];req.on('data',b=>{length+=b.length;if(length>64*1024*1024)req.destroy();else chunks.push(b);});
    req.on('end',()=>{if(generated){res.writeHead(409);res.end();return;}generated=new Uint8Array(Buffer.concat(chunks));res.end('ok');});return;}
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  if(url.pathname==='/texture.heic'){res.end(texture.data);return;}
  if(url.pathname==='/probe'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Portrait and Texture coexistence</title>');return;}
  const file=url.pathname==='/target.jpeg'?path.resolve(jpegPath):path.resolve(web,'.'+decodeURIComponent(url.pathname));
  if(url.pathname!=='/target.jpeg'&&!file.startsWith(web+path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(file,(err,b)=>{if(err){res.writeHead(404);res.end();return;}
    const ext=path.extname(file);res.setHeader('Content-Type',['.js','.mjs'].includes(ext)?'text/javascript':ext==='.wasm'?'application/wasm':'application/octet-stream');res.end(b);});
});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function verify(bytes) {
  const d=discoverHeic(bytes);
  for(const [id,info] of original.infos){
    assert.deepEqual(d.infos.get(id),info);
    assert.deepEqual(extractItemData(bytes,d,id),extractItemData(source,original,id),`Original payload ${id}`);
    for(const a of original.props.associations.get(id)||[]){
      const type=original.props.properties[a.index-1].type;
      assert.deepEqual(propertyBoxBytes(bytes,d.props,id,type),propertyBoxBytes(source,original.props,id,type),`Original property ${id}/${type}`);
    }
  }
  for(const ref of original.refs)assert.ok(d.refs.some(r=>JSON.stringify(r)===JSON.stringify(ref)));
  assert.deepEqual(itemOrientation(bytes,d.props,d.primary),itemOrientation(source,original.props,original.primary));
  const tid=[...d.infos].find(([,i])=>i.uri===URI_TEXTURE_STYLES)?.[0];
  const plist=tid===undefined?null:parseBplist(extractItemData(bytes,d,tid));
  return {bytes:bytes.length,sha256:hash(bytes),preservedV11Payloads:original.infos.size,
    texture:hasTexture(d.infos),softSkin:hasSoftSkinData(bytes),
    people:plist?.get('TextureStylePostProcessedPeopleData')?.length||0,
    stylesBytesExact:true,depthAndSidecarExact:true,
    portraitEffects:'Requires physical fresh-import and actual rendering test'};
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
  const page=await context.newPage();page.on('console',m=>console.log(m.text().slice(0,240)));
  await page.goto(`http://127.0.0.1:${server.address().port}/probe`);
  const inference=await page.evaluate(async()=>{
    const bytes=new Uint8Array(await(await fetch('/texture.heic')).arrayBuffer());
    const jpeg=new Uint8Array(await(await fetch('/target.jpeg')).arrayBuffer());
    const image=await createImageBitmap(new Blob([jpeg],{type:'image/jpeg'}));
    const canvas=document.createElement('canvas');canvas.width=3024;canvas.height=4032;
    const ctx=canvas.getContext('2d',{alpha:false,colorSpace:'srgb'});ctx.fillStyle='white';ctx.fillRect(0,0,3024,4032);
    const scale=Math.min(3024/image.width,4032/image.height),w=image.width*scale,h=image.height*scale;
    ctx.drawImage(image,(3024-w)/2,(4032-h)/2,w,h);image.close();
    const {generateRasterFaceMattes}=await import('/src/vision/face-mattes.js');
    const {installSoftSkin,hasSoftSkinData}=await import('/src/soft-skin-container.js');
    try{
      const result=await generateRasterFaceMattes(canvas,270,null,{onProgress:p=>console.log('Soft Skin',p.stage,p.matte||'')});
      if(result.state!=='generated'||result.faces!==1)throw Error('Expected one face in this JPEG');
      // Preserve frozen Styles colour fields. No source-native human mattes exist
      // in this reference, so the newly generated legacy human mattes are added.
      const output=installSoftSkin(bytes,result,{nativeStyles:true});
      if(!hasSoftSkinData(output))throw Error('Generated Soft Skin resources incomplete');
      const response=await fetch('/output.heic',{method:'POST',body:output});if(!response.ok)throw Error('Output transfer failed');
      const roughness=result.texturePeopleData.map(e=>e.get('imageStats').get('SkinSmoothingStandalone').get('SkinSmoothFaceRoughness'));
      return {state:result.state,faces:result.faces,refinement:result.refinement,roughness,
        poseAndMasksFrom:'Same JPEG as V11 main and AI depth',stylesColourChanged:false};
    }finally{
      canvas.width=canvas.height=0;
      const {releaseOrtModels}=await import('/src/vision/ort-vision.js');await releaseOrtModels();
      const {releaseHevcEncoder}=await import('/src/raster/ffmpeg-hevc.js');releaseHevcEncoder();
    }
  });
  assert.ok(generated?.length);
  const variants=[{file:'A_V11_Accepted_Control.HEIC',data:source},
    {file:'B_Portrait_Texture.HEIC',data:texture.data},{file:'C_Portrait_Texture_AI_SoftSkin.HEIC',data:generated}];
  const report={source:path.resolve(sourcePath),sourceSha256:hash(source),jpeg:path.resolve(jpegPath),
    diagnosticOnly:true,productionChanged:false,colourInvestigationPaused:true,
    nativeHumanMattesAtV11:[...original.infos.keys()].filter(i=>[MATTE_URIS.semanticskinmatte,MATTE_URIS.portraiteffectsmatte].includes(auxUriForItem(original.props,i))),
    note:'V11 still carries borrowed capture/calibration/REND/HDR/Styles resources. V12 tests Texture coexistence, not correct reconstruction of every field.',
    inference,textureReport:texture.report,variants:variants.map(v=>({file:v.file,...verify(v.data)}))};
  assert.deepEqual(report.nativeHumanMattesAtV11,[]);
  assert.ok(report.variants[2].softSkin&&report.variants[2].people===1);
  fs.mkdirSync(directory,{recursive:true});
  for(const v of variants)fs.writeFileSync(path.join(directory,v.file),v.data,{flag:'wx'});
  fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log(JSON.stringify({directory,variants:report.variants,inference}));
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
