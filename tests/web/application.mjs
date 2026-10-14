import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createAiFeatureControls} from '../../web/src/ui/ai-feature-controls.js';

// Exercise application wiring without downloading models, spawning workers or
// decoding photos. Domain factories are injected at the module boundary.
const source=readFileSync(new URL('../../web/src/app/application.js',import.meta.url),'utf8')
  .replace(/^import .*;\n/gm,'').replace('export function startApplication','function startApplication');
const resultViewSource=readFileSync(new URL('../../web/src/ui/results/result-view.js',import.meta.url),'utf8');
function harness({manualQueue=false,historyEntries=[]}={}){
  const nodes=new Map(),calls=[],captured={},batches=new Map();
  function batchFor(name){
    if(!batches.has(name)){
      let start,release;
      const started=new Promise(resolve=>start=resolve),gate=new Promise(resolve=>release=resolve);
      batches.set(name,{started,start,gate,release});
    }
    return batches.get(name);
  }
  function node(id){
    if(nodes.has(id))return nodes.get(id);
    const listeners=new Map(),attrs=new Map();
    const n={id,checked:false,disabled:false,value:id==='depth-model'?'1':'en',
      childElementCount:0,dataset:{},style:{setProperty(){}},classList:{add(){},remove(){},contains(){return false;}},
      parentElement:{style:{setProperty(){}},dataset:{}},
      addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);},
      dispatchEvent(event){for(const fn of listeners.get(event.type)||[])fn(event);},
      fire(type,event={}){return Promise.all((listeners.get(type)||[]).map(fn=>fn(event)));},
      setAttribute(key,value){attrs.set(key,value);},removeAttribute(key){attrs.delete(key);},
      querySelector(selector){return node(id+selector);},append(){},replaceChildren(){},
      click(){calls.push(['picker']);}};
    nodes.set(id,n);return n;
  }
  const context={console,Event,setTimeout,clearTimeout,
    document:{getElementById:node,createElement:node,querySelectorAll:()=>[]},
    getAppShell:()=>({register(){},render(){}}),confirm:()=>true,
    localStorage:{getItem:()=>null,setItem(){}},sessionStorage:{getItem:()=>true},
    navigator:{serviceWorker:{controller:{postMessage:message=>calls.push(['worker',message.type])}}},
    matchMedia:()=>({matches:false}),
    VERSION:'test',AI_STRINGS:{en:{},vi:{}},pickLanguage:()=> 'en',
    rememberLanguage:lang=>calls.push(['language',lang]),applyLanguage(){},t:(_lang,key)=>key,
    depthModel:id=>({label:id}),createAiFeatureControls,showAiSettingsHintOnce(){},confirmAction:async()=>true,
    prepareBrowser:async()=> 'ready-limited',prepareHevcAssets:()=>assert.fail('limited mode must not warm encoder'),
    loadLibheif:async()=>{},releaseDecodeCache(){},releaseHevcEncoder(){},releaseRasterEncoder(){},releaseHeicProcessor(){},
    clearDownloadedAssets:async()=>{},waitForVisiblePage:async()=>{},
    createPhotoAnalysis:deps=>{captured.analysis=deps;return {kind:'analysis'};},
    createLivePhotoSession:deps=>{captured.live=deps;return {liveMovies:new Map(),livePhotos:[],attachMovie(){},handleMovie(){}};},
    createProfileRepository:()=>({preload:async()=>calls.push(['profiles']),ensureProfileIndex(){},getProfile(){}}),
    createHistoryStore:()=>({list:async()=>historyEntries,clear:async()=>calls.push(['history-clear']),remove:async()=>{},save:async()=>{}}),
    restoredFile:entry=>entry?.file||null,
    createResultView:deps=>{captured.results=deps;return (name,file,options={})=>{const item={name,file,options,outputs:[],states:[]};(captured.rows??=[]).push(item);return {output:(...args)=>item.outputs.push(args),set:(...args)=>item.states.push(args)};};},
    createPortraitController:deps=>{captured.portrait=deps;return {tryAiPortrait(){},runAiCandidate(){}};},
    createFileProcessor:deps=>{captured.processing=deps;return {handleFiles:async files=>{
      const batch=batchFor(files[0]);calls.push(['start',files[0]]);batch.start();
      if(manualQueue)await batch.gate;
      calls.push(['end',files[0]]);
    }};},
  };
  runInNewContext(source+'\nglobalThis.start=startApplication;',context);
  return {nodes,node,calls,captured,start:context.start,
    waitForStart:name=>batchFor(name).started,release:name=>batchFor(name).release()};
}

