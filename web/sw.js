const CACHE_PREFIX = "photographic-style-port-";
const CACHE_NAME = `${CACHE_PREFIX}v109`;
// Immutable dependency identity, independent of UI/service-worker releases.
const DEPTH_ASSET_CACHE = 'photographic-style-depth-assets-4472b736-ort-1.22.0';

// Warm the complete offline converter after startup. Only BOOT_SHELL below
// gates installation, so first visits do not wait for the whole module graph.
const APP_SHELL = [
  "./src/core/gain-map.js",
  "./src/styles/hdr-compatibility.js",
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./LICENSE.txt",
  "./src/ui/page-bootstrap.js",
  "./src/ui/processing-scheduler.js",
  "./src/ui/ai-strings.js",
  "./src/ui/ai-feature-controls.js",
  "./src/detail/detail-processing.js",
  "./src/detail/detail-models.js",
  "./src/detail/detail-inference.js",
  "./src/detail/detail-worker.js",
  "./src/detail/detail-raster.js",
  "./src/detail/detail-native-heic.js",
  "./src/portrait/ai-portrait.js",
  "./src/portrait/ai-inference.js",
  "./src/portrait/ai-inference-worker.js",
  "./src/portrait/depth-models.js",
  "./src/core/cache-cleanup.js",
  "./src/portrait/ai-depth-refinement.js",
  "./src/portrait/person-depth-guidance.js",
  "./src/media/auxiliary-image.js",
  "./src/portrait/ai-portrait-assembler.js",
  "./src/portrait/ai-portrait-export-worker.js",
  "./src/codecs/libheif-lifecycle.js",
  "./src/portrait/ai-portrait-container.js",
  "./src/portrait/native-base-analysis.js",
  "./src/portrait/apple-depth-metadata.js",
  "./src/portrait/ai-portrait-export.js",
  "./src/portrait/ai-portrait-preview.js",
  "./src/portrait/portrait-template.json",
  "./src/portrait/ai-portrait-ui.js",
  "./src/portrait/ai-portrait-blur.js",
  "./src/portrait/ai-portrait-source.js",
  "./src/portrait/ai-bokeh.js",
  "./src/dng/dng-import.js",
  "./src/dng/dng-tiff.js",
  "./src/dng/dng-tiles.js",
  "./src/dng/dng-worker.js",
  "./src/dng/dng-decode.js",
  "./src/dng/dng-assets.js",
  "./src/dng/dng-inspection.js",
  "./src/dng/model-download.js",
  "./manifest.webmanifest",
  "./icons/photographic-styles.svg",
  "./icons/icon-180.png",
  "./icons/icon-180-ios.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
  "./profiles/index.json",
  "./profiles/45-15.zip",
  "./profiles/48-12.zip",
  "./src/core/box.js",
  "./src/core/bplist.js",
  "./src/media/decode.js",
  "./src/core/exif.js",
  "./src/styles/style-preservation.js",
  "./src/styles/style-capabilities.js",
  "./src/ui/startup.js",
  "./src/media/heic-worker.js",
  "./src/media/heic-processing.js",
  "./src/ui/result-metadata.js",
  "./src/codecs/ffmpeg-assets.js",
  "./src/codecs/ffmpeg-hevc.js",
  "./src/codecs/ffmpeg-worker.js",
  "./src/styles/graft.js",
  "./src/core/heif.js",
  "./src/codecs/hevc-linear-tags.js",
  "./src/ui/i18n.js",
  "./src/media/image-format.js",
  "./src/codecs/linear-thumbnail.js",
  "./src/media/live-photo.js",
  "./src/core/model-download.js",
  "./src/styles/port.js",
  "./src/media/photo-date.js",
  "./src/styles/styles.js",
  "./src/styles/texture.js",
  "./src/styles/texture-compatibility.js",
  "./src/styles/generated-style-metadata.js",
  "./src/styles/soft-skin.js",
  "./src/styles/soft-skin-container.js",
  "./src/vision/face-mattes.js",
  "./src/vision/face-refinement.js",
  "./src/vision/face-canonical.js",
  "./src/vision/matte-encoder.js",
  "./src/vision/source.js",
  "./src/vision/model-download.js",
  "./src/vision/ort-assets.js",
  "./src/vision/ort-vision.js",
  "./src/vision/ort-vision-math.js",
  "./src/vision/ort-inference-worker.js",
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
  "./src/raster/jpeg-hdr.js",
  "./src/raster/styles.js",
  "./src/raster/synthetic-hevc.js",
  "./src/raster/texture.js",
  "./src/raster/zip.js",
  "./src/core/zip.js"
];

