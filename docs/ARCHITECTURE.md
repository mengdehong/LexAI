# LexAI 架构文档

## 1. 项目概述

**LexAI** 是一款面向翻译工作者、研究人员和技术文档编写者的 AI 驱动的桌面应用。它帮助用户高效地处理文档、识别关键术语、构建个人智能术语库，并通过 AI 辅助、智能复习和术语联想等功能，加速专业学习和术语管理工作流。

核心使命：**将文档阅读与术语积累从被动记忆转变为主动学习**。

---

## 2. 整体架构

LexAI 采用**分层混合架构**，包含桌面前端、Tauri 容器层、本地 RPC Worker 和向量数据库等多个模块：

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户界面层                                 │
│  ┌──────────────┬──────────────┬──────────────┬──────────────┐  │
│  │ ReadingPanel │ TermsPanel   │ ContextPanel │ ReviewCenter │  │
│  │  (文档阅读)   │  (术语管理)   │  (上下文)     │  (复习学习)  │  │
│  └──────────────┴──────────────┴──────────────┴──────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                    Tauri 容器 / 桌面环境                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  • SQLite 本地数据库 (术语库、复习进度、配置)               │  │
│  │  • Tauri 命令/事件系统 (RPC 通信、密钥管理)                │  │
│  │  • Stronghold (API 密钥安全存储)                           │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                   本地 RPC Worker (Python/PyO3)                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  • JSON-RPC 服务器 (stdin/stdout 通信)                   │  │
│  │  • 文档解析与文本抽取 (PDF、纯文本、Markdown)             │  │
│  │  • 文本分块与向量化 (Sentence Transformers)              │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                   Rust 核心库 (rust_core)                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  • PyO3 绑定                                              │  │
│  │  • 文本抽取引擎 (PDF、纯文本)                              │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                  数据存储与外部服务                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  • Qdrant (向量数据库 - 本地或远程)                       │  │
│  │  • OpenAI / Google Gemini / Custom LLM (AI 功能)         │  │
│  │  • HuggingFace (句子向量模型)                            │  │
│  └──────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. 核心组件详解

### 3.1 前端 UI 层 (React + TypeScript + Vite)

**职责**：提供用户交互界面，管理应用状态，调用 Tauri 命令与后端通信。

**关键组件**：

| 组件                   | 文件                                | 功能                                |
| ---------------------- | ----------------------------------- | ----------------------------------- |
| **ReadingPanel**       | `components/ReadingPanel.tsx`       | 文档上传、预览、术语提取入口        |
| **TermsPanel**         | `components/TermsPanel.tsx`         | 显示当前文档术语、搜索、查看语境    |
| **ContextPanel**       | `components/ContextPanel.tsx`       | 显示术语出现的上下文片段            |
| **GlobalTermbaseView** | `components/GlobalTermbaseView.tsx` | 全局术语库查看、编辑、导出、去重    |
| **ReviewCenter**       | `components/ReviewCenter.tsx`       | 复习界面、任务计数、SRS 学习流程    |
| **SettingsView**       | `components/SettingsView.tsx`       | 配置 LLM 提供商、API 密钥、语言切换 |
| **OnboardingView**     | `components/OnboardingView.tsx`     | 首次启动对话式入门                  |
| **DiagnosticsPanel**   | `components/DiagnosticsPanel.tsx`   | 后端健康检查、日志查看              |

**全局状态管理** (`state/AppState.tsx`)：
- 当前文档 (DocumentState)
- 术语列表 (TermsState)
- 上下文结果 (ContextState)
- UI 模式 (LoadingState、ErrorState)

**国际化** (`state/LocaleContext.tsx`)：支持中文/英文界面切换。

---

### 3.2 Tauri 容器层 (Rust)

**职责**：连接前端与后端，管理本地数据库、密钥存储、RPC Worker 进程。

**关键模块**：

