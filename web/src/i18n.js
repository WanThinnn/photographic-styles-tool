// All localized page copy, in both languages, lives here.
//
// EDITING
//   Change the text to the right of a key. Keys are shared between en and zh, so
//   whatever you add to one you must add to the other, and whatever you rename
//   you must rename in index.html too.
//   Run `node tests/web/check-i18n.mjs` afterwards; it catches exactly those two
//   mistakes. Preview with `python -m http.server -d web 8000`, then reload.
//
//   A few tags are allowed inside a string — <b>, <br>, <code> — because the
//   values are inserted as HTML. Do not paste anything untrusted in here.
//
// STYLE
//   Chinese follows Apple's zh-Hans terms: 摄影风格, 调色板, 质感, 颗粒, 人像, “照片”App,
//   存储到“文件”, 存储图像, 点按. Use “” quotes, not 「」. Troubleshooting entries quote
//   the err.* messages, so keep the two in step when editing either.
//   Bold (<b>) marks only what the reader taps or looks for while following an
//   instruction (buttons, menu items, statuses) and the title of each
//   troubleshooting entry. Notices and the output section stay plain.
//
// WHERE EACH KEY APPEARS (top of the page to the bottom)
//   lang.name    the switch button; it names the language you switch TO
//   meta.title   browser tab and the big heading
//   app.tagline  the line under the heading
//   h.notice n.* "Before you start": the notices, shown first
//   app.lede     the short description above the drop area
//   drop.*       the drop area: the action only, no instructions
//   tip.*        the Photo Library tip under the drop area
//   opt.quality  the analysis switch
//   st.*         status text on a finished row
//   err.*        failures a visitor can see
//   btn.*        buttons on a finished row
//   h.steps s.*  how to use it, as numbered steps
//   h.get g.*    about the output
//   h.trouble t.* troubleshooting
//   p.version    the footer

