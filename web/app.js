import { loadProfile } from "./src/zip.js";
import { patch, profileFor, VERSION, UNSUPPORTED } from "./src/port.js";
import { discoverHeic, dimensionsForItem } from "./src/heif.js";
import { styleDeltaSize } from "./src/graft.js";
import { addTexture, hasTexture } from "./src/texture.js";
import { decodeToRgb, loadLibheif } from "./src/decode.js";
import { pickLanguage, rememberLanguage, applyLanguage, t } from "./src/i18n.js";
import { photoContentIdentifier, moviePairingMetadata, livePhotoPackage } from "./src/live-photo.js";
import { imageFormat, RASTER_MIMES } from "./src/image-format.js";
import { photoCaptureDate } from "./src/photo-date.js";

const $ = (id) => document.getElementById(id);
const fileInput = $("file"), drop = $("drop"), list = $("list"), quality = $("quality");

// Fetch the decoder while the visitor is still choosing a photo (or switches analysis on),
// so the first photo does not wait for the download, and someone just reading the page
// downloads nothing. A failure here is harmless: ensureDecode() tries again and falls back.
const warmDecoder = () => { if (quality.checked) loadLibheif().catch(() => {}); };
quality.addEventListener("change", warmDecoder);
for (const ev of ["pointerdown", "dragenter", "focus"]) drop.addEventListener(ev, warmDecoder, { once: true });

let lang = pickLanguage();
const T = (key) => t(lang, key);

let profileIndex = null;
const profileCache = new Map();
const liveMovies = new Map();
const livePhotos = [];

function attachMovie(photo) {
  const movie = liveMovies.get(photo.identifier);
  if (!movie || photo.paired) return;
  try {
    const zip = livePhotoPackage(photo.source, photo.output, movie.bytes, photo.name);
    photo.ui.link(new Blob([zip], { type: "application/zip" }),
      photo.name.replace(/\.[^.]+$/, "") + "_LivePhoto.zip", "btn.livezip");
    photo.ui.note(T("live.paired"));
    movie.ui.set(T("live.matched"), "ok");
    photo.paired = true;
  } catch (e) {
    console.error("Live Photo export stopped", e);
    photo.ui.note(T("live.changed"));
  }
}

async function handleMovie(file, bytes, ui) {
  try {
    const metadata = moviePairingMetadata(bytes);
    if (!metadata.contentIdentifier || !metadata.hasStillImageTimeKey)
      throw new Error("Missing Live Photo metadata");
    if (liveMovies.has(metadata.contentIdentifier)) {
      ui.set(T("live.duplicate"), "err");
      return;
    }
    liveMovies.set(metadata.contentIdentifier, { bytes, ui });
    ui.set(T("live.waitphoto"));
    for (const photo of livePhotos) attachMovie(photo);
  } catch (e) {
    console.error("could not read Live Photo movie", file.name, e);
    ui.set(T("live.invalidmov"), "err");
  }
}

async function getProfile(name) {
  if (!profileCache.has(name)) {
    const res = await fetch(`profiles/${profileIndex[name].file}`);
    if (!res.ok) throw new Error(UNSUPPORTED);
    profileCache.set(name, await loadProfile(new Uint8Array(await res.arrayBuffer())));
  }
  return profileCache.get(name);
}

// Probe with a real decode of a real photo. Checking only that the script loaded
// says nothing about whether it can actually decode, and a decoder that loads but
// cannot decode is the failure mode that is hardest to notice.
let decodeAvailable = null;
async function ensureDecode(bytes) {
  if (decodeAvailable !== null) return decodeAvailable;
  try {
    await loadLibheif();
    await decodeToRgb(bytes, { width: 8, height: 8 });
    decodeAvailable = true;
  } catch (e) {
    console.warn("image analysis unavailable, using neutral settings:", e);
    decodeAvailable = false;
  }
  return decodeAvailable;
}

