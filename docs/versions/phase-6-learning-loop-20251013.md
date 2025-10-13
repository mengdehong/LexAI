# Phase 6 总结：learning-loop-20251013

## 1. 背景 & 目标
- 阶段范围：
  1. 修复 Settings 与全局 UI 在中文环境下的显示与即时切换问题。
  2. 将一次性 Onboarding 升级为可重复调用的 “AI 生成术语集” 能力，保持术语库去重写入。
  3. 建立轻量可用的复习闭环，并引入术语联想/深度学习能力，丰富学习价值。
- 关联文档：`docs/03-开发阶段要求.md`、产品路线图 Phase 6 需求（固化核心 & 深化价值）。
- 验收标准（来自路线图）：
  - 中文 UI 体验与语言切换 100% 正常。
  - 用户可随时通过按钮调用 AI 对话生成术语并去重入库。
  - 复习模式具备 “认识/不认识” 流程与每日待复习提示。
  - 术语联想提供 AI 生成的例句、场景、关联词结构化输出。

## 2. 完成项 & 证据
- 功能/任务清单：
  - 新增 `LocaleProvider`，完成顶栏、各主面板、提示语的双语切换与即时刷新。
  - 顶栏加入 “AI 生成术语集” 按钮，Onboarding 支持重复调用、术语去重写入并刷新缓存。
  - 建立独立 `ReviewCenter` 视图，复习任务计数显示在导航按钮上，复习流程支持双语提示。
  - 全局术语库保留管理能力，新增 “术语联想” 模态，AI 返回结构化 JSON（例句/场景/关联术语）。
  - 术语列表新增 “查看语境” 引导文案，语境功能入口更明显。
  - `extractJsonPayload` 支持对象 JSON 提取，解决术语联想 JSON 解析异常。
- 运行截图/接口示例：暂无（待后续补充 UI 截图）。
- 性能与指标：本阶段未引入新的性能指标；保持原有处理链路，已验证构建流程正常。

## 3. 质量闸门状态
- Build: PASS（`npm run build`，包含 `tsc` 与 Vite 产物构建）。
- Lint/Typecheck: PASS（随 `npm run build` 执行 `tsc` 类型检查）。
- Tests: 未执行自动化测试（暂无前端/后端测试脚本，本次以编译校验为准）。

## 4. 变更清单（Changelog）
- 主要 PR：待将 `feature/P6-learning-loop-and-fixes` 合入 `main` 后创建。
- 关键提交（示例）：
  - `feat(app): add locale provider and bilingual ui copy`
  - `feat(review): promote review center to top-level view`
  - `feat(assist): add term deep dive modal with json prompt`
  - `fix(assist): harden json parsing for deep dive responses`
  - `docs(versions): add phase-6 summary 20251013`

## 5. 架构/Schema 快照
- 前端：
  - 新增全局 `LocaleProvider`，`App.tsx` 负责同步设置语言。
  - `ReviewCenter` 组件独立管理复习队列，与 Tauri 命令 `get_review_terms`、`submit_review_result` 对接。
  - `GlobalTermbaseView` 专注术语管理，保留 `expandTerm` 入口并向上汇报待复习数量。
  - `llmClient` 新增 `buildTermExpansionPrompt` 与 `expandTerm`，统一 JSON 提取逻辑。
- 后端（Tauri）：继续使用 `get_review_terms` / `submit_review_result`，排序逻辑未改动，供新复习视图复用。

## 6. 风险与问题
- 已知缺陷：
  - UI 双语覆盖面已扩展，但仍存在部分辅助提示未翻译（后续迭代补齐）。
- 风险与回退策略：
  - Deep Dive 强依赖 LLM 返回结构化 JSON，如模型响应不规范仍会报错；保留错误提示与重试入口。
  - 复习任务量依赖 `get_review_terms` 排序，若后端策略调整需同步前端逻辑。

## 7. 下一步计划
- 下阶段优先级：
  - 扩充中文文案覆盖与本地化测试。
  - 引入更智能的复习算法（权重、间隔动态调整）。
  - 结合术语联想数据构建 “动态知识网络” 视图。
- 估算：
  - 文案补全与 QA：1 sprint。
  - 复习算法增强（含后端策略）：1-2 sprint。
  - 知识网络原型：2 sprint。
