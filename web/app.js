import { loadProfile } from "./src/zip.js";
import { patch, profileFor, VERSION, UNSUPPORTED } from "./src/port.js";
import { discoverHeic, dimensionsForItem } from "./src/heif.js";
import { styleDeltaSize } from "./src/graft.js";
import { addTexture, hasTexture } from "./src/texture.js";
import { decodeToRgb, loadLibheif } from "./src/decode.js";
import { pickLanguage, rememberLanguage, applyLanguage, t } from "./src/i18n.js";
import { photoContentIdentifier, moviePairingMetadata, livePhotoPackage } from "./src/live-photo.js";
import { imageFormat, RASTER_MIMES } from "./src/image-format.js";
import { photoCaptureDate } from "./src/photo-date.js";
import { AI_STRINGS, blurPreview } from "./src/ai-portrait-ui.js";

const $ = (id) => document.getElementById(id);
const fileInput = $("file"), drop = $("drop"), list = $("list"), quality = $("quality");
const aiPortrait = $("ai-portrait");
const aiText = () => AI_STRINGS[lang] || AI_STRINGS.en;
function translateAi() {
  $("ai-portrait-label").textContent = aiText().toggle;
  $("ai-portrait-hint").textContent = aiText().hint;
  $("ai-portrait-hint").hidden = !aiPortrait.checked;
}
aiPortrait.addEventListener('change',translateAi);

// Fetch the decoder while the visitor is still choosing a photo (or switches analysis on),
// so the first photo does not wait for the download, and someone just reading the page
// downloads nothing. A failure here is harmless: ensureDecode() tries again and falls back.
const warmDecoder = () => { if (quality.checked) loadLibheif().catch(() => {}); };
quality.addEventListener("change", warmDecoder);
for (const ev of ["pointerdown", "dragenter", "focus"]) drop.addEventListener(ev, warmDecoder, { once: true });

let lang = pickLanguage();
const T = (key) => t(lang, key);

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
let decodeAvailable = null;
async function ensureDecode(bytes) {
  if (decodeAvailable !== null) return decodeAvailable;
  try {
    await loadLibheif();
    await decodeToRgb(bytes, { width: 8, height: 8 });
    decodeAvailable = true;
  } catch (e) {
    console.warn("image analysis unavailable, using neutral settings:", e);
    decodeAvailable = false;
  }
  return decodeAvailable;
}

function row(name) {
  const el = document.createElement("div");
  el.className = "row";
  el.innerHTML = `<div class="name"></div><div class="status"></div><div class="act"></div>`;
  el.querySelector(".name").textContent = name;
  el.querySelector(".name").title = name;
  list.appendChild(el);
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
  return {
    aiState(text) {
      let state=el.querySelector('.ai-status');
      if(!state){state=document.createElement('p');state.className='ai-status';el.append(state);}
      state.textContent=text;
    },
    preview(result,name) {
      const details = document.createElement('details');
      details.className = 'ai-details';details.open=true;
      const summary = document.createElement('summary');summary.textContent = aiText().preview;
      details.append(summary);el.append(details);
      // The main save buttons would otherwise save the unblurred Styles result.
      // Keep that fallback in details while the bokeh editor owns its export.
      const baseActions=el.querySelector('.act'),conversionDetails=el.querySelector('.result-details');
      if(baseActions&&conversionDetails){conversionDetails.append(baseActions);baseActions.classList.add('bokeh-fallback');}
      if(baseActions){
        const group=baseActions.querySelector('.output-actions');
        if(group&&!group.querySelector('.output-label')){
          const label=document.createElement('span');label.className='output-label';
          label.textContent=lang==='vi'?'Styles chưa xóa phông':lang==='zh'?'未虚化风格':'Styles without bokeh';group.prepend(label);
        }
      }
      blurPreview(result, details, aiText(),async settings=>{
        const task=async()=>{
          const {exportBokehStyles}=await import('./src/ai-bokeh-export.js');
          const output=await exportBokehStyles(result,settings,()=>{},quality.checked);
          const date=photoCaptureDate(output.data);
          return {file:new File([output.data],name.replace(/\.[^.]+$/,'')+'_Bokeh_Styles.HEIC',{
            type:'image/heic',...(date?.timestamp!==undefined?{lastModified:date.timestamp}:{})}),resized:output.resized};
        };
        const pending=fileQueue.catch(()=>{}).then(task);fileQueue=pending.catch(()=>{});return pending;
      });
    },
    set(text, cls) {
      const s = el.querySelector(".status");
      s.textContent = cls === 'ok' ? T("st.ready") : text;
      if (cls === 'ok') this.note(text, 'processing');
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
      a.download = filename;
      a.textContent = T(key);
      a.className = "dl alt";
      actions(group).appendChild(a);
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
        finally { b.disabled = false; }
      });
      actions(group).prepend(b);
    },
  };
}

// Add a separate opt-in result after the stable converter finishes. AI failure
// cannot replace or suppress the normal export, and native sources bypass it.
async function tryAiPortrait(source, data, ui, name,sourceFile=null) {
  if (!aiPortrait.checked) return;
  try {
    const {portraitEligibility} = await import('./src/ai-portrait-container.js');
    if (source && portraitEligibility(source)) {ui.note(aiText().skip,'ai');return;}
    const {createAiPortrait} = await import('./src/ai-portrait.js');
    const result = await createAiPortrait(data,stage => ui.aiState(aiText()[stage] || stage),sourceFile);
    ui.preview(result,name);ui.aiState('');ui.note(aiText().ready,'ai');
  } catch(error) {
    console.warn('Optional AI Portrait failed',error);
    ui.aiState(error.message==='WEBGPU'?aiText().gpu:aiText().failed);
  }
}

