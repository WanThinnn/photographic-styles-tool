/**
 * Real browser smoke test for local AI Detail models, via Edge/Chrome headless CDP.
 * Serves the workspace web/ on localhost with cross-origin isolation headers.
 * No third-party model requests or uploaded photos. All binaries stay local.
 *
 * node tools/smoke-ai-detail-browser.mjs
 */
import {createServer} from 'node:http';
import {readFile, mkdtemp, rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join, resolve, relative, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../web/',import.meta.url));
const provider=process.argv.includes('--webgpu')?'webgpu':'wasm';
const requested=process.argv.find(arg=>arg.startsWith('--models='))?.slice('--models='.length);
const modelIds=requested?requested.split(','):['lite'];
const sampleSize=Number(process.argv.find(arg=>arg.startsWith('--size='))?.slice('--size='.length)||24);
const repeat=Number(process.argv.find(arg=>arg.startsWith('--repeat='))?.slice('--repeat='.length)||1);
const workerCountArg=process.argv.find(arg=>arg.startsWith('--workers='));
const workerCount=workerCountArg?Number(workerCountArg.slice('--workers='.length)):null;
if(!Number.isInteger(sampleSize)||sampleSize<8||sampleSize>2048)throw Error('Invalid --size');
if(!Number.isInteger(repeat)||repeat<1||repeat>5)throw Error('Invalid --repeat');
const browserCandidates=[
 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];
const browser=browserCandidates.find(path=>existsSync(path));
if(!browser)throw Error('Neither Edge nor Chrome is installed');
const types={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.mjs':'text/javascript;charset=utf-8',
 '.wasm':'application/wasm','.onnx':'application/octet-stream','.json':'application/json'};
const server=createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 const headers={
  'Cross-Origin-Opener-Policy':'same-origin',
  'Cross-Origin-Embedder-Policy':'require-corp',
  'Access-Control-Allow-Origin':'*',
  'Cache-Control':'no-store',
 };
 if(path==='/__ai_detail_smoke__'){
  res.writeHead(200,{...headers,'Content-Type':'text/html;charset=utf-8'});
  res.end('<!doctype html><html><head><title>AI Detail Browser Smoke</title></head><body>Smoke test</body></html>');
  return;
 }
 const full=resolve(root,'.'+decodeURIComponent(path));
 const rel=relative(root,full);
 if(rel.startsWith('..')||rel.startsWith(sep)||rel===''){
  res.writeHead(404,headers);res.end('Not found');return;
 }
 try{
  const file=await readFile(full);
  res.writeHead(200,{...headers,'Content-Type':types[extname(full)]||'application/octet-stream'});
  res.end(file);
 }catch{res.writeHead(404,headers);res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
const dir=await mkdtemp(join(tmpdir(),'detail-browser-'));
const child=spawn(browser,['--headless=new','--remote-debugging-port=0','--remote-allow-origins=*',
 '--no-first-run','--disable-extensions','--disable-background-networking',
 ...(provider==='wasm'?['--disable-gpu']:['--enable-unsafe-webgpu']),
 '--user-data-dir='+dir,'http://127.0.0.1:'+port+'/__ai_detail_smoke__'],{stdio:'ignore'});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let socket;
try{
 let debugPort,endpoint;
 for(let i=0;i<200;i++){
  try{
   const text=await readFile(join(dir,'DevToolsActivePort'),'utf8');
   debugPort=Number(text.split(/\r?\n/)[0]);
   if(Number.isInteger(debugPort))break;
  }catch{}
  if(child.exitCode!==null)throw Error('Headless browser exited: '+child.exitCode);
  await sleep(100);
 }
 if(!debugPort)throw Error('Headless CDP debug port unavailable');
 for(let i=0;i<50;i++){
  try{
   const tabs=await fetch('http://127.0.0.1:'+debugPort+'/json').then(r=>r.json());
   endpoint=tabs.find(tab=>tab.type==='page'&&tab.url.includes('__ai_detail_smoke__'))?.webSocketDebuggerUrl;
   if(endpoint)break;
  }catch{}
  await sleep(100);
 }
 if(!endpoint)throw Error('Cannot locate headless smoke test tab');
 socket=new WebSocket(endpoint);
 await new Promise((resolve,reject)=>{
  socket.addEventListener('open',resolve,{once:true});
  socket.addEventListener('error',reject,{once:true});
 });
 let seq=0;
 const pending=new Map();
 socket.addEventListener('message',event=>{
  const message=JSON.parse(String(event.data));
  if(!message.id)return;
  const call=pending.get(message.id);
  if(!call)return;
  pending.delete(message.id);clearTimeout(call.timer);
  message.error?call.reject(Error(JSON.stringify(message.error))):call.resolve(message.result);
 });
 const cdp=(method,params,timeout=150000)=>new Promise((resolve,reject)=>{
  const id=++seq;
  const timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'));},timeout);
  pending.set(id,{resolve,reject,timer});
  socket.send(JSON.stringify({id,method,params}));
 });
 await cdp('Runtime.enable',{});
 await cdp('Page.enable',{});
 await sleep(1000);
 for(const modelId of modelIds){
  console.log('Testing '+modelId+' in Edge/Chrome ONNX Runtime Web / '+provider+'...',);
  const code=`(async()=>{
   const {inferDetailTiles}=await import('http://127.0.0.1:${port}/src/detail/detail-inference.js');
   const width=${sampleSize},height=${sampleSize},rgba=new Uint8ClampedArray(width*height*4);
   for(let i=0;i<width*height;i++){
    rgba[4*i]=i%255;rgba[4*i+1]=Math.floor(i/width)%255;rgba[4*i+2]=125;rgba[4*i+3]=255;
   }
   const times=[];let result;
   for(let pass=0;pass<${repeat};pass++){
    const started=performance.now();
    result=await inferDetailTiles({width,height,data:rgba},{modelId:'${modelId}',provider:'${provider}',timeoutMs:180000${workerCount!==null?`,workerCount:${workerCount}`:''}});
    times.push(Math.round(performance.now()-started));
   }
   if(result.width!==width||result.height!==height||result.data.length!==rgba.length)throw Error('Bad model output shape');
   let sum=0;
   for(let i=0;i<rgba.length;i+=4)sum+=Math.abs(rgba[i]-result.data[i]);
   return {modelId:'${modelId}',ms:times[0],passes:times,pixelDifference:sum/width/height};
  })()`;
  const result=await cdp('Runtime.evaluate',{expression:code,awaitPromise:true,returnByValue:true},230000);
  if(result.exceptionDetails)throw Error(modelId+': '+JSON.stringify(result.exceptionDetails));
  const value=result.result?.value;
  if(!value||!Number.isFinite(value.pixelDifference)||value.pixelDifference===0)throw Error(modelId+': invalid or identity result '+JSON.stringify(value));
  console.log(modelId+': PASS '+JSON.stringify(value));
 }
 console.log('ALL REQUESTED MODELS PASSED BROWSER WORKER INFERENCE');
}finally{
 try{socket?.close();}catch{}
 child.kill();
 await new Promise(resolve=>server.close(resolve));
 try{await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:250});}catch{}
}
