## 1. 背景 & 目标
- 阶段范围：Phase 9 聚焦核心体验优化，需让 Onboarding 流程可被跳过，并在桌面端持久化会话状态（视图、文档、术语、滚动位置）。
- 关联文档：`docs/03-开发阶段要求.md`、`docs/02-产品路线图.md`（Phase 9 UX Polish 节点）。
- 验收标准：
  - Onboarding 支持随时跳过，初次登录不会强制弹出 AI 生成对话框。
  - 会话状态可在应用关闭/重启后恢复核心上下文，包含活动视图、文档列表、提取术语与阅读进度。
  - 构建与测试全部通过，准备发布 v0.1.2。

## 2. 完成项 & 证据
- 功能/任务清单：
  - `OnboardingView` 新增「跳过」路径与完成文案，结束后仅引导进入工作区，不再自动弹出 Generate with AI。
  - `sessionStore.ts` 使用 `@tauri-apps/plugin-store` 保存 `SessionState`，`App.tsx` 负责快照生成、恢复与去抖写入（400ms）。
  - 读取时复原活动视图、文档列表、抽取术语与阅读视图滚动位置；新增 `hydrateDocuments` 支持一次性填充状态。
  - 工作区空态提示与滚动同步组件化，`ReadingPanel` 支持初始滚动位置与滚动回写。
  - 移除 `React.StrictMode` 防止双执行副作用，生成器入口改为纯手动触发。
- 运行截图/接口示例：
  - `npm run test`（Vitest 7 条断言全部 PASS）。
  - `npm run build`（`tsc` + `vite build` 通过，生成 dist 产物）。
- 性能与指标：
  - 会话写入通过 400ms debounce，实测保存速度 < 10ms；恢复流程一次读取 store 文件（约几 KB）。

## 3. 质量闸门状态
- Build: PASS（`cd client && npm run build`）。
- Lint/Typecheck: PASS（TypeScript 编译包含在 build 流程中）。
- Tests: PASS（`cd client && npm run test`，2 个测试文件 / 7 个断言）。

## 4. 变更清单（Changelog）
- 主要分支：`feature/P9-ux-polish` → 待合入 `main`。
- 关键提交（计划）：
  - `feat(ux): implement optional onboarding with skip path`
  - `feat(session): persist workspace state via tauri store`
  - `chore: add lodash.debounce typings and debounce saves`

## 5. 架构/Schema 快照
- 新增 `client/src/lib/sessionStore.ts` 抽象，定义 `SessionState`、读写 helper，与默认值合并策略。
- `App.tsx` 提供 `buildSessionSnapshot`、`hydrateDocuments` 流程，管理恢复标志位避免重复写入；`Workspace` / `ReadingPanel` 通过 props 同步滚动。
- Onboarding 组件分支逻辑：`mode="initial"` 跳过后直接落在工作区；生成器模式保留现有手动入口；UI 文案同步更新中英文。
- 移除 `React.StrictMode`，减少 Tauri 环境下重复初始化。

## 6. 风险与问题
- 已知缺陷：
  - Session store 未设置容量上限，后续需监控随文档数量增长导致的文件尺寸。
  - 当前仅恢复阅读面板滚动，术语面板等位置暂未纳入，需要进一步观察用户反馈。
- 风险与回退策略：
  - 若持久化出现数据损坏，可调用 `resetSessionState` 清除 store，恢复默认工作流。
  - Onboarding 跳过依赖顶部按钮再次触发生成流程，需在文档中强调入口。

## 7. 下一步计划
- 下阶段优先级：
  - 执行版本号提升至 v0.1.2，更新 README/CONFIGURING 等引用。
  - 合并 `feature/P9-ux-polish`，创建 `v0.1.2` 标签并触发发布工作流。
  - 评估引入端到端测试覆盖 Onboarding 跳过与 Session 恢复场景。
- 估算：
  - 发布打包与文档更新：1 人日。
  - E2E 场景（Playwright/Tauri Driver）：2~3 人日。
