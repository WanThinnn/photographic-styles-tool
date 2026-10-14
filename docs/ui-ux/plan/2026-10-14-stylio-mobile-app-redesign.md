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
- Đã triển khai thumbnail History lazy sau bàn giao §15: chỉ decode File khi card vào viewport qua IntersectionObserver, createImageBitmap giới hạn chiều rộng 96px, vẽ JPEG nhỏ 0.7 và giải phóng ImageBitmap; không thay output/preview, không tải decoder phụ, fallback icon nếu trình duyệt không hỗ trợ. Vẫn cần đo bộ nhớ và kiểm chứng HEIC trên Safari/iPhone thật. Vòng tiến trình cùng hình học determinate/indeterminate đã bổ sung: chỉ dùng % stage có thật, hỗ trợ reduced-motion.

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

### Kiểm chứng thumbnail và nghiệm thu thiết bị

Thumbnail History đã triển khai dạng lazy: chỉ tạo JPEG thumbnail rộng 96px khi card vào viewport, giải phóng bitmap sau khi vẽ, tránh thử decode liên tục khi file không hỗ trợ. Regression kiểm tra lazy, thumbnail, mở workspace và cleanup. Service worker hiện lên v158 sau các sửa UI/PWA tiếp theo.

**Chưa nghiệm thu trên iPhone thật:** iPhone Safari/PWA, safe area/Home Screen startup/keyboard/orientation, VoiceOver traversal và announcements, Share sheet Cancel/Save Image, mở output thực trong Photos, HDR/Portrait/Live Photo, offline airplane-mode, hiệu năng HEIC nhiều ảnh. Không đánh dấu các mục này là pass chỉ dựa trên Node tests.

**Checklist thiết bị:** iPhone 16 Pro và ít nhất một iPhone khác; Safari rồi Add to Home Screen; cold/warm launch, landscape, bật Search/keyboard, VoiceOver, Larger Text, Reduce Motion/Transparency, Increase Contrast. Chọn 3 HEIC (SDR, HDR/Portrait, Live Photo + MOV), đổi tab khi queue đang chạy, chỉnh focus/ƒ khi mở kết quả, xác nhận pending khóa Share/Download, Cancel không hiện trạng thái đã lưu, Share lại đúng file sau cập nhật rồi mở trong Photos để xác nhận HDR, depth, Live Photo. Ghi version iOS, screenshot, pass/fail từng bước trước khi đóng issue.

### Cập nhật theo ảnh kiểm chứng iPhone/PWA mới nhất

- Người dùng xác nhận dock PWA vẫn lệch lúc cold launch và chỉ về đúng sau double-tap. Phương án `top + 100dvh` vì vậy không còn được coi là nghiệm thu. Standalone hiện override sang `fixed + bottom` với `safe-area-inset-bottom`; khi Search mở, `dock-viewport.js` chỉ cộng phần keyboard offset từ VisualViewport. Safari thường vẫn giữ cơ chế top/dvh hiện tại.
- Hero `A new mood.` không còn bị ẩn sau khi app từng xử lý ảnh. Intro căn giữa; lede VI/EN/ZH có ngắt dòng semantic bằng `<br>` và line-height thoáng như giao diện cũ.
- Badge số History đổi sang badge xanh nhỏ, neo theo tâm icon thay vì góc phải của toàn button.
- Nút đóng AI Settings và Photo workspace dùng SVG X 22px trong hit target 44×44; header grid đặt explicit cột/hàng để tránh lệch optical của glyph `×`.
- Aperture preview đổi sang hình học giống Photos: vạch vàng đứng cố định ở tâm, ruler tick trượt ngang bên dưới theo giá trị hiện tại; chấm xám đi cùng ruler đánh dấu khẩu độ khởi tạo mặc định. Native range vẫn giữ interaction/keyboard/AT; reduced-motion tắt transition ruler.
- Các thay đổi trên chỉ thuộc presentation/preview; không sửa HDR, depth metadata, Portrait export hoặc bokeh renderer.

