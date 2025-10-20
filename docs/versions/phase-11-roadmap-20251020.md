# 第 11 阶段 – 路线图与发布强化 (2025-10-20)

本文档概述了 LexAI 的前瞻性路线图，以及源自公开发布预览版的实际强化项目。

## 愿景
LexAI 是一个安全的、离线优先的桌面工作台，用于通过 LLM 构建领域术语表、上下文定义和学习循环。我们优先考虑：
- 默认安全：加密的凭证存储、最小权限、透明迁移。
- 可复现性：确定性构建、跨平台一致性、自动化发布。
- 实用的学习成果：持久化的术语库、上下文复习、导出管线。

## 主题 & 里程碑

### 1) 本地 RPC Worker 的可靠性 (P11-A)
- Windows 二进制文件发现：在解析 `resources/rpc_server/rpc_server` 时支持 `.exe` 后缀 (已落地)。
- 平台资源：仅在 Linux 上要求 `_internal`；使检查具有操作系统感知能力 (已落地)。
- 减少打包体积：
  - 在 CI 上优先使用仅 CPU 的 Torch wheels 以缩小 PyInstaller 输出 (Linux 已落地；评估 macOS/Windows)。
  - 审计 PyInstaller spec 中不必要的钩子，在发布版中剥离符号 (strip symbols)。
- 可观测性：
  - 为启动失败添加结构化日志，并捕获 stdout/stderr (开发工具中的诊断窗口)。

### 2) 密钥 & 提供商 (P11-B)
- Stronghold UX：明确的“测试”按钮；按提供商保存/清除；迁移摘要。
- 缺失 API 密钥指引：可操作的错误，链接到“设置”和确切的提供商 ID。
- 环境变量回退：文档化 `VITE_<PROVIDER_ID>_API_KEY` 映射；启动诊断面板。
- 提供商预设：提供 OpenAI、Google Gemini、Ollama 兼容端点的预设。

### 3) 文档处理 & 搜索 (P11-C)
- 多文件上传和按文件的状态显示。
- Qdrant 本地存储中的索引模式 (schema) 版本控制和迁移。
- 具有进度和取消功能的后台作业。

### 4) 学习循环 (P11-D)
- 复习热力图和难度评分。
- CSV/APKG/PDF 导出优化 (模板、i18n、富文本)。
- 具有多字段校验的内联编辑器。

### 5) 应用 UX & 分发 (P11-E)
- 首次运行引导教程；“入门”清单。
- Windows 安装程序验证 (快捷方式、PATH、卸载)，macOS 公证计划，Linux AppImage 健全性检查。
- 崩溃报告 (可选项) 和健康检查界面。

### 6) CI/CD & 开发者体验 (P11-F)
- 跨作业缓存 Rust/Python 依赖；固定各平台的工具链。
- 从 `docs/versions` 自动化生成发布说明。
- E2E 冒烟测试：启动 RPC worker，上传虚拟文档，搜索术语。

## 源自反馈的立即修复项
- Windows：为 RPC worker 解析 `.exe`；在非 Linux 系统上放宽 `_internal` 检查。
- 设置：更清晰的提供商 API 密钥指引；显示提供商 ID。

## 跟踪
每个主题将作为一个史诗 (epic) 在 GitHub Projects 中通过 issue 进行跟踪。里程碑映射到 `phase-11.x` 标签。
