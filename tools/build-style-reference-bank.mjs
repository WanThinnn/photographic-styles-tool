import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {discoverHeic,extractItem} from '../web/src/core/heif.js';
import {extractAppleMakerNoteTag,exifCameraModel} from '../web/src/core/exif.js';
import {parseBplist} from '../web/src/core/bplist.js';
import {STYLE_SELECTIONS,validateStyleRecommendation} from '../web/src/recommend/style-selection.js';
import {STYLE_BANK_MODEL,STYLE_BANK_REVISION,STYLE_BANK_VERSION,STYLE_EMBEDDING_DIMENSIONS,queryReferenceBank,validateReferenceBank}
  from '../web/src/recommend/style-reference-bank.js';
import {styleQuality} from '../web/src/recommend/style-quality.js';
import {recommendStyle} from '../web/src/recommend/style-recommender.js';
import {semanticAxisFeatures,validateSemanticAxes} from '../web/src/recommend/style-semantic-axes.js';
import {scoreStyleScene} from '../web/src/recommend/style-scene-decision.js';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../web');
const HEIC=/\.(?:heic|heif)$/i;

function usage(){
  console.error('Usage: node tools/build-style-reference-bank.mjs --input <dir> [--manifest <json>] [--audit-only | --output <json>] [--provider wasm|webgpu]');
}
function args(argv){
  const out={provider:'wasm'};
  for(let i=0;i<argv.length;i++){
    const key=argv[i];
    if(key==='--input'||key==='--output'||key==='--provider'||key==='--manifest')out[key.slice(2)]=argv[++i];
    else if(key==='--audit-only')out.auditOnly=true;
    else throw new Error(`Unknown option: ${key}`);
  }
  if(!out.input||(!out.auditOnly&&(!out.output||!out.manifest))||!['wasm','webgpu'].includes(out.provider))throw new Error('Invalid arguments');
  return out;
}
function filesUnder(root){
  const found=[];
  for(const entry of fs.readdirSync(root,{withFileTypes:true})){
    const full=path.join(root,entry.name);
    if(entry.isDirectory())found.push(...filesUnder(full));
    else if(entry.isFile()&&HEIC.test(entry.name))found.push(full);
  }
  return found.sort((a,b)=>a.localeCompare(b));
}
function curatedFiles(input,manifestPath){
  const raw=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.version!==1||!Array.isArray(raw.records))throw new Error('Invalid curated reference manifest');
  const seen=new Set(),out=[];
  for(const [index,record] of raw.records.entries()){
    if(!record||typeof record!=='object'||Array.isArray(record))throw new Error(`Invalid curated record ${index}`);
    for(const key of Object.keys(record))if(!['file','styleId','role','preferenceStyleId'].includes(key))throw new Error(`Unexpected curated field: ${key}`);
    if(typeof record.file!=='string'||!record.file||path.isAbsolute(record.file)||!HEIC.test(record.file))throw new Error(`Invalid curated file at record ${index}`);
    const role=record.role??'reference';
    if(!['reference','holdout'].includes(role))throw new Error(`Invalid curated role at record ${index}`);
    const styleId=record.styleId===undefined?null:Number(record.styleId);
    if(role==='reference'&&(!Number.isInteger(styleId)||!STYLE_SELECTIONS[styleId]))throw new Error(`Invalid curated Style at record ${index}`);
    if(role==='holdout'&&styleId!==null&&(!Number.isInteger(styleId)||!STYLE_SELECTIONS[styleId]))throw new Error(`Invalid curated Style at record ${index}`);
    const preferenceStyleId=record.preferenceStyleId===undefined?null:Number(record.preferenceStyleId);
    if(preferenceStyleId!==null&&(!Number.isInteger(preferenceStyleId)||!STYLE_SELECTIONS[preferenceStyleId]))throw new Error(`Invalid preference Style at record ${index}`);
    const file=path.resolve(input,record.file),relative=path.relative(input,file);
    if(relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw new Error(`Curated file escapes input root: ${record.file}`);
    const canonical=path.normalize(file).toLowerCase();
    if(seen.has(canonical))throw new Error(`Duplicate curated file: ${record.file}`);
    seen.add(canonical);out.push({file,expectedStyleId:styleId,preferenceStyleId,label:record.file,role});
  }
  if(!out.length)throw new Error('Curated reference manifest is empty');
  return out;
}

