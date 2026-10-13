/**
 * End-to-end native HDR HEIC AI Detail smoke test in installed Edge.
 * Reads one private local fixture through localhost, runs the real browser
 * WebGPU + FFmpeg.wasm path, and asserts unrelated HEIF payloads stay exact.
 *
 * node tools/smoke-ai-detail-native-hdr.mjs
 */
import {createServer} from 'node:http';
import {readFile,mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve,relative,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const fixture=process.argv.find(arg=>arg.endsWith('.HEIC'))||'tests/private-fixtures/HDR_Edit_Isolation_V21/A_V20_Control_AllFeatures_NoAIDepth.HEIC';
const saveArg=process.argv.find(arg=>arg.startsWith('--save='))?.slice(7)||null;
const saveFull=saveArg?resolve(root,saveArg):null;
if(saveFull){const allowed=resolve(root,'tests/private-fixtures')+sep;if(!saveFull.startsWith(allowed))throw Error('--save must stay under tests/private-fixtures');}
const browsers=[
 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];
const browser=browsers.find(existsSync);if(!browser)throw Error('Edge/Chrome not installed');
const mime={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.mjs':'text/javascript;charset=utf-8',
 '.wasm':'application/wasm','.onnx':'application/octet-stream','.json':'application/json','.heic':'image/heic'};
const headers={'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp',
 'Cross-Origin-Resource-Policy':'cross-origin','Access-Control-Allow-Origin':'*','Cache-Control':'no-store'};
const server=createServer(async(req,res)=>{
 const path=decodeURIComponent(new URL(req.url,'http://local').pathname);
 if(path==='/__save__'&&req.method==='POST'){
  if(!saveFull){res.writeHead(403,headers);res.end('save disabled');return;}
  const chunks=[];let total=0;for await(const chunk of req){total+=chunk.length;if(total>100*1024*1024){res.writeHead(413,headers);res.end();return;}chunks.push(chunk);}
  await mkdir(resolve(saveFull,'..'),{recursive:true});await writeFile(saveFull,Buffer.concat(chunks));
  res.writeHead(200,{...headers,'Content-Type':'text/plain'});res.end(String(total));return;
 }
 if(path==='/__smoke__'){res.writeHead(200,{...headers,'Content-Type':'text/html'});res.end('<title>Native HDR Detail Smoke</title>');return;}
 const full=resolve(root,'.'+path),rel=relative(root,full);
 if(rel.startsWith('..')||rel.startsWith(sep)||rel===''){res.writeHead(404,headers);res.end();return;}
 try{const data=await readFile(full);res.writeHead(200,{...headers,'Content-Type':mime[extname(full).toLowerCase()]||'application/octet-stream'});res.end(data);}
 catch{res.writeHead(404,headers);res.end();}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const port=server.address().port;
const profile=await mkdtemp(join(tmpdir(),'native-hdr-ai-'));
const child=spawn(browser,['--headless=new','--remote-debugging-port=0','--remote-allow-origins=*','--no-first-run',
 '--disable-extensions','--disable-background-networking','--enable-unsafe-webgpu','--user-data-dir='+profile,
 'http://127.0.0.1:'+port+'/__smoke__'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let socket;
try{
 let debugPort;
 for(let i=0;i<300;i++){try{debugPort=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split(/\r?\n/)[0]);if(debugPort)break;}catch{}await sleep(100);}
 if(!debugPort)throw Error('CDP port unavailable');
 let endpoint;
 for(let i=0;i<100;i++){try{const tabs=await fetch('http://127.0.0.1:'+debugPort+'/json').then(r=>r.json());
  endpoint=tabs.find(x=>x.type==='page'&&x.url.includes('__smoke__'))?.webSocketDebuggerUrl;if(endpoint)break;}catch{}await sleep(100);}
 if(!endpoint)throw Error('CDP tab unavailable');
 socket=new WebSocket(endpoint);await new Promise((ok,no)=>{socket.addEventListener('open',ok,{once:true});socket.addEventListener('error',no,{once:true});});
 let seq=0;const pending=new Map();
 socket.addEventListener('message',e=>{const m=JSON.parse(String(e.data));if(!m.id)return;const c=pending.get(m.id);if(!c)return;
  pending.delete(m.id);clearTimeout(c.timer);m.error?c.reject(Error(JSON.stringify(m.error))):c.resolve(m.result);});
 const cdp=(method,params={},timeout=1200000)=>new Promise((ok,no)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);no(Error(method+' timeout'));},timeout);
  pending.set(id,{resolve:ok,reject:no,timer});socket.send(JSON.stringify({id,method,params}));});
 await cdp('Runtime.enable');await cdp('Page.enable');await sleep(1000);
 const expression=`(async()=>{
  const [{enhanceNativeHdrHeic},{discoverHeic,extractItem}]=await Promise.all([
   import('http://127.0.0.1:${port}/web/src/detail/detail-native-heic.js'),
   import('http://127.0.0.1:${port}/web/src/core/heif.js')
  ]);
  const source=new Uint8Array(await fetch('http://127.0.0.1:${port}/${fixture}').then(r=>{if(!r.ok)throw Error('fixture '+r.status);return r.arrayBuffer();}));
  const saveEnabled=${saveFull!==null};
  const before=discoverHeic(source),started=performance.now(),events=[];
  const enhanced=await enhanceNativeHdrHeic(source,{modelId:'lite',provider:'webgpu',maxTotalMs:900000},{
   onProgress:e=>{if(e.stage&&(!events.length||events.at(-1)!==e.stage))events.push(e.stage);}
  });
  const after=discoverHeic(enhanced.data),changed=new Set(enhanced.stats.changedItems);
  if(before.primary!==after.primary||before.hdrGrid!==after.hdrGrid||before.stylesItem!==after.stylesItem||before.exifItem!==after.exifItem)
   throw Error('Core item IDs changed');
  const same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
  let preserved=0;
  for(const [iid,item] of before.iloc.items){
   if(item.constructionMethod!==0||!item.extents.length||changed.has(iid))continue;
   if(!same(extractItem(source,before.iloc,iid),extractItem(enhanced.data,after.iloc,iid)))throw Error('Unrelated payload changed: '+iid);
   preserved++;
  }
  if(!before.primaryTiles.some(id=>changed.has(id))||!before.hdrTiles.some(id=>changed.has(id)))throw Error('Primary/gain payloads were not replaced');
  const itemData=(bytes,d,id)=>{
   const item=d.iloc.items.get(id);if(item.constructionMethod===0)return extractItem(bytes,d.iloc,id);
   const meta=d.meta,children=[];let p=meta.off+meta.hdr+4;
   while(p<meta.off+meta.size){const view=new DataView(bytes.buffer,bytes.byteOffset+p,4),size=view.getUint32(0),type=String.fromCharCode(...bytes.slice(p+4,p+8));children.push({off:p,size,hdr:8,type});p+=size;}
   const idat=children.find(x=>x.type==='idat'),parts=item.extents.map(e=>bytes.slice(idat.off+idat.hdr+item.baseOffset+e.offset,idat.off+idat.hdr+item.baseOffset+e.offset+e.length));
   const out=new Uint8Array(parts.reduce((n,x)=>n+x.length,0));let o=0;for(const part of parts){out.set(part,o);o+=part.length;}return out;
  };
  const tmap=[...before.infos].find(([id,info])=>info.type==='tmap'&&before.refs.some(r=>r.type==='dimg'&&r.from===id&&r.to[0]===before.primary))?.[0];
  if(tmap==null)throw Error('tmap missing');
  if(!same(itemData(source,before,tmap),itemData(enhanced.data,after,tmap)))throw Error('tmap metadata changed');
  if(before.stylesItem!==null&&!same(itemData(source,before,before.stylesItem),itemData(enhanced.data,after,after.stylesItem)))throw Error('Styles payload changed');
  if(saveEnabled){const saved=await fetch('http://127.0.0.1:${port}/__save__',{method:'POST',body:enhanced.data});if(!saved.ok)throw Error('Save failed '+saved.status);}
  return {inputBytes:source.length,outputBytes:enhanced.data.length,ms:Math.round(performance.now()-started),
   changedItems:enhanced.stats.changedItems.length,preserved,clipped:enhanced.stats.clipped,
   components:enhanced.stats.components,maxError:enhanced.stats.maxError,events};
 })()`;
 console.log('Running full native HDR AI smoke on '+fixture+' ...');
 const result=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},1200000);
 if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));
 const value=result.result?.value;if(!value)throw Error('No smoke result');
 console.log('PASS '+JSON.stringify(value,null,2));if(saveArg)console.log('Saved '+saveArg);
}finally{
 try{socket?.close();}catch{}child.kill();await new Promise(r=>server.close(r));try{await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:300});}catch{}
}
