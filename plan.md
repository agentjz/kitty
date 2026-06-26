# Kitty 现场表达与上下文自然性封顶 Plan

## 1. 需求文档

用户要解决的实际问题是：Kitty 已经能记录 session、memory、execution、events、cost、context budget，但这些事实呈现给模型和用户时有时像账本摘要，不像一个一直在当前对话现场里的 agent。

这轮要把“现场表达”做成生产级终局：

- 模型看到的是当前任务现场、近场连续性和必要证据，不是数据库字段清单。
- 用户看 `kitty status` 时先看到现在在做什么、下一步是什么、有没有卡住，再看详细事实。
- CLI、TUI、Web、Telegram 仍复用同一条 agent 主链路，不各自维护第二套状态。
- 结构化事实不丢；自然表达只负责投影，不替模型判断用户意图。

业务完成标准：

- Kitty 保留完整机器事实，同时第一屏和当前轮上下文不再被 `execution(s)`、`asset(s)`、`unknown`、`none` 这类账本语言主导。
- 内部 wake、execution、runtime facts 不会被伪装成用户新要求。
- 当前现场能回答：现在是什么状态、焦点是什么、卡在哪里、后台/子代理是否还活着、上下文和成本是否正常。

## 2. 当前事实

仓库事实：

- `RuntimeStatus` 是结构化事实主干，位于 `src/runtime/statusTypes.ts` 和 `src/runtime/status.ts`。
- `src/runtime/scene.ts` 已经负责把结构化 status 投影为 `scene`，但当前输出仍包含 `execution(s)`、`asset(s)`、`context unknown`、`cache layout unknown`、`no recovery action needed` 等机器口吻。
- `src/cli/commands/runtimeStatusPresenter.ts` 第一屏先打印 `Scene:`，随后又打印 `Current workspace:`，信息重复，并把自然现场和账本详情混在一起。
- `src/context/runtime/sessionBrief/` 只在有模型写出的 session memory 时注入 continuity，避免从旧对话机器生成用户锚点，这是正确边界。
- `src/context/runtime/prompt.ts` 仍把 `Task lifecycle`、`Project map` 直接作为字段块注入模型。它们是机器事实，但标题和字段口吻偏账本。
- `src/shell/tui/store.ts` 和 `RuntimeDock.ts` 已有底部现场，显示后台、子代理、上下文；TUI 不应另建第二套任务状态。
- `spec/用户审阅/系统核心/核心地图.md` 已写明 runtime facts 留在证据层，当前轮直接携带同 session 近场可见对话。

参考项目事实：

- Codex 把 thread、turn、items、status、token usage 分开。API 暴露完整事实，客户端按当前 thread/turn 投影，不把所有账本字段塞进主对话。
- Codex thread store 记录 preview、first user message、token usage、turn status 等事实；这些事实用于恢复和列表，不自动替代当前用户意图。
- opencode 的 timeline projection 按 user message 聚合 assistant parts、thinking、error、diff summary；UI 显示当前活动 message，而不是直接展示底层 message/event 表。
- opencode 的 todo dock 只把当前 todo 进度作为底部现场，不把 todo 明细常驻污染主对话。
- Goose 的 task execution display 把执行状态投影为进度和最近输出；底层事件仍是结构化通知。

当前缺口：

- Kitty 已有事实层，但自然现场投影不够硬，测试还在保护账本式文案。
- `kitty status` 第一屏不是产品现场，而像 status 表和 scene 表叠加。
- 模型 prompt 里的运行事实块标题偏机器账本，不够像“当前现场证据”。
- TUI 的现场状态和 CLI status 使用的表达来源还不够统一。

## 3. 失败测试

以下情况视为失败：