function row(name) {
  const el = document.createElement("div");
  el.className = "row";
  el.innerHTML = `<div class="name"></div><div class="status"></div><div class="act"></div>`;
  el.querySelector(".name").textContent = name;
  el.querySelector(".name").title = name;
  list.appendChild(el);
  return {
    set(text, cls) {
      const s = el.querySelector(".status");
      s.textContent = cls === 'ok' ? T("st.ready") : text;
      if (cls === 'ok') this.note(text, 'processing');
      s.className = `status ${cls || ""}`;
    },
    note(text, kind = "live") {
      let note = el.querySelector(`[data-note="${kind}"]`);
      if (!note) {
        note = document.createElement("p");
        note.className = "live-note";
        note.dataset.note = kind;
        let details = el.querySelector('.result-details');
        if (!details) {
          details = document.createElement('details');
          const summary = document.createElement('summary');
          summary.textContent = T("h.conversiondetails");
          details.className = 'result-details';
          details.append(summary);
          el.appendChild(details);
        }
        details.appendChild(note);
      }
      note.textContent = text;
    },
    link(blob, filename, key = "btn.download") {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.textContent = T(key);
      a.className = el.querySelector(".act").children.length ? "dl alt" : "dl";
      el.querySelector(".act").appendChild(a);
    },
    share(file, live = false) {
      const b = document.createElement("button");
      b.className = "dl";
      b.type = "button";
      b.textContent = T(live ? "btn.savestill" : "btn.save");
      b.addEventListener("click", async () => {
        try { await navigator.share({ files: [file] }); }
        catch (e) { if (e.name !== "AbortError") b.textContent = T("btn.blocked"); }
      });
      el.querySelector(".act").appendChild(b);
    },
  };
}

async function handleFile(file) {
  const ui = row(file.name);
  try {
    ui.set(T("st.reading"));
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (/\.mov$/i.test(file.name) || file.type === "video/quicktime") {
      await handleMovie(file, bytes, ui);
      return;
    }
    const format = imageFormat(bytes);
    if (RASTER_MIMES[format]) {
      if (!globalThis.crossOriginIsolated) { ui.set(T("err.reloadencoder"), "err"); return; }
      const { importRaster } = await import("./src/raster/raster-import.js");
      let result;
      try {
        result = await importRaster(new File([bytes], file.name, {type: RASTER_MIMES[format]}),
          null, progress => {
            if (progress.stage === "modelDownload")
              ui.set(`${T("st.encoderload")} ${(progress.loaded / 1048576).toFixed(1)} MB`);
            else if (progress.stage === "main") ui.set(`${T("st.rastertiles")} ${progress.done}/${progress.total}`);
            else ui.set(T("st.rasterworking"));
          }, {analyze: quality.checked});
      } catch (error) {
        console.error("Raster conversion failed", file.name, error);
        ui.set(T(/Raster image decode failed/i.test(error.message) ? "err.rasterdecode" : "err.rasterencode"), "err");
        return;
      }
      const outName = file.name.replace(/\.[^.]+$/, "") + "_PhotographicStyle.HEIC";
      const date = photoCaptureDate(result.data);
      const output = new File([result.data], outName, {type: "image/heic",
        ...(date?.timestamp !== undefined ? {lastModified:date.timestamp} : {})});
      ui.set(`${T("st.ready")} — ${T("st.rasterready")}`, "ok");
      ui.note(result.geometry.resized ? T("raster.resized") : T("raster.note"), "conversion");
      showCaptureDate(ui, date);
      if (navigator.canShare?.({files: [output]})) ui.share(output);
      ui.link(output, outName);
      return;
    }
    if (format !== "heic") { ui.set(T("err.notheic"), "err"); return; }

    const d = discoverHeic(bytes);
    const liveIdentifier = photoContentIdentifier(bytes);
    const sep = lang === "zh" ? "、" : ", ";
    let data, bits, suffix;
    if (d.stylesItem !== null) {
      // A native iPhone 16/17 style photo is never re-ported (that would replace its real
      // style data); it only gets the iOS 27 Texture/Grain set added.
      if (hasTexture(d.infos)) { ui.set(T("err.hastexture"), "err"); return; }
      ui.set(T("st.working"));
      ({ data } = addTexture(bytes));
      bits = [T("st.native"), T("st.texture")];
      suffix = "_TextureGrain.HEIC";
    } else {
      const needsExperimental = d.hdrGrid === null
        || !styleDeltaSize(...dimensionsForItem(d.props, d.primary));
      const name = profileFor(profileIndex, d, needsExperimental);
      const profile = await getProfile(name);
      // Start processing; if the thumbnail is missing, dynamically load the generator.
      let linearThumb = undefined;
      if (d.thumbnail === null) {
        if (!globalThis.crossOriginIsolated) { ui.set(T("err.reloadencoder"), "err"); return; }
        const { generateLinearThumbnail } = await import("./src/linear-thumbnail.js");
        try {
          linearThumb = await generateLinearThumbnail(bytes, progress => {
            if (progress.stage === "modelDownload")
              ui.set(`${T("st.encoderload")} ${(progress.loaded / 1048576).toFixed(1)} MB`);
            else ui.set(T(progress.stage === "encode" ? "st.thumbnail" : "st.working"));
          });
        } catch (e) {
          console.error("could not generate thumbnail", e);
          ui.set(T("err.encoder"), "err");
          return;
        }
      }

      const canDecode = quality.checked ? await ensureDecode(bytes) : false;
      ui.set(T("st.working"));
      const opts = canDecode
        ? { decode: decodeToRgb, sceneStats: "target", lightMaps: "target", linearThumb, experimental: needsExperimental }
        : { sceneStats: "donor", linearThumb, experimental: needsExperimental };
      let report;
      ({ data, report } = await patch(bytes, profile, opts));
      // patch() degrades rather than failing when the decoder misbehaves, so trust
      // what it reports it actually did, not what we asked for.
      if (report.decodeError) console.warn("decoder unavailable:", report.decodeError);

      bits = [T(report.decoded ? "st.matched" : "st.neutral")];
      if (report.mattes.added.some((m) => m.startsWith("depth"))) bits.push(T("st.portrait"));
      else if (report.mattes.transplanted.length) bits.push(T("st.people"));
      if (report.texture !== "off") bits.push(T("st.texture"));
      if (needsExperimental) bits.push(T("st.experimental"));
      suffix = needsExperimental ? "_ExperimentalStyle.HEIC" : "_PhotographicStyle.HEIC";
    }
    ui.set(`${T("st.ready")} — ${bits.join(sep)}`, "ok");

    const outName = file.name.replace(/\.[^.]+$/, "") + suffix;
    // On iPhone the share sheet lands the file straight in Photos; elsewhere a plain
    // download is the shorter route.
    const date = photoCaptureDate(data);
    const shareFile = new File([data], outName, { type: "image/heic",
      ...(date?.timestamp !== undefined ? {lastModified:date.timestamp} : {}) });
    showCaptureDate(ui, date);
    if (navigator.canShare && navigator.canShare({ files: [shareFile] })) ui.share(shareFile, !!liveIdentifier);
    ui.link(new Blob([data], { type: "image/heic" }), outName);
    if (liveIdentifier) {
      ui.note(T("live.waitmovie"));
      const photo = { identifier: liveIdentifier, source: bytes, output: data, name: outName, ui };
      livePhotos.push(photo);
      attachMovie(photo);
    }
  } catch (e) {
    // Past the format sniff, every remaining rejection means the same thing to a
    // visitor: this is a HEIC, but not one this build can handle. The real reason
    // still goes to the console, because "unsupported" on every photo is exactly
    // how a bug elsewhere would look.
    console.error("could not port", file.name, e);
    ui.set(T("err.unsupported"), "err");
  }
}