async function handleFile(file) {
  const ui = row(file.name);
  try {
    ui.set(T("st.reading"));
    let bytes = new Uint8Array(await file.arrayBuffer());
    if (/\.mov$/i.test(file.name) || file.type === "video/quicktime") {
      await handleMovie(file, bytes, ui);
      return;
    }
    let format = imageFormat(bytes);
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
          }, {analyze: quality.checked});
      } catch (error) {
        console.error("Raster conversion failed", file.name, error);
        ui.set(T(/Raster image decode failed/i.test(error.message) ? "err.rasterdecode" : "err.rasterencode"), "err");
        return;
      }
      const outName = file.name.replace(/\.[^.]+$/, "") + "_PhotographicStyle.HEIC";
      const date = photoCaptureDate(result.data);
      const output = new File([result.data], outName, {type: "image/heic",
        ...(date?.timestamp !== undefined ? {lastModified:date.timestamp} : {})});
      ui.set(`${T("st.ready")} — ${T("st.rasterready")}`, "ok");
      ui.note(result.geometry.resized ? T("raster.resized") : T("raster.note"), "conversion");
      showCaptureDate(ui, date);
      if (navigator.canShare?.({files: [output]})) ui.share(output);
      ui.link(output, outName);
      await tryAiPortrait(null,result.data,ui,file.name,file);
      return;
    }
    if (format !== "heic") { ui.set(T("err.notheic"), "err"); return; }

    const d = discoverHeic(bytes);
    const liveIdentifier = photoContentIdentifier(bytes);
    const sep = lang === "zh" ? "、" : ", ";
    let data, bits, suffix;
    if (d.stylesItem !== null) {
      // A native iPhone 16/17 style photo is never re-ported (that would replace its real
      // style data); it only gets the iOS 27 Texture/Grain set added.
      if (hasTexture(d.infos)) { ui.set(T("err.hastexture"), "err"); return; }
      ui.set(T("st.working"));
      ({ data } = addTexture(bytes));
      bits = [T("st.native"), T("st.texture")];
      suffix = "_TextureGrain.HEIC";
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

      const canDecode = quality.checked ? await ensureDecode(bytes) : false;
      ui.set(T("st.working"));
      const opts = canDecode
        ? { decode: decodeToRgb, sceneStats: "target", lightMaps: "target", linearThumb, experimental: needsExperimental }
        : { sceneStats: "donor", linearThumb, experimental: needsExperimental };
      let report;
      ({ data, report } = await patch(bytes, profile, opts));
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
    ui.set(`${T("st.ready")} — ${bits.join(sep)}`, "ok");

    const outName = file.name.replace(/\.[^.]+$/, "") + suffix;
    // On iPhone the share sheet lands the file straight in Photos; elsewhere a plain
    // download is the shorter route.
    const date = photoCaptureDate(data);
    const shareFile = new File([data], outName, { type: "image/heic",
      ...(date?.timestamp !== undefined ? {lastModified:date.timestamp} : {}) });
    showCaptureDate(ui, date);
    if (navigator.canShare && navigator.canShare({ files: [shareFile] })) ui.share(shareFile, !!liveIdentifier);
    ui.link(new Blob([data], { type: "image/heic" }), outName);
    if (liveIdentifier) {
      ui.note(T("live.waitmovie"));
      const photo = { identifier: liveIdentifier, source: bytes, output: data, name: outName, ui };
      livePhotos.push(photo);
      attachMovie(photo);
    }
    await tryAiPortrait(bytes,data,ui,file.name,file);
  } catch (e) {
    // Past the format sniff, every remaining rejection means the same thing to a
    // visitor: this is a HEIC, but not one this build can handle. The real reason
    // still goes to the console, because "unsupported" on every photo is exactly
    // how a bug elsewhere would look.
    console.error("could not port", file.name, e);
    ui.set(T("err.unsupported"), "err");
  }
}

function showCaptureDate(ui, date) {
  ui.note(date ? `${T("date.kept")} ${date.date}${date.subsec ? '.' + date.subsec : ''}${date.offset ? ' ' + date.offset : ''}`
    : T("date.missing"), "date");
}

async function handleFiles(files) {
  for (const f of files) await handleFile(f);
}
// Serialize separate picker/drop events so duplicate MOVs cannot race pairing.
let fileQueue = Promise.resolve();
const enqueueFiles = (files) => { fileQueue = fileQueue.then(() => handleFiles(files)); };

drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  enqueueFiles([...e.dataTransfer.files]);
});
drop.addEventListener("click", () => fileInput.click());
drop.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
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
  try {
    profileIndex = await (await fetch("profiles/index.json")).json();
  } catch (e) {
    $("boot").textContent = e.message;
    $("boot").className = "err";
  }
})();

// Keep installation and offline support progressive: unsupported browsers use
// the page exactly as before, while HTTPS/localhost deployments gain a PWA.
if ("serviceWorker" in navigator) {
  const registerSW = () => {
    navigator.serviceWorker.register("./sw.js", { scope: "./" })
      .catch((e) => console.warn("offline support unavailable:", e));
  };
  if (document.readyState === "complete") {
    registerSW();
  } else {
    window.addEventListener("load", registerSW);
  }
}
