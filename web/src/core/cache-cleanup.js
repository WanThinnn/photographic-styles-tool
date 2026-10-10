import {MODEL_CACHE_NAME} from './model-download.js';
import {ORT_ASSETS} from '../vision/ort-assets.js';
import {FFMPEG_ASSETS} from '../codecs/ffmpeg-assets.js';
import {DNG_ASSETS} from '../dng/dng-assets.js';
const dependencies=new Set([...ORT_ASSETS,...FFMPEG_ASSETS,...DNG_ASSETS].map(asset=>asset.url));
// GitHub Pages projects share an origin. Never clear other projects, user
// preferences, photos, or the small offline UI shell.
export async function clearDownloadedAssets({cacheStorage=globalThis.caches,base=new URL('../../',import.meta.url)}={}){
  if(!cacheStorage)throw Error('Cache storage unavailable');
  const scope=new URL(base),prefix=new URL('vendor/ai-portrait/',scope).pathname;
  let count=0,bytes=0;
  for(const name of await cacheStorage.keys()){
    if(name!==MODEL_CACHE_NAME&&!name.startsWith('photographic-style-depth-assets-')&&!name.startsWith('photographic-style-port-'))continue;
    const cache=await cacheStorage.open(name);
    for(const request of await cache.keys()){
      const url=new URL(request.url),local=url.origin===scope.origin&&url.pathname.startsWith(prefix);
      const remote=name===MODEL_CACHE_NAME&&dependencies.has(url.href);
      if(!local&&!remote)continue;
      const response=await cache.match(request),length=Number(response?.headers.get('content-length'));
      if(await cache.delete(request)){count++;if(Number.isSafeInteger(length)&&length>0)bytes+=length;}
    }
  }
  return {count,bytes};
}
