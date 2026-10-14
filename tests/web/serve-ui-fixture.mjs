// Local-only visual harness. Never included in web/ or release/offline assets.
// rtk proxy node tests/web/serve-ui-fixture.mjs
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const web=fileURLToPath(new URL('../../web/',import.meta.url));
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://127.0.0.1');
    if(url.pathname==='/__ui-test__/'){
      const html=(await readFile(resolve(web,'index.html'),'utf8'))
        .replace('<head>','<head><base href="/">')
        .replace('src="src/ui/page-bootstrap.js"','src="/__ui-test__/entry.js"');
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);return;
    }
    const file=url.pathname==='/__ui-test__/entry.js'
      ?fileURLToPath(new URL('./fixtures/mobile-shell.js',import.meta.url))
      :resolve(web,'.'+decodeURIComponent(url.pathname));
    if(!file.startsWith(resolve(web)+sep)&&url.pathname!=='/__ui-test__/entry.js')throw Error('outside web');
    if(url.pathname.startsWith('/vendor/'))throw Error('No models in UI harness');
    const data=await readFile(file);
    res.writeHead(200,{'Content-Type':(types[extname(file)]||'application/octet-stream')+'; charset=utf-8','Cache-Control':'no-store'});res.end(data);
  }catch{res.writeHead(404);res.end('Not found');}
}).listen(8007,'127.0.0.1',()=>console.log('UI-only fixture: http://127.0.0.1:8007/__ui-test__/'));
