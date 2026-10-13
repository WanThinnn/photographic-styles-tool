import {loadProfile} from '../../core/zip.js';
import {fetchJsonWithRetry} from '../../ui/startup.js';
export function createProfileRepository(){
  let profileIndex=null,profileIndexPromise=null;
  const profileCache=new Map();
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

    async function preload(){
      try{profileIndex=await fetchJsonWithRetry('profiles/index.json',{attempts:2});}
      catch(error){console.warn('Profile index will be retried on demand',error);profileIndex=null;}
    }
    return {ensureProfileIndex,getProfile,preload};
}

