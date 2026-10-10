import { loadProfile } from "./src/core/zip.js";
import { profileFor, VERSION, UNSUPPORTED } from "./src/styles/port.js";
import { dimensionsForItem, discoverHeic } from "./src/core/heif.js";
import { styleDeltaSize } from "./src/styles/graft.js";
import { hasTexture } from "./src/styles/texture.js";
import { decodeToRgb, loadLibheif, releaseDecodeCache } from "./src/media/decode.js";
import { pickLanguage, rememberLanguage, applyLanguage, t } from "./src/ui/i18n.js";
import { photoContentIdentifier, moviePairingMetadata, createLivePhotoExport } from "./src/media/live-photo.js";
import { RASTER_MIMES } from "./src/media/image-format.js";
import { photoCaptureDate } from "./src/media/photo-date.js";
import { preserveNativeStyles, styleReconstructionRisk, nativeTextureCapture } from "./src/styles/style-preservation.js";
import { AI_STRINGS } from "./src/ui/ai-strings.js";
import {prepareBrowser,fetchJsonWithRetry} from './src/ui/startup.js';
import {prepareHevcAssets, releaseHevcEncoder} from './src/codecs/ffmpeg-hevc.js';
import {releaseHevcEncoder as releaseRasterEncoder} from './src/raster/ffmpeg-hevc.js';
import {readImageFile, addTextureInWorker, repairTextureInWorker, restoreNativePortraitInWorker, patchInWorker, releaseHeicProcessor, describeInWorker} from './src/media/heic-processing.js';
import {formatBytes} from './src/ui/result-metadata.js';
import {hasSoftSkinData} from './src/styles/soft-skin-container.js';
import {styleCapabilities} from './src/styles/style-capabilities.js';
import {waitForVisiblePage} from './src/ui/processing-scheduler.js';
import {depthModel} from './src/portrait/depth-models.js';
import {clearDownloadedAssets} from './src/core/cache-cleanup.js';
import {createAiFeatureControls} from './src/ui/ai-feature-controls.js';


const $ = (id) => document.getElementById(id);
const fileInput = $("file"), drop = $("drop"), list = $("list");
const aiPortrait = $("ai-portrait"), aiDetail = $("ai-detail"), enhanceAi = $("enhance-ai");
const gpuAcceleration=$('gpu-acceleration');
const modelSelector=$('depth-model'),clearAssets=$('clear-assets');
const modelLevels=['lite','standard','pro'];
const aiSettings=$('ai-settings');
const aiSettingsSummary=aiSettings?.querySelector('summary');
if(aiSettings&&aiSettingsSummary){
  aiSettingsSummary.addEventListener('click',event=>{
    if(!aiSettings.open||aiSettings.classList.contains('is-closing'))return;
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    event.preventDefault();
    aiSettings.classList.add('is-closing');
    const close=()=>{aiSettings.open=false;aiSettings.classList.remove('is-closing');};
    aiSettings.querySelector('.ai-settings-panel')?.addEventListener('animationend',close,{once:true});
    setTimeout(()=>{if(aiSettings.classList.contains('is-closing'))close();},220);
  });
}

const selectedModel=()=>modelLevels[Number(modelSelector.value)];
function renderModel(){
  const name=depthModel(selectedModel()).label;
  $('depth-model-value').textContent=name;modelSelector.setAttribute('aria-valuetext',name);
  modelSelector.parentElement.style.setProperty('--model-position',['14px','50%','calc(100% - 14px)'][Number(modelSelector.value)]);
  modelSelector.parentElement.dataset.level=modelSelector.value;
}
let clearingAssets=false,assetStatus='';
try{const saved=localStorage.getItem('depth-model')||'standard';depthModel(saved);modelSelector.value=modelLevels.indexOf(saved);}catch{}



