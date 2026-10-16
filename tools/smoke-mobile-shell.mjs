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
const repo=fileURLToPath(new URL('../',import.meta.url)),root=resolve(repo,'web'),out=resolve(process.env.STYLIO_UI_ARTIFACT_DIR||resolve(repo,'artifact/mobile-review'));await mkdir(out,{recursive:true});
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
const readCornerPair=async(page,outerSelector,innerSelector)=>page.evaluate(({outerSelector,innerSelector})=>{
  const outer=document.querySelector(outerSelector),inner=document.querySelector(innerSelector);
  const a=outer.getBoundingClientRect(),b=inner.getBoundingClientRect();
  const radius=(el,box)=>Math.min(parseFloat(getComputedStyle(el).borderBottomRightRadius),box.width/2,box.height/2);
  return {outer:radius(outer,a),inner:radius(inner,b),gap:a.right-b.right};
},{outerSelector,innerSelector});
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
    const beforeCSS=await page.evaluate(()=>{
      const size=selector=>{const el=document.querySelector(selector),box=el.getBoundingClientRect();return {width:el.offsetWidth??box.width,height:el.offsetHeight??box.height};};
      return {mark:size('.launch-mark'),spinner:size('.launch-spinner')};
    });
    await page.evaluate(()=>new Promise((resolve,reject)=>{
      const link=document.createElement('link');link.rel='stylesheet';link.href='/styles.css?launch-stability';
      link.onload=resolve;link.onerror=reject;document.head.append(link);
    }));
    const afterCSS=await page.evaluate(()=>{
      const size=selector=>{const el=document.querySelector(selector),box=el.getBoundingClientRect();return {width:el.offsetWidth??box.width,height:el.offsetHeight??box.height};};
      return {mark:size('.launch-mark'),spinner:size('.launch-spinner')};
    });
    assert.deepEqual(afterCSS,beforeCSS,'loading artwork must not resize when the external CSS arrives');
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
  // Read the browser's transformed pseudo-element quad, not inferred CSS math.
  // This catches scale multiplying the nonzero translation for tabs 2–4.
  const cdp=await context.newCDPSession(page);await cdp.send('DOM.enable');
  const lensQuad=async()=>{
    const {root}=await cdp.send('DOM.getDocument',{depth:1});
    const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'.app-tabs'});
    const {node}=await cdp.send('DOM.describeNode',{nodeId,depth:1});
    const pseudo=node.pseudoElements?.find(item=>item.pseudoType==='before');assert.ok(pseudo);
    const {model}=await cdp.send('DOM.getBoxModel',{nodeId:pseudo.nodeId});
    return model.border;
  };
  for(const name of ['process','history','guide','settings']){
    await page.locator(`[data-screen="${name}"]`).click();await page.waitForTimeout(950);
    let target=await page.locator(`[data-screen="${name}"]`).boundingBox();
    await page.mouse.move(target.x+target.width/2,target.y+target.height/2);await page.mouse.down();await page.waitForTimeout(1000);
    const quad=await lensQuad();
    target=await page.locator(`[data-screen="${name}"]`).boundingBox();
    const lensCenter=(quad[0]+quad[2]+quad[4]+quad[6])/4;
    const tabCenter=target.x+target.width/2;
    await page.screenshot({path:out+`/held-${name}.png`});
    assert.ok(Math.abs(lensCenter-tabCenter)<1,'held lens must stay centered on '+name+': '+JSON.stringify({lensCenter,tabCenter}));
    results.push({type:'held-lens-centering',name,lensCenter,tabCenter});
    await page.mouse.up();await page.waitForTimeout(950);
  }
  await page.locator('[data-screen="process"]').click();
  await page.locator('[data-screen="settings"]').click();await page.evaluate(()=>scrollTo(0,300));
  const before=await page.locator('.app-dock').boundingBox();
  await page.locator('[data-screen="process"]').click();const after=await page.locator('.app-dock').boundingBox();
  assert.equal(before.y,after.y);assert.equal(await page.evaluate(()=>scrollY),0);
  const tabGeometry=[];
  for(const name of ['settings','process','history','guide','settings']){
    await page.locator(`[data-screen="${name}"]`).click();await page.waitForTimeout(600);
    const measured=await page.evaluate(()=>{
      const nav=document.querySelector('.app-tabs'),bar=nav.getBoundingClientRect();
      const lens=getComputedStyle(nav,'::before');
      return {height:document.scrollingElement.scrollHeight,viewport:document.documentElement.clientHeight,
        scrollY,barTop:bar.top,barRight:bar.right,dockBottom:document.querySelector('.app-dock').getBoundingClientRect().bottom,
        lensWidth:lens.width,lensHeight:lens.height,barWidth:bar.width,barHeight:bar.height,translate:lens.translate};
    });
    const quad=await lensQuad();
    measured.topGap=Math.min(quad[1],quad[3],quad[5],quad[7])-measured.barTop;
    measured.endGap=measured.barRight-Math.max(quad[0],quad[2],quad[4],quad[6]);
    tabGeometry.push({name,...measured});
  }
  assert.ok(tabGeometry.every(item=>item.height>item.viewport),'every standalone tab needs the same scrollable root state');
  for(const item of tabGeometry.filter(item=>item.name==='settings'))assert.ok(Math.abs(item.topGap-item.endGap)<.25,'selected end lens must be concentric: '+JSON.stringify(item));
  results.push({type:'short-long-tab-geometry',tabs:tabGeometry});
  await cdp.detach();
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
  const appearanceFrame=await readCornerPair(page,'.appearance-card','.appearance-segment');assert.equal(appearanceFrame.outer,22);
  assert.deepEqual(errors,[]);results.push({type:'navigation-search',errors});
  for(const theme of ['light','dark']){
    await page.goto(origin+`/preview?theme=${theme}&lang=en`,{waitUntil:'networkidle'});
    await page.getByRole('button',{name:'Add sample result',exact:true}).click();
    await page.locator('.fixture-tools').evaluate(el=>el.hidden=true);await page.locator('#boot').evaluate(el=>el.hidden=true);
    await page.locator('[data-screen="history"]').click();
    await page.locator('#history-items .task-action-trigger').click();
    await page.waitForTimeout(250);
    const targets=await page.locator('#history-items .task-action-item').evaluateAll(elements=>elements.map(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})));
    assert.ok(targets.length&&targets.every(rect=>rect.width>=44&&rect.height>=44),JSON.stringify(targets));
    const historyCorners=await readCornerPair(page,'.task-action-menu:not([hidden])','.task-action-menu:not([hidden]) .task-action-item:last-child');
    await page.keyboard.press('Escape');
    await page.screenshot({path:out+`/history-${theme}.png`});
    await page.locator('#history-items .task-open').click();
    await page.waitForFunction(()=>document.getElementById('photo-workspace').open);
    await page.waitForTimeout(250);
    const photo=await page.locator('#photo-workspace').boundingBox(),actions=await page.locator('#photo-workspace .act').boundingBox();
    assert.ok(photo.x>=0&&photo.y>=0&&photo.x+photo.width<=402&&photo.y+photo.height<=874);
    assert.ok(actions&&actions.y+actions.height<874);
    const photoCorners=await readCornerPair(page,'#photo-workspace .act','#photo-workspace .output-actions>.dl:last-child');
    await page.screenshot({path:out+`/photo-${theme}.png`});
    const exportCorners=[];
    for(const width of [402,1024]){
      await page.setViewportSize({width,height:874});
      for(const expanded of [false,true]){
        await page.locator('#photo-workspace .act').evaluate((el,expanded)=>el.classList.toggle('is-expanded',expanded),expanded);
        await page.waitForTimeout(350);
        const pair=await readCornerPair(page,'#photo-workspace .act','#photo-workspace .output-actions>.dl:last-child');
        exportCorners.push({width,expanded,...pair});
      }
    }
    await page.setViewportSize({width:402,height:874});
    await page.locator('#close-photo').click();await page.waitForFunction(()=>!document.getElementById('photo-workspace').open);
    await page.evaluate(async()=>{
      const {confirmAction}=await import('/src/ui/confirm-dialog.js');
      window.fixtureConfirmation=confirmAction({title:'Clear history?',detail:'Saved photos in History will be removed.',confirmLabel:'Clear',cancelLabel:'Cancel'});
    });
    assert.equal(await page.locator('.ios-confirm-cancel').evaluate(el=>el===document.activeElement),true);
    const confirmCorners=await readCornerPair(page,'.ios-confirm-dialog','.ios-confirm-destructive');
    await page.screenshot({path:out+`/confirmation-${theme}.png`});
    await page.locator('.ios-confirm-cancel').click();
    assert.equal(await page.evaluate(()=>window.fixtureConfirmation),false);
    await page.locator('[data-screen="guide"]').click();await page.locator('.guide-card summary').first().click();
    await page.screenshot({path:out+`/guide-${theme}.png`});
    results.push({type:'history-photo-guide-confirmation',theme,targets,historyCorners,photoCorners,confirmCorners,exportCorners});
  }
  await context.close();

  // Exercise production bootstrap too: an install guide must own focus in Safari,
  // and native modal presentation must work with chrome now outside <main>.
  const appContext=await browser.newContext({viewport:{width:402,height:874},serviceWorkers:'block',
    userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 Version/27.0 Mobile/15E148 Safari/604.1'});
  await appContext.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  const appPage=await appContext.newPage(),appErrors=[];appPage.on('pageerror',error=>appErrors.push(error.message));
  const safeArea=await appContext.newCDPSession(appPage);
  await safeArea.send('Emulation.setSafeAreaInsetsOverride',{insets:{top:62,bottom:34,left:0,right:0}});
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
  assert.equal(await appPage.locator('#ai-settings [data-close-dialog]').count(),0);
  await appPage.waitForTimeout(350);
  const sheetBefore=await appPage.locator('#ai-settings').evaluate(sheet=>{
    const box=sheet.getBoundingClientRect(),body=sheet.querySelector('.sheet-body'),head=sheet.querySelector('.sheet-header');
    return {top:box.top,bottom:box.bottom,left:box.left,viewport:document.documentElement.clientHeight,
      rim:parseFloat(getComputedStyle(sheet).borderBottomWidth)||parseFloat(getComputedStyle(sheet.querySelector('.sheet-frame-outline')).strokeWidth),overflow:getComputedStyle(sheet).overflowY,
      bodyOverflow:getComputedStyle(body).overflowY,bodyBottomPadding:parseFloat(getComputedStyle(body).paddingBottom),bodySidePadding:parseFloat(getComputedStyle(body).paddingLeft),
      controlBottom:sheet.querySelector('.depth-model-control').getBoundingClientRect().bottom,headerGap:head.getBoundingClientRect().top-box.top};
  });
  await appPage.screenshot({path:out+'/ai-settings-dark.png'});
  assert.ok(sheetBefore.rim>0&&sheetBefore.bottom<sheetBefore.viewport,'sheet needs a visible bottom rim inside the viewport: '+JSON.stringify(sheetBefore));
  assert.equal(sheetBefore.overflow,'hidden','only sheet content scrolls; header and rim must stay fixed');
  assert.equal(sheetBefore.bodyOverflow,'auto');
  assert.equal(sheetBefore.viewport-sheetBefore.bottom,8,'phone frame should sit 8px above the screen edge even with a 34px safe area');
  assert.equal(sheetBefore.left,8,'bottom and side gaps should match');
  assert.ok(sheetBefore.bodyBottomPadding>=8,'keep a small safe gap below the footer');
  assert.ok(sheetBefore.controlBottom<=sheetBefore.viewport-34,'Model controls must stay above the Home indicator safe area');
  results.push({type:'phone-safe-area-sheet',...sheetBefore});
  const footer=await appPage.locator('#ai-settings').evaluate(sheet=>{
    const note=sheet.querySelector('.sheet-note'),box=sheet.getBoundingClientRect(),text=note.getBoundingClientRect();
    const group=sheet.querySelector('.ai-options-group:last-of-type').getBoundingClientRect(),style=getComputedStyle(note);
    return {gapAbove:text.top-group.bottom,gapBelow:box.bottom-text.bottom,groupGap:box.bottom-group.bottom,
      font:parseFloat(style.fontSize),align:style.textAlign,center:text.left+text.width/2,frameCenter:box.left+box.width/2};
  });
  assert.equal(footer.align,'center');assert.equal(footer.font,12);assert.ok(Math.abs(footer.center-footer.frameCenter)<.5);
  assert.ok(footer.gapAbove>=5&&footer.gapAbove<=7&&footer.gapBelow>=7&&footer.gapBelow<=10,'footer spacing should stay compact: '+JSON.stringify(footer));
  assert.ok(footer.groupGap>=28&&footer.groupGap<=34,'raise Model slightly to make room for the footer');
  results.push({type:'compact-centered-footer',...footer});
  await appPage.keyboard.press('Escape');await appPage.waitForFunction(()=>!document.getElementById('ai-settings').open);
  for(const [width,height]of [[320,568],[402,874],[844,390],[768,1024]]){
    await appPage.setViewportSize({width,height});
    for(const lang of ['en','vi','zh'])for(const theme of ['light','dark']){
      await appPage.evaluate(({lang,theme})=>{
        document.documentElement.dataset.theme=theme;
        const select=document.getElementById('lang');select.value=lang;select.dispatchEvent(new Event('change',{bubbles:true}));
      },{lang,theme});
      await appPage.locator('#open-ai-settings').click();await appPage.waitForTimeout(350);
      const geometry=await appPage.locator('#ai-settings').evaluate(sheet=>{
        const box=sheet.getBoundingClientRect(),body=sheet.querySelector('.sheet-body'),head=sheet.querySelector('.sheet-header');
        const model=document.getElementById('depth-model'),modelBox=model.getBoundingClientRect(),row=model.closest('.portrait-option').getBoundingClientRect();
        const switches=[...sheet.querySelectorAll('[role="switch"]')].map(el=>el.getBoundingClientRect().width);
        return {top:box.top,bottom:box.bottom,left:box.left,right:box.right,headerTop:head.getBoundingClientRect().top,
          continuous:sheet.hasAttribute('data-continuous-frame'),clipPath:getComputedStyle(sheet).clipPath,
          innerClip:getComputedStyle(sheet.querySelector('.ai-options-group:last-of-type')).clipPath,
          groupRadius:getComputedStyle(sheet.querySelector('.ai-options-group')).borderTopLeftRadius,
          modelGroupBottomRadius:getComputedStyle(sheet.querySelector('.ai-options-group:last-of-type')).borderBottomRightRadius,
          cornerRadius:getComputedStyle(sheet).borderTopLeftRadius,frameReady:sheet.querySelector('.sheet-frame-outline').getAttribute('d')?.endsWith('Z')||false,
          modelRight:modelBox.right,rowRight:row.right,modelWidth:modelBox.width,modelHeight:modelBox.height,
          switchWidths:switches,bodyScrollWidth:body.scrollWidth,bodyWidth:body.clientWidth};
      });
      assert.ok(geometry.left>=0&&geometry.right<=width&&geometry.bottom<height&&geometry.top>=0,JSON.stringify({width,height,lang,theme,geometry}));
      assert.ok(geometry.headerTop-geometry.top<24,'sheet header must not inherit status-bar-sized internal padding');
      assert.ok(geometry.modelRight<=geometry.rowRight-8&&geometry.modelWidth>=128&&geometry.modelHeight===44,'original Model control must fit: '+JSON.stringify(geometry));
      assert.ok(geometry.switchWidths.every(value=>value===63),'retain the original switch dimensions');
      assert.ok(geometry.bodyScrollWidth<=geometry.bodyWidth,'sheet must not overflow horizontally: '+JSON.stringify(geometry));
      assert.equal(geometry.groupRadius,'20px','restore original AI group corners');
      assert.equal(geometry.modelGroupBottomRadius,'20px','Model bottom must use the original restrained corner too');
      assert.equal(geometry.innerClip,'none','remove the experimental group/inner curve');
      assert.equal(geometry.continuous,width<=600,'continuous Camera curve is phone-only');
      if(width<=600){assert.match(geometry.clipPath,/ai-settings-frame-clip/);assert.equal(geometry.frameReady,true);}
      else {assert.equal(geometry.clipPath,'none');assert.equal(geometry.innerClip,'none');assert.equal(geometry.cornerRadius,'32px');}
      await appPage.locator('#ai-settings .sheet-body').evaluate(el=>el.scrollTop=el.scrollHeight);
      assert.equal((await appPage.locator('#ai-settings .sheet-header').boundingBox()).y,geometry.headerTop,'scrolling options must not move the header/rim');
      if(width===402&&lang==='en'){
        await appPage.locator('#ai-settings .sheet-body').evaluate(el=>el.scrollTop=0);
        await appPage.screenshot({path:out+`/ai-settings-${theme}.png`});
      }
      results.push({type:'sheet-layout',width,height,lang,theme,...geometry});
      await appPage.keyboard.press('Escape');await appPage.waitForFunction(()=>!document.getElementById('ai-settings').open);
    }
  }
  await appPage.setViewportSize({width:402,height:874});
  await appPage.locator('#open-ai-settings').click();await appPage.waitForTimeout(350);
  const model=appPage.locator('#depth-model');
  for(const [value,label]of [['0','Lite'],['1','Standard'],['2','Pro']]){
    await model.evaluate((input,value)=>{input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));},value);
    assert.equal(await model.getAttribute('aria-valuetext'),label);
    const knob=await appPage.locator('#model-options .model-knob').boundingBox();
    assert.equal(await appPage.evaluate(({x,y})=>Boolean(document.elementFromPoint(x,y)?.closest('#model-options')),{x:knob.x+knob.width/2,y:knob.y+knob.height/2}),true,'nested curve must not clip the Model control touch target');
  }
  const header=await appPage.locator('#ai-settings .sheet-header').boundingBox();
  await appPage.mouse.move(header.x+header.width/2,header.y+header.height/2);await appPage.mouse.down();
  await appPage.mouse.move(header.x+header.width/2,header.y+header.height/2+85,{steps:6});await appPage.mouse.up();
  await appPage.waitForFunction(()=>!document.getElementById('ai-settings').open);
  results.push({type:'model-values-and-sheet-swipe'});

  await appPage.evaluate(()=>document.documentElement.dataset.theme='dark');
  await appPage.locator('[data-screen="guide"]').click();await appPage.waitForTimeout(950);
  const darkRest=await appPage.locator('.app-tabs').evaluate(el=>({background:getComputedStyle(el,'::before').backgroundColor,shadow:getComputedStyle(el,'::before').boxShadow}));
  assert.match(darkRest.background,/0\.72/);assert.equal(darkRest.shadow,'none');
  await appPage.locator('.app-dock').screenshot({path:out+'/toolbar-dark-rest.png'});
  const tab=await appPage.locator('[data-screen="history"]').boundingBox();
  await appPage.mouse.move(tab.x+tab.width/2,tab.y+tab.height/2);await appPage.mouse.down();await appPage.waitForTimeout(250);
  const darkHeld=await appPage.locator('.app-tabs').evaluate(el=>({background:getComputedStyle(el,'::before').backgroundColor,shadow:getComputedStyle(el,'::before').boxShadow}));
  assert.match(darkHeld.background,/, 0\)/,'moving dark lens must stay transparent');
  assert.ok(!darkHeld.shadow.includes('255'),'dark lens must not retain a white bevel');
  await appPage.locator('.app-dock').screenshot({path:out+'/toolbar-dark-held.png'});
  await appPage.mouse.up();await appPage.waitForTimeout(950);
  results.push({type:'dark-glass-material',rest:darkRest,held:darkHeld});

  await appPage.emulateMedia({reducedMotion:'reduce',forcedColors:'active'});
  assert.equal(await appPage.locator('.app-tabs').evaluate(el=>getComputedStyle(el).backdropFilter),'none');
  await appPage.locator('[data-screen="process"]').click();
  await appPage.locator('#open-ai-settings').click();
  assert.equal(await appPage.locator('#ai-settings').evaluate(el=>getComputedStyle(el).animationName),'none');
  await appPage.keyboard.press('Escape');assert.equal(await appPage.locator('#ai-settings').evaluate(el=>el.open),false);
  results.push({type:'reduced-motion-forced-colors'});
  assert.deepEqual(appErrors,[]);results.push({type:'production-bootstrap',errors:appErrors});await appContext.close();
  await writeFile(out+'/report.json',JSON.stringify({passed:results.length,deviceScaleFactor,results},null,2));
  console.log(`Passed ${results.length} browser checks; screenshots/report: ${out}`);
}finally{await browser?.close();await new Promise(done=>server.close(done));}
