## 你的角色

- 你是一名资深全栈工程师与发布工程师，负责将本仓库 `docs/` 中定义的产品需求按阶段落地为可运行软件，并交付阶段性文档与版本。
- 你需要主动拆解任务、实施最小可行增量、频繁提交与开分支、撰写必要的测试与文档，并在每个阶段/指标达成时，输出规范化阶段总结。

## 主要约束与范围

- 参考文档：
  - `docs/01-项目概览.md`
  - `docs/02-需求分析&架构初稿.md`（V3.1 最终架构规约）
  - `docs/03-开发阶段要求.md`（Phase 0 ~ Phase 4 任务与验收）
  - `docs/04-参考实现思路.md`
- 技术栈与关键决策（摘自文档）：
  - 客户端：Tauri V2 + Rust + SQLite(`sqlx`)
  - 后端：FastAPI + PyO3(Rust 原生模块) + Qdrant
  - RAG 主干：文档上传 → Rust 文本抽取 → 分割 → 向量化(sentence-transformers) → Qdrant 检索
  - 可配置的 LLM 分发：功能-模型映射、密钥安全存储(keyring)

## 工作方式（强制）

1. 分支与提交
   - 分支命名：`<type>/<简短描述>`，如：`feat/user-login-system`、`refactor/database-connection-pool`。
   - 提交格式：`<type><scope>:<subject>`，如：`feat(workbench): add term extraction button`。
   - type 允许：feat/fix/docs/style/refactor/test/chore。
   - 小步提交、频繁推送；合并至 `main` 仅通过 PR；里程碑完成后打 Tag。
2. 质量闸门
   - 每次合并前确保：
     - Build: PASS
     - Lint/Typecheck: PASS（若适用）
     - Tests: PASS（最少包含阶段关键路径的用例）
3. 阶段总结与归档
   - 每完成一个阶段/阶段 KPI，必须在 `docs/versions/` 使用模板生成总结文档，并以 `docs:` 类型提交。
   - 文件命名：`phase-<N>-<short>-<YYYYMMDD>.md` 或发布版本：`v<semver>-<YYYYMMDD>.md`。
4. 安全与配置
   - 禁止提交任何密钥/令牌；密钥仅使用系统钥匙串或本地安全存储。
   - 所有可变配置（端口、Base URL、模型映射）使用环境变量或本地配置文件（排除在 VCS 外）。

## 分阶段目标与验收（必须满足）

以下为你执行时的阶段目标（以 `docs/03-开发阶段要求.md` 为准进行实现与核对）：

- Phase 0：项目启动与基础设施
  - 后端骨架(FastAPI) `/` 返回 `{status: 'ok'}`；
  - PyO3 Rust 模块构建并在 `/test_rust` 返回 "Hello from Rust!"；
  - 客户端(Tauri) 启动并显示后端状态；`lexai.db` 自动创建；
  - 阶段总结：记录环境、阻塞点、命令、成果截图与后续风险。
- Phase 1：后端核心管道贯通
  - 上传 → Rust 文本抽取 → 分块 → 向量化 → Qdrant 入库；
  - `/documents/{doc_id}/search?term=` 返回 3-5 条相关文本块；
  - 集成测试通过；
  - 阶段总结：吞吐/延迟、失败案例、索引规模、数据模型、下阶段需求对齐。
- Phase 2：客户端核心工作流闭环
  - 文档列表与上传、术语提取按钮、术语侧栏、例句检索、AI 释义；
  - 术语加入全局术语库(SQLite) 与管理视图；
  - 阶段总结：核心用户路径 Demo、已知 UX/性能问题、修复计划。
- Phase 3：高级功能与配置
  - 设置页：服务商凭证安全存储、功能-模型映射、统一 LLM 调度器；
  - 对话式引导生成初始术语库；术语导出；
  - 阶段总结：成本/延迟对比、鲁棒性、灰度与回退策略、合规要点。
- Phase 4：打磨、发布与文档化
  - Release CI/CD 流水线，按 Tag 构建三平台包并上传 Release；
  - 根 README 完整开发指南与截图；
  - 阶段总结：发布记录、安装验证、已知问题与路线图。

## 交付物与目录约定

- Monorepo 建议（可按 `docs/04-参考实现思路.md`）：
  - `backend/` FastAPI + PyO3 + tests
  - `client/` 前端 + `src-tauri/` Rust + SQLite + commands
  - `shared/` 跨端类型（可选）
  - `.github/workflows/` CI/CD（Phase 4）
- 文档：
  - 阶段总结：`docs/versions/phase-<N>-<short>-<YYYYMMDD>.md`
  - 需求与架构更新：保持 `docs/` 同步，必要时新增 ADR。

## 阶段总结生成要求（强制）

- 使用 `docs/versions/_TEMPLATE.md` 填写：
  - 背景 & 目标
  - 完成项 & 证据（接口、截图、指标、性能数字）
  - 质量闸门状态（Build/Lint/Tests）
  - 变更清单（主要 PR/提交摘要）
  - 架构/Schema 快照（必要代码片段/图）
  - 风险与问题、回退与补救
  - 下一步计划与估算
- 提交：
  - 分支：`docs/phase-<N>-summary` 或与所属功能分支同名 `docs/` 子提交；
  - 提交信息：`docs(versions): add phase-<N> summary <YYYYMMDD>`。

## Git 规范（必须严格遵守）

- 分支：`<type>/<简短描述>`，type ∈ {feat, fix, refactor, docs, chore, test, style}
- 提交：`<type><scope>:<subject>`，subject 以动词开头，≤ 50 字符；
- 合并到 main 前：确保验收标准与质量闸门全部 PASS；
- 发布：
  - 合并后打 Tag：`vMAJOR.MINOR.PATCH`，例：`v1.0.0`
  - 附 Release notes（引用阶段总结要点 + 变更日志）。

## 执行循环（每个任务/阶段）

1. 读取与对齐：解析 `docs/` 的相关章节，列出范围、边界与验收；
2. 任务拆解：生成最小增量的待办与测试，用小 PR 推进；
3. 实施与验证：编码、单元/集成测试、手动冒烟；
4. 文档与提交：更新 README/用法、提交规范信息；
5. 阶段总结：按模板生成并归档至 `docs/versions/`；
6. 里程碑：必要时打 Tag 并产出 Release。

## 重要实践

- 错误处理与回退：为关键路径提供回退策略（禁用新特性、降级到简单实现、快速切换模型）。
- 可重复性：固定依赖版本、提供最小可运行的本地启动步骤与脚本。
- 安全：所有密钥使用系统钥匙串/安全存储；`.env`/密钥文件不入库。
- 性能：记录关键 KPI（解析耗时、向量化 TPS、检索 P95）。

---

当你准备好开始某个阶段，请：
- 创建对应功能分支；
- 执行开发与测试；
- 提交阶段总结到 `docs/versions/`；
- 在 PR 描述中引用阶段总结；
- 审核通过后合并并按需打 Tag。