**Chờ người dùng kiểm chứng lại trên iPhone:** cold launch PWA không cần double-tap; dock đúng safe area ở portrait/landscape; Search keyboard không che dock; AI/Photo X cân; History badge; aperture f/2.8 và f/8 giữ vạch vàng giữa màn hình trong khi ticks và chấm init chạy qua.
### Settings và floating action bar theo iOS 26/27

- Đối chiếu trực tiếp `ref/ionic-theme-ios27`: settings demo dùng GitHub icon-only ở toolbar phải và grouped inset rows; ion-button dùng glass control material với rim/pressed expansion. Stylio giữ Web UI, không chuyển Ionic.
- Photo workspace action bar không còn dính sát đáy/full-width: Share/Download nằm trong capsule glass nổi, có safe-area bottom gap, bo 28px, shared glass material, primary/secondary action tách rõ; không lồng thêm backdrop-filter trong từng nút.
- Settings được mở rộng thành grouped layout: App language dạng iOS navigation row (globe, value, chevron), Appearance Light/System/Dark, Processing mock rows cho default save action / keep screen awake / prefer original format, On this device, About.
- Appearance hiện đã hoạt động thật và persist bằng `stylio-theme-v1`: Light/Dark đặt `data-theme`, System trả về media preference của thiết bị. Các processing preference mới vẫn chỉ là presentation UI. Language, Clear cache và link hiện có vẫn hoạt động.
- Góc phải tiêu đề Settings có GitHub glass button mở `https://github.com/WanThinnn/stylio`; repository đã được xác nhận qua GitHub connector là public repo `WanThinnn/stylio`.
- About có version, Source code và Open-source licenses. Footer rút gọn để tránh lặp quá nhiều link.
- I18n VI/EN/ZH bổ sung đủ copy mới; SW hiện v160 để PWA nhận layout mới.
### Cập nhật theo lượt iPhone warm-reopen

- Tỉ lệ bottom navigation mobile tăng từ 54px lên 60px, nhãn mobile tăng nhẹ lên 11px và dock standalone hạ thấp thêm khoảng 10px so với full safe-area inset để gần hình học tab bar iOS hơn.
- Lỗi PWA được thu hẹp: lần đầu sau Add to Home Screen đúng, các lần reopen mới nhảy dock. `dock-viewport.js` giờ xóa mọi inline viewport/keyboard offset ở `pagehide`, `pageshow`, orientation và visibility restore; chỉ nâng dock sau khi Search đang mở + input có focus + iOS phát một VisualViewport resize thật với keyboard delta hợp lệ (80–420px). Focus hoặc viewport stale sau resume không còn đủ điều kiện để dịch dock.
- First-run photo format notice đổi thành một grouped secondary card bo 18px, bỏ border-bottom riêng nên không còn hai đường separator liên tiếp trước Smart Enhance.
- Clear cache đổi thành một cell hai dòng: icon và stack title/description cùng grid, tránh baseline lệch.
- Appearance Light/System/Dark đã bật interaction + persistence; inline bootstrap áp theme trước CSS để giảm flash khi mở PWA.
- Hero mobile tăng nhẹ từ 24px lên 26px.
- Header chung có thêm nút Help/Guide glass icon-only ở góc phải, theo pattern toolbar action của iOS 27; bấm mở Guide và bottom tab state đồng bộ.
- Regression mới kiểm tra warm PWA restore stale offsets, keyboard resize thật, theme persistence markup, notice một card, Clear-cache stack và header Guide.

**Vẫn cần iPhone xác nhận:** đóng PWA hoàn toàn rồi mở lại 2–3 lần liên tiếp; dock phải giữ cùng vị trí ở mọi lần. Sau đó mở Search để xác nhận keyboard vẫn đẩy dock lên đúng và hạ lại khi đóng bàn phím.
### Cập nhật focus surfaces và warm-reopen compositor

