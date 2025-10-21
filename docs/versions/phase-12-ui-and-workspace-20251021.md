# 第 12 阶段 – UI 现代化与工作区完善 (2025-10-21)

## 1. 背景 & 目标
- 阶段范围：
  - 工作区：支持删除已上传文档；修复点击已提取的术语时 `search_term_contexts` 报错（无效参数 `docId`）的问题。
  - UI 现代化：在现有代码基础上引入 Tailwind CSS 与 shadcn/ui，逐步以组件化方案替换核心 UI 元素，统一视觉风格与交互一致性；修复顶部导航重叠，优化文档列表为横向滑动。
- 关联文档：`docs/03-开发阶段要求.md`、`docs/versions/phase-11-roadmap-20251020.md`。
- 验收标准：
  - 删除文档操作在 DocumentPanel 可用，并能正确更新激活文档与 UI 状态。
  - 点击术语触发上下文检索时使用 `doc_id` 参数，不再出现无效参数错误。
  - 完成“第一阶段：基础环境集成”和“第二阶段：首批组件替换与验证”，可在 dev 中稳定运行。
  - Dev 环境渲染 Tailwind 工具类生效（可临时给任意元素添加 `class="p-4"` 验证）。

## 2. 完成项 & 证据（滚动更新）
- 功能/任务清单：
  - [x] 修复 `search_term_contexts` 参数键，统一为 `doc_id`。
  - [x] 在 AppState 增加 `removeDocument`，DocumentPanel 提供“删除”按钮，删除当前文档时自动重置视图。
  - [x] 集成 Tailwind CSS（安装依赖、初始化、配置 content 源、在 App.css 注入 @tailwind 指令）。
  - [x] 初始化 shadcn/ui（使用轻量 Button/Card 兼容现有样式）。
  - [x] 首批组件：Button、Card；替换顶部导航按钮与 DocumentPanel 根容器；修复顶栏重叠并置顶（sticky）。
  - [x] 文档列表由横向 scroll-snap 升级为 Mantine Carousel（默认 3–4 条、仅指标点、无左右控件）。
  - [x] Workspace 视图精简：以 ExtractedViewer + TermsPanel + ContextPanel 为主（按决策移除 Original/PDF 预览）。
  - [x] 采用 Mantine 基础外观与 AppShell 顶栏，SegmentedControl 统一宽度；引入 macOS 风格的强磨砂（blur≈28px）、细腻渐变与明确阴影层级（shadow-sm/md/lg）。
  - [x] 统一浅色系按钮（Workspace/Settings/Global）：提取术语/查看术语列表/全部保存/编辑/测试等均改为浅色；删除操作为显式负向样式。
  - [x] 顶部 Review 标签在中文改为“回顾”，移除计数；Review 页面移除“复习中心”标题，仅保留说明。
  - [x] Documents 列表仅展示文件名（隐藏文件哈希与上传时间）。
  - [x] 全局库表格：表头行居中；第一可见列（术语）居中；操作列“联想/编辑/删除”一行不换行；“术语联想”更名为“联想/Associate”。
  - [x] 文档卡片更紧凑：降低块高/内边距、长文件名单行省略号、删除按钮保持单行。
  - [x] Settings Provider 列表：操作（编辑/测试/删除）强制单行不换行；“厂商/默认模型”改为分行展示；无 Key 时提示“从环境变量读取/Read from environment”。
  - [x] 去除底部“当前文档/Active document”状态栏；为按钮/上传等交互元素补充 focus-visible 外框。
- 运行截图/接口示例：
  - 合并后补充：按钮/卡片替换后的 UI 截图；删除文档交互动图（不阻塞本阶段合入）。
- 性能与指标：
  - UI 替换与样式无性能回退；Tauri 启动时间无显著变动。

## 3. 质量闸门状态
- Build: PASS（client 构建通过）。
- Lint/Typecheck: PASS。
- Tests: PASS（现有 2 个测试文件，7 个用例通过）。
- 本地验证命令：在 `client/` 运行 `npm run dev` 做手动冒烟；如有则运行根目录 `lint/typecheck/test` 与后端 `fmt/test`。

## 4. 变更清单（Changelog）
- 主要 PR：
  - feat(P12): workspace delete & UI modernization – phase-12 base（将以本分支创建）
- 关键提交：
  - fix(Terms): ensure `search_term_contexts` uses `doc_id` key
  - feat(AppState): add `removeDocument` and wire delete action in DocumentPanel
  - chore(UI): init Tailwind & shadcn/ui; add Button/Card and replace key views
  - feat(P12/ui): fix topbar overlap（分离 Diagnostics 与 Generate CTA，sticky 顶部）
  - feat(P12/ui): DocumentPanel 横向 scroll-snap 走马灯
  - feat(ui/docs): replace scroll-snap list with Mantine Carousel; add focus-visible outlines
  - feat(P12/ui): Inc2 split-view 初版与回退（按决策移除 Original/PDF 预览，聚焦提取与术语流程）
  - feat(P12/ui): adopt Mantine Provider/AppShell/Segmented，接入主题样式文件
  - feat(ui/theme): 应用 macOS 风格的 blur(28px)/渐变/阴影 Token；Header 使用 .mac-header
  - feat(ui): 统一浅色系按钮（pill-light），删除为负向样式；隐藏 Documents 的哈希与时间
  - fix(ui/header): 中文 Review 标签从“复习”改为“回顾”并移除计数，提升可读性
  - fix(ui/termbase): 表格居中与操作列不换行；按钮文案“联想/Associate”与样式统一
  - chore(ui/docs): compact document tiles; keep Delete on one line; prefer LXGW WenKai for Chinese font if available
  - chore(ui): remove bottom status bar showing current document id per request
  - fix(ui/settings): keep Provider actions on a single line via nowrap and button white-space rules
  - chore(ui/settings): split Vendor/Model into separate lines; show "从环境变量读取/Read from environment"

## 5. 架构/Schema 快照
- 前端：
  - 新增全局样式入口（Tailwind），新增 `src/components/ui/*`（Button/Card）。
  - Mantine 接入：`MantineProvider/ModalsProvider/Notifications` 包裹根组件，`AppShell.Header + SegmentedControl` 重构顶部导航。
  - 工作区结构：左列 DocumentPanel + ExtractedViewer；右列 TermsPanel + ContextPanel。
  - 顶栏 sticky、SegmentedControl 等宽；Card/Panel 使用强磨砂与明确阴影；文档列表为横向滚动。
- 后端：
  - 无 Schema 变更；RPC 参数键名统一（`doc_id`）。

## 6. 风险与问题
- UI 迁移范围较大，采用“逐步替换、随时可回退”的策略；每步替换后进行本地验证。
- Tailwind 与现有 CSS 共存期间可能出现覆盖优先级问题；通过命名约定与组件内样式隔离缓解。
- PDF/原始预览：经评估稳定性成本高，已从本阶段范围移出并回退；未来若需可评估后端栅格化或外部打开方案。

## 7. 下一步计划
- 下阶段优先级：
  - 继续组件化改造（Input/Textarea/Select、Table、Dialog/Sheet、Tooltip 等），统一主题变量与焦点态。
  - Carousel 体验优化（键盘可达性/ARIA；空态与删除确认对话框细化）。
  - 提取视图交互完善：术语高亮与语境联动的 Loading/Toast；批量保存的反馈与失败重试。
- 估算：2–3 天（不含 PDF/原始预览相关工作）。
