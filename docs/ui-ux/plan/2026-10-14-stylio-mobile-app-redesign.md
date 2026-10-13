# Stylio — kế hoạch redesign UI/UX mobile và tổ chức frontend

Ngày: 2026-10-14. Nhánh làm việc: `feature/ui-ux-redesign`.

Trạng thái: đề xuất thiết kế đã đối chiếu code; chưa triển khai giao diện. Refactor module và dọn tài liệu là công việc nền được người dùng yêu cầu riêng. Các checkbox dưới đây theo dõi triển khai, không biểu thị phê duyệt thiết kế.

## 1. Mục tiêu và nhận định

Đồng ý với nhận định chính: vấn đề ưu tiên là cấu trúc thông tin. Mobile hiện mở một trang dài gồm header, hero, workspace, history, cache, help và footer. Thay đổi màu hoặc border sẽ không giải quyết việc người dùng phải tìm tác vụ và kết quả giữa nhiều vùng không cùng mục đích.

Mục tiêu là mở Stylio để chọn ảnh, theo dõi xử lý, chỉnh kết quả và lưu bản xuất bằng ít bước, đồng thời giữ nhận diện riêng. Cảm giác app đến từ điều hướng, trạng thái và hành động nhất quán; không cần sao chép mọi chi tiết thị giác của iOS.

Ưu tiên người dùng iPhone Safari và PWA, vẫn hỗ trợ desktop, bàn phím, trình đọc màn hình, ba ngôn ngữ VI/EN/ZH và cả light/dark mode. Redesign không thay đổi chính sách giữ Styles/HDR/Portrait, thuật toán xử lý, loại output hoặc giới hạn Live Photo.

## 2. Hiện trạng được khảo sát trước refactor

| Vùng | Hiện trạng | Hệ quả thiết kế |
| --- | --- | --- |
| `web/index.html` | Hero và footer luôn nằm trong main flow; history ngay dưới upload | Cần tách navigation khỏi nội dung tác vụ |
| AI settings | `<details>` với switch và model range ba mức | Mobile sheet và radio segmented phù hợp hơn |
| `web/app.js` | Khởi tạo, state, xử lý file, AI, result DOM, share và cleanup chung một file | Tách trách nhiệm trước khi đổi cách hiển thị |
| History | Result DOM, Blob URL và bộ nhớ trong phiên | Chưa được mô tả là thư viện ảnh lưu lâu dài |
| Queue | Xử lý tuần tự; chờ trang visible trước tác vụ tiếp theo | Tab nội bộ không được coi là tab trình duyệt bị ẩn |
| Settings | Model/GPU có localStorage; AI master điều khiển feature/cancellation | Giữ semantics hiện tại trong refactor |
| Save | `navigator.canShare` và `navigator.share`; có Download fallback | Không biết chắc ảnh đã được lưu trong Photos |
| Result | Có output epoch, pending state, cleanup và cập nhật focus/aperture | Sticky Save phải dùng output mới nhất của đúng ảnh |
| Startup | Bootstrap dịch copy trước khi tải app; có retry | Giữ được cold-start và lỗi tải tài nguyên |

Nguồn nội bộ: `web/index.html`, `web/app.js`, `web/styles.css`, `web/src/ui/page-bootstrap.js`, `web/src/ui/ai-feature-controls.js`, `web/src/ui/processing-scheduler.js`.

## 3. Đánh giá 12 đề xuất