test('application initializes one shared session and supplies live language/settings to processors',async()=>{
  const h=harness();await h.start();
  assert.equal(h.node('file').disabled,false);
  assert.equal(h.node('enhance-ai').disabled,false);
  assert.equal(h.captured.processing.analysis.kind,'analysis');
  assert.equal(h.captured.processing.liveMovies,h.captured.results.liveMovies);
  assert.equal(h.captured.processing.livePhotos,h.captured.results.livePhotos);
  assert.equal(h.captured.portrait.aiCandidates,h.captured.results.aiCandidates);
  assert.equal(h.captured.processing.aiFeatures,h.captured.results.aiFeatures);
  assert.equal(h.captured.processing.getLanguage(),'en');
  h.node('lang').value='vi';await h.node('lang').fire('change');
  assert.equal(h.captured.processing.getLanguage(),'vi');
  h.node('depth-model').value='2';
  await h.node('depth-model').fire('input');
  assert.equal(h.captured.processing.selectedAiLevel(),'pro');
  assert.equal(h.node('depth-model-value').textContent,'pro');
  assert.equal(h.node('depth-model').parentElement.dataset.level,'2');
  assert.ok(h.calls.some(([type,value])=>type==='worker'&&value==='WARM_CACHE'));
});

test('separate picker/drop batches remain serialized and cache cleanup stays locked while queued',async()=>{
  const h=harness({manualQueue:true});await h.start();
  h.node('file').files=['first'];await h.node('file').fire('change');
  await h.node('drop').fire('drop',{preventDefault(){},dataTransfer:{files:['second']}});
  assert.equal(h.node('clear-assets').disabled,true);
  assert.equal(h.node('full-cleanup').disabled,true);
  assert.equal(h.node('clear-history').disabled,true);
  await h.waitForStart('first');
  assert.deepEqual(h.calls.filter(([type])=>type==='start'),[['start','first']]);
  h.release('first');await h.waitForStart('second');
  h.release('second');await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(h.calls.filter(([type])=>['start','end'].includes(type)),
    [['start','first'],['end','first'],['start','second'],['end','second']]);
  assert.equal(h.node('clear-assets').disabled,false);
  assert.equal(h.node('full-cleanup').disabled,false);
  assert.equal(h.node('clear-history').disabled,false);
});

test('three-stop model range updates the displayed name and the actual processing level',async()=>{
  const h=harness();await h.start();
  for(const [index,name]of ['lite','standard','pro'].entries()){
    h.node('depth-model').value=String(index);await h.node('depth-model').fire('input');
    assert.equal(h.captured.processing.selectedAiLevel(),name);
    assert.equal(h.node('depth-model-value').textContent,name);
    assert.equal(h.node('depth-model').parentElement.dataset.level,String(index));
  }
});

test('ready output is persisted immediately and preview enrichment cannot block F5 history restore',()=>{
  assert.match(resultViewSource,/const persistHistory=\(\)=>persistedOutput&&historyStore\?\.save\?\.\(\{[\s\S]*?preview:previewSnapshot,thumbnail:historyThumbnail/s);
  assert.doesNotMatch(resultViewSource,/persistedOutput&&previewSnapshotPromise\.then/);
  assert.match(resultViewSource,/previewSnapshotPromise\.then\(preview=>\{previewSnapshot=preview;void persistHistory\(\);\}\)/);
  const listener=resultViewSource.indexOf("image.addEventListener('load'");
  const sourceAssignment=resultViewSource.indexOf('image.src=url');
  assert.ok(listener>=0&&sourceAssignment>listener,'preview listeners must be attached before the blob URL can load');
});

test('persistent history is restored as ready downloadable results without reprocessing',async()=>{
  const file={name:'saved-result.heic',type:'image/heic',size:4096},preview={type:'image/jpeg',size:2048},thumbnail='data:image/jpeg;base64,thumb';
  const h=harness({historyEntries:[{id:'persisted-1',name:'original.heic',file,preview,thumbnail}]});await h.start();
  assert.equal(h.captured.rows.length,1);
  assert.equal(h.captured.rows[0].name,'original.heic');
  assert.equal(h.captured.rows[0].options.historyId,'persisted-1');
  assert.equal(h.captured.rows[0].options.restored,true);
  assert.equal(h.captured.rows[0].options.restoredPreview,preview);
  assert.equal(h.captured.rows[0].options.restoredThumbnail,thumbnail);
  assert.equal(h.captured.rows[0].outputs.length,1);
  assert.equal(h.captured.rows[0].outputs[0][0],file);
  assert.equal(h.captured.rows[0].outputs[0][1].metadata,false);
  assert.equal(h.captured.rows[0].outputs[0][1].persist,false);
  assert.equal(h.captured.rows[0].states[0][0],'st.ready');
  assert.equal(h.captured.rows[0].states[0][1],'ok');
});

test('clearing history releases result cleanups and clears the shared Live Photo/AI session',async()=>{
  const h=harness();await h.start();let disposed=0;
  h.captured.results.resultCleanups.add(()=>disposed++);
  h.captured.results.livePhotos.push({});h.captured.results.liveMovies.set('id',{});
  h.captured.results.aiCandidates.push({ui:{}});
  await h.node('clear-history').fire('click');
  assert.equal(disposed,1);
  assert.equal(h.captured.results.resultCleanups.size,0);
  assert.equal(h.captured.results.livePhotos.length,0);
  assert.equal(h.captured.results.liveMovies.size,0);
  assert.equal(h.captured.results.aiCandidates.length,0);
});
