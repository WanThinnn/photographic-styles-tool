# Stylio — kế hoạch redesign UI/UX mobile và tổ chức frontend

Ngày: 2026-10-14. Nhánh làm việc: `feature/ui-ux-redesign`.

**Bàn giao hiện hành: xem §15 ở cuối file.** Phản hồi mới nhất thay thế các quyết định cũ: 4 màn hình Process / History / Guide / Settings, Search tách riêng, Settings không còn popup; Model là thanh capsule dày, núm tròn, mô tả bên trái cùng hàng. Lỗi thanh đáy iPhone 16 Pro đã có bản sửa neo viewport trong code, đang chờ người dùng kiểm chứng trên thiết bị thật.

Trạng thái: đã triển khai mobile shell và interaction chính trên `feature/ui-ux-redesign` ngày 2026-10-14. Đã tách CSS và thêm kiểm tra tự động/giao diện trình duyệt; chưa commit/push. Các mục cần iPhone thật, VoiceOver, chia sẻ hệ thống và ảnh thực tế vẫn để mở; xem §13. Refactor JavaScript nền đã hoàn tất từ trước.

Phạm vi đọc Apple: ba trang đầu vào người dùng cung cấp và các chương HIG liên quan trực tiếp đến Stylio, tập trung vào hướng dẫn chung và iOS/iPadOS. HIG là thư viện nhiều nền tảng; tài liệu này không tuyên bố đã đọc mọi API, video, bảng thông số hoặc chương dành cho tất cả nền tảng. Danh mục nguồn và cách áp dụng nằm ở §12. Hướng dẫn native được chuyển thành tiêu chí cho Safari/PWA, không phải cam kết web có đầy đủ API UIKit/SwiftUI.

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
| 2. App shell | Theo phản hồi mới nhất: 4 màn `Process / History / Guide / Settings` trong capsule nổi, nút Search riêng; không dùng đồng thời segmented navigation và bottom tabs. |
| 3. Upload | Mobile bỏ “or drop here”. Tên định dạng ngắn là ví dụ phổ biến, có đường dẫn xem đầy đủ. Browse Files chỉ thêm sau khi thử picker thật; web không bảo đảm hai nút mở hai picker native khác nhau. |
| 4. Grouped surface | Đồng ý. Surface, khoảng cách và divider tạo nhóm; gradient là accent AI. Giữ tương phản trong cả hai theme. |
| 5. AI sheet | Ưu tiên cao. Một tập control, hai cách trình bày mobile/desktop; tránh hai bản DOM gây state lệch. |
| 6. Native controls | Theo phản hồi người dùng, Model trở lại thanh kéo ba nấc Lite/Standard/Pro. Row 50–56 px là mục tiêu với label một dòng, không khóa chiều cao khi text dài. |
| 7. Activity card | Đồng ý, nhưng phải hỗ trợ batch và lỗi từng ảnh. Task đang chạy khác ảnh đang xem. |
| 8. Sticky actions | Có trong màn chi tiết result; filename/thumbnail và output version xác định ngữ cảnh. Không đặt Save toàn cục trên danh sách nhiều ảnh. |
| 9. Help/cache/About | Settings là màn hình language/cache/About, không popup. Guide là màn đọc Help riêng, truy cập từ tab. Cảnh báo cần thiết cho ảnh vẫn nằm cạnh ảnh. |
| 10. Compact header | Root giữ nhận diện logo/Stylio gọn; selected tab xác định màn đang mở. Process bỏ heading/mô tả lặp, History vẫn có heading. Trong workspace ảnh, dùng filename/ngữ cảnh ảnh thay tên app lặp lại. Vùng nội dung header khoảng 48–52 px cộng safe area là mục tiêu của Stylio, không phải kích thước bắt buộc từ HIG. |
| 11. State motion | Đồng ý. Animation phục vụ chuyển tab/sheet/trạng thái, có reduced-motion. Không animate progress bằng phần trăm giả. |
| 12. Standalone | Cùng shell/state/controller với Safari, chỉ điều chỉnh chrome và safe area. Không tạo hai app song song. |

## 4. Lựa chọn kiến trúc thông tin

Ba lựa chọn đã cân nhắc:

1. Chỉ compact trang hiện tại: ít thay đổi, nhưng task/history tiếp tục trộn lẫn.
2. Segmented Process/History trên đầu: gọn chiều cao, nhưng điều hướng xa ngón cái hơn và dễ nhầm với bộ lọc.
3. Bottom tabs Process/History: phân biệt hai destination rõ ràng, thuận thao tác mobile; cần quản lý khoảng đáy khi mở result.

Chọn phương án 3. Desktop có thể giữ workspace và lịch sử cùng bố cục rộng; dùng chung dữ liệu tác vụ và action handlers.

```text
App bar: nhận diện Stylio gọn
├── Process
│   ├── Empty: Choose Photos + AI summary + hướng dẫn định dạng
│   ├── Batch: task đang chạy + hàng đợi ngắn
│   └── Kết quả mới nhất → mở photo workspace
├── History: danh sách tác vụ phiên hiện tại → mở photo workspace
├── AI Settings: sheet trên mobile / panel trên desktop
├── Guide: hướng dẫn, định dạng, giới hạn chỉnh sửa và xử lý lỗi
└── Settings & About: language, cache, version, GitHub, MIT
Bottom tabs: Process · History · Guide · Settings + nút Search riêng
Photo workspace: modal toàn màn hình, title ảnh · Close
└── Preview · focus/aperture · thông báo · Details · Share/Download toolbar
```

Tab bar giữ bốn destination thật với icon và nhãn chữ theo yêu cầu người dùng, luôn có ở các màn chính, kể cả History rỗng; không disable History vì chưa có ảnh. Search là action tách riêng, không tab giả. Không dùng tab làm nút chọn ảnh hoặc Save. Mỗi tab giữ vị trí cuộn và selection riêng, dựa trên nguyên tắc [Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars); số lượng 4 là quyết định của Stylio, không phải yêu cầu chung của Apple.

