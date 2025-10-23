# LexAI 贡献指南

感谢你有兴趣为 LexAI 贡献力量！本指南规定了项目的开发工作流、提交规范、审查流程，旨在保持代码质量、便于协作、加速项目演进。

---

## 1. 快速开始

### 1.1 项目设置

1. **Fork 项目** (如需提交 PR)
   ```bash
   # 访问 https://github.com/mengdehong/LexAI 并点击 Fork
   ```

2. **克隆仓库**
   ```bash
   git clone https://github.com/YOUR_USERNAME/LexAI.git
   cd LexAI
   ```

3. **添加上游远程**
   ```bash
   git remote add upstream https://github.com/mengdehong/LexAI.git
   ```

4. **按照 [`DEVELOPER.md`](./DEVELOPER.md) 的步骤配置开发环境**

### 1.2 分支管理

#### 分支策略
- **`main`** (保护分支)
  - 始终可运行、可发布、可部署
  - 仅通过经过审查的 PR 合并
  - 每个 commit 应能独立运行

- **功能/修复/其他分支** (临时分支)
  - 从 `main` 创建：`git checkout -b <type>/<short-desc> upstream/main`
  - 命名格式：`<type>/<short-desc>`
  - 类型 (type)：
    - `feat/` - 新功能
    - `fix/` - Bug 修复
    - `refactor/` - 代码重构
    - `docs/` - 文档变更
    - `test/` - 测试相关
    - `chore/` - 构建、工具、依赖
    - `style/` - 代码格式 (不影响功能)
    - `perf/` - 性能优化
  - 示例：
    - `feat/add-term-extraction`
    - `fix/qdrant-connection-timeout`
    - `docs/update-readme`
    - `test/add-srs-algorithm-tests`

#### 分支工作流
```bash
# 1. 创建功能分支
git checkout -b feat/my-feature upstream/main

# 2. 编写代码
# ... (开发工作)

# 3. 定期 rebase 同步上游
git fetch upstream
git rebase upstream/main

# 4. 推送到你的 fork
git push origin feat/my-feature

# 5. 在 GitHub 创建 Pull Request (PR)
# 等待审查、修改反馈后，再推送更新
git push origin feat/my-feature --force-with-lease

# 6. PR 合并后，清理本地分支
git checkout main
git pull upstream main
git branch -D feat/my-feature
```

---

## 2. 提交规范 (Conventional Commits)

### 2.1 提交信息格式

所有提交必须遵循 **Conventional Commits** 规范，格式如下：

```
<type>[(<scope>)]: <subject>

[<body>]

[<footer>]
```

### 2.2 类型 (Type)

| Type         | 说明                                      | 示例                                              |
| ------------ | ----------------------------------------- | ------------------------------------------------- |
| **feat**     | 新功能                                    | `feat(core): add spaced repetition scheduler`     |
| **fix**      | 修复 Bug                                  | `fix(backend): resolve qdrant connection timeout` |
| **docs**     | 文档变更 (README、CONTRIBUTING、API 文档) | `docs: update installation instructions`          |
| **style**    | 代码格式、分号、缩进 (无功能影响)         | `style(frontend): format tailwind classes`        |
| **refactor** | 代码重构，无功能修改                      | `refactor(services): simplify embed_text logic`   |
| **test**     | 新增或修改测试                            | `test(frontend): add term deduplication tests`    |
| **chore**    | 构建工具、依赖更新、配置变更              | `chore(deps): upgrade react to 19.1.0`            |
| **perf**     | 性能优化                                  | `perf(indexing): optimize qdrant query latency`   |
| **ci**       | CI/CD 配置变更                            | `ci: add windows smoke test to workflow`          |

### 2.3 作用域 (Scope) - 可选

表示变更的模块或组件，如：
- `frontend`, `backend`, `tauri`, `database`, `ui`, `llm`, `qdrant`, `security` 等
- 示例：`feat(frontend): add search input` 或 `fix(backend): handle unicode paths`

### 2.4 主题 (Subject)

- 动词开头，使用祈使句 (command form)
- 不以句号结尾
- ≤ 50 字符
- 大小写敏感：英文首字母小写，中文无特殊要求

**示例**：
- ✅ `feat(tauri): add health check endpoint`
- ❌ `feat(tauri): Added health check endpoint` (过去时)
- ❌ `feat(tauri): Add health check endpoint.` (句号结尾)
- ❌ `feat(tauri): Adds health check endpoint` (第三人称)

### 2.5 信息体 (Body) - 可选

- 解释 **是什么** 和 **为什么**，不要说 **怎么做**
- 描述动机、实现细节、对比之前的行为
- 多行时左对齐，每行 ≤ 72 字符

