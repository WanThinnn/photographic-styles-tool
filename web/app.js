import { loadProfile } from "./src/zip.js";
import { profileFor, VERSION, UNSUPPORTED } from "./src/port.js";
import { dimensionsForItem } from "./src/heif.js";
import { styleDeltaSize } from "./src/graft.js";
import { hasTexture } from "./src/texture.js";
import { decodeToRgb, loadLibheif, releaseDecodeCache } from "./src/decode.js";
import { pickLanguage, rememberLanguage, applyLanguage, t } from "./src/i18n.js";
import { photoContentIdentifier, moviePairingMetadata, livePhotoPackage } from "./src/live-photo.js";
import { RASTER_MIMES } from "./src/image-format.js";
import { photoCaptureDate } from "./src/photo-date.js";
import { styleReconstructionRisk } from "./src/style-preservation.js";
import { AI_STRINGS } from "./src/ai-strings.js";
import {prepareBrowser} from './src/startup.js';
import {prepareHevcAssets, releaseHevcEncoder} from './src/ffmpeg-hevc.js';
import {releaseHevcEncoder as releaseRasterEncoder} from './src/raster/ffmpeg-hevc.js';
import {readImageFile, addTextureInWorker, repairTextureInWorker, patchInWorker, releaseHeicProcessor, describeInWorker} from './src/heic-processing.js';
import {formatBytes} from './src/result-metadata.js';
import {hasSoftSkinData} from './src/soft-skin-container.js';
import {styleCapabilities} from './src/style-capabilities.js';