| Đề xuất | Quyết định và điều chỉnh |
| --- | --- |
| 1. Giảm hero | Đồng ý. Mobile hiển thị lời giới thiệu ngắn trong empty state lần đầu; lần sau ưu tiên Choose Photos. Dùng cờ onboarding riêng, không suy ra từ history vốn chỉ tồn tại trong phiên. |
| 2. App shell | Chọn bottom tabs `Process / History` trên mobile. Giữ hai destination; không dùng đồng thời segmented navigation và bottom tabs. |
| 3. Upload | Mobile bỏ “or drop here”. Tên định dạng ngắn là ví dụ phổ biến, có đường dẫn xem đầy đủ. Browse Files chỉ thêm sau khi thử picker thật; web không bảo đảm hai nút mở hai picker native khác nhau. |
| 4. Grouped surface | Đồng ý. Surface, khoảng cách và divider tạo nhóm; gradient là accent AI. Giữ tương phản trong cả hai theme. |
| 5. AI sheet | Ưu tiên cao. Một tập control, hai cách trình bày mobile/desktop; tránh hai bản DOM gây state lệch. |
| 6. Native controls | Model dùng radio segmented Lite/Standard/Pro. Row 50–56 px là mục tiêu với label một dòng, không khóa chiều cao khi text dài. |
| 7. Activity card | Đồng ý, nhưng phải hỗ trợ batch và lỗi từng ảnh. Task đang chạy khác ảnh đang xem. |
| 8. Sticky actions | Có trong màn chi tiết result; filename/thumbnail và output version xác định ngữ cảnh. Không đặt Save toàn cục trên danh sách nhiều ảnh. |
| 9. Help/cache/About | Chuyển vào menu app và Settings/About sheet. Cảnh báo cần thiết cho ảnh vẫn nằm cạnh ảnh, không giấu hết vào Help. |
| 10. Compact header | Logo + Stylio + menu, vùng nội dung cao khoảng 48–52 px cộng safe area. Language ở Settings, truy cập được trước khi chọn ảnh. |
| 11. State motion | Đồng ý. Animation phục vụ chuyển tab/sheet/trạng thái, có reduced-motion. Không animate progress bằng phần trăm giả. |
| 12. Standalone | Cùng shell/state/controller với Safari, chỉ điều chỉnh chrome và safe area. Không tạo hai app song song. |

## 4. Lựa chọn kiến trúc thông tin

Ba lựa chọn đã cân nhắc:

1. Chỉ compact trang hiện tại: ít thay đổi, nhưng task/history tiếp tục trộn lẫn.
2. Segmented Process/History trên đầu: gọn chiều cao, nhưng điều hướng xa ngón cái hơn và dễ nhầm với bộ lọc.
3. Bottom tabs Process/History: phân biệt hai destination rõ ràng, thuận thao tác mobile; cần quản lý khoảng đáy khi mở result.

Chọn phương án 3. Desktop có thể giữ workspace và lịch sử cùng bố cục rộng; dùng chung dữ liệu tác vụ và action handlers.

```text
App bar: logo · Stylio · menu
├── Process
│   ├── Empty: Choose Photos + AI summary + hướng dẫn định dạng
│   ├── Batch: task đang chạy + hàng đợi ngắn
│   └── Result detail: preview + chỉnh focus/aperture + thông báo + details
├── History: danh sách tác vụ phiên hiện tại → mở Result detail
├── AI Settings: sheet trên mobile / panel trên desktop
└── Settings & About: language, cache, help, version, GitHub, MIT
Bottom tabs: Process · History
```

Result detail là trạng thái con của tab mở nó. Có Back về danh sách và giữ vị trí cuộn. Trên mobile, detail thay bottom tabs bằng action bar trong lúc mở; không chồng hai thanh đáy. Khi đóng detail, khôi phục tab và scroll. Cần chốt thao tác Back cùng route/state controller, thử cả Safari Back và standalone.

## 5. Hành vi từng màn

### Process và chọn ảnh

- Choose Photos là hành động chính, dùng input hiện tại, vẫn hỗ trợ chọn nhiều file.
- Empty state lần đầu: một dòng lợi ích + “Processed on your device”, link hướng dẫn chọn Current format. Không onboarding nhiều trang.
- Giữ tip giữ định dạng gốc ở vị trí dễ thấy trước picker; ghi nhớ dismiss như hiện tại.
- Khi có batch: chọn ảnh mới vẫn có thể thêm queue; hiển thị số đang chờ, không dựng đồng thời mọi preview lớn.
- Desktop tiếp tục drag/drop. Chỉ ẩn copy drop trên mobile, không làm hỏng drag/drop của thiết bị có chuột.
- Không tự mở AI sheet sau mỗi lần chọn ảnh.