**示例**：
```
feat(security): integrate stronghold for api key storage

Previously, API keys were stored in plaintext in lexai-config.store,
exposing users to security risks if the machine was compromised.

This change introduces Tauri Stronghold to encrypt keys at rest using
Blake3 key derivation. Keys are automatically migrated on first launch.
```

### 2.6 页脚 (Footer) - 可选

用于链接相关的 Issue 或破坏性变更说明：

```
Closes #123
Refs #456
BREAKING CHANGE: SearchResult schema changed, old clients incompatible
```

### 2.7 完整提交示例

```
feat(frontend): implement batch document upload with progress

- Add batch upload UI with file list and progress bar
- Support canceling individual file or entire batch
- Display per-file status (queued/success/error)
- Implement request debouncing to avoid overwhelming backend

The upload now runs as a background job through Tauri. Large batches
(>10 files) are queued to prevent memory exhaustion.

Closes #45
```

---

## 3. Pull Request (PR) 工作流

### 3.1 PR 前清单

提交 PR 前，请自检：

- [ ] 分支名称遵循 `<type>/<short>` 格式
- [ ] 所有提交信息遵循 Conventional Commits 规范
- [ ] 代码通过本地测试和格式检查
- [ ] 更新了相关文档 (README、API 文档等)
- [ ] 添加了必要的单元测试或集成测试
- [ ] 代码无安全漏洞 (API Key 未提交等)

### 3.2 质量闸门 (QA Gates)

**在本地执行以下命令，确保全部通过**：

#### 前端 (React + TypeScript)
```bash
cd client

# 类型检查与构建
npm run build

# 单元测试
npm run test

# 代码格式化检查
npx prettier --check src/

# Lint 检查
npx eslint src/ --max-warnings 0
```

#### 后端 (Python)
```bash
cd backend

# 代码格式化
poetry run ruff format . --check

# Lint 与类型检查
poetry run ruff check .
poetry run mypy app/ --ignore-missing-imports

# 单元测试
poetry run pytest tests/ -v --cov=app
```

#### Rust 层 (Tauri + PyO3)
```bash
cd client/src-tauri

# 格式检查
cargo fmt --all -- --check

# Lint 检查
cargo clippy --all-targets -D warnings

# 单元测试
cargo test

# 构建检查
cargo build --release
```

### 3.3 创建 PR

1. **推送分支到 fork**
   ```bash
   git push origin feat/my-feature
   ```

