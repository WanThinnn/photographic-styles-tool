# Stylio — rà soát bảo mật ngày 16/10/2026

## Kết luận và phạm vi

**Đánh giá: cần bổ sung bảo vệ trước khi phân phối rộng.** Chưa thấy luồng chủ
động upload ảnh trong mã web đã đọc. Tuy nhiên, xử lý ảnh local vẫn phụ thuộc
vào độ tin cậy của JavaScript được tải, origin lưu History và các bộ đọc ảnh.
Không có cơ sở để kết luận app bị xâm nhập hoặc ảnh đã bị lấy cắp.

Rà soát bản hiện tại v221, gồm startup, xử lý file/worker, thư viện và model,
History/preview, xóa dữ liệu, service worker, DOM hiển thị tên/metadata, bản
phát hành Pages và server Shortcuts tùy chọn. Đây là review mã và kiểm chứng
giới hạn; không phải kiểm định bảo mật toàn bộ codec/browser hoặc chứng nhận
không có lỗ hổng. Không sửa hành vi app trong đợt review này.

Tài sản cần bảo vệ: ảnh kết quả, preview, tên ảnh, metadata GPS/ngày chụp,
dữ liệu khuôn mặt/depth trong ảnh, tính toàn vẹn bản xuất và tài nguyên máy.
Nguồn có thể không đáng tin: file người dùng nhận từ người khác, CDN/dependency,
trang khác cùng origin, thiết bị LAN và bản cập nhật ứng dụng.

Mức P1: rủi ro cao khi điều kiện nêu rõ xảy ra; P2: cần sửa ở đợt hardening;
P3: cải thiện quyền riêng tư/quy trình. Không phát hiện P0 trong phạm vi này.

## Các phát hiện

### 1. P1 — Decoder CDN được thực thi với quyền của app, thiếu integrity