renderModel();
modelSelector.addEventListener('input',()=>{
  renderModel();try{localStorage.setItem('depth-model',selectedModel());}catch{}
});
try{gpuAcceleration.checked=localStorage.getItem('depth-gpu-acceleration')!=='off';}catch{}
gpuAcceleration.addEventListener('change',()=>{
  try{localStorage.setItem('depth-gpu-acceleration',gpuAcceleration.checked?'on':'off');}catch{}
});
const clearHistory = $('clear-history');
const resultUrls = new Set(), resultCleanups = new Set();
const aiCandidates = [];
let browserReady = false, pendingTasks = 0;
const aiFeatures=createAiFeatureControls({
  master:enhanceAi,
  features:{portrait:aiPortrait,detail:aiDetail},
  isAvailable:()=>browserReady&&!clearingAssets,
});
function refreshHistoryButton() {
  clearHistory.hidden = !list.childElementCount;
  clearHistory.disabled = pendingTasks > 0;
  clearAssets.disabled=!browserReady||pendingTasks>0||clearingAssets||aiCandidates.some(candidate=>candidate.ui.portraitPending);
}
function queueTask(task) {
  pendingTasks++; refreshHistoryButton();
  const pending = fileQueue.catch(() => {}).then(async()=>{await waitForVisiblePage();return task();});
  fileQueue = pending.catch(() => {}).finally(() => { pendingTasks--; refreshHistoryButton(); });
  return pending;
}
clearHistory.addEventListener('click', () => {
  if (pendingTasks) return;
  for (const cleanup of resultCleanups) cleanup();
  resultCleanups.clear();
  for (const url of resultUrls) URL.revokeObjectURL(url);
  resultUrls.clear(); livePhotos.length = 0; liveMovies.clear(); aiCandidates.length = 0;
  list.replaceChildren(); fileInput.value = ''; releaseDecodeCache();
  releaseHevcEncoder(); releaseRasterEncoder(); releaseHeicProcessor();
  void import('./src/detail/detail-inference.js').then(({releaseDetailWorkers})=>releaseDetailWorkers()).catch(()=>{});
  refreshHistoryButton();
});
clearAssets.addEventListener('click',async()=>{
  if(clearAssets.disabled)return;
  clearingAssets=true;assetStatus='cleaning';translateAi();refreshHistoryButton();
  aiFeatures.sync();
  modelSelector.disabled=gpuAcceleration.disabled=true;
  fileInput.disabled=true;drop.setAttribute('aria-disabled','true');
  try{
    releaseDecodeCache();releaseHevcEncoder();releaseRasterEncoder();releaseHeicProcessor();
    const [{releaseOrtModels},{releaseDetailWorkers}]=await Promise.all([
      import('./src/vision/ort-vision.js'),import('./src/detail/detail-inference.js')]);
    releaseDetailWorkers();await releaseOrtModels();
    await clearDownloadedAssets();assetStatus='cleaned';
  }catch(error){console.warn('Cache cleanup unavailable',error);assetStatus='cleanupFailed';}
  finally{clearingAssets=false;aiFeatures.sync();modelSelector.disabled=gpuAcceleration.disabled=false;fileInput.disabled=!browserReady;drop.setAttribute('aria-disabled',String(!browserReady));translateAi();refreshHistoryButton();}
});
const aiText = () => AI_STRINGS[lang] || AI_STRINGS.en;
function translateAi() {
  $("enhance-ai-label").textContent = aiText().masterToggle;
  $("ai-portrait-label").textContent = aiText().toggle;
  $("ai-portrait-hint").textContent = aiText().hint;
  $("ai-portrait-hint").hidden = false;
  $("ai-detail-label").textContent = aiText().detailToggle;
  $("ai-detail-hint").textContent = aiText().detailHint;


  $('ai-settings').hidden=false;
  $('ai-settings-label').textContent=aiText().settings;
  $('gpu-acceleration-label').textContent=aiText().acceleration;
  $('gpu-acceleration-hint').textContent=aiText().accelerationHint;
  $('depth-model-label').textContent=aiText().model;
  $('depth-model-hint').textContent=aiText().modelHint;
  $('clear-assets-label').textContent=aiText().cleanup;
  $('clear-assets-hint').textContent=aiText().cleanupHint;
  $('clear-assets-status').textContent=assetStatus?aiText()[assetStatus]:'';
  clearAssets.dataset.state=assetStatus;clearAssets.setAttribute('aria-busy',String(clearingAssets));
  clearAssets.title=assetStatus==='cleanupFailed'?aiText().cleanupFailed:aiText().cleanupHint;
}
aiPortrait.addEventListener('change', () => {
  translateAi();
  for (const candidate of aiCandidates) {
    if (!aiFeatures.enabled('portrait')) {
      candidate.controller?.abort();
      candidate.ui.outputPending(false);
      candidate.ui.output(candidate.outputFile);
      candidate.ui.aiView(false);candidate.ui.aiBusy(false);
      candidate.ui.aiState('');candidate.ui.note('', 'ai');candidate.ui.note('', 'ai-error');
    } else if (candidate.aiFile) {
      candidate.ui.outputPending(Boolean(candidate.ui.portraitPending));
      candidate.ui.output(candidate.aiFile);candidate.ui.note(aiText().ready, 'ai');
      candidate.ui.aiView(true);
    } else if (['new', 'failed'].includes(candidate.state)) {
      queueTask(() => runAiCandidate(candidate));
    }
  }
});

// Fetch the decoder while the visitor is still choosing a photo,
// so the first photo does not wait for the download, and someone just reading the page
// downloads nothing. A failure here is harmless: ensureDecode() tries again and falls back.
const warmDecoder = () => { loadLibheif().catch(() => {}); };
for (const ev of ["pointerdown", "dragenter", "focus"]) drop.addEventListener(ev, warmDecoder, { once: true });

let lang = pickLanguage();
const T = (key) => t(lang, key);
async function addMissingSoftSkin(data,file,ui,options={}) {
  if(options.nativeStyles&&!styleCapabilities(data).editable){ui.note(aiText().compatibility,'compatibility');return data;}
  if(hasSoftSkinData(data)) return data;
  ui.set(T('st.softskinworking'));
  try {
    const {completeSoftSkin}=await import('./src/styles/soft-skin.js');
    const result=await completeSoftSkin(data,file,{...options,onProgress:progress=>{
      if(progress.stage==='modelDownload') ui.set(`${T('st.softskinworking')} ${(progress.loaded/1048576).toFixed(1)} MB`);
      else if(progress.stage==='detect') ui.set(T('st.softskindetect'));
      else if(progress.stage==='segment') ui.set(T('st.softskinsegment'));
      else ui.set(T('st.softskinworking'));
    }});
    ui.note(T(result.state==='generated'?'st.softskinadded':'st.softskinnoface'),'soft-skin');
    return result.data;
  } catch(error) {
    console.warn('Soft Skin supplementation unavailable',error);
    ui.note(T('st.softskinunavailable'),'soft-skin');
    return data;
  }
}

let profileIndex = null;
const profileCache = new Map();
const liveMovies = new Map();
const livePhotos = [];

function attachMovie(photo) {
  const movie = liveMovies.get(photo.identifier);
  if (movie) photo.exporter.setMovie(movie.bytes);
}

async function handleMovie(file, bytes, ui) {
  try {
    const metadata = moviePairingMetadata(bytes);
    if (!metadata.contentIdentifier || !metadata.hasStillImageTimeKey)
      throw new Error("Missing Live Photo metadata");
    if (liveMovies.has(metadata.contentIdentifier)) {
      ui.set(T("live.duplicate"), "err");
      return;
    }
    liveMovies.set(metadata.contentIdentifier, { bytes, ui });
    ui.set(T("live.waitphoto"));
    for (const photo of livePhotos) attachMovie(photo);
  } catch (e) {
    console.error("could not read Live Photo movie", file.name, e);
    ui.set(T("live.invalidmov"), "err");
  }
}

