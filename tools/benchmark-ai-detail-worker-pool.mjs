import {createServer} from 'node:http';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve,relative,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../web/',import.meta.url));
const browser=['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(existsSync);
if(!browser)throw Error('Edge/Chrome not installed');
const types={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.mjs':'text/javascript;charset=utf-8','.wasm':'application/wasm','.onnx':'application/octet-stream','.json':'application/json'};
const headers={'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'cross-origin','Access-Control-Allow-Origin':'*','Cache-Control':'no-store'};
const server=createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/__bench__'){res.writeHead(200,{...headers,'Content-Type':'text/html'});res.end('<title>Detail Worker Pool Bench</title>');return;}
 const full=resolve(root,'.'+decodeURIComponent(path)),rel=relative(root,full);
 if(rel.startsWith('..')||rel.startsWith(sep)||rel===''){res.writeHead(404,headers);res.end();return;}
 try{const data=await readFile(full);res.writeHead(200,{...headers,'Content-Type':types[extname(full)]||'application/octet-stream'});res.end(data);}catch{res.writeHead(404,headers);res.end();}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const port=server.address().port,base='http://127.0.0.1:'+port;
const profile=await mkdtemp(join(tmpdir(),'detail-worker-pool-bench-'));
const child=spawn(browser,['--headless=new','--remote-debugging-port=0','--remote-allow-origins=*','--no-first-run','--disable-extensions','--disable-background-networking','--enable-unsafe-webgpu','--user-data-dir='+profile,base+'/__bench__'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let socket;
try{
 let debugPort;for(let i=0;i<300;i++){try{debugPort=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split(/\r?\n/)[0]);if(debugPort)break;}catch{}await sleep(100);}
 let endpoint;for(let i=0;i<100;i++){try{const tabs=await fetch('http://127.0.0.1:'+debugPort+'/json').then(r=>r.json());endpoint=tabs.find(x=>x.type==='page')?.webSocketDebuggerUrl;if(endpoint)break;}catch{}await sleep(100);}
 socket=new WebSocket(endpoint);await new Promise((ok,no)=>{socket.addEventListener('open',ok,{once:true});socket.addEventListener('error',no,{once:true});});
 let seq=0;const pending=new Map();
 socket.addEventListener('message',e=>{const m=JSON.parse(String(e.data));if(!m.id)return;const c=pending.get(m.id);if(!c)return;pending.delete(m.id);clearTimeout(c.timer);m.error?c.reject(Error(JSON.stringify(m.error))):c.resolve(m.result);});
 const cdp=(method,params={},timeout=900000)=>new Promise((ok,no)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);no(Error(method+' timeout'));},timeout);pending.set(id,{resolve:ok,reject:no,timer});socket.send(JSON.stringify({id,method,params}));});
 await cdp('Runtime.enable');await cdp('Page.enable');await sleep(700);
 const cfg={base};
 const code='(async cfg=>{'
  +"const rows=[];"
  +"const run=(modelId,width,height)=>new Promise((resolve,reject)=>{"
  +" const rgba=new Uint8ClampedArray(width*height*4);for(let i=0;i<width*height;i++){rgba[4*i]=i%255;rgba[4*i+1]=(i>>8)%255;rgba[4*i+2]=127;rgba[4*i+3]=255;}"
  +" const worker=new Worker(cfg.base+'/src/detail/detail-worker.js',{type:'module'});"
  +" worker.onerror=e=>{worker.terminate();reject(Error(e.message||'worker error'));};"
  +" worker.onmessage=e=>{if(e.data.error){worker.terminate();reject(Error(e.data.error));}else if(e.data.result){worker.terminate();resolve();}};"
  +" worker.postMessage({modelId,provider:'webgpu',width,height,rgba,assetRoot:cfg.base+'/vendor/ai-detail/'},[rgba.buffer]);"
  +"});"
  +"for(const modelId of ['lite','standard','pro']){"
  +" for(const concurrency of [1,2]){"
  +"  const start=performance.now();"
  +"  if(concurrency===1)await run(modelId,768,768);else await Promise.all([run(modelId,768,384),run(modelId,768,384)]);"
  +"  const wall=performance.now()-start;rows.push({modelId,concurrency,wallMs:Math.round(wall)});"
  +" }"
  +"}return rows;"
  +'})('+JSON.stringify(cfg)+')';
 const out=await cdp('Runtime.evaluate',{expression:code,awaitPromise:true,returnByValue:true},900000);
 if(out.exceptionDetails)throw Error(JSON.stringify(out.exceptionDetails));
 console.log(JSON.stringify(out.result.value,null,2));
}finally{try{socket?.close();}catch{}child.kill();await new Promise(r=>server.close(r));try{await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:250});}catch{}}
