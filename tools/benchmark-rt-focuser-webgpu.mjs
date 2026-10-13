import {createServer} from 'node:http';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve,relative,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../web/',import.meta.url));
const modelFile=process.argv.find(arg=>arg.startsWith('--file='))?.slice('--file='.length)||'rt-focuser-candidate.onnx';
const browser=['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(existsSync);
if(!browser)throw Error('Edge/Chrome not installed');
const types={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.mjs':'text/javascript;charset=utf-8','.wasm':'application/wasm','.onnx':'application/octet-stream','.json':'application/json'};
const headers={'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'cross-origin','Access-Control-Allow-Origin':'*','Cache-Control':'no-store'};
const server=createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/__bench__'){res.writeHead(200,{...headers,'Content-Type':'text/html'});res.end('<title>RT-Focuser bench</title>');return;}
 const full=resolve(root,'.'+decodeURIComponent(pathname)),rel=relative(root,full);
 if(rel.startsWith('..')||rel.startsWith(sep)||rel===''){res.writeHead(404,headers);res.end();return;}
 try{const data=await readFile(full);res.writeHead(200,{...headers,'Content-Type':types[extname(full)]||'application/octet-stream'});res.end(data);}catch{res.writeHead(404,headers);res.end();}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const port=server.address().port;
const profile=await mkdtemp(join(tmpdir(),'rt-focuser-bench-'));
const child=spawn(browser,['--headless=new','--remote-debugging-port=0','--remote-allow-origins=*','--no-first-run','--disable-extensions','--disable-background-networking','--enable-unsafe-webgpu','--user-data-dir='+profile,'http://127.0.0.1:'+port+'/__bench__'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let socket;
try{
 let debugPort;for(let i=0;i<300;i++){try{debugPort=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split(/\r?\n/)[0]);if(debugPort)break;}catch{}await sleep(100);}
 let endpoint;for(let i=0;i<100;i++){try{const tabs=await fetch('http://127.0.0.1:'+debugPort+'/json').then(r=>r.json());endpoint=tabs.find(x=>x.type==='page')?.webSocketDebuggerUrl;if(endpoint)break;}catch{}await sleep(100);}
 socket=new WebSocket(endpoint);await new Promise((ok,no)=>{socket.addEventListener('open',ok,{once:true});socket.addEventListener('error',no,{once:true});});
 let seq=0;const pending=new Map();
 socket.addEventListener('message',event=>{const m=JSON.parse(String(event.data));if(!m.id)return;const c=pending.get(m.id);if(!c)return;pending.delete(m.id);clearTimeout(c.timer);m.error?c.reject(Error(JSON.stringify(m.error))):c.resolve(m.result);});
 const cdp=(method,params={},timeout=900000)=>new Promise((ok,no)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);no(Error(method+' timeout'));},timeout);pending.set(id,{resolve:ok,reject:no,timer});socket.send(JSON.stringify({id,method,params}));});
 await cdp('Runtime.enable');await cdp('Page.enable');await sleep(700);
 const code='(async()=>{'+
  'const ort=await import("http://127.0.0.1:'+port+'/vendor/ai-portrait/ort.webgpu.min.mjs");'+
  'ort.env.wasm.wasmPaths="http://127.0.0.1:'+port+'/vendor/ai-portrait/";'+
  'const bytes=new Uint8Array(await fetch("http://127.0.0.1:'+port+'/vendor/ai-detail/'+modelFile+'").then(r=>r.arrayBuffer()));'+
  'const createStart=performance.now();const session=await ort.InferenceSession.create(bytes,{executionProviders:["webgpu"]});const createMs=Math.round(performance.now()-createStart);const rows=[];'+
  'for(const size of [256,384,512]){const plane=size*size,values=new Float32Array(3*plane);for(let i=0;i<plane;i++){values[i]=(i%size)/(size-1);values[plane+i]=(Math.floor(i/size))/(size-1);values[2*plane+i]=.5;}const times=[];let diff=0;for(let round=0;round<3;round++){const tensor=new ort.Tensor("float32",values,[1,3,size,size]),start=performance.now();const out=await session.run({input:tensor});const data=await out.output.getData();times.push(performance.now()-start);if(round===2){for(let i=0;i<data.length;i+=Math.max(1,Math.floor(data.length/10000)))diff+=Math.abs(data[i]-values[i]);}out.output.dispose?.();tensor.dispose?.();}rows.push({size,ms:Math.round(times.slice(1).reduce((a,b)=>a+b,0)/2),warmupMs:Math.round(times[0]),sampleDiff:Number(diff.toFixed(3))});}'+
  'await session.release();return {createMs,rows};})()';
 const out=await cdp('Runtime.evaluate',{expression:code,awaitPromise:true,returnByValue:true},900000);
 if(out.exceptionDetails)throw Error(JSON.stringify(out.exceptionDetails));
 console.log(JSON.stringify(out.result.value,null,2));
}finally{try{socket?.close();}catch{}child.kill();await new Promise(r=>server.close(r));try{await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:250});}catch{}}