let profileIndexPromise=null;
async function ensureProfileIndex(){
  if(profileIndex)return profileIndex;
  if(!profileIndexPromise)profileIndexPromise=fetchJsonWithRetry('profiles/index.json')
    .then(index=>profileIndex=index)
    .finally(()=>{profileIndexPromise=null;});
  return profileIndexPromise;
}
async function getProfile(name) {
  if (!profileCache.has(name)) {
    const index=await ensureProfileIndex();
    const entry=index?.[name];
    if(!entry?.file)throw Object.assign(new Error('Profile index unavailable'),{code:'APP_RESOURCE_UNAVAILABLE'});
    const res=await fetch(`profiles/${entry.file}`,{cache:'no-cache'});
    if(!res.ok)throw Object.assign(new Error(`Profile unavailable: ${name}`),{code:'APP_RESOURCE_UNAVAILABLE'});
    profileCache.set(name, await loadProfile(new Uint8Array(await res.arrayBuffer())));
  }
  return profileCache.get(name);
}

// Probe with a real decode of a real photo. Checking only that the script loaded
// says nothing about whether it can actually decode, and a decoder that loads but
// cannot decode is the failure mode that is hardest to notice.
async function ensureDecode(bytes) {
  try {
    await loadLibheif();
    await decodeToRgb(bytes, { width: 8, height: 8 });
    return true;
  } catch (e) {
    console.warn("image analysis unavailable, using neutral settings:", e);
    return false;
  }
}