- runtime scene 的第一屏文案仍出现 `execution(s)`、`asset(s)`、`context unknown`、`cache layout unknown`、`no recovery action needed`。
- 没有 session 时，用户看到的是 `none` 或 `unknown`，而不是明确可行动的当前现场。
- 有 subagent/background 正在运行时，scene 只说 execution 数量，不说是什么工作还活着。
- `kitty status` 第一屏仍把自然现场和账本详情混排，无法一眼看出 Now/Focus/Next/Blocked/Background/Cost。
- context prompt 仍以 `Task lifecycle` 这类账本标题作为主表达，而不是说明这是当前任务现场证据。
- 测试只保护字符串口号，没有覆盖真实产品行为：空项目、运行中 execution、卡住 background、session memory、cache/tool output facts。

## 4. 目标

本轮最终交付：

- `RuntimeSceneSummary` 继续作为统一自然现场投影，所有结构化事实仍留在 `RuntimeStatus`。
- `scene` 输出变成自然产品语言：当前状态、焦点、下一步、阻塞、后台、记忆、技能、成本、恢复。
- `kitty status` 第一屏先展示自然现场，详细事实放到后续 `Runtime facts`、`Recent...` 等章节。
- context prompt 的 session continuity、task state、project map 变成更明确的“证据块”，避免让模型把内部事实当用户命令。
- TUI 底部现场复用同一套语义表达函数，保持 CLI/TUI 表达一致但展示形式不同。
- 更新测试和 spec，确保事实层和呈现层边界被保护。

## 5. 不做范围

- 不重写 session/event/control-plane 存储。
- 不新增长期记忆系统或向量库。
- 不做 TUI 大布局重构。
- 不做 Web/Telegram UI 重写。
- 不删除结构化事实字段。
- 不写 legacy、不做旧兼容、不保留不存在的能力入口。

## 6. 设计

### 6.1 主链路

输入进入 session 后，context runtime 构建当前轮上下文。近场可见对话仍是自然连续性的主干；session memory 只在模型写出后进入 continuity；runtime facts 只作为证据块。

工具、background、subagent 改变 control-plane 状态。`buildRuntimeStatus` 读取机器事实。`buildRuntimeScene` 把这些事实投影为自然现场。CLI/TUI/未来 UI 读取 scene 呈现，不直接重新判断底层 execution 语义。

### 6.2 模块边界

- `src/runtime/status.ts`：读取事实，不写自然文案。
- `src/runtime/scene.ts`：唯一自然现场投影层，负责把机器事实翻译成 Now/Focus/Next/Blocked/Cost/Recovery。
- `src/cli/commands/runtimeStatusPresenter.ts`：只负责排版，不重新计算现场。
- `src/context/runtime/sessionBrief/`：只注入模型写出的连续性，不从旧对话推断用户意图。
- `src/context/runtime/prompt.ts`：把 task/project facts 包装成当前证据，不让字段标题变成命令。
- `src/shell/tui/*`：只做 TUI 展示，不另建状态事实源。

### 6.3 状态归属

结构化状态仍归 session、control-plane、observability、runtime status。

自然表达归 scene。scene 不落盘，不成为第二事实源。它可以被 CLI/TUI/Web/Telegram 读取，也可以被测试保护。

### 6.4 错误和恢复边界

没有事实时，用户可见表达写“还没有测量/还没有会话/没有后台工作”，不写 `unknown`。机器内部解析函数仍可使用 `unknown` 类型和值，不能为了文案清理破坏数据校验。

卡住、无输出、stale、deadline passed 必须在 scene 里明确暴露为需要处理的现场，不隐藏。

## 7. 实施任务

- [x] 重写 `plan.md`，把当前任务从上一轮 eval 收口切换为现场表达封顶计划。
- [x] 重构 `src/runtime/scene.ts` 的自然文案，去掉第一屏账本味，并保留全部机器事实来源。
- [x] 更新 `RuntimeSceneSummary` 必要字段或辅助函数，使 CLI/TUI 能共享现场表达。
- [x] 重排 `formatRuntimeStatusText` 第一屏，明确区分自然现场和详细 runtime facts。
- [x] 调整 context prompt 的 block 标题和说明，让模型把 runtime facts 当证据，不当用户输入。
- [x] TUI 保持当前底部现场语义，不新建第二事实源；初始上下文显示保持用户已确认的 `0%`。
- [x] 更新 runtime/context/TUI/CLI 测试，覆盖空现场、运行中、卡住、成本、记忆和 prompt 证据边界。
- [x] 更新 `spec/` 与 README 中关于现场、status、context 的当前事实。
- [x] 运行局部测试、完整验证、build、local eval、production eval。
- [x] 完成超过 300 行文件职责审查，并拆分确实混职责的大文件。
- [x] 更新收口记录。