### AI Settings

- Trigger có tên truy cập `AI Settings`, có tóm tắt hiệu ứng đang bật gần AI master.
- Sheet có title, Close/Done dễ chạm; nội dung cuộn khi màn thấp hoặc cỡ chữ lớn.
- Giữ các mục Depth Effect, Sharpen Photo, Suggested Styles, GPU acceleration, Model.
- Group hiệu ứng riêng với Execution (GPU/Model); mô tả GPU/model áp dụng cho tác vụ nào phải khớp logic hiện tại.
- Lite/Standard/Pro là radio group; phím mũi tên và screen reader đọc lựa chọn, không dùng semantics slider giả.
- Copy giải thích trade-off dựa trên model thực tế; không mặc định hứa Lite luôn nhanh hơn hoặc Pro luôn đẹp hơn.
- AI master giữ hành vi bật Depth mặc định và tắt/cancel feature như hiện tại trong giai đoạn redesign.
- Thay đổi control vẫn áp dụng theo handler hiện có. Done chỉ đóng sheet; không thêm cơ chế Apply/Cancel có thể gây hiểu sai.
- Mở sheet không khởi chạy inference hoặc tải thêm model.
- Ưu tiên `<dialog>.showModal()` nếu phù hợp support target: focus vào sheet, nền inert, có Escape/Close, trả focus về trigger. Không phụ thuộc vào thuộc tính dialog mới chưa kiểm tra trên Safari mục tiêu. [MDN dialog](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog).

### Processing và batch

State tối thiểu: `queued → processing → ready | failed`; một output ready có thể vào `updating → ready` khi chỉnh Portrait. Trạng thái shared/downloaded là cờ action, không thay ready.

- Card hiện thumbnail nếu có, filename, stage, progress xác định được và bước kế tiếp.
- Có stage indeterminate khi runtime không cung cấp tổng; không chạy progress giả lên 95%.
- Hiển thị phân biệt tải tools lần đầu, đọc ảnh, xử lý và xuất file.
- Chuyển tab nội bộ chỉ đổi view, không dispose job hay cancel AI.
- Tác vụ đang chạy vẫn có chỉ báo nhỏ khi ở History; completion không tự giật người dùng khỏi ảnh đang xem.
- AI fail giữ fallback theo logic hiện tại và giải thích hiệu ứng nào chưa hoàn tất. Không trình bày fallback như output AI thành công.
- Không thêm full-job Cancel nếu pipeline chưa hỗ trợ. Giữ Cancel AI có sẵn, và thiết kế trạng thái cancelled riêng khi đã có cancellation thật.
- Khi trang trình duyệt bị background, mô tả phù hợp khả năng thực tế; PWA không hứa chạy nền liên tục.

### Result detail và Save

- Preview chiếm ưu tiên, sau đó focus/aperture nếu có, thông báo cần thực hiện trong Photos, rồi Details.
- Adaptive Styles notice nằm trong ngữ cảnh result trước Save. Standard không hiển thị Palette; giữ logic đã sửa.
- Một action bar thuộc một result ID và output epoch. Khi output đang cập nhật, disable Save/Download của output đó.
- Primary là Save/Share phù hợp capability; Download là secondary. Live Photo ZIP tách tên rõ với still HEIC.
- Đổi output sau focus/aperture phải đổi file, URL và trạng thái action; bản mới không kế thừa dấu “đã chia sẻ” của file cũ.
- `navigator.share()` cần thao tác trực tiếp từ người dùng; không gọi sau auto-processing. Hủy share sheet không báo lỗi. Promise resolved không chứng minh đã lưu vào Photos, nên nhãn trạng thái không khẳng định “Saved to Photos”. [MDN share](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share).
- Không che preview controls hoặc hàng cuối Details; content bottom padding tính theo action bar và safe area thực tế.

