# 版本记录

## 2026-06-18 - TUI 光标定位初步满意基线

状态：TUI 初步成功版本。

基线代码锚点：`d99fd52`（`fix: update Composer, composerLayout, and tui-render test`）。

包版本：`@jun133/kitty@0.0.9`。

验证结果：

- `npm run check`
- `npm run test:core`
- `npm publish --access public`

这个版本重要的原因：

- Composer 光标定位重构，分离 measured row 与 cursor cell 计算。
- 新增 `composeInkCursorPosition()` 统一 Ink 光标坐标转换。
- 新增 `shiftInkCursorRow()` 处理行偏移。
- 测试覆盖 cursor 组合逻辑的边界情况。

设计基线：

- TUI Composer 组件职责保持单一：Composer 只渲染，layout 只计算，编辑逻辑在 composerEditing。
- 光标位置计算全部收敛到 `composeInkCursorPosition`，不再在组件内联条件拼凑。
- 版本已发布到 npm，并同步推送到 GitHub。

参考提交：

- `d99fd52` - Composer、composerLayout、tui-render test 更新。

## 2026-06-17 - 运行时边界与生产发布满意基线

状态：第二个满意版本。

基线代码锚点：`387b09b`（`Release 0.0.7`）。

核心改动锚点：`a939778`（`Harden runtime skills and context boundaries`）。

包版本：`@jun133/kitty@0.0.7`。

计划标记：`satisfied-runtime-boundary-release-2026-06-17`。

验证结果：

- `npm.cmd run verify`
- 168 个测试通过。
- `npm.cmd pack --dry-run`
- `npm.cmd publish --access public`

这个版本重要的原因：

- runtime skills 收敛为 `research`、`plan`、`do`、`verification` 四个独立阶段。
- `development` 旧入口已删除，当前产品事实只保留 `do`。
- `research` 只负责证据收束，不再混入执行阶段。
- 内部 wake 使用结构化 `source: internal`，不再靠文本前缀判断。
- 用户真实输入 `[internal] ...` 不会被误当内部消息隐藏。
- 内部 wake 不触发 session title 和 session memory 重写。
- cache layout 把 stable prefix 和 volatile runtime facts 分开，缓存报告更接近真实请求结构。
- `kitty eval` 的 cache economy 检查使用真实 runtime prompt layers，不再用合成字符串证明。

设计基线：

- 当前用户输入、内部 wake、session memory、runtime facts 各有独立边界。
- static prompt 和 profile persona 是稳定前缀。
- runtime facts 和 near-field conversation 是易变尾部。
- skill 是运行时知识包，模型按需加载；机器只发现、读取、检查和记录事实。
- 版本已发布到 npm，并同步推送到 GitHub。

参考提交：

- `a939778` - runtime skills、内部 wake 边界、cache layout 和 eval 检查硬化。
- `387b09b` - 版本提升到 `0.0.7` 并发布。

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