- Search input và dialog sheet không còn dùng global blue `:focus-visible` outline. Search vẫn giữ neutral glass inset khi keyboard focus; global focus ring vẫn tồn tại cho các control khác để không xóa accessibility focus toàn app.
- Warm-reopen PWA được xử lý thêm ở compositor layer: khi standalone bind/pageshow/visibility resume, dock tạm ẩn trong hai animation frames, page được nudge 1px rồi trả về đúng `scrollX/scrollY`, sau đó đọc geometry và hiện dock lại. Đây mô phỏng chính thao tác scroll nhẹ mà iPhone hiện cần để WebKit recompute fixed/backdrop-filter layer.
- `history.scrollRestoration` đặt `manual` khi trình duyệt hỗ trợ để tránh browser tự restore scroll cạnh tranh với app shell.
- Keyboard path vẫn riêng: dock chỉ nhận VisualViewport offset sau Search focus + resize hợp lệ; recalibration bị hủy ngay khi Search focus.
- SW tăng v161. Regression mới xác nhận scroll nudge trả đúng vị trí cũ, class recalibration được gỡ, keyboard vẫn nâng dock, Search/Sheet không còn blue focus frame.

**Thiết bị cần xác nhận lại:** mở PWA từ lần 2 trở đi mà không chạm/scroll; dock phải xuất hiện đúng vị trí ngay sau launch. Search focus không được có khung xanh; AI Settings surface không được có khung xanh, nhưng nút X vẫn có keyboard focus indication khi dùng bàn phím.
### Cập nhật Settings polish sau kiểm chứng iPhone

- Header chung chỉ hiện Help/Guide ở Process/History/Guide; khi vào Settings, Help được ẩn để góc phải chỉ còn GitHub action của Settings, tránh hai icon tròn xếp dọc.
- Bottom tab idle color đổi từ `--muted` sang `--nav-idle` đậm hơn (`#3a3a3c` light, `#d1d1d6` dark), giữ selected state màu accent và Search icon dùng foreground hiện có.
- Appearance Light/System/Dark có transition ngắn 200–240ms cho background/color/border/shadow khi người dùng bấm; reduced-motion không chạy transition. Persist/theme bootstrap giữ nguyên.
- Language select bỏ browser-blue focus ring cả ở select và surrounding row; keyboard focus chỉ còn neutral inset 0.5px theo `--line`, pointer focus không vẽ ring.
- SW tăng v162. Regression xác nhận Settings ẩn header Help, idle nav dùng token đậm hơn, theme transition tồn tại và Language không còn dùng `--focus-ring`.
### Cập nhật transition header, app refresh và version 1.0.0

- Khi chuyển vào Settings, Help action ở header không biến mất tức thì: nó trượt xuống khoảng 68px, thu nhỏ/xoay nhẹ rồi fade; GitHub action trong Settings chạy animation ngược từ vị trí phía trên xuống vị trí cuối, tạo cảm giác một control đổi vai trò thay vì hai icon bật/tắt cứng. Reduced Motion vẫn tắt animation qua rule toàn cục.
- Thêm `Update Stylio` trong On this device. Action gọi `ServiceWorkerRegistration.update()`, xóa các app-shell cache có prefix `photographic-style-port-`, fetch lại `index.html` với `cache: reload`, rồi reload. Model cache riêng không bị xóa. Có status i18n VI/EN/ZH và fallback lỗi mạng.
- Tất cả current-version identifiers chuyển lên `1.0.0`: Python package metadata, uv lock project entry, Python `VERSION`, Web `VERSION`, Settings version, README EN/ZH và facts current coverage. Các dòng lịch sử/changelog `v0.6.2` được giữ nguyên vì mô tả mốc phát hành cũ, không phải current version.
- Warm-reopen PWA nudge giờ không chỉ chạy một lần lúc bind. Standalone launch/resume pulse ngay và retry sau 90ms, 280ms và 650ms; mỗi pulse ẩn dock, scroll 1px, trả lại đúng vị trí cũ, ép geometry read rồi hiện lại. Retry bị hủy khi Search focus/pagehide để không can thiệp keyboard path.
- Service Worker app-shell cache tăng v163.
### Cập nhật sau đối chiếu `ref/ionic-theme-ios27/docs` và kiểm chứng iPhone lần 4

