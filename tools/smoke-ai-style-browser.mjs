/**
 * Real browser smoke test for Suggested Styles TinyCLIP image-only models.
 * Uses installed Chrome/Edge through CDP; no Playwright dependency and no photos.
 *
 * node tools/smoke-ai-style-browser.mjs
 * node tools/smoke-ai-style-browser.mjs --webgpu
 */
import {createServer} from 'node:http';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve,relative,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../web/',import.meta.url));
const provider=process.argv.includes('--webgpu')?'webgpu':'wasm';
const level=process.argv.find(arg=>arg.startsWith('--level='))?.slice(8)||'lite';
const heicPath=process.argv.find(arg=>arg.startsWith('--heic='))?.slice(7)||null;
if(!['lite','standard','pro'].includes(level))throw Error('Invalid --level');
const browserCandidates=[
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];
const browser=browserCandidates.find(existsSync);
if(!browser)throw Error('Neither Chrome nor Edge is installed');
const types={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.mjs':'text/javascript;charset=utf-8',
  '.wasm':'application/wasm','.onnx':'application/octet-stream','.json':'application/json'};
const headers={
  'Cross-Origin-Opener-Policy':'same-origin',
  'Cross-Origin-Embedder-Policy':'require-corp',
  'Access-Control-Allow-Origin':'*',
  'Cache-Control':'no-store',
};
const server=createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/__ai_style_smoke__'){
    res.writeHead(200,{...headers,'Content-Type':'text/html;charset=utf-8'});
    res.end('<!doctype html><title>Suggested Styles smoke</title>');
    return;
  }
  if(pathname==='/__style_display_input__'&&heicPath){
    try{const file=await readFile(heicPath);res.writeHead(200,{...headers,'Content-Type':'image/heic'});res.end(file);}
    catch{res.writeHead(404,headers);res.end();}return;
  }
  const full=resolve(root,'.'+decodeURIComponent(pathname)),rel=relative(root,full);
  if(rel.startsWith('..')||rel.startsWith(sep)||rel===''){res.writeHead(404,headers);res.end();return;}
  try{
    const file=await readFile(full);
    res.writeHead(200,{...headers,'Content-Type':types[extname(full)]||'application/octet-stream'});
    res.end(file);
  }catch{res.writeHead(404,headers);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port,dir=await mkdtemp(join(tmpdir(),'style-browser-'));
const child=spawn(browser,['--headless=new','--remote-debugging-port=0','--remote-allow-origins=*','--no-first-run',
  '--disable-extensions','--disable-background-networking',...(provider==='wasm'?['--disable-gpu']:['--enable-unsafe-webgpu']),
  '--user-data-dir='+dir,'http://127.0.0.1:'+port+'/__ai_style_smoke__'],{stdio:'ignore'});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let socket;
try{
  let debugPort,endpoint;
  for(let i=0;i<200;i++){
    try{debugPort=Number((await readFile(join(dir,'DevToolsActivePort'),'utf8')).split(/\r?\n/)[0]);if(Number.isInteger(debugPort))break;}catch{}
    if(child.exitCode!==null)throw Error('Headless browser exited: '+child.exitCode);
    await sleep(100);
  }
  if(!debugPort)throw Error('Headless CDP debug port unavailable');
  for(let i=0;i<50;i++){
    try{
      const tabs=await fetch('http://127.0.0.1:'+debugPort+'/json').then(r=>r.json());
      endpoint=tabs.find(tab=>tab.type==='page'&&tab.url.includes('__ai_style_smoke__'))?.webSocketDebuggerUrl;
      if(endpoint)break;
    }catch{}
    await sleep(100);
  }
  if(!endpoint)throw Error('Cannot locate Suggested Styles smoke tab');
  socket=new WebSocket(endpoint);
  await new Promise((resolve,reject)=>{
    socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});
  });
  let seq=0;const pending=new Map();
  socket.addEventListener('message',event=>{
    const message=JSON.parse(String(event.data)),call=pending.get(message.id);
    if(!call)return;pending.delete(message.id);clearTimeout(call.timer);
    message.error?call.reject(Error(JSON.stringify(message.error))):call.resolve(message.result);
  });
  const cdp=(method,params,timeout=240000)=>new Promise((resolve,reject)=>{
    const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'));},timeout);
    pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
  });
  await cdp('Runtime.enable',{});await sleep(500);
  const code=`(async()=>{
    const [{inferStyleEmbeddings,releaseStyleRecommender},{recommendStyleRgb}]=await Promise.all([
      import('http://127.0.0.1:${port}/src/recommend/style-inference.js'),
      import('http://127.0.0.1:${port}/src/recommend/style-runtime.js'),
    ]);
    const width=96,height=64,rgb=new Uint8Array(width*height*3);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const p=(y*width+x)*3;rgb[p]=x*255/(width-1);rgb[p+1]=y*255/(height-1);rgb[p+2]=(x+y)%256;
    }
    const started=performance.now();
    const embeddings=await inferStyleEmbeddings({width,height,data:rgb},{level:'${level}',provider:'${provider}',timeoutMs:220000});
    const ms=Math.round(performance.now()-started);
    const norms=embeddings.map(v=>Math.sqrt(v.reduce((s,n)=>s+n*n,0)));
    const head=Array.from(embeddings[0].slice(0,8));
    const recommendation=await recommendStyleRgb({width,height,data:rgb.slice()},{level:'${level}',provider:'${provider}'});
    releaseStyleRecommender();
    let display=null;
    if(${Boolean(heicPath)}){
      const [{renderSuggestedStyleDisplay},{discoverHeic,extractItem}]=await Promise.all([
        import('http://127.0.0.1:${port}/src/recommend/style-display-heic.js'),
        import('http://127.0.0.1:${port}/src/core/heif.js'),
      ]);
      const input=new Uint8Array(await fetch('http://127.0.0.1:${port}/__style_display_input__').then(r=>r.arrayBuffer()));
      const before=discoverHeic(input),dramatic={styleId:11,tone:-.75,color:.2,palette:.99,confidence:.9,level:'standard'};
      const rendered=await renderSuggestedStyleDisplay(input,dramatic);
      const after=discoverHeic(rendered.data);let changed=0,unchanged=0;
      for(const [id,item] of before.iloc.items){
        if(item.constructionMethod!==0||!item.extents.length)continue;
        const a=extractItem(input,before.iloc,id),b=extractItem(rendered.data,after.iloc,id);
        let same=a.length===b.length;if(same)for(let i=0;i<a.length;i++)if(a[i]!==b[i]){same=false;break;}
        same?unchanged++:changed++;
      }
      const beforeHdr=[...new Set([...before.hdrTiles,...(before.hdrGrid!==null?[before.hdrGrid]:[])])];
      const afterHdr=[...new Set([...after.hdrTiles,...(after.hdrGrid!==null?[after.hdrGrid]:[])])];
      let hdrUnchanged=0;
      beforeHdr.forEach((id,index)=>{
        const a=extractItem(input,before.iloc,id),b=extractItem(rendered.data,after.iloc,afterHdr[index]);
        let same=a.length===b.length;if(same)for(let i=0;i<a.length;i++)if(a[i]!==b[i]){same=false;break;}
        if(same)hdrUnchanged++;
      });
      display={rendered:rendered.rendered,primaryTiles:before.primaryTiles.length,hdrItems:beforeHdr.length,
        hdrUnchanged,changed,unchanged,bytes:[input.length,rendered.data.length]};
    }
    return {provider:'${provider}',level:'${level}',views:embeddings.length,dimensions:embeddings[0].length,norms,head,ms,
      recommendation,display,webgpu:Boolean(navigator.gpu)};
  })()`;
  const result=await cdp('Runtime.evaluate',{expression:code,awaitPromise:true,returnByValue:true},heicPath?600000:260000);
  if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));
  const value=result.result?.value;
  if(!value||value.dimensions!==512||value.views!==({lite:1,standard:5,pro:9})[level]
    ||value.norms.some(norm=>Math.abs(norm-1)>1e-3)||value.head.some(v=>!Number.isFinite(v))
    ||!Number.isInteger(value.recommendation?.styleId)||value.recommendation.styleId<1||value.recommendation.styleId>16
    ||![value.recommendation.tone,value.recommendation.color,value.recommendation.palette,value.recommendation.confidence].every(Number.isFinite)
    ||(heicPath&&(!value.display?.rendered||value.display.changed<value.display.primaryTiles
      ||value.display.hdrUnchanged!==value.display.hdrItems)))
    throw Error('Invalid browser TinyCLIP/recommender result: '+JSON.stringify(value));
  console.log('SUGGESTED STYLES BROWSER INFERENCE PASS '+JSON.stringify(value));
}finally{
  try{socket?.close();}catch{}
  child.kill();await new Promise(resolve=>server.close(resolve));
  try{await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:250});}catch{}
}
