# Phase 2 总结：client-workflow-20251012

## 1. 背景 & 目标
- 阶段范围：交付 LexAI Phase 2 “核心桌面闭环”，实现 Tauri 前端与 FastAPI 后端的上传 → 术语抽取 → 上下文检索 → 术语收藏全流程。
- 关联文档：`docs/03-开发阶段要求.md`、`docs/04-参考实现思路.md`、Phase 0/Phase 1 总结。
- 验收标准（路线图）：
  1. 客户端可上传多类型文档并看到处理状态；
  2. 点击 Extract Terms 能调用 LLM 返回术语列表；
  3. 选中术语可检索上下文片段；
  4. 术语可写入本地术语库并在 Global Termbase 页面查看/删除；
  5. 全链路在本地可重复演示。

## 2. 完成项 & 证据
- 功能/任务清单：
  - **客户端工作流**：新增 `DocumentPanel / ReadingPanel / TermsPanel / ContextPanel / GlobalTermbaseView` 五区布局，`AppStateProvider` 统一管理文档、术语、上下文与选中状态。
  - **上传体验**：处理二进制文件的预览降级（无法 `FileReader` 时提示 “Preview unavailable …” 但仍提交），按钮/状态条在异步阶段显示 Loading/Error/Success。
  - **术语抽取**：`ReadingPanel` 支持 OpenAI 与 Gemini 双通道，通过 `VITE_OPENAI_API_KEY` / `VITE_GEMINI_API_KEY` 选择路线；抽取后自动刷新术语列表并清空旧上下文。
  - **上下文检索**：`TermsPanel` 使用新的 Tauri command `search_term_contexts` 命中 FastAPI `/documents/{doc_id}/search`，`ContextPanel` 展示得分靠前的片段。
  - **术语库管理**：Tauri Rust 层新增 `add_term / get_all_terms / delete_term`，利用 `SqliteConnectOptions::create_if_missing(true)` 将 `lexai.db` 固定在应用数据目录，解决 `SQLITE_CANTOPEN`。
  - **后端稳健性**：
    - `create_qdrant_client` 默认走本地嵌入式目录 `/tmp/lexai_qdrant`，自动建目录、生成 UUID point id，并在缺失时创建 collection；
    - FastAPI 引入 CORS 中间件，白名单包含 `http://localhost:1420`、`http://127.0.0.1:1420`、`tauri://localhost`；
    - `rust_core` 重新发布 `extract_text`，`ensure_collection` 兼容本地 Qdrant 的 `ValueError`。
  - **环境配置**：`client/.env` 管理 LLM key；前端健康检查失败时自动轮询重试，避免冷启动常驻 “load failed”。
- 运行截图 / 演示：
  - 建议录制 `docs/assets/phase-2-workflow.gif` 展示上传 → Extract Terms → Save Term → Global Termbase 的 Tauri UI 流程（可通过本地 `npm run tauri dev` 复现）。
- 接口/控制台示例：
  - `curl -F file=@/etc/hosts http://127.0.0.1:8000/documents/upload` ⇒ 201 + `Document processed successfully`；
  - `curl http://127.0.0.1:8000/documents/<doc_id>/search?term=LexAI` ⇒ 返回命中片段与得分。

## 3. 质量闸门状态
- Build：PASS — `npm run build`、`cargo build`；
- Tests：PASS — `poetry run pytest`（覆盖上传→检索闭环，Mock Qdrant/LLM）；
- Lint：暂未基线（待 Phase 3 引入 Ruff/MyPy）。

## 4. 变更清单（Changelog）
- 关键提交（示例）：
  - `feat(client): implement phase-2 workflow panels and state`
  - `feat(tauri): add sqlite term commands and search proxy`
  - `feat(backend): support embedded qdrant and cors`
  - `fix(client): degrade binary preview and add status retry`
- 重要配置：`client/.env` 引入 `VITE_*` Key；`/tmp/lexai_qdrant` 作为默认嵌入式存储。

## 5. 架构 / Schema 快照
- **前端 React/Tauri**：
  - `AppStateProvider` 负责文档/术语/上下文共享；
  - UI 面板按工作流排列，`GlobalTermbaseView` 从 Tauri 命令获取 SQLite 数据；
  - `vite.config.ts` 通过别名导入 `@tauri-apps/api/core`，`.env` 控制 LLM Key。
- **Tauri Rust 层**：
  - `search_term_contexts` 用 `reqwest` 调 FastAPI；
  - `add_term/get_all_terms/delete_term` 直接操作 `SqlitePool`，数据库存放于 `app_data_dir/lexai.db`。
- **后端 FastAPI**：
  - `process_and_embed_document`：Extractous → TextSplitter → SentenceTransformer → 本地 Qdrant；
  - `create_qdrant_client` 支持 URL 或本地路径，自动建库与 collection；
  - `app/main.py` 引入 CORS 中间件、保持 Phase 0/1 的健康检查。

## 6. 风险与问题
- HuggingFace `tokenizers` 在多进程下会提示并行警告，需要在生产部署时设置 `TOKENIZERS_PARALLELISM=false`；
- 本地 Qdrant 嵌入式数据默认放在 `/tmp`，若要长期保留，应改为可持久化目录或挂载磁盘；
- LLM API Key 需本地配置，不适合直接写入仓库，后续 CI/CD 要引入密钥管理（例如 GitHub Actions secrets）。

![Demo](https://wenmou-1313491726.cos.ap-shanghai.myqcloud.com/20251012183527362.gif?imageSlim)

## 7. 下一步计划
- 整理 Phase 2 演示素材（截图/GIF）并归档至 `docs/assets/`；
- Phase 3：实现术语工作台细节（批量操作、AI 释义、术语全局检索）、补充 lint/typecheck pipeline；
- 针对嵌入式 Qdrant 评估数据迁移至远端集群的方案，并新增健康检测/阈值配置。
