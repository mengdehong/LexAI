# docs/versions

阶段总结归档目录。每当完成一个阶段或阶段性关键指标（KPI），请基于 `_TEMPLATE.md` 生成总结文档，并按如下命名：

- 阶段总结：`phase-<N>-<short>-<YYYYMMDD>.md` 例如：`phase-1-backend-spine-20251012.md`
- 版本发布：`v<semver>-<YYYYMMDD>.md` 例如：`v1.0.0-20251101.md`

提交要求：
- 分支建议：`docs/phase-<N>-summary` 或所属功能分支内的 `docs:` 提交
- 提交信息：`docs(versions): add phase-<N> summary <YYYYMMDD>`

内容要求见 `_TEMPLATE.md`。