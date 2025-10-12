# 贡献规范（LexAI）

本项目采用明确的分支策略与提交信息规范，并要求在每个阶段产出总结文档到 `docs/versions/`。

## 分支策略
- 主分支：`main`（可运行、可发布、稳定）
- 功能/修复等分支命名：`<type>/<short>`
  - 允许的 type：`feat/` `fix/` `refactor/` `docs/` `chore/` `test/` `style/`
  - 示例：`feat/user-login-system`、`refactor/database-connection-pool`

## 提交信息规范
格式：`<type><scope>: <subject>`
- type：
  - feat：新功能
  - fix：修复 Bug
  - docs：文档变更
  - style：代码格式（不影响运行）
  - refactor：重构
  - test：测试相关
  - chore：构建/工具
- scope：可选，如 `login`、`api`、`core`
- subject：动词开头，≤ 50 字符，不以句号结尾

示例：
- `feat(workbench): add term extraction button`
- `fix(api): handle qdrant timeout`
- `docs(versions): add phase-1 summary 20251012`

## 发布与 Tag
- 合并至 `main` 后，按需打 Tag：`vMAJOR.MINOR.PATCH`
- 示例：
  ```
  git checkout main
  git merge feat/release-version-1.0
  git tag -a v1.0.0 -m "Version 1.0.0: Initial release with core features"
  git push origin v1.0.0
  ```

## 阶段总结与归档
- 每完成一个阶段或阶段性KPI，复制 `docs/versions/_TEMPLATE.md` 生成总结文档，存放至 `docs/versions/`，并以 `docs:` 类型提交。
- 命名：`phase-<N>-<short>-<YYYYMMDD>.md` 或 `v<semver>-<YYYYMMDD>.md`

## 开发与质量要求
- 小步快跑：频繁提交、原子改动、尽量小的 PR
- 质量闸门：合并前确保 Build/Lint/Tests 均 PASS
- 安全：API 密钥使用系统钥匙串/安全存储，不要提交到仓库
- 可重复：依赖版本固定，提供本地启动与测试说明