### History, cache và About

- Phase đầu ghi rõ history của phiên; reload có thể làm mất output chưa tải.
- History có filename, trạng thái, thumbnail nhỏ và mở detail; không nhân bản Blob/output khi đổi tab.
- Clear History dùng cleanup hiện tại, khóa khi task đang chạy; không gọi Clear Cache thay thế.
- Xóa result chưa được export cần confirmation nếu thao tác làm mất bản duy nhất trong phiên.
- Clear Cache ở Settings giải thích xóa tools tải xuống, giữ preference/photos; không làm người dùng hiểu là dọn thư viện Photos.
- About chứa version, GitHub, MIT và ghi chú unofficial; nội dung license vẫn truy cập được.
- Help giữ các giới hạn HDR/Styles/Portrait/RAW/Live Photo và hướng dẫn định dạng gốc; thông báo theo ảnh vẫn hiện trong result.

## 6. Layout, accessibility và motion

- Mobile dùng một vùng cuộn chính cho mỗi screen; sheet cuộn riêng khi mở, khóa scroll nền và khôi phục khi đóng.
- Không khóa mọi màn vào chiều cao cố định gây cắt text. Dùng viewport units có fallback; thử browser toolbar mở/thu, landscape và keyboard.
- Safe area top dành cho app bar, bottom dành cho thanh tab/action; không cộng inset hai lần.
- Tap target mục tiêu ít nhất 44×44 CSS px; row co giãn khi dịch hoặc tăng cỡ chữ. Focus-visible rõ.
- Navigation có tên, selected state, landmark phù hợp. View inactive không focus được và không được screen reader đọc.
- Progress announcements ngắn theo stage, không đọc lại toàn bộ list mỗi tick.
- Text contrast tối thiểu 4.5:1 cho chữ thường; controls có tương phản và không chỉ dựa vào màu báo trạng thái.
- Tôn trọng reduced-motion. Sheet khoảng 180–240 ms là điểm bắt đầu để thử, không phải tiêu chuẩn cứng. Không dùng blur backdrop nặng trên diện lớn nếu làm tụt frame.
- iOS standalone nhận diện bằng display-mode và fallback iOS nếu cần; cùng handler và state, không render đồng thời hai bộ control.

## 7. Tổ chức code trước redesign

`web/app.js` trở thành entry point khởi động. Tách module theo trách nhiệm, không chỉ chia file thành các đoạn đánh số:

```text
web/
  app.js                         # khởi động app
  src/
    app/                         # phối hợp use case và vòng đời phiên
      application.js             # wiring controller
      processing/                # import/HEIC/raster, AI orchestration, profile cache
    ui/
      results/                   # result DOM, output/action rendering
      ...                        # i18n, settings, bootstrap
    media/                       # decode, Live Photo, file input data
    portrait/ detail/ recommend/  # thuật toán và model giữ domain riêng
    core/ codecs/ raster/ styles/ vision/ dng/
```

Controller truyền dependency/state cần thiết bằng interface nhỏ. Không tạo global mutable store chứa mọi DOM/model. Result view quản lý cleanup và Blob URL của result; pipeline quản lý xử lý file; controller quản lý queue và state phiên. Giữ import lazy của model/encoder, đường dẫn worker/module asset và startup retry.

Refactor là bước nền giữ hành vi hiện tại. Chỉ bắt đầu đổi shell sau khi test chứng minh routing tài nguyên, AI toggle/cancel, output cập nhật và cleanup vẫn hoạt động. Tài liệu kỹ thuật được gom theo chủ đề trong `docs`; giữ README entry point, license, skill instructions và `facts.md`.

