# Đề xuất: AI Detail Enhance — cải thiện độ nét ảnh trên trình duyệt

> Trạng thái: **Ý tưởng / chưa triển khai**  
> Phạm vi: `photographic-styles-tool` (web/PWA, ưu tiên Safari iOS)  
> Mục tiêu: cải thiện độ rõ chi tiết ảnh bằng giải pháp nhẹ, giữ màu/HDR/da tự nhiên, không thay thế tính năng Styles/Texture/Portrait hiện tại.

## 1. Vấn đề cần giải quyết

“Ảnh không nét” có ít nhất bốn nguyên nhân khác nhau; không nên dùng một slider Sharpen giải quyết tất cả:

| Vấn đề | Dấu hiệu | Phương pháp phù hợp |
| --- | --- | --- |
| Mềm nhẹ do camera/resampling | Chi tiết còn nhưng hơi nhòe | Local contrast + edge-aware sharpening |
| Noise ISO cao | Grain/nhiễu rõ ở vùng tối | Denoise nhẹ **trước** sharpening |
| Motion blur / out-of-focus | Mất chi tiết theo hướng hoặc hoàn toàn | Deblur ML; không đảm bảo khôi phục thông tin thật |
| Độ phân giải thấp | Thiếu pixel ở vùng zoom/crop | Super-resolution (SR), tốn tài nguyên và có thể hallucinate |

**Ưu tiên sản phẩm:** cải thiện *perceived sharpness* trên ảnh có độ phân giải gốc, không tự nhận “phục hồi chi tiết thật” từ dữ liệu không tồn tại. Tránh face beautification, texture giả và hiệu ứng HDR/Styles bị biến dạng.

## 2. Đề xuất UX

Một tùy chọn **Enhance Detail / Tăng độ nét** (mặc định **Off**) với 3 preset:

- **Natural:** khử nhiễu tối thiểu + tăng nét tinh tế, ưu tiên bảo toàn da và vùng gradient.
- **Balanced:** tăng micro-contrast và sharpening có kiểm soát.
- **Crisp:** mạnh hơn cho cảnh vật/kiến trúc; có giới hạn halo và noise amplification.

Cho phép slider **Strength 0–100**, nút so sánh **Before / After**, và nhãn phân biệt “Sharpness” với “Resolution”. Không tải model bổ sung khi chưa bật tính năng; trên màn hình nhỏ, preview chạy ở độ phân giải giới hạn, export mới xử lý full resolution theo tiles.

Mặc định không can thiệp các ảnh đã có Styles/Texture nếu người dùng chỉ muốn metadata port. Các kết quả detail-enhanced phải là **bản xuất riêng** có hậu tố tên file, không ghi đè ảnh nguồn.

## 3. Chiến lược: Classical-first, ML tùy chọn

### Phase A — Sharpening nhẹ, không thêm model (MVP)

**Pipeline đề xuất:**

1. Decode ảnh sang vùng làm việc có kiểm soát màu (ưu tiên xử lý luminance; không tự sửa chroma).
2. Phân tích độ sáng và mức noise cục bộ; giảm sharpening ở shadow/noisy regions.
3. Tạo low-pass bằng separable Gaussian / edge-aware filter; tính high-frequency residual.
4. Áp dụng **thresholded unsharp mask** hoặc edge-aware detail boost vào luminance.
5. Giới hạn biên độ cạnh, tránh clipping, halos và ringing; mask bảo vệ da/sky khi có sẵn.
6. Encode bản ảnh đã chỉnh (separate raster pipeline), kiểm tra EXIF, orientation, color profile và HDR policy.

Công thức khởi điểm (không phải tham số cố định):

```text
base   = blur(Y, sigma)
detail = Y - base
gate   = smoothstep(noise_floor, edge_threshold, abs(detail))
gain   = strength * gate * region_weight * highlight_shadow_weight
Y_out  = clamp(Y + clamp(gain * detail, -limit, +limit))
```

- `Y`: thành phần độ sáng đã được chuyển đổi phù hợp; tránh xử lý trực tiếp từng kênh RGB vì dễ tạo color fringe.
- `region_weight`: có thể dùng mask mặt/da/person sẵn có để giảm sharpening da và giữ mắt/tóc; **không** ép tải face model chỉ để sharpen ảnh phong cảnh.
- Noise-aware gate cần chống biến noise thành “chi tiết”. Edge-aware filter hoặc multi-scale pyramid có thể thử A/B với unsharp cơ bản.
- Tăng nét không sửa được severe motion blur / defocus.

**Backend:** prototype bằng Canvas 2D hoặc WASM; ưu tiên WebGL2 shader/OffscreenCanvas cho preview nếu đo đạc chứng minh nhanh và ổn định hơn. Không bắt buộc WebGPU: phải có đường chạy trên Safari iOS không hỗ trợ/không ổn định WebGPU.

### Phase B — AI Denoise / Detail Restore tùy chọn

Chỉ thêm nếu A/B test trên ảnh thật chứng minh có lợi ích vượt trội so với Phase A.