function row(name) {
  const el = document.createElement("div");
  el.className = "row";
  el.innerHTML = `<div class="result-header"><div class="name"></div><div class="status"></div></div><div class="act"></div>`;
  el.querySelector(".name").textContent = name;
  el.querySelector(".name").title = name;
  list.appendChild(el);
  const cleanups=new Set(),downloadedFiles=new WeakSet(),savedFiles=new WeakSet();let disposed=false;
  function checkIcon(){
    const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');icon.classList.add('download-check');
    icon.innerHTML='<path d="m5 12 4 4L19 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';return icon;
  }
  const remove=document.createElement('button');remove.type='button';remove.className='result-remove';remove.disabled=true;
  remove.setAttribute('aria-label',T('btn.removeresult'));
  remove.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  const title=document.createElement('div');title.className='result-title';title.append(el.querySelector('.name'),remove);el.querySelector('.result-header').prepend(title);
  refreshHistoryButton();
  function actions(group) {
    let host=el.querySelector(`.output-actions[data-output="${group}"]`);
    if(!host){
      host=document.createElement('div');host.className='output-actions';host.dataset.output=group;
      el.querySelector('.act').append(host);
    }
    if(group==='depth'&&!host.querySelector('.output-label')){
      const label=document.createElement('span');label.className='output-label';label.textContent=aiText().depthLabel;
      host.append(label);
      const normal=el.querySelector('.output-actions[data-output="normal"]');
      if(normal&&!normal.querySelector('.output-label')){
        const text=document.createElement('span');text.className='output-label';text.textContent=aiText().normalLabel;normal.prepend(text);
      }
    }
    return host;
  }
  const ui={
    cleanup(fn){cleanups.add(fn);},
    dispose(){
      if(disposed)return;disposed=true;
      for(const cleanup of cleanups)cleanup();cleanups.clear();resultCleanups.delete(ui.dispose);
      for(const a of el.querySelectorAll('a[href]')){URL.revokeObjectURL(a.href);resultUrls.delete(a.href);}
      for(let i=aiCandidates.length-1;i>=0;i--)if(aiCandidates[i].ui===ui){aiCandidates[i].controller?.abort();aiCandidates[i].state='removed';aiCandidates.splice(i,1);}
      for(let i=livePhotos.length-1;i>=0;i--)if(livePhotos[i].ui===ui)livePhotos.splice(i,1);
      for(const [id,movie]of liveMovies)if(movie.ui===ui)liveMovies.delete(id);
      el.remove();refreshHistoryButton();
    },
    async metadata(data, inputSize, {raster = false, raw = false, outputEpoch = null} = {}) {
      if(outputEpoch===null){this.inputSize=inputSize;this.metadataOptions={raster,raw};}
      let m;
      try { m = await describeInWorker(data); }
      catch (error) { console.warn('Metadata unavailable:', error); return; }
      if(disposed||outputEpoch!==null&&outputEpoch!==this.outputEpoch)return;
      const values = [['meta.camera', m.camera], ['meta.dimensions', `${m.width} × ${m.height}`],
        ['meta.size', `${formatBytes(inputSize)} → ${formatBytes(m.bytes)}`],
        ['meta.resources', [raster ? 'SDR' : m.hdr ? 'HDR' : 'SDR', ...(m.depth ? [T('meta.depth')] : []), ...(raw ? ['RAW → HEIC'] : [])].join(' · ')]];
      if (m.capture) values.push(['meta.capture', `${m.capture.date}${m.capture.subsec ? '.' + m.capture.subsec : ''}${m.capture.offset ? ' ' + m.capture.offset : ''}`]);
      // Reuse the compact native details control; metadata never includes GPS or face regions.
      el.querySelector('.result-metadata')?.remove();
      this.note('', 'metadata');
      const note = el.querySelector('[data-note="metadata"]');
      const grid = document.createElement('dl'); grid.className = 'result-metadata';
      for (const [key, value] of values) {
        if (!value) continue;
        const field = document.createElement('div'), label = document.createElement('dt'), content = document.createElement('dd');
        label.dataset.i18n = key; label.textContent = T(key); content.textContent = value;
        field.append(label, content); grid.append(field);
      }
      note.replaceWith(grid);
    },
    aiState(text) {
      let state=el.querySelector('.ai-status');
      if(!state){state=document.createElement('p');state.className='ai-status';el.append(state);}
      state.textContent=text;
    },
    cancelAi(controller) {
      const button=document.createElement('button');button.type='button';button.className='dl alt ai-cancel';button.textContent=aiText().cancel;
      button.addEventListener('click',()=>controller.abort());el.append(button);
      return ()=>button.remove();
    },
    aiBusy(busy) {
      el.querySelector('.act').style.display=busy?'none':'';
      if(busy){this.readyNotice||=el.querySelector('.status').textContent;this.set(aiText().loading);}
      else if(this.readyNotice){this.set(this.readyNotice,'ok');this.readyNotice=null;}
    },
    aiView(visible) { const view=el.querySelector('.ai-details');if(view)view.style.display=visible?'':'none'; },
    async portraitPreview(result,onSettings) {
      const {portraitPreview}=await import('./src/portrait/ai-portrait-preview.js');
      el.querySelector('.ai-details')?.remove();
      const host=document.createElement('section');host.className='ai-details';host.setAttribute('aria-label',aiText().preview);
      el.insertBefore(host,el.querySelector('.act'));
      try{
        this.cleanup(portraitPreview(result,host,aiText(),onSettings,{onPending:pending=>{
          this.portraitPending=pending;if(aiFeatures.enabled('portrait'))this.outputPending(pending);refreshHistoryButton();
        }}));
      }catch(error){host.remove();this.note(aiText().previewFailed,'preview');throw error;}
    },
    outputPending(pending){
      this.outputPendingState=pending;el.querySelector('.act').setAttribute('aria-busy',String(pending));
      for(const button of el.querySelectorAll('.act button'))button.disabled=pending;
      for(const link of el.querySelectorAll('.act a')){link.setAttribute('aria-disabled',String(pending));link.tabIndex=pending?-1:0;}
    },
    output(file,{metadata=true}={}) {
      if(disposed)return;
      const host=actions('normal');
      for(const a of host.querySelectorAll('a[href]')){URL.revokeObjectURL(a.href);resultUrls.delete(a.href);}
      host.replaceChildren();
      if(navigator.canShare?.({files:[file]}))this.share(file,!!this.liveIdentifier);
      this.link(file,file.name);
      this.liveExporter?.setOutput(file);
      if(metadata){const outputEpoch=this.outputEpoch=(this.outputEpoch||0)+1;
        file.arrayBuffer().then(b=>this.metadata(new Uint8Array(b),this.inputSize||file.size,{...this.metadataOptions,outputEpoch})).catch(console.warn);}
      this.outputPending(Boolean(this.outputPendingState));
    },
    set(text, cls) {
      remove.disabled=!['ok','err','info'].includes(cls);
      const s = el.querySelector(".status");
      s.textContent = cls === 'ok' ? T("st.ready") : text;
      delete s.dataset.i18n;
      el.classList.toggle('is-ready', cls === 'ok');
      if (cls !== 'ok') el.querySelector('.result-notice')?.remove();
      if (cls === 'info') {
        const icon = document.createElement('span');
        icon.className = 'status-info-icon'; icon.textContent = 'i'; icon.setAttribute('aria-hidden', 'true');
        s.prepend(icon);
      }
      if (cls === 'ok') {
        const label = document.createElement('span');
        label.dataset.i18n = 'st.ready'; label.textContent = T('st.ready');
        const notice = document.createElement('span'); notice.className = 'result-notice';
        notice.textContent = ' — ' + text.replace(`${T('st.ready')} — `, '');
        s.replaceChildren(label, notice);
      }
      s.className = `status ${cls || ""}`;
    },
    note(text, kind = "live") {
      let note = el.querySelector(`[data-note="${kind}"]`);
      if (!note) {
        note = document.createElement("p");
        note.className = "live-note";
        note.dataset.note = kind;
        let details = el.querySelector('.result-details');
        if (!details) {
          details = document.createElement('details');
          const summary = document.createElement('summary');
          summary.textContent = T("h.conversiondetails");
          details.className = 'result-details';
          details.append(summary);
          el.appendChild(details);
        }
        details.appendChild(note);
      }
      note.textContent = text;
    },
    link(blob, filename, key = "btn.download", group = 'normal') {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      resultUrls.add(a.href);
      a.download = filename;
      const label=document.createElement('span');
      const renderDownload=()=>{const downloaded=downloadedFiles.has(blob);a.classList.toggle('is-downloaded',downloaded);label.dataset.i18n=downloaded?'btn.downloadagain':key;label.textContent=T(label.dataset.i18n);};
      a.className = "dl alt";
      a.append(checkIcon(),label);renderDownload();
      a.addEventListener('click',e=>{if(this.outputPendingState){e.preventDefault();return;}downloadedFiles.add(blob);renderDownload();});
      actions(group).appendChild(a);
    },
    portraitAdvice(text) {
      const advice=document.createElement('p');advice.className='portrait-advice';advice.textContent=text;
      el.insertBefore(advice,el.querySelector('.act'));
    },
    share(file, live = false, label = null, group = 'normal') {
      const b = document.createElement("button");
      b.className = "dl";
      b.type = "button";
      const text=document.createElement('span');
      const renderSave=()=>{const saved=savedFiles.has(file);b.classList.toggle('is-downloaded',saved);text.dataset.i18n=saved?'btn.saveagain':label||(live?'btn.savestill':'btn.save');text.textContent=T(text.dataset.i18n);};
      b.append(checkIcon(),text);renderSave();
      b.addEventListener("click", async () => {
        if (b.disabled) return;
        b.disabled = true;
        try { await navigator.share({ files: [file] });savedFiles.add(file);renderSave(); }
        catch (e) { if (e.name !== "AbortError") {text.dataset.i18n='btn.blocked';text.textContent=T('btn.blocked');} }
        finally { b.disabled = Boolean(this.outputPendingState); }
      });
      actions(group).prepend(b);
    },
  };
  remove.addEventListener('click',ui.dispose);resultCleanups.add(ui.dispose);return ui;
}

// Keep the normal result for toggle-off/cancellation. Only opt-in adds Portrait.
async function tryAiPortrait(source, outputFile, ui, name, sourceFile = null, preserveIncomplete = false) {
  const {portraitEligibility} = await import('./src/portrait/ai-portrait-container.js');
  const candidate = {outputFile, sourceFile, ui, name, state: 'new',
    skip: preserveIncomplete ? 'unverified-styles' : source ? portraitEligibility(source) : null};
  aiCandidates.push(candidate);
  if (aiFeatures.enabled('portrait')&&!candidate.skip) await runAiCandidate(candidate);
  else {
    if(candidate.skip){candidate.state='skipped';ui.aiState('');ui.note(candidate.skip==='unverified-styles'?aiText().compatibility:aiText().skip,candidate.skip==='unverified-styles'?'compatibility':'ai');}
    ui.output(outputFile);ui.aiBusy(false);
  }
}

