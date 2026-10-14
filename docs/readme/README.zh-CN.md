# Stylio

[English](../../README.md) · [Tiếng Việt](README.vi.md) · **简体中文**

**Stylio** — 名称由 Styles 与 Elio 组合而来 — 是一款开源、在设备本地运行的照片处理工具，专注于与 Apple Photos 的互操作能力，包括 Photographic Styles、iOS 27 Texture/Grain、AI 人像处理，以及尽可能保留照片的原始数据。

> [!NOTE]
> 当前版本：**v1.0.0**  
> 独立开发、开源，与 Apple 无关联。

## 在线使用

**Web App：** https://wanthinnn.github.io/stylio

Stylio 在浏览器本地处理照片，不会把你的照片上传到服务器。

在 iPhone 上，建议将 Stylio 添加到主屏幕，以全屏 PWA 方式使用。

## 界面预览

<p align="center">
  <img src="../demo/img/demo-3.png" width="72%" alt="Stylio 主界面">
</p>

<p align="center">
  <img src="../demo/img/demo-1.png" width="45%" alt="Stylio 照片处理流程">
  <img src="../demo/img/demo-2.png" width="45%" alt="Stylio 设置与 AI 功能">
</p>

## 主要功能

- 为受支持的旧款 iPhone HEIC 照片提供 **Photographic Styles 移植**。
- 支持 iOS 27 Photos 中的 **Texture & Grain** 编辑数据。
- **AI Portrait / Depth Effect**，可在合适的输出中继续调整光圈和 Portrait Lighting。
- **Smart Enhance**，包括本地细节恢复与 Adaptive Styles 分析。
- 在源文件具备相应数据时，尽量**保留原始 HEIC/HDR/Portrait/Styles 资源**。
- 浏览器流程支持 **HEIC、JPEG、PNG、DNG**。
- **本地优先处理**，支持 WebGPU，并提供 CPU fallback。
- PWA、设备本地 History、Light/Dark/System，以及 EN/VI/ZH 多语言界面。

## 快速使用

1. 打开 Stylio 并选择照片。
2. 按需启用 **Smart Enhance** 或单独配置 AI 功能。
3. 处理照片。
4. 将结果保存为文件。
5. 在 Apple Photos 中打开并继续编辑。

请保留原始照片。Stylio 会改写照片文件结构，目前仍属于实验性工具。

## 文档

README 已精简为 Stylio 的主要功能；较长的技术内容统一保留在英文文档中：

- [浏览器设置、兼容性与架构](../web/browser-guide.md)
- [照片处理、Portrait、HDR 与 DNG](../web/processing-guide.md)
- [AI 模型资源](../models/ai-assets.md)
- [CLI、Shalielie 上游来源与逆向研究说明](../project/upstream-cli-and-research.md)
- [技术实验记录](../../facts.md)

Python CLI 仍保留在仓库中，用于研究、批处理与兼容性验证；Stylio 的主要用户体验是浏览器/PWA 应用。

## 项目来源

Stylio 基于 [nathanatgit 的 Shalielie](https://github.com/nathanatgit/Shalielie) & [joy-0220-yoj 的 HoLanLa](https://github.com/joy-0220-yoj/HoLanLa.git) 开发，并保留原始 MIT 许可证与版权声明。

当前 Browser/PWA、AI 工作流、多语言 UI 与 Stylio 功能由 **Elio (WanThinnn)** 维护。

## 许可证

[MIT](../../LICENSE)。第三方 AI runtime/model 保留其位于 `web/vendor/` 中的独立许可证与声明。

Apple、iPhone、Apple Photos 与 Photographic Styles 均为 Apple Inc. 的商标，此处仅用于说明兼容对象。