**Bằng chứng:** [decode.js](../../web/src/media/decode.js#L11) tạo thẻ script
trỏ tới `libheif-js@1.18.2` tại jsDelivr. Có `crossOrigin="anonymous"` nhưng
không có `integrity` hoặc kiểm tra hash trước khi thực thi. Khóa phiên bản trong
URL chưa bảo đảm nội dung phản hồi không bị thay đổi.

Trong browser tạm, thay phản hồi CDN bằng script kiểm chứng vô hại đã đọc được
tên History giả qua chính module History của app. Không gửi dữ liệu ra ngoài.
Phép thử xác nhận quyền của script, **không** chứng minh CDN thực tế bị xâm nhập.
Nếu nội dung đó bị thay thế, script có thể đọc ảnh đã lưu, ảnh người dùng chọn
và thay đổi kết quả xuất.

**Đề xuất:** đóng gói decoder đã xác minh cùng bản phát hành, hoặc SRI với hash
được kiểm tra độc lập và hành vi từ chối khi sai hash. Đưa decoder vào worker
để giảm chặn UI; worker cùng origin vẫn không phải ranh giới bảo mật cho dữ
liệu lưu trữ. Giữ kiểm tra hash hiện có của FFmpeg, DNG và các model.
Thêm kiểm tra tự động rằng phản hồi bị thay đổi không được thực thi.

### 2. P2 — History dùng chung ranh giới origin với các project khác

**Bằng chứng:** [history-store.js](../../web/src/ui/history-store.js#L1) lưu
Blob/File kết quả, preview, thumbnail và tên file vào IndexedDB
`stylio-history-v1`. URL trong README là `https://wanthinnn.github.io/stylio`.
Các project dưới cùng `https://wanthinnn.github.io` chia sẻ origin; đường dẫn
`/stylio` không tách IndexedDB.

Phép thử hai đường dẫn khác nhau trên cùng origin đọc được cùng History giả,
bao gồm nội dung File. Một trang khác origin không tự có quyền này. Rủi ro
xảy ra khi project khác cùng origin chứa mã độc hoặc bị XSS.

**Đề xuất:** triển khai Stylio trên origin riêng chỉ dành cho app; đổi tên DB
không giải quyết ranh giới này. Thông báo rõ History lưu bản kết quả trên máy,
bổ sung lựa chọn không lưu và thời hạn lưu/dung lượng. Lưu ý khi chuyển origin:
History cũ không tự chuyển sang; cần kế hoạch xuất/xóa dữ liệu tại origin cũ.
Không tự thêm đăng nhập chỉ để giải quyết lưu trữ local.

### 3. P2 — Xóa History có thể thất bại nhưng UI đã biến mất

**Bằng chứng:** [history-store.js](../../web/src/ui/history-store.js#L75)
bắt lỗi `remove()`/`clear()` rồi chỉ `console.warn`;
[application.js](../../web/src/app/application.js#L90) gọi clear không chờ
và xóa danh sách khỏi UI. Phép thử transaction lỗi cho thấy `clear()` vẫn
resolve. Vì vậy UI không thể biết dữ liệu đã được xóa thành công hay chưa;
trong trường hợp lỗi, ảnh cũ có thể còn trong DB và xuất hiện lại khi mở app.

**Đề xuất:** trả lỗi/kết quả thành công rõ ràng, chờ transaction hoàn tất rồi
mới xác nhận đã xóa; hiển thị lỗi và cho thử lại. Kiểm thử lỗi storage, nhiều
tab đang mở và reset bị chặn. Phân biệt xóa bản trong app với xóa ảnh đã tải
về Photos/Downloads. Không hứa xóa an toàn từng byte trên bộ nhớ flash.

### 4. P2 — Metadata thiếu giới hạn; file/queue chưa có ngân sách đầu vào

**Bằng chứng cụ thể:** [bplist.js](../../web/src/core/bplist.js#L30) đọc count
do file khai báo rồi lặp theo count, chưa kiểm tra đủ vùng dữ liệu, giới hạn
độ sâu/vòng tham chiếu hay tổng công việc. Mẫu plist lỗi **47 byte** khai báo
ASCII dài 262.144 ký tự được chấp nhận và tạo chuỗi tương ứng, thay vì bị từ
chối. Chỉ chạy mẫu nhỏ có giới hạn; không thử gây hết bộ nhớ.

[heic-worker.js](../../web/src/media/heic-worker.js#L18) đọc cả File vào bộ
nhớ trước khi xác định định dạng;
[application.js](../../web/src/app/application.js#L272) tạo row/preview cho
toàn bộ batch mà chưa giới hạn byte/số file. Raster decode đầy đủ trước khi
giảm kích thước. DNG đã có tile budget và worker đã có timeout — các bảo vệ
này tốt nhưng không thay thế giới hạn đầu vào và metadata.

**Đề xuất:** xác thực offset/count/reference và độ dài trước mỗi vòng lặp/
allocation; giới hạn độ sâu, số object, tổng byte và công việc; phát hiện
cycle. Rà cả bản `raster/bplist.js` để tránh sửa thiếu. Thêm ngân sách theo
file, batch, pixel và preview trước khi bắt đầu đọc/giải mã; duy trì hỗ trợ
ProRAW hợp lệ bằng giới hạn có đo đạc. Bổ sung corpus lỗi và fuzz test có
timeout/memory cap. Chưa có bằng chứng thực thi mã tùy ý từ lỗi này.

### 5. P2 — Chưa có chính sách bảo mật trang được quản lý trong repo

**Bằng chứng:** HTML không khai báo CSP. Hàm
[isolated()](../../web/sw.js#L256) bổ sung COOP/COEP phục vụ isolation, không
thiết lập CSP. Workflow Pages không có bước xác minh chính sách CSP,
Permissions-Policy hay chống framing. COOP/COEP không thay thế CSP.

Đọc HEAD của URL công khai bị trả 403 trong môi trường kiểm tra, nên **chưa
xác nhận header thực tế của bản đang host**. Phát hiện này là thiếu chính sách
và kiểm tra do dự án kiểm soát, không phải khẳng định host thiếu mọi header.

**Đề xuất:** CSP giới hạn script/connection/worker theo nhu cầu thật; chặn
object, base URL và form không dùng; cung cấp `frame-ancestors` qua HTTP header.
Cần cho phép iframe xử lý cùng origin hiện có, thay vì chặn toàn bộ iframe.
Giữ Blob worker, WebAssembly và luồng share/download hoạt động; thử trước ở
chế độ Report-Only trên host hỗ trợ, test Safari iPhone lẫn offline/cold boot.
Dùng hash hoặc chuyển bootstrap inline ra file, tránh mở rộng `unsafe-eval`
cho toàn app. Thêm Referrer-Policy, nosniff và giới hạn quyền camera/micro/
geolocation không sử dụng. Chính sách cần có hiệu lực ngay lần mở đầu, không
chỉ sau khi service worker đã kiểm soát trang.

### 6. P3 — Visit counter bật mặc định; thông tin privacy cần đầy đủ hơn

**Bằng chứng:** [countVisit()](../../web/src/app/application.js#L306) gửi một
GET tới `abacus.jasoncameron.dev` mỗi session. Không có ảnh/tên ảnh trong URL
đó, nhưng bên nhận vẫn nhận IP và thông tin HTTP thông thường. Decoder/model
cũng có các kết nối tải tài nguyên ngoài. Mô tả “không gửi ảnh” phù hợp với
mã đã đọc, nhưng không nên diễn đạt thành “không kết nối bên ngoài”.

**Đề xuất:** bỏ counter hoặc cho người dùng chủ động bật; mô tả ngắn trong
Privacy về ảnh local, History, các host tải model và cách xóa dữ liệu. Nếu
cần số lượt, cân nhắc thống kê host tổng hợp thay vì thêm ping từ browser.
Thêm kiểm tra mạng bằng ảnh giả để chặn photo bytes/tên ảnh trong outbound
request, và một chế độ chỉ dùng tài nguyên đã tải nếu phù hợp sản phẩm.

### 7. P1 có điều kiện — Server Shortcuts tin mọi client LAN

**Chỉ áp dụng khi chạy `shortcut-server/server.py`; bản PWA không tự mở server.**

**Bằng chứng:** server bind `0.0.0.0`, HTTP không TLS;
[_guard()](../../shortcut-server/server.py#L346) chỉ kiểm tra IP private/local,
không pairing token, Host allowlist hay Origin guard. `/api/status` trả tên
job/client và đường dẫn công cụ. Probe trên loopback với Host/Origin lạ vẫn
đọc status 200; POST không có ảnh đi tiếp đến kiểm tra body và trả 411.
Phép thử không chứng minh mọi browser có thể đọc LAN: CORS và quyền local
network của browser có thể chặn; thiếu Host guard vẫn cần xử lý DNS rebinding.

**Đề xuất:** loopback mặc định nếu không cần LAN; muốn Shortcuts qua Wi-Fi
thì bật LAN rõ ràng, pairing token ngẫu nhiên trong header, giới hạn Host,
xác thực Origin khi có và bảo vệ status như endpoint xử lý. Token không mã
hóa HTTP: cần TLS hoặc kênh tin cậy nếu truyền ảnh qua mạng không tin cậy.
Giảm thông tin status và log tên ảnh. Không mở server qua tunnel/public.

### 8. P2 có điều kiện — Server chưa giới hạn tài nguyên giữa các request

**Bằng chứng:** [do_POST()](../../shortcut-server/server.py#L371) nhận tối đa
200 MB mỗi request nhưng đọc body vào RAM trước khi lấy lock xử lý.
`ThreadingHTTPServer` tạo thread theo request; không có số request chờ tối đa
hoặc thời hạn đọc body trong Handler. Lock chỉ giới hạn conversion, không
giới hạn bộ nhớ/thread của các upload đang chờ. Có timeout subprocess 600s.

**Đề xuất:** giới hạn đồng thời và hàng đợi trước khi nhận body, timeout đọc,
stream vào file tạm có quota, trả 429/503 khi bận. Khi tắt/hủy phải giải phóng
file và cả cây subprocess nếu codec sinh tiến trình con. Cần test riêng trước
khi cung cấp chế độ LAN cho người dùng.

## Những phần đang làm tốt

- Tên ảnh và giá trị metadata được đưa vào UI bằng `textContent` trong luồng
  đã đọc; các `innerHTML` thấy ở đó là template/icon/chuỗi dịch tin cậy.
  Chưa xác nhận được đường XSS từ tên ảnh/metadata trong phạm vi này.
- FFmpeg, DNG và model có version/hash và kiểm tra trước sử dụng; không nên
  thay các bảo vệ đó bằng tải bản “latest”.
- Xử lý HEIC/AI ở worker có deadline/terminate và có cleanup Blob URL/codec.
- Có Clear History, Clear cache và Reset tách biệt. Server dùng temporary
  directory và lệnh subprocess dạng mảng, không nội suy tên file thành shell.
- Không thấy cơ chế nhận URL người dùng rồi gửi ảnh sang dịch vụ AI trong các
  luồng web đã kiểm tra. Không có nhu cầu tài khoản/đăng nhập để xử lý local.

## Thứ tự triển khai đề xuất

1. Khóa decoder bằng tài nguyên được xác minh; sửa xóa History báo thành công
   sai; bổ sung giới hạn metadata/đầu vào và kiểm thử hồi quy tương ứng.
2. Origin riêng, CSP/header có kiểm thử cold boot/offline, tùy chọn History và
   thông tin privacy; bỏ/opt-in counter. Nếu phát hành LAN server, mục 7–8 là
   điều kiện trước khi cung cấp tính năng đó.
3. CI bảo mật: dependency inventory/SBOM cho cả WASM vendored và Python;
   kiểm tra advisory theo đúng phiên bản native bên trong, secret scanning,
   pin Actions theo commit SHA và giảm quyền theo job. Hiện Actions dùng tag.
   Bộ chặn ảnh publish hiện chỉ tìm HEIC/HEIF: bổ sung allowlist tài nguyên
   ảnh được phép để tránh vô tình publish JPEG/PNG cá nhân; giữ icon hợp lệ.
4. Tùy chọn “bản chia sẻ không có vị trí” có thể làm sau. App hiện cố ý giữ
   camera/GPS/date; không được tự xóa metadata của bản chính vì sẽ thay đổi
   mục tiêu bảo toàn ảnh và có thể ảnh hưởng chức năng Photos.

Không ưu tiên khóa PIN giả trên UI hoặc mã hóa bằng khóa hardcode trong JS:
script cùng origin vẫn có thể lấy khóa khi app đang mở. Nếu cần kho ảnh được
mã hóa thật, phải thiết kế passphrase/key lifecycle riêng và làm rõ giới hạn
đối với XSS khi kho đang mở; đây là một tính năng độc lập.

## Kiểm chứng và giới hạn

- Bộ test hiện có: **27 pass, 2 skip, 0 fail** khi chạy History, lifecycle,
  HEIC worker, application và libheif API; hai test cần fixture ảnh bị skip.
- Probe giới hạn xác nhận: plist thiếu payload vẫn mở rộng chuỗi; lỗi clear
  không trả về caller; script CDN thay thế đọc History giả; đường dẫn khác
  cùng origin đọc được File giả. Browser context tạm, không ảnh cá nhân,
  mọi yêu cầu mạng ngoài của probe bị chặn/giả lập.
- Probe server chỉ bind loopback/cổng ngẫu nhiên, không subprocess/ảnh thật.
  Status và body-validation vẫn chấp nhận Host/Origin lạ.
- Quét mẫu private key, GitHub token và AWS access key trên 158 file source/
  workflow không có kết quả. Đây là kiểm tra mẫu giới hạn, không bao phủ mọi
  định dạng secret hoặc lịch sử Git.
- Chưa fuzz toàn bộ HEIF/EXIF/DNG/MOV/ZIP, chưa audit mã native trong WASM,
  chưa làm kiểm kê CVE đầy đủ hoặc xác minh cấu hình tài khoản GitHub/host.
  Không báo codec có CVE cụ thể khi chưa chứng minh đúng phiên bản ảnh hưởng.
- Script và JSON kết quả đặt tại thư mục visualization `security-review`
  của chat để chạy lại; mã app và dữ liệu người dùng không bị thay đổi.

  [Kết quả browser/parser](C:/Users/WanThinnn/.codex/visualizations/2026/10/15/01a13ff5-679f-7921-aa8e-1a4ed6ba1991/security-review/probe-results.json),
  [kết quả server](C:/Users/WanThinnn/.codex/visualizations/2026/10/15/01a13ff5-679f-7921-aa8e-1a4ed6ba1991/security-review/server-probe-results.json).

## Nguồn hướng dẫn đối chiếu

- [MDN: Subresource Integrity](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/SRI)
  — script CDN có quyền trong trang; SRI phát hiện nội dung bị thay thế.
- [OWASP: HTML5 Security](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html)
  — Web Storage/IndexedDB theo origin, rủi ro XSS và xác thực message/data.
- [MDN: CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy)
  — giới hạn nguồn tài nguyên và hỗ trợ WebAssembly bằng chính sách phù hợp.
- [MDN: frame-ancestors](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors)
  — chống framing phải dùng HTTP header; chỉ thị này không có hiệu lực qua meta.