async function runAiCandidate(candidate) {
  if (!aiFeatures.enabled('portrait') || !['new', 'failed'].includes(candidate.state)) return;
  const {ui, name, sourceFile} = candidate;
  if (candidate.skip) { candidate.state = 'skipped'; ui.aiState('');ui.note(candidate.skip==='unverified-styles'?aiText().compatibility:aiText().skip,candidate.skip==='unverified-styles'?'compatibility':'ai');ui.aiBusy(false); return; }
  candidate.state = 'running'; ui.aiState(aiText().loading);
  ui.note('', 'ai-error');
  ui.aiBusy(true);
  const controller=new AbortController();candidate.controller=controller;
  const removeCancel=ui.cancelAi(controller);
  // Downloads have a stall timeout; GPU phases have their own watchdog.
  const deadline=setTimeout(()=>controller.abort(new DOMException('AI timed out','TimeoutError')),600000);
  let lastStage='loading';
  const provider=gpuAcceleration.checked?'webgpu':'wasm';
  const modelId=selectedModel();
  try {
    const {createAiPortrait} = await import('./src/portrait/ai-portrait.js');
    const {exportAiPortrait} = await import('./src/portrait/ai-portrait-export.js');
    const data = new Uint8Array(await candidate.outputFile.arrayBuffer());
    // These serialized conversion jobs are finished. Free their WASM heaps
    // before loading the GPU model, especially after JPEG/PNG or thumbnails.
    releaseDecodeCache();releaseHevcEncoder();releaseRasterEncoder();releaseHeicProcessor();
    const result = await createAiPortrait(data,(stage,progress)=>{
      lastStage=stage;
      if(stage==='download'&&progress?.loaded){const percent=progress.total?` ${Math.min(100,Math.round(progress.loaded/progress.total*100))}%`:'';
        ui.aiState(`${aiText().download}${percent} · ${formatBytes(progress.loaded)}`);
      }else ui.aiState(stage==='inference'&&provider==='wasm'?aiText().inferenceCpu:aiText()[stage]||aiText().loading);
    },sourceFile,{signal:controller.signal,provider,modelId});
    lastStage='encoding';ui.aiState(aiText().encoding);
    const output=await exportAiPortrait(result,()=>{}, {signal:controller.signal});
    ui.cleanup(output.dispose);
    controller.signal.throwIfAborted();
    if(!aiFeatures.enabled('portrait'))throw new DOMException('AI disabled','AbortError');
    const date=photoCaptureDate(output.data);
    const publish=(data,metadata=true)=>{
      candidate.aiFile=new File([data],name.replace(/\.[^.]+$/,'')+'_Portrait.HEIC',{
        type:'image/heic',...(date?.timestamp!==undefined?{lastModified:date.timestamp}:{})});
      if(aiFeatures.enabled('portrait'))ui.output(candidate.aiFile,{metadata});
    };
    publish(output.data);
    try{await ui.portraitPreview(result,async(settings,isCurrent)=>{const updated=await output.withSettings(settings);if(isCurrent())publish(updated.data,false);});}
    catch(error){console.warn('Portrait preview unavailable; edit focus in Photos',error);}
    candidate.state = 'done';
    ui.aiView(aiFeatures.enabled('portrait'));
    if(aiFeatures.enabled('portrait')){ui.aiState('');ui.note(aiText().ready,'ai');}
  } catch(error) {
    candidate.state = error.name==='AbortError'?'new':'failed';
    console.warn('Optional AI Portrait failed',error);
    ui.aiState(!aiFeatures.enabled('portrait')?'':error.name==='AbortError'?aiText().cancelled:error.name==='TimeoutError'?aiText().timeout:error.message==='WEBGPU'?aiText().gpu:aiText().failed);
    if(aiFeatures.enabled('portrait')&&error.name!=='AbortError')ui.note(`${aiText().failureStage}: ${aiText()[error.stage||lastStage]||aiText().loading}. ${String(error.message||error).slice(0,180)}`,'ai-error');
  } finally {
    clearTimeout(deadline);removeCancel();candidate.controller=null;
    // Publish the normal fallback only after AI failed/cancelled. Never expose
    // it between Styles processing and the requested Portrait result.
    if(!candidate.aiFile||!aiFeatures.enabled('portrait'))ui.output(candidate.outputFile);
    ui.aiBusy(false);
  }
}

function stagePercent(done,total){
  return Number.isFinite(done)&&Number.isFinite(total)&&total>0 ? `${Math.min(100,Math.max(0,Math.round(done/total*100)))}%` : '';
}

