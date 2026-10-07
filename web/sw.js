const CACHE_PREFIX = "photographic-style-port-";
const CACHE_NAME = `${CACHE_PREFIX}v21`;
const DOWNLOAD_CACHE = 'psport-local-downloads-v1';
const downloadRoot = new URL('__local_download__/', self.registration.scope).href;

// Keep this list self-contained so a successful installation guarantees that
// the converter and both supported donor profiles can run without a network.
const APP_SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./profiles/index.json",
  "./profiles/45-15.zip",
  "./profiles/48-12.zip",
  "./src/box.js",
  "./src/bplist.js",
  "./src/decode.js",
  "./src/exif.js",
  "./src/ffmpeg-assets.js",
  "./src/ffmpeg-hevc.js",
  "./src/ffmpeg-worker.js",
  "./src/graft.js",
  "./src/heif.js",
  "./src/hevc-linear-tags.js",
  "./src/i18n.js",
  "./src/image-format.js",
  "./src/linear-thumbnail.js",
  "./src/live-photo.js",
  "./src/model-download.js",
  "./src/port.js",
  "./src/photo-date.js",
  "./src/local-download.js",
  "./src/styles.js",
  "./src/texture.js",
  "./src/raster/box.js",
  "./src/raster/bplist.js",
  "./src/raster/exif.js",
  "./src/raster/ffmpeg-assets.js",
  "./src/raster/ffmpeg-hevc.js",
  "./src/raster/ffmpeg-worker.js",
  "./src/raster/generated-profile.js",
  "./src/raster/heif.js",
  "./src/raster/hevc-color.js",
  "./src/raster/hevc-encoder.js",
  "./src/raster/hevc-linear-tags.js",
  "./src/raster/linear-thumbnail.js",
  "./src/raster/model-download.js",
  "./src/raster/native-empty-texture.js",
  "./src/raster/portrait-matte.js",
  "./src/raster/raster-color.js",
  "./src/raster/raster-import.js",
  "./src/raster/styles.js",
  "./src/raster/synthetic-hevc.js",
  "./src/raster/texture.js",
  "./src/raster/zip.js",
  "./src/zip.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

function isolated(response) {
  if (!response) return response;
  const headers = new Headers(response.headers);
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
}

self.addEventListener('message', event => {
  if (event.data === 'local-download-v1') event.ports[0]?.postMessage('local-download-v1');
});

async function localDownload(request) {
  const cache = await caches.open(DOWNLOAD_CACHE);
  const response = await cache.match(request);
  if (response && Number(response.headers.get('X-Local-Expires')) > Date.now()) return response;
  if (response) await cache.delete(request);
  // Never send local export paths to GitHub Pages, even when a file expired.
  return new Response('This local download expired. Select the original photo again to generate a new file.',
    {status:410, headers:{'Content-Type':'text/plain; charset=utf-8', 'Cache-Control':'no-store'}});
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    // Revalidate instead of trusting the HTTP cache (GitHub Pages allows 10 minutes), so a
    // freshly deployed page never runs with stale scripts or copy. Unchanged files cost a 304.
    // A navigation Request cannot be re-initialised, so it is refetched by URL.
    const response = await fetch(request.mode === "navigate" ? request.url : request,
                                 { cache: "no-cache" });
    if (response.ok) await cache.put(request, response.clone());
    return isolated(response);
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return isolated(cached);
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Third-party requests (the optional decoder and anonymous visit counter)
  // retain their existing failure behavior and are never persisted here.
  if (url.origin !== self.location.origin) return;

  if (url.href.startsWith(downloadRoot)) {
    event.respondWith(localDownload(request).catch(() => new Response('Local download unavailable.', {status:503})));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      networkFirst(request).catch(async () => {
        const cached = await caches.match("./index.html");
        return isolated(cached);
      })
    );
    return;
  }

  event.respondWith(networkFirst(request));
});