export const STRINGS = {
  en: {
    "h.conversiondetails": "Conversion details",
    "date.kept": "Original capture time kept:",
    "date.missing": "The source has no readable capture time. Photos may use the import date.",
    "lang.name": "中文",
    "meta.title": "Photographic Styles Palette Port",
    "app.tagline": "Photographic Styles for HEIC, JPG, PNG and Android photos",

    "h.notice": "Before you start",
    "n.1": "Experimental, unofficial software, not affiliated with Apple.",
    "n.2": "An Apple HEIC holds only the still image. Keep your original photos.",
    "app.lede": "Add Styles, Texture and Grain. Photos stay on your device.",
    "drop.big": "Choose photos, or drop them here",
    "drop.small": "HEIC, JPG, PNG, WebP, GIF, BMP, AVIF + optional Live Photo MOV",
    "raster.help": "JPG/PNG and other supported images, including Android photos, are converted to a new HEIC with Styles and Texture/Grain. Animated images use one frame. The first conversion downloads an encoder; all photo processing stays on this device.",
    "st.rasterworking": "Converting image to Styles HEIC…",
    "st.rastertiles": "Encoding image tiles:",
    "st.rasterready": "converted to HEIC with Styles, Texture and Grain",
    "raster.note": "Original file kept. Transparent pixels are flattened onto black. This conversion does not recover HDR, Portrait or Live Photo data from a still image.",
    "raster.resized": "Original file kept. Output resized to fit the converter's tile limit; transparent pixels are flattened onto black. HDR, Portrait and Live Photo data are not created.",
    "err.rasterdecode": "The browser could not decode this image. No output file was created.",
    "err.rasterencode": "Could not convert this image to HEIC. Check your connection and retry; the browser may have run out of memory.",
    "tip.title": "Choosing from Photo Library",
    "tip.body": "On iOS versions that support it, select your photos, then tap <b>•••</b> in the "
      + "bottom-left corner → <b>Options</b> → <b>Format</b> → <b>Current</b>. This sends the "
      + "original HEIC instead of a converted JPEG. If a photo is still rejected, choose "
      + "<b>Browse</b> and pick it from Files.",
    "opt.quality": "Match styles to the photo’s tones",
    "h.formats": "Formats and processing",
    "opt.analysishelp": "Tone matching analyzes each photo and downloads a small decoder on first use. Turn it off if processing is slow or the page freezes.",

    "st.reading": "Reading…",
    "st.working": "Processing…",
    "st.experimental": "experimental — verify in iPhone Photos",
    "st.encoderload": "Loading image encoder:",
    "err.reloadencoder": "The image encoder needs offline support to finish installing. Reload this page once, then select the photo again. Use HTTPS or localhost.",
    "st.thumbnail": "Creating missing thumbnail…",
    "err.encoder": "Could not create the missing thumbnail. Check your connection and retry; the browser may have run out of memory. The command-line tool supports this step.",
    "st.ready": "Ready",
    "st.matched": "matched to this photo’s tones",
    "st.neutral": "default tone settings",
    "st.portrait": "Portrait data kept",
    "st.people": "people data kept",
    "st.texture": "Texture and Grain added",
    "st.native": "original Photographic Style kept",
    "err.notheic": "Unsupported image format. Choose HEIC, JPG, PNG, WebP, GIF, BMP or AVIF.",
    "err.unsupported": "This HEIC isn’t supported yet.",
    "err.hastexture": "This photo already has Texture and Grain. Nothing to do.",
    "err.nohdr": "No supported HDR gain map was found. This HEIC is unsupported by both the web and command-line tool.",
    "err.nothumb": "Missing thumbnail. The browser can generate one with the optional encoder.",

    "btn.save": "Save to Photos",
    "btn.download": "Download",
    "btn.livezip": "Download Live Photo pair",
    "btn.savestill": "Save still photo",
    "live.help": "Live Photo: select the original HEIC and its MOV from Files, together or separately. Download the verified pair as a ZIP. Import both files with a Live Photo-aware importer; Save still photo saves only the image. Video frames are unchanged.",
    "live.waitphoto": "Movie loaded. Waiting for a successfully processed HEIC with the same Live Photo identifier.",
    "live.waitmovie": "Live Photo image detected. Add its original MOV to preserve the pair. Saving this HEIC alone saves a still photo.",
    "live.paired": "Matching movie kept unchanged. Download the Live Photo pair, extract the ZIP and import both resources together with a Live Photo-aware importer. Saving the HEIC alone saves a still photo.",
    "live.matched": "Matched to the processed photo. Movie kept unchanged in the pair download.",
    "live.invalidmov": "This MOV has no readable Live Photo pairing metadata. Select the original Live Photo movie.",
    "live.duplicate": "A movie with this Live Photo identifier is already loaded. Reload the page to replace it.",
    "live.changed": "The output could not be verified as the same Live Photo. Pair export stopped; do not import it as a Live Photo.",
    "btn.blocked": "Couldn’t open sharing",

    "h.steps": "How to use",
    "s.1": "Choose your photos above, as described in the Photo Library tip. On a computer, "
      + "drop the files in.",
    "s.2": "Wait until each photo shows <b>Ready</b>; this takes a few seconds.",
    "s.3": "On iPhone, tap <b>Save to Photos</b>, then <b>Save Image</b>. On a computer, "
      + "download the result and send it to your iPhone as a file, with AirDrop or iCloud Drive.",
    "s.4": "Open the copy in Photos and tap <b>Edit</b>. The Photographic Styles palette "
      + "appears, and on iOS 27 also <b>Texture</b> and <b>Grain</b>.",

    "h.get": "About the output",
    "g.1": "When you edit the processed photo in Photos, the Photographic Styles palette "
      + "and Texture controls are available: adjust the style, tone and colour, save, and "
      + "edit again later.",
    "g.2": "Texture and Grain are available only on iOS 27.",
    "g.3": "Portrait and people data (depth, people masks) comes from the original "
      + "photo’s own data; this tool never computes it. Even if the original shows people, a "
      + "photo without Portrait depth data (you can tell: editing it shows no Portrait depth "
      + "control) won’t have it after processing either.",
    "g.4": "The tool is at the functionality stage: the look of styles and the detail of "
      + "Texture and Grain differ from a native photo, which is expected. Fine-tuning comes later.",
    "g.5": "Soft Skin works when the original carries Apple’s own people data (face regions, "
      + "skin and Portrait masks), as Portrait-mode photos and iPhone 16+ photos of people do. "
      + "Faces are never detected, so other photos keep a Soft Skin that looks like Standard.",
    "g.6": "For Live Photos, add the matching original MOV and download the verified file pair. "
      + "Import both files with a Live Photo-aware importer. Saving only the HEIC saves a still photo; video frames are unchanged.",

    "h.trouble": "Troubleshooting",
    "t.1": "<b>“Unsupported image format”</b>: choose HEIC, JPG, PNG, WebP, GIF, BMP or AVIF. "
      + "For iPhone photos, selecting the original HEIC keeps the most image metadata.",
    "t.2": "Missing thumbnails are generated locally. The optional encoder downloads about 32 MB on first use and is cached when possible. SDR or resized HEIC photos automatically use experimental support; check their Styles colours in iPhone Photos.",
    "t.3": "<b>“This HEIC isn’t supported yet”</b>: screenshots, copies edited or exported by "
      + "other apps, and photo layouts the tool does not support yet.",
    "t.4": "<b>The page freezes or reloads</b>: turn off the analysis switch above and try "
      + "again.",

    "p.version": "Version",
  },

  zh: {
    "h.conversiondetails": "转换详情",
    "h.formats": "格式与处理方式",
    "opt.analysishelp": "影调匹配会分析每张照片，首次使用需下载小型解码器。如处理缓慢或页面卡住，可关闭此选项。",
    "date.kept": "已保留原始拍摄时间：",
    "date.missing": "原图没有可读取的拍摄时间，“照片”可能使用导入日期。",
    "raster.help": "JPG/PNG 等支持的图像（包括 Android 照片）会转换为包含风格及质感/颗粒的新 HEIC。动画仅使用一帧。首次转换需下载编码器，照片处理均在本设备完成。",
    "st.rasterworking": "正在转换为风格 HEIC…",
    "st.rastertiles": "正在编码图像分块：",
    "st.rasterready": "已转换为包含风格、质感及颗粒的 HEIC",
    "raster.note": "原文件保留。透明像素合成到黑色背景，此转换不会从静态图恢复 HDR、人像或实况照片数据。",
    "raster.resized": "原文件保留。输出已缩小以符合分块上限，透明像素合成到黑色背景。不会创建 HDR、人像或实况照片数据。",
    "err.rasterdecode": "浏览器无法解码此图像，未生成输出文件。",
    "err.rasterencode": "无法转换为 HEIC。请检查网络后重试；浏览器也可能内存不足。",
    "lang.name": "English",
    "meta.title": "风格调色板移植工具",
    "app.tagline": "让旧款 iPhone 拍摄的照片也能使用摄影风格调色板",

    "h.notice": "注意事项",
    "n.1": "实验性非官方工具，与 Apple 无关。",
    "n.2": "Apple 的 HEIC 文件只包含静态图像，请保留原图。",
    "app.lede": "添加风格、质感与颗粒。照片仅在本设备上处理。",
    "drop.big": "选取照片，或拖放到此处",
    "drop.small": "HEIC、JPG、PNG、WebP、GIF、BMP、AVIF 及可选的实况照片 MOV",
    "tip.title": "从“照片图库”选取时",
    "tip.body": "在支持的 iOS 版本中，勾选照片后点按左下角的 <b>•••</b> → <b>选项</b> → "
      + "<b>格式</b> → <b>当前</b>，即可上传 HEIC 原图，而不是转换后的 JPEG。若仍被拒绝，"
      + "请改选<b>浏览</b>，从“文件”中选取。",
    "opt.quality": "匹配照片的影调",

    "st.reading": "读取中…",
    "st.working": "处理中…",
    "st.experimental": "实验性输出，请在 iPhone 照片中验证",
    "st.encoderload": "正在载入缩略图编码器：",
    "err.reloadencoder": "缩略图编码器需要离线支持完成安装。请刷新页面一次后重新选取照片，并使用 HTTPS 或 localhost。",
    "st.thumbnail": "正在生成缺失的缩略图…",
    "err.encoder": "无法生成缺失的缩略图，请检查网络后重试，浏览器也可能内存不足。命令行工具支持此步骤。",
    "st.ready": "已完成",
    "st.matched": "已匹配照片影调",
    "st.neutral": "已使用默认影调设置",
    "st.portrait": "已保留人像数据",
    "st.people": "已保留人物数据",
    "st.texture": "已添加质感与颗粒",
    "st.native": "已保留原有摄影风格",
    "err.notheic": "不是 HEIC 照片。可能已被 iOS 转换，请参阅“遇到问题”。",
    "err.unsupported": "暂不支持此 HEIC 文件。",
    "err.hastexture": "此照片已带有质感与颗粒，无需处理。",
    "err.nohdr": "未找到支持的 HDR 增益图。网页版和命令行工具均不支持此 HEIC 文件。",
    "err.nothumb": "缺少缩略图，浏览器可使用可选编码器生成。",

    "btn.save": "存储到“照片”",
    "btn.download": "下载",
    "btn.livezip": "下载实况照片文件对",
    "btn.savestill": "存储静态照片",
    "live.help": "实况照片：从“文件”选择原始 HEIC 及其 MOV，可一起或分开添加。下载验证后的 ZIP，解压后使用支持实况照片的工具同时导入两个文件。“存储静态照片”仅保存图片，视频帧保持不变。",
    "live.waitphoto": "视频已载入，等待处理成功且实况照片标识相同的 HEIC。",
    "live.waitmovie": "检测到实况照片图片，请添加其原始 MOV 以保留配对。单独保存 HEIC 只会保存静态照片。",
    "live.paired": "已保留匹配的原始视频。下载并解压 ZIP，使用支持实况照片的工具同时导入两个文件。单独保存 HEIC 只会保存静态照片。",
    "live.matched": "已匹配处理后的图片，视频原样包含在文件对下载中。",
    "live.invalidmov": "无法读取此 MOV 的实况照片配对信息，请选择原始实况照片视频。",
    "live.duplicate": "已载入具有相同实况照片标识的视频。请刷新页面后重新选择。",
    "live.changed": "无法确认输出仍属于同一实况照片，已停止文件对导出，请勿将其作为实况照片导入。",
    "btn.blocked": "无法打开共享菜单",

    "h.steps": "使用步骤",
    "s.1": "按上方“照片图库”提示选取照片；在电脑上直接拖入文件即可。",
    "s.2": "等待每张照片显示<b>已完成</b>，通常只需几秒。",
    "s.3": "在 iPhone 上点按<b>存储到“照片”</b>，再点按<b>存储图像</b>；在电脑上下载结果，"
      + "再通过隔空投送或 iCloud 云盘以文件形式传到 iPhone。",
    "s.4": "在“照片”App 中打开副本并点按<b>编辑</b>，即可看到摄影风格调色板；"
      + "在 iOS 27 上还会出现<b>质感</b>与<b>颗粒</b>。",

    "h.get": "输出结果说明",
    "g.1": "处理后的照片在“照片”App 中编辑时可启用摄影风格调色板与质感调节，"
      + "支持风格、影调和色彩调整，存储后可再次编辑。",
    "g.2": "质感与颗粒调节仅在 iOS 27 上可用。",
    "g.3": "人像与人物数据（深度、人物遮罩）来自原图的原始数据，本工具不会凭空计算。"
      + "原图即使拍到了人物，如果没有人像景深数据（判断方法：编辑原图时看不到人像景深控制），"
      + "处理后也不会有。",
    "g.4": "当前处于可用性验证阶段：风格效果以及质感/颗粒的细节与原生照片存在差异，"
      + "属于预期情况，微调会在之后进行。",
    "g.5": "原图本身带有 Apple 的人物数据（人脸区域、皮肤遮罩和人像遮罩）时，“柔肤”可以生效，"
      + "人像模式照片和 iPhone 16 及以后机型拍的人物照片都有这些数据。本工具不会自行检测人脸，"
      + "其他照片的“柔肤”仍与“标准”看起来一样。",
    "g.6": "实况照片请添加匹配的原始 MOV 并下载验证后的文件对，使用支持实况照片的工具同时导入两个文件。"
      + "单独保存 HEIC 只会保存静态照片，视频帧保持不变。",

    "h.trouble": "遇到问题",
    "t.1": "<b>“不支持的图像格式”</b>：请选择 HEIC、JPG、PNG、WebP、GIF、BMP 或 AVIF。iPhone 照片选择原始 HEIC 可保留更多元数据。",
    "t.2": "缺失的缩略图在本地生成。首次使用会下载约 32 MB 编码器，并尽可能缓存。SDR 或调整尺寸的 HEIC 会自动使用实验性支持，请在 iPhone 照片中检查风格颜色。",
    "t.3": "<b>“暂不支持此 HEIC 文件”</b>：截屏、经其他 App 编辑或导出的副本，以及暂不支持的照片布局。",
    "t.4": "<b>页面卡住或自动刷新</b>：关闭上方的分析开关后重试。",

    "p.version": "版本",
  },
};

const STORE_KEY = "psport.lang";

export function pickLanguage() {
  const saved = (() => { try { return localStorage.getItem(STORE_KEY); } catch { return null; } })();
  if (saved && STRINGS[saved]) return saved;
  const nav = (navigator.languages || [navigator.language || "en"]).join(",").toLowerCase();
  return /\bzh\b|zh-/.test(nav) ? "zh" : "en";
}

export function rememberLanguage(lang) {
  try { localStorage.setItem(STORE_KEY, lang); } catch { /* private mode */ }
}

export function t(lang, key) {
  return (STRINGS[lang] && STRINGS[lang][key]) ?? STRINGS.en[key] ?? key;
}

/** Fill every [data-i18n] element and set the document language. */
export function applyLanguage(lang) {
  document.documentElement.lang = lang === "zh" ? "zh-Hans" : "en";
  document.title = t(lang, "meta.title");
  for (const el of document.querySelectorAll("[data-i18n]"))
    el.innerHTML = t(lang, el.dataset.i18n);
}