async function handleFile(file) {
  const ui = row(file.name);
  const inputSize = file.size;
  try {
    ui.set(T("st.reading"));
    const input = await readImageFile(file);
    let bytes = input.bytes;
    if (/\.mov$/i.test(file.name) || file.type === "video/quicktime") {
      await handleMovie(file, bytes, ui);
      return;
    }
    let format = input.format;
    if(format==='dng'){
      if(!globalThis.crossOriginIsolated){ui.set(T('err.reloadencoder'),'err');return;}
      ui.set(lang==='vi'?'Đang giải mã DNG…':lang==='zh'?'正在解码 DNG…':'Developing DNG…');
      const {importDngFile}=await import('./src/dng/dng-import.js');
      try {file=await importDngFile(bytes,file.name,progress=>{
        const label=lang==='vi'?'Giải mã RAW':lang==='zh'?'解码 RAW':'Developing RAW';
        const percent=stagePercent(progress.done,progress.total);ui.set(percent?`${label} ${percent}`:label);
      });}catch(error){
        console.warn('DNG import failed',error);
        const reason=/JPEG XL/.test(error.message)?'JPEG XL':/large RAW/.test(error.message)?'oversized RAW':'decode';
        const messages={vi:{'JPEG XL':'DNG nén JPEG XL chưa được hỗ trợ.','oversized RAW':'Ảnh RAW này quá lớn cho cấu trúc hiện tại. Hãy xuất JPG/PNG để xử lý.','decode':'Không giải mã được DNG này. Hãy thử bản JPG/PNG.'},en:{'JPEG XL':'JPEG XL compressed DNG is not supported.','oversized RAW':'This RAW layout is too large. Export JPG/PNG to process it.','decode':'Could not decode this DNG. Try a JPG/PNG export.'}};
        ui.set((messages[lang]||messages.en)[reason],'err');return;
      }
      bytes=new Uint8Array(await file.arrayBuffer());format='png';
      ui.note(lang==='vi'?'DNG được giải mã thành ảnh sRGB để thêm Styles; bản xuất là HEIC, không còn RAW.':lang==='zh'?'DNG 转换为 sRGB 图像以添加风格；导出 HEIC，不保留 RAW。':'DNG is developed to sRGB for Styles; the HEIC output is no longer RAW.','raw');
    }
    if (RASTER_MIMES[format]) {

      if (!globalThis.crossOriginIsolated) { ui.set(T("err.reloadencoder"), "err"); return; }
      const { importRaster } = await import("./src/raster/raster-import.js");
      let result;
      try {
        result = await importRaster(new File([bytes], file.name, {type: RASTER_MIMES[format]}),
          null, progress => {
            if (progress.stage === "modelDownload")
              ui.set(`${T("st.encoderload")} ${(progress.loaded / 1048576).toFixed(1)} MB`);
            else if (progress.stage === "download" || progress.stage === "modelLoading")
              ui.set(aiText().detailPreparing);
            else if (progress.stage === "inference")
              ui.set(stagePercent(progress.progress?.done,progress.progress?.total) ? `${aiText().detailWorking} ${stagePercent(progress.progress?.done,progress.progress?.total)}` : aiText().detailWorking);
            else if (progress.stage === "main") ui.set(stagePercent(progress.done,progress.total) ? `${T("st.rastertiles")} ${stagePercent(progress.done,progress.total)}` : T("st.rastertiles"));
            else if (progress.stage === "auxiliary") ui.set(stagePercent(progress.done,progress.total) ? `${aiText().detailHdrWorking} ${stagePercent(progress.done,progress.total)}` : aiText().detailHdrWorking);
            else ui.set(T("st.rasterworking"));
          }, {analyze: true,detail:aiFeatures.enabled('detail')?{modelId:selectedModel(),provider:gpuAcceleration.checked?'webgpu':'wasm'}:null});
      } catch (error) {
        console.error("Raster conversion failed", file.name, error);
        ui.set(T(error.code==='err.hdrjpeg'?'err.hdrjpeg':/Raster image decode failed/i.test(error.message) ? "err.rasterdecode" : "err.rasterencode"), "err");
        return;
      }
      const outName = file.name.replace(/\.[^.]+$/, "") + "_PhotographicStyle.HEIC";
      if(result.detailSkipped)ui.note(`${aiText().detailSkipped} ${result.detailSkipped}`,'detail');
      else if(result.detailApplied)ui.note(aiText().detailApplied,'detail');
      result.data=await addMissingSoftSkin(result.data,file,ui);
      const date = photoCaptureDate(result.data);
      const output = new File([result.data], outName, {type: "image/heic",
        ...(date?.timestamp !== undefined ? {lastModified:date.timestamp} : {})});
      ui.readyNotice=`${T("st.ready")} — ${T("st.rasterready")}`;
      ui.note(result.hdr?T('raster.hdr'):result.geometry.resized ? T("raster.resized") : T("raster.note"), "conversion");
      showCaptureDate(ui, date);
      await ui.metadata(result.data, inputSize, {raster: !result.hdr, raw: input.format === 'dng'});
      await tryAiPortrait(null,output,ui,file.name,file);
      return;
    }
    if (format !== "heic") { ui.set(T("err.notheic"), "err"); return; }
    let d = input.discovery;
    if(aiFeatures.enabled('detail')){
      if(d.hdrGrid!==null&&d.hdrTiles?.length){
        if(!globalThis.crossOriginIsolated){
          ui.note(`${aiText().detailSkipped} ${T("err.reloadencoder")}`,'detail');
        }else{
          try{
            const {enhanceNativeHdrHeic}=await import('./src/detail/detail-native-heic.js');
            const enhanced=await enhanceNativeHdrHeic(bytes,{
              modelId:selectedModel(),provider:gpuAcceleration.checked?'webgpu':'wasm'
            },{onProgress:progress=>{
              if(progress.stage==='download'||progress.stage==='modelLoading')ui.set(aiText().detailPreparing);
              else if(progress.stage==='inference'){
                const percent=stagePercent(progress.progress?.done,progress.progress?.total);
                ui.set(percent?`${aiText().detailWorking} ${percent}`:aiText().detailWorking);
              }else if(/^hdr(Primary|Gain)(Decode|Encode)$/.test(progress.stage)){
                const percent=stagePercent(progress.done,progress.total);
                ui.set(percent?`${aiText().detailHdrWorking} ${percent}`:aiText().detailHdrWorking);
              }
              else if(progress.stage==='modelDownload')
                ui.set(`${T("st.encoderload")} ${(progress.loaded/1048576).toFixed(1)} MB`);
              else ui.set(aiText().detailHdrWorking);
            }});
            bytes=enhanced.data;d=discoverHeic(bytes);
            ui.note(aiText().detailHdrApplied,'detail');
          }catch(error){
            console.warn('Native HDR AI detail unavailable; preserving original HEIC',error);
            ui.note(`${aiText().detailSkipped} ${String(error?.message||error).slice(0,180)}`,'detail');
          }
        }
      }else ui.note(aiText().detailHeic,'detail');
    }

    const textureOnly = preserveNativeStyles(bytes,d);
    const nativeTexture = nativeTextureCapture(bytes,d);
    const {nativePortraitBaseState}=await import('./src/portrait/ai-portrait-container.js');
    const portraitState=nativePortraitBaseState(bytes,d);
    const rebuildNativePortrait=textureOnly&&d.stylesItem===null&&portraitState!==null;
    const preserveIncomplete = textureOnly && d.stylesItem === null&&!rebuildNativePortrait;
    let sharpBackgroundEvidence=null;
    let restorePortrait=portraitState==='legacy-photo-base';
    if (styleReconstructionRisk(bytes,d)&&!rebuildNativePortrait) ui.note(T('warn.textureonly'),'style-rebuild');
    const liveIdentifier = photoContentIdentifier(bytes);
    ui.liveIdentifier=liveIdentifier;
    const sep = lang === "zh" ? "、" : ", ";
    let data, bits, suffix;
    if (nativeTexture && !hasTexture(d.infos)) {
      // iPhone 18+ native captures can expose Texture/Film through capture metadata
      // without the grafted texture_styles/matte graph. Never graft a second Texture
      // contract onto those files; Photos already owns the native render path.
      data=bytes;
      bits=[T('st.native'),T('st.texture')];
      suffix='_Preserved.HEIC';
    } else if (preserveIncomplete) {
      // A selected preset is not the Styles editing graph. Adding Texture alone
      // advertises a new renderer without the colour resources it needs. Keep
      // this incomplete native export intact and register only its own HDR map.
      ({data} = await repairTextureInWorker(bytes,{preserveStyles:true}));
      data ||= bytes;
      bits = [T('st.original')];
      suffix = '_Preserved.HEIC';
    } else if ((textureOnly&&!rebuildNativePortrait) || d.stylesItem !== null) {
      // A native iPhone 16/17 style photo is never re-ported (that would replace its real
      // style data); it only gets the iOS 27 Texture/Grain set added.
      ui.set(T("st.working"));
      if (hasTexture(d.infos)) {
        ({data} = await repairTextureInWorker(bytes,{preserveStyles:textureOnly}));
        // A complete Styles file can still be used as input for opt-in Portrait.
        bits = data ? [T('st.native'), T('st.texturerepaired')] : [T('st.native'),T('st.texture')];
        suffix = data ? '_TextureFixed.HEIC' : '_SoftSkin.HEIC';
        data ||= bytes;
      } else {
        ({ data } = await addTextureInWorker(bytes,{preserveStyles:textureOnly,allowMissingStyles:textureOnly}));
        bits = [T("st.native"), T("st.texture")];
        suffix = "_TextureGrain.HEIC";
      }
    } else {
      const needsExperimental = d.hdrGrid === null
        || !styleDeltaSize(...dimensionsForItem(d.props, d.primary));
      const index=await ensureProfileIndex();
      const name = profileFor(index, d, needsExperimental);
      const profile = await getProfile(name);
      // Start processing; if the thumbnail is missing, dynamically load the generator.
      let linearThumb = undefined;
      if (d.thumbnail === null) {

        if (!globalThis.crossOriginIsolated) { ui.set(T("err.reloadencoder"), "err"); return; }
        const { generateLinearThumbnail } = await import("./src/codecs/linear-thumbnail.js");
        try {
          linearThumb = await generateLinearThumbnail(bytes, progress => {
            if (progress.stage === "modelDownload")
              ui.set(`${T("st.encoderload")} ${(progress.loaded / 1048576).toFixed(1)} MB`);
            else ui.set(T(progress.stage === "encode" ? "st.thumbnail" : "st.working"));
          });
        } catch (e) {
          console.error("could not generate thumbnail", e);
          ui.set(T("err.encoder"), "err");
          return;
        }
      }

      // Finish thumbnail encoding before retaining a decoded primary canvas:
      // keeping both full-resolution jobs live increases Safari's memory peak.
      if(rebuildNativePortrait&&portraitState!=='existing-renderer'){
        ui.set(T('st.working'));
        try{
          const {analyzeNativePortraitBase}=await import('./src/portrait/native-base-analysis.js');
          sharpBackgroundEvidence=await analyzeNativePortraitBase(bytes,d);
          restorePortrait ||= Boolean(sharpBackgroundEvidence);
        }catch(error){console.warn('Native background analysis unavailable',error);}
      }
      const canDecode = await ensureDecode(bytes);
      ui.set(T("st.working"));
      const opts = canDecode
        ? { decode: decodeToRgb, sceneStats: "target", lightMaps: "target", linearThumb, experimental: needsExperimental, texture: !hasTexture(d.infos) }
        : { sceneStats: "donor", linearThumb, experimental: needsExperimental, texture: !hasTexture(d.infos) };
      opts.portraitStyleRebuild=rebuildNativePortrait;
      opts.sharpBackgroundEvidence=sharpBackgroundEvidence;
      let report;
      ({ data, report } = await patchInWorker(bytes, profile, opts));
      // patch() degrades rather than failing when the decoder misbehaves, so trust
      // what it reports it actually did, not what we asked for.
      if (report.decodeError) console.warn("decoder unavailable:", report.decodeError);
      if(report.styleSelectionCompatibility==='portrait-standard')ui.note(T('warn.portraitstandard'),'style-rebuild');
      else if(report.styleSelectionCompatibility==='bright-palette70')ui.note(T('warn.brightcompat'),'style-rebuild');

      bits = [T(report.decoded ? "st.matched" : "st.neutral")];
      if (report.mattes.added.some((m) => m.startsWith("depth"))) bits.push(T("st.portrait"));
      else if (report.mattes.transplanted.length) bits.push(T("st.people"));
      if (report.texture !== "off") bits.push(T("st.texture"));
      if (needsExperimental) bits.push(T("st.experimental"));
      suffix = needsExperimental ? "_ExperimentalStyle.HEIC" : "_PhotographicStyle.HEIC";
    }
    if (!preserveIncomplete)
      data=await addMissingSoftSkin(data,file,ui,{nativeStyles:textureOnly||d.stylesItem!==null,sourceBytes:bytes});
    if(restorePortrait&&!preserveIncomplete){
      const restored=await restoreNativePortraitInWorker(data,{sharpBackgroundEvidence});
      if(restored.data){data=restored.data;bits.push(T('st.portraitrestored'));}
    }
    ui.readyNotice=`${T("st.ready")} — ${bits.join(sep)}`;

    const outName = file.name.replace(/\.[^.]+$/, "") + suffix;
    // On iPhone the share sheet lands the file straight in Photos; elsewhere a plain
    // download is the shorter route.
    const date = photoCaptureDate(data);
    const shareFile = new File([data], outName, { type: "image/heic",
      ...(date?.timestamp !== undefined ? {lastModified:date.timestamp} : {}) });
    showCaptureDate(ui, date);
    await ui.metadata(data, inputSize);
    if (liveIdentifier) {
      ui.note(T("live.waitmovie"));
      const exporter=createLivePhotoExport(bytes,{
        onReady({data:zip,name}){
          ui.link(new Blob([zip],{type:'application/zip'}),name,'btn.livezip');
          ui.outputPending(Boolean(ui.outputPendingState));
          ui.note(T('live.paired'));
          liveMovies.get(liveIdentifier)?.ui.set(T('live.matched'),'ok');
        },
        onError(error){console.error('Live Photo export stopped',error);ui.note(T('live.changed'));},
      });
      ui.liveExporter=exporter;ui.cleanup(()=>exporter.dispose());
      const photo = { identifier: liveIdentifier, exporter, ui };
      livePhotos.push(photo);
      attachMovie(photo);
    }
    await tryAiPortrait(bytes,shareFile,ui,file.name,file,preserveIncomplete);
    if(preserveIncomplete)ui.portraitAdvice(T('warn.nativeeditmissing'));
    else if(portraitState&&portraitState!=='existing-renderer'&&!restorePortrait)
      ui.portraitAdvice(T(portraitState==='portrait-capture'?'warn.portraiton':'warn.portraitunknown'));
  } catch (e) {
    // Past the format sniff, every remaining rejection means the same thing to a
    // visitor: this is a HEIC, but not one this build can handle. The real reason
    // still goes to the console, because "unsupported" on every photo is exactly
    // how a bug elsewhere would look.
    console.error("could not port", file.name, e);
    ui.set(T(e?.code==="APP_RESOURCE_UNAVAILABLE"?"err.resources":"err.unsupported"), "err");
  } finally {
    // Samples belong to this serialized processing operation, not its history
    // row. Release them after export while retaining only the downloadable file.
    releaseDecodeCache();releaseHevcEncoder();releaseRasterEncoder();releaseHeicProcessor();
  }
}

