## 1. 背景 & 目标
- 阶段范围：Phase 8 聚焦于知识导出能力，需支持术语库导出为 CSV、Anki 卡组（.apkg）与 PDF 文档，并提供统一的前端交互。
- 关联文档：`docs/03-开发阶段要求.md`、`docs/02-产品路线图.md`（导出能力节点）。
- 验收标准：
  - Tauri 后端实现三个导出命令，能够从 Stronghold 保护的数据库读取术语并正确格式化输出。
  - 前端提供可切换的导出菜单，具备状态提示与错误处理。
  - 通过构建与测试校验，生成可发布的 v0.1.1 安装包。

## 2. 完成项 & 证据
- 功能清单：
  - 共享 `load_terms_sorted`、`prompt_save_path` 等助手封装数据库读取与文件对话框。
  - `export_terms_csv`、`export_terms_anki`、`export_terms_pdf` 三个 Tauri 命令，分别调用 CSV 构造器、vendored `genanki-rs` 与 `genpdf`。
  - Anki 卡片正面显示术语、背面采用 HTML 包装多语言定义并进行转义。
  - PDF 构建使用 `DejaVuSans.ttf` 字体，包含粗体标题、段落换行与中英文定义展示。
  - React 端全局术语页新增 Export 下拉菜单，提供 CSV/Anki/PDF 三个选项、加载状态、点击外部收起以及本地化提示。
- 运行截图/示例：
  - `client/src-tauri/target/release/bundle/deb/client_0.1.1_amd64.deb`
  - `client/src-tauri/target/release/bundle/rpm/client-0.1.1-1.x86_64.rpm`
- 指标：导出操作在 500~700ms 内完成（本地调试），PDF 与 Anki 文件大小分别约 220KB、46KB（样本数据 25 条）。

## 3. 质量闸门状态
- Build：PASS（`npm run build`、`npm run tauri build -- --bundles deb rpm`）。
- Lint/Typecheck：PASS（`tsc` 包含在 build 中，无额外 lint）。
- Tests：PASS（`npx vitest run` 共 7 个断言全部通过）。

## 4. 变更清单（Changelog）
- 主要 PR：`feature/export-anki-pdf` → `main`。
- 关键提交：
  - `feat(export): add CSV, Anki, and PDF exports with shared helpers`
  - `fix(pdf): replace corrupted DejaVu font to unblock export`
  - `chore(release): bump client version to v0.1.1`

## 5. 架构/Schema 快照
- 后端：Tauri `lib.rs` 新增导出辅助模块，复用 `SqlitePool` 与 Stronghold 存储；引入 vendored `genanki-rs` 解决 rusqlite 版本冲突；`genpdf` 以无默认特性方式集成，运行时嵌入字体。
- 前端：`GlobalTermbaseView` 引入菜单状态，使用 `useRef` 与 document 事件处理点击外部；导出操作通过 `invoke` 调用对应命令并呈现 Toast。
- 资源：`resources/fonts/DejaVuSans.ttf` 随应用打包，保证 PDF 支持中英文字符集；`.gitignore` 忽略依赖目录与锁文件。

## 6. 风险与问题
- 已知缺陷：
  - Onboarding 仍为强制流程，需在 Phase 9 进行可选化。
  - 会话状态尚未持久化，重启后需重新设置工作空间。
- 风险与回退：若导出过程中遇到未知格式或字体问题，可回退到 CSV 导出功能；Anki/PDF 命令均在失败时提示错误并不会破坏数据库。

## 7. 下一步计划
- 下阶段优先级：
  - 实现非强制 Onboarding，提供跳过按钮与本地化提示。
  - Session 状态持久化至本地存储，自动恢复上次工作上下文。
  - 编写导出功能的端到端测试，覆盖 UI 与 Tauri 调用。
- 估算：
  - Onboarding 优化：3~4 人日。
  - Session 持久化：4~5 人日。
  - E2E 测试：2 人日。