Photo workspace được chốt là tác vụ modal toàn màn hình trên mobile: xem ảnh, chỉnh lấy nét/khẩu độ và xuất cùng một kết quả. Modal phủ shell và tab bar, dùng nút X với tên truy cập Close photo. Đóng workspace giữ kết quả trong phiên, không có nghĩa hủy chỉnh sửa hay xóa ảnh. Đây là trường hợp xem/chỉnh media phù hợp với [Modality](https://developer.apple.com/design/human-interface-guidelines/modality). Nếu sau này đổi workspace sang màn điều hướng thông thường, phải giữ tab bar; không tùy tiện thay tab bằng Save ở một màn con.

Navigation controller lưu tab gốc, result ID, phần tử mở và scroll offset. Mở workspace tạo một history entry; Safari Back đóng workspace trước khi rời app. Đổi focus/aperture không tạo thêm history entry. Close dùng cùng đường đóng với Back, không đẩy entry mới hoặc tạo vòng lặp. Forward chỉ khôi phục được result còn tồn tại trong phiên; result đã hết hiệu lực dẫn về Process với thông báo ngắn. Không lưu Blob, filename, EXIF hoặc ảnh vào URL/history.state. Không bắt cử chỉ vuốt cạnh của Safari bằng gesture riêng.

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
- Sheet có title và nút X ở đầu cạnh leading, tên truy cập Close AI settings; nội dung cuộn khi màn thấp hoặc cỡ chữ lớn.
- Giữ các mục Depth Effect, Sharpen Photo, Suggested Styles, GPU acceleration, Model.
- Group hiệu ứng riêng với Processing options (GPU/Model). Nhóm nâng cao có disclosure nếu nội dung quá dài; giữ Model đang chọn trong summary.
- Theo yêu cầu mới của người dùng, Lite/Standard/Pro dùng input range thật, min=0, max=2, step=1, với ba dấu mốc. Hiện tên mức đã chọn phía trên, cập nhật aria-valuetext, hỗ trợ bàn phím và giữ cùng state xử lý. Đây là lựa chọn của Stylio, không phải khẳng định Apple bắt buộc dùng slider cho model.
- Copy giải thích trade-off dựa trên model thực tế; không mặc định hứa Lite luôn nhanh hơn hoặc Pro luôn đẹp hơn.
- AI master giữ hành vi bật Depth mặc định và tắt/cancel feature như hiện tại trong giai đoạn redesign.
- Sheet dùng live settings: thay đổi áp dụng qua handler hiện có, có copy ngắn giải thích áp dụng ngay. Close chỉ đóng; không dùng Cancel khi không có rollback, không dùng Done như một nút Apply giả. Nếu về sau có thiết lập dạng draft thì phải triển khai thật Cancel/Done cùng hoàn tác/commit. Apple phân biệt các hành động này trong [Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets).
- Phạm vi áp dụng phải rõ: bật/tắt Depth có thể tác động candidate đang có theo logic hiện tại; Model/GPU phục vụ lượt xử lý kế tiếp theo thời điểm pipeline lấy setting. Không dùng một câu “tất cả áp dụng cho ảnh sau” cho toàn bộ control. Không thay cancellation hay khởi chạy lại ảnh chỉ để đồng bộ giao diện.
- Mở sheet không khởi chạy inference hoặc tải thêm model.
- Ưu tiên `<dialog>.showModal()` nếu phù hợp support target: focus vào sheet, nền inert, có Escape/Close, trả focus về trigger. Không phụ thuộc vào thuộc tính dialog mới chưa kiểm tra trên Safari mục tiêu. [MDN dialog](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog).
- Một thời điểm chỉ có một sheet của app. Không mở AI Settings từ bên trong Settings/About; đóng vùng đang mở trước khi chuyển. Chỉnh focus/aperture nằm ngay cạnh preview, không đưa vào AI Settings.
- Sheet mở ở độ cao đủ cho nội dung; không ép đúng nửa màn hình. Màn thấp/landscape/chữ lớn được dùng gần toàn chiều cao với header đóng cố định. Không vẽ grabber trang trí nếu chưa hỗ trợ kéo resize. Swipe-down là phần bổ sung sau khi kiểm chứng scroll/gesture trên Safari; nút đóng luôn dùng được.

### Processing và batch

State tối thiểu: `queued → processing → ready | failed`; một output ready có thể vào `updating → ready` khi chỉnh Portrait. Trạng thái shared/downloaded là cờ action, không thay ready.

- Card hiện thumbnail nếu có, filename, stage, progress xác định được và bước kế tiếp.
- Có stage indeterminate khi runtime không cung cấp tổng; không chạy progress giả lên 95%.
- Phần trăm thuộc stage có tên, ví dụ “Encoding · 45%”, không giả làm tiến trình toàn bộ ảnh. Dùng vòng tiến trình cùng kích thước cho trạng thái xác định/không xác định để không nhảy layout; stage label và vùng thông báo có vị trí ổn định. Không đổi spinner sang progress bar giữa cùng một stage. [Progress indicators](https://developer.apple.com/design/human-interface-guidelines/progress-indicators).
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
- Với khả năng chia sẻ file, primary dùng nhãn Share / Chia sẻ / 分享 và biểu tượng share; hint chỉ dẫn chọn Save Image trong sheet hệ thống nếu có. Apple dùng Share để mở activity view; web không biết đích người dùng chọn. Nếu không hỗ trợ file sharing, Download là primary. Không dùng “Save to Photos” như một thao tác ghi trực tiếp. Live Photo ZIP tách tên rõ với still HEIC. [Activity views](https://developer.apple.com/design/human-interface-guidelines/activity-views).
- Share và Download có cùng chiều cao; phân cấp bằng fill/contrast, không làm một nút phình lớn hơn nút kia để nhấn mạnh. Trên màn hẹp có thể dùng một primary và secondary trong More nếu vẫn dễ tìm; quyết định theo kiểm tra text VI/EN/ZH.
- Đổi output sau focus/aperture phải đổi file, URL và trạng thái action; bản mới không kế thừa dấu “đã chia sẻ” của file cũ. Share resolved chỉ cho biết hoàn tất luồng share; download click chỉ cho biết đã yêu cầu tải, không chứng minh file đã được ghi. Copy dùng “Share again” / “Download again”, tránh badge khẳng định đã lưu trong Photos.
- `navigator.share()` cần thao tác trực tiếp từ người dùng; không gọi sau auto-processing. Hủy share sheet không báo lỗi. Promise resolved không chứng minh đã lưu vào Photos, nên nhãn trạng thái không khẳng định “Saved to Photos”. [MDN share](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share).
- Không che preview controls hoặc hàng cuối Details; content bottom padding tính theo action bar và safe area thực tế.
- Preview giữ tỉ lệ ảnh, hiển thị toàn ảnh khi lấy nét, không crop chỉ để lấp đầy viewport. Thumbnail History có thể crop để scan; không dùng crop đó làm hệ tọa độ focus. Không thêm CSS brightness/filter, lớp phủ màu hoặc blend-mode lên ảnh để hòa theme. Preview blur hiện tại là ước lượng, không phải bản render HDR cuối của Photos.
- Workspace đóng trong lúc output đang cập nhật vẫn giữ job và result; mở lại thấy đúng pending/latest output. Chỉ action xóa result mới gọi dispose. Không tự mở workspace mới khi batch hoàn tất nếu người dùng đang xem ảnh khác.

### History, cache và About

- Phase đầu ghi rõ history của phiên; reload có thể làm mất output chưa tải.
- History có filename, trạng thái, thumbnail nhỏ và mở detail; không nhân bản Blob/output khi đổi tab.
- Clear History dùng cleanup hiện tại, khóa khi task đang chạy; không gọi Clear Cache thay thế.
- Xóa result chưa được export cần confirmation nếu thao tác làm mất bản duy nhất trong phiên.
- Clear Cache ở Settings giải thích xóa tools tải xuống, giữ preference/photos; không làm người dùng hiểu là dọn thư viện Photos.
- About chứa version, GitHub, MIT và ghi chú unofficial; nội dung license vẫn truy cập được.
- Help giữ các giới hạn HDR/Styles/Portrait/RAW/Live Photo và hướng dẫn định dạng gốc; thông báo theo ảnh vẫn hiện trong result.
- Settings chứa nhóm Language, Storage và About/Help; không có cây menu sâu hoặc nhiều sheet chồng nhau. Bộ chọn ngôn ngữ dùng tên tự gọi Tiếng Việt / English / 中文, truy cập được khi converter đang boot hoặc gặp lỗi.
- Clear History/xóa ảnh cần xác nhận khi sẽ mất kết quả chưa tải trong phiên, có số ảnh cụ thể và hành động Cancel rõ. Clear Cache có thể tải lại được: giải thích trong hàng cài đặt, chỉ thêm xác nhận nếu thực sự phát sinh mất dữ liệu, không hiện cảnh báo lặp vô ích. Không tự xóa output để dọn model cache.

## 6. Layout, accessibility và motion

- Mobile dùng một vùng cuộn chính cho mỗi screen; sheet cuộn riêng khi mở, khóa scroll nền và khôi phục khi đóng.
- Không khóa mọi màn vào chiều cao cố định gây cắt text. Dùng viewport units có fallback; thử browser toolbar mở/thu, landscape và keyboard.
- Safe area top dành cho app bar, bottom dành cho thanh tab/action; không cộng inset hai lần.
- Safe area, theme và accessibility là điều kiện từ Phase 1. Dùng chiều rộng/chiều cao khả dụng để đổi bố cục, không chọn mobile shell chỉ bằng chuỗi iPhone trong user-agent. Safari và standalone có cùng khả năng; standalone chỉ đổi chrome/inset.
- Tap target mục tiêu ít nhất 44×44 CSS px; row co giãn khi dịch hoặc tăng cỡ chữ. Focus-visible rõ.
- Apple ghi kích thước theo pt trong UI native. 44×44 CSS px là mục tiêu web của Stylio, cần kiểm tra thao tác thật; không quy đổi sang pixel vật lý của ảnh chụp màn hình. HIG Accessibility hiện ghi iOS default 44 pt và minimum 28 pt, trong khi Design Tips/Buttons khuyến nghị vùng chạm 44 pt. Stylio chủ động giữ mục tiêu 44, không thu xuống 28. [Apple Design Tips](https://developer.apple.com/design/tips/).
- Navigation có tên, selected state, landmark phù hợp. View inactive không focus được và không được screen reader đọc.
- Dùng phần tử HTML thật: button cho action, nav với aria-current cho destination, input range ba nấc cho model và input range cho khẩu độ, dialog cho modal. Không gắn ARIA tablist vào các nút điều hướng nếu không triển khai đầy đủ keyboard contract tương ứng. Process có tên truy cập từ tab, không lặp heading bằng chữ; History và modal có heading rõ; mở workspace đưa focus vào title, đóng trả focus về phần tử mở hoặc heading danh sách nếu phần tử đó đã bị xóa.
- Progress announcements ngắn theo stage, không đọc lại toàn bộ list mỗi tick.
- Thay live region phủ toàn danh sách bằng status vùng nhỏ theo task; chỉ thông báo thay stage, hoàn tất, lỗi và mốc tiến trình hợp lý. Tên ảnh đi cùng thông báo trong batch. Không tự chuyển focus khi background task hoàn tất.
- Text contrast tối thiểu 4.5:1 cho chữ thường; controls có tương phản và không chỉ dựa vào màu báo trạng thái.
- Font theo hệ thống với fallback đa nền tảng; không tải/nhúng SF Pro để giả giao diện iOS. Body/label chính khởi điểm khoảng 17px (1.0625rem nếu root mặc định 16px), phụ khoảng 15px, caption khoảng 13px; đây là token Stylio lấy cảm hứng từ thứ bậc Apple, không sao chép toàn bộ Dynamic Type vào CSS. Dùng rem, line-height đủ rộng cho dấu tiếng Việt, font weight regular/medium/semibold và tabular numbers cho tiến trình/khẩu độ.
- Giữ browser zoom; thử text/page zoom 200% và iOS Larger Text thực tế. Row tự tăng chiều cao, model/action có thể xếp dọc. Khả năng Dynamic Type/Reduce Transparency của native không tự có trong web; kiểm tra theo Safari mục tiêu và luôn có nền đủ đục, tương phản tốt khi không phát hiện được preference.
- Tôn trọng reduced-motion. Sheet khoảng 180–240 ms là điểm bắt đầu để thử, không phải tiêu chuẩn cứng. Không dùng blur backdrop nặng trên diện lớn nếu làm tụt frame.
- Motion chỉ giải thích thay đổi state; không animation trang trí cho mỗi lần chuyển tab. Có thể ngắt/đảo chiều khi thao tác nhanh, không khóa input chờ animation. Khi reduced-motion, bỏ slide/scale/wave và dùng cập nhật tức thời hoặc fade nhẹ, vẫn có thông báo text cho tiến trình.
- iOS standalone nhận diện bằng display-mode và fallback iOS nếu cần; cùng handler và state, không render đồng thời hai bộ control.

### Vật liệu và màu

Ảnh là nội dung chính; grouped surface dùng nền trung tính và separator. Navigation/action chrome có thể có translucency nhẹ khi tương phản và tốc độ đáp ứng tốt. Apple phân biệt Liquid Glass ở lớp điều khiển/điều hướng với materials của nội dung; vì vậy không phủ hiệu ứng kính lên mọi result card hoặc background ảnh. CSS backdrop-filter chỉ là cách thể hiện trên web, không được gọi là component Liquid Glass native. [Materials](https://developer.apple.com/design/human-interface-guidelines/materials).

Dùng semantic tokens cho nền, surface nâng cao, chữ chính/phụ, separator, accent, focus, success và error. Accent hiện có của Stylio dùng có tiết chế cho primary/selection; gradient AI giữ vai trò nhận diện nhỏ. Theme theo hệ thống, có đủ biến thể light/dark và fallback tăng tương phản; màu vàng focus marker của ảnh vẫn là dấu tương tác chuyên biệt. Không có theme tự động thay đổi pixel ảnh. [Color](https://developer.apple.com/design/human-interface-guidelines/color), [Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode).

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

### Chia CSS và HTML khi triển khai redesign

Khảo sát ngày 2026-10-14: `web/styles.css` dài 2.138 dòng; `web/index.html` 148 dòng. Theo yêu cầu người dùng, CSS được chia theo trách nhiệm trong thư mục mẹ `web/styles/`, thuộc root frontend `web/`:

```text
web/
  styles.css                     # entry, các @import phẳng theo thứ tự cố định
  styles/
    foundations/
      tokens.css                 # semantic tokens, light/dark, spacing/type/layers
      base.css                   # reset nhỏ, document, chữ, control native, a11y
    layout/
      app-shell.css              # header, main scroll, tabs, safe areas, breakpoint
      workspace.css              # Process, uploader, queue, bố cục rộng
    components/
      controls.css               # button, switch row, model range ba nấc, focus state
      sheets.css                 # dialog, backdrop, nội dung cuộn và motion
      results.css                # task/history/result, notices, output actions
      portrait-editor.css        # preview, focus marker, ruler, pending indicator
  index.html                     # semantic shell và nội dung boot/empty state
  src/ui/
    shell/                       # navigation, presentation/modal, Settings view
    results/                     # view kết quả theo result ID
```

Thứ tự nạp: tokens → base → layout → components; không tạo chuỗi import lồng nhau. Chỉ `styles.css` ở root là entry được HTML tham chiếu; nội dung component thuộc các file con. Media query/light-dark/reduced-motion của một component đặt cạnh component; override tổng quát đặt ở foundations khi thực sự dùng chung. Không chia file theo số dòng, không chép cùng selector sang nhiều file, không dùng một `overrides.css` làm nơi gom nợ mới. Không cần thêm framework/build system cho việc này.

Lượt đầu di chuyển CSS giữ nguyên thứ tự cascade và kiểm tra visual trước khi thay đổi thiết kế. Nếu một khối phụ thuộc selector chưa được chuyển thì giữ khối liên quan cùng nhau đến khi gỡ được phụ thuộc; không ép phân nhóm làm đổi specificity. Stylesheet con là tài nguyên render-blocking: phải kiểm tra cold-load và số request qua server/tunnel đã sửa; thêm tất cả vào offline asset list và kiểm tra import path sau build/deploy.

HTML chỉ tách khi giảm được trách nhiệm: giữ app shell, title/landmark, file input và fallback loading/error trong `index.html`. View động như History row, Settings content hoặc workspace dùng module tạo DOM có cấu trúc trong `src/ui/`, có thể dùng template nếu tái sử dụng được. Không fetch các fragment HTML lúc boot, không giữ hai cây control mobile/desktop, không chuyển mọi nội dung sang JS khiến trang trắng khi module lỗi. Nếu HTML đủ ngắn sau khi gọn shell thì giữ một file; đây là lựa chọn có chủ đích, không phải bỏ sót yêu cầu tách HTML.

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

- [x] Compact header, first-use empty state, upload copy mobile.
- [x] Settings/About chứa language, help, cache và footer information.
- [x] Grouped surface và spacing phù hợp text dài.
- [x] Có controller/state nền cho Process/History và selected result, chưa đổi output pipeline.
- [x] Tách CSS vào `web/styles/` theo §7, giữ entry ngắn và cascade đã kiểm chứng; tách HTML/view module khi có lợi.
- [ ] Safe area, light/dark, target 44px, zoom 200%, keyboard/focus và semantic HTML hoạt động ngay với shell đầu tiên.

Nghiệm thu: ở 390×844, returning user thấy Choose Photos và AI summary ngay mà không cuộn; ở 320 px/cỡ chữ lớn vẫn dùng được bằng cuộn; Help/Language/License không bị mất.

### Phase 2 — interaction và điều hướng

- [x] AI Settings sheet + model range ba nấc theo phản hồi người dùng.
- [x] Hai bottom tabs; History tách khỏi Process, giữ state khi chuyển tab.
- [x] Task card cho single/batch, current task và selected result tách biệt.
- [x] Result detail và sticky action bar, cập nhật theo output epoch.
- [x] Back, focus restore, scroll restore, pending output và cancellation.
- [x] Photo workspace modal toàn màn hình với Close/Back đúng contract; tab bar ổn định ở root; chỉ một sheet của app mở cùng lúc.
- [x] Share/Download copy phản ánh đúng capability và kết quả thao tác, không báo chắc đã lưu vào Photos.

Nghiệm thu: chọn 3 ảnh, chuyển History khi chạy, mở một ảnh ready, lưu đúng ảnh đó, quay lại Process và theo dõi queue; chỉnh focus không xuất nhầm bản trước; share cancel không báo lỗi và không gắn trạng thái saved sai.

### Phase 3 — PWA polish

- [ ] Hoàn thiện standalone chrome và safe area đã có từ Phase 1 trên iPhone thật; light/dark đồng bộ.
- [x] Startup trạng thái ngắn, lỗi tải và Retry rõ, không splash chặn vô ích.
- [ ] Reduced-motion và transition state, tối ưu thumbnail/memory.
- [x] Persist preference, onboarding và navigation nhẹ có fallback khi storage bị chặn.
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
| Navigation | History rỗng vẫn có tab; mở/đóng workspace, Safari Back/Forward, không tạo entry khi đổi khẩu độ; result hết phiên có fallback |
| CSS/HTML | Đủ stylesheet con trong build/offline cache, import phẳng không 404, cold load không unstyled flash; có nội dung hữu ích khi JS lỗi |
| Preferences | Zoom 200%, Larger Text, reduced-motion, contrast/transparency fallback; đổi theme khi sheet đang mở |

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

## 12. Căn cứ Apple và quyết định sau đối chiếu ngày 2026-10-14

### Tài liệu đã dùng

Đọc nội dung chính thức từ các trang dưới đây; với trang DocC yêu cầu JavaScript, dùng bản Markdown do chính Apple cung cấp. Nội dung lập kế hoạch được diễn giải, không sao chép cả thư viện vào repo. Các phần thông số nhiều nền tảng chỉ dùng khi có liên quan; việc đọc này không bao gồm mọi link API/video dẫn ra từ mỗi trang.

| Nguồn | Áp dụng trong Stylio |
| --- | --- |
| [Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines) | Điểm vào, xác định phạm vi nền tảng/pattern/component |
| [UI Design Dos and Don’ts](https://developer.apple.com/design/tips/) | Vùng chạm, phân nhóm, tỉ lệ ảnh, đọc được mà không cuộn ngang |
| [App design and UI](https://developer.apple.com/documentation/technologyoverviews/app-design-and-ui) | Phân biệt framework native với nền tảng web hiện có; không suy ra cần chuyển sang SwiftUI |
| [Design principles](https://developer.apple.com/design/human-interface-guidelines/design-principles) | Tập trung tác vụ, giữ quyền chủ động, khôi phục lỗi, nhất quán |
| [Designing for iOS](https://developer.apple.com/design/human-interface-guidelines/designing-for-ios) | Ít control chính, thao tác thuận tay, xoay màn và nhiều phương thức nhập |
| [Layout](https://developer.apple.com/design/human-interface-guidelines/layout) | Phân cấp, progressive disclosure, available space, safe area |
| [Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars) | Hai destination ổn định, có nhãn; giữ state từng tab; phân biệt action/navigation |
| [Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars) | Action theo ảnh, title theo ngữ cảnh, nhóm Close và Share rõ ràng |
| [Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets) | Tác vụ ngắn, một sheet, Close/Cancel/Done đúng nghĩa, chiều cao theo nội dung |
| [Modality](https://developer.apple.com/design/human-interface-guidelines/modality) | Workspace ảnh toàn màn hình có lối thoát, giữ ngữ cảnh bên dưới |
| [Settings](https://developer.apple.com/design/human-interface-guidelines/settings) | Cài đặt chung tách khỏi tùy chọn gắn với tác vụ; default dùng được ngay |
| [Segmented controls](https://developer.apple.com/design/human-interface-guidelines/segmented-controls) | Ba mức model loại trừ nhau, giữ nhãn ngắn và cùng kiểu nội dung |
| [Toggles](https://developer.apple.com/design/human-interface-guidelines/toggles) | Switch trong grouped rows, nhãn nói rõ đối tượng bị tác động |
| [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) | Primary/secondary theo style, vùng chạm và trạng thái nhấn/pending |
| [Sliders](https://developer.apple.com/design/human-interface-guidelines/sliders) | Khẩu độ có readout và input native; không dùng slider cho lựa chọn model |
| [Progress indicators](https://developer.apple.com/design/human-interface-guidelines/progress-indicators) | Phần trăm thật theo stage, hình dạng/vị trí ổn định, dừng khi hỗ trợ thật |
| [Launching](https://developer.apple.com/design/human-interface-guidelines/launching) | Hiện shell sớm, không splash quảng bá trì hoãn; khôi phục state còn hợp lệ |
| [Loading](https://developer.apple.com/design/human-interface-guidelines/loading) | Có nội dung/feedback khi chờ, không khóa thao tác không phụ thuộc tải |
| [Onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding) | Tip ngắn đúng chỗ, dismiss được, không walkthrough bắt buộc |
| [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) | Chữ lớn, target thoải mái, nhiều tín hiệu trạng thái và phương thức thao tác |
| [Typography](https://developer.apple.com/design/human-interface-guidelines/typography) | Hệ thống type, tương quan heading/body, reflow khi cỡ chữ tăng |
| [Materials](https://developer.apple.com/design/human-interface-guidelines/materials) | Phân biệt lớp nội dung và lớp điều khiển; dùng translucency có tiết chế |
| [Color](https://developer.apple.com/design/human-interface-guidelines/color) và [Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode) | Semantic colors, theme hệ thống, contrast; không tô màu lại ảnh theo theme |
| [Motion](https://developer.apple.com/design/human-interface-guidelines/motion) | Chuyển state có mục đích, ngắn và có thể ngắt, reduced-motion |
| [Gestures](https://developer.apple.com/design/human-interface-guidelines/gestures) | Gesture quen thuộc, có nút thay thế, tránh giành cử chỉ cạnh Safari |
| [Activity views](https://developer.apple.com/design/human-interface-guidelines/activity-views) | Share mở sheet hệ thống; không giả quyền ghi trực tiếp thư viện Photos |
| [Image views](https://developer.apple.com/design/human-interface-guidelines/image-views) | Tỉ lệ và khả năng đọc controls trên ảnh; phân biệt thumbnail với ảnh lấy nét |
| [Privacy](https://developer.apple.com/design/human-interface-guidelines/privacy) | Chỉ nhận file do người dùng chọn, xử lý ảnh tại thiết bị, copy nói đúng dữ liệu/tác vụ |

### Những điều chốt thêm từ lịch sử dự án

`facts.md` là sổ thí nghiệm theo thời gian: các kết luận sau có thể phủ định kết luận trước. Khi viết copy mới phải đối chiếu code đang chạy và phản hồi thiết bị đã được xác nhận; không lấy tên một trial trong lịch sử làm tính năng hiện hành.

- Một output duy nhất cho bản Styles/Texture/Portrait đã hoàn tất; fallback AI có ghi rõ. Focus/aperture giữ latest-output guard và Live Photo ZIP đi theo đúng output đó (§10.35–10.39, §10.47).
- Preview là ước lượng; “có depth”, “có HDR” và “Photos cho chỉnh ƒ/lighting” là ba tín hiệu khác nhau. UI chỉ báo dựa trên kết quả pipeline, không gắn badge native-equivalent từ sự hiện diện metadata (§6, §10, §10.54–10.73).
- Giữ thông báo Portrait bắt đầu Off và bước áp dụng Adaptive Styles trong Photos khi thực sự cần. Câu hướng dẫn phải ngắn, theo từng kết quả, xem lại được; Standard không có Palette trong summary.
- DNG xuất HEIC SDR, ảnh raster thiếu capture metadata có giới hạn phục hồi, Live Photo cần cặp MOV và importer phù hợp. Thu gọn Help không được xóa các thông tin này.
- Ngôn ngữ và lời giải thích phải dùng được trước khi tải converter. Công cụ/model tải theo nhu cầu; câu “ảnh được xử lý trên thiết bị” không đồng nghĩa “app không có request mạng” (§10.2, §10.36, §10.48).
- Lưu nguyên bản, không tái xử lý/giải mã hay đổi HDR contract vì di chuyển view. Dời DOM preview phải giữ coordinate mapping, pause GPU khi khuất và dispose chỉ khi xóa result (§10.38–10.45).

### Trình tự triển khai được chốt

1. Di chuyển CSS giữ cascade, đưa vào offline/build checks; rà lại HTML shell và module view cần thiết.
2. Làm Phase 1 với root shell, Settings chung, first-use copy, foundations và navigation state tối thiểu; kiểm tra mobile/desktop và boot thật.
3. Làm AI Settings sheet + model range; kiểm tra cancellation, immediate settings và resize với một bộ control.
4. Kết nối Process/History và photo workspace; gắn toolbar với result ID/output epoch, kiểm tra batch/Back/share.
5. Hoàn thiện Phase 3 và kiểm tra Safari/Home Screen trên iPhone; đánh dấu riêng phần đã tự động kiểm tra với phần còn chờ thiết bị thật.

Những kích thước, thời lượng motion, cấu trúc thư mục và lựa chọn full-screen workspace trong plan là quyết định triển khai của Stylio dựa trên các nguyên tắc trên. Chúng không phải tuyên bố Apple bắt buộc mọi web app phải làm giống nhau, hoặc chứng nhận Stylio tuân thủ toàn bộ HIG.

## 13. Triển khai mobile đầu tiên — 2026-10-14

Ghi nhận phiên bản đầu trước phản hồi giao diện; các quyết định radio, heading Process và cache v152 dưới đây đã được thay thế ở §14.

### Đã thay đổi

- Khung chung Process/History cho Safari và PWA; desktop dùng cùng điều hướng gọn và vẫn có drag & drop. Header nhỏ, hero ngắn chỉ khi chưa từng có kết quả; cờ onboarding không phụ thuộc việc xóa history.
- Settings chứa language, cache, Help/About và license, có thể mở trước khi module xử lý tải xong. AI Settings dùng một `dialog.showModal()`: bottom sheet trên màn hình hẹp, bảng giữa màn hình rộng. Không nhân bản các switch cho mobile/desktop.
- Model có ba radio thực, dùng một giá trị trạng thái ẩn để nối với xử lý hiện tại. Khi chữ lớn hoặc chỗ hẹp, lựa chọn chuyển thành hàng dọc. Master AI vẫn giữ chính sách bật Depth mặc định và tắt các hiệu ứng khi off.
- Task card và danh sách History chỉ điều hướng; row kết quả gốc được chuyển nguyên DOM vào workspace, không clone nút export hay preview. Chuyển tab/đóng workspace không dispose ảnh hoặc hủy queue.
- Workspace mobile toàn màn hình; action bar cố định theo chiều cao thật của nút. Pending chặn chia sẻ/tải; output mới thay đúng File và URL của chính row đang mở. Chia sẻ thành công không đồng nghĩa đã lưu: nhãn dùng Share/Share again, không hiện dấu đã lưu vào Photos.
- Back/Forward, khôi phục focus/scroll và xóa kết quả đã được xử lý; chặn race khi đóng rồi mở ảnh khác rất nhanh. ID có định danh phiên, không chứa tên file, blob URL hoặc Exif; reload không gán nhầm kết quả mới vào history entry cũ.
- Preview ảnh gốc chỉ dùng khả năng hiển thị sẵn của trình duyệt, tải lười khi mở ảnh; định dạng không hiển thị được sẽ ẩn preview, không tải thêm bộ giải mã chỉ để có thumbnail. Chú thích phân biệt ảnh gốc với màu/hiệu ứng xuất cuối. Preview Portrait giữ nguyên hình học và logic lấy nét/khẩu độ, không crop/filter.
- `web/styles.css` còn 8 import phẳng; các file nằm đúng cây §7, có định dạng dễ đọc và trách nhiệm riêng. Không tạo file overrides tổng. HTML giữ một khung semantic tĩnh; không thêm fetch fragment hay công cụ build/framework.
- Module điều hướng mới: `web/src/ui/shell/app-shell.js`. Pipeline xử lý ảnh không thay đổi thuật toán; `file-processor.js` chỉ truyền thêm File đầu vào cho preview UI.
- SW cache tăng `v152`; cả 8 CSS và shell module có trong boot/offline cache. Release builder tiếp tục gắn phiên bản cho URL CSS import.

### Kiểm chứng đã thực hiện

- 37 bài test nhẹ đạt: shell (7), application, AI controls, Standard/Palette, lifecycle/cancel, module paths, CSS imports và release versioning. Không chạy inference AI hoặc encode hàng loạt.
- `check-i18n.mjs` đạt: 155 chuỗi mỗi ngôn ngữ VI/EN/ZH. `check-pwa.mjs` đạt.
- Mở app thật trong trình duyệt local: Process/History, Settings, VI/EN/ZH, master AI và radio model, đóng sheet và khôi phục focus; không có console error/warning trong lượt kiểm tra khởi động.
- Harness riêng `tests/web/serve-ui-fixture.mjs` dùng shell/result-view thật với kết quả giả lập, không tải model/encoder, không nằm trong bản publish. Đã kiểm tra đổi output, pending khóa export, mở/đóng và Back/Forward.
- Các mốc 320×568, 390×844, 430×932, 844×390 và 1280×800 không tràn ngang ở khung chính. Sheet dark mode với chữ 200% tại 320px cuộn được, model đổi sang hàng dọc và không tràn ngang. Đây là phóng cỡ chữ trong trình duyệt, chưa thay thế kiểm tra browser zoom/Dynamic Type và VoiceOver thật.
- Không sửa `facts.md`; không commit, merge hoặc push.

### Còn chờ nghiệm thu / hoàn thiện Phase 3

- iPhone Safari và Home Screen: safe-area/home indicator, bàn phím, xoay màn hình, VoiceOver và cỡ chữ hệ thống; kiểm tra icon/splash trên thiết bị thật.
- 3 ảnh HEIC thực tế: đổi tab khi queue chạy, mở ảnh Ready khác, chỉnh focus/ƒ rồi Share/Download và mở lại trong Photos; kiểm tra HDR/Portrait/Live Photo. Trong lượt UI này chỉ kiểm thử state/identity, không tuyên bố đã kiểm chứng lại chất lượng ảnh đầu ra.
- Bảng chia sẻ iOS: dismiss không báo saved, Share Image đúng ảnh/đúng phiên bản; ZIP Live Photo giữ nhãn riêng.
- Thử cold/airplane-mode warm start thực tế. Hiện đã kiểm tra đường dẫn offline và release URL, chưa mô phỏng tắt mạng của thiết bị.
- Thumbnail History độ phân giải thấp và vòng tiến trình cùng hình học giữa determinate/indeterminate còn cần tối ưu; hiện dùng biểu tượng trạng thái và phần trăm stage chính xác sẵn có, không dựng progress giả. Không giải mã đồng loạt ảnh gốc chỉ để làm thumbnail.

## 14. Điều chỉnh theo phản hồi mobile và đối chiếu iOS 26/27

- Menu Process/History là capsule nổi trên cả mobile, icon + chữ nằm cạnh nhau theo ảnh tham khảo của người dùng. Chừa lề hai bên và safe area đáy, không còn nền tab kéo sát mép màn hình. Selected state vẫn nhìn rõ và hai destination không đổi.
- Bỏ block heading “Xử lý / Ảnh của bạn luôn ở trên thiết bị.” ở Process; giữ tên truy cập được dịch cho region. Không xóa thông tin riêng tư trong Help hoặc thông báo cần thiết của kết quả.
- Model trở lại thanh kéo ba nấc cũ: Lite/Standard/Pro, tên mức phía trên, dấu mốc và núm tròn; vùng tương tác cao 44px. Không dùng input ẩn hoặc ba radio song song.
- Khôi phục xanh cũ `#0894ff` qua token chung, bỏ accent tím-xanh mới. Chữ trên nền xanh dùng màu tương phản; chữ link/selection có biến thể xanh dễ đọc ở light/dark.
- Ẩn toàn bộ scrollbar bằng CSS chuẩn và WebKit pseudo-element. Không tắt overflow auto, touch/wheel hoặc bàn phím; sheet vẫn cuộn khi màn thấp/chữ lớn.
- Nhãn master: “Cải thiện ảnh thông minh” / “Smart Enhance photo” / “增强照片”. Bootstrap và app dùng chung các nhãn này, không hiện “with AI/bằng AI/使用 AI” trong lúc tải rồi mới đổi.
- SW lên `v153`; không thay xử lý HEIC, HDR, Portrait, model inference hoặc export.

### Nguồn và cách áp dụng

Ưu tiên [Apple Design](https://developer.apple.com/design/), [HIG Materials](https://developer.apple.com/design/human-interface-guidelines/materials), [Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars), [Sliders](https://developer.apple.com/design/human-interface-guidelines/sliders) và [Get to know the new design system](https://developer.apple.com/videos/play/wwdc2025/356/).

Áp dụng: lớp điều hướng nổi tách khỏi nội dung; capsule có lề và hình học lồng nhau; vật liệu nhẹ, đủ đục để đọc chữ; chỉ dùng kính tại navigation, không phủ lên ảnh hoặc mọi card. Có fallback nền đặc khi không hỗ trợ backdrop-filter, giảm trong suốt, tăng tương phản và forced-colors. Không thêm hiệu ứng khúc xạ, animation kính liên tục hoặc thư viện mới.

Đã tham khảo README và ghi chú thay đổi của [ios27-design-system](https://github.com/seunghan91/ios27-design-system). Đây là triển khai web độc lập, không phải SDK/HIG của Apple; chính repo cũng ghi blur là xấp xỉ và việc đối chiếu bộ kit chỉ hoàn tất một phần. Không cài package hoặc chép toàn bộ token của repo vào Stylio. Thông số CSS ở đây là lựa chọn triển khai của Stylio, không tuyên bố pixel-perfect hoặc tương đương Liquid Glass native.

### Kiểm chứng cập nhật

- Trình duyệt mobile 390px: không còn heading dư; menu nổi cách mép; nhãn master gọn trong một dòng.
- 320×568: không tràn ngang; AI sheet có nội dung dài vẫn cuộn được khi scrollbar đã ẩn.
- Thanh kéo đã thử Home → Lite, ArrowRight → Standard, End → Pro; nhãn, aria-valuetext, vị trí núm và giá trị xử lý đồng bộ.
- 40 test tự động đạt, gồm capsule nổi, scrollbar không khóa cuộn, xanh cũ và ba mức model; PWA/i18n đạt, không có console error trong lượt kiểm tra. Chưa kiểm chứng Liquid Glass/safe-area bằng iPhone thật.

## 15. Bàn giao đang thực hiện — 2026-10-14

Đây là điểm tiếp tục cho agent sau. Các mục §13–14 là lịch sử lần triển khai trước; nếu mâu thuẫn, ưu tiên yêu cầu và trạng thái trong mục này.

### Yêu cầu mới nhất đã chốt

- Lấy `ref/ionic-theme-ios27` làm mẫu chính cho web, không chuyển framework sang Ionic. `ref/ios27-design-system` chỉ bổ sung; đã đọc docs, demo và skill `skills/ios27-design/SKILL.md` cùng các reference về tokens, components, layouts, glass legibility, accessibility. Checkout Ionic không có SKILL.md tìm thấy, nên dùng README và SCSS trực tiếp.
- 4 destination thật: Process / History / Guide / Settings. Guide dùng nội dung Help sẵn có, không tạo tab rỗng. Settings là màn hình thường, không dialog. AI Settings vẫn là sheet chỉnh nhanh.
- Search là nút tròn tách bên phải. Bấm để chuyển thanh đáy sang ô tìm lịch sử, có nhấn nhẹ, mở/đóng và selected pill chuyển động; reduced-motion tắt các chuyển động này.
- Model phải giống mẫu OpenAI người dùng gửi: capsule dày, phần xanh tới núm tròn trắng; tên mức nằm trên thanh. Nhãn Model và mô tả giữ ở cột trái, thanh ở cột phải, không đẩy mô tả thành hàng cuối toàn chiều rộng. Chỉ reflow khi không đủ chỗ/chữ lớn.
- Xanh cũ `#0894ff`; ẩn scrollbar nhưng vẫn cuộn bình thường. Không sửa thuật toán HDR, Portrait, AI inference hoặc export.

### Đã triển khai trong working tree (chưa commit/push)

- HTML có 4 region và một nav 4 nút, Search action riêng. Header không còn Settings. Help chuyển sang Guide; version/license/cache/language nằm ở Settings.
- `web/src/ui/shell/app-shell.js`: điều hướng 4 màn, vị trí cuộn riêng, Back/Forward; tìm kiếm tại máy trong tên/trạng thái kết quả của phiên, hỗ trợ tiếng Việt không dấu, clear/close/empty/count, focus và Escape. Không index hoặc tải ảnh để tìm kiếm.
- AI summary dùng grid 3 cột, tâm dọc label/switch/nút tùy chỉnh trùng nhau ở 390px.
- Semantic tokens light/dark, grouped cards, switch capsule, kính viền sáng/tối và fallback. Kính chỉ ở chrome, không filter ảnh; không lồng backdrop filter, không shader/animation liên tục.
- Thêm `web/styles/components/materials.css` và `navigation-effects.css`, entry CSS có 10 import phẳng. Có thông báo MIT của Ionic tại `web/THIRD_PARTY_NOTICES.txt`, link trong Settings, đã đưa vào offline assets.
- Model đã đổi từ track mảnh/núm capsule sang track dày/núm tròn theo phản hồi mới nhất. JS vị trí núm 20px / 50% / 100%-20px đồng bộ với native range thumb 40px. Giữ 3 mức và persistence cũ.
- Dock laptop đã nới tới 36rem và nhãn nowrap để Hướng dẫn không bị xuống dòng. Mobile vẫn icon trên, chữ dưới.
- SW hiện `v156`. Không sửa `facts.md`. Nhánh vẫn `feature/ui-ux-redesign`.

### Kiểm chứng đến thời điểm bàn giao tạm

- 45 test nhẹ đạt trước sửa cuối về Model/laptop; sau sửa đó đã chạy lại 9 test CSS/application đạt. Cần chạy lại bộ 45 sau khi xử lý các mục mở dưới đây.
- PWA check đạt; i18n đạt 162 chuỗi mỗi VI/EN/ZH.
- Browser thật ở 390px: dock 54px, không tràn ngang, AI summary cùng tâm dọc. Model Home / ArrowRight / End đổi Lite / Standard / Pro đúng.
- Browser laptop 1280×800: dock 576×54px, nhãn 4 tab đều một dòng; đã nhìn ảnh model dày, mô tả bên trái.
- UI fixture riêng đã kiểm tra tìm kiếm 2 → 1 kết quả và mở đúng File; preview contain, toolbar có kính, không filter ảnh. Dark mode/chữ 200% tại 320px: AI sheet cuộn được, không tràn ngang, model reflow cột đơn.
- Không chạy AI/FFmpeg/encode hay xử lý ảnh hàng loạt. Không cài package mới.

### Đang mở — agent tiếp theo phải biết

1. iPhone 16 Pro: người dùng xác nhận **Home Screen/PWA, lệch ngay lúc mở**, double-tap mới về đúng chỗ, không phải sau bàn phím. Đã thay neo `fixed + bottom` bằng `fixed + top theo 100dvh` và translate theo chính chiều cao dock; giữ công thức safe-area, không hardcode offset iPhone. Không animate thanh tab ngay lúc app khởi động; chỉ animate khi chuyển state tìm kiếm.
2. Thêm `web/src/ui/shell/dock-viewport.js`: chỉ dùng VisualViewport khi ô Search có focus để tránh bàn phím che thanh; xóa inset ngay khi blur, bỏ bù khi pinch zoom. Listener gộp theo một animation frame, không polling hoặc vòng render liên tục. Có kiểm tra resize/scroll, focus/blur, zoom, dispose và trình duyệt không có API; module có trong cả boot/offline cache. Không dùng kích thước VisualViewport có thể stale làm nguồn chiều cao lúc PWA khởi động.
3. **Vẫn chờ iPhone thật xác nhận lỗi PWA đã hết.** Bằng chứng hiện có chỉ là Chromium ở các viewport kiểm thử, không chứng minh WebKit PWA render giống nhau. Nguồn đối chiếu: [WebKit 297779](https://bugs.webkit.org/show_bug.cgi?id=297779), [VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport). Các báo cáo có triệu chứng gần nhau, chưa phải bằng chứng cùng root cause với máy người dùng.
4. 320px đã sửa nhãn Hướng dẫn bằng bỏ khoảng gap/padding thừa, vẫn giữ target ≥44px. Kiểm tra lại: nhãn một dòng 13px, dock 54px và không tràn ngang. 402×874, 430×932, 844×390 và 1280×800 cũng không tràn ngang; dock 54px và bám viewport.
5. Lượt viewport/model: **47 pass, 0 fail**, PWA/i18n đạt. Sau đó thêm hiệu ứng glass hold/drag theo yêu cầu mới ở phần dưới. Ảnh kiểm chứng model/laptop: `stylio-model-capsule-desktop.jpg` trong thư mục visualization của chat. Chưa chạy ảnh thật vì lượt này chỉ thay UI.

### Cập nhật mới nhất: kính nổi khi giữ/kéo tab

Đã đọc `ref/ionic-theme-ios27/screenshots/native-ui-shell-drag/comparison.html`, `src/styles/components/ion-tabs.scss` và `src/sheets-of-glass/index.ts`. Trang so sánh ghi rõ: Web UI dùng hiệu ứng web, còn Native UI Shell đưa cùng nội dung sang UIKit UITabBar để có khúc xạ hệ thống. Stylio làm **bản Web**, không tuyên bố tái tạo khúc xạ UIKit trong PWA.

- Thêm `web/src/ui/shell/tab-glass.js`: pointer press/drag/release/cancel, preview không đổi màn, thả mới commit một destination. Kéo tới mục khác không bị native click vào tab ban đầu điều hướng ngược lại. Cuộn dọc, hủy chạm, thả ngoài hoặc window blur không commit. Keyboard/click vẫn hoạt động; trình duyệt không có Pointer Events dùng button bình thường.
- `navigation-effects.css`: pill mở rộng 1.12 × 1.36 khi giữ, fill trong, viền sáng/tối và bóng nổi; icon/nhãn tăng nhẹ, lúc thả trở về hình học nghỉ. Chia sẻ vật liệu nav hiện có, không lồng backdrop-filter, không shader hoặc animation liên tục. Search cũng có hiệu ứng phồng kính khi nhấn.
- Reduced motion không scale; reduced transparency/increase contrast chuyển nền đặc; forced colors có viền Highlight. Không làm thay đổi neo dock/PWA, vùng chạm hoặc tọa độ preview ảnh.
- Bổ sung UI fixture controls: Hold History lens → Drag lens to Guide → Release tab lens. Đã kiểm tra trình duyệt: giữ History/di chuyển Guide vẫn ở Process; chỉ thả mới chuyển Guide. Đây là pointer giả lập có chủ đích trong harness để chụp trạng thái giữ, không phải đo Safari/iPhone thật. Click tab thật cũng đã kiểm tra.
- Test mới gồm press/settle, drag commit/stale click, cancel/vertical scroll/blur/outside, reduced motion/dispose và CSS fallback. Lượt cuối: **52 pass, 0 fail**, PWA và i18n đạt (162 chuỗi/ngôn ngữ), Git diff check sạch lỗi khoảng trắng. Server fixture đã dừng; server app 8006 giữ nguyên. Chưa commit/push.
- Ảnh trạng thái giữ: `stylio-tab-glass-held.jpg`; model mobile: `stylio-model-capsule-mobile-final.jpg`; shell mobile: `stylio-four-tabs-mobile-final.jpg`, trong thư mục visualization của chat. Vẫn chờ người dùng nghiệm thu độ nổi của kính và lỗi vị trí dock ngay khi mở Home Screen trên iPhone 16 Pro.

### Lệnh kiểm tra nhẹ

Theo RTK.md, mọi lệnh shell bắt đầu bằng `rtk`.

```powershell
rtk proxy node --test tests/web/app-shell.mjs tests/web/application.mjs tests/web/stylesheets.mjs tests/web/ai-feature-controls.mjs tests/web/style-result-metadata.mjs tests/web/module-paths.mjs tests/web/web-release.mjs tests/web/lifecycle.mjs
rtk proxy node tests/web/check-pwa.mjs
rtk proxy node tests/web/check-i18n.mjs
```

Server app: localhost:8006. UI fixture: `tests/web/serve-ui-fixture.mjs`, localhost:8007/__ui-test__/, chỉ dữ liệu giả và module UI thật, không model/encoder. Dừng server fixture sau kiểm tra, không dừng server app của người dùng.

Nguồn ưu tiên: [Apple Materials](https://developer.apple.com/design/human-interface-guidelines/materials), [Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars), [ionic-theme-ios27](https://github.com/rdlabo-dev/ionic-theme-ios27). Thông số kính CSS là xấp xỉ trên web, không chứng nhận tương đương Liquid Glass native.