function showCaptureDate(ui, date) {
  if (!date) ui.note(T('date.missing'), 'date');
}

async function handleFiles(files) {
  for (const f of files){await waitForVisiblePage();await handleFile(f);}
}
// Serialize separate picker/drop events so duplicate MOVs cannot race pairing.
let fileQueue = Promise.resolve();
const enqueueFiles = (files) => { if (browserReady&&!clearingAssets) queueTask(() => handleFiles(files)); };

drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  enqueueFiles([...e.dataTransfer.files]);
});
drop.addEventListener("click", () => { if (browserReady) fileInput.click(); });
drop.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (browserReady) fileInput.click(); }
});
fileInput.addEventListener("change", () => {
  enqueueFiles([...fileInput.files]);
  fileInput.value = "";
});

$("lang").addEventListener("change", () => {
  lang = $("lang").value;
  rememberLanguage(lang);
  applyLanguage(lang);
  translateAi();
});

// Visit counter behind the README badge. The only request this site makes to a
// counter service, and it carries nothing but the fact that the page was opened —
// no photo ever reaches it. Fired once per browser session so a reload is not a
// new visit, and fire-and-forget: a counter that is down is not worth an error.
// If sessionStorage is blocked the visit goes uncounted, which undercounts
// rather than counting every reload of a private-mode window as a new visitor.
function countVisit() {
  try {
    if (sessionStorage.getItem("counted")) return;
    sessionStorage.setItem("counted", "1");
  } catch (e) {
    return;
  }
  fetch("https://abacus.jasoncameron.dev/hit/nathanatgit-shalielie/web").catch(() => {});
}