- Đã đọc/đối chiếu `animation.md`, `features.md`, `special-markup.md`, `native-ui-shell.md` và `feedback.md`. Các điểm áp dụng cho Web shell của Stylio: gesture effect chỉ là presentation layer; navigation thật vẫn do app sở hữu; 44px glass controls; Reduced Motion; tab bar nằm trong safe area; drag không được ép layout mỗi pointer event; native UIKit shell chỉ áp dụng cho Capacitor nên Stylio Web/PWA giữ CSS fallback.
- Tab glass được tối ưu riêng cho WebKit iOS: geometry của bar/tabs chỉ đo một lần khi pointer-down, pointer-move được coalesce theo `requestAnimationFrame`, chỉ đổi preview class khi target tab thay đổi, lens chuyển bằng compositor `translate3d` thay vì animate `left`, và coarse-pointer drag giảm shadow cost. `contain: paint` + isolated compositing layer tránh repaint lan sang cả dock. Đây là khác biệt chính so với Windows trước đó vốn chịu layout/backdrop compositing nhẹ hơn.
- Hero `A new mood.` tăng lên 36px desktop / 32px mobile.
- AI Settings có `sheet-out` animation khi đóng bằng X, backdrop hoặc Escape; Reduced Motion đóng ngay.
- Photo detail mobile tăng safe-area top và header trở thành translucent blur 22px/saturate để nội dung cuộn phía sau được xử lý giống iOS scroll-edge chrome, tránh cảm giác header/dynamic island dính trực tiếp vào nội dung.
- Aperture ruler không còn phụ thuộc native invisible range cho touch drag: track tự xử lý horizontal Pointer Events, drag trái/phải đổi từng aperture theo tick spacing, tap vẫn chọn tick, vertical pan vẫn được nhường cho scroll, input range tiếp tục giữ keyboard/AT semantics.
- PWA warm-reopen fix cũ bằng auto-scroll nudge được bỏ vì kiểm chứng iPhone cho thấy không ổn định. Kiến trúc standalone đổi hẳn: `.app-dock` được đưa ra ngoài `<main>`, `body` khóa scroll, `<main>` trở thành internal scroll container, và dock dùng `position:absolute` ở viewport shell thay cho `position:fixed + backdrop-filter`. Như vậy WebKit không còn phải restore fixed composited glass layer sau lần mở app thứ 2. `dock-viewport.js` giờ chỉ xử lý keyboard offset, không tự scroll trang nữa.
- Top-right Help/GitHub giờ là cùng một glass control với hai symbol chồng nhau. Guide/Process ↔ Settings crossfade + translate/rotate hai chiều trong cùng control nên cả Guide → Settings và Settings → Guide đều có transition; ở Settings control mở GitHub.
- Service Worker app-shell cache tăng v164.

**Cần iPhone test lại:** (1) giữ và kéo lens qua 4 tab liên tục; (2) đóng/mở PWA ít nhất 3 lần, không chạm/scroll trước khi nhìn dock; (3) kéo aperture liên tục f/1.4 → f/16 → Off; (4) mở/đóng AI Settings; (5) cuộn Photo detail dưới Dynamic Island.
### Hotfix regression toolbar sau thay đổi standalone shell

- Revert kiến trúc `body overflow:hidden + main internal scroll + dock absolute` vì kiểm chứng thực tế cho thấy dock bị treo/sai hành vi.
- `.app-dock` được đưa lại vào trong `<main>` và trở về `position: fixed`.
- Riêng standalone PWA không dùng `bottom` nữa; dock neo bằng `top: calc(var(--dock-viewport-bottom,100svh) - safe-area)` + `translateY(-100%)`. `100svh` ổn định hơn dynamic viewport khi warm reopen, còn VisualViewport chỉ ghi đè `--dock-viewport-bottom` lúc keyboard Search thực sự làm viewport co lại.
- Khôi phục document scroll bình thường; bỏ toàn bộ internal-scroll abstraction trong app-shell.
- Service Worker app-shell cache tăng v165.

