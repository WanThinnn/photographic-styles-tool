// Optional analysis and progress copy shared by HEIC and raster workflows.
import {loadLibheif,decodeToRgb} from '../../media/decode.js';
import {hasSoftSkinData} from '../../styles/soft-skin-container.js';
import {styleCapabilities} from '../../styles/style-capabilities.js';
import {preserveNativeStyles} from '../../styles/style-preservation.js';
import {formatBytes,formatStyleParameters} from '../../ui/result-metadata.js';
export function createPhotoAnalysis({T,aiText,aiFeatures,selectedAiLevel,gpuAcceleration}){
  async function addMissingSoftSkin(data,file,ui,options={}) {
    if(options.nativeStyles&&!styleCapabilities(data).editable){ui.note(aiText().compatibility,'compatibility');return data;}
    if(hasSoftSkinData(data)) return data;
    ui.set(T('st.softskinworking'));
    try {
      const {completeSoftSkin}=await import('../../styles/soft-skin.js');
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

  function stagePercent(done,total){
    return Number.isFinite(done)&&Number.isFinite(total)&&total>0 ? `${Math.min(100,Math.max(0,Math.round(done/total*100)))}%` : '';
  }
  function modelDownloadStatus(label,event){
    const progress=event?.progress||event||{},percent=stagePercent(progress.loaded,progress.total);
    return progress.loaded?`${label}${percent?` ${percent}`:''} · ${formatBytes(progress.loaded)}`:label;
  }
  function styleProgress(ui,progress){
    const stage=progress.styleStage||progress.stage;
    if(['download','modelDownload'].includes(stage)){ui.set(modelDownloadStatus(aiText().styleDownloading,progress));return;}
    if(['modelCache','modelCacheWarning','modelLoading','styleSemantics','styleCpuFallback'].includes(stage)){ui.set(aiText().stylePreparing);return;}
    if(stage==='inference'){
      const percent=stagePercent(progress.progress?.done,progress.progress?.total);
      ui.set(percent?`${aiText().styleAnalyzing} ${percent}`:aiText().styleAnalyzing);return;
    }
    ui.set(aiText().styleAnalyzing);
  }
  function styleResultNote(ui,recommendation,error=null){
    if(error){ui.note(`${aiText().styleUnavailable} ${String(error).slice(0,140)}`,'style-ai');return;}
    if(!recommendation)return;
    if(recommendation.fallback){ui.note(aiText().styleFallback,'style-ai');return;}
    ui.note(`${aiText().styleApplied}: ${formatStyleParameters(recommendation)}`,'style-ai');
  }
  function adaptiveStyleCompletionNotice(ui,recommendation){
    if(!aiFeatures.enabled('style')||!recommendation)return;
    ui.adaptiveStyleAdvice(aiText().styleCompletionNotice);
  }
  async function recommendHeicStyle(bytes,d,ui){
    if(!aiFeatures.enabled('style')||preserveNativeStyles(bytes,d))return null;
    try{
      ui.set(aiText().styleAnalyzing);
      const [{recommendStyleRgb},{orientStyleImage},rasterHeif]=await Promise.all([
        import('../../recommend/style-runtime.js'),
        import('../../recommend/style-analysis.js'),
        import('../../raster/heif.js'),
      ]);
      const rd=rasterHeif.discoverHeic(bytes),[width,height]=rasterHeif.dimensionsForItem(rd.props,rd.primary);
      const scale=Math.min(1,640/Math.max(width,height));
      const sampleWidth=Math.max(1,Math.round(width*scale)),sampleHeight=Math.max(1,Math.round(height*scale));
      const orientation=rasterHeif.itemOrientation(bytes,rd.props,rd.primary);
      const rgb=await decodeToRgb(bytes,{width:sampleWidth,height:sampleHeight,...orientation});
      const display=orientStyleImage({data:rgb,width:sampleWidth,height:sampleHeight},orientation);
      const recommendation=await recommendStyleRgb(display,{
        level:selectedAiLevel(),provider:gpuAcceleration.checked?'webgpu':'wasm',
        onProgress:progress=>styleProgress(ui,progress),
      });
      return recommendation;
    }catch(error){
      console.warn('Suggested Styles unavailable; retaining Standard',error);
      styleResultNote(ui,null,error?.message||error);
      return null;
    }
  }

    return {addMissingSoftSkin,ensureDecode,stagePercent,modelDownloadStatus,styleProgress,styleResultNote,adaptiveStyleCompletionNotice,recommendHeicStyle};
}

