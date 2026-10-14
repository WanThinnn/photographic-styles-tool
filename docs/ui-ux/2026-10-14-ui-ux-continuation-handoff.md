# Stylio UI/UX continuation handoff — 2026-10-14

> Mục đích: đây là tài liệu bàn giao trực tiếp cho AI/agent tiếp theo. Đọc file này trước khi sửa UI/UX. Nếu có mâu thuẫn giữa lịch sử cũ và trạng thái hiện tại, ưu tiên: **code hiện tại trong working tree → tài liệu này → mục mới nhất trong `docs/ui-ux/plan/2026-10-14-stylio-mobile-app-redesign.md` → các mục lịch sử cũ**.

> **Checkpoint 2026-10-15:** người dùng xác nhận redesign đã xong; working tree đã sạch trước task mới. Các danh sách UI modified bên dưới là lịch sử bàn giao, không phải trạng thái git hiện tại. Task mới chỉ sửa pipeline đen Glow/Soft Skin với telephoto iOS 18 trên cùng nhánh, không sửa UI. Cache v191; chi tiết tiến độ và bước thử Photos còn chờ ở [processing guide](../web/processing-guide.md#active-processing-handoff--2026-10-15-ios-18-telephoto-texture) và `facts.md` §10.74. Chưa commit/push thay đổi mới này.

## 1. Trạng thái repository hiện tại

- Workspace: `photographic-styles-tool`.
- Nhánh làm việc hiện tại theo plan: `feature/ui-ux-redesign`.
- Working tree **đang có thay đổi chưa commit/push**. Không reset, checkout, rebase, stash, merge hoặc xóa các thay đổi đang có nếu người dùng chưa yêu cầu rõ.
- UI shell hiện ở Service Worker cache **v190**: `web/sw.js`.
- PWA là static HTML/CSS/JS, không chuyển sang React/Ionic/React Native. Các repo trong `ref/` chỉ dùng làm reference.
- `facts.md` là sổ thí nghiệm kỹ thuật dài hạn. **Không sửa facts.md cho các thay đổi UI/UX thông thường.**
- Các install icon PWA/Home Screen vẫn dùng bản xanh mặc định. **Không tạo cơ chế dynamic dark install icon.** iOS quyết định appearance ở Home Screen. Dark icon nội bộ của app chỉ dùng cho header/app shell.

### Working tree quan trọng đang thay đổi

Các file UI/UX chính đang modified/untracked ở thời điểm bàn giao:

- `web/index.html`
- `web/src/app/application.js`
- `web/src/ui/page-bootstrap.js` (logic nền đã có, hiện không modified nhưng là điểm persistence/theme quan trọng)
- `web/src/ui/shell/app-shell.js`
- `web/src/ui/shell/dock-viewport.js`
- `web/src/ui/shell/tab-glass.js`
- `web/src/ui/results/result-view.js`
- `web/src/ui/history-store.js`
- `web/src/ui/ai-feature-controls.js`
- `web/src/ui/ai-strings.js`
- `web/src/ui/i18n.js`
- `web/src/ui/confirm-dialog.js` — file mới
- `web/src/portrait/ai-portrait-preview.js`
- `web/styles/foundations/tokens.css`
- `web/styles/foundations/base.css`
- `web/styles/layout/app-shell.css`
- `web/styles/layout/workspace.css`
- `web/styles/components/controls.css`
- `web/styles/components/sheets.css`
- `web/styles/components/results.css`
- `web/styles/components/portrait-editor.css`
- `web/styles/components/materials.css`
- `web/styles/components/navigation-effects.css`
- `web/sw.js`
- các test tương ứng trong `tests/web/`.

Không tạo một file CSS override tổng mới. `web/styles.css` hiện chỉ là entry chứa 10 import phẳng và trách nhiệm CSS phải đặt đúng module.

## 2. Mục tiêu thiết kế đã chốt

Stylio phải cảm giác như một **mobile app/PWA native-like**, không phải landing page responsive. Ưu tiên iPhone/PWA nhưng desktop/iPad vẫn phải dùng tốt.

Ngôn ngữ thiết kế:
- bám Apple HIG và iOS 26/27 về hierarchy, grouped rows, semantic color, motion, safe area, accessibility;
- Liquid Glass chỉ dùng cho chrome/navigation/actions, không phủ kính lên ảnh hoặc toàn bộ card nội dung;
- icon dùng inline SVG/currentColor hoặc asset local, không phụ thuộc runtime CDN;
- Light/Dark dùng semantic tokens, không đổi màu nội dung ảnh theo theme;
- motion có mục đích, tương đối chậm hơn web bình thường để giống iOS, và phải tắt/giảm theo `prefers-reduced-motion`;
- control tối thiểu giữ vùng chạm ~44px khi có thể;
- không thêm wording dài nếu icon/visual hierarchy có thể truyền đạt tốt hơn.

Reference chính:
- Apple HIG: Materials, Tab bars, Buttons, SF Symbols, Accessibility, Dark Mode, Motion, Progress Indicators.
- `ref/ionic-theme-ios27` là reference web chính cho cảm giác iOS 27.
- `ref/ios27-design-system` chỉ bổ sung, không copy nguyên framework/tokens.

## 3. Kiến trúc UI hiện tại

### 3.1 App shell

Entry:
- `web/app.js` → `startApplication()` trong `web/src/app/application.js`.
- `web/src/ui/page-bootstrap.js` render theme/language/copy trước khi module xử lý nặng tải xong.
- `web/src/ui/shell/app-shell.js` quản lý navigation, History cards, Photo workspace, Search và dock interaction.

Có 4 destination thật:
1. Process
2. History
3. Guide
4. Settings

Search là nút tròn riêng bên phải dock. Khi search mở:
- app chuyển sang History;
- 4-tab capsule được thay bằng search field;
- query chạy local trên tên/status;
- normalization bỏ dấu tiếng Việt;
- Escape/clear/tap flow đã có;
- Back/Forward phải tiếp tục đúng.

### 3.2 Không clone result DOM

Đây là invariant quan trọng.

`app-shell.js` **di chuyển nguyên DOM result** từ hidden list vào `#photo-workspace`, sau đó trả nó về vị trí cũ khi đóng. Không clone result DOM, preview hoặc export controls.

Lý do:
- mỗi row đang sở hữu File/Blob URL/output epoch riêng;
- clone dễ làm Share/Download trỏ nhầm output;
- Portrait preview/focus/aperture có state và cleanup riêng;
- Live Photo và AI candidate state gắn với row thật.

Agent sau không được “đơn giản hóa” bằng clone HTML/result card.

### 3.3 Photo workspace

`#photo-workspace` là `dialog` dùng như màn chi tiết ảnh.
- iPhone: behavior gần full-screen app page.
- desktop/iPad: khi Result Preview Off thì sheet đã được co theo content để tránh khoảng trắng 90dvh vô ích.
- close có animation; reduced-motion đóng ngay.
- Back/Forward tích hợp với History API.
- stale `stylioPhoto` state sau reload bị loại để không mở nhầm result phiên mới.

## 4. Dock / Liquid Glass hiện tại

Files:
- `web/src/ui/shell/tab-glass.js`
- `web/src/ui/shell/dock-viewport.js`
- `web/styles/components/navigation-effects.css`
- `web/styles/components/materials.css`
- `web/styles/layout/app-shell.css`

Các quyết định đã chốt:
- dock nổi, tách khỏi content;
- có 4 tab + Search riêng;
- kính selection phải “trượt” giữa tab, không snap tức thì;
- resting lens dùng offset pixel đo từ button thật qua `--tab-rest-offset`, không chỉ dùng `index * 100%` vì trước đây History/Guide/Settings bị lệch dần;
- dark selected lens phải tối hơn nền glass, gần Phone/iOS reference;
- badge History được anchor quanh icon, không làm thay đổi căn giữa tab;
- Search là bubble riêng, không gộp vào tab group;
- iPhone PWA phải tôn trọng safe area và visual viewport;
- không dùng `screen.availHeight` để neo dock, vì từng gây dock rơi dưới viewport;
- Process/History không được bị dock che sau relaunch/resize.

Nếu sửa motion:
- giữ pointer press responsive;
- movement/settle không quá nhanh;
- drag vẫn phải follow finger;
- reduced motion settle ngay;
- không thêm animation loop vô hạn.

## 5. Zoom và PWA native behavior

`web/index.html` viewport hiện:
`width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover`.

`page-bootstrap.js` còn chặn iOS `gesturestart/gesturechange/gestureend` để tránh pinch zoom làm fixed dock tách khỏi shell.

Mục tiêu là standalone PWA native-like. Không gỡ zoom lock trừ khi người dùng đổi yêu cầu rõ.

## 6. Theme / Dark Mode

Persistence:
- `stylio-theme-v1`: `light | dark | system`.
- `page-bootstrap.js` áp theme trước khi app nặng tải.
- theme transition khoảng 280ms, tắt nếu reduced motion.

Icon/app shell:
- header có `photographic-styles.svg` và `photographic-styles-dark.svg`;
- internal semantic tiles có dark material riêng;
- Appearance icon ở dark dùng nền graphite/đen + glyph trắng;
- **PWA install icon vẫn xanh mặc định**, không đổi theo theme.

Không hardcode light backgrounds trong component mới nếu đã có semantic token tương ứng.

## 7. Process screen và AI summary

Process screen hiện gồm:
- compact header Stylio;
- hero `A new mood.` (được giữ theo trạng thái thiết kế hiện tại);
- Choose photos;
- iOS first-use original-format tip;
- Smart Enhance summary;
- Activity;
- dock.

Smart Enhance:
- label và switch phải gần nhau, không để khoảng trống lớn;
- AI Settings button pin trailing edge;
- desktop/iPad có `More AI features` compact cùng hàng;
- mobile **không hiển thị text More AI features**, chỉ dùng gradient ring quanh settings icon;
- ring luôn có gradient tĩnh;
- first-use mới animate ring + discovery; sau khi user mở AI Settings thì ring giữ tĩnh, không xoay tiếp.

Persistence discovery:
- key `stylio-ai-settings-hint-v2`;
- chỉ set `opened` khi user thực sự mở AI Settings, không set chỉ vì đã nhìn thấy.

## 8. AI Settings sheet

Files:
- markup: `web/index.html`
- wiring: `application.js`, `ai-feature-controls.js`
- copy: `ai-strings.js`
- controls CSS: `controls.css`, `sheets.css`
- material/color: `materials.css`, `tokens.css`

AI Settings vẫn là quick modal sheet, không phải destination mới.

### 8.1 Master AI behavior

Master `Smart Enhance photo`:
- khi bật: Portrait được bật mặc định nếu chưa bật;
- Sharpen/Adaptive Styles vẫn opt-in;
- khi tắt master: các active feature bị tắt và dispatch change để reuse teardown/cancel logic;
- availability lock không được tự thay đổi lựa chọn user.

### 8.2 Model

3 mức:
- Lite
- Standard
- Pro

Persistence:
- localStorage key `depth-model`.

GPU:
- localStorage key `depth-gpu-acceleration`, default on.

Model UI hiện phải giữ:
- icon neural-network graphite;
- icon đã nới ngang, viewBox 28×24;
- icon căn giữa dọc;
- copy ngắn: “Lite is faster. Pro gives finer AI results.” hoặc bản dịch tương ứng;
- slider lớn ở cột phải;
- mobile/narrow sheet vẫn **icon | copy | slider cùng hàng**, không được rơi slider xuống bottom;
- narrow container dùng CSS specificity trong `sheets.css` để override generic `.portrait-option`.

Nếu chỉnh Model row, test `tests/web/stylesheets.mjs` đang bảo vệ geometry này.

### 8.3 Adaptive Styles icon

Icon hiện là matrix grid:
- nhiều dot mờ;
- một dot chính đậm gần center;
- một dot secondary đậm ở vùng trên-phải;
- mục tiêu gần ngôn ngữ “Photographic Styles matrix”, không dùng stacked layers cũ.

### 8.4 Depth icon

Depth Effect dùng focus/depth-style glyph local/currentColor. Không kéo icon từ Icons8/CDN runtime.

## 9. Portrait detail editor

Files:
- `web/src/portrait/ai-portrait-preview.js`
- `web/styles/components/portrait-editor.css`
- copy trong `ai-strings.js`.

### 9.1 Toolbar geometry

Portrait strip có 3 vùng:
- trái: Lighting + ƒ;
- giữa: PORTRAIT toggle;
- phải: Focus + Reset cùng một glass capsule.

Không thêm spinner xoay legacy.

### 9.2 Lighting và ƒ

Thứ tự hiện tại: **Lighting trước, ƒ sau**.

Lighting glyph:
- hexagon;
- một vòng tròn bên trong;
- solid center/core;
- selected đổi sang accent vàng;
- không dùng sun icon.

ƒ:
- có vòng tròn bao quanh chính glyph;
- dùng Apple/system-like font stack, italic vừa phải;
- không dùng Georgia;
- selected chỉ đổi màu vàng, không thêm background bubble.

### 9.3 Portrait toggle

PORTRAIT:
- active: vàng/orange capsule;
- inactive: nền neutral/glass, viền xám, chữ xám;
- chỉ thay preview state trong app;
- output HEIC contract vẫn giữ Portrait bắt đầu Off trong Photos nếu pipeline hiện tại yêu cầu;
- đừng suy ra “preview on” = “Photos saved with portrait visibly on”.

### 9.4 Focus / Reset

- Center Focus: đưa focus về giữa, không reset aperture.
- Reset: reset focus + aperture mặc định.
- hai action ở chung một vùng glass capsule;
- đã bỏ divider dọc thừa giữa chúng.

### 9.5 Quan trọng: không sửa thuật toán ảnh khi đang làm UI

Các UI task không được tự ý thay:
- depth inference;
- HDR gain-map;
- bokeh blur math;
- native Portrait metadata;
- focus coordinate mapping;
- output epoch/latest-output guard.

Nếu user báo lỗi visual HDR/Portrait, đọc `facts.md`, `docs/web/browser-guide.md` và tests private trước khi sửa pipeline.

## 10. Result preview

Settings có `Result preview`.

Persistence:
- localStorage key `stylio-result-preview-v1`;
- default On.

Behavior:
- Off: result mới không dựng source preview/Portrait interactive preview để giảm memory/work.
- On: source preview được dựng.
- sau v181, app tạo một JPEG snapshot display-size từ preview và lưu cùng History record trong IndexedDB.
- từ v182, thumbnail History 40px được persist riêng khỏi Result Preview; vì vậy F5/relaunch vẫn có thumbnail kể cả khi snapshot preview không được dùng.
- reload app: History restore dùng `entry.preview` để hiển thị preview lại và `entry.thumbnail` cho card History/Activity.
- không lưu full source photo lần thứ hai chỉ để preview/thumbnail.

Lưu ý implementation hiện tại:
- `result-view.js` dùng `previewSnapshotPromise`;
- snapshot max width khoảng 960px, JPEG quality ~0.82;
- History store record có field `preview`;
- `application.js::restorePersistentHistory()` truyền `restoredPreview` vào row.

Nếu đổi schema History, phải cân nhắc DB migration/versioning.

## 11. Persistent History

Không dùng localStorage cho HEIC/blob.

Storage:
- IndexedDB database: `stylio-history-v1`
- store: `results`
- DB_VERSION hiện 1.

Record hiện gồm:
- `id`
- `name`
- `file`
- `preview`
- `thumbnail`
- `fileName`
- `type`
- `lastModified`
- `readyNotice`
- `updatedAt`

Mutation được serialize bằng promise chain để tránh Save/Clear race.

Restore:
- output được khôi phục thành Ready;
- không chạy lại encoder/model;
- metadata parsing bị skip khi restore (`metadata:false`);
- download/share dùng File đã persist.

Khi delete một result:
- UI dispose result;
- History IndexedDB record phải bị remove.
Khi Clear History:
- clear IndexedDB;
- cleanup Blob URLs;
- clear Live Photo session;
- release caches/workers theo flow hiện có.

### 11.1 Thumbnail History + Activity

- Trong lúc processing: dùng progress ring/%.
- Khi Ready và có thumbnail: History và Activity ưu tiên thumbnail ảnh 40px.
- thumbnail được tạo nhỏ/lazy, không lấy full decode pipeline nặng chỉ vì card.
- fallback về status icon nếu browser không decode được.

Đừng thay thumbnail bằng full-size image data.

### 11.2 Overflow quick actions

Ready card dùng một nút `•••`.
Khi mở:
- Share nếu `navigator.canShare({files})`;
- Download luôn có;
- Delete luôn có;
- Windows không có Web Share vẫn phải có Download + Delete;
- tap ngoài / Escape / scroll đóng menu;
- nội dung card phía sau blur nhẹ + giảm opacity để actions nổi lên.

Không để 3 nút action luôn hiện trên card.

## 12. Share / Download trong Photo detail

Photo detail vẫn có Share + Download floating capsule.

Quy tắc:
- hit target vẫn đủ lớn;
- idle phải compact;
- khi user tương tác có thể expand;
- khi scroll phải collapse;
- content bottom inset dựa trên action bar height để không che aperture/details;
- Share thành công chỉ có nghĩa share sheet chạy thành công, **không được ghi “Saved to Photos”** nếu app không biết user có chọn Save Image hay không.

## 13. Custom destructive confirmation

File mới: `web/src/ui/confirm-dialog.js`.

Browser-native `confirm()` đã được thay cho:
- Delete result;
- Clear History.

Style:
- iOS-like centered glass card;
- backdrop blur nhẹ;
- title + detail;
- Cancel capsule xanh;
- destructive Delete semantic red;
- focus ban đầu đặt vào Cancel;
- click backdrop/cancel đóng.

Trong môi trường không có `HTMLDialogElement`, module có native fallback để tests/non-browser không vỡ.

Nếu thêm action destructive mới, dùng `confirmAction()`, không gọi `window.confirm()` trực tiếp.

i18n keys mới:
- `action.cancel`
- `action.delete`
- `confirm.cannotundo`

## 14. Guide

Guide là destination riêng, không còn dense Help page.

Mỗi section:
- icon semantic;
- heading + short summary;
- See more / Show less;
- body chỉ expand khi cần.

Expanded body phải dùng full content inset, không để khoảng trắng bên trái như lúc body bị thụt theo icon.

Không xóa các caveat kỹ thuật quan trọng chỉ để UI ngắn hơn:
- iOS original format;
- DNG → HEIC SDR;
- Live Photo pairing;
- HDR/Portrait limitations;
- Photos Edit requirements;
- local processing / model download distinction.

## 15. Settings

Settings là screen thường.

Các nhóm:
- Preferences
- Appearance
- Processing
- On this device
- About

Đã có semantic icons cho:
- language;
- appearance;
- default save action;
- keep screen awake;
- prefer original format;
- result preview;
- update Stylio;
- clear cache;
- app version;
- source code;
- open-source licenses.

Chevron trailing ở Source code/Open-source licenses phải nằm cùng column, không lệch.

Header action:
- khi đang ở Settings, nút top-right chuyển thành GitHub.
- ở screen khác, nút đó là Guide/help.

## 16. App icon / dark icon policy

Phân biệt 2 lớp:

1. **In-app header icon**
   - có light/dark asset;
   - đổi theo app theme.

2. **PWA/Home Screen install icon**
   - giữ icon xanh mặc định;
   - không generate dark variant theo `prefers-color-scheme`;
   - không thay manifest runtime để giả dynamic native app icon;
   - iOS tự quyết định appearance ở Home Screen.

Đây là yêu cầu người dùng đã chốt nhiều lần.

## 17. Boot / first-use feedback

`st.preparing` giữ nội dung “Preparing the tool for first use…” / bản dịch tương ứng.

Visual:
- gradient xanh → tím/hồng;
- animation nhẹ;
- không dùng chữ tối static;
- reduced motion tắt animation;
- error state phải quay về semantic error, không giữ gradient.

First-use format notice:
- compact;
- không để vertical whitespace dư;
- `Got it` vẫn là target dễ bấm.

## 18. CSS ownership

`web/styles.css` import theo thứ tự:

1. `foundations/tokens.css`
2. `foundations/base.css`
3. `layout/app-shell.css`
4. `layout/workspace.css`
5. `components/controls.css`
6. `components/sheets.css`
7. `components/results.css`
8. `components/portrait-editor.css`
9. `components/materials.css`
10. `components/navigation-effects.css`

Đặt sửa đổi đúng chỗ:
- token/theme → `tokens.css`
- reset/base/type → `base.css`
- app screens/dock/layout → `app-shell.css`
- Process workspace/AI summary/drop zone → `workspace.css`
- switch/range/model → `controls.css`
- modal/settings grouped rows/confirm dialog → `sheets.css`
- History/cards/details/share bar → `results.css`
- Portrait editor → `portrait-editor.css`
- glass semantic material → `materials.css`
- lens/motion/navigation visual effects → `navigation-effects.css`

Không thêm `overrides.css` để vá nhanh.

## 19. Persistence keys

Các key UI/state đáng biết:

- `stylio-theme-v1` — light/dark/system
- `stylio-result-preview-v1` — on/off
- `photo-format-tip-dismissed-v1`
- `stylio-ai-settings-hint-v2`
- `stylio-has-processed`
- `stylio-screen` — sessionStorage destination hiện tại
- `depth-model`
- `depth-gpu-acceleration`

History image bytes nằm trong IndexedDB, không localStorage.

Nếu thêm setting mới:
- ưu tiên localStorage cho scalar/preferences nhỏ;
- IndexedDB cho Blob/File;
- code phải chịu được storage blocked/private mode bằng try/catch/fallback.

## 20. Service Worker và offline

`web/sw.js` hiện cache `photographic-style-port-v190`.

Mọi module/UI asset mới cần dùng offline phải được thêm vào `APP_SHELL` nếu phù hợp.

File mới `src/ui/confirm-dialog.js` đã được thêm vào APP_SHELL.

Sau mỗi thay đổi file graph/offline:
- bump cache version khi cần;
- chạy PWA check;
- đừng thay identity/version của immutable AI model cache nếu chỉ sửa UI.

## 21. Accessibility bắt buộc giữ

- icon-only button phải có aria-label/labelledby;
- 44px-ish hit target;
- keyboard focus/activation vẫn phải còn hoạt động về chức năng;
- theo yêu cầu UI hiện tại, browser focus/Tab ring bị ẩn toàn cục trên cả mobile và desktop; không được vô tình bật lại viền xanh native;
- selected tab dùng `aria-current="page"`;
- switches dùng role/switch state đúng;
- model range cập nhật `aria-valuetext`;
- modal sheet/confirm giữ focus hợp lý;
- Escape đóng Search/action menu/sheet khi tương ứng;
- reduced motion/reduced transparency/forced colors phải không vỡ;
- chữ dài VI/ZH không được đẩy layout thành cột hẹp vô lý.

## 22. Các invariant kỹ thuật không được phá khi chỉ làm UI

1. Ảnh không upload lên server.
2. Result row sở hữu output File hiện hành.
3. Output update phải thay đúng row, không dùng global “latest file” không gắn identity.
4. Pending Portrait update phải khóa export của row tương ứng.
5. Live Photo export phải dùng output hiện hành đúng phiên.
6. HDR/depth/native style preservation không được đổi do refactor view.
7. Dời DOM không được dispose result.
8. Xóa result mới dispose.
9. Preview chỉ là preview; không dùng nó làm bằng chứng native HDR/Portrait parity.
10. “Depth exists”, “HDR exists”, “Photos cho chỉnh ƒ/Lighting” là ba khả năng khác nhau.
11. Không viết copy khẳng định Photos sẽ có control nếu pipeline chưa chứng minh.
12. Không thêm framework/build dependency chỉ để làm UI.

## 23. Những điểm còn cần kiểm tra trên thiết bị thật

Automated tests không thay thế được các điểm sau:

- iPhone Safari và PWA Home Screen:
  - safe-area;
  - Dynamic Island/notch;
  - home indicator;
  - rotate portrait/landscape;
  - app resume;
  - visual viewport khi keyboard mở.
- Liquid Glass:
  - độ tối selected lens trong Dark;
  - optical centering từng tab;
  - motion Process → History → Guide → Settings;
  - Search expand/collapse.
- Model sheet:
  - iPhone hẹp thực tế;
  - Vietnamese text;
  - large text.
- Portrait strip:
  - ƒ glyph optical alignment;
  - Lighting hexagon visual weight;
  - yellow selected state;
  - Focus + Reset capsule.
- Persistent preview:
  - reload PWA sau result Ready;
  - HEIC source/output ở Safari iOS;
  - memory footprint khi History nhiều ảnh.
- Custom confirm:
  - keyboard/VoiceOver;
  - backdrop blur/performance.
- share sheet:
  - dismiss không bị hiểu nhầm là saved;
  - Save Image đúng File hiện hành.

Nếu user gửi screenshot mới, ưu tiên screenshot thực tế trên thiết bị hơn giả định từ desktop emulator.

## 24. Test suite hiện tại

Mốc regression gần nhất sau v190:

- main lightweight suite: **86/86 pass**
- language tests: **3/3 pass**
- PWA check: pass
- i18n check: pass
- VI/EN/ZH: **217 strings mỗi ngôn ngữ**
- private Portrait UI fixture của lượt v182 chưa hoàn tất: harness dài đã timeout ở cả 120s và 180s trước khi trả assertion; static Portrait/layout regression trong main suite vẫn pass. Mốc v181 trước đó đã pass fixture 18 layout/theme/language combinations.

Các lệnh project đã dùng gần nhất:

```powershell
node --test tests/web/app-shell.mjs tests/web/application.mjs tests/web/history-store.mjs tests/web/stylesheets.mjs tests/web/ai-feature-controls.mjs tests/web/ai-style-orchestration.mjs tests/web/style-result-metadata.mjs tests/web/module-paths.mjs tests/web/web-release.mjs tests/web/lifecycle.mjs
node --test tests/web/language.mjs
node tests/web/check-i18n.mjs
node tests/web/check-pwa.mjs
node --test tests/private-fixtures/portrait-controls-ui.mjs
```

Plan cũ ghi các lệnh qua `rtk proxy` vì RTK.md ở môi trường trước. Agent mới nên tuân thủ instruction hiện tại của workspace/tooling; không giả định `rtk` luôn khả dụng nếu môi trường mới không yêu cầu.

## 25. Tests bảo vệ khu vực nào

- `tests/web/app-shell.mjs`
  - navigation/Back/Forward;
  - tab/search;
  - task progress;
  - History thumbnail;
  - quick action overflow;
  - dock behavior.

- `tests/web/application.mjs`
  - app wiring;
  - queue serialization;
  - model selection;
  - persistent History restore;
  - clear History lifecycle.

- `tests/web/history-store.mjs`
  - IndexedDB degradation;
  - restored Blob → File.

- `tests/web/stylesheets.mjs`
  - CSS import graph;
  - native-like shell geometry;
  - portrait toolbar;
  - Model row;
  - glass/material;
  - dark semantics;
  - zoom lock;
  - compact detail behavior.

- `tests/web/ai-feature-controls.mjs`
  - master feature semantics;
  - discovery hint;
  - copy/AI level behavior.

- `tests/web/language.mjs`, `check-i18n.mjs`
  - VI/EN/ZH parity.

- `tests/web/check-pwa.mjs`
  - manifest/icon/SW/offline consistency.

- `tests/private-fixtures/portrait-controls-ui.mjs`
  - browser-layout smoke của Portrait controls nhiều viewport/theme/language.

Khi sửa component, chạy test gần nhất trước, rồi mới chạy suite tổng.

## 26. Cách agent tiếp theo nên bắt đầu

1. Đọc file này.
2. Đọc phần cuối của `docs/ui-ux/plan/2026-10-14-stylio-mobile-app-redesign.md` từ v175 trở đi.
3. Xem `show_changes`/working tree trước khi sửa; không reset.
4. Nếu task liên quan pipeline ảnh, đọc `facts.md` + `docs/web/browser-guide.md` + `docs/web/processing-guide.md`.
5. Nếu task chỉ UI, không chạm thuật toán ảnh.
6. Sửa đúng CSS/module ownership.
7. Cập nhật i18n VI/EN/ZH cùng lúc.
8. Nếu thêm JS/CSS module mới, cập nhật Service Worker/offline tests.
9. Thêm/điều chỉnh regression test cùng fix.
10. Sau khi xong, cập nhật tài liệu này hoặc append revision mới trong main UI plan.

## 27. Các quyết định người dùng đã nhắc nhiều lần — không được tự đảo ngược

- Muốn PWA cảm giác native iOS nhất có thể.
- Không muốn câu trả lời/implementation kiểu “bỏ HDR thì hết lỗi”; HDR path phải được giữ đúng.
- Dark install icon: **không tự xử lý**, giữ icon xanh để iOS quyết định.
- More AI features mobile: **không hiện text**, dùng gradient ring.
- Icon phải có dark appearance trong app.
- Toolbar glass phải trượt chậm, không snap.
- History phải sống qua reload/crash thông thường.
- Preview Off phải thực sự nhẹ hơn.
- Portrait control phải gần Apple Photos, không icon mặt trời generic.
- Delete/Yes-No không dùng browser dialog thô.
- Guide/Details phải icon-led, ngắn, progressive disclosure.
- Không để fixed Share/Download che content.
- Desktop/iPad không được giữ khoảng trắng lớn khi preview Off.
- Không đổi framework chỉ để đạt giao diện.

## 28. Tình trạng “done” của batch v181

Đã code và test:
- Model neuron icon rộng hơn.
- Model slider mobile không rơi bottom.
- Portrait Lighting hexagon/ring/core.
- ƒ system-like.
- Focus + Reset grouped, bỏ divider.
- thumbnail cho Ready History + Activity.
- blur content khi overflow actions mở.
- preview snapshot persist trong IndexedDB.
- AI Settings gradient ring persistent/static after discovery.
- Adaptive Styles matrix icon.
- iOS-style custom destructive confirmation.
- SW cache v181.
- regression tests cập nhật.

Chưa commit/push. Mọi agent tiếp theo phải coi working tree này là base hiện hành.

## 29. Batch v182 — persistent thumbnails / reset app / iOS visual polish

- History thumbnail không còn chỉ sống trong memory của shell. Thumbnail JPEG nhỏ được callback từ `app-shell.js` về `result-view.js`, lưu chung IndexedDB record qua `history-store.js`, rồi truyền lại bằng `restoredThumbnail` khi reload. Luồng này độc lập với setting Result Preview nên F5/relaunch vẫn giữ thumbnail card.
- Model network glyph chuyển sang canvas vuông 28×28 và render 25×25 trong tile để cân cả chiều ngang lẫn chiều dọc; layout slider/copy không đổi.
- Portrait ƒ control giảm vòng ngoài còn 24px, stroke mảnh 1.15px, glyph dùng system/SF stack nhẹ hơn để gần Photos hơn và không còn cảm giác thô/to.
- iOS destructive dialog ở Light mode dùng material gần trắng đục hơn, detail text tối hơn, secondary Delete capsule rõ hơn và chữ Cancel trắng trên accent. Dark-mode giữ semantic glass/material trước đó.
- Settings thêm destructive row `Reset Stylio`. Sau custom confirmation, flow xóa History IndexedDB, Blob/result session hiện tại, các preference key Stylio trong local/session storage, model/tool caches và app-shell cache thuộc đúng project rồi reload. Không dùng `localStorage.clear()` và cache cleanup có scope theo project để không xóa dữ liệu sibling GitHub Pages cùng origin.
- `historyStore.destroy()` đóng rồi xóa database `stylio-history-v1`; fallback vẫn an toàn khi IndexedDB không khả dụng.
- Service Worker cache tăng **v182**.
- Regression hiện tại: **82/82 main suite pass**, **3/3 language pass**, PWA/i18n pass, VI/EN/ZH **206 strings**. Private Portrait browser fixture chưa hoàn tất trong lượt này vì timeout ở 120s và 180s; static Portrait/layout tests đều pass.

Chưa commit/push. Mọi agent tiếp theo phải coi working tree v182 này là base hiện hành.

## 30. Batch v183 — fixed mobile header / larger branding / stable History overflow

- Header mobile chuyển sang `position: fixed` và neo ở đúng `safe-area-inset-top + 24px`, giữ icon app + Stylio + Help/GitHub đứng yên khi document scroll/overscroll. `main` tăng top padding tương ứng để vị trí nội dung phía dưới không bị nhích lên vào vùng Dynamic Island.
- In-app logo tăng 36→40px, title tăng 1.25→1.375rem; top-right action vẫn 44px. Chỉ tăng visual weight, không đổi install icon/Home Screen policy.
- History overflow menu không còn bị mất/reload khi một ảnh khác đang processing. Root cause là mỗi progress update gọi `render()` và `replaceChildren()` toàn bộ History card; khi menu đang mở, shell giờ giữ nguyên subtree của card đó để bảo toàn trigger/menu/focus state.
- Service Worker cache tăng **v183**.
- Regression hiện tại: **83/83 main lightweight suite pass**, **3/3 language pass**, PWA/i18n pass, VI/EN/ZH **206 strings**.

Batch v183 hiện đã nằm trong local commit `0ce47db` (`feature/ui-ux-redesign` đang ahead origin 1 commit), chưa push.

## 31. Batch v184 — native error banners / no focus rings / spacing polish

- `err.resources` và lỗi startup/browser-preparation không còn hiện như một dòng chữ đỏ + nút web. `#boot` chuyển thành banner iOS-like có icon lỗi, copy, Retry 44px và semantic Light/Dark material. Error status trong Photo detail cũng dùng rounded inline banner thay vì red text trần.
- Browser focus/Tab ring bị ẩn toàn cục trên desktop lẫn mobile theo yêu cầu hiện tại. Tab/keyboard activation vẫn hoạt động; chỉ presentation outline/blue ring bị loại. Search, Language, aperture và Portrait controls cũng bỏ focus-specific inset/blue outline.
- First-use original-format notice bỏ margin ngang 8px, nên chiều ngang khớp chính xác với `Choose photos` trong cùng workspace.
- Khoảng title → description được siết lại: AI option hint margin 6/5px → 2px, settings copy stack gap 4px → 2px, inline note line-height 1.45 → 1.35.
- Service Worker cache tăng **v184**.
- Regression hiện tại: **84/84 main lightweight suite pass**, **3/3 language pass**, PWA/i18n pass, VI/EN/ZH **206 strings**.

Batch v184 đã nằm trong commit `afdbd2a` và đã đồng bộ với `origin/feature/ui-ux-redesign` trước khi batch v185 bắt đầu.

## 32. Batch v185 — scroll-edge header glass / notice alignment / balanced model copy

- Info icon của `Keep the original photo format` được căn giữa theo chiều dọc của toàn row bằng `align-self:center`; text và `Got it` giữ layout hiện tại.
- Fixed mobile header giữ trong suốt khi ở đầu trang. Khi `window.scrollY > 8`, `page-bootstrap.js` gắn `.is-scrolled`; lúc đó header mới bật pseudo-surface Liquid Glass nhẹ (`blur(16px)`, saturate, translucent fill/border/shadow). Scroll về đầu trang thì material biến mất lại.
- Model row trong AI Settings tăng phần copy và giảm tỷ trọng slider vừa đủ: desktop/mobile sheet dùng `36px + min 108px + min 140px`; narrow container dùng `34px + min 92px + min 128px`. Hint dùng `text-wrap: balance` nên copy ngắn không còn rơi thành nhiều dòng lệch.
- UI-only fixture hỗ trợ `?state=resource-error&lang=en&theme=light` để ép render đúng banner `err.resources` mà không cần làm hỏng app/resource thật; fixture này không ship trong release.
- Service Worker cache tăng **v185**.
- Regression hiện tại: **85/85 main lightweight suite pass**, **3/3 language pass**, PWA/i18n pass, VI/EN/ZH **206 strings**.

Batch v185 được thay thế ngay trong cùng working tree bởi v186; chưa commit/push riêng.

## 33. Batch v186 — fixed native nav bar / Apple system blue

- Bỏ hoàn toàn scroll-triggered Liquid Glass/blur ở mobile top header. Header giờ là một navigation bar cố định full-width: `top:0`, nền opaque `var(--bg)`, separator `.5px`, và padding top vẫn giữ `safe-area + 24px` nên icon/tên app không chui lên vùng Dynamic Island.
- Không còn `.top::before`, `.top.is-scrolled` hay JS scroll listener dành cho header. Nội dung scroll phía dưới bị che bởi navbar thay vì hòa/blur xuyên qua, gần hành vi Messenger/iOS navigation bar hơn.
- Accent blue chuyển sang Apple system blue: Light `#007AFF`, Dark `#0A84FF`. `--accent`, `--accent-text`, AI blue, selected tab, switches/progress và action links cùng đi theo semantic token này. Text/icon đặt trên nền accent chuyển sang trắng.
- Service Worker cache tăng **v186**.
- Regression: **85/85 main lightweight suite pass**, **3/3 language pass**, PWA/i18n pass, VI/EN/ZH **206 strings**.

Batch v186 đã được commit và push ở `3e2574f`; batch v187 bắt đầu từ mốc đó.

## 34. Batch v187 — iPhone Safari install guide / navbar divider / spacing polish

- AI Settings Model row giữ nguyên vị trí icon nhưng thêm `padding-left:7px` cho copy. Với icon 34px nằm trong cột 36px + grid gap 8px, khoảng nhìn thấy từ mép icon tới chữ thành ~16px, khớp GPU row phía trên.
- Mobile navbar không có separator khi ở đầu trang. Main content bắt đầu thấp hơn navbar 12px; khi `scrollY > 12`, JS chỉ gắn `.has-scroll-divider` để bật border `.5px`. Không blur, không glass, không shadow.
- Tên Stylio trên mobile tăng lên `1.5rem`/720 để cân với icon 40px.
- First-run original-format notice có line break trước `→ Format` trong cả VI/EN/ZH; HTML fallback hiện tại cũng giữ break này.
- Thêm full-screen Add to Home Screen guide dành riêng cho iPhone Safari khi chưa chạy standalone. iPad, macOS, Windows, Android và iOS Chrome/Firefox/Edge không bị chặn. Guide dùng icon app + photo/spark/sliders artwork, ba step icon-led, theo Light/Dark semantic tokens; có nút Continue in Safari cho trường hợp người dùng vẫn muốn dùng browser.
- Standalone PWA (`navigator.standalone` hoặc `display-mode: standalone`) bỏ qua guide hoàn toàn. UI fixture hỗ trợ `?state=install-guide&lang=vi&theme=light` để test trên desktop.
- Service Worker cache tăng **v187**.
- Regression: **86/86 main lightweight suite pass**, **3/3 language pass**, PWA/i18n pass, VI/EN/ZH **215 strings**.

Batch v187 tiếp tục được refine trong cùng working tree; chưa commit/push riêng.

## 35. Batch v188 — Messenger-like navbar blur / richer install guide

- Mobile navbar vẫn opaque khi ở đầu trang. Khi `scrollY > 12`, cùng class `.has-scroll-divider` giờ bật material nhẹ cho **toàn bộ thanh**: nền `var(--bg)` pha 82%, `blur(18px) saturate(135%)`, separator `.5px` và shadow rất nhẹ. Không dùng floating glass card; hiệu ứng bám full-width giống navigation bar của Messenger.
- Hero của Add to Home Screen guide đủ bốn corner icons: green sliders, violet spark, blue photo và **black AI model/network icon** lấy đúng SVG neural-network đang dùng trong AI Settings.
- Flow cài PWA trên Safari mới có thêm bước đầu `Open Safari menu` với icon ba gạch. Sau đó mới `Share` → `Add to Home Screen` → `Open Stylio`; copy VI/EN/ZH cập nhật tương ứng.
- Service Worker cache tăng **v188**.
- Regression: **86/86 main lightweight suite pass**, **3/3 language pass**, PWA/i18n pass, VI/EN/ZH **217 strings**.

Batch v188 tiếp tục được refine trong cùng working tree; chưa commit/push riêng.

## 36. Batch v189 — dark install icon / Safari bottom-bar clearance

- `Open Stylio` trong Add to Home Screen guide không còn hard-code icon light. Row này giờ dùng cùng cặp `photographic-styles.svg` / `photographic-styles-dark.svg` và theme selectors như app mark chính, nên dark mode chuyển sang icon đen đúng thiết kế.
- Install guide tăng bottom padding lên tối thiểu `132px` (vẫn cộng safe-area khi lớn hơn) để nút `Continue in Safari` và phần cuối nội dung luôn nằm trên Safari bottom tab/address bar thay vì bị che.
- Service Worker cache tăng **v189**.
- Regression: **86/86 main lightweight suite pass**, **3/3 language pass**, PWA/i18n pass, VI/EN/ZH **217 strings**.

Batch v189 tiếp tục được refine trong cùng working tree; chưa commit/push riêng.

## 37. Batch v190 — compact install guide above Safari chrome

- Để `Continue in Safari` không còn nằm sát/đè dưới Safari bottom bar ở trạng thái mở ban đầu, install guide được nén nhẹ theo chiều dọc thay vì chỉ tăng bottom padding: top inset giảm `safe-area + 24px → +12px`, shell gap `22px → 18px`, hero `184px → 172px`, mỗi step `74px → 70px`, description margin `10px → 8px`.
- Khoảng reserve `132px` phía dưới vẫn giữ làm fallback khi cần cuộn, nhưng nút CTA giờ được đẩy lên khoảng ~50px ngay ở trạng thái ban đầu, gần đúng với vị trí người dùng thấy sau khi tự cuộn nhẹ.
- Service Worker cache tăng **v190**.
- Regression: **86/86 main lightweight suite pass**, **3/3 language pass**, PWA/i18n pass, VI/EN/ZH **217 strings**.

Chưa commit/push. Working tree v190 là base hiện hành.

---

Nếu cần hiểu lịch sử vì sao một quyết định UI tồn tại, đọc main plan. Nếu cần hiểu vì sao một output HEIC/HDR/Portrait phải giữ contract nào, đọc `facts.md` và browser/processing guide. Đừng dùng lịch sử trial cũ để suy ra behavior hiện tại nếu code/test mới hơn đã thay thế nó.