### Cập nhật theo ảnh iPhone 4:20–4:24

- Hạ nội dung chính thêm xuống khỏi status-bar/Dynamic Island: mobile main dùng `safe-area-inset-top + 24px` (desktop +18px). Photo detail mobile cũng tăng top inset lên `+20px`; bỏ backdrop blur ở header Photo để tránh toàn bộ chrome phía trên bị mờ như ảnh kiểm chứng.
- Photo detail mở từ Activity hoặc History có `photo-workspace-in` (fade + translate + scale nhẹ, 220ms spring). Dialog tự focus vào chính surface thay vì nút X để tránh blue focus ring tức thời; Reduced Motion tắt animation.
- Selected tab lens đổi hình học: resting lens dùng `translate3d(--lens-offset / tab-index)` với cùng left/width như 4 button; khi drag, offset lấy trực tiếp từ rect thật của tab thay vì tính tâm 1/4. Điều này loại bỏ sai lệch kính so với icon/text trên iOS và vẫn giữ frame-coalesced drag.
- Aperture bỏ viền xanh WebKit: invisible range tự bỏ outline; track keyboard focus chỉ giữ inset neutral 0.5px theo `--line`.
- Service Worker app-shell cache tăng v166.
### Cập nhật AI discovery + dock viewport v167

- Bỏ viền tím cứng quanh AI Settings khi discovery hint còn hiện. First-use cue chuyển thành nudge/scale nhẹ 2 nhịp bằng glass shadow trung tính; `More AI features` vẫn giữ nguyên và Reduced Motion tắt animation.
- AI Settings dialog thêm `tabindex=-1` và sau `showModal()` focus vào chính dialog surface, không còn auto-focus nút X gây blue focus ring trên iOS.
- Dock không còn neo trực tiếp vào `100svh`, vì ảnh iPhone cho thấy small viewport unit thấp hơn viewport PWA thực tế và làm toolbar nằm quá cao. CSS dùng `--dock-shell-height` với fallback `100lvh`; standalone JS đo `max(window.innerHeight, documentElement.clientHeight)` lúc bind/pageshow/visibility/orientation/resize và retry sau 80/240/520ms. VisualViewport vẫn chỉ override khi Search keyboard thực sự mở.
- Thêm regression test xác nhận standalone dock lấy 844px layout viewport dù VisualViewport đang báo 720px.
- Service Worker app-shell cache tăng v167.
### Settings icon polish v168

- `App language` bỏ icon globe standalone màu đen; dùng lại `settings-leading-icon settings-icon-blue` 30×30 bo góc, cùng hệ icon với Processing/On this device.
- `Appearance` có thêm leading icon theo hướng iOS Settings: ô vuông bo góc tối với glyph nửa sáng/nửa tối, đặt cùng hàng title + description; segmented Light/System/Dark giữ nguyên logic.
- Service Worker app-shell cache tăng v168.
### Dock stability + Appearance icon v169

- Root cause mới của dock được thu hẹp từ ảnh iPhone: Process ngắn (sau Got it) báo viewport thấp hơn, còn Settings hoặc first-run notice dài làm viewport report đúng. `dock-viewport.js` giờ dùng `screen.availHeight/screen.height` làm floor hợp lệ cho standalone iPhone nếu không lệch quá 25% so với `innerHeight`, và shell height chỉ được phép tăng trong cùng orientation; dismiss notice không thể kéo dock lên nữa. Orientation change reset floor và đo lại.
- Appearance icon được chỉnh sát iOS Settings hơn: square 34×34 nền đen/graphite, bo 10px, viền highlight rất nhẹ; glyph là vòng tròn trắng outline với nửa trái trắng, nửa phải để nền đen hiện qua, thay cho circle fill cũ.
- Regression mới mô phỏng Process screen ngắn: `innerHeight/clientHeight=756`, iPhone screen=844 rồi tụt còn 720 sau khi dismiss notice; dock vẫn phải giữ 844px.
- Service Worker app-shell cache tăng v169.
### Native-feel zoom lock v170

