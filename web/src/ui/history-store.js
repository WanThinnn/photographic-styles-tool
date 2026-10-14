const DB_NAME='stylio-history-v1';
const STORE_NAME='results';
const DB_VERSION=1;

function requestResult(request){
  return new Promise((resolve,reject)=>{
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction){
  return new Promise((resolve,reject)=>{
    transaction.oncomplete=()=>resolve();
    transaction.onerror=()=>reject(transaction.error||Error('IndexedDB transaction failed'));
    transaction.onabort=()=>reject(transaction.error||Error('IndexedDB transaction aborted'));
  });
}

function openDatabase(indexedDB){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(STORE_NAME))db.createObjectStore(STORE_NAME,{keyPath:'id'});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||Error('Could not open Stylio history'));
  });
}

export function createHistoryStore({indexedDB=globalThis.indexedDB}={}){
  let databasePromise,mutation=Promise.resolve();
  const database=()=>{
    if(!indexedDB)return Promise.resolve(null);
    databasePromise??=openDatabase(indexedDB).catch(error=>{
      console.warn('Persistent history unavailable',error);
      return null;
    });
    return databasePromise;
  };
  async function withStore(mode,operation){
    const db=await database();
    if(!db)return null;
    const transaction=db.transaction(STORE_NAME,mode);
    const store=transaction.objectStore(STORE_NAME);
    const value=await operation(store,transaction);
    if(mode!=='readonly')await transactionDone(transaction);
    return value;
  }
  const mutate=operation=>{
    const run=mutation.then(operation);
    mutation=run.catch(()=>{});
    return run;
  };
  return {
    async list(){
      try{
        await mutation;
        const results=await withStore('readonly',store=>requestResult(store.getAll()));
        return Array.isArray(results)?results.sort((a,b)=>(a.updatedAt||0)-(b.updatedAt||0)):[];
      }catch(error){console.warn('Could not restore Stylio history',error);return [];}
    },
    async save({id,name,file,preview=null,readyNotice=''}) {
      if(!id||!file)return;
      try{
        await mutate(()=>withStore('readwrite',store=>{
          store.put({
            id,name,file,preview,fileName:file.name||name||'Stylio.HEIC',type:file.type||'application/octet-stream',
            lastModified:file.lastModified||Date.now(),readyNotice,updatedAt:Date.now()
          });
        }));
      }catch(error){console.warn('Could not persist Stylio history item',error);}
    },
    async remove(id){
      if(!id)return;
      try{await mutate(()=>withStore('readwrite',store=>{store.delete(id);}));}catch(error){console.warn('Could not remove Stylio history item',error);}
    },
    async clear(){
      try{await mutate(()=>withStore('readwrite',store=>{store.clear();}));}catch(error){console.warn('Could not clear Stylio history',error);}
    }
  };
}

export function restoredFile(entry){
  if(!entry?.file)return null;
  if(typeof File!=='undefined'&&entry.file instanceof File)return entry.file;
  if(typeof File!=='undefined')return new File([entry.file],entry.fileName||entry.name||'Stylio.HEIC',{
    type:entry.type||entry.file.type||'application/octet-stream',lastModified:entry.lastModified||Date.now()
  });
  return entry.file;
}
