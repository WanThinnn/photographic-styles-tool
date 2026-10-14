// Result DOM and output lifetime. Processing is supplied by the controller.
import {describeInWorker} from '../../media/heic-processing.js';
import {formatBytes} from '../result-metadata.js';
export function createResultView({list,T,aiText,resultCleanups,resultUrls,aiCandidates,livePhotos,liveMovies,aiFeatures,refreshHistoryButton,shell}){
  function row(name,sourceFile) {
    const el = document.createElement("div");
    el.className = "row";
    el.innerHTML = `<div class="result-header"><div class="name"></div><div class="status"></div></div><div class="act"></div>`;
    el.querySelector(".name").textContent = name;
    el.querySelector(".name").title = name;
    list.appendChild(el);
    const presentation=shell?.register(el,name);
    el.querySelector('.status').setAttribute('role','status');
    const cleanups=new Set(),downloadedFiles=new WeakSet(),savedFiles=new WeakSet();let disposed=false;
    if(sourceFile&&sourceFile.type!=='video/quicktime'){
      const figure=document.createElement('figure');figure.className='source-preview';
      const image=document.createElement('img');image.alt=name;image.loading='lazy';image.decoding='async';
      const url=URL.createObjectURL(sourceFile);image.src=url;resultUrls.add(url);
      image.addEventListener('error',()=>{figure.dataset.unavailable='true';figure.hidden=true;});
      const caption=document.createElement('figcaption');caption.dataset.i18n='shell.sourcepreview';caption.textContent=T('shell.sourcepreview');
      figure.append(image,caption);el.insertBefore(figure,el.querySelector('.act'));
      // Native browser rendering only; no decoder/model is downloaded for a thumbnail.
      cleanups.add(()=>{URL.revokeObjectURL(url);resultUrls.delete(url);});
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
        presentation?.dispose();
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
        if(text)presentation?.update('processing',text);
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
      aiView(visible) { const view=el.querySelector('.ai-details');if(view)view.style.display=visible?'':'none';const source=el.querySelector('.source-preview');if(source)source.hidden=visible||source.dataset.unavailable==='true'; },
      async portraitPreview(result,onSettings) {
        const {portraitPreview}=await import('../../portrait/ai-portrait-preview.js');
        el.querySelector('.ai-details')?.remove();
        const source=el.querySelector('.source-preview');if(source)source.hidden=true;
        const host=document.createElement('section');host.className='ai-details';host.setAttribute('aria-label',aiText().preview);
        el.insertBefore(host,el.querySelector('.act'));
        try{
          this.cleanup(portraitPreview(result,host,aiText(),onSettings,{onPending:pending=>{
            this.portraitPending=pending;if(aiFeatures.enabled('portrait'))this.outputPending(pending);refreshHistoryButton();
          }}));
        }catch(error){host.remove();if(source)source.hidden=source.dataset.unavailable==='true';this.note(aiText().previewFailed,'preview');throw error;}
      },
      outputPending(pending){
        presentation?.update(pending?'updating':this.resultState||'processing',pending?aiText().updating:this.resultStatus||'');
        this.outputPendingState=pending;el.querySelector('.act').setAttribute('aria-busy',String(pending));
        for(const button of el.querySelectorAll('.act button'))button.disabled=pending;
        for(const link of el.querySelectorAll('.act a')){link.setAttribute('aria-disabled',String(pending));link.tabIndex=pending?-1:0;}
      },
      output(file,{metadata=true}={}) {
        if(disposed)return;
        const host=actions('normal');
        for(const a of host.querySelectorAll('a[href]')){URL.revokeObjectURL(a.href);resultUrls.delete(a.href);}
        host.replaceChildren();
        if(navigator.canShare?.({files:[file]})){
          this.share(file,!!this.liveIdentifier);
          let hint=el.querySelector('.share-hint');
          if(!hint){hint=document.createElement('p');hint.className='share-hint';hint.dataset.i18n='shell.sharehint';el.insertBefore(hint,el.querySelector('.act'));}
          hint.textContent=T('shell.sharehint');
        }else el.querySelector('.share-hint')?.remove();
        this.link(file,file.name);
        this.liveExporter?.setOutput(file);
        if(metadata){const outputEpoch=this.outputEpoch=(this.outputEpoch||0)+1;
          file.arrayBuffer().then(b=>this.metadata(new Uint8Array(b),this.inputSize||file.size,{...this.metadataOptions,outputEpoch})).catch(console.warn);}
        this.outputPending(Boolean(this.outputPendingState));
      },
      set(text, cls) {
        this.resultState=cls==='ok'?'ready':cls==='err'?'failed':cls==='info'?'info':'processing';
        this.resultStatus=cls==='ok'?T('st.ready'):text;
        presentation?.update(this.resultState,this.resultStatus);
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
        const renderDownload=()=>{const downloaded=downloadedFiles.has(blob);a.dataset.downloadStarted=String(downloaded);label.dataset.i18n=downloaded?'btn.downloadagain':key;label.textContent=T(label.dataset.i18n);};
        a.className = group==='normal'&&!navigator.canShare?.({files:[blob]})?'dl':'dl alt';
        a.append(label);renderDownload();
        a.addEventListener('click',e=>{if(this.outputPendingState){e.preventDefault();return;}downloadedFiles.add(blob);renderDownload();});
        actions(group).appendChild(a);
      },
      portraitAdvice(text) {
        const advice=document.createElement('p');advice.className='portrait-advice';advice.textContent=text;
        el.insertBefore(advice,el.querySelector('.act'));
      },
      adaptiveStyleAdvice(text) {
        let advice=el.querySelector('.adaptive-style-advice');
        if(!advice){
          advice=document.createElement('p');advice.className='adaptive-style-advice';
          advice.setAttribute('role','status');advice.setAttribute('aria-live','polite');
          el.insertBefore(advice,el.querySelector('.act'));
        }
        advice.textContent=text;
      },
      share(file, live = false, label = null, group = 'normal') {
        const b = document.createElement("button");
        b.className = "dl";
        b.type = "button";
        const text=document.createElement('span');
        const renderSave=()=>{const saved=savedFiles.has(file);text.dataset.i18n=saved?'shell.shareagain':label||'shell.share';text.textContent=T(text.dataset.i18n);};
        b.append(text);renderSave();
        b.addEventListener("click", async () => {
          if (b.disabled) return;
          b.disabled = true;
          try { await navigator.share({ files: [file] });if(!disposed){savedFiles.add(file);renderSave();} }
          catch (e) { if (e.name !== "AbortError") {text.dataset.i18n='btn.blocked';text.textContent=T('btn.blocked');} }
          finally { b.disabled = Boolean(this.outputPendingState); }
        });
        actions(group).prepend(b);
      },
    };
    remove.addEventListener('click',()=>{if(confirm(T('shell.remove')))ui.dispose();});resultCleanups.add(ui.dispose);return ui;
  }

    return row;
}