function showCaptureDate(ui, date) {
  ui.note(date ? `${T("date.kept")} ${date.date}${date.subsec ? '.' + date.subsec : ''}${date.offset ? ' ' + date.offset : ''}`
    : T("date.missing"), "date");
}

async function handleFiles(files) {
  for (const f of files) await handleFile(f);
}
// Serialize separate picker/drop events so duplicate MOVs cannot race pairing.
let fileQueue = Promise.resolve();
const enqueueFiles = (files) => { fileQueue = fileQueue.then(() => handleFiles(files)); };

drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  enqueueFiles([...e.dataTransfer.files]);
});
drop.addEventListener("click", () => fileInput.click());
drop.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
});
fileInput.addEventListener("change", () => {
  enqueueFiles([...fileInput.files]);
  fileInput.value = "";
});

$("lang").addEventListener("change", () => {
  lang = $("lang").value;
  rememberLanguage(lang);
  applyLanguage(lang);
});

// Visit counter behind the README badge. The only request this site makes to a
// counter service, and it carries nothing but the fact that the page was opened —
// no photo ever reaches it. Fired once per browser session so a reload is not a
// new visit, and fire-and-forget: a counter that is down is not worth an error.
// If sessionStorage is blocked the visit goes uncounted, which undercounts
// rather than counting every reload of a private-mode window as a new visitor.
function countVisit() {
  try {
    if (sessionStorage.getItem("counted")) return;
    sessionStorage.setItem("counted", "1");
  } catch (e) {
    return;
  }
  fetch("https://abacus.jasoncameron.dev/hit/nathanatgit-shalielie/web").catch(() => {});
}

(async () => {
  applyLanguage(lang);
  $("version").textContent = VERSION;
  countVisit();
  try {
    profileIndex = await (await fetch("profiles/index.json")).json();
  } catch (e) {
    $("boot").textContent = e.message;
    $("boot").className = "err";
  }
})();

// Keep installation and offline support progressive: unsupported browsers use
// the page exactly as before, while HTTPS/localhost deployments gain a PWA.
if ("serviceWorker" in navigator) {
  const registerSW = () => {
    navigator.serviceWorker.register("./sw.js", { scope: "./" })
      .catch((e) => console.warn("offline support unavailable:", e));
  };
  if (document.readyState === "complete") {
    registerSW();
  } else {
    window.addEventListener("load", registerSW);
  }
}