const $ = (id) => document.getElementById(id);
const fileInput = $("file"), drop = $("drop"), list = $("list");
const aiPortrait = $("ai-portrait");
const clearHistory = $('clear-history');
const resultUrls = new Set(), resultCleanups = new Set();
const aiCandidates = [];
let browserReady = false, pendingTasks = 0;
function refreshHistoryButton() {
  clearHistory.hidden = !list.childElementCount;
  clearHistory.disabled = pendingTasks > 0;
}
function queueTask(task) {
  pendingTasks++; refreshHistoryButton();
  const pending = fileQueue.catch(() => {}).then(task);
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
  releaseHevcEncoder(); releaseRasterEncoder(); releaseHeicProcessor(); refreshHistoryButton();
});
const aiText = () => AI_STRINGS[lang] || AI_STRINGS.en;
function translateAi() {
  $("ai-portrait-label").textContent = aiText().toggle;
  $("ai-portrait-hint").textContent = aiText().hint;
  $("ai-portrait-hint").hidden = !aiPortrait.checked;
}
aiPortrait.addEventListener('change', () => {
  translateAi();
  for (const candidate of aiCandidates) {
    if (!aiPortrait.checked) {
      candidate.controller?.abort();
      candidate.ui.outputPending(false);
      candidate.ui.output(candidate.outputFile);
      candidate.ui.aiView(false);candidate.ui.aiBusy(false);
      candidate.ui.aiState('');candidate.ui.note('', 'ai');
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
    const {completeSoftSkin}=await import('./src/soft-skin.js');
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
  if (!movie || photo.paired) return;
  try {
    const zip = livePhotoPackage(photo.source, photo.output, movie.bytes, photo.name);
    photo.ui.link(new Blob([zip], { type: "application/zip" }),
      photo.name.replace(/\.[^.]+$/, "") + "_LivePhoto.zip", "btn.livezip");
    photo.ui.note(T("live.paired"));
    movie.ui.set(T("live.matched"), "ok");
    photo.paired = true;
  } catch (e) {
    console.error("Live Photo export stopped", e);
    photo.ui.note(T("live.changed"));
  }
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

async function getProfile(name) {
  if (!profileCache.has(name)) {
    const res = await fetch(`profiles/${profileIndex[name].file}`);
    if (!res.ok) throw new Error(UNSUPPORTED);
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
  const cleanups=new Set();let disposed=false;
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
      const {portraitPreview}=await import('./src/ai-portrait-preview.js');
      el.querySelector('.ai-details')?.remove();
      const host=document.createElement('section');host.className='ai-details';host.setAttribute('aria-label',aiText().preview);
      el.insertBefore(host,el.querySelector('.act'));
      try{
        this.cleanup(portraitPreview(result,host,aiText(),onSettings,{onPending:pending=>{
          this.portraitPending=pending;if(aiPortrait.checked)this.outputPending(pending);
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
      a.textContent = T(key);
      a.className = "dl alt";
      a.addEventListener('click',e=>{if(this.outputPendingState)e.preventDefault();});
      actions(group).appendChild(a);
    },
    rebuildStyle(action) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'dl alt rebuild-style';
      b.textContent = T("btn.rebuildstyle");
      b.addEventListener('click', () => { b.remove(); action(); }, {once: true});
      el.querySelector('.act').appendChild(b);
    },
    share(file, live = false, label = null, group = 'normal') {
      const b = document.createElement("button");
      b.className = "dl";
      b.type = "button";
      b.textContent = T(label || (live ? "btn.savestill" : "btn.save"));
      b.addEventListener("click", async () => {
        if (b.disabled) return;
        b.disabled = true;
        try { await navigator.share({ files: [file] }); }
        catch (e) { if (e.name !== "AbortError") b.textContent = T("btn.blocked"); }
        finally { b.disabled = Boolean(this.outputPendingState); }
      });
      actions(group).prepend(b);
    },
  };
  remove.addEventListener('click',ui.dispose);resultCleanups.add(ui.dispose);return ui;
}

// Keep the normal result for toggle-off/cancellation. Only opt-in adds Portrait.
async function tryAiPortrait(source, outputFile, ui, name, sourceFile = null) {
  const {portraitEligibility} = await import('./src/ai-portrait-container.js');
  const candidate = {outputFile, sourceFile, ui, name, state: 'new',
    skip: source ? portraitEligibility(source) : null};
  aiCandidates.push(candidate);
  if (aiPortrait.checked&&!candidate.skip) await runAiCandidate(candidate);
  else {
    if(candidate.skip){candidate.state='skipped';ui.aiState('');ui.note(candidate.skip==='unverified-styles'?aiText().compatibility:aiText().skip,candidate.skip==='unverified-styles'?'compatibility':'ai');}
    ui.output(outputFile);ui.aiBusy(false);
  }
}

async function runAiCandidate(candidate) {
  if (!aiPortrait.checked || !['new', 'failed'].includes(candidate.state)) return;
  const {ui, name, sourceFile} = candidate;
  if (candidate.skip) { candidate.state = 'skipped'; ui.aiState('');ui.note(candidate.skip==='unverified-styles'?aiText().compatibility:aiText().skip,candidate.skip==='unverified-styles'?'compatibility':'ai');ui.aiBusy(false); return; }
  candidate.state = 'running'; ui.aiState(aiText().loading);
  ui.aiBusy(true);
  const controller=new AbortController();candidate.controller=controller;
  const removeCancel=ui.cancelAi(controller);
  // Downloads have a stall timeout; GPU phases have their own watchdog.
  const deadline=setTimeout(()=>controller.abort(new DOMException('AI timed out','TimeoutError')),600000);
  try {
    const {createAiPortrait} = await import('./src/ai-portrait.js');
    const {exportAiPortrait} = await import('./src/ai-portrait-export.js');
    const data = new Uint8Array(await candidate.outputFile.arrayBuffer());
    const result = await createAiPortrait(data,(stage,progress)=>{
      if(stage==='download'&&progress?.loaded){const percent=progress.total?` ${Math.min(100,Math.round(progress.loaded/progress.total*100))}%`:'';
        ui.aiState(`${aiText().download}${percent} · ${formatBytes(progress.loaded)}`);
      }else ui.aiState(aiText()[stage]||aiText().loading);
    },sourceFile,{signal:controller.signal});
    ui.aiState(aiText().encoding);
    const output=await exportAiPortrait(result,()=>{}, {signal:controller.signal});
    ui.cleanup(output.dispose);
    controller.signal.throwIfAborted();
    if(!aiPortrait.checked)throw new DOMException('AI disabled','AbortError');
    const date=photoCaptureDate(output.data);
    const publish=(data,metadata=true)=>{
      candidate.aiFile=new File([data],name.replace(/\.[^.]+$/,'')+'_Portrait.HEIC',{
        type:'image/heic',...(date?.timestamp!==undefined?{lastModified:date.timestamp}:{})});
      if(aiPortrait.checked)ui.output(candidate.aiFile,{metadata});
    };
    publish(output.data);
    try{await ui.portraitPreview(result,async(settings,isCurrent)=>{const updated=await output.withSettings(settings);if(isCurrent())publish(updated.data,false);});}
    catch(error){console.warn('Portrait preview unavailable; edit focus in Photos',error);}
    candidate.state = 'done';
    ui.aiView(aiPortrait.checked);
    if(aiPortrait.checked){ui.aiState('');ui.note(aiText().ready,'ai');}
  } catch(error) {
    candidate.state = error.name==='AbortError'?'new':'failed';
    console.warn('Optional AI Portrait failed',error);
    ui.aiState(!aiPortrait.checked?'':error.name==='AbortError'?aiText().cancelled:error.name==='TimeoutError'?aiText().timeout:error.message==='WEBGPU'?aiText().gpu:aiText().failed);
  } finally {
    clearTimeout(deadline);removeCancel();candidate.controller=null;
    // Publish the normal fallback only after AI failed/cancelled. Never expose
    // it between Styles processing and the requested Portrait result.
    if(!candidate.aiFile||!aiPortrait.checked)ui.output(candidate.outputFile);
    ui.aiBusy(false);
  }
}

async function handleFile(file, {allowStyleRebuild = false, existingUi = null} = {}) {
  const ui = existingUi || row(file.name);
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
        ui.set(progress.total&&progress.done?`${label} ${progress.done}/${progress.total}`:label);
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
            else if (progress.stage === "main") ui.set(`${T("st.rastertiles")} ${progress.done}/${progress.total}`);
            else ui.set(T("st.rasterworking"));
          }, {analyze: true});
      } catch (error) {
        console.error("Raster conversion failed", file.name, error);
        ui.set(T(error.code==='err.hdrjpeg'?'err.hdrjpeg':/Raster image decode failed/i.test(error.message) ? "err.rasterdecode" : "err.rasterencode"), "err");
        return;
      }
      const outName = file.name.replace(/\.[^.]+$/, "") + "_PhotographicStyle.HEIC";
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

    const d = input.discovery;
    if (!hasTexture(d.infos) && styleReconstructionRisk(bytes, d)) {
      if (!allowStyleRebuild) {
        ui.set(T("err.stylesmissing"), "info");
        ui.rebuildStyle(() => {
          queueTask(() => handleFile(file, {allowStyleRebuild: true, existingUi: ui}));
        });
        return;
      }
      ui.note(T("warn.stylerebuild"), 'style-rebuild');
    }
    const liveIdentifier = photoContentIdentifier(bytes);
    ui.liveIdentifier=liveIdentifier;
    const sep = lang === "zh" ? "、" : ", ";
    let data, bits, suffix;
    if (d.stylesItem !== null) {
      // A native iPhone 16/17 style photo is never re-ported (that would replace its real
      // style data); it only gets the iOS 27 Texture/Grain set added.
      ui.set(T("st.working"));
      if (hasTexture(d.infos)) {
        ({data} = await repairTextureInWorker(bytes));
        // A complete Styles file can still be used as input for opt-in Portrait.
        bits = data ? [T('st.native'), T('st.texturerepaired')] : [T('st.native'),T('st.texture')];
        suffix = data ? '_TextureFixed.HEIC' : '_SoftSkin.HEIC';
        data ||= bytes;
      } else {
        ({ data } = await addTextureInWorker(bytes));
        bits = [T("st.native"), T("st.texture")];
        suffix = "_TextureGrain.HEIC";
      }
    } else {
      const needsExperimental = d.hdrGrid === null
        || !styleDeltaSize(...dimensionsForItem(d.props, d.primary));
      const name = profileFor(profileIndex, d, needsExperimental);
      const profile = await getProfile(name);
      // Start processing; if the thumbnail is missing, dynamically load the generator.
      let linearThumb = undefined;
      if (d.thumbnail === null) {
        if (!globalThis.crossOriginIsolated) { ui.set(T("err.reloadencoder"), "err"); return; }
        const { generateLinearThumbnail } = await import("./src/linear-thumbnail.js");
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

      const canDecode = await ensureDecode(bytes);
      ui.set(T("st.working"));
      const opts = canDecode
        ? { decode: decodeToRgb, sceneStats: "target", lightMaps: "target", linearThumb, experimental: needsExperimental }
        : { sceneStats: "donor", linearThumb, experimental: needsExperimental };
      let report;
      ({ data, report } = await patchInWorker(bytes, profile, opts));
      // patch() degrades rather than failing when the decoder misbehaves, so trust
      // what it reports it actually did, not what we asked for.
      if (report.decodeError) console.warn("decoder unavailable:", report.decodeError);

      bits = [T(report.decoded ? "st.matched" : "st.neutral")];
      if (report.mattes.added.some((m) => m.startsWith("depth"))) bits.push(T("st.portrait"));
      else if (report.mattes.transplanted.length) bits.push(T("st.people"));
      if (report.texture !== "off") bits.push(T("st.texture"));
      if (needsExperimental) bits.push(T("st.experimental"));
      suffix = needsExperimental ? "_ExperimentalStyle.HEIC" : "_PhotographicStyle.HEIC";
    }
    data=await addMissingSoftSkin(data,file,ui,{nativeStyles:d.stylesItem!==null,sourceBytes:bytes});
    ui.readyNotice=`${T("st.ready")} — ${bits.join(sep)}`;

    const outName = file.name.replace(/\.[^.]+$/, "") + suffix;
    // On iPhone the share sheet lands the file straight in Photos; elsewhere a plain
    // download is the shorter route.
    const date = photoCaptureDate(data);
    const shareFile = new File([data], outName, { type: "image/heic",
      ...(date?.timestamp !== undefined ? {lastModified:date.timestamp} : {}) });
    showCaptureDate(ui, date);
    await ui.metadata(data, inputSize);
    await tryAiPortrait(bytes,shareFile,ui,file.name,file);
    if (liveIdentifier) {
      ui.note(T("live.waitmovie"));
      const photo = { identifier: liveIdentifier, source: bytes, output: data, name: outName, ui };
      livePhotos.push(photo);
      attachMovie(photo);
    }
  } catch (e) {
    // Past the format sniff, every remaining rejection means the same thing to a
    // visitor: this is a HEIC, but not one this build can handle. The real reason
    // still goes to the console, because "unsupported" on every photo is exactly
    // how a bug elsewhere would look.
    console.error("could not port", file.name, e);
    ui.set(T("err.unsupported"), "err");
  } finally {
    // Samples belong to this serialized processing operation, not its history
    // row. Release them after export while retaining only the downloadable file.
    releaseDecodeCache();
  }
}

function showCaptureDate(ui, date) {
  if (!date) ui.note(T('date.missing'), 'date');
}

async function handleFiles(files) {
  for (const f of files) await handleFile(f);
}
// Serialize separate picker/drop events so duplicate MOVs cannot race pairing.
let fileQueue = Promise.resolve();
const enqueueFiles = (files) => { if (browserReady) queueTask(() => handleFiles(files)); };

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
    if (await prepareBrowser() !== 'ready') return;
    const response = await fetch('profiles/index.json');
    if (!response.ok) throw Error('Profile index unavailable');
    profileIndex = await response.json();
    browserReady = true;
    fileInput.disabled = false; drop.setAttribute('aria-disabled', 'false');
    aiPortrait.disabled=false;
    $('boot').textContent = '';
    navigator.serviceWorker?.controller?.postMessage({type:'WARM_CACHE'});
    // Prepare automatically; native HEIC can be processed while this downloads.
    // Conversion awaits the same promise, so it never races runtime loading.
    prepareHevcAssets().catch(error => console.warn('Background preparation failed; conversion will retry', error));
  } catch (e) {
    console.error('Browser preparation failed', e);
    $("boot").textContent = T('err.setup');
    $("boot").className = "err";
    const retry = document.createElement('button');
    retry.className = 'dl alt'; retry.type = 'button'; retry.textContent = T('btn.retry');
    retry.addEventListener('click', () => location.reload());
    $('boot').append(document.createElement('br'), retry);
  }
})();
