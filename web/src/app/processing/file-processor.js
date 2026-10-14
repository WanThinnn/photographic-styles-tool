// Serialized file conversion workflow. UI and session services are injected.
import {profileFor} from '../../styles/port.js';
import {dimensionsForItem,discoverHeic} from '../../core/heif.js';
import {styleDeltaSize} from '../../styles/graft.js';
import {hasTexture} from '../../styles/texture.js';
import {decodeToRgb,releaseDecodeCache} from '../../media/decode.js';
import {photoContentIdentifier,createLivePhotoExport} from '../../media/live-photo.js';
import {RASTER_MIMES} from '../../media/image-format.js';
import {photoCaptureDate} from '../../media/photo-date.js';
import {preserveNativeStyles,styleReconstructionRisk,nativeTextureCapture} from '../../styles/style-preservation.js';
import {releaseHevcEncoder} from '../../codecs/ffmpeg-hevc.js';
import {releaseHevcEncoder as releaseRasterEncoder} from '../../raster/ffmpeg-hevc.js';
import {readImageFile,addTextureInWorker,repairTextureInWorker,restoreNativePortraitInWorker,patchInWorker,releaseHeicProcessor} from '../../media/heic-processing.js';
import {waitForVisiblePage} from '../../ui/processing-scheduler.js';
import {shouldRenderStyleDisplay} from '../../recommend/style-display-render.js';
export function createFileProcessor({row,T,getLanguage,aiText,aiFeatures,gpuAcceleration,selectedAiLevel,handleMovie,liveMovies,livePhotos,attachMovie,ensureProfileIndex,getProfile,tryAiPortrait,analysis}){
    const {addMissingSoftSkin,ensureDecode,stagePercent,modelDownloadStatus,styleProgress,styleResultNote,adaptiveStyleCompletionNotice,recommendHeicStyle}=analysis;
  async function handleFile(file) {
    const ui = row(file.name,file);
    const inputSize = file.size;
    const overall=value=>ui.progress?.(value);
    const mapped=(start,end,done,total)=>Number.isFinite(done)&&Number.isFinite(total)&&total>0?start+(end-start)*Math.max(0,Math.min(1,done/total)):start;
    try {
      overall(3);ui.set(T("st.reading"));
      const input = await readImageFile(file);overall(8);
      let bytes = input.bytes;
      if (/\.mov$/i.test(file.name) || file.type === "video/quicktime") {
        await handleMovie(file, bytes, ui);
        return;
      }
      let format = input.format;
      if(format==='dng'){
        if(!globalThis.crossOriginIsolated){ui.set(T('err.reloadencoder'),'err');return;}
        ui.set(getLanguage()==='vi'?'Đang giải mã DNG…':getLanguage()==='zh'?'正在解码 DNG…':'Developing DNG…');
        const {importDngFile}=await import('../../dng/dng-import.js');
        try {file=await importDngFile(bytes,file.name,progress=>{
          const label=getLanguage()==='vi'?'Giải mã RAW':getLanguage()==='zh'?'解码 RAW':'Developing RAW';
          const percent=stagePercent(progress.done,progress.total);overall(mapped(8,18,progress.done,progress.total));ui.set(percent?`${label} ${percent}`:label);
        });}catch(error){
          console.warn('DNG import failed',error);
          const reason=/JPEG XL/.test(error.message)?'JPEG XL':/large RAW/.test(error.message)?'oversized RAW':'decode';
          const messages={vi:{'JPEG XL':'DNG nén JPEG XL chưa được hỗ trợ.','oversized RAW':'Ảnh RAW này quá lớn cho cấu trúc hiện tại. Hãy xuất JPG/PNG để xử lý.','decode':'Không giải mã được DNG này. Hãy thử bản JPG/PNG.'},en:{'JPEG XL':'JPEG XL compressed DNG is not supported.','oversized RAW':'This RAW layout is too large. Export JPG/PNG to process it.','decode':'Could not decode this DNG. Try a JPG/PNG export.'}};
          ui.set((messages[getLanguage()]||messages.en)[reason],'err');return;
        }
        bytes=new Uint8Array(await file.arrayBuffer());format='png';
        ui.note(getLanguage()==='vi'?'DNG được giải mã thành ảnh sRGB để thêm Styles; bản xuất là HEIC, không còn RAW.':getLanguage()==='zh'?'DNG 转换为 sRGB 图像以添加风格；导出 HEIC，不保留 RAW。':'DNG is developed to sRGB for Styles; the HEIC output is no longer RAW.','raw');
      }
      if (RASTER_MIMES[format]) {

        if (!globalThis.crossOriginIsolated) { ui.set(T("err.reloadencoder"), "err"); return; }
        const { importRaster } = await import("../../raster/raster-import.js");
        let result;overall(14);
        try {
          result = await importRaster(new File([bytes], file.name, {type: RASTER_MIMES[format]}),
            null, progress => {
              if(progress.stage==='styleSuggestion'){const p=progress.progress||progress;overall(mapped(18,35,p.done,p.total));styleProgress(ui,progress);return;}
              if (progress.stage === "modelDownload"){
                overall(mapped(18,30,progress.loaded,progress.total));ui.set(modelDownloadStatus(aiText().detailDownloading,progress));
              }
              else if (["download","modelCache","modelCacheWarning","modelLoading"].includes(progress.stage)){
                overall(22);ui.set(aiText().detailPreparing);
              }
              else if (progress.stage === "inference"){
                overall(mapped(30,50,progress.progress?.done,progress.progress?.total));ui.set(stagePercent(progress.progress?.done,progress.progress?.total) ? `${aiText().detailWorking} ${stagePercent(progress.progress?.done,progress.progress?.total)}` : aiText().detailWorking);
              }
              else if (progress.stage === "main"){overall(mapped(50,67,progress.done,progress.total));ui.set(stagePercent(progress.done,progress.total) ? `${T("st.rastertiles")} ${stagePercent(progress.done,progress.total)}` : T("st.rastertiles"));}
              else if (progress.stage === "auxiliary"){overall(mapped(67,75,progress.done,progress.total));ui.set(stagePercent(progress.done,progress.total) ? `${aiText().detailHdrWorking} ${stagePercent(progress.done,progress.total)}` : aiText().detailHdrWorking);}
              else {overall(20);ui.set(T("st.rasterworking"));}
            }, {
              analyze:true,
              detail:aiFeatures.enabled('detail')?{modelId:selectedAiLevel(),provider:gpuAcceleration.checked?'webgpu':'wasm'}:null,
              styleSuggestion:aiFeatures.enabled('style')?{level:selectedAiLevel(),provider:gpuAcceleration.checked?'webgpu':'wasm'}:null,
            });
        } catch (error) {
          console.error("Raster conversion failed", file.name, error);
          ui.set(T(error.code==='err.hdrjpeg'?'err.hdrjpeg':/Raster image decode failed/i.test(error.message) ? "err.rasterdecode" : "err.rasterencode"), "err");
          return;
        }
        overall(76);const outName = file.name.replace(/\.[^.]+$/, "") + "_PhotographicStyle.HEIC";
        if(result.detailSkipped)ui.note(`${aiText().detailSkipped} ${result.detailSkipped}`,'detail');
        else if(result.detailApplied)ui.note(aiText().detailApplied,'detail');
        if(aiFeatures.enabled('style'))styleResultNote(ui,result.styleRecommendation,result.styleSuggestionError);
        overall(78);result.data=await addMissingSoftSkin(result.data,file,ui);overall(84);
        const date = photoCaptureDate(result.data);
        const output = new File([result.data], outName, {type: "image/heic",
          ...(date?.timestamp !== undefined ? {lastModified:date.timestamp} : {})});
        ui.readyNotice=`${T("st.ready")} — ${T("st.rasterready")}`;
        ui.note(result.hdr?T('raster.hdr'):result.geometry.resized ? T("raster.resized") : T("raster.note"), "conversion");
        showCaptureDate(ui, date);
        await ui.metadata(result.data, inputSize, {raster: !result.hdr, raw: input.format === 'dng'});overall(88);
        overall(90);await tryAiPortrait(null,output,ui,file.name,file);
        adaptiveStyleCompletionNotice(ui,result.styleRecommendation);
        return;
      }
      if (format !== "heic") { ui.set(T("err.notheic"), "err"); return; }
      overall(12);let d = input.discovery;
      if(aiFeatures.enabled('detail')){
        if(d.hdrGrid!==null&&d.hdrTiles?.length){
          if(!globalThis.crossOriginIsolated){
            ui.note(`${aiText().detailSkipped} ${T("err.reloadencoder")}`,'detail');
          }else{
            try{
              const {enhanceNativeHdrHeic}=await import('../../detail/detail-native-heic.js');
              const enhanced=await enhanceNativeHdrHeic(bytes,{
                modelId:selectedAiLevel(),provider:gpuAcceleration.checked?'webgpu':'wasm'
              },{onProgress:progress=>{
                if(['download','modelCache','modelCacheWarning','modelLoading'].includes(progress.stage)){overall(16);ui.set(aiText().detailPreparing);}
                else if(progress.stage==='inference'){
                  const percent=stagePercent(progress.progress?.done,progress.progress?.total);
                  overall(mapped(18,28,progress.progress?.done,progress.progress?.total));ui.set(percent?`${aiText().detailWorking} ${percent}`:aiText().detailWorking);
                }else if(/^hdr(Primary|Gain)(Decode|Encode)$/.test(progress.stage)){
                  const percent=stagePercent(progress.done,progress.total);
                  overall(mapped(28,34,progress.done,progress.total));ui.set(percent?`${aiText().detailHdrWorking} ${percent}`:aiText().detailHdrWorking);
                }
                else if(progress.stage==='modelDownload'){
                  overall(mapped(14,22,progress.loaded,progress.total));ui.set(modelDownloadStatus(aiText().detailDownloading,progress));
                }
                else {overall(30);ui.set(aiText().detailHdrWorking);}
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

      overall(36);const textureOnly = preserveNativeStyles(bytes,d);
      const nativeTexture = nativeTextureCapture(bytes,d);
      const {nativePortraitBaseState}=await import('../../portrait/ai-portrait-container.js');
      const portraitState=nativePortraitBaseState(bytes,d);
      const rebuildNativePortrait=textureOnly&&d.stylesItem===null&&portraitState!==null;
      const preserveIncomplete = textureOnly && d.stylesItem === null&&!rebuildNativePortrait;
      let sharpBackgroundEvidence=null;
      let restorePortrait=portraitState==='legacy-photo-base';
      if (styleReconstructionRisk(bytes,d)&&!rebuildNativePortrait) ui.note(T('warn.textureonly'),'style-rebuild');
      const liveIdentifier = photoContentIdentifier(bytes);
      ui.liveIdentifier=liveIdentifier;
      const sep = getLanguage() === "zh" ? "、" : ", ";
      let data, bits, suffix, adaptiveStyleRecommendation=null;
      if (nativeTexture && !hasTexture(d.infos)) {
        // iPhone 18+ native captures can expose Texture/Film through capture metadata
        // without the grafted texture_styles/matte graph. Never graft a second Texture
        // contract onto those files; Photos already owns the native render path.
        data=bytes;overall(58);
        bits=[T('st.native'),T('st.texture')];
        suffix='_Preserved.HEIC';
      } else if (preserveIncomplete) {
        // A selected preset is not the Styles editing graph. Adding Texture alone
        // advertises a new renderer without the colour resources it needs. Keep
        // this incomplete native export intact and register only its own HDR map.
        overall(42);({data} = await repairTextureInWorker(bytes,{preserveStyles:true}));overall(58);
        data ||= bytes;
        bits = [T('st.original')];
        suffix = '_Preserved.HEIC';
      } else if ((textureOnly&&!rebuildNativePortrait) || d.stylesItem !== null) {
        // A native iPhone 16/17 style photo is never re-ported (that would replace its real
        // style data); it only gets the iOS 27 Texture/Grain set added.
        overall(42);ui.set(T("st.working"));
        if (hasTexture(d.infos)) {
          ({data} = await repairTextureInWorker(bytes,{preserveStyles:textureOnly}));overall(58);
          // A complete Styles file can still be used as input for opt-in Portrait.
          bits = data ? [T('st.native'), T('st.texturerepaired')] : [T('st.native'),T('st.texture')];
          suffix = data ? '_TextureFixed.HEIC' : '_SoftSkin.HEIC';
          data ||= bytes;
        } else {
          ({ data } = await addTextureInWorker(bytes,{preserveStyles:textureOnly,allowMissingStyles:textureOnly}));overall(58);
          bits = [T("st.native"), T("st.texture")];
          suffix = "_TextureGrain.HEIC";
        }
      } else {
        const needsExperimental = d.hdrGrid === null
          || !styleDeltaSize(...dimensionsForItem(d.props, d.primary));
        overall(38);const index=await ensureProfileIndex();
        const name = profileFor(index, d, needsExperimental);
        const profile = await getProfile(name);
        // Start processing; if the thumbnail is missing, dynamically load the generator.
        let linearThumb = undefined;
        if (d.thumbnail === null) {

          if (!globalThis.crossOriginIsolated) { ui.set(T("err.reloadencoder"), "err"); return; }
          const { generateLinearThumbnail } = await import("../../codecs/linear-thumbnail.js");
          try {
            linearThumb = await generateLinearThumbnail(bytes, progress => {
              if (progress.stage === "modelDownload"){
                overall(mapped(38,46,progress.loaded,progress.total));ui.set(`${T("st.encoderload")} ${(progress.loaded / 1048576).toFixed(1)} MB`);
              }
              else {overall(progress.stage === "encode" ? 46 : 42);ui.set(T(progress.stage === "encode" ? "st.thumbnail" : "st.working"));}
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
          overall(46);ui.set(T('st.working'));
          try{
            const {analyzeNativePortraitBase}=await import('../../portrait/native-base-analysis.js');
            sharpBackgroundEvidence=await analyzeNativePortraitBase(bytes,d);
            restorePortrait ||= Boolean(sharpBackgroundEvidence);
          }catch(error){console.warn('Native background analysis unavailable',error);}
        }
        const canDecode = await ensureDecode(bytes);overall(50);
        ui.set(T("st.working"));
        const opts = canDecode
          ? { decode: decodeToRgb, sceneStats: "target", lightMaps: "target", linearThumb, experimental: needsExperimental, texture: !hasTexture(d.infos) }
          : { sceneStats: "donor", linearThumb, experimental: needsExperimental, texture: !hasTexture(d.infos) };
        opts.portraitStyleRebuild=rebuildNativePortrait;
        opts.sharpBackgroundEvidence=sharpBackgroundEvidence;
        if(aiFeatures.enabled('style')&&!rebuildNativePortrait){overall(52);opts.styleRecommendation=await recommendHeicStyle(bytes,d,ui);overall(56);}
        let report;
        ({ data, report } = await patchInWorker(bytes, profile, opts));overall(62);
        // patch() degrades rather than failing when the decoder misbehaves, so trust
        // what it reports it actually did, not what we asked for.
        if (report.decodeError) console.warn("decoder unavailable:", report.decodeError);
        if(report.styleSelectionCompatibility==='portrait-standard')ui.note(T('warn.portraitstandard'),'style-rebuild');
        else if(report.styleSelectionCompatibility==='bright-palette70')ui.note(T('warn.brightcompat'),'style-rebuild');
        if(report.styleRecommendation){
          adaptiveStyleRecommendation=report.styleRecommendation;
          styleResultNote(ui,report.styleRecommendation);
        }

        bits = [T(report.decoded ? "st.matched" : "st.neutral")];
        if (report.mattes.added.some((m) => m.startsWith("depth"))) bits.push(T("st.portrait"));
        else if (report.mattes.transplanted.length) bits.push(T("st.people"));
        if (report.texture !== "off") bits.push(T("st.texture"));
        if (needsExperimental) bits.push(T("st.experimental"));
        suffix = needsExperimental ? "_ExperimentalStyle.HEIC" : "_PhotographicStyle.HEIC";
      }
      if (!preserveIncomplete){
        overall(64);data=await addMissingSoftSkin(data,file,ui,{nativeStyles:textureOnly||d.stylesItem!==null,sourceBytes:bytes});overall(72);
      }else overall(72);
      if(restorePortrait&&!preserveIncomplete){
        overall(74);const restored=await restoreNativePortraitInWorker(data,{sharpBackgroundEvidence});
        if(restored.data){data=restored.data;bits.push(T('st.portraitrestored'));}
        overall(78);
      }else overall(78);
      // Bake the visible rendition only after every metadata/Texture/Portrait
      // rebuild. This guarantees the exact file offered to Photos owns the styled
      // primary and thumbnail instead of letting a later graph rebuild restore the
      // original-colour payloads. Editable Styles metadata remains untouched.
      if(adaptiveStyleRecommendation){
        const needsStyledDisplay=shouldRenderStyleDisplay(adaptiveStyleRecommendation);
        try{
          const {renderSuggestedStyleDisplay}=await import('../../recommend/style-display-heic.js');
          const rendered=await renderSuggestedStyleDisplay(data,adaptiveStyleRecommendation,{
            onProgress:progress=>{if(progress?.stage==='styleDisplay'){overall(82);ui.set(T('st.working'));}}});
          if(needsStyledDisplay&&!rendered.rendered)
            throw Error(`Suggested Style display rendition was not written (${rendered.reason||'unknown'})`);
          data=rendered.data;overall(84);
        }catch(error){
          console.error('Suggested Style display rendition unavailable',error);
          // Metadata alone previews only inside Photos Edit and disappears on
          // Cancel. Never publish that misleading half-applied result.
          if(needsStyledDisplay)throw error;
        }
      }
      ui.readyNotice=`${T("st.ready")} — ${bits.join(sep)}`;

      const outName = file.name.replace(/\.[^.]+$/, "") + suffix;
      // On iPhone the share sheet lands the file straight in Photos; elsewhere a plain
      // download is the shorter route.
      const date = photoCaptureDate(data);
      const shareFile = new File([data], outName, { type: "image/heic",
        ...(date?.timestamp !== undefined ? {lastModified:date.timestamp} : {}) });
      showCaptureDate(ui, date);
      await ui.metadata(data, inputSize);overall(88);
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
      overall(90);await tryAiPortrait(bytes,shareFile,ui,file.name,file,preserveIncomplete);
      adaptiveStyleCompletionNotice(ui,adaptiveStyleRecommendation);
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
    return {handleFile,handleFiles};
}