## 8. Roadmap và tiêu chí nghiệm thu

### Phase 0 — nền code và tài liệu

- [x] Tách app orchestration, file processing, AI orchestration, result view, profile và Live Photo theo trách nhiệm.
- [x] Entry point chỉ import/call khởi tạo, không chứa pipeline ảnh.
- [x] Cập nhật service-worker asset list, module paths và test đang tham chiếu app.js.
- [x] Gom tài liệu kỹ thuật và loại file thừa có căn cứ; giữ facts.md.
- [x] Kiểm tra nhẹ đơn luồng; không tải model hoặc batch encode để kiểm chứng refactor thuần cấu trúc.

Nghiệm thu: hành vi và output policy giữ nguyên; startup/retry/offline imports và cleanup không bị hỏng.

### Phase 1 — mobile shell

- [ ] Compact header, first-use empty state, upload copy mobile.
- [ ] Settings/About chứa language, help, cache và footer information.
- [ ] Grouped surface và spacing phù hợp text dài.
- [ ] Có controller/state nền cho Process/History và selected result, chưa đổi output pipeline.

Nghiệm thu: ở 390×844, returning user thấy Choose Photos và AI summary ngay mà không cuộn; ở 320 px/cỡ chữ lớn vẫn dùng được bằng cuộn; Help/Language/License không bị mất.

### Phase 2 — interaction và điều hướng

- [ ] AI Settings sheet + model radio segmented.
- [ ] Hai bottom tabs; History tách khỏi Process, giữ state khi chuyển tab.
- [ ] Task card cho single/batch, current task và selected result tách biệt.
- [ ] Result detail và sticky action bar, cập nhật theo output epoch.
- [ ] Back, focus restore, scroll restore, pending output và cancellation.

Nghiệm thu: chọn 3 ảnh, chuyển History khi chạy, mở một ảnh ready, lưu đúng ảnh đó, quay lại Process và theo dõi queue; chỉnh focus không xuất nhầm bản trước; share cancel không báo lỗi và không gắn trạng thái saved sai.

### Phase 3 — PWA polish

- [ ] Safe area và standalone chrome; light/dark theme đồng bộ.
- [ ] Startup trạng thái ngắn, lỗi tải và Retry rõ, không splash chặn vô ích.
- [ ] Reduced-motion và transition state, tối ưu thumbnail/memory.
- [ ] Persist preference, onboarding và navigation nhẹ có fallback khi storage bị chặn.
- [ ] Icon/splash consistency trên thiết bị thật.

Nghiệm thu: Home Screen/Safari cùng tác vụ, không che nút bằng home indicator, offline warm start vẫn tìm thấy các module, đổi orientation/cỡ chữ không mất controls.

Lưu ảnh/output qua reload là hạng mục riêng sau ba phase: cần IndexedDB, quota/eviction, giới hạn dung lượng và cleanup policy. Chưa đưa vào cam kết persistence của roadmap này.

## 9. Thứ tự ba việc mang lại tác động rõ nhất

Sau Phase 0: (1) compact shell, giảm hero/footer; (2) AI Settings sheet; (3) tách History khỏi Process. Sticky result actions đi sau khi selected-result state đã ổn định. Cách sắp xếp này vẫn đạt ba ưu tiên người dùng nêu, đồng thời tránh làm thanh Save trước khi xác định đúng ngữ cảnh output.

## 10. Ma trận kiểm chứng và ranh giới phạm vi

| Nhóm | Trường hợp bắt buộc |
| --- | --- |
| Thiết bị | Mobile 320/390/430 px; desktop; landscape; iPhone Safari và Home Screen |
| Nội dung | VI/EN/ZH; filename dài; text phóng lớn; light/dark; reduced-motion |
| Startup | Cold/warm cache; offline sau warm; module download fail; retry; storage bị chặn |
| Pipeline | HEIC native/legacy; raster/DNG; AI off/on; output updating; lỗi một ảnh trong batch |
| Result | Save/Download; share cancel/fail; Live Photo still/ZIP; đổi focus; xóa result; Clear History/Cache |
| Accessibility | Keyboard, VoiceOver, focus trap/restore, selected tab, progress announcement |

