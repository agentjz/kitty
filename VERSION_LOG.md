# 版本记录

## 2026-07-25 - 统一能力系统与本地控制台生命周期重建

状态：发布版本。

包版本：`@jun133/kitty@4.0.11`。

验证结果：

- `npm.cmd run verify`：458 项，457 通过、0 失败、1 项 POSIX 平台跳过。
- `node dist/cli.js --version`：输出 `4.0.11`；`node dist/cli.js --help` 公共命令正常。
- 真实 Web 能力返回 8 条搜索结果，读取 Node.js 页面并下载校验 326,014 bytes。
- 真实 Playwright MCP 发现 24 个工具，连续借用复用同一 PID，关闭后确认进程消失。
- `node dist/cli.js run` 真实调用 `playwright_browser_navigate` 成功，工具派发结算为 `settled`。
- `npm.cmd publish --dry-run --access public`：21 个文件，无原生 addon，public `latest` 包合同通过。

这个版本重要的原因：

- 核心工具、内置能力、项目 Skill、Playwright MCP 与基础 Web 进入同一个能力管理器；`ToolRegistry` 继续独占模型工具执行和工具账本。
- 基础 Web 无需凭证，提供真实搜索、有界网页读取和原子下载；外部派发丢失响应时结算为 `uncertain`，不盲目重放。
- Playwright 使用项目范围持久客户端池、owner token、generation、heartbeat、lease 与进程 identity，并修复生产 ESM TUI 中 MCP 工具无法注册的问题。
- `kitty start` 保留欢迎便签、Web、媒体、微信和 Telegram，按独立工作流展示模型、工具与扩展、Skill 和其他设置；Skill 只从 `skills/**/SKILL.md` 加载并支持同权 CRUD。
- 本地控制台关闭、配置提交、WebSocket 控制、远程通道和能力运行时替换收敛为可排空、可恢复、幂等的单 owner 生命周期。

## 2026-07-24 - 租约连续性与 Host 收口修复

状态：发布版本。

包版本：`@jun133/kitty@4.0.10`。

验证结果：

- `npm.cmd run verify`：439 项，438 通过、0 失败、1 项平台跳过。
- `npm.cmd run dev -- --version`：输出 `4.0.10`。
- `npm.cmd run dev -- --help`：公共 CLI 入口正常。
- `npm.cmd publish --dry-run --access public`：21 个文件，public `latest` 包合同通过。

这个版本重要的原因：

- lease deadline 只开启 recovery 接管资格，不再单独误判当前 owner 已失权；token、generation 与 active state 继续严格 fencing 真实 takeover。
- turn、session、steer、tool、execution 与 service lease 统一支持无人接管时的迟到原子续租，用户在 timer 暂停后的 steer 仍进入原 turn。
- Host 只有在 session 与 turn 终态原子提交成功后才返回 completed；真实 takeover 转成可恢复中断，不向用户暴露内部 lease/generation 错误。
- host turn observability 补齐 durable turn ID，恢复、完成与失败可以按同一 turn 关联。
- README 免费说明完成收敛，站点微信二维码资源同步优化。

## 2026-07-21 - Provider、工具事实与上下文重放重建

状态：发布版本。

包版本：`@jun133/kitty@4.0.9`。

验证结果：

- `npm.cmd run verify`：432 项，431 通过、0 失败、1 项平台跳过。
- `npm.cmd run eval:local`：全部通过。
- `npm.cmd run eval:production`：使用智谱 GLM-4.7 Flash 全部通过。
- 真实生产验收覆盖两轮对话、上下文压缩与 epoch、不可压缩请求本地失败、后台等待和工具修复任务。

这个版本重要的原因：