## 8. 验证计划

局部验证：

```bash
npm.cmd run typecheck
node --test dist/tests/runtime/status.test.js
node --test dist/tests/context/session-brief.test.js
node --test dist/tests/context/project-map-context.test.js
node --test dist/tests/shell/tui-store.test.js
```

完整验证：

```bash
npm.cmd run verify
npm.cmd run build
npm.cmd run eval:local
npm.cmd run eval:production
```

文档和字符串检查：

```bash
rg -n "execution\\(s\\)|asset\\(s\\)|context unknown|cache layout unknown|no recovery action needed|Task lifecycle|Current workspace|Scene:" src tests spec README.md
```

允许 `unknown` 出现在 TypeScript 类型、解析函数、错误兼容和机器事实字段中；不允许它作为普通用户现场的默认文案。

## 9. 收口

已完成。

完成事实：

- `src/runtime/scene.ts` 继续作为自然现场投影层；结构化事实仍留在 runtime status、session、control-plane、observability。
- `kitty status` 第一屏改为 `Current scene`，详细机器事实下沉到 `Runtime facts`。
- context prompt/session brief/working memory 的运行事实标题改为 evidence 语义，避免把内部状态伪装成用户要求。
- TUI 初始上下文保持 `0%`，不再用 `unknown` 做默认用户现场。
- README 与 `spec/` 已同步当前事实。

大文件职责审查：

- 已拆 `src/evaluation/checks.ts`：场景清单、成本/输出验收、现场验收、host/remote/recovery 验收、workspace helper 分离。
- 已拆 `src/shell/tui/transcriptLayout.ts`：公开编排入口、类型、frame/style、span wrapping 分离。
- 已拆 `src/provider/responsesAdapter.ts`：Responses 请求体、响应解析、传输 adapter 分离。
- 已拆 `src/host/turn.ts`：delegated exact closeout 从 host turn 生命周期中分离。
- 保留 `src/context/runtime/compression/builder.ts`：职责是构建压缩后的 provider 请求和预算报告。
- 保留 `src/session/snapshot.ts`：职责是 session snapshot schema 的严格读写和归一化入口。
- 保留 `src/protocol/manifest.ts`：职责是 capability manifest 的解析与转换。
- 保留 `src/telegram/service.ts`：职责是 Telegram service 生命周期、轮询、队列和 turn 接线。

验证结果：

- `npm.cmd run typecheck` 通过。
- `npm.cmd run build` 通过。
- `node --test .test-build/tests/evaluation/**/*.test.js` 通过。
- `node --test .test-build/tests/shell/tui-store.test.js .test-build/tests/shell/tui-markdown.test.js .test-build/tests/shell/tui-render.test.js` 通过。
- `npm.cmd run verify` 通过，249 个 core tests 全绿。
- `npm.cmd run eval:local` 通过。
- `npm.cmd run eval:production` 通过，真实 yls provider、Responses probe、两轮真实 turn、runtime status 均通过。
- 旧账本文案扫描无命中：`Scene:`、`Current workspace`、`Task lifecycle`、`Project map`、`Internal continuity state`、`execution(s)`、`asset(s)`、`context unknown`、`cache layout unknown`、`no recovery action needed` 没有回到用户/模型主路径。

剩余风险：

- 真实长时间使用仍需要靠连续生产任务观察模型漂移、memory 自然性和 provider 稳定性。
- 本轮没有重写 session/event/control-plane 存储，也没有新增长期记忆或 UI 大布局。