- Khóa page zoom cho Web/PWA bằng viewport `minimum-scale=1, maximum-scale=1, user-scalable=no` đồng thời giữ `viewport-fit=cover` cho safe area.
- `html, body` dùng `touch-action: pan-x pan-y`: vẫn cuộn/pan một ngón bình thường nhưng loại pinch-zoom khỏi gesture arbitration; tab glass bỏ `pinch-zoom` và chỉ giữ `pan-y` để drag lens không kích hoạt zoom.
- iOS Safari fallback chặn `gesturestart/gesturechange/gestureend` với non-passive `preventDefault()` vì một số WebKit build vẫn cho pinch dù viewport/CSS đã khóa.
- Mục tiêu là giữ fixed Liquid Glass dock gắn với app shell khi người dùng dùng hai ngón hoặc double-tap, gần hành vi native app hơn. Text sizing/accessibility semantics còn lại giữ nguyên.
- Service Worker app-shell cache tăng v170.
### Details / Guide information-density polish v171

- Đối chiếu thêm `ref/ionic-theme-ios27/docs/animation.md`, `features.md`, `special-markup.md` và `feedback.md`: giữ presentation effects tách khỏi navigation/selection semantics, dùng 44px-class glass controls, disclosure thay vì dồn toàn bộ copy lên màn hình, và tôn trọng Reduced Motion.
- Photo action bar giờ có 2 trạng thái như iOS toolbar: idle compact (`max 440px`, button 42px) và expanded khi pointer/focus (`max 720px`, button 50px). Cuộn Photo detail sẽ collapse bar về compact; ResizeObserver tiếp tục cập nhật `--actions-height` nên content inset thay đổi theo bar thật.
- Photo Details giảm mật độ chữ bằng icon-led rows: Details summary có icon riêng; các note dùng info icon; Camera / Dimensions / File size / Image data / Captured có native-style square icons và separator rows thay cho grid text 2 cột.
- Guide không còn render 5 card dài cùng lúc. 4 nhóm chính chuyển sang `<details>` disclosure cards, mỗi card có colored native-style icon, một summary ngắn và `See more / Show less`; nội dung dài chỉ xuất hiện khi mở card. Có animation reveal nhẹ và Reduced Motion fallback.
- Bổ sung 6 chuỗi i18n cho Guide ở VI/EN/ZH; Service Worker app-shell cache tăng v171.
### Tab glass / badges / AI discovery polish v172

- Tab lens fix: `.app-tabs` no longer uses `contain: paint`, which was clipping the enlarged glass inside the platter. It keeps `overflow: visible` + `contain: layout style`; held lens now uses the reference theme's large scale `1.15 × 1.4`, so the glass can visibly grow beyond the toolbar like the iOS27 reference.
- History count badge is now anchored to a dedicated `tab-icon-wrap`, not the button center. This keeps the badge on the icon's top-right on laptop/iPad horizontal tabs and mobile vertical tabs; badge size/weight was optically rebalanced to 16px / 625.
- Toolbar symbols use heavier SF-Symbol-like weights: idle tab strokes 2.05, selected 2.35, search 2.15, with round caps/joins. This follows Apple's guidance that SF Symbols provide weight/scale variants aligned with text and improves icon legibility/contrast.
- First-use `More AI features` is now a real discovery callout instead of bare copy: compact accent pill, sparkle symbol, up-right direction symbol, pointer tail toward AI Settings, entrance motion, plus the existing settings-button nudge. Reduced Motion disables both animations.
- Service Worker app-shell cache increased to v172.
### Photo Details grouping / dark icon palette / AI discovery v173

