# 阶段 14：Windows 运行稳定性 + 暗色主题统一（2025-10-22）

## 1. 背景 & 目标
- 阶段范围：
  - 修复 Windows MSI 安装后启动后端失败（RPC worker 进程秒退、空响应）。
  - 统一暗色模式的基础/高程（卡片、弹窗、Popover）与按钮配色，消除灰白割裂。
- 关联文档：`docs/03-开发阶段要求.md`
- 验收标准（来自路线图）：
  - Windows 新装环境首启可用；CI 含 Windows smoke；UI 暗色一致性达到可发布标准。

## 2. 完成项 & 证据
- 功能/任务清单：
  - Windows 启动修复：
    - 在 Tauri 启动时为 Windows 追加 PATH（resources 与 _internal）。
    - PyInstaller 打包：显式收集 PyO3 扩展 rust_core 的动态库（collect_dynamic_libs），补全 hiddenimports。
    - CI 新增 windows-smoke：构建 rpc_server.exe 并通过 stdin 发送 health 校验返回 ok。
  - 暗色主题统一：
    - 定义暗色下的 surface/surface-alt/border/text-muted/primary 变量；调整背景梯度。
    - 覆盖白底组件（输入、弹窗、说明块、设置切换等）为深色表面，按钮悬浮与主色对齐。
- 运行截图/接口示例：
  - CI windows-smoke 日志包含 “Response: {"jsonrpc":"2.0","id":1,..."status":"ok"}”。
  - 暗色界面截图（主界面、弹窗、右侧抽屉、菜单）。
- 性能与指标：首次启动后端可用 ≤ 5s（人工复核）。

## 3. 质量闸门状态
- Build: PASS（Linux 本地；Windows 由 CI 验证构建/运行 smoke）
- Lint/Typecheck: PASS
- Tests: PASS（保持现有单测；新增 Windows smoke）

## 4. 变更清单（Changelog）
- fix(windows): ensure rpc_server.exe can load PyO3 .pyd by bundling rust_core dynlibs and prepending resource dirs to PATH
- ci: add windows smoke test for PyInstaller JSON-RPC health
- ui(dark): harmonize dark theme surfaces/buttons and remove grey-white modals

## 5. 架构/Schema 快照
- Tauri 前端 → 子进程 rpc_server（PyInstaller 可执行）→ rust_core（PyO3 扩展）→ 文档解析/向量化。
- 资源目录：`client/src-tauri/resources/rpc_server/`（Windows 运行时通过 PATH 暴露 `_internal` 与 .pyd/.dll）。

## 6. 风险与问题
- 已知缺陷：某些三方 DLL 可能在极端环境仍缺失（需继续在 spec 中显式收集）。
- 风险与回退策略：CI 先行发现；若仍有用户侧崩溃，临时关闭 Windows 分发或回滚至上一个可用资源包。

## 7. 下一步计划
- 更细粒度的后端日志上报与 UI 展示（stderr_tail、exit_code、查看日志目录）。
- 继续巡检暗色主题在少数页面的对比度与高程层级。