**Nhóm model cần thử** (chưa chốt bản đóng gói):
- Tiny denoising CNN (DnCNN rút gọn / mô hình ~sub-million parameters nếu chất lượng đủ); convert ONNX và kiểm tra operators tương thích ORT Web.
- Lightweight restoration architecture dạng mobile CNN (ví dụ bản cấu hình nhỏ của NAFNet); không giả định bản gốc NAFNet là “nhẹ”.
- Không chọn mô hình generative diffusion hoặc SR x2/x4 mặc định: memory/latency lớn và có rủi ro tạo chi tiết giả.

**Nguyên tắc triển khai:** quantization FP16/INT8 **chỉ khi** đo được tương thích và chất lượng; model dưới ~5–10 MB là *mục tiêu thiết kế*, không phải cam kết. Benchmark latency và peak memory quan trọng hơn riêng model file size.

**Sử dụng model theo nhu cầu:** chỉ khi chọn “AI Restore”; inference trên resized/tiled input, chồng mép và feather blending, tránh seam. Worker riêng; có AbortController, timeout, giải phóng tensor và GPU/WASM sessions. Thất bại thì giữ được đầu ra Phase A, không mất ảnh.

### Phase C — Deblur / Super-resolution (nghiên cứu độc lập)

Không gộp SR vào tính năng sharpen. Tách thành experimental feature với cảnh báo “có thể tái tạo chi tiết không chính xác”, giới hạn input dimensions, điện năng và memory budget trên iPhone.

## Ràng buộc bắt buộc: Không phá vỡ Apple Styles / Portrait

**Invariant P0:** Không sửa compressed primary image, HDR gain-map, depth/disparity, semantic mattes, EXIF, Styles plist, texture metadata, item references hoặc box offsets của đầu ra Apple-editable đang được pipeline chuẩn tạo ra. Không viết bất kỳ ảnh đã sharpen nào trở lại HEIC chuẩn.

**Tách hai nhánh output hoàn toàn độc lập:**

```text
Input immutable
  |-- Existing metadata-only Styles/Texture/Portrait pipeline --> Apple Editable HEIC
  `-- Read-only pixel decode --> Optional Enhance Detail --> Separate enhanced SDR copy
```

- Nhánh Enhance Detail **chỉ đọc** input/buffer; không được nhận mutable reference của buffer xuất HEIC chuẩn.
- Không inject kết quả sharpening vào `web/src/styles/`, `web/src/portrait/`, hay code lắp ráp HEIF hiện tại.
- Không tự động sao chép HDR gain maps hoặc Portrait/Styles editing metadata sang output đã re-encode. Những contract này cần nghiên cứu và kiểm chứng độc lập.
- Nút bật tính năng không được làm khác output chuẩn; Apple Editable HEIC phải có cùng checksum với kết quả pipeline cũ trên fixture deterministic.
- Nếu Enhance Detail lỗi, hủy, hết RAM hoặc không hỗ trợ browser: giữ nguyên Apple Editable HEIC bình thường. Tuyệt đối không rollback hay mutate nhánh chuẩn.
- Output tăng nét là **một file độc lập** có tên rõ ràng (`_Enhanced`), ban đầu SDR, không tuyên bố giữ được chỉnh sửa native Styles/Portrait.
- Mọi thay đổi liên quan đến re-encode phải nằm trong nhánh experimental riêng, không triển khai vào đường HEIC Apple-editable đã ổn định.

**Gates trước khi merge:** so sánh SHA-256 toàn bộ Apple Editable HEIC (nếu deterministic) và hash từng payload primary/HDR/depth/Styles khi container có phần phi xác định; chạy regression về import/edit/save/reopen trên thiết bị iOS thật. Không chỉ dựa vào việc file mở được.

## 4. Tích hợp với kiến trúc hiện tại

Các khu vực cần khảo sát trước khi viết code:

- `web/app.js`: job queue, thao tác download, hủy job, lifecycle.
- `web/src/media/`, `web/src/raster/`, `web/src/codecs/`: decode / output pipeline, đổi định dạng và màu.
- `web/src/vision/`: reuse face/skin segmentation **khi dữ liệu đã có**, không buộc khởi chạy toàn bộ vision pipeline.
- `web/src/portrait/`: tham khảo worker lifecycle, timeout, preview resource cleanup; không dùng depth estimation làm prerequisite để sharpen.
- `web/sw.js`: chỉ bổ sung model asset vào offline strategy khi ML đã được chọn; tránh tải tự động.

Đề xuất module mới:

```text
web/src/detail/
  detail-analysis.js        # noise/edge metrics, điều kiện giới hạn
  detail-presets.js         # Natural / Balanced / Crisp
  detail-processing.js      # orchestration và cancellation
  detail-worker.js          # tile-based CPU/WASM processing
  detail-preview.js         # preview và before/after
  detail-ml.js              # optional ONNX, lazy import
tests/web/detail-*.mjs      # correctness, lifecycle, perf smoke
```

Luồng tổng quát:

```text
Import -> existing Styles / Texture / Portrait metadata flow (unchanged)
       -> opt-in Enhance Detail
       -> decode source pixels -> analysis -> denoise? -> edge-aware sharpen
       -> preview -> separate enhanced export