Các test tự động tập trung vào state/action contract, không snapshot lại toàn bộ HTML chỉ để khớp implementation. Visual/manual checks theo breakpoint và iPhone thực. Không chạy nhiều encoder/model/browser nặng song song.

Ngoài phạm vi: sửa thuật toán HDR/bokeh, đổi preset recommendation, xây backend/cloud history, đổi framework, bỏ desktop, thêm nhiều tab, tự viết picker native hoặc quảng cáo PWA có quyền lưu trực tiếp vào Photos.

Thiết kế này dùng brainstorming để đối chiếu mục tiêu, lựa chọn kiến trúc và kiểm tra mâu thuẫn trước khi viết giao diện. Tài liệu này là điểm theo dõi thiết kế; user review có thể cập nhật quyết định và checkbox tại đây.

## 11. Kết quả công việc nền ngày 2026-10-14

Đã thực hiện theo yêu cầu bổ sung của người dùng về refactor và dọn repo. Chưa đổi HTML/CSS hay triển khai các màn mới.

| File/module | Trách nhiệm |
| --- | --- |
| `web/app.js` | Ba dòng import/call khởi tạo |
| `web/src/app/application.js` | Wiring, state phiên, queue, input/settings events, startup/cache/history |
| `web/src/app/processing/file-processor.js` | Điều phối MOV/DNG/raster/HEIC và xuất kết quả |
| `web/src/app/processing/photo-analysis.js` | Soft Skin, decode probe, recommendation và copy tiến trình |
| `web/src/app/processing/portrait-controller.js` | AI Portrait, abort, timeout, normal fallback và preview update |
| `web/src/app/processing/profiles.js` | Profile index, retry và cache theo phiên |
| `web/src/ui/results/result-view.js` | Result DOM, pending output, metadata epoch, share/download và cleanup |
| `web/src/media/live-photo-session.js` | Ghép MOV/photo theo identifier trong phiên |

Service worker bổ sung các module vào warm offline graph, cache v150. Kiểm tra mới `tests/web/application.mjs` xác minh shared state, ngôn ngữ/model live, serialization và history cleanup với dependency giả; không tải model/encode ảnh. CI regression và Pages đều chạy kiểm tra này. Các test source contract cũ theo module mới qua helper chung.

Tài liệu đã gom:

- `web/README.md` còn là điểm vào ngắn; bản hướng dẫn dài và `OPTIMIZATION.md` chuyển/gộp thành `docs/web/browser-guide.md`.
- `web/AI-PORTRAIT.md` + `web/DNG.md` → `docs/web/processing-guide.md`.
- README/MODELS trong ba thư mục vendor AI → `docs/models/ai-assets.md`; model binaries, manifests và license notices vẫn ở vendor.
- README EN/ZH ở root và shortcut server, design/validation/implementation documents còn mục đích riêng được giữ. Liên kết tài liệu hiện hành được cập nhật; facts.md giữ nguyên lịch sử và nội dung.

Dọn file thừa: bỏ entry rỗng `[w` trong Git; xóa `.pytest_cache/` và `__pycache__/` ở root sau khi xác minh đường dẫn. Các file tracked đã gộp có thể phục hồi từ Git; hai cache Python có thể tự sinh lại khi chạy test/server. Không dọn model cache, output ảnh private, reference checkout hoặc site build hiện có vì chưa có căn cứ là không cần dùng.

Điểm nghiệm thu còn lại khi triển khai giao diện: kiểm tra manual trên Safari/iPhone/PWA với batch và output focus/aperture thực tế. Test controller/mock không chứng minh tương tác hoặc rendering trên thiết bị thật.