function nativeReference(bytes,expectedStyleId=null){
  const d=discoverHeic(bytes);
  if(d.exifItem===null)throw new Error('missing Exif');
  const exif=extractItem(bytes,d.iloc,d.exifItem),model=exifCameraModel(exif)||'';
  const generation=/^iPhone (\d+)(?:\s|$)/.exec(model);
  if(!generation||Number(generation[1])<16)throw new Error(`unsupported reference camera: ${model||'unknown'}`);
  const completeGraph=d.stylesItem!==null&&d.deltaGrid!==null&&d.linearThumb!==null;
  let modernNativeCapture=false;
  if(Number(generation[1])>=18){
    try{const texture=extractAppleMakerNoteTag(exif,0x65);modernNativeCapture=texture.type===7&&texture.payload.length>0;}catch{}
  }
  if(!completeGraph&&!modernNativeCapture)throw new Error('incomplete Styles graph');
  const tag=extractAppleMakerNoteTag(exif),marker=parseBplist(tag.payload);
  if(!(marker instanceof Map)||marker.get('0')!==1)throw new Error('invalid 0x54 marker');
  const styleId=Number(marker.get('4')),tone=Number(marker.get('1')),color=Number(marker.get('2')),palette=Number(marker.get('3'));
  const value=validateStyleRecommendation({styleId,tone,color,palette,confidence:1,level:'standard'});
  if(expectedStyleId!==null&&value.styleId!==expectedStyleId)throw new Error(`curated Style mismatch: expected ${expectedStyleId}, marker has ${value.styleId}`);
  return {styleId:value.styleId,tone:value.tone,color:value.color,palette:value.palette,sourceClass:completeGraph?'native-complete':'native-capture'};
}
function mime(file){
  if(/\.html$/i.test(file))return 'text/html; charset=utf-8';
  if(/\.css$/i.test(file))return 'text/css; charset=utf-8';
  if(/\.m?js$/i.test(file))return 'text/javascript; charset=utf-8';
  if(/\.json$/i.test(file))return 'application/json';
  if(/\.wasm$/i.test(file))return 'application/wasm';
  return 'application/octet-stream';
}
function playwright(){
  const req=createRequire(import.meta.url);
  try{return req('playwright');}catch(first){
    const explicit=process.env.STYLIO_PLAYWRIGHT_MODULE;
    if(explicit)try{return req(explicit);}catch{}
    return null;
  }
}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function browserExecutable(){
  const candidates=[
    process.env.STYLIO_CHROME,
    process.platform==='win32'?'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe':null,
    process.platform==='win32'?'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe':null,
    process.platform==='win32'?'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe':null,
    process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':null,
    process.platform==='darwin'?'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge':null,
    process.platform==='linux'?'/usr/bin/google-chrome':null,
    process.platform==='linux'?'/usr/bin/chromium':null,
    process.platform==='linux'?'/usr/bin/chromium-browser':null,
  ].filter(Boolean);
  return candidates.find(file=>fs.existsSync(file))||null;
}
async function cdpPage(url,{provider}={}){
  const executable=browserExecutable();
  if(!executable)throw new Error('Playwright is unavailable and no local Chrome/Edge executable was found.');
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'stylio-style-bank-'));
  const flags=['--headless=new','--remote-debugging-port=0','--remote-allow-origins=*','--no-first-run',
    '--disable-extensions','--disable-background-networking','--user-data-dir='+profile];
  if(provider==='wasm')flags.push('--disable-gpu');
  else flags.push('--enable-unsafe-webgpu');
  flags.push(url);
  const child=spawn(executable,flags,{stdio:'ignore'});
  let socket;
  try{
    let debugPort=0;
    for(let i=0;i<200;i++){
      try{
        debugPort=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split(/\r?\n/)[0]);
        if(Number.isInteger(debugPort)&&debugPort>0)break;
      }catch{}
      if(child.exitCode!==null)throw new Error('Local browser exited before DevTools became available.');
      await sleep(100);
    }
    if(!debugPort)throw new Error('Timed out waiting for local browser DevTools port.');
    let endpoint='';
    for(let i=0;i<80;i++){
      try{
        const tabs=await fetch(`http://127.0.0.1:${debugPort}/json`).then(response=>response.json());
        endpoint=tabs.find(tab=>tab.type==='page'&&tab.url.startsWith(url))?.webSocketDebuggerUrl
          ||tabs.find(tab=>tab.type==='page')?.webSocketDebuggerUrl||'';
        if(endpoint)break;
      }catch{}
      await sleep(100);
    }
    if(!endpoint)throw new Error('Could not find local browser page over DevTools.');
    socket=new WebSocket(endpoint);
    await new Promise((resolve,reject)=>{
      socket.addEventListener('open',resolve,{once:true});
      socket.addEventListener('error',reject,{once:true});
    });
    let sequence=0;
    const pending=new Map();
    socket.addEventListener('message',event=>{
      const message=JSON.parse(String(event.data)),call=pending.get(message.id);
      if(!call)return;
      pending.delete(message.id);clearTimeout(call.timer);
      message.error?call.reject(new Error(JSON.stringify(message.error))):call.resolve(message.result);
    });
    const cdp=(method,params={},timeout=260000)=>new Promise((resolve,reject)=>{
      const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error(`${method} timed out`));},timeout);
      pending.set(id,{resolve,reject,timer});
      socket.send(JSON.stringify({id,method,params}));
    });
    await cdp('Runtime.enable');
    return {
      async evaluate(expression){
        const result=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
        if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text||'Browser evaluation failed');
        return result.result?.value;
      },
      async close(){
        try{socket?.close();}catch{}
        child.kill();
        try{fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}catch{}
      },
    };
  }catch(error){
    try{socket?.close();}catch{}
    child.kill();
    try{fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}catch{}
    throw error;
  }
}
async function main(){
  const options=args(process.argv.slice(2)),input=path.resolve(options.input),output=options.output?path.resolve(options.output):null;
  const manifestPath=options.manifest?path.resolve(options.manifest):null;
  const candidates=manifestPath?curatedFiles(input,manifestPath):filesUnder(input).map(file=>({file,expectedStyleId:null,label:path.basename(file)}));
  const accepted=[],holdoutInputs=[],holdouts=[],rejected=[];
  for(const candidate of candidates){
    try{
      const metadata=nativeReference(new Uint8Array(fs.readFileSync(candidate.file)),candidate.expectedStyleId);
      if(candidate.role==='holdout'){
        holdoutInputs.push({file:candidate.file,label:candidate.label,expectedStyleId:candidate.expectedStyleId,
          preferenceStyleId:candidate.preferenceStyleId,metadata});
        holdouts.push({file:candidate.label,status:'metadata-valid',metadata});
      }else accepted.push({file:candidate.file,metadata});
    }catch(error){
      const reason=String(error?.message||error);
      if(candidate.role==='holdout')holdouts.push({file:candidate.label,status:'metadata-rejected',reason});
      else rejected.push({file:candidate.label,reason});
    }
  }
  const acceptedCounts=Object.fromEntries(Object.keys(STYLE_SELECTIONS).map(id=>[id,accepted.filter(item=>item.metadata.styleId===Number(id)).length]));
  const served=[...accepted,...holdoutInputs];
  if(options.auditOnly){
    const references=accepted.map(item=>({file:path.relative(input,item.file).replaceAll('\\','/'),
      styleId:item.metadata.styleId,styleName:STYLE_SELECTIONS[item.metadata.styleId].name,sourceClass:item.metadata.sourceClass}));
    console.log(JSON.stringify({curated:Boolean(manifestPath),accepted:accepted.length,counts:acceptedCounts,references,holdouts,rejected},null,2));
    return;
  }
  if(!accepted.length)throw new Error('No complete iPhone 16+ native Style references were accepted');

  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://127.0.0.1');
    res.setHeader('Cross-Origin-Opener-Policy','same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
    if(url.pathname==='/__style_bank__'){
      const body=Buffer.from('<!doctype html><meta charset="utf-8"><title>Stylio Style Bank Builder</title>');
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Length':body.length,'Cache-Control':'no-store'});
      res.end(body);return;
    }
    if(url.pathname.startsWith('/__style_ref/')){
      const index=Number(url.pathname.slice('/__style_ref/'.length));
      const item=served[index];
      if(!item){res.writeHead(404).end();return;}
      const body=fs.readFileSync(item.file);
      res.writeHead(200,{'Content-Type':'image/heic','Content-Length':body.length,'Cache-Control':'no-store'});
      res.end(body);return;
    }
    const pathname=url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname);
    const file=path.resolve(ROOT,'.'+pathname);
    if(!file.startsWith(ROOT+path.sep)){res.writeHead(403).end();return;}
    fs.readFile(file,(error,body)=>{
      if(error){res.writeHead(404).end();return;}
      res.writeHead(200,{"Content-Type":mime(file),"Content-Length":body.length,"Cache-Control":"no-store"});
      res.end(body);
    });
  });

  const pw=playwright();let browser,cdp;
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const origin=`http://127.0.0.1:${server.address().port}`;
    let evaluate;
    if(pw){
      const launch={headless:true};
      if(process.env.STYLIO_CHROME)launch.executablePath=process.env.STYLIO_CHROME;
      browser=await pw.chromium.launch(launch);
      const page=await browser.newPage({serviceWorkers:'block'});
      page.on('console',message=>{if(message.type()==='error')console.error('[browser]',message.text());});
      await page.goto(`${origin}/__style_bank__`,{waitUntil:'domcontentloaded'});
      evaluate=async(index,provider)=>page.evaluate(async({index,provider})=>{
        const [{discoverHeic,dimensionsForItem,itemOrientation},{decodeToRgb},{inferStyleEmbeddings},{orientStyleImage,styleImageStatistics}]=await Promise.all([
          import('./src/raster/heif.js'),import('./src/media/decode.js'),import('./src/recommend/style-inference.js'),
          import('./src/recommend/style-analysis.js')]);
        const response=await fetch(`./__style_ref/${index}`,{cache:'no-store'});
        if(!response.ok)throw new Error(`reference HTTP ${response.status}`);
        const bytes=new Uint8Array(await response.arrayBuffer()),d=discoverHeic(bytes);
        const [width,height]=dimensionsForItem(d.props,d.primary),scale=Math.min(1,640/Math.max(width,height));
        const sampleWidth=Math.max(1,Math.round(width*scale)),sampleHeight=Math.max(1,Math.round(height*scale));
        const orientation=itemOrientation(bytes,d.props,d.primary);
        const rgb=await decodeToRgb(bytes,{width:sampleWidth,height:sampleHeight,...orientation});
        const display=orientStyleImage({data:rgb,width:sampleWidth,height:sampleHeight},orientation);
        const [vector]=await inferStyleEmbeddings(display,{level:'lite',provider,timeoutMs:240000});
        return {embedding:Array.from(vector),statistics:styleImageStatistics(display,{sampleSize:48})};
      },{index,provider});
    }else{
      process.stderr.write('Playwright not installed; using local Chrome/Edge over DevTools.\n');
      cdp=await cdpPage(`${origin}/__style_bank__`,{provider:options.provider});
      evaluate=async(index,provider)=>cdp.evaluate(`(async()=>{
        const index=${JSON.stringify(index)},provider=${JSON.stringify(provider)};
        const [{discoverHeic,dimensionsForItem,itemOrientation},{decodeToRgb},{inferStyleEmbeddings},{orientStyleImage,styleImageStatistics}]=await Promise.all([
          import('./src/raster/heif.js'),import('./src/media/decode.js'),import('./src/recommend/style-inference.js'),
          import('./src/recommend/style-analysis.js')]);
        const response=await fetch('./__style_ref/'+index,{cache:'no-store'});
        if(!response.ok)throw new Error('reference HTTP '+response.status);
        const bytes=new Uint8Array(await response.arrayBuffer()),d=discoverHeic(bytes);
        const [width,height]=dimensionsForItem(d.props,d.primary),scale=Math.min(1,640/Math.max(width,height));
        const sampleWidth=Math.max(1,Math.round(width*scale)),sampleHeight=Math.max(1,Math.round(height*scale));
        const orientation=itemOrientation(bytes,d.props,d.primary);
        const rgb=await decodeToRgb(bytes,{width:sampleWidth,height:sampleHeight,...orientation});
        const display=orientStyleImage({data:rgb,width:sampleWidth,height:sampleHeight},orientation);
        const [vector]=await inferStyleEmbeddings(display,{level:'lite',provider,timeoutMs:240000});
        return {embedding:Array.from(vector),statistics:styleImageStatistics(display,{sampleSize:48})};
      })()`);
    }
    const records=[];
    for(let index=0;index<accepted.length;index++){
      const analyzed=await evaluate(index,options.provider),embedding=analyzed?.embedding;
      if(!Array.isArray(embedding)||embedding.length!==STYLE_EMBEDDING_DIMENSIONS)
        throw new Error(`Unexpected embedding size for reference ${index}`);
      records.push({...accepted[index].metadata,embedding});
      process.stderr.write(`Embedded ${index+1}/${accepted.length}: Style ${accepted[index].metadata.styleId} ${STYLE_SELECTIONS[accepted[index].metadata.styleId].name}\n`);
    }
    const bank={version:STYLE_BANK_VERSION,model:STYLE_BANK_MODEL,revision:STYLE_BANK_REVISION,dimensions:STYLE_EMBEDDING_DIMENSIONS,records};
    validateReferenceBank(bank);
    const semanticAxes=validateSemanticAxes(JSON.parse(fs.readFileSync(path.join(ROOT,'vendor/ai-style/semantic-axes.json'),'utf8')));
    const predictions=[];
    for(let i=0;i<holdoutInputs.length;i++){
      const item=holdoutInputs[i],analyzed=await evaluate(accepted.length+i,options.provider),embedding=analyzed?.embedding;
      if(!Array.isArray(embedding)||embedding.length!==STYLE_EMBEDDING_DIMENSIONS)
        throw new Error(`Unexpected holdout embedding size for ${item.label}`);
      const vector=Float32Array.from(embedding),quality=styleQuality('lite');
      const nearest=queryReferenceBank(bank,vector,{k:quality.k});
      const semantic=semanticAxisFeatures([vector],semanticAxes);
      const scene=scoreStyleScene({semantic:semantic.values,statistics:analyzed.statistics,level:'lite',
        meanDispersion:semantic.meanDispersion,maxDispersion:semantic.maxDispersion});
      const recommendation=recommendStyle({axes:semanticAxes,level:'lite',embeddings:[vector],statistics:analyzed.statistics});
      const captureStyleId=item.expectedStyleId??item.metadata.styleId,preferenceStyleId=item.preferenceStyleId;
      predictions.push({file:item.label,captureStyleId,preferenceStyleId,sceneWinner:scene.winner.styleName,sceneMargin:scene.margin,
        sceneTop:scene.scores.slice(0,3).map(value=>({style:value.styleName,score:value.score,semantic:value.semanticScore,photo:value.photoScore})),
        semantic:semantic.values,photo:scene.photo,candidateStyleId:nearest.styleId,
        candidateStyleName:STYLE_SELECTIONS[nearest.styleId].name,candidateSupport:nearest.support,candidateMargin:nearest.margin,
        actualStyleId:recommendation.styleId,actualStyleName:recommendation.styleName,confidence:recommendation.confidence,
        fallback:recommendation.fallback,
        ...(preferenceStyleId===null?{}:{preferenceMatch:recommendation.styleId===preferenceStyleId})});
    }
    const preferenceLabeled=predictions.filter(item=>item.preferenceStyleId!==null);
    const holdoutEvaluation=predictions.length?{
      total:predictions.length,
      preferenceLabeled:preferenceLabeled.length,
      ...(preferenceLabeled.length?{
        preferenceCorrect:preferenceLabeled.filter(item=>item.preferenceMatch).length,
        preferenceAccuracy:preferenceLabeled.filter(item=>item.preferenceMatch).length/preferenceLabeled.length,
      }:{}),
      predictions,
    }:null;
    fs.mkdirSync(path.dirname(output),{recursive:true});
    fs.writeFileSync(output,JSON.stringify(bank));
    console.log(JSON.stringify({output,curated:true,records:records.length,counts:acceptedCounts,holdouts,rejected,holdoutEvaluation},null,2));
  }finally{
    await browser?.close();
    await cdp?.close();
    if(server.listening)await new Promise(resolve=>server.close(resolve));
  }
}

main().catch(error=>{usage();console.error(error?.stack||error);process.exitCode=1;});
