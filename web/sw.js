const CACHE_PREFIX = "photographic-style-port-";
const CACHE_NAME = `${CACHE_PREFIX}v70`;

// Keep this list self-contained so a successful installation guarantees that
// the converter and both supported donor profiles can run without a network.
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./src/ai-portrait.js",
  "./src/ai-inference.js",
  "./src/ai-inference-worker.js",
  "./src/libheif-lifecycle.js",
  "./src/ai-portrait-container.js",
  "./src/apple-depth-metadata.js",
  "./src/ai-depth-export.js",
  "./src/ai-portrait-export.js",
  "./src/ai-portrait-preview.js",
  "./src/portrait-template.json",
  "./src/ai-portrait-ui.js",
  "./src/ai-portrait-blur.js",
  "./src/ai-portrait-source.js",
  "./src/ai-bokeh.js",
  "./src/ai-bokeh-export.js",
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
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./profiles/index.json",
  "./profiles/45-15.zip",
  "./profiles/48-12.zip",
  "./src/box.js",
  "./src/bplist.js",
  "./src/decode.js",
  "./src/exif.js",
  "./src/style-preservation.js",
  "./src/startup.js",
  "./src/heic-worker.js",
  "./src/heic-processing.js",
  "./src/result-metadata.js",
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
  "./src/styles.js",
  "./src/texture.js",
  "./src/texture-compatibility.js",
  "./src/generated-style-metadata.js",
  "./src/soft-skin.js",
  "./src/soft-skin-container.js",
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
  "./src/zip.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(error => console.warn('Offline cache unavailable:', error))
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
      try {cache=await caches.open(`${CACHE_NAME}-ai`);const hit=await cache.match(request);if(hit)return isolated(hit);} catch {}
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