2. **在 GitHub 上创建 PR**
   - 选择 `upstream/main` 作为目标分支
   - 标题遵循 `<type>(<scope>): <subject>` 格式
   - 描述包括：
     - 变更的动机与背景
     - 主要改动说明
     - 测试方法
     - 相关 Issue (#123)

3. **PR 模板示例**
   ```markdown
   ## Description
   Implement spaced repetition scheduler for review terms.
   
   ## Related Issues
   Closes #123
   
   ## Changes
   - Add SRS algorithm to calculate next review date
   - Integrate review history tracking in SQLite
   - Add UI for review progress visualization
   
   ## Testing
   - Unit tests: `cargo test`
   - Manual test: Add 5 terms, verify review dates calculated correctly
   - Regression: Existing tests pass
   
   ## Checklist
   - [x] Tests pass locally
   - [x] Code formatted
   - [x] No security issues
   - [x] Documentation updated
   ```

### 3.4 代码审查

- **审查者会检查**：
  - 代码质量、安全性、性能
  - 是否符合项目规范
  - 测试覆盖率
  - 文档完整性

- **改进意见**：
  - 积极响应反馈，进行必要修改
  - 避免 force-push (除非要 rebase 避免合并提交)
  - 使用 `--force-with-lease` 推送更新

### 3.5 合并

- PR 获得至少 1 个审查者的 ✅ 通过后，可合并
- 选择 **Squash and Merge** (保持 `main` 历史简洁) 或 **Create a Merge Commit** (保留分支历史)
- 合并后，删除远程分支

---

## 4. 版本管理与发布

### 4.1 语义化版本 (Semantic Versioning)

版本号格式：`v<MAJOR>.<MINOR>.<PATCH>[-<pre-release>]`

- **MAJOR**：破坏性变更 (Breaking Change)
- **MINOR**：新功能 (Feature)，向后兼容
- **PATCH**：Bug 修复，向后兼容
- **Pre-release**：`alpha`, `beta`, `rc` 等

**示例**：
- `v0.1.0` - 初始发布
- `v0.2.0` - 新增批量上传功能
- `v0.2.1` - 修复 Qdrant 连接超时
- `v1.0.0-rc.1` - 发布候选版本

### 4.2 发布流程

```bash
# 1. 在本地确认所有测试通过
npm run tauri build
cargo test
poetry run pytest

# 2. 更新版本号 (package.json, Cargo.toml, pyproject.toml)
# 示例：从 v0.2.0 升级到 v0.3.0

# 3. 创建发布分支
git checkout -b release/v0.3.0 upstream/main

# 4. 提交版本变更
git commit -am "chore(release): bump version to v0.3.0"

# 5. 创建 PR 进行最后审查
git push origin release/v0.3.0
# GitHub 上创建 PR

# 6. 审查通过后，合并到 main
# 通过 GitHub UI 进行 Merge

# 7. 标记 Release Tag
git checkout main
git pull upstream main
git tag -a v0.3.0 -m "Release v0.3.0: Add batch upload and dark theme"
git push upstream v0.3.0

# 8. GitHub 自动触发 release workflow，生成二进制并上传
# 手动编写 Release Notes (基于 CHANGELOG.md)
```

### 4.3 版本发布检查清单

- [ ] 所有 PR 已审查并合并
- [ ] `CHANGELOG.md` 已更新
- [ ] 版本号已在所有配置文件中更新
- [ ] 构建成功 (Windows / macOS / Linux)
- [ ] 发布二进制能正常运行
- [ ] 发布说明 (Release Notes) 完整清晰

---

## 5. 文档与阶段总结

### 5.1 代码文档

- **函数/方法**：使用 JSDoc (TS) 或 docstring (Python)
  ```typescript
  /**
   * 搜索术语的上下文片段
   * @param documentId - 文档 ID
   * @param query - 搜索词
   * @returns 包含术语上下文的片段列表
   */
  async function searchTermContexts(documentId: string, query: string) { }
  ```

- **模块注释**：每个文件开头说明用途
  ```python
  """Text embedding and vector storage for document chunks."""
  ```

### 5.2 阶段总结文档

每完成一个开发阶段或里程碑，应创建总结文档到 `docs/versions/`：

1. **复制模板**
   ```bash
   cp docs/versions/_TEMPLATE.md docs/versions/phase-<N>-<title>-<YYYYMMDD>.md
   ```

2. **填写内容** (参考模板中的各个章节)
   - 背景 & 目标
   - 完成项 & 证据
   - 质量闸门状态
   - 变更清单 (Changelog)
   - 架构/Schema 快照
   - 风险与问题
   - 下一步计划

3. **提交**
   ```bash
   git add docs/versions/phase-X-*.md
   git commit -m "docs(versions): add phase-X summary <YYYYMMDD>"
   git push origin docs/phase-X-summary
   # 创建 PR 进行审查
   ```

---

## 6. 常见问题

### Q: 提交前需要做什么？

**A:** 运行以下命令，确保一切就绪：

```bash
# 1. 同步最新代码
git fetch upstream
git rebase upstream/main

# 2. 运行测试与格式检查
npm run test && npm run build
poetry run pytest && poetry run ruff check .

# 3. 提交
git add -A
git commit -m "feat(module): description"
git push origin your-branch
```

### Q: 如何改动已提交的代码？

**A:** 使用 `--amend` 修改最后一次提交：

```bash
# 编辑文件
# ...
git add .
git commit --amend --no-edit  # 保持提交信息不变

# 如果需要更新 PR，force-push：
git push origin your-branch --force-with-lease
```

### Q: 如何处理 merge conflicts？

**A:**

```bash
# 1. 更新分支
git fetch upstream
git rebase upstream/main

# 2. 解决冲突 (编辑冲突文件，移除冲突标记)
# 编辑 conflicted_file.ts
# ...

# 3. 标记解决
git add conflicted_file.ts
git rebase --continue

# 4. 推送
git push origin your-branch --force-with-lease
```

### Q: 如何在本地测试构建？

**A:**

```bash
# 完整构建 (所有平台)
npm run tauri build

# 仅开发模式
npm run tauri dev

# 生成二进制产物位置：
# src-tauri/target/release/bundle/
```

---

## 7. 社区规范

- **尊重**：相互尊重，包容不同观点
- **耐心**：代码审查可能需要多轮反馈
- **透明**：积极沟通，及时更新进度
- **协作**：如不确定，主动寻求帮助

---

## 8. 获取帮助

- **技术问题**：在 GitHub Issues 中讨论
- **设计方向**：在 GitHub Discussions 中提议
- **文档疑问**：参考 [`DEVELOPER.md`](./DEVELOPER.md) 或 [`ARCHITECTURE.md`](./ARCHITECTURE.md)

感谢你的贡献！🙏
