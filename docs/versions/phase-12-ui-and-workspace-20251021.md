# 第 12 阶段 – UI 现代化与工作区完善 (2025-10-21)

## 1. 背景 & 目标
- 阶段范围：
  - 工作区：支持删除已上传文档；修复点击已提取的术语时 `search_term_contexts` 报错（无效参数 `docId`）的问题。
  - UI 现代化：在现有代码基础上引入 Tailwind CSS 与 shadcn/ui，逐步以组件化方案替换核心 UI 元素，统一视觉风格与交互一致性。
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
  - [ ] 集成 Tailwind CSS（安装依赖、初始化、配置 content 源、在 App.css 注入 @tailwind 指令）。
  - [ ] 初始化 shadcn/ui（CLI 默认配置）。
  - [ ] 首批组件：Button、Card；替换顶部导航按钮与 DocumentPanel 根容器。
- 运行截图/接口示例：
  - 合并后补充：按钮/卡片替换后的 UI 截图；删除文档交互动图（不阻塞本阶段合入）。
- 性能与指标：
  - UI 替换与样式无性能回退；Tauri 启动时间无显著变动。

## 3. 质量闸门状态
- Build: 预期 PASS（dev 环境可启动；CI `fmt/test` 通过）。
- Lint/Typecheck: 预期 PASS（随组件替换逐步修正）。
- Tests: 预期 PASS（最小冒烟：health；前端单测维持现状）。
- 本地验证命令（不新增代码）：在 `client/` 运行 `npm run dev` 做手动冒烟；在仓库根如存在则运行 `npm run lint`、`npm run typecheck`、`npm test` 或对应后端/CI `fmt/test` 脚本。

## 4. 变更清单（Changelog）
- 主要 PR：
  - feat(P12): workspace delete & UI modernization – phase-12 base
- 关键提交：
  - fix(Terms): ensure `search_term_contexts` uses `doc_id` key
  - feat(AppState): add `removeDocument` and wire delete action in DocumentPanel
  - chore(UI): init Tailwind & shadcn/ui; add Button/Card and replace key views

## 5. 架构/Schema 快照
- 前端：
  - 新增全局样式入口（Tailwind），新增 `src/components/ui/*`。
  - 视图层渐进式迁移至 shadcn/ui。
- 后端：
  - 无 Schema 变更；RPC 参数键名统一（`doc_id`）。

## 6. 风险与问题
- UI 迁移范围较大，采用“逐步替换、随时可回退”的策略；每步替换后进行本地验证。
- Tailwind 与现有 CSS 共存期间可能出现覆盖优先级问题；通过命名约定与组件内样式隔离缓解。

## 7. 下一步计划
说明：以下命令均在 `client/` 执行，除非另有说明。
- 第一阶段：基础环境集成
  - 安装：`npm install -D tailwindcss postcss autoprefixer`
  - 初始化：`npx tailwindcss init -p`
  - 配置：编辑 `client/tailwind.config.js`，content 指向 `index.html` 与 `src/**/*.{ts,tsx}`
    ```js
    // client/tailwind.config.js
    /** @type {import('tailwindcss').Config} */
    module.exports = {
      content: [
        "./index.html",
        "./src/**/*.{ts,tsx,js,jsx}"
      ],
      theme: { extend: {} },
      plugins: [],
    }
    ```
  - 注入：在 `client/src/App.css` 顶部添加：
    ```css
    @tailwind base;
    @tailwind components;
    @tailwind utilities;
    ```
  - 初始化 shadcn/ui：在 `client/` 运行 `npx shadcn-ui@latest init`（默认样式、Slate、CSS 变量）。
- 第二阶段：首批组件替换与验证
  - `npx shadcn-ui@latest add button`
  - 替换 `client/src/App.tsx` 顶部导航的按钮为 `<Button>`，使用 `variant` 表示激活态
  - `npx shadcn-ui@latest add card`
  - 将 `DocumentPanel` 根容器改造为 `<Card>`、`<CardHeader>`、`<CardTitle>`、`<CardContent>` 结构
- 第三阶段（预告）：全面组件化改造
  - Input/Textarea/Select、Table、Dialog/Sheet、Tooltip 等