| 模块         | 文件                 | 功能                                                                          |
| ------------ | -------------------- | ----------------------------------------------------------------------------- |
| **术语管理** | `src/commands.rs`    | `add_term`, `get_all_terms`, `delete_term`, `update_term`, `export_terms_csv` |
| **复习系统** | `src/review.rs`      | `get_review_terms`, `submit_review_result` (SRS 算法)                         |
| **RPC 通信** | `src/rpc_client.rs`  | 启动/管理 RPC Worker 进程，通过 stdin/stdout 进行 JSON-RPC 调用               |
| **密钥管理** | `src/secrets.rs`     | Stronghold 集成，`save_api_key`, `get_api_key`, `delete_api_key`              |
| **数据库**   | `src/db.rs`          | SQLite 初始化、迁移、查询                                                     |
| **诊断**     | `src/diagnostics.rs` | `fetch_backend_diagnostics`, `restart_backend`                                |

**数据库架构** (SQLite)：
```sql
-- 术语表
CREATE TABLE terms (
    id INTEGER PRIMARY KEY,
    term TEXT UNIQUE NOT NULL,
    definition TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 复习记录表 (SRS)
CREATE TABLE review_history (
    id INTEGER PRIMARY KEY,
    term_id INTEGER NOT NULL,
    stage INTEGER DEFAULT 0,  -- 0-5 (Spaced Repetition Scheduler)
    interval INTEGER,
    ease_factor REAL DEFAULT 2.5,
    next_review_date DATE,
    last_reviewed_at DATETIME,
    FOREIGN KEY(term_id) REFERENCES terms(id)
);

-- 配置表
CREATE TABLE config (
    key TEXT PRIMARY KEY,
    value TEXT
);
```

---

### 3.3 RPC Worker (Python + PyO3)

**职责**：作为独立进程运行，提供文档解析、向量化、向量检索等核心 AI 能力。

**打包方式**：PyInstaller 打包为单一可执行文件 (`rpc_server`)，包含所有 Python 依赖和 Rust 扩展。

**关键模块**：

| 模块           | 文件                                    | 功能                                                                   |
| -------------- | --------------------------------------- | ---------------------------------------------------------------------- |
| **RPC 服务器** | `rpc_server.py` / `backend/app/main.py` | JSON-RPC 2.0 服务器，支持 `health`, `upload_document`, `search` 等方法 |
| **文档处理**   | `backend/app/services.py`               | 文本提取、分块、向量化、Qdrant 入库                                    |
| **配置管理**   | `backend/app/config.py`                 | Qdrant 连接、模型选择、路径配置                                        |
| **文本分割**   | (langchain-text-splitters)              | RecursiveCharacterTextSplitter (1000 字/200 字重叠)                    |
| **向量化**     | (sentence-transformers)                 | 默认模型：`all-MiniLM-L6-v2`                                           |

**主要 RPC 方法**：

```python
# 健康检查
{ "jsonrpc": "2.0", "id": 1, "method": "health" }
# → { "jsonrpc": "2.0", "id": 1, "result": { "status": "ok" } }

# 上传文档
{ "jsonrpc": "2.0", "id": 2, "method": "upload_document",
  "params": { "file_path": "/path/to/doc.pdf" } }
# → { "jsonrpc": "2.0", "id": 2, "result": { "document_id": "uuid-..." } }

# 搜索术语
{ "jsonrpc": "2.0", "id": 3, "method": "search",
  "params": { "document_id": "uuid-...", "query": "machine learning" } }
# → { "jsonrpc": "2.0", "id": 3, "result": [...] }
```

---

### 3.4 Rust 核心库 (rust_core)

**职责**：通过 PyO3 提供高性能文本提取。

**关键功能**：
- **PDF 解析**：使用 `pdf-extract` crate，无需 Java/GraalVM
- **纯文本/Markdown 支持**：直接 UTF-8 读取
- **错误分类**：识别损坏文件、加密 PDF 等

**暴露接口** (Python 可调用)：
```python
from rust_core import extract_text

text = extract_text("/path/to/document.pdf")
```

---

### 3.5 向量数据库 (Qdrant)

**职责**：存储和快速检索文档块的向量表示。

**集合架构**：
```json
{
  "name": "lexai_documents",
  "vector_size": 384,  // all-MiniLM-L6-v2 输出维度
  "distance": "Cosine",
  "payload_schema": {
    "document_id": "keyword",
    "chunk_text": "text",
    "chunk_index": "integer"
  }
}
```