// Only the initial screen gates activation. Preloading the whole converter
// here left first visits waiting for every rarely-used processing module.
const BOOT_SHELL=['./','./index.html','./styles.css','./src/ui/page-bootstrap.js','./src/ui/i18n.js','./src/ui/ai-strings.js','./icons/photographic-styles.svg'];
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(BOOT_SHELL))
      .catch(error => console.warn('Offline cache unavailable:', error))
      .then(() => self.skipWaiting())
  );
});

let warming;
self.addEventListener('message',event=>{
  if(event.data?.type!=='WARM_CACHE')return;
  warming??=(async()=>{
    const cache=await caches.open(CACHE_NAME),pending=APP_SHELL.slice();
    // Run after the UI and converter are ready, with bounded parallel requests.
    await Promise.all(Array.from({length:4},async()=>{
      while(pending.length){const path=pending.shift();if(await cache.match(path))continue;
        const response=await fetch(path,{cache:'no-cache'});if(response.ok)await cache.put(path,response);}
    }));
  })().catch(error=>{warming=null;console.warn('Offline preparation unavailable:',error);});
  event.waitUntil(warming);
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      ))
      // Remove temporary photo copies made by the retired download experiment.
      .then(() => caches.delete('psport-local-downloads-v1'))
      .catch(error => console.warn('Cache cleanup unavailable:', error))
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


async function networkFirst(request) {
  let cache;
  try { cache = await caches.open(CACHE_NAME); } catch {}
  try {
    // Revalidate instead of trusting the HTTP cache (GitHub Pages allows 10 minutes), so a
    // freshly deployed page never runs with stale scripts or copy. Unchanged files cost a 304.
    // A navigation Request cannot be re-initialised, so it is refetched by URL.
    const response = await fetch(request.mode === "navigate" ? request.url : request,
                                 { cache: "no-cache" });
    if (response.ok && cache) try { await cache.put(request, response.clone()); } catch {}
    return isolated(response);
  } catch (error) {
    let cached;
    try { cached = await cache?.match(request, { ignoreSearch: true }); } catch {}
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

  if (url.pathname.includes('/vendor/ai-portrait/')) {
    // Opt-in assets are immutable for this app version. Cache once, and tolerate
    // storage quota/private-mode failures instead of discarding a valid response.
    event.respondWith((async () => {
      let cache;
      // The model downloader owns complete, SHA-verified model storage. Avoid
      // retaining a second 100 MB copy here. Small runtime assets share a
      // revision cache; the manifest revalidates when deployment changes.
      if(/\.onnx(?:_data)?$/.test(url.pathname))return isolated(await fetch(request));
      if(url.pathname.endsWith('/assets.json'))return networkFirst(request);
      try {cache=await caches.open(DEPTH_ASSET_CACHE);const hit=await cache.match(request);if(hit)return isolated(hit);} catch {}
      const response=await fetch(request);
      if(response.ok&&cache)try{await cache.put(request,response.clone());}catch{}
      return isolated(response);
    })());
    return;
  }


  if (request.mode === "navigate") {
    event.respondWith(
      networkFirst(request).catch(async () => {
        let cached;
        try { cached = await caches.match("./index.html"); } catch {}
        return isolated(cached || new Response('Offline. Please reconnect and retry.', {status:503}));
      })
    );
    return;
  }

  event.respondWith(networkFirst(request));
});
