// Navigation and presentation only. Result DOM, previews and export buttons are
// moved intact, never cloned: each action still owns its current output File.
import {pickLanguage,t} from '../i18n.js';
import {bindDockViewport} from './dock-viewport.js';
import {bindTabGlass} from './tab-glass.js';

let instance;
export function getAppShell(){return instance??=createAppShell();}

export function createAppShell({doc=document,win=window,translate=key=>t(pickLanguage(),key)}={}){
  const $=id=>doc.getElementById(id),records=new Map();
  const photo=$('photo-workspace'),content=$('photo-content');
  const tabs=[...doc.querySelectorAll('[data-screen]')],tabNav=doc.querySelector('.app-tabs');
  bindDockViewport({doc,win});
  const syncTabLens=()=>{
    const active=tabs.find(button=>button.getAttribute?.('aria-current')==='page'),first=tabs[0];
    if(!active||!first||!tabNav?.style)return;
    const activeRect=active.getBoundingClientRect?.(),firstRect=first.getBoundingClientRect?.();
    const offset=Number(activeRect?.left)-Number(firstRect?.left);
    if(Number.isFinite(offset))tabNav.style.setProperty('--tab-rest-offset',offset+'px');
  };
  let destination='process',selected=null,serial=0,opener=null,scroll=0,returning=false,pendingOpen=null,photoClosingTimer=null,closeTaskMenu=null;
  const later=win.setTimeout?.bind(win)||setTimeout,clearLater=win.clearTimeout?.bind(win)||clearTimeout;
  const sessionId=win.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2);
  try{if('scrollRestoration' in win.history)win.history.scrollRestoration='manual';}catch{}
  const screens=['process','history','guide','settings'],positions={process:0,history:0,guide:0,settings:0};
  // Navigation preferences are small; image bytes and result IDs stay in memory.
  try{const saved=win.sessionStorage.getItem('stylio-screen');destination=screens.includes(saved)?saved:'process';}catch{}
  // Reload cannot restore session-only output. Never let a new result inherit an
  // old workspace ID, or let Back reopen an unrelated photo after a reload.
  if(win.history.state?.stylioPhoto){destination='process';win.history.replaceState({stylioTab:destination},'');}
  function showScreen(next){
    if(!screens.includes(next))next='process';
    positions[destination]=win.scrollY;destination=next;
    try{win.sessionStorage.setItem('stylio-screen',next);}catch{}
    for(const name of screens)$(name+'-screen').hidden=name!==next;
    const settingsActive=next==='settings',guideAction=$('header-guide');
    doc.body.classList.toggle('is-settings-destination',settingsActive);
    guideAction.setAttribute('aria-label',settingsActive?'GitHub':translate('shell.guide'));
    for(const button of tabs){if(button.dataset.screen===next)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}
    tabNav.style.setProperty('--tab-index',String(screens.indexOf(next)));
    syncTabLens();
    win.scrollTo(0,positions[next]);
  }
  const searchInput=$('history-search'),searchButton=$('toggle-search'),searchField=$('history-search-field');
  let searching=false,searchReturn='process',query='';
  const normalize=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLocaleLowerCase();
  doc.addEventListener?.('pointerdown',event=>{
    if(closeTaskMenu&&!event.target?.closest?.('.task-action-wrap'))closeTaskMenu();
  },true);
  doc.addEventListener?.('keydown',event=>{
    if(event.key==='Escape'&&closeTaskMenu){event.preventDefault();closeTaskMenu();}
  });
  win.addEventListener?.('scroll',()=>closeTaskMenu?.(),{passive:true});
  function setSearch(open,{restore=true,focus=true}={}){
    if(open===searching)return;
    searching=open;searchButton.setAttribute('aria-expanded',String(open));
    if(open)doc.querySelector('.app-dock').classList.add('has-searched');
    searchButton.classList.toggle('is-searching',open);
    searchField.hidden=!open;doc.querySelector('.app-tabs').hidden=open;
    doc.querySelector('.app-dock').classList.toggle('is-searching',open);
    $('search-button-label').textContent=translate(open?'shell.closesearch':'shell.search');
    if(open){
      searchReturn=destination;showScreen('history');
      if(focus)searchInput.focus({preventScroll:true});
    }else{
      query='';searchInput.value='';$('clear-search').hidden=true;render();
      if(restore)showScreen(searchReturn);
      if(focus)searchButton.focus({preventScroll:true});
    }
  }
  searchButton.addEventListener('click',()=>setSearch(!searching));
  searchInput.addEventListener('input',()=>{
    query=normalize(searchInput.value.trim());$('clear-search').hidden=!searchInput.value;render();
  });
  searchInput.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();setSearch(false);}
    if(event.key==='Enter'){event.preventDefault();searchInput.blur();}
  });
  $('clear-search').addEventListener('click',()=>{
    searchInput.value='';query='';$('clear-search').hidden=true;render();searchInput.focus({preventScroll:true});
  });
  function restorePhoto(){
    if(!selected)return;
    const record=records.get(selected);selected=null;
    if(record){record.placeholder.replaceWith(record.el);record.placeholder=null;}
    win.scrollTo(0,scroll);
    if(opener?.isConnected)opener.focus({preventScroll:true});
    else tabs.find(button=>button.dataset.screen===destination)?.focus({preventScroll:true});
    opener=null;
  }
  function closePhoto({back=true,animate=back}={}){
    if(!photo.open||photo.classList.contains('is-closing'))return;
    const shouldBack=Boolean(back&&win.history.state?.stylioPhoto);
    if(shouldBack)returning=true;
    const finish=()=>{
      if(photoClosingTimer!==null){clearLater(photoClosingTimer);photoClosingTimer=null;}
      photo.classList.remove('is-closing');photo.close();restorePhoto();
      if(shouldBack)win.history.back();
    };
    if(!animate||win.matchMedia?.('(prefers-reduced-motion: reduce)').matches){finish();return;}
    photo.classList.add('is-closing');
    photoClosingTimer=later(finish,180);
  }
  function openPhoto(id,{push=true}={}){
    if(returning){pendingOpen=id;return;}
    const record=records.get(id);if(!record)return;
    if(selected===id)return;
    if(photo.open)closePhoto({back:false});
    for(const sheet of doc.querySelectorAll('.sheet[open]'))sheet.close();
    opener=doc.activeElement;scroll=win.scrollY;selected=id;
    record.placeholder=doc.createElement('div');record.placeholder.hidden=true;
    record.el.replaceWith(record.placeholder);content.replaceChildren(record.el);
    $('photo-title').textContent=translate('shell.photo');
    if(push){
      win.history.replaceState({...win.history.state,stylioTab:destination},'');
      win.history.pushState({stylioPhoto:id,stylioTab:destination},'');
    }
    record.actions?.classList.remove('is-expanded');
    photo.showModal();photo.scrollTop=0;photo.focus({preventScroll:true});
    record.measureActions?.();
  }
  photo.addEventListener('cancel',event=>{event.preventDefault();closePhoto();});
  $('close-photo').addEventListener('click',()=>closePhoto());
  win.addEventListener('popstate',()=>{
    returning=false;
    if(searching)setSearch(false,{restore:false,focus:false});
    if(pendingOpen){const id=pendingOpen;pendingOpen=null;openPhoto(id);return;}
    const state=win.history.state;
    if(state?.stylioPhoto&&records.has(state.stylioPhoto)){
      showScreen(state.stylioTab);openPhoto(state.stylioPhoto,{push:false});
    }
    else{
      closePhoto({back:false});showScreen(state?.stylioPhoto?'process':state?.stylioTab||destination);
      if(state?.stylioPhoto)win.history.replaceState({stylioTab:'process'},'');
    }
  });
  function navigate(next){
    if(next===destination)return;
    win.history.replaceState({...win.history.state,stylioTab:destination},'');
    win.history.pushState({stylioTab:next},'');showScreen(next);
  }
  $('header-guide')?.addEventListener('click',()=>{
    if(destination==='settings'){win.open?.('https://github.com/WanThinnn/stylio','_blank','noopener,noreferrer');return;}
    navigate('guide');
  });
  for(const button of tabs)button.addEventListener('click',()=>navigate(button.dataset.screen));
  bindTabGlass({nav:tabNav,tabs,select:navigate,win,doc});
  win.addEventListener?.('resize',syncTabLens);
  for(const [trigger,id]of [['open-ai-settings','ai-settings']]){
    const sheet=$(id);
    let closingTimer;
    const later=win.setTimeout?.bind(win)||setTimeout,clearLater=win.clearTimeout?.bind(win)||clearTimeout;
    const closeSheet=()=>{
      if(!sheet.open||sheet.classList.contains('is-closing'))return;
      if(win.matchMedia?.('(prefers-reduced-motion: reduce)').matches){sheet.close();return;}
      sheet.classList.add('is-closing');
      closingTimer=later(()=>{closingTimer=null;sheet.classList.remove('is-closing');sheet.close();},175);
    };
    $(trigger).addEventListener('click',()=>{
      for(const other of doc.querySelectorAll('dialog[open]'))if(other!==sheet)other.close();
      if(closingTimer!==undefined){clearLater(closingTimer);closingTimer=undefined;}
      sheet.classList.remove('is-closing');sheet.showModal();sheet.focus({preventScroll:true});
    });
    sheet.querySelector('[data-close-dialog]').addEventListener('click',closeSheet);
    sheet.addEventListener('cancel',event=>{event.preventDefault();closeSheet();});
    sheet.addEventListener('click',event=>{
      if(event.target!==sheet)return;
      const rect=sheet.getBoundingClientRect();
      if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeSheet();
    });
  }
  let used=false;try{used=win.localStorage.getItem('stylio-has-processed')==='1';}catch{}
  doc.body.classList.toggle('has-used-app',used);
  // Low-resolution thumbnails are decoded only when History cards become visible.
  // Unsupported image formats retain their status icons without loading a decoder.
  const thumbnailObserver=win.IntersectionObserver?new win.IntersectionObserver(entries=>{
    for(const entry of entries){
      if(!entry.isIntersecting)continue;
      thumbnailObserver.unobserve(entry.target);
      const record=[...records.values()].find(item=>item.historyCard===entry.target);
      if(record)void makeThumbnail(record);
    }
  },{rootMargin:'80px'}):null;
  async function makeThumbnail(record){
    if(record.thumbnailAttempted||record.thumbnailPending||record.thumbnail||!record.sourceFile||typeof win.createImageBitmap!=='function')return;
    record.thumbnailAttempted=true;record.thumbnailPending=true;
    let bitmap;
    try{
      bitmap=await win.createImageBitmap(record.sourceFile,{resizeWidth:96,resizeQuality:'medium'});
      if(!records.has(record.id))return;
      const canvas=doc.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
      const context=canvas.getContext?.('2d');if(!context)return;
      context.drawImage(bitmap,0,0);
      record.thumbnail=canvas.toDataURL('image/jpeg',0.7);
      record.onThumbnail?.(record.thumbnail);
      render();
    }catch{/* Browser could not decode this file; preserve its status icon. */}
    finally{bitmap?.close?.();record.thumbnailPending=false;}
  }
  // Prefer the pipeline's explicit overall progress. Legacy stage-local percentages
  // remain a fallback for operations that have not adopted overall milestones yet.
  function updateTaskIndicator(icon,record){
    const active=record.state==='processing'||record.state==='updating';
    const match=active&&String(record.status).match(/(?:^|\s)(100|[1-9]?\d)%(?=$|\s|[.,;])/);
    const explicit=active&&Number.isFinite(record.progress)?Math.max(0,Math.min(100,Math.round(record.progress))):null;
    const percent=explicit??(match?Number(match[1]):null);
    icon.classList.toggle('is-active',active);
    icon.classList.toggle('is-determinate',percent!==null);
    icon.style.setProperty('--task-progress',`${percent??0}%`);
    icon.dataset.progressLabel=percent!==null?`${percent}%`:'';
    icon.textContent=active?'':record.state==='ready'?'✓':record.state==='failed'?'!':'◷';
  }
  function card(record,{history=false}={}){
    const card=doc.createElement('div');card.className='task-card';card.dataset.state=record.state;
    const open=doc.createElement('button');open.type='button';open.className='task-open';
    const icon=doc.createElement('span');icon.className='task-symbol';icon.setAttribute('aria-hidden','true');updateTaskIndicator(icon,record);
    const copy=doc.createElement('span');copy.className='task-copy';
    const name=doc.createElement('strong');name.textContent=record.name;
    const status=doc.createElement('span');status.textContent=record.status||translate('shell.queued');
    copy.append(name,status);
    if(record.thumbnail&&(history||record.state==='ready')){
      const image=doc.createElement('img');image.className='task-thumbnail';image.alt='';image.src=record.thumbnail;image.setAttribute('aria-hidden','true');open.append(image);
    }else open.append(icon);
    open.append(copy);
    if(record.state==='ready'&&record.quickActions?.length){
      const wrap=doc.createElement('div');wrap.className='task-action-wrap';
      const trigger=doc.createElement('button');trigger.type='button';trigger.className='task-action-trigger';trigger.setAttribute('aria-label',translate('shell.actions'));trigger.setAttribute('aria-expanded','false');
      trigger.innerHTML='<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>';
      const menu=doc.createElement('div');menu.className='task-action-menu';menu.hidden=true;menu.setAttribute('role','group');menu.setAttribute('aria-label',translate('shell.actions'));
      const icon=kind=>kind==='share'
        ?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 13v7h14v-7"/></svg>'
        :kind==='delete'
          ?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>'
          :'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 20h14"/></svg>';
      const close=()=>{
        menu.hidden=true;wrap.classList.remove('is-open');trigger.setAttribute('aria-expanded','false');
        if(closeTaskMenu===close)closeTaskMenu=null;
      };
      trigger.addEventListener('click',event=>{
        event.stopPropagation();
        const opening=menu.hidden;
        closeTaskMenu?.();
        if(opening){menu.hidden=false;wrap.classList.add('is-open');trigger.setAttribute('aria-expanded','true');closeTaskMenu=close;}
      });
      for(const action of record.quickActions){
        const button=doc.createElement('button');button.type='button';button.className='task-action-item';button.dataset.kind=action.kind;
        button.setAttribute('aria-label',action.label||action.kind);button.title=action.label||'';
        if(action.danger)button.classList.add('is-danger');
        button.innerHTML=icon(action.kind);
        button.addEventListener('click',event=>{event.stopPropagation();close();void action.run?.();});
        menu.append(button);
      }
      wrap.addEventListener('focusout',event=>{if(wrap.contains&&!wrap.contains(event.relatedTarget))close();});
      wrap.append(menu,trigger);card.append(open,wrap);
    }else{
      const arrow=doc.createElement('span');arrow.className='task-chevron';arrow.textContent='›';arrow.setAttribute('aria-hidden','true');open.append(arrow);card.append(open);
    }
    card.addEventListener('click',()=>openPhoto(record.id));
    return card;
  }
  function render(){
    const all=[...records.values()];
    const history=$('history-items');
    const matching=all.filter(record=>!query||normalize(record.name+' '+record.status).includes(query));
    const cards=[...matching].reverse().map(record=>{
      const next=card(record,{history:true});
      if(record.historyCard){
        // Progress updates from another result can render many times per second. Keep an
        // already-open overflow menu mounted so its trigger/menu/focus state is not reset
        // underneath the user's finger while a different photo is processing.
        if(!record.historyCard.querySelector('.task-action-wrap')?.classList.contains('is-open'))record.historyCard.replaceChildren(...next.childNodes);
        record.historyCard.dataset.state=record.state;
      }else record.historyCard=next;
      if(thumbnailObserver&&record.sourceFile&&!record.thumbnail&&!record.thumbnailAttempted)thumbnailObserver.observe(record.historyCard);
      return record.historyCard;
    });
    for(const old of [...history.children])if(!cards.includes(old))old.remove();
    cards.forEach((item,index)=>{if(history.children[index]!==item)history.insertBefore(item,history.children[index]||null);});
    $('history-empty').hidden=all.length>0||!!query;
    $('history-no-matches').hidden=!query||matching.length>0;
    const summary=$('history-search-summary');summary.hidden=!query;
    summary.textContent=query?translate('shell.searchresults').replace('{count}',String(matching.length)):'';
    searchInput.placeholder=translate('shell.search');
    $('search-button-label').textContent=translate(searching?'shell.closesearch':'shell.search');
    $('history-count').hidden=!all.length;$('history-count').textContent=String(all.length);
    $('current-task').hidden=!all.length;
    // The running task is not coupled to whichever older photo is being edited.
    const current=all.find(record=>!['ready','failed','info'].includes(record.state))||all.at(-1);
    const task=$('task-content'),next=current?card(current):null,currentCard=task.firstElementChild;
    const wantsQuick=Boolean(current?.state==='ready'&&current.quickActions?.length);
    const hasQuick=Boolean(currentCard?.querySelector('.task-action-trigger'));
    const wantsThumbnail=Boolean(current?.state==='ready'&&current.thumbnail);
    const hasThumbnail=Boolean(currentCard?.querySelector('.task-thumbnail'));
    if(next&&currentCard?.dataset.result===current.id&&wantsQuick===hasQuick&&wantsThumbnail===hasThumbnail){
      currentCard.querySelector('.task-copy>span').textContent=current.status||translate('shell.queued');
      currentCard.querySelector('.task-copy>strong').textContent=current.name;
      const currentSymbol=currentCard.querySelector('.task-symbol');if(currentSymbol)updateTaskIndicator(currentSymbol,current);
      currentCard.dataset.state=current.state;
    }else{
      if(next){next.dataset.result=current.id;next.querySelector('.task-copy>span').setAttribute('role','status');}
      task.replaceChildren(...(next?[next]:[]));
    }
  }
  showScreen(destination);
  return {
    render,
    register(el,name,sourceFile,{thumbnail=null,onThumbnail=null}={}){
      const id='result-'+sessionId+'-'+(++serial),record={
        id,el,name,state:'queued',status:'',progress:null,
        sourceFile:sourceFile?.type==='video/quicktime'?null:sourceFile,
        thumbnail:typeof thumbnail==='string'&&thumbnail?thumbnail:null,
        onThumbnail:typeof onThumbnail==='function'?onThumbnail:null,
      };records.set(id,record);
      const actions=el.querySelector('.act');
      record.actions=actions;
      record.measureActions=()=>el.style.setProperty('--actions-height',`${actions.getBoundingClientRect().height}px`);
      const observer=win.ResizeObserver?new win.ResizeObserver(record.measureActions):null;
      const expandActions=()=>actions?.classList.add('is-expanded');
      const collapseActions=()=>actions?.classList.remove('is-expanded');
      actions?.addEventListener('pointerdown',expandActions,{passive:true});
      actions?.addEventListener('focusin',expandActions);
      photo.addEventListener('scroll',collapseActions,{passive:true});
      if(actions)observer?.observe(actions);
      doc.body.classList.add('has-used-app');try{win.localStorage.setItem('stylio-has-processed','1');}catch{}
      render();
      return {
        update(state,status){record.state=state;record.status=status;if(!['processing','updating'].includes(state))record.progress=state==='ready'?100:null;if(state==='ready'&&record.sourceFile&&!record.thumbnail)void makeThumbnail(record);render();},
        progress(value){record.progress=Number.isFinite(value)?Math.max(0,Math.min(100,value)):null;render();},
        quickActions(items){record.quickActions=(items||[]).filter(item=>item&&typeof item.run==='function');render();},
        quickAction(kind,run,label=''){record.quickActions=[{kind,run,label}];render();},
        source(file){if(!record.sourceFile&&file?.type!=='video/quicktime'){record.sourceFile=file;record.thumbnail=null;record.thumbnailAttempted=false;}if(record.historyCard&&thumbnailObserver&&record.sourceFile&&!record.thumbnail)thumbnailObserver.observe(record.historyCard);render();},
        dispose(){
          const wasSelected=selected===id;if(wasSelected)closePhoto();
          observer?.disconnect();
          actions?.removeEventListener('pointerdown',expandActions);
          actions?.removeEventListener('focusin',expandActions);
          photo.removeEventListener('scroll',collapseActions);
          if(record.historyCard)thumbnailObserver?.unobserve(record.historyCard);
          records.delete(id);record.thumbnail=null;record.sourceFile=null;render();
          if(wasSelected)tabs.find(button=>button.dataset.screen===destination)?.focus({preventScroll:true});
        },
      };
    },
  };
}
