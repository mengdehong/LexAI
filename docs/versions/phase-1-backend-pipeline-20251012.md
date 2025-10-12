# Phase 1 Backend Pipeline 实施总结（2025-10-12）

## 1. 背景 & 目标
- 阶段范围：完成文档解析、文本切分、向量化与 Qdrant 入库的后端基础能力，交付 `/documents/upload` 与 `/documents/{doc_id}/search` API。
- 关联文档：`docs/03-开发阶段要求.md`；补充：`backend/app/services.py`, `backend/rust_core/src/lib.rs`。
- 验收标准（来自路线图）：
  1. 上传任意 PDF/Office 文档可完成文本抽取；
  2. 文本分块并生成向量写入向量库；
  3. 可按文档内关键字检索并返回命中片段与得分。

## 2. 完成项 & 证据
- 功能/任务清单：
  - 引入 `3rd/extractous` 子模块，`rust_core` 依赖改为本地 path，并通过其构建脚本自动下载 GraalVM 原生库以完成文本抽取能力；
  - `rust_core` 暴露同步 `extract_text`，`services` 通过 `asyncio.to_thread` 适配；
  - 新增 `app/config.py` 基于 Pydantic Settings 管理 Qdrant/模型配置；
  - `services.process_and_embed_document` 串联文本抽取、`RecursiveCharacterTextSplitter` 分块、`SentenceTransformer` 向量化与 Qdrant `upsert`；
  - `documents` 路由提供上传与检索 API，封装文件落盘、UUID 管理、临时文件回收；
  - 新建 Pydantic Schema（`DocumentUploadResponse`、`SearchResponse` 等）标准化接口；
  - 集成测试 `tests/test_pipeline.py` 覆盖上传→检索全链路（使用内存 Qdrant stub & SentenceTransformer stub）。
- 运行截图/接口示例：
  - `poetry run pytest backend/tests/test_pipeline.py` ➜ `1 passed`; 调用日志详见测试输出。
- 性能与指标：
  - 当前测试使用轻量 stub，尚无真实吞吐指标；待接入真实 Qdrant/句向量模型后补测。

## 3. 质量闸门状态
- Build: PASS（`cd backend/rust_core && maturin build --release --interpreter python3`）
- Lint/Typecheck: 未执行（Phase 1 暂无 lint baseline，需后续补充 Ruff/MyPy pipeline）
- Tests: PASS（`pytest`，覆盖上传+检索 happy path，含 Rust mock 提取链路）

## 4. 变更清单（Changelog）
- 主要 PR：待创建（feature/Phase1-backend-pipeline → main）
- 关键提交（计划）：
  - `feat(backend): add document pipeline services and router`
  - `feat(rust-core): integrate extractous core for text extraction`
  - `test(backend): add upload/search integration coverage`

## 5. 架构/Schema 快照
- 组件：
  - `rust_core.extract_text`：调用本地 path 依赖的 Extractous，构建时由其 `build.rs` 自动下载 GraalVM/Gradle 并生成 Apache Tika 原生库，实现多格式解析；
  - `services.process_and_embed_document`：负责切分（1000/200 overlap）、句向量生成（`SentenceTransformer`，默认 `all-MiniLM-L6-v2`）、Qdrant upsert；
  - `documents` Router：
    - `POST /documents/upload` → 保存临时文件、调用服务层、清理缓存；
    - `GET /documents/{doc_id}/search` → 根据 `document_id` 过滤 Qdrant，返回前 5 条；
- 数据存储：
  - Qdrant 集合 `lexai_documents`，payload：`{document_id, chunk_text}`，向量维度由模型决定。

## 6. 风险与问题
- 已知缺陷：
  - Extractous 构建需要联网下载 GraalVM/Gradle 原生镜像，如网络受限会显著拉长 CI 时间；
  - `SentenceTransformer` 默认为 CPU 版 torch，首次安装较大（>1GB），需要镜像加速或模型预下载。
- 风险与回退策略：
  - 若 Extractous 构建失败，可临时降级为纯 Python 解析（如 pdfminer）作为 fallback，或预先缓存下载产物；
  - Qdrant 不可用时 API 当前直接 500，需后续引入重试 / 降级提示。

## 7. 下一步计划
- 下阶段优先级：
  1. 接入真实 Qdrant 环境并补充 e2e 验证；
  2. 增加查询相关度阈值与分页能力；
  3. 扩展上传文件类型（docx/xlsx/音频）与提取策略；
- 估算：
  - Qdrant 联调 & CI 镜像优化：2 人日；
  - 查询 API 增强（阈值、分页、排序）：1.5 人日；
  - 文件类型扩展与异常兜底：2 人日。
