import {createServer} from 'node:http';
// Optional real-browser UI checks. Requires Playwright + Chrome/Chromium.
// node tools/smoke-mobile-shell.mjs
// STYLIO_PLAYWRIGHT_MODULE and STYLIO_BROWSER_EXECUTABLE may point to local installs.
// Serves only localhost; blocks every external request. No image processing.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.STYLIO_PLAYWRIGHT_MODULE||'playwright');
const executablePath=process.env.STYLIO_BROWSER_EXECUTABLE||[
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
const repo=fileURLToPath(new URL('../',import.meta.url)),root=resolve(repo,'web'),out=resolve(repo,'artifact/mobile-review');await mkdir(out,{recursive:true});
const deviceScaleFactor=Number(process.env.STYLIO_DEVICE_SCALE_FACTOR||1);
if(!Number.isFinite(deviceScaleFactor)||deviceScaleFactor<1||deviceScaleFactor>4)throw Error('Invalid STYLIO_DEVICE_SCALE_FACTOR');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.webmanifest':'application/manifest+json','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost'),preview=url.pathname==='/preview',launch=url.pathname==='/launch';
    const path=url.pathname.startsWith('/tests/')?resolve(repo,'.'+url.pathname):resolve(root,'.'+(preview||launch||url.pathname==='/'?'/index.html':url.pathname));
    if(!path.startsWith(root)&&!path.startsWith(resolve(repo,'tests/web/fixtures')))throw Error('bad path');
    let body=await readFile(path);
    if(preview||launch){let html=body.toString();html=html.replace('src="src/ui/page-bootstrap.js"',preview?'src="/tests/web/fixtures/mobile-shell.js"':'src="/empty.js"');body=html;}
    res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin','Cache-Control':'no-store'});res.end(body);
  }catch{res.writeHead(404);res.end('not found');}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