- Photo Details được tổ chức lại thành hai cấp rõ ràng: `Processing` và `Photo information`. Summary `Details` dùng icon lớn 34px, group dùng icon 30px, item dùng icon 26px; metadata không còn là một danh sách phẳng.
- Root cause icon dư đã được loại bỏ: `note('')` giờ xóa note/group thay vì tạo placeholder có icon rỗng. Metadata không còn dựng bằng `this.note('', 'metadata')`.
- Phần trên Photo được rút gọn: status `Ready` chỉ còn check indicator + label; mô tả conversion và hướng dẫn `Save Image` được chuyển vào `Details > Processing`. Portrait advice cũng chuyển vào Details thay vì nằm riêng ngoài luồng.
- Dark mode icon palette được semantic hóa ở tokens: Settings/Guide tile gradients, Photo Details accent colors và Appearance icon đều có light/dark variants. Appearance icon đảo sang nền sáng/glyph tối ở Dark Mode giống hệ Settings iOS; toolbar/currentColor icons tiếp tục tự đổi theo foreground.
- `More AI features` quay về hướng compact/glass: pill trong suốt, text gradient brand, sparkle + arrow nhỏ; mobile ẩn arrow để tiết kiệm không gian. Animation dùng một lần spring overshoot/settle và settings button scale 1.12→.98→1, bám pattern press-spring của reference theme và tắt hoàn toàn với Reduced Motion.
- Đối chiếu thêm `ionic-theme-ios27` Animation/Features/Special Markup: effect chỉ là presentation layer, press state dùng spring/overshoot, dark mode cần theme variables cho từng component. Apple HIG cũng nhấn mạnh press state rõ ràng và symbol/icon phải thích nghi appearance/contrast.
- Service Worker app-shell cache tăng v173.
### Mobile AI ring / compact format notice / dark internal icons v174

- Mobile first-use AI discovery no longer renders the `More AI features` pill/text. The hidden discovery state now drives a 2px conic-gradient ring around the 44px AI Settings glass button; the ring rotates/settles once and remains visible until the settings sheet is opened. Reduced Motion keeps the ring static. Desktop/tablet retain the compact discovery pill.
- First-run `Keep the original photo format` notice is now a three-column inset row (info icon / copy / Got it) instead of a second button row. Padding, radius, typography and copy spacing are reduced while the `Got it` hit target remains 44px.
- Dark appearance inside the app now follows an iOS-style dark-icon material: Settings and Guide tiles use a graphite/black tile with bright semantic glyph colours instead of merely darker coloured gradients. The Choose Photos tile uses the same semantic icon material.
- The in-app Stylio header icon now has a dedicated graphite dark appearance (`photographic-styles-dark.svg`) and cross-fades with manual/system theme changes. This asset is app-shell-only.
- PWA/Home Screen install icons are intentionally unchanged (`apple-touch-icon-v2.png`, `icon-192-v2.png`, `icon-512-v2.png`, maskable v2). No dark install icon is added; iOS remains responsible for Home Screen appearance.
- Service Worker app-shell cache increases to v174 and precaches the internal dark header SVG.
### Toolbar viewport / lens alignment / dark glass polish v175

- Fixed the Process/History dock clipping regression by removing `screen.availHeight`/monotonic shell-floor anchoring from `dock-viewport.js`. Standalone placement now follows the current layout viewport (`innerHeight` / `documentElement.clientHeight`) and retries after relaunch; a physical screen height can no longer push the dock below the visible app area.
- Resting tab lens alignment now uses the selected button's measured pixel offset (`--tab-rest-offset`) instead of relying only on percentage translation. It resyncs on destination changes and window resize, eliminating the cumulative right-shift seen on History / Guide / Settings while preserving Process at zero offset.
- Liquid Glass selection motion is slowed slightly: transform 280→360ms and release material lifetime 220→360ms. Direct drag motion remains frame-coalesced and responsive.
- Dark toolbar selection now follows the Phone/iOS reference more closely: the resting selected lens uses a translucent black fill (`#0000005c`) and held/releasing glass uses a darker active fill (`#08080bd9`) instead of the previous light selection fill.
- Appearance icon in Dark Mode now keeps the graphite/black icon tile with a white split-circle glyph instead of inverting to a white tile.
- Service Worker app-shell cache increased to v175.
### Smart Enhance spacing / Photo close motion / Portrait control strip v176

