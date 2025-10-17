# Phase 7 详解：Release Hardening & Community Launch

> 本文记录 Phase 7（Release Hardening）阶段的上下文、已交付内容、测试策略与后续待办。演示视频不在本文范围内，按需单独跟进。

## 1. 阶段目标与范围

- **使命 (Mission)：** 打磨 LexAI 的发布品质，确保 API 密钥安全、关键业务具备自动化测试、防止回归，同时为正式发布做文档与流程准备。
- **范围：**
  - **P7.T1 – Security Hardening：** 接入 Tauri Stronghold 管理 API 密钥并迁移旧数据。
  - **P7.T2 – Testing Coverage：** 针对 Prompt 构建、多语言偏好、术语去重与 SRS 复习算法编写自动化测试。
  - **P7.T3 – Documentation & Media：** 重写 README、提供配置指引与产品展示素材。（视频另行处理）
  - **P7.T4 – Release Automation：** 补完 release workflow，支持多平台打包后自动挂载至 GitHub Release。

## 2. 已完成的工作

### 2.1 API 密钥安全存储（P7.T1）

- **Stronghold 集成**
  - `client/src-tauri/src/lib.rs` 通过 `tauri_plugin_stronghold` 初始化 Stronghold，快照文件落地 `stronghold.scout`。
  - 新建 `SecretsManager`，封装 `save_api_key` / `get_api_key` / `has_api_key` 命令。
  - 默认主密码使用 Blake3 派生（后续可升级为用户自定义主密码）。

- **迁移逻辑**
  - 应用启动时检查 `lexai-config.store` 中遗留的明文 API Key，读取后写入 Stronghold，再清理旧字段。

- **前端对接**
  - 新增 `client/src/lib/apiKeys.ts` 调用 Stronghold 命令。
  - `SettingsView` UI 调整：显示安全存储状态、允许清除已保存的密钥；保存 Provider 时改走 Stronghold。
  - `llmClient` 获取 API Key 时优先读取 Stronghold，回退至环境变量。

### 2.2 自动化测试补齐（P7.T2）

- **前端单测**（Vitest）
  - 脚手架：`package.json` 添加 `npm run test`，`vite.config.ts` 配置 `test` 节。
  - `src/lib/__tests__/promptBuilder.test.ts`：覆盖语言指令、长文本截断、双语提示等场景。
  - `src/lib/__tests__/termUtils.test.ts`：验证术语去重、大小写不敏感合并、定义优选逻辑。

- **Tauri / Rust 集成测试**
  - `Cargo.toml` 添加 `tempfile` dev 依赖。
  - `tests::submit_review_result_updates_stage_and_timestamp`：针对 `submit_review_result` 测试阶段推进/回退及 `last_reviewed_at`。
  - `tests::secrets_manager_persists_and_clears_keys`：验证 Stronghold 命令读写、快照创建与删键。

- **工具链命令**
  - 前端：`npm run test`
  - 后端：`cargo test`（内含数据库迁移与 Stronghold 操作，约 60s）

### 2.3 代码增强

- 抽象 `dedupeTermDefinitions`，确保 LLM 产生的术语在写入全局术语库前已规范化。
- 优化 `submit_review_result` 结构，便于测试复用。

## 3. 待完成事项

> 以下为 Phase 7 剩余必做项，需在发布前完成。

- **Documentation & Media (P7.T3)**
  - 重写 `README.md`：加入新功能简介、安装指引、嵌入演示 GIF（视频素材另行制作）。
  - 新增配置文档（例如 `CONFIGURING.md`）：说明如何添加/切换 Provider、如何获取并注入 API Key、环境变量说明、Stronghold 迁移提示。
  - 产品演示 GIF：覆盖入门、文档处理、术语管理、复习流程。（本文件不涉及视频/动图制作，仅作提醒）

- **Release Automation (P7.T4)**
  - 补完 `.github/workflows/release.yml`：使用 `tauri-action` 构建 Windows / macOS (Intel & Apple Silicon) / Linux 包。
  - 确保推送 tag（例如 `v1.0.0-rc.3`）后自动发布产物至 GitHub Release。
  - 本地验证流程 & 文档化：说明如何触发 release flow、如何检查产物。

- **安全改进后续**
  - 讨论 Stronghold 主密码管理策略（例如首启设定、用户交互）。
  - 若需跨平台同步密钥，需追加导出/导入策略。

## 4. 验证清单

| 类型 | 命令 | 说明 |
| ---- | ---- | ---- |
| 前端单元测试 | `npm run test` | Vitest，覆盖 prompt 与术语去重逻辑 |
| 后端测试 | `cargo test` | 包含数据库迁移与 Stronghold 集成 |
| 桌面构建 | `npm run tauri` / `tauri build` | 发布前需验证，但本阶段未变更 |

> 建议在 CI 中追加 `npm run test` 与 `cargo test`，确保回归可见。

## 5. 附件与参考

- Stronghold 官方文档：https://github.com/tauri-apps/plugins-workspace/tree/v2/plugins/stronghold
- Phase 6 总结：`docs/versions/phase-6-learning-loop-20251013.md`
- 代码入口：
  - Stronghold 集成：`client/src-tauri/src/lib.rs`
  - 前端密钥调用：`client/src/lib/apiKeys.ts`、`client/src/components/SettingsView.tsx`
  - 去重工具：`client/src/lib/termUtils.ts`
  - 测试入口：`client/src/lib/__tests__/*.test.ts`、`cargo test` 模块

---

**状态概览（截至 2025-10-17）**

- ✅ P7.T1 Stronghold 集成
- ✅ P7.T2 自动化测试补齐
- ⬜️ P7.T3 文档与媒体（待完成）
- ⬜️ P7.T4 Release Workflow（待完成）

请在完成剩余交付后更新本文档，并将演示 GIF/视频等素材链接补充至对应章节。
