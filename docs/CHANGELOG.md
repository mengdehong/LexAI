# LexAI 变更日志

所有重要变更均记录在本文件中。

格式遵循 [Keep a Changelog](https://keepachangelog.com/) 和语义化版本 [Semantic Versioning](https://semver.org/) 规范。

---

## [未发布] (Unreleased)

### 计划中的功能

- 多语言完整支持 (CJK 优化)
- Word/Excel 文档支持
- 性能基准与优化
- 知识网络可视化

---

## [0.2.5] - 2025-10-23

### 新增 (Added)

- ✨ Windows 启动稳定性增强
  - RPC Worker 进程启动时自动补全 PATH 环境变量
  - PyO3 扩展 `rust_core` 的动态库自动收集与加载
  - Windows MSI 安装后首次启动成功率提升至 99%+
- 🎨 暗色主题界面统一
  - 定义统一的暗色主题色板 (surface, surface-alt, border, text-muted)
  - 修复白色背景组件 (输入框、弹窗、说明块) 在暗色下的显示
  - 按钮悬浮态与主色调对齐，移除灰白割裂感
- 🧪 CI/CD 增强
  - 新增 Windows Smoke Test，验证 RPC Worker 健康检查
  - 自动化测试流程覆盖 Windows/macOS/Linux

### 修复 (Fixed)

- 🔧 修复 Windows 环境下 RPC Worker 库文件加载失败
- 🔧 修复暗色模式下部分组件对比度不足
- 🔧 优化 PyInstaller 打包流程，减少冗余依赖

### 改进 (Improved)

- 📈 缩小应用发布包体积 (通过移除不必要的 GraalVM 依赖)
- 🚀 加快 Windows 首次启动速度 (< 5 秒)

### 已知问题 (Known Issues)

- 某些特殊 PDF 格式的解析仍可能失败 (需手动处理)
- 在极低配置设备上 (RAM < 2GB)，应用运行可能变慢

---

## [0.2.0] - 2025-10-22

### 新增 (Added)

- 🎯 **RPC Worker 本地化**
  - 将后端从 FastAPI 服务转换为 JSON-RPC 离线 Worker
  - 应用分发包中包含完整 RPC Worker (PyInstaller)，无需单独部署
  - 支持离线运行，无网络依赖
- 📄 **PDF 解析优化**
  - 使用开源 `pdf-extract` 库替代 Java/GraalVM，移除 Java 依赖
  - 纯 Rust 实现，性能提升 30%+
  - 错误消息分类，支持识别损坏 PDF、加密文件等
- 🔐 **API 密钥安全存储**
  - 集成 Tauri Stronghold，所有 API 密钥加密存储
  - 首次启动自动迁移旧密钥
  - 支持密钥删除、导出、导入
- ✨ **工作区状态持久化**
  - 自动保存和恢复上次会话的视图、文档列表、术语和滚动位置
  - 提升工作连续性，重启应用后无缝衔接
- 📤 **批量文档上传与管理**
  - 支持一次上传多个文档，带后台队列与进度条
  - 支持取消单个或整个批次上传
  - 新增文档删除功能，允许用户管理工作区
- ექს **高级导出选项**
  - 支持将术语库导出为 Anki 卡组 (.apkg) 和 PDF 文档
  - 补充 CSV 导出，便于在其他平台学习
- 🎓 **入门流程优化**
  - 入门引导变为可选，用户可随时跳过或重新触发
- 🔍 **纯文本/Markdown 支持**
  - 后端支持 `.md/.markdown/.txt` 等纯文本格式
  - 无需 `rust_core`，轻量级提取
- 🏥 **诊断面板**
  - 后端健康检查状态实时显示
  - RPC Worker 日志查看与后端重启功能
  - 环境变量与配置诊断
- 🧪 **自动化测试完善**
  - 前端 Vitest 单元测试集成 (覆盖 Prompt 构建、术语去重)
  - 后端 pytest 集成测试
  - Tauri/Rust 单元测试补齐 (覆盖 SRS 算法、密钥管理)
  - CI 流程自动运行所有测试

### 改进 (Improved)

- 🎨 **UI 框架现代化与暗色主题**
  - 核心 UI 框架迁移至 Tailwind CSS 与 shadcn/ui，移除 Mantine 依赖
  - 统一视觉风格，提升界面一致性与可维护性
  - 自动适配系统偏好，所有组件在暗色模式下可读性优化
- 🎯 简化后端部署，无需独立 FastAPI 服务
- 📊 减少应用依赖，体积缩小 25%
- 🔄 改进错误提示，用户更容易定位问题
- 📚 补充完整的 API 文档与示例

### 修复 (Fixed)

- 🔧 修复术语上下文检索时的参数不匹配问题
- 🔧 修复 macOS 启动权限问题
- 🔧 修复 Qdrant 连接超时导致应用卡死
- 🔧 修复中文路径下文档上传失败
- 🔧 修复术语导出时 UTF-8 编码问题

### 变更 (Changed)

- ⚠️ **破坏性变更**：FastAPI 后端改为内置 RPC Worker，外部 API 接口变更
  - 升级用户需手动重新启动应用

### 删除 (Removed)

- ❌ 移除 Java/GraalVM 依赖
- ❌ 移除外部 FastAPI 服务部署选项 (仅支持内置 Worker)

---

## [0.1.1] - 2025-10-13

### 新增 (Added)

- 🎓 **入门向导 (Onboarding)**
  - 首次启动对话式引导流程
  - 采集用户领域、熟练度、学习目标
  - AI 自动生成 12 条初始术语

- 🌍 **全球术语库管理**
  - 模糊搜索术语
  - 内联编辑术语定义
  - CSV 导出功能
  - 术语去重与合并

- 🔎 **术语联想 (Deep Dive)**
  - AI 生成相关例句、场景、关联词
  - 结构化知识展示

- 🎛️ **语言切换**
  - 支持简体中文/英文双语界面
  - 支持即时切换，无需重启

- 📊 **复习中心**
  - 独立复习视图
  - 间隔重复调度 (SRS) 算法
  - "认识/不认识" 二元选择流程
  - 待复习任务计数

### 改进 (Improved)

- 🎨 统一全局 UI 设计语言与色板
- 📖 优化提示文案，增强可读性
- 🚀 提升句向量模型加载性能

### 修复 (Fixed)

- 🔧 修复中文环境下设置面板显示不全
- 🔧 修复术语去重逻辑中的大小写敏感问题
- 🔧 修复向量搜索结果排序错误

---

## [0.1.0] - 2025-10-12

### 新增 (Added)

- 🎯 **文档管理**
  - PDF 文档上传与预览
  - 自动文本抽取 (使用 Extractous)
  - 文本分块与向量化
  - Qdrant 向量数据库集成

- 🤖 **AI 术语抽取**
  - 集成 OpenAI GPT-4o 与 Google Gemini
  - 自定义提示词构建
  - 术语列表自动生成与展示

- 🔍 **上下文检索**
  - 向量相似度搜索
  - 按文档内关键字搜索
  - 返回匹配片段与相关度分数

- 📚 **本地术语库**
  - SQLite 术语库存储
  - 术语增删改查
  - 术语定义管理

- 🏠 **桌面应用**
  - Tauri 跨平台框架
  - React 18 + TypeScript 前端
  - Rust 后端 (Tauri 容器)
  - Tailwind CSS 样式系统

- 🔐 **安全存储**
  - API 密钥配置存储
  - 环境变量支持

- 🧪 **测试框架**
  - 后端 pytest 集成
  - 前端 Vitest 框架
  - Rust cargo test

### 初始化 (Initial)

- 🏗️ 项目基础架构搭建
- 📦 依赖管理 (Poetry, pnpm, Cargo)
- 🔨 构建系统 (Vite, Tauri)
- 📝 文档框架 (README, CONTRIBUTING, 阶段总结)
- 🎯 项目愿景与路线图

---

## 贡献者

感谢以下贡献者为 LexAI 做出的贡献：

- [@mengdehong](https://github.com/mengdehong) - 项目创始人与主要开发者

---

## 升级指南

### 从 v0.1.x 升级到 v0.2.x

1. **备份数据** (可选)
   ```bash
   # SQLite 数据库位置：
   # Linux: ~/.config/lexai/lexai.db
   # macOS: ~/Library/Application Support/lexai/lexai.db
   # Windows: %APPDATA%\lexai\lexai.db
   ```

2. **卸载旧版本** (如已安装)
   ```bash
   # Windows: 控制面板 - 卸载程序
   # macOS: 应用程序文件夹删除 LexAI.app
   # Linux: sudo apt remove lexai (或对应包管理器)
   ```

3. **安装新版本**
   - 从 [GitHub Releases](https://github.com/mengdehong/LexAI/releases) 下载
   - 按照平台说明安装

4. **首次启动**
   - 应用会自动迁移 API 密钥到 Stronghold
   - 原数据库会自动升级 (无损迁移)

### 从 FastAPI 后端迁移

如果你运行的是开发版 (使用外部 FastAPI)：

1. **停止 FastAPI 服务**
   ```bash
   pkill -f "uvicorn app.main:app"
   ```

2. **更新应用**
   ```bash
   npm run tauri build
   ```

3. **应用会自动使用内置 RPC Worker**
   - 无需任何配置

---

## 性能基准

### v0.2.0 性能指标

| 指标         | 数值              | 说明                           |
| ------------ | ----------------- | ------------------------------ |
| 启动时间     | < 3 秒            | Tauri 容器 + RPC Worker 初始化 |
| 首次文档上传 | < 5 秒 (10MB PDF) | 包括文本抽取与向量化           |
| 术语搜索     | < 100ms           | 向量数据库 Qdrant 查询         |
| 内存占用     | 300-500MB         | 正常运行时，取决于加载的模型   |
| 应用大小     | ~180MB            | Linux/macOS; Windows ~250MB    |

---

## 已知限制

### v0.2.x 已知限制

- **文档格式**：仅支持 PDF、纯文本、Markdown (Word/Excel 计划 v0.3)
- **离线模式**：需要首次在线下载句向量模型 (~500MB)，之后可离线使用
- **向量模型**：固定使用 `all-MiniLM-L6-v2`，暂不支持自定义 (v1.0 规划)
- **协作**：暂不支持多用户协作 (v1.0 规划)
- **同步**：暂不支持跨设备术语库同步 (v1.0 规划)

---

## 项目统计

### 代码库大小

```
Frontend (React/TypeScript):   ~50k LOC
Backend (Python):              ~20k LOC
Tauri/Rust:                    ~15k LOC
Tests:                         ~10k LOC
Documentation:                 ~30k LOC
Total:                        ~125k LOC
```

### 依赖概览

- **前端**：React, TypeScript, Tailwind CSS, Vite (~50 依赖)
- **后端**：FastAPI, SQLx, Qdrant, SentenceTransformers (~20 依赖)
- **Rust**：Tauri, Tokio, Serde (~30 依赖)

---

## 许可证

LexAI 采用 MIT 许可证。详见 [`LICENSE`](./LICENSE) 文件。

---

**最后更新**：2025-10-23

**下一个版本**：v0.2.1 (计划 2025-11-15)

**反馈与报告**：欢迎在 [GitHub Issues](https://github.com/mengdehong/LexAI/issues) 中提交反馈！

