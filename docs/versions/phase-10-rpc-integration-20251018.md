## 1. 背景 & 目标
- 阶段范围：Phase 10 旨在用内置 JSON-RPC worker 取代 FastAPI 后端，实现离线桌面版后端轻量化，并确保 PDF 文档解析不再依赖 Java/GraalVM。
- 关联文档：`docs/03-开发阶段要求.md`、`docs/02-产品路线图.md`（Phase 10 Native RPC Integration）。
- 验收标准（路线图）：
  - Python worker 作为随应用分发的独立可执行文件，由 Tauri 直接托管。
  - Tauri 通过 stdin/stdout 完成健康检查、文档上传、术语检索等 RPC 调用。
  - 构建/发布流程保持可运行，为 v0.2.0-rc.2 做准备。

## 2. 完成项 & 证据
- 功能/任务清单：
  - 将 `rust_core` 文档提取实现改写为使用 vendored `pdf-extract`（纯 Rust PDF 解析），剔除 `extractous` 与 Java 依赖。
  - 针对 pdf-extract 的错误信息新增分类逻辑，`app/services._classify_extraction_failure` 能识别“invalid file header”“encrypted”等场景。
  - 更新 `rpc_server.spec`，移除 GraalVM/AWT 数据收集，PyInstaller 仅携带 `rust_core` 动态库与必要 Python 依赖。
  - 通过 `maturin develop --release` 与 `build.py` 重建 `backend/dist/rpc_server/`，验证文本/伪造 PDF 的错误信息正确返回。
  - 将最新 PyInstaller 产物复制到 `client/src-tauri/resources/rpc_server/`，供 Tauri 在运行时直接拉起。
- 运行截图/接口示例：
  - `python3` 子进程向 `dist/rpc_server/rpc_server` 发送上传请求：
    ```json
    {"jsonrpc": "2.0", "id": 1, "method": "upload_document", ...}
    ```
    返回 `{"error": {"code": -32001, "message": "Unsupported document format"}}`，表明非 PDF 文件被正确拒绝。
  - Rebuild 后的资源目录：`client/src-tauri/resources/rpc_server/` 仅包含 15 个文件（worker 主体 + `_internal` 共享库）。
- 性能与指标：暂无显著回归数据；后续需在真实 PDF 样本上补采提取/嵌入耗时基线。

## 3. 质量闸门状态
- Build: 未执行（待完成 `npm run tauri build` 及桌面端全量打包验证）。
- Lint/Typecheck: 部分通过（`cargo fmt`、`maturin develop` 成功；`cargo clippy`/TypeScript 构建尚未复跑）。
- Tests: 未执行（需补跑前端 Vitest、Tauri 集成测试以及后端单测）。

## 4. 变更清单（Changelog）
- 主要 PR：`feature/P10-native-rpc`（计划合并至 `main`）。
- 关键提交（草案）：
  - `feat(rpc): switch pdf extraction to pdf-extract`
  - `chore(pyinstaller): strip graalvm assets from rpc_server`
  - `fix(classifier): map invalid file header to unsupported format`
  - `chore(resources): sync rebuilt rpc_server bundle`

## 5. 架构/Schema 快照
- 组件关系：
  - Tauri `RpcClient` → `rpc_server`（PyInstaller 打包 Python）→ `rust_core`（PyO3 扩展）→ pdf-extract → Qdrant/SentenceTransformers。
  - 资源路径固定于 `client/src-tauri/resources/rpc_server/`，启动时通过 `LD_LIBRARY_PATH` 指向 `_internal` 共享库。
- 数据流：
  1. 前端调用 `store_temp_document` 写入临时文件；
  2. 调用 `upload_document` 将文件路径传递给 RPC worker；
  3. worker 调用 `rust_core.extract_text`，成功后写入向量库并返回 `document_id`；
  4. Tauri 删除临时文件并向前端返回结果。
- 打包结构：PyInstaller Folder 模式（单二进制 + `_internal/` 共享库），无需 Java 运行时。

## 6. 风险与问题
- 已知缺陷：
  - pdf-extract 仅支持 PDF，DOCX/HTML 等格式暂不兼容。
  - 尚未在真实 PDF 样本集合上完成端到端回归测试。
  - RPC worker 依赖 HuggingFace 下载模型，离线部署需提供缓存或打包模型。
- 风险与回退策略：
  - 若 pdf-extract 出现解析缺陷，仍可从 git 历史恢复 FastAPI/extractous 路径，或引入其他 Rust 解析库。
  - 发布前需在 CI 中增加 PyInstaller 构建 + 基础冒烟测试，防止资源缺失导致运行时崩溃。

## 7. 下一步计划
- 下阶段优先级：
  - 补齐 E2E 验证：`npm run tauri dev`/`build`、Vitest、Tauri 集成测试、Qdrant 离线冒烟。
  - 针对 pdf-extract 采集性能与失败案例，补充重试/日志策略。
  - 更新 README/CONFIGURING 与 Phase 文档，说明 PDF-only 支持与部署流程。
  - 预备 v0.2.0-rc.2：版本号提升、Changelog、Release Notes。
- 估算：
  - 测试与打包验证：2 人日。
  - 文档补全与发布准备：1.5 人日。
  - pdf-extract 兼容性调研及回归：2 人日。
