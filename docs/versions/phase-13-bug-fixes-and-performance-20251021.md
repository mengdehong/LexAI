# Phase 13 - Bug Fixes, UX Enhancements, and Performance Tuning

> 符合模板：按 `docs/versions/_TEMPLATE.md` 填充阶段总结。

## 1. 背景 & 目标
- 阶段范围：修复“查看语境”参数缺失、精简全局术语库列、优化术语提取与联想 Prompt、完善诊断能力与入口、基础性能优化（交互流畅度）。
- 关联文档：`docs/versions/phase-12-ui-and-workspace-20251021.md`
- 验收标准（来自路线图）：
  1) 修复 search_term_contexts 缺参；2) 全局术语库移除“中文释义”列；3) 提升术语提取召回/准确；
  4) 诊断功能可用；5) 联想示例句为英文；6) 交互流畅、处理性能提升。

## 2. 完成项 & 证据
- 功能/任务清单：
  - [x] 语境查看参数对齐：Tauri 命令兼容 doc_id/docId/document_id，前端统一传参；调用示例：`invoke("search_term_contexts", { doc_id: <documentId>, term })`。
  - [x] 全局术语库精简：移除“中文释义”UI 列（thead/tbody），搜索与导出仍保留中文释义字段。
  - [x] 术语提取 Prompt 升级：高召回+高精度，长文80–120/中40–80/短20–40；仅输出最小 JSON（term/definition），去重与规范化。
  - [x] 诊断能力：健康检查、stderr tail、重启后端；入口从顶栏迁移至“设置/用户偏好”。
  - [x] 联想 Prompt 语言约束：示例句一律英文（US），其余内容随界面语言；相关单测通过。
  - [x] 交互优化：术语库搜索 150ms 防抖；将“语境句”移动至“提取视图”下方，减少视线切换。
- 运行截图/接口示例：
  - 前端调用：`invoke("search_term_contexts", { doc_id: "<uuid>", term: "Attention" })` → 返回 3–5 条片段。
  - Prompt 片段（提取）：仅返回 `[{"term":"...","definition":"..."}, ...]` 的最小 JSON；禁止 Markdown/多余键。
- 性能与指标：
  - 过滤交互更顺滑（输入–结果更新延迟≈150–250ms，取决于数据量）。
  - 构建体积稳定；无新重型依赖；后端保持多线程与超时保护。

## 3. 质量闸门状态
- Build: PASS（`npm -w client run -s build` 成功；Tauri `cargo check --manifest-path client/src-tauri/Cargo.toml` 通过）。
- Lint/Typecheck: PASS（TypeScript 编译通过，随 build 执行）。
- Tests: PASS（vitest 7/7；新增/更改的 Prompt 断言已更新以匹配英文示例句策略）。

## 4. 变更清单（Changelog）
- 主要 PR：本阶段开发变更已本地完成，待整理 PR（含前端 UI、Prompt、Tauri 命令兼容性）。
- 关键提交（示例）：
  - chore(backend): prune unused rpc_worker deps…（7083361）
  - chore(deps): remove unused embla-carousel-react and @tauri-apps/plugin-opener（28d35cd）
  - feat(prompt): upgrade term extraction prompt; enforce EN example sentences in deep‑dive（pending）
  - feat(ui): move ContextPanel under ExtractedViewer; remove ZH column from termbase UI（pending）
  - feat(settings): move Diagnostics entry into Settings→User Preferences; style full‑width near‑white bar（pending）
  - fix(tauri): search_term_contexts accept doc_id/docId/document_id; forward as document_id（pending）

## 5. 架构/Schema 快照
- 前端：
  - App 布局：左列 DocumentPanel→ExtractedViewer→ContextPanel；右列 TermsPanel。
  - SettingsView 集成 DiagnosticsPanel（内联开关）。
  - PromptBuilder：提取/联想提示词强化，输出契约严格化（最小 JSON）。
- 原生层（Tauri）：`search_term_contexts(doc_id|docId|document_id, term)` 归一化为 RPC `document_id`；无 DB 结构变更。

## 6. 风险与问题
- 已知缺陷：无阻断性问题；“中文释义”仅从 UI 隐藏，数据与导出保留。
- 风险与回退策略：
  - Prompt 调整可能影响术语数量/稳定性 → 保留旧提示词回退路径；单测覆盖关键约束。
  - 命令兼容性 → 同时接受多键名，向后兼容旧前端调用。

## 7. 下一步计划
- 下阶段优先级：
  1) 术语表虚拟化（大数据量渲染性能）
  2) 高亮计算 Worker 化与分片处理
  3) RPC/DB 侧检索参数调优与必要索引
  4) 更多交互细节打磨（键盘导航、无障碍）
- 估算：2–3 天（不含跨平台打包/验收）。