**运行模式**：
- **开发**：嵌入式 Qdrant (`:memory:` 或本地目录)
- **生产**：独立 Qdrant 服务器 (环境变量 `QDRANT_HOST`)

---

## 4. 技术栈

| 层级            | 技术选型                            | 说明                                  |
| --------------- | ----------------------------------- | ------------------------------------- |
| **桌面框架**    | Tauri 2.x                           | 轻量级跨平台桌面容器 (Rust + WebView) |
| **前端框架**    | React 19 + TypeScript               | 声明式 UI，类型安全                   |
| **前端构建**    | Vite 5                              | 闪电般快速的前端开发体验              |
| **样式**        | Tailwind CSS                        | 原子 CSS，快速原型                    |
| **状态管理**    | React Context + Hooks               | 轻量级全局状态                        |
| **后端框架**    | FastAPI (开发) / JSON-RPC (生产)    | 高性能 Python 框架                    |
| **Python 版本** | 3.12+                               | 现代 Python 特性                      |
| **Rust 绑定**   | PyO3                                | Python 调用 Rust 代码的桥梁           |
| **数据库**      | SQLite                              | 轻量本地数据库，适合桌面应用          |
| **向量数据库**  | Qdrant                              | 高效向量搜索，支持嵌入式和远程        |
| **向量模型**    | Sentence Transformers               | 高质量句子向量，支持 CPU 推理         |
| **LLM 集成**    | OpenAI / Google Gemini / 自定义端点 | 灵活的提供商支持                      |
| **密钥存储**    | Tauri Stronghold                    | 加密本地密钥管理                      |
| **构建系统**    | Cargo (Rust) + Poetry (Python)      | 依赖隔离与版本管理                    |
| **打包**        | PyInstaller + Tauri Bundle          | 跨平台二进制分发                      |

**技术选择原因**：
- **Tauri**：相比 Electron，体积小 (~20MB vs ~150MB)，内存占用少
- **React + TypeScript**：类型安全，开发效率高，社区成熟
- **SQLite**：无需数据库服务器，适合单用户桌面应用
- **Qdrant**：开源、性能优异，支持离线部署
- **PyO3**：性能关键路径用 Rust，其余用 Python (开发快速)

---

## 5. 数据流

### 用例 1：文档上传与术语抽取

```
用户上传 PDF
    ↓
前端 (ReadingPanel) 通过 Tauri 调用 store_temp_document
    ↓
Tauri 后端保存临时文件，调用 RPC Worker 的 upload_document
    ↓
RPC Worker:
  1. rust_core.extract_text() → 获得完整文本
  2. RecursiveCharacterTextSplitter → 分块
  3. SentenceTransformer → 生成向量
  4. Qdrant.upsert() → 入库
  ↓
返回 document_id 给前端
    ↓
前端展示 "Upload Success"，允许用户点击 "Extract Terms"
    ↓
前端调用 LLM (OpenAI / Gemini) 的术语提取提示词
    ↓
LLM 返回术语列表 → 展示在 TermsPanel 中
    ↓
用户可点击术语，通过 search_term_contexts 查询向量库
    ↓
Tauri 调用 RPC Worker 的 search 方法 → 返回上下文片段
    ↓
ContextPanel 展示结果
```

### 用例 2：术语保存与复习

```
用户在 TermsPanel 点击 "Save Term" → 术语写入 SQLite
    ↓
术语同时出现在 GlobalTermbaseView 中
    ↓
用户点击 ReviewCenter 标签页
    ↓
Tauri 执行 get_review_terms() → 返回待复习术语列表 (按 SRS 算法排序)
    ↓
用户进行 "认识 / 不认识" 选择
    ↓
Tauri 调用 submit_review_result() → 更新 review_history 表，计算下次复习时间
    ↓
间隔重复调度 (Spaced Repetition Scheduler)
```

---

## 6. 关键设计决策

### 6.1 RPC Worker 作为本地进程，而非 FastAPI 服务器

**决策**：在生产版本中，后端从 FastAPI 迁移到 JSON-RPC Worker (PyInstaller 打包)。

