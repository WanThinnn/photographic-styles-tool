# Stylio

[English](../../README.md) · **Tiếng Việt** · [简体中文](README.zh-CN.md)

**Stylio** - tên gọi được ghép từ Styles và Elio - là công cụ xử lý ảnh mã nguồn mở, chạy trực tiếp trên thiết bị, tập trung vào khả năng tương thích với Apple Photos: Photographic Styles, Texture/Grain của iOS 27, Portrait bằng AI và bảo toàn tối đa dữ liệu gốc của ảnh.

> [!NOTE]
> Phiên bản hiện tại: **v1.0.0**  
> Phát triển độc lập và mã nguồn mở. Không liên kết với Apple.

## Dùng thử

**Web app:** https://wanthinnn.github.io/stylio

Stylio xử lý ảnh ngay trên trình duyệt; ảnh của bạn không được tải lên máy chủ.

Trên iPhone, nên thêm Stylio vào Màn hình chính để dùng dưới dạng PWA toàn màn hình.

## Giao diện

<p align="center">
  <img src="../demo/img/demo-3.png" width="72%" alt="Giao diện chính của Stylio">
</p>

<p align="center">
  <img src="../demo/img/demo-1.png" width="45%" alt="Quy trình xử lý ảnh với Stylio">
  <img src="../demo/img/demo-2.png" width="45%" alt="Cài đặt và AI Settings của Stylio">
</p>

## Tính năng chính

- **Port Photographic Styles** cho ảnh HEIC từ các iPhone cũ được hỗ trợ.
- **Texture & Grain** cho các điều khiển chỉnh sửa mới trên iOS 27.
- **AI Portrait / Depth Effect** với khẩu độ và Portrait Lighting có thể tiếp tục chỉnh trong Photos trên output phù hợp.
- **Smart Enhance** gồm phục hồi chi tiết cục bộ và Adaptive Styles.
- **Bảo toàn dữ liệu gốc** như HEIC/HDR/Portrait/Styles khi ảnh nguồn có sẵn.
- Hỗ trợ luồng xử lý **HEIC, JPEG, PNG và DNG** trên web.
- Xử lý **local-first**, có WebGPU và CPU fallback.
- PWA, History lưu trên thiết bị, Light/Dark/System và giao diện EN/VI/ZH.

## Cách dùng nhanh

1. Mở Stylio và chọn ảnh.
2. Bật **Smart Enhance** hoặc chọn từng tính năng AI nếu cần.
3. Xử lý ảnh.
4. Lưu kết quả dưới dạng file.
5. Mở file trong Apple Photos để tiếp tục chỉnh sửa.

Hãy giữ lại ảnh gốc. Stylio có chỉnh sửa cấu trúc file ảnh và vẫn là phần mềm thử nghiệm.

## Tài liệu

README được rút gọn để tập trung vào Stylio. Các phần kỹ thuật dài đã được chuyển sang tài liệu tiếng Anh:

- [Thiết lập web, tương thích và kiến trúc](../web/browser-guide.md)
- [Xử lý ảnh, Portrait, HDR và DNG](../web/processing-guide.md)
- [Tài nguyên AI model](../models/ai-assets.md)
- [CLI, nguồn gốc Shalielie và ghi chú reverse engineering](../project/upstream-cli-and-research.md)
- [Kết quả thử nghiệm kỹ thuật](../../facts.md)

Python CLI vẫn còn trong repository để nghiên cứu, batch processing và kiểm thử tương thích, nhưng trải nghiệm chính của Stylio là browser/PWA.

## Nguồn gốc dự án

Stylio được phát triển dựa trên [Shalielie của nathanatgit](https://github.com/nathanatgit/Shalielie) cùng [HoLanLa của joy-0220-yoj](https://github.com/joy-0220-yoj/HoLanLa.git) và giữ nguyên giấy phép MIT cùng thông báo bản quyền gốc.

Phần browser/PWA, AI workflow, giao diện đa ngôn ngữ và bộ tính năng Stylio hiện tại được duy trì bởi **Elio (WanThinnn)**.

## Giấy phép

[MIT](../../LICENSE). Các AI runtime/model bên thứ ba giữ giấy phép riêng trong `web/vendor/`.

Apple, iPhone, Apple Photos và Photographic Styles là nhãn hiệu của Apple Inc.; tên gọi chỉ được dùng để mô tả khả năng tương thích.
