# Phase 3 总结：advanced-config-20251012

## 1. 背景 & 目标
- 阶段范围：实现 Phase 3 的高级配置能力，覆盖服务商管理、模型映射、语言偏好与文档体验打磨。
- 关联文档：`docs/03-开发阶段要求.md`、`docs/02-需求分析&架构初稿.md`、`docs/ai_coding_prompt.md`。
- 验收标准（来自路线图）：
  1. 设置页可管理多家 LLM 服务商与模型映射；
  2. 用户可选择术语释义语言，并影响 Prompt 构造；
  3. 术语提取遵循模型映射/偏好；
  4. 文档上传与界面支持中文、多格式文件；
  5. 其余高级功能（对话式引导、导出）规划为后续工作。

## 2. 完成项 & 证据
- 功能/任务清单：
  - 新增 `SettingsView`，支持服务商增删改、默认模型配置、Base URL、API Key（可选）以及释义语言选择。
  - 实现 `promptBuilder` 与 `llmClient`，统一 LLM 调度流程并根据语言偏好生成 Prompt。
  - 重新设计术语提取流程，自动解析 JSON 返回值并提示配置缺失情况。
  - 调整上传面板，对 PDF/DOCX 提供预览降级提示但保持可上传；引入 Noto Sans SC 字体修复中文渲染。
  - 配置持久化整合至 `tauri-plugin-store`，API Key 支持配置或环境变量回退。
- 运行截图/接口示例：可通过 `npm run tauri dev` 复现设置页与提取流程，截图已在内部演示记录中保留。
- 性能与指标：本阶段未引入额外性能基准，后续在统一调度落地后补充成本/延迟对比。

## 3. 质量闸门状态
- Build: PASS — `npm run build`。
- Lint/Typecheck: 未纳入（Phase 4 计划引入 Ruff / TypeScript lint pipeline）。
- Tests: 未编写自动化测试，待对配置与调度进行单元/端到端覆盖。

## 4. 变更清单（Changelog）
- 主要 PR：待与 Phase 3 合并请求一并整理。
- 关键提交（计划）：
  - `feat(client-settings): add provider management and preferences`
  - `refactor(client-llm): introduce prompt builder and config-aware dispatcher`
  - `chore(client-style): add settings layout and chinese font`

## 5. 架构/Schema 快照
- 前端：
  - `SettingsView` 承担配置录入；
  - `configStore.ts` 统一 store 访问，提供默认结构；
  - `promptBuilder` + `llmClient` 负责 Prompt 组装与响应解析。
- Tauri：去除 keyring 插件，仅保留 opener/store，减少系统依赖；
- 配置：Provider 记录 `id/name/vendor/defaultModel/baseUrl/apiKey`，API Key 优先取配置值，无则按 `VITE_*` 环境变量回退。

## 6. 风险与问题
- 已知缺陷：API Key 暂存于本地配置文件，缺乏安全存储；对话式引导与导出能力仍未交付。
- 风险与回退策略：
  - 若遇到缺失 Key，前端提示使用环境变量；
  - 可通过禁用高级配置回退至单一模型（默认映射）。

## 7. 下一步计划
- 下阶段优先级：
  1. 重新接入系统钥匙串或替代方案，恢复安全密钥存储；
  2. 实现对话式引导和术语导出，以满足 Phase 3 完整验收；
  3. 为配置与调度补充自动化测试、引入 Lint/Typecheck 管线。
- 估算：安全存储与引导功能共约 1.5~2 周，测试与管线硬化约 1 周。