**优缺点**：

| 方面         | JSON-RPC Worker              | FastAPI                    |
| ------------ | ---------------------------- | -------------------------- |
| **优点**     | 体积小、离线可用、启动快     | 易于测试、支持 HTTP 客户端 |
| **缺点**     | 调试困难、stdio 通信需序列化 | 体积大、需要网络端口       |
| **适用场景** | 桌面应用的本地处理           | 云服务、多客户端场景       |

**权衡**：优先离线可用性和用户体验，接受调试复杂度增加。

---

### 6.2 混合 Python + Rust 架构

**决策**：业务逻辑用 Python，性能关键路径用 Rust (PyO3)。

**优缺点**：

| 语言       | 场景                       | 原因                   |
| ---------- | -------------------------- | ---------------------- |
| **Python** | 配置管理、向量化、API 调用 | 开发快速，库生态丰富   |
| **Rust**   | 文本提取、格式解析         | 性能、安全、无 GC 停顿 |

**权衡**：开发效率 vs. 运行时性能的最优平衡。

---

### 6.3 Qdrant 本地嵌入式模式 (开发) vs. 远程模式 (生产)

**决策**：支持两种模式，通过环境变量切换。

**优缺点**：

| 模式       | 场景             | 优点                   | 缺点                 |
| ---------- | ---------------- | ---------------------- | -------------------- |
| **嵌入式** | 开发、单用户     | 无需额外服务、开箱即用 | 数据持久化需手动配置 |
| **远程**   | 企业部署、多用户 | 中心化数据管理、容灾   | 网络依赖、延迟       |

**权衡**：默认嵌入式便于体验，可选远程支持扩展性。

---

### 6.4 SQLite 作为本地数据库

**决策**：术语库、复习记录、配置存放在 SQLite。

**优缺点**：

| 方案          | 术语库     | 复习记录     | 配置       |
| ------------- | ---------- | ------------ | ---------- |
| **SQLite**    | ✅ 本地事务 | ✅ ACID 保障  | ✅ 简单高效 |
| **JSON 文件** | ❌ 并发冲突 | ❌ 数据校验难 | ✓ 可读性高 |
| **云同步**    | ⚠️ 延迟     | ⚠️ 同步复杂   | ⚠️ 隐私风险 |

**权衡**：以本地离线优先，必要时支持导出/导入跨设备迁移。

---

## 7. 扩展性与演进路径

### 短期 (v0.2 ~ v0.3)
- ✅ 多文件批量上传
- ✅ Windows/macOS/Linux 跨平台支持
- 📋 Markdown、Word 文档支持
- 📋 更强大的 LLM 模型支持

### 中期 (v0.4 ~ v0.5)
- 📋 云端术语库同步 (带端到端加密)
- 📋 团队协作与共享术语库
- 📋 本地向量模型微调
- 📋 实时文本标注与高亮

### 长期 (v1.0+)
- 📋 浏览器插件 (网页阅读时快速查询)
- 📋 移动应用 (iOS / Android)
- 📋 AI 生成学习路径与推荐
- 📋 社区开放术语库市场

---

## 8. 部署与运行环境

### 开发环境
```bash
# 前端
cd client && pnpm install && npm run tauri dev

# 后端
cd backend && poetry install && poetry run python -m app.main

# Qdrant (本地嵌入式)
自动初始化在 /tmp/lexai_qdrant
```

### 生产环境
```bash
# 打包应用
npm run tauri build

# 输出物
- Linux: .AppImage / .deb / .rpm
- macOS: .dmg / .app
- Windows: .msi / .exe
```

**系统要求**：
- OS: Windows 10+, macOS 10.13+, Ubuntu 16.04+
- RAM: ≥2GB
- 磁盘: ≥500MB (含模型)

---

## 参考资源

- [Tauri 官方文档](https://docs.tauri.app/)
- [React 官方文档](https://react.dev/)
- [PyO3 使用指南](https://pyo3.rs/)
- [Qdrant 向量搜索文档](https://qdrant.tech/documentation/)
- [Sentence Transformers](https://www.sbert.net/)

