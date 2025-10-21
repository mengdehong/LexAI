# 第 11 阶段 – 路线图与发布强化 (2025-10-20)

## 主题 & 里程碑

### 1) 本地 RPC Worker 的可靠性 (P11-A)
- 减少打包体积：
  - 评估在 macOS/Windows 的 CI 上使用 CPU-only Torch wheels 的可行性 (Linux 已落地)。
  - 审计 PyInstaller spec 中不必要的钩子，在发布版中剥离符号 (strip symbols)。
- 可观测性：
  - 为启动失败添加结构化日志，并捕获 stdout/stderr (开发工具中的诊断窗口)。
  - 为 RPC Worker 增加轻量级健康检查端点，Tauri 后端可轮询此端点并将状态暴露给前端。
  - 已完成最小补强：后端提供 `health` 端点，前端新增“诊断”面板展示健康信息；Tauri 后端暴露 `fetch_backend_health` 命令。预埋 stderr 尾日志采集以便后续扩展（默认不展示，避免泄露敏感信息）。


### 2) 密钥 & 提供商 (P11-B)
- Stronghold UX：明确的“测试”按钮；按提供商保存/清除；迁移摘要。
- 缺失 API 密钥指引：可操作的错误，链接到“设置”和确切的提供商 ID。
- 环境变量回退：文档化 `VITE_<PROVIDER_ID>_API_KEY` 映射；启动诊断面板。
  - 确保启动诊断面板在任何情况下都不会泄露密钥的明文值。
- 提供商预设：提供 OpenAI、Google Gemini、Ollama 兼容端点的预设。

### 3) 文档处理 & 搜索 (P11-C)
- 多文件上传和按文件的状态显示。
- 具有进度和取消功能的后台作业 (利用 Rust/Tauri 后台线程)。

- 已完成阶段性进展（方案A，前端优先）：
  - 多文件上传：在 DocumentPanel 支持串行批量上传，显示总体进度百分比。
  - 取消批量：提供“取消批量”按钮，可中断仍未处理文件。
  - 文件状态明细：上传过程中按文件展示 queued/ok/error，便于定位失败文件。
  - 兼容性优化：Tauri 后端在旧 RPC Worker 下，`health` 自动回退 `ping`，`upload_document` 自动回退 `upload`，避免“无反馈”。
  - 文本类文档支持：后端新增对 `.md/.markdown/.txt` 的轻量提取（UTF-8 读取），无需 rust_core。

### 4) 学习循环 (P11-D)
- 复习热力图和难度评分。
- CSV/APKG/PDF 导出优化 (模板、i18n、富文本)。
- 具有多字段校验的内联编辑器 (核心校验逻辑收归 Rust 后端)。

### 5) 应用 UX & 分发 (P11-E)
-  基于现有的 `OnboardingView.tsx`，在流程结束后提供“入门”清单，而非重复的“引导教程”。
- Windows 安装程序验证 (快捷方式、PATH、卸载)，Linux AppImage 健全性检查。
-  macOS 公证 (非“计划”，而是**发布阻断项**)。
- 崩溃报告 (可选项) 和健康检查界面。
- 审计并收紧 Tauri Capabilities，贯彻“最小权限”原则。
- 为生产环境配置严格的 CSP (Content Security Policy)，移除 `"csp": null`。

### 6) CI/CD & 开发者体验 (P11-F)
- 在 `ci.yml` 和 `release.yml` 中**实际运行**所有单元测试 (Rust: `cargo test`, TS: `npm run test`)。
- 为 Python RPC Worker 编写单元测试 (`pytest`) 并在 CI 中运行。
- 跨作业缓存 Rust/Python 依赖；固定各平台的工具链。
- 从 `docs/versions` 自动化生成发布说明。
- E2E 冒烟测试：启动 RPC worker，上传虚拟文档，搜索术语 (建议使用 `tauri-driver`)。
- 完成 P7 遗留的文档任务：更新 `README.md` 和 `CONFIGURING.md` 以反映 P11 的最新功能。

## 跟踪
每个主题将作为一个史诗 (epic) 在 GitHub Projects 中通过 issue 进行跟踪。里程碑映射到 `phase-11.x` 标签。

### 11) 实施结果小结（本次迭代）
- P11-B：完成“测试连接”UX、错误提示映射、Provider 预设与环境变量映射文档；Stronghold 迁移与读取。
- P11-C：完成批量上传后台化（start_batch_upload/cancel_batch），进度事件 batch://progress，前端订阅并展示实时进度与 per-file 状态；.md/.txt 轻量提取；方法名兼容回退。
- P11-A：新增 fetch_backend_diagnostics/restart_backend；诊断面板新增重启与健康信息；stderr 缓冲接入。
- P11-E：初步收紧 Capabilities（移除 opener 权限）。
- P11-F：修正 CI 步骤与新增最小冒烟测试（health）。