- 工具结果先保留事实；工具 owner 约束单次输出，context owner 只在整体请求真实超限时压缩旧历史。
- bash 在 48,000 字符内完整回放，超限保存全文并保留等量头尾、明确省略规模与恢复路径。
- 当前用户输入和最新完整工具批次不能被 hard compression 丢弃；无法共同容纳时明确本地失败。
- Google Gemini 进入具名 Provider，保存并回放 thought signature，收敛工具 schema，并按结构化 quota facts 重试。
- DeepSeek 与 Zhipu 的 preserved-thinking 工具重放保留 `reasoning_content`；空字符串与字段缺失严格区分。
- 超长对话与上下文压力进入真实生产评测，不再只靠短对话或合成测试证明。

## 2026-07-12 - 界面定型与可维护性封顶满意版本

状态：满意版本。

包版本：`@jun133/kitty@0.0.34`。

验证结果：

- GitHub Actions Verify workflow 全平台通过（Ubuntu 24.04 + Windows 2025）
- 全部 340+ 测试无失败
- `npm run typecheck`
- `npm run build`
- `npm publish`

这个版本重要的原因：

- TUI 界面定型：Composer 光标定位、Dock 布局、Runtime Dock turn-clock、交互流自然流畅。
- 可维护性封顶：Windows + Ubuntu 双平台 CI 基础设施硬化，跨平台兼容问题一劳永逸解决。
- GitHub Pages 部署流程恢复，site 同步更新。
- 后台任务（background_run）替代子代理作为标准长时间运行方案。
- 项目文档、site、spec、代码、测试保持同一套事实，没有冗余和矛盾。

后续维护：

- 基础架构已定型，后续维护看心情。
- 主要方向：长任务连续性、记忆沉淀、多 agent 协作体验、恢复能力。
- 版本已发布到 npm，并同步推送到 GitHub。

## 2026-07-05 - 真实生产路径验收与 0.0.19 发布

状态：发布版本。

包版本：`@jun133/kitty@0.0.19`。

验证结果：

- `node dist/cli.js doctor`
- 真实 GPT/YLS provider 下 42 个隔离工具准确性修复任务
- `cmd /c npm test` in `C:\Users\Administrator\Desktop\kitty-tool-accuracy-workspace`
- `npm.cmd run test:build`
- `node --test .test-build\tests\observability\terminal-log.test.js`
- `npm.cmd run build`

这个记录重要的原因：

- 生产级验收重点从继续堆功能转为真实工具使用链路：读准、改准、跑测试、失败后继续修。
- 有效工具准确性任务 42 个，最终全部通过；198 次工具开始、197 次工具完成、1 次工具失败。
- 发现并修复 terminal log fallback 丢工具参数的问题，避免工具审阅里出现 `[tool] read (missing path)`。
- 发现 resume 旧 session 时模型可能被旧事实带偏；明确读取当前文件和运行当前测试后可以纠偏。该风险保留为后续 status/memory closeout 硬化方向。

## 2026-06-26 - 现场表达与上下文自然性满意基线

状态：满意版本。

基线代码锚点：发布后以本次 `0.0.16` 提交为准。

包版本：`@jun133/kitty@0.0.16`。

计划标记：`Kitty 现场表达与上下文自然性封顶 Plan`。

验证结果：

- `npm.cmd run typecheck`
- `npm.cmd run build`
- `npm.cmd run verify`
- `npm.cmd run eval:local`
- `npm.cmd run eval:production`

这个版本重要的原因：

- 现场表达从账本摘要改成自然现场：用户先看当前状态、焦点、下一步、后台、成本和记忆，再看详细机器事实。
- runtime status、session、control-plane、observability 继续保留完整结构化事实，`scene` 只做投影，不落盘，不成为第二事实源。
- context prompt/session brief/working memory 明确把运行事实作为 evidence，不把内部 wake、execution、runtime facts 伪装成用户新要求。
- TUI、CLI、README 和 spec 讲同一套当前事实。
- 超过 300 行文件做了职责审查；只拆混职责文件，不为行数硬拆。

设计基线：

- 主干维护事实，边缘负责呈现。
- 模型看到的是近场连续性、当前现场和必要证据；机器账本留在可审阅事实层。
- eval、TUI transcript、Responses adapter、host delegated closeout 已拆清变化原因。
- 版本将发布到 npm，并同步推送到 GitHub。

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
