// A named, same-origin file response lets Safari download a HEIC through a URL
// instead of handing a freshly created File to the native share sheet. This is
// an alternative import route, not a guarantee about the Photos library date.
export const DOWNLOAD_CACHE = 'psport-local-downloads-v1';
export const DOWNLOAD_PATH = '__local_download__/';
export const DOWNLOAD_TTL = 60 * 60 * 1000;

export async function pruneDownloads(cache, now = Date.now()) {
  for (const key of await cache.keys()) {
    const response = await cache.match(key);
    const expiry = Number(response?.headers.get('X-Local-Expires'));
    if (!expiry || expiry <= now) await cache.delete(key);
  }
}

export function downloadResponse(blob, filename, timestamp, now = Date.now()) {
  const headers = new Headers({
    'Content-Type': blob.type || 'application/octet-stream',
    'Content-Length': String(blob.size),
    'Content-Disposition': `inline; filename="photo.HEIC"; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())}`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Local-Expires': String(now + DOWNLOAD_TTL),
  });
  if (Number.isFinite(timestamp)) headers.set('Last-Modified', new Date(timestamp).toUTCString());
  return new Response(blob, {headers});
}

async function supportsDownloads(controller) {
  const channel = new MessageChannel();
  return new Promise(resolve => {
    const done = value => { clearTimeout(timer); channel.port1.close(); resolve(value); };
    const timer = setTimeout(() => done(false), 1000);
    channel.port1.onmessage = event => done(event.data === 'local-download-v1');
    controller.postMessage('local-download-v1', [channel.port2]);
  });
}

export async function localDownloadUrl(blob, filename, timestamp) {
  const controller = navigator.serviceWorker?.controller;
  if (!controller || !globalThis.caches || !await supportsDownloads(controller)) return null;
  const cache = await caches.open(DOWNLOAD_CACHE);
  await pruneDownloads(cache);
  const url = new URL(DOWNLOAD_PATH + crypto.randomUUID() + '/' + encodeURIComponent(filename),
    new URL('./', location.href));
  await cache.put(url.href, downloadResponse(blob, filename, timestamp));
  return url.href;
}
