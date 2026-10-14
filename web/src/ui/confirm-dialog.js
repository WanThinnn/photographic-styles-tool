let activeDialog=null;

function nativeFallback(message){
  try{return Promise.resolve(globalThis.confirm?.(message)??false);}
  catch{return Promise.resolve(false);}
}

export function confirmAction({title,detail='',confirmLabel='Delete',cancelLabel='Cancel'}={}){
  if(typeof document==='undefined'||!document.body||typeof HTMLDialogElement==='undefined')return nativeFallback([title,detail].filter(Boolean).join('\n\n'));
  if(activeDialog?.open)activeDialog.close('cancel');
  const dialog=document.createElement('dialog');
  dialog.className='ios-confirm-dialog';
  dialog.setAttribute('aria-modal','true');
  const card=document.createElement('form');card.method='dialog';card.className='ios-confirm-card';
  const copy=document.createElement('div');copy.className='ios-confirm-copy';
  const heading=document.createElement('h2');heading.textContent=title||'';
  copy.append(heading);
  if(detail){const p=document.createElement('p');p.textContent=detail;copy.append(p);}
  const actions=document.createElement('div');actions.className='ios-confirm-actions';
  const cancel=document.createElement('button');cancel.type='submit';cancel.value='cancel';cancel.className='ios-confirm-cancel';cancel.textContent=cancelLabel;
  const confirm=document.createElement('button');confirm.type='submit';confirm.value='confirm';confirm.className='ios-confirm-destructive';confirm.textContent=confirmLabel;
  actions.append(cancel,confirm);card.append(copy,actions);dialog.append(card);document.body.append(dialog);activeDialog=dialog;
  return new Promise(resolve=>{
    const finish=value=>{if(dialog.isConnected)dialog.remove();if(activeDialog===dialog)activeDialog=null;resolve(value);};
    dialog.addEventListener('close',()=>finish(dialog.returnValue==='confirm'),{once:true});
    dialog.addEventListener('cancel',event=>{event.preventDefault();dialog.close('cancel');});
    dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close('cancel');});
    dialog.showModal();
    cancel.focus({preventScroll:true});
  });
}