const results=[];
try{
  browser=await chromium.launch({headless:true,executablePath});
  for(const mode of [{os:'dark',saved:'system',dark:true},{os:'light',saved:'system',dark:false},{os:'light',saved:'dark',dark:true},{os:'dark',saved:'light',dark:false}]){
    const context=await browser.newContext({viewport:{width:390,height:844},colorScheme:mode.os,serviceWorkers:'block'});
    await context.route('**/*',route=>{
      const u=route.request().url();
      if(!u.startsWith(origin)||u.endsWith('/styles.css'))return route.abort();
      if(u.endsWith('/empty.js'))return route.fulfill({contentType:'text/javascript',body:''});
      return route.continue();
    });
    await context.addInitScript(saved=>localStorage.setItem('stylio-theme-v1',saved),mode.saved);
    const page=await context.newPage();await page.goto(origin+'/launch',{waitUntil:'domcontentloaded'});
    const fill=await page.locator('.launch-icon-background').evaluate(el=>getComputedStyle(el).fill);
    assert.equal(fill.includes('launch-dark'),mode.dark,JSON.stringify(mode));
    assert.equal(await page.locator('#app-launch').isVisible(),true);
    if(mode.saved==='system')await page.screenshot({path:out+`/loading-${mode.os}.png`});
    await page.emulateMedia({colorScheme:mode.os==='dark'?'light':'dark'});
    const changedFill=await page.locator('.launch-icon-background').evaluate(el=>getComputedStyle(el).fill);
    assert.equal(changedFill.includes('launch-dark'),mode.saved==='system'?!mode.dark:mode.dark);
    results.push({type:'critical-loading',...mode,fill});await context.close();
  }
  const context=await browser.newContext({viewport:{width:402,height:874},serviceWorkers:'block',deviceScaleFactor,hasTouch:true});
  await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  // Deliberately stale JS viewport values must not govern the resting dock.
  await page.addInitScript(()=>{Object.defineProperty(window,'innerHeight',{get:()=>756,configurable:true});Object.defineProperty(navigator,'standalone',{get:()=>true});});
  for(const [width,height] of [[320,568],[390,844],[402,874],[430,932],[844,390],[768,1024],[1280,800]]){
    await page.setViewportSize({width,height});
    for(const theme of ['light','dark']){
      await page.goto(origin+`/preview?theme=${theme}&lang=en`,{waitUntil:'networkidle'});
      await page.locator('#app-styles').evaluate(el=>el.media='all');
      await page.locator('.fixture-tools').evaluate(el=>el.hidden=true);await page.locator('#boot').evaluate(el=>el.hidden=true);
      const geometry=await page.evaluate(()=>{
        const rect=document.querySelector('.app-dock').getBoundingClientRect(),chrome=document.getElementById('app-chrome').getBoundingClientRect();
        return {bottom:rect.bottom,chromeBottom:chrome.bottom,left:rect.left,right:rect.right,width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,headerBottom:document.querySelector('.top').getBoundingClientRect().bottom,titleTop:document.querySelector('.intro').getBoundingClientRect().top};
      });
      assert.ok(Math.abs(geometry.bottom-(height-10))<1,JSON.stringify({width,height,theme,geometry}));
      assert.ok(geometry.left>=0&&geometry.right<=width);assert.ok(geometry.scrollWidth<=width);
      assert.ok(geometry.titleTop>=geometry.headerBottom-1);
      await page.evaluate(()=>{dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));dispatchEvent(new Event('resize'));dispatchEvent(new Event('orientationchange'));});
      assert.ok(Math.abs((await page.locator('.app-dock').boundingBox()).y+(await page.locator('.app-dock').boundingBox()).height-(height-10))<1);
      if(width===402)await page.screenshot({path:out+`/process-${theme}.png`});
      results.push({type:'dock',width,height,theme,...geometry});
    }
  }
  await page.setViewportSize({width:402,height:874});
  await page.goto(origin+'/preview?theme=light&lang=vi',{waitUntil:'networkidle'});await page.locator('#app-styles').evaluate(el=>el.media='all');
  await page.locator('.fixture-tools').evaluate(el=>el.hidden=true);await page.locator('#boot').evaluate(el=>el.hidden=true);
  await page.locator('[data-screen="settings"]').click();await page.evaluate(()=>scrollTo(0,300));
  const before=await page.locator('.app-dock').boundingBox();
  await page.locator('[data-screen="process"]').click();const after=await page.locator('.app-dock').boundingBox();
  assert.equal(before.y,after.y);assert.equal(await page.evaluate(()=>scrollY),0);
  const tabGeometry=[];
  for(const name of ['settings','process','history','guide','settings']){
    await page.locator(`[data-screen="${name}"]`).click();await page.waitForTimeout(600);
    const measured=await page.evaluate(()=>{
      const nav=document.querySelector('.app-tabs'),bar=nav.getBoundingClientRect();
      const outer=getComputedStyle(nav),lens=getComputedStyle(nav,'::before');
      const x=new DOMMatrix(lens.transform).m41;
      const lensWidth=parseFloat(lens.width)+(lens.boxSizing==='border-box'?0:parseFloat(lens.borderLeftWidth)+parseFloat(lens.borderRightWidth));
      const topGap=parseFloat(outer.borderTopWidth)+parseFloat(lens.top);
      const endGap=bar.width-(parseFloat(outer.borderLeftWidth)+parseFloat(lens.left)+x+lensWidth);
      return {height:document.scrollingElement.scrollHeight,viewport:document.documentElement.clientHeight,
        scrollY,topGap,endGap,dockBottom:document.querySelector('.app-dock').getBoundingClientRect().bottom,
        lensWidth:lens.width,lensHeight:lens.height,barWidth:bar.width,barHeight:bar.height,transform:lens.transform};
    });
    tabGeometry.push({name,...measured});
  }
  assert.ok(tabGeometry.every(item=>item.height>item.viewport),'every standalone tab needs the same scrollable root state');
  for(const item of tabGeometry.filter(item=>item.name==='settings'))assert.ok(Math.abs(item.topGap-item.endGap)<.25,'selected end lens must be concentric: '+JSON.stringify(item));
  results.push({type:'short-long-tab-geometry',tabs:tabGeometry});
  await page.locator('#toggle-search').click();await page.locator('#history-search').fill('photo');
  await page.evaluate(()=>{
    const vv=window.visualViewport;Object.defineProperty(vv,'height',{get:()=>510,configurable:true});Object.defineProperty(vv,'offsetTop',{get:()=>0,configurable:true});vv.dispatchEvent(new Event('resize'));
  });
  await page.waitForFunction(()=>document.getElementById('app-chrome').style.getPropertyValue('--dock-keyboard-offset')==='364px');
  assert.ok(Math.abs((await page.locator('.app-dock').boundingBox()).y+(await page.locator('.app-dock').boundingBox()).height-500)<1);
  await page.locator('#toggle-search').click();assert.equal(await page.locator('#app-chrome').evaluate(el=>el.style.getPropertyValue('--dock-keyboard-offset')),'');
  await page.locator('[data-screen="settings"]').click();await page.evaluate(()=>scrollTo(0,0));
  await page.waitForFunction(()=>!document.querySelector('.app-tabs').classList.contains('is-releasing'));
  await page.screenshot({path:out+'/settings-vi.png'});
  assert.deepEqual(errors,[]);results.push({type:'navigation-search',errors});await context.close();

  // Exercise production bootstrap too: an install guide must own focus in Safari,
  // and native modal presentation must work with chrome now outside <main>.
  const appContext=await browser.newContext({viewport:{width:402,height:874},serviceWorkers:'block',
    userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 Version/27.0 Mobile/15E148 Safari/604.1'});
  await appContext.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  const appPage=await appContext.newPage(),appErrors=[];appPage.on('pageerror',error=>appErrors.push(error.message));
  await appPage.goto(origin+'/',{waitUntil:'domcontentloaded'});
  await appPage.waitForFunction(()=>document.getElementById('app-launch').hidden&&!document.getElementById('file').disabled);
  assert.equal(await appPage.locator('#app-chrome').evaluate(el=>el.inert),true);
  await appPage.locator('#install-guide-continue').click();await appPage.waitForFunction(()=>!document.getElementById('app-chrome').inert);
  await appPage.locator('#ios-format-tip button').click();
  for(const theme of ['light','dark']){
    await appPage.locator('[data-screen="settings"]').click();
    await appPage.locator(`[data-theme-value="${theme}"]`).click();
    await appPage.locator('[data-screen="process"]').click();
    await appPage.waitForTimeout(600);
    await appPage.screenshot({path:out+`/process-${theme}.png`});
  }
  await appPage.locator('#open-ai-settings').click();
  assert.equal(await appPage.locator('#ai-settings').evaluate(el=>el.open),true);
  await appPage.keyboard.press('Escape');await appPage.waitForFunction(()=>!document.getElementById('ai-settings').open);
  assert.deepEqual(appErrors,[]);results.push({type:'production-bootstrap',errors:appErrors});await appContext.close();
  await writeFile(out+'/report.json',JSON.stringify({passed:results.length,deviceScaleFactor,results},null,2));
  console.log(`Passed ${results.length} browser checks; screenshots/report: ${out}`);
}finally{await browser?.close();await new Promise(done=>server.close(done));}