(async () => {
  applyLanguage(lang);
  translateAi();
  $("version").textContent = VERSION;
  countVisit();
  $('boot').textContent = T('st.preparing');
  try {
    const browserMode=await prepareBrowser();
    if(browserMode==='reloading')return;
    // The profile index is only required by legacy/full reconstruction. A transient
    // deploy/cache miss must not block native HEIC editing or the rest of the UI.
    try{profileIndex=await fetchJsonWithRetry('profiles/index.json',{attempts:2});}
    catch(error){console.warn('Profile index will be retried on demand',error);profileIndex=null;}

    browserReady = true;refreshHistoryButton();
    fileInput.disabled = false; drop.setAttribute('aria-disabled', 'false');
    aiFeatures.sync();
    $('boot').textContent = '';
    navigator.serviceWorker?.controller?.postMessage({type:'WARM_CACHE'});
    // Prepare automatically; native HEIC can be processed while this downloads.
    // Conversion awaits the same promise, so it never races runtime loading.
    if(browserMode==='ready')prepareHevcAssets().catch(error => console.warn('Background preparation failed; conversion will retry', error));
    else console.warn('Running without cross-origin isolation; threaded HEVC/AI features will request isolation when used.');
  } catch (e) {
    console.error('Browser preparation failed', e);
    $("boot").textContent = T(e?.code==='BROWSER_INSECURE_CONTEXT'?'err.setup':'err.resources');
    $("boot").className = "err";
    const retry = document.createElement('button');
    retry.className = 'dl alt'; retry.type = 'button'; retry.textContent = T('btn.retry');
    retry.addEventListener('click', () => location.reload());
    $('boot').append(document.createElement('br'), retry);
  }
})();
