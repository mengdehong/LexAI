# Phase 4 总结：onboarding-and-termbase-20251012

## 1. 背景 & 目标
- 阶段范围：交付 Phase 4 的对话式入门、全球术语库增强、UI/UX 打磨与生产化校验。
- 关联文档：`docs/03-开发阶段要求.md`、`docs/02-需求分析&架构初稿.md`、`docs/ai_coding_prompt.md`。
- 验收标准（来自路线图）：
  1. 首次启动提供对话式入门流程并自动生成起始术语表；
  2. 全球术语库支持搜索、编辑、去重与导出；
  3. 应用界面风格一致，提供反馈机制与空状态；
  4. 交付生产可用的构建/校验流程与文档。

## 2. 完成项 & 证据
- 功能/任务清单：
  - 新增 `OnboardingView`，四步对话式采集领域/熟练度/目标，调用 LLM 生成 12 条术语并批量写库。
  - 扩展 `promptBuilder`/`llmClient`，加入 `buildOnboardingPrompt`、`generateOnboardingTerms`，统一 JSON 解析与操作分派。
  - `App.tsx` 引入入门开关、设置页旁路与配置刷新，保证首次运行强制完成入门。
  - `TermsPanel` 去重逻辑、重复术语更新提示；`GlobalTermbaseView` 支持模糊搜索、内联编辑、CSV 导出与 Toast/空状态。
  - Rust 端新增 `find_term_by_name`、`update_term`、`export_terms_csv`，整合 `tauri-plugin-dialog` 保存对话框。
  - `App.css` 梳理主题变量、聊天气泡、加载态、表格工具栏等视觉规范；README 重写以覆盖 Vision、Feature Tour、Setup。
  - `.github/workflows/ci.yml` 创建 CI，执行 React 构建、`cargo fmt --check`、`cargo clippy -D warnings`。
- 运行截图/接口示例：入门流程与术语库交互已在 `client/src/components/OnboardingView.tsx`、`GlobalTermbaseView.tsx` 实现，可通过 `npm run tauri dev` 复现；CSV 导出会弹出原生保存对话框。
- 性能与指标：本阶段未新增量化指标，后续待大规模术语量测试再补充检索性能。

## 3. 质量闸门状态
- Build: PASS — `npm --prefix client run build`（包含 `tsc` 编译与 Vite 产物）。
- Lint/Typecheck: PASS — `cargo fmt --all`、`cargo clippy --all-targets -D warnings`。
- Tests: 暂未补充自动化测试；计划在阶段后续补齐端到端与单元覆盖。

## 4. 变更清单（Changelog）
- 主要 PR：待与 Phase 4 主干合并请求同步整理。
- 关键提交（计划）：
  - `feat(onboarding): add conversational onboarding workflow`
  - `feat(termbase): enable fuzzy search, inline edit and csv export`
  - `feat(llm-client): support onboarding prompt generation`
  - `feat(tauri): integrate dialog plugin for term export`
  - `style(app): refresh global ui tokens and onboarding visuals`
  - `ci: add build + rust lint workflow`
  - `docs: refresh readme with phase 4 capabilities`

## 5. 架构/Schema 快照
- 前端：
  - `OnboardingView` 负责对话式采集、LLM 调用、批量写库；
  - `App.tsx` 管理入门 gating、视图切换与设置后刷新；
  - `GlobalTermbaseView` 承担搜索、编辑、导出及反馈，`TermsPanel` 处理重复术语更新分支；
  - CSS 统一按钮/色板/排版变量，新增 Toast 与 Loading 组件样式。
- LLM & 配置：`promptBuilder`/`llmClient` 通过 `buildSystemPrompt`、`runTermOperation` 共享解析逻辑，支持按语言定制引导文案。
- 桌面端：
  - `lib.rs` 引入新命令，使用 `tauri-plugin-dialog` 的 `DialogExt::file().save_file` 导出 CSV；
  - SQLite 结构保持不变，通过 `find_term_by_name`/`update_term` 实现去重与编辑。
- CI：GitHub Actions 统一 Node/Rust 工具链，确保提交前构建与格式校验通过。

## 6. 风险与问题
- 已知缺陷：
  - API Key 仍存储于本地配置，尚未回归安全存储（Phase 3 遗留）。
  - Onboarding GIF/媒体未生成，README 仍引用占位路径。
- 风险与回退策略：
  - LLM 提供商未配置时，入门流程引导用户跳转设置；如仍失败，可手动设置 `onboardingComplete=true` 回退。
  - CSV 导出依赖宿主文件系统权限，如对话框失败，可临时使用手动复制（待补 error 处理）。

## 7. 下一步计划
- 下阶段优先级：
  1. 恢复安全密钥存储（钥匙串/Secret Service），提供迁移指引；
  2. 录制入门流程演示 GIF，完善 README 媒体资产；
  3. 为 Onboarding Prompt/Term Deduplication 编写单元测试与端到端脚本；
  4. 评估文档选区快捷操作等 Stretch 目标。
- 估算：安全存储与媒体资产约 1 周；测试与自动化补齐约 1 周；交互增强另行排期。