```

### Ràng buộc HEIC, HDR và Apple Photos

**Không thể vừa sharpen pixel thực tế vừa cam kết compressed primary image byte-identical.** Do đó:

1. **Metadata-only port** tiếp tục giữ nguyên primary/HDR/Styles bytes theo contract hiện có.
2. **Enhanced export** chủ động re-encode primary image; không tuyên bố giữ native Styles/Portrait editing semantics khi chưa được test trên iPhone thực.
3. HDR gain map: không copy nguyên gain map sang pixel đã biến đổi mà chưa chứng minh sự đồng bộ giữa base image và gain map. MVP có thể chỉ hỗ trợ **SDR enhanced copy** và hiển thị rõ cho người dùng; HDR enhancement là pha riêng.
4. Không mặc định chuyển ảnh nguồn sang SDR hoặc mất metadata trong thao tác Styles-only.
5. Giữ ảnh đầu vào bất biến, đặt tên file output dễ nhận biết.

## 5. Quality gates và benchmark

Dùng bộ ảnh kiểm thử có sự cho phép, gồm: iPhone HEIC 12/24/48 MP, JPEG/PNG, chân dung nhiều loại da/tóc, cảnh lá cây/chữ/kiến trúc, low-light, noise cao, ảnh đã sharpen mạnh, chuyển động, gradient bầu trời, ảnh HDR và ảnh có Portrait depth.

Đánh giá:

| Nhóm | Thước đo |
| --- | --- |
| Độ nét cảm nhận | Blind A/B trên crop 100%, nhận diện cạnh, độ rõ chi tiết |
| Artifact | Halo width, ringing, edge overshoot, noise amplification, banding, skin over-sharpen |
| Fidelity | DeltaE / sự biến đổi màu, gradient và orientation; nếu có GT dùng PSNR/SSIM |
| Hiệu năng | Cold/warm start, p50/p95 latency, **peak memory**, worker cleanup, thermal/reload |
| Tương thích | Safari iOS thật, Chrome Android, desktop; test nhiều lần liên tiếp |
| An toàn dữ liệu | Ảnh gốc không bị thay đổi; export mở được, không sai orientation/profile |

**Ngưỡng chấp nhận đề xuất (cần điều chỉnh từ dữ liệu thật):**
- Không thêm request download AI khi tính năng Off.
- Preview phản hồi mượt trên ảnh đại diện giảm kích thước, không phải chạy full-res mỗi lần kéo slider.
- Không tăng đáng kể noise ở shadow/sky hoặc tạo halo rõ trên chữ/tóc.
- Không crash/reload Safari với workload iPhone mục tiêu.
- Hủy tác vụ và xóa kết quả phải thu hồi buffers, object URLs và worker.

Không đặt benchmark FPS hoặc số MB peak RAM cố định trước khi đo trên thiết bị thật.

## 6. Roadmap triển khai

1. **Discovery:** xác định API decode/export hiện hành, giới hạn HDR, dữ liệu mask sẵn có; chọn 20–30 fixtures đại diện.
2. **MVP:** preset + slider + before/after + luminance unsharp có noise gate; xử lý bằng worker; output SDR copy riêng.
3. **Hardening:** tile processing, cache/lifecycle, edge-aware tuning, Safari memory benchmark, test regression.
4. **AI experiment:** thử 2–3 mô hình denoise nhỏ trên cùng fixtures, đánh giá so với non-ML baseline; chỉ tích hợp model nếu đáng giá.
5. **HDR/native integration:** nghiên cứu color-managed re-encode và gain-map consistency; test iPhone Photos import/edit/save/reopen trước khi công bố hỗ trợ.

## 7. Các quyết định kiến trúc đề xuất

- **Bắt đầu bằng non-ML, đo trước khi thêm ML.** Sharpening tốt không bắt buộc có model.
- **Bảo toàn mặc định** đường Styles/Texture/Portrait đang ổn định.
- **Không tạo chi tiết giả** rồi quảng bá thành phục hồi chi tiết chân thực.
- **On-device, opt-in, lazy-load, cancellable, memory-bounded.**
- **Không commit/push** trong giai đoạn đề xuất; tài liệu này chỉ phục vụ thảo luận.

## 8. Câu hỏi nghiên cứu

- Với Safari thực, WebGL2 + tiling hay WASM SIMD ổn định hơn ở ảnh 24/48 MP?
- Có cần skin-aware weight không, hay thresholded luminance sharpening đã tự nhiên?
- Quality benefit của tiny AI denoise vượt bao nhiêu so với noise-gated sharpen?
- Có thể tạo enhanced HEIC + Styles metadata sau re-encode mà Apple Photos vẫn cho edit ổn định không?
- Cần nhận biết ảnh nguồn đã sharpen mạnh để tránh double-sharpen như thế nào?

---

**Đề xuất chốt cho v1:** `Enhance Detail` = *Natural / Balanced / Crisp* + slider, **non-ML noise-aware edge sharpening**, before/after preview, **SDR copy export** và không thay đổi metadata-only output. Chỉ nâng lên AI Restore khi đã có benchmark chứng minh lợi ích.
