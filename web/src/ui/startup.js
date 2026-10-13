// Browser preparation is an acceleration layer, not a hard dependency for the
// basic HEIC editor. A missing/stalled service worker must not block the page.
export async function prepareBrowser({
  isolated = () => globalThis.crossOriginIsolated,
  serviceWorker = globalThis.navigator?.serviceWorker,
  secure = globalThis.isSecureContext,
  reload = () => globalThis.location.reload(),
  timeoutMs = 8000,
} = {}) {
  if (isolated()) {
    serviceWorker?.register('./sw.js', {scope: './'}).catch(error => console.warn('Offline support unavailable', error));
    return 'ready';
  }
  if (!secure) {
    const error=Error('BROWSER_INSECURE_CONTEXT');error.code='BROWSER_INSECURE_CONTEXT';throw error;
  }
  if (!serviceWorker) return 'ready-limited';
  const alreadyControlled = Boolean(serviceWorker.controller);
  let timer, listener;
  try {
    await Promise.race([
      (async () => {
        const controlled = new Promise(resolve => {
          listener = () => { if (serviceWorker.controller) resolve(); };
          serviceWorker.addEventListener('controllerchange', listener);
          listener();
        });
        await serviceWorker.register('./sw.js', {scope: './'});
        await controlled;
      })(),
      new Promise((_, reject) => {
        timer=setTimeout(()=>reject(Object.assign(Error('BROWSER_SETUP_TIMEOUT'),{code:'BROWSER_SETUP_TIMEOUT'})),timeoutMs);
      }),
    ]);
    // Isolation applies to the next navigation. Reload exactly once after the
    // first successful claim; already-controlled WebKit builds may remain
    // non-isolated and are allowed to continue in compatibility mode.
    if (alreadyControlled) return 'ready-limited';
    reload();
    return 'reloading';
  } catch (error) {
    // Offline cache/isolation improves the app but must never make a healthy
    // HTTPS page unusable merely because sw.js is stale, blocked or mid-deploy.
    console.warn('Service worker preparation unavailable; continuing in compatibility mode',error);
    return 'ready-limited';
  } finally {
    clearTimeout(timer);
    if (listener) serviceWorker.removeEventListener('controllerchange', listener);
  }
}

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export async function fetchJsonWithRetry(url,{
  fetchImpl=globalThis.fetch,
  attempts=3,
  delayMs=250,
}={}){
  let lastError;
  for(let attempt=0;attempt<attempts;attempt++){
    try{
      const response=await fetchImpl(url,{cache:attempt?'reload':'no-cache'});
      if(!response?.ok)throw Error(`HTTP ${response?.status??'unknown'} loading ${url}`);
      return await response.json();
    }catch(error){
      lastError=error;
      if(attempt+1<attempts)await sleep(delayMs*(attempt+1));
    }
  }
  const error=Error(`Required app resource unavailable: ${url}`,{cause:lastError});
  error.code='APP_RESOURCE_UNAVAILABLE';
  throw error;
}
