// All localized page copy (Vietnamese, English and Chinese) lives here.
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
  vi: {
    "btn.clearhistory": "Xóa lịch sử xử lý",
    "btn.retry": "Thử lại",
    "st.preparing": "Đang chuẩn bị công cụ cho lần sử dụng đầu tiên…",
    "err.setup": "Chưa chuẩn bị được công cụ. Hãy kiểm tra kết nối và mở trang bằng HTTPS, rồi thử lại.",
    "h.conversiondetails": "Chi tiết",
    "h.help": "Hướng dẫn & thông tin",
    "h.editlimits": "Ảnh iPhone 16/17 đã chỉnh Styles hoặc Chân dung",
    "help.editlimits": "Ảnh đã đổi Styles hoặc bật Chân dung trong Ảnh có thể được xuất thành bản thiếu dữ liệu chỉnh sửa gốc. Nếu file còn Styles gốc, tool chỉ thêm Kết cấu/Hạt và giữ dữ liệu có sẵn. Nếu thiếu, tạo Styles mới có thể làm màu khác đi và không khôi phục HDR đã thiếu hay Styles bạn đã chọn.",
    "help.portraitlimits": "Menu có Chân dung không đảm bảo mục Sửa có nút ƒ hoặc Ánh sáng chân dung. Tool giữ dữ liệu depth có trong file, nhưng không lấy được lịch sử chỉnh sửa từ thư viện Ảnh. Hãy giữ ảnh gốc và kiểm tra bản sao trên iPhone trước khi dùng thay thế.",
    "app.hero": "Một sắc thái mới.",
    "help.steps": "Chọn ảnh, chờ xử lý xong rồi lưu bản sao. Mở ảnh trong ứng dụng Ảnh trên iPhone → Sửa để điều chỉnh Phong cách nhiếp ảnh. Kết cấu và Hạt cần iOS 27.",
    "help.formats": "Hỗ trợ HEIC, JPG, PNG, DNG, WebP, GIF, BMP và AVIF. DNG được giải mã sang sRGB và xuất HEIC, không còn RAW. Ảnh động chỉ dùng một khung hình.",
    "help.original": "Hãy giữ ảnh gốc. Để giữ Styles, HDR và chỉnh Chân dung trên ảnh iPhone 16 trở lên, hãy thêm Texture vào HEIC gốc trước khi chỉnh trong Ảnh. Bản xuất sau chỉnh sửa có thể thiếu dữ liệu cần thiết.",
    "help.live": "Lưu vào Ảnh chỉ lưu ảnh tĩnh. Xuất cặp Live Photo cần video MOV gốc tương ứng và công cụ nhập tương thích.",
    "help.slow": "Lần chuyển đổi đầu tiên cần tải bộ mã hóa. Nếu trang chạy chậm, hãy tắt tùy chọn khớp sắc độ rồi thử lại.",
    "help.language": "Ngôn ngữ mặc định theo trình duyệt. App luôn ưu tiên và ghi nhớ ngôn ngữ bạn chọn.",
    "date.kept": "Thời gian chụp trong file:",
    "t.date": "<b>Ngày chụp</b>: file giữ metadata thời gian chụp gốc. Ảnh và iCloud có thể gán ngày lưu; web không kiểm soát được ngày trong thư viện.",
    "date.missing": "Không đọc được thời gian chụp gốc. Ứng dụng Ảnh có thể dùng ngày nhập ảnh.",
    "lang.name": "Tiếng Việt",
    "lang.label": "Ngôn ngữ",
    "meta.title": "Next-generation Photographic Styles",
    "app.tagline": "Phong cách nhiếp ảnh cho ảnh của bạn",
    "p.author": "bởi Elio",
    "h.notice": "Trước khi bắt đầu",
    "n.1": "Công cụ thử nghiệm, không chính thức và không liên kết với Apple.",
    "n.2": "File HEIC của Apple chỉ chứa ảnh tĩnh. Hãy giữ ảnh gốc.",
    "app.lede": "Thêm Phong cách, Kết cấu và Hạt. Xử lý riêng tư trên thiết bị của bạn.",
    "drop.big": "Chọn ảnh",
    "drop.small": "HEIC, JPG, PNG, DNG · hoặc kéo thả vào đây",
    "raster.help": "JPG/PNG và các định dạng được hỗ trợ, kể cả ảnh Android, được chuyển thành HEIC mới có Phong cách, Kết cấu và Hạt. Ảnh động chỉ dùng một khung hình. Lần đầu cần tải bộ mã hóa; ảnh luôn được xử lý trên thiết bị này.",
    "st.rasterworking": "Đang chuyển ảnh sang HEIC có Phong cách…",
    "st.rastertiles": "Đang mã hóa các phần ảnh:",
    "st.rasterready": "đã chuyển thành HEIC có Phong cách, Kết cấu và Hạt",
    "raster.note": "Giữ nguyên file gốc. Điểm ảnh trong suốt được ghép lên nền đen. Chuyển đổi này không khôi phục HDR, Chân dung hay Live Photo từ ảnh tĩnh.",
    "raster.resized": "Giữ nguyên file gốc. Ảnh đầu ra được thu nhỏ để phù hợp giới hạn xử lý; điểm ảnh trong suốt được ghép lên nền đen. Không tạo thêm HDR, Chân dung hay Live Photo.",
    "err.rasterdecode": "Trình duyệt không đọc được ảnh này. Chưa tạo file đầu ra.",
    "err.rasterencode": "Không thể chuyển ảnh sang HEIC. Kiểm tra kết nối rồi thử lại; trình duyệt cũng có thể đã hết bộ nhớ.",
    "tip.title": "Chọn ảnh từ thư viện",
    "tip.body": "Trên phiên bản iOS có hỗ trợ, chọn ảnh rồi chạm <b>•••</b> ở góc dưới bên trái → <b>Tùy chọn</b> → <b>Định dạng</b> → <b>Hiện tại</b> để gửi HEIC gốc thay vì JPEG đã chuyển đổi. Nếu vẫn không nhận ảnh, chọn <b>Duyệt</b> và lấy ảnh từ Tệp.",
    "opt.quality": "Khớp Phong cách với sắc độ của ảnh",
    "h.formats": "Định dạng & xử lý",
    "opt.analysishelp": "Khớp sắc độ phân tích từng ảnh và tải bộ giải mã nhỏ trong lần đầu. Tắt tùy chọn này nếu xử lý chậm hoặc trang bị treo.",
    "st.reading": "Đang đọc…",
    "st.working": "Đang xử lý…",
    "st.experimental": "bản thử nghiệm — cần kiểm tra trong Ảnh trên iPhone",
    "st.encoderload": "Đang chuẩn bị chuyển đổi ảnh:",
    "err.reloadencoder": "Trình duyệt chưa sẵn sàng để chuyển đổi ảnh. Hãy mở trang bằng HTTPS và thử lại.",
    "st.thumbnail": "Đang tạo ảnh thu nhỏ còn thiếu…",
    "err.encoder": "Không tạo được ảnh thu nhỏ. Kiểm tra kết nối rồi thử lại; trình duyệt cũng có thể đã hết bộ nhớ. Công cụ dòng lệnh hỗ trợ bước này.",
    "st.ready": "Đã xong",
    "st.matched": "đã khớp với sắc độ ảnh",
    "st.neutral": "dùng sắc độ mặc định",
    "st.portrait": "đã giữ dữ liệu Chân dung",
    "st.people": "đã giữ dữ liệu người trong ảnh",
    "st.texture": "đã thêm Kết cấu và Hạt",
    "st.native": "đã giữ Phong cách nhiếp ảnh gốc",
    "err.notheic": "Định dạng ảnh không được hỗ trợ. Chọn HEIC, JPG, PNG, WebP, GIF, BMP hoặc AVIF.",
    "err.unsupported": "Chưa hỗ trợ file HEIC này.",
    "err.hastexture": "Ảnh đã có Kết cấu và Hạt, không cần xử lý thêm.",
    "err.stylesmissing": "File này thiếu dữ liệu Styles gốc của iPhone. Hãy thêm Texture vào HEIC gốc chưa chỉnh từ Tệp, rồi chỉnh lại trong Ảnh. Chuyển đổi bản này sẽ tạo Styles mới; không khôi phục HDR đã thiếu, màu có thể đổi và nút ƒ có thể mất.",
    "btn.rebuildstyle": "Tạo Styles mới (thử nghiệm)",
    "warn.stylerebuild": "Bạn đã chọn tạo Styles mới từ bản thiếu dữ liệu Styles gốc. Kết quả không khôi phục Styles đã chỉnh hoặc HDR đã thiếu; màu có thể thay đổi, chỉnh khẩu độ ƒ và Ánh sáng chân dung có thể không còn trong Ảnh.",
    "err.nohdr": "Không tìm thấy bản đồ tăng sáng HDR được hỗ trợ. Web và công cụ dòng lệnh đều chưa hỗ trợ HEIC này.",
    "err.nothumb": "Thiếu ảnh thu nhỏ. Trình duyệt có thể tạo bằng bộ mã hóa tùy chọn.",
    "btn.save": "Lưu vào Ảnh",
    "btn.download": "Tải xuống",
    "btn.livezip": "Tải cặp Live Photo",
    "btn.savestill": "Lưu ảnh tĩnh",
    "live.help": "Live Photo: chọn HEIC và MOV gốc từ Tệp, cùng lúc hoặc riêng lẻ. Tải cặp đã kiểm tra dưới dạng ZIP, giải nén và nhập cả hai bằng công cụ hỗ trợ Live Photo. Lưu ảnh tĩnh chỉ lưu ảnh; khung hình video không thay đổi.",
    "live.waitphoto": "Đã đọc video. Đang chờ HEIC xử lý thành công có cùng mã Live Photo.",
    "live.waitmovie": "Phát hiện ảnh Live Photo. Thêm MOV gốc để giữ cặp file. Chỉ lưu HEIC sẽ tạo ảnh tĩnh.",
    "live.paired": "Video tương ứng được giữ nguyên. Tải cặp Live Photo, giải nén ZIP rồi nhập cả hai bằng công cụ hỗ trợ Live Photo. Chỉ lưu HEIC sẽ tạo ảnh tĩnh.",
    "live.matched": "Đã ghép với ảnh đã xử lý. Video được giữ nguyên trong cặp file tải xuống.",
    "live.invalidmov": "Không đọc được metadata ghép Live Photo trong MOV này. Hãy chọn video Live Photo gốc.",
    "live.duplicate": "Đã có video mang mã Live Photo này. Tải lại trang nếu muốn thay video.",
    "live.changed": "Không xác nhận được ảnh đầu ra thuộc cùng Live Photo. Đã dừng xuất cặp; không nhập file này như Live Photo.",
    "btn.blocked": "Không mở được menu chia sẻ",
    "h.steps": "Cách sử dụng",
    "s.1": "Chọn ảnh theo hướng dẫn thư viện. Trên máy tính, bạn có thể kéo thả file vào vùng chọn ảnh.",
    "s.2": "Chờ mỗi ảnh hiện <b>Đã xong</b>; thường chỉ mất vài giây.",
    "s.3": "Trên iPhone, chạm <b>Lưu vào Ảnh</b> rồi <b>Lưu hình ảnh</b>. Trên máy tính, tải kết quả và chuyển sang iPhone dưới dạng file bằng AirDrop hoặc iCloud Drive.",
    "s.4": "Mở bản sao trong Ảnh rồi chạm <b>Sửa</b> để dùng bảng Phong cách nhiếp ảnh. Trên iOS 27 còn có <b>Kết cấu</b> và <b>Hạt</b>.",
    "h.get": "Về ảnh đầu ra",
    "g.1": "Ảnh sau xử lý có thể chỉnh Phong cách, sắc độ, màu sắc và Kết cấu trong ứng dụng Ảnh, lưu lại rồi chỉnh tiếp sau này.",
    "g.2": "Kết cấu và Hạt chỉ có trên iOS 27.",
    "g.3": "Dữ liệu Chân dung và người trong ảnh lấy từ ảnh gốc; công cụ không tự tạo. Nếu ảnh gốc không có điều chỉnh độ sâu Chân dung thì ảnh sau xử lý cũng không có.",
    "g.4": "Công cụ đang trong giai đoạn hoàn thiện chức năng. Hiệu ứng Phong cách, Kết cấu và Hạt có thể khác ảnh được chụp với tính năng gốc.",
    "g.5": "Làm mịn da hoạt động khi ảnh gốc có dữ liệu người của Apple, như ảnh Chân dung hoặc ảnh người từ iPhone 16 trở lên. Công cụ không tự nhận diện khuôn mặt; ảnh khác có thể cho kết quả như Phong cách Tiêu chuẩn.",
    "g.6": "Với Live Photo, thêm MOV gốc tương ứng và tải cặp file đã kiểm tra. Nhập cả hai bằng công cụ hỗ trợ Live Photo. Chỉ lưu HEIC sẽ tạo ảnh tĩnh; khung hình video không thay đổi.",
    "h.trouble": "Khi gặp lỗi",
    "t.1": "<b>Định dạng ảnh không được hỗ trợ</b>: chọn HEIC, JPG, PNG, WebP, GIF, BMP hoặc AVIF. Với ảnh iPhone, chọn HEIC gốc để giữ nhiều metadata nhất.",
    "t.2": "Ảnh thu nhỏ còn thiếu được tạo trên thiết bị. Bộ mã hóa khoảng 32 MB được tải trong lần đầu và lưu đệm khi có thể. HEIC SDR hoặc đã đổi kích thước tự dùng chế độ thử nghiệm; hãy kiểm tra màu trong Ảnh trên iPhone.",
    "t.3": "<b>Chưa hỗ trợ file HEIC này</b>: có thể là ảnh chụp màn hình, ảnh đã chỉnh hoặc xuất từ ứng dụng khác, hay cấu trúc ảnh chưa được hỗ trợ.",
    "t.4": "<b>Trang bị treo hoặc tự tải lại</b>: tắt tùy chọn khớp sắc độ rồi thử lại.",
    "p.version": "Phiên bản",
  },
  en: {
    "btn.clearhistory": "Clear processing history",
    "btn.retry": "Try again",
    "st.preparing": "Preparing the tool for first use…",
    "err.setup": "Could not prepare the tool. Check your connection and open the page over HTTPS, then try again.",
    "lang.label": "Language",
    "help.language": "The default language follows your browser. Your language choice is remembered and always takes priority.",
    "h.conversiondetails": "Details",
    "h.help": "Help & information",
    "h.editlimits": "iPhone 16/17 photos with edited Styles or Portrait",
    "help.editlimits": "Photos with changed Styles or Portrait enabled in Photos may export without their original editing data. If native Styles remain in the file, the tool only adds Texture/Grain and keeps existing data. Otherwise, creating new Styles may change colours and cannot restore missing HDR or your chosen Styles.",
    "help.portraitlimits": "A Portrait viewing menu does not guarantee aperture ƒ or Portrait Lighting controls in Edit. The tool keeps depth data present in the file but cannot retrieve edit history from your Photos library. Keep your originals and check the copy on your iPhone before replacing anything.",
    "app.hero": "A new mood.",
    "help.steps": "Choose a photo, wait for Ready, then save the copy. Open it in iPhone Photos → Edit to adjust Styles. Texture and Grain require iOS 27.",
    "help.formats": "HEIC, JPG, PNG, DNG, WebP, GIF, BMP and AVIF are supported. DNG is developed to sRGB and exported as HEIC, no longer RAW. Animated images use one frame.",
    "help.original": "Keep your originals. To retain Styles, HDR and Portrait editing on iPhone 16 or later photos, add Texture to the original HEIC before editing in Photos. An edited export may lack the required data.",
    "help.live": "Save to Photos saves a still image. Live Photo exports need the matching original MOV and a compatible importer.",
    "help.slow": "The first conversion downloads an encoder. If the page is slow, turn off tone matching and try again.",
    "date.kept": "Capture time in the file:",
    "t.date": "<b>Capture date</b>: the file keeps its original capture metadata. Photos and iCloud may assign the date you save it; the web app cannot control that library date.",
    "date.missing": "The source has no readable capture time. Photos may use the import date.",
    "lang.name": "中文",
    "meta.title": "Next-generation Photographic Styles",
    "app.tagline": "Photographic Styles for your photos",
    "p.author": "by Elio",

    "h.notice": "Before you start",
    "n.1": "Experimental, unofficial software, not affiliated with Apple.",
    "n.2": "An Apple HEIC holds only the still image. Keep your original photos.",
    "app.lede": "Add Styles, Texture and Grain. Privately, on your device.",
    "drop.big": "Choose photos",
    "drop.small": "HEIC, JPG, PNG, DNG · or drop here",
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
    "st.encoderload": "Preparing photo conversion:",
    "err.reloadencoder": "The browser is not ready to convert this photo. Open the page over HTTPS and try again.",
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
    "err.stylesmissing": "This file is missing the iPhone's native Styles data. Add Texture to the unmodified original HEIC from Files, then reapply your edits in Photos. Converting this copy creates new Styles; it cannot restore missing HDR, colours may change and aperture ƒ may disappear.",
    "btn.rebuildstyle": "Create new Styles (experimental)",
    "warn.stylerebuild": "You chose to create new Styles from a copy missing native Styles data. The result cannot restore edited Styles or missing HDR; colours may change, and aperture ƒ and Portrait Lighting editing may be unavailable in Photos.",
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
    "btn.clearhistory": "清空处理记录",
    "btn.retry": "重试",
    "st.preparing": "正在准备首次使用…",
    "err.setup": "无法准备工具。请检查网络连接，并通过 HTTPS 打开网页后重试。",
    "lang.label": "语言",
    "help.language": "默认语言跟随浏览器。手动选择的语言会被记住，并始终优先。",
    "h.conversiondetails": "详情",
    "h.help": "帮助与说明",
    "h.editlimits": "已编辑风格或人像的 iPhone 16/17 照片",
    "help.editlimits": "在“照片”中更改摄影风格或开启人像后，导出的副本可能缺少原始编辑数据。若文件仍含原生风格数据，工具仅添加质感/颗粒并保留现有数据；否则，创建新风格可能改变颜色，无法恢复丢失的 HDR 或所选风格。",
    "help.portraitlimits": "查看菜单中有人像选项，不代表编辑时能调整光圈 ƒ 或人像光效。工具保留文件中的深度数据，但无法读取照片图库的编辑历史。请保留原图，并先在 iPhone 上检查副本。",
    "app.hero": "新的色调。",
    "help.steps": "选取照片，等待完成后保存副本。在 iPhone 照片中打开并点击编辑，即可调整摄影风格。质感与颗粒需要 iOS 27。",
    "help.formats": "支持 HEIC、JPG、PNG、DNG、WebP、GIF、BMP 与 AVIF。DNG 转换为 sRGB 并导出 HEIC，不再保留 RAW；动态图像仅使用一帧。",
    "help.original": "请保留原图。要保留 iPhone 16 及更新机型照片的摄影风格、HDR 和人像编辑，请先为原始 HEIC 添加质感，再在“照片”中编辑。编辑后导出的副本可能缺少所需数据。",
    "help.live": "存储到照片仅保存静态图像。实况照片导出需要匹配的原始 MOV 和兼容的导入工具。",
    "help.slow": "首次转换会下载编码器。如果页面运行缓慢，请关闭影调匹配后重试。",
    "h.formats": "格式与处理方式",
    "opt.analysishelp": "影调匹配会分析每张照片，首次使用需下载小型解码器。如处理缓慢或页面卡住，可关闭此选项。",
    "date.kept": "文件中的拍摄时间：",
    "t.date": "<b>拍摄日期</b>：文件保留原始拍摄时间元数据。照片和 iCloud 可能使用保存日期；网页无法控制图库中的日期。",
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
    "meta.title": "Next-generation Photographic Styles",
    "app.tagline": "为照片添加摄影风格",
    "p.author": "由 Elio 修改",

    "h.notice": "注意事项",
    "n.1": "实验性非官方工具，与 Apple 无关。",
    "n.2": "Apple 的 HEIC 文件只包含静态图像，请保留原图。",
    "app.lede": "添加风格、质感与颗粒。照片仅在本设备上处理。",
    "drop.big": "选取照片",
    "drop.small": "HEIC、JPG、PNG、DNG · 或拖放到此处",
    "tip.title": "从“照片图库”选取时",
    "tip.body": "在支持的 iOS 版本中，勾选照片后点按左下角的 <b>•••</b> → <b>选项</b> → "
      + "<b>格式</b> → <b>当前</b>，即可上传 HEIC 原图，而不是转换后的 JPEG。若仍被拒绝，"
      + "请改选<b>浏览</b>，从“文件”中选取。",
    "opt.quality": "匹配照片的影调",

    "st.reading": "读取中…",
    "st.working": "处理中…",
    "st.experimental": "实验性输出，请在 iPhone 照片中验证",
    "st.encoderload": "正在准备照片转换：",
    "err.reloadencoder": "浏览器尚未准备好转换照片。请通过 HTTPS 打开网页后重试。",
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
    "err.stylesmissing": "此文件缺少 iPhone 原生摄影风格数据。请从“文件”选取未经编辑的原始 HEIC，添加质感后再在“照片”中重新编辑。转换此副本会创建新风格；无法恢复丢失的 HDR，颜色可能改变，光圈 ƒ 控件可能消失。",
    "btn.rebuildstyle": "创建新风格（实验性）",
    "warn.stylerebuild": "你已选择为缺少原生摄影风格数据的副本创建新风格。结果无法恢复已编辑的风格或丢失的 HDR；颜色可能改变，“照片”中的光圈 ƒ 和人像光效编辑可能不可用。",
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
STRINGS.vi['ai.download'] = 'Tải bản depth';
STRINGS.en['ai.download'] = 'Download depth test';
STRINGS.zh['ai.download'] = '下载深度测试';
STRINGS.vi['ai.save'] = 'Lưu bản depth';
STRINGS.en['ai.save'] = 'Save depth test';
STRINGS.zh['ai.save'] = '保存深度测试';

function savedLanguage() {
  try { const saved = localStorage.getItem(STORE_KEY); return STRINGS[saved] ? saved : null; }
  catch { return null; }
}

export function preferredLanguage({saved, languages = []} = {}) {
  if (Object.hasOwn(STRINGS, saved)) return saved;
  for (const locale of languages) {
    const code = locale.toLowerCase().split('-')[0];
    if (Object.hasOwn(STRINGS, code)) return code;
  }
  return 'en';
}

function browserLanguages() {
  return navigator.languages || [navigator.language || 'en'];
}

export function pickLanguage() {
  return preferredLanguage({saved:savedLanguage(), languages:browserLanguages()});
}

export function rememberLanguage(lang) {
  try { localStorage.setItem(STORE_KEY, lang); } catch { /* private mode */ }
}

export function t(lang, key) {
  return (STRINGS[lang] && STRINGS[lang][key]) ?? STRINGS.en[key] ?? key;
}

/** Fill every [data-i18n] element and set the document language. */
export function applyLanguage(lang) {
  document.documentElement.lang = lang === "zh" ? "zh-Hans" : lang === "vi" ? "vi" : "en";
  document.title = t(lang, "meta.title");
  const selector = document.getElementById('lang');
  if(selector) selector.value=lang;
  for (const el of document.querySelectorAll("[data-i18n]"))
    el.innerHTML = t(lang, el.dataset.i18n);
}
