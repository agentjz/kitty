# 版本记录

## 2026-06-12 - 记忆与上下文满意基线

状态：非常满意的基线版本。

基线代码锚点：`25f17de`（`bump version to 0.0.4`）。

包版本：`@jun133/kitty@0.0.4`。

计划标记：`satisfied-memory-context-baseline-2026-06-12`。

验证结果：

- `npm.cmd run verify`
- 132 个测试通过。

这个版本重要的原因：

- session context 会把近期可见对话带入 provider 请求，让模型更像一直在当前对话里。
- session memory 负责长任务连续性，不再替代近期对话。
- runtime facts 只作为证据，不伪装成对话记忆。
- internal wake 事实不会污染用户可见的对话记忆。
- context budget 暴露来源分桶，方便观察上下文压力来自哪里。
- 通信提示词更简短、直接、面向行动，并使用正向表达。

设计基线：

- 近期可见对话负责当前临场感。
- 模型写入的 session memory 负责更长的连续性。
- working memory 负责当前焦点和执行连续性。
- runtime facts、checkpoint、工具结果和 observability 保持为证据。
- 当前实现、测试、README、philosophy 和 spec 描述同一套事实模型。

参考提交：

- `47bbcb2` - session context 使用可见的近期对话。
- `3da19ca` - 静态提示词通信规则改为简洁、面向行动。
- `25f17de` - 版本提升到 `0.0.4`。