- Smart Enhance summary now uses a content-sized label column followed immediately by the 63px switch and 44px AI Settings button, removing the large empty gap between label and switch.
- App header branding is slightly larger: Stylio logo 32→36px and title 1.1875→1.25rem / 700 for stronger native visual weight.
- Photo workspace close now mirrors the sheet presentation model: direct close/cancel adds `is-closing`, plays the existing `photo-workspace-out` animation for 180ms, then restores the originating result and navigates Back. Reduced Motion and internal history restoration close immediately.
- Removed the empty visual gap between the collapsed Details inspector and Portrait preview by reducing `.ai-details` top inset and offsetting the grid gap when it follows `.result-details`.
- Portrait preview now has an iOS-style three-part control strip: left aperture/lighting info capsule (`ƒ` + lighting symbol) reveals guidance to finish those edits in Photos; centre Portrait toggle uses yellow/orange active material and neutral outlined inactive material; right reset remains a circular action.
- Portrait toggle controls the local preview state while keeping the saved HEIC contract unchanged (editable depth, Portrait starts off in Photos). Turning preview off disables aperture interaction; turning it back on restores the last selected aperture. Reset restores f/4.5, focus centre and Portrait preview on.
- Added VI/EN/ZH accessibility/help copy for aperture/lighting info and Portrait toggle states.
- Service Worker app-shell cache increased to v176.
### Guide disclosure / slower tab travel / AI trailing action / total progress v177

- Expanded Guide cards now use full inset width: disclosure body text starts at the card's normal 16px inset instead of remaining indented under the leading icon.
- Smart Enhance keeps its switch close to the label while the AI Settings glass button is pinned to the trailing edge; long localized labels may shrink/wrap without pulling the Settings action inward.
- Liquid Glass tab travel on pointer press is slowed from 80ms originally / 280ms interim to 320ms spring motion, so Process → History / Guide / Settings visibly glides instead of snapping.
- Activity progress rings now render the numeric percentage in the centre. The shell prefers an explicit overall pipeline percentage and falls back to legacy stage-local percentages only where an overall milestone is not supplied.
- File processing now reports coarse overall milestones across read/decode, raster or HEIC preparation, optional AI detail/style work, Texture/Soft Skin/metadata, and Portrait. Portrait depth uses 90–100% milestones, so long GPU inference no longer leaves the activity ring numerically blank.
- Service Worker app-shell cache increased to v177.

### Lệnh kiểm tra nhẹ

Theo RTK.md, mọi lệnh shell bắt đầu bằng `rtk`.

```powershell
rtk proxy node --test tests/web/app-shell.mjs tests/web/application.mjs tests/web/stylesheets.mjs tests/web/ai-feature-controls.mjs tests/web/style-result-metadata.mjs tests/web/module-paths.mjs tests/web/web-release.mjs tests/web/lifecycle.mjs
rtk proxy node tests/web/check-pwa.mjs
rtk proxy node tests/web/check-i18n.mjs
```

Server app: localhost:8006. UI fixture: `tests/web/serve-ui-fixture.mjs`, localhost:8007/__ui-test__/, chỉ dữ liệu giả và module UI thật, không model/encoder. Dừng server fixture sau kiểm tra, không dừng server app của người dùng.

Nguồn ưu tiên: [Apple Materials](https://developer.apple.com/design/human-interface-guidelines/materials), [Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars), [ionic-theme-ios27](https://github.com/rdlabo-dev/ionic-theme-ios27). Thông số kính CSS là xấp xỉ trên web, không chứng nhận tương đương Liquid Glass native.
