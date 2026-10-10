// Isolation headers apply to a navigation, not to the document already loaded.
// Claim the first visit, then navigate once before allowing photo selection.
export async function prepareBrowser({
  isolated = () => globalThis.crossOriginIsolated,
  serviceWorker = globalThis.navigator?.serviceWorker,
  secure = globalThis.isSecureContext,
  reload = () => globalThis.location.reload(),
  timeoutMs = 45000,
} = {}) {
  if (isolated()) {
    serviceWorker?.register('./sw.js', {scope: './'}).catch(error => console.warn('Offline support unavailable', error));
    return 'ready';
  }
  if (!secure || !serviceWorker) throw Error('BROWSER_SETUP_UNAVAILABLE');
  const alreadyControlled = Boolean(serviceWorker.controller);
  let timer, listener;
  try {
    await Promise.race([
      (async () => {
        // Listen before registering: activation may claim us immediately.
        const controlled = new Promise(resolve => {
          listener = () => { if (serviceWorker.controller) resolve(); };
          serviceWorker.addEventListener('controllerchange', listener);
          listener();
        });
        await serviceWorker.register('./sw.js', {scope: './'});
        await controlled;
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Error('BROWSER_SETUP_TIMEOUT')), timeoutMs); }),
    ]);
    // Some WebKit/iOS builds can be controlled by the service worker yet still
    // refuse cross-origin isolation synthesized by a fetch handler. That is not a
    // network/setup failure: allow the app to start in compatibility mode and
    // gate only the features that truly require SharedArrayBuffer/threads.
    if (alreadyControlled) return 'ready-limited';
    reload();
    return 'reloading';
  } finally {
    clearTimeout(timer);
    if (listener) serviceWorker.removeEventListener('controllerchange', listener);
  }
}
