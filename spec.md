# Kitty 规格

`spec.md` 是仓库当前技术事实的唯一主干。它描述当前存在的能力、各模块的职责边界，以及测试必须保护的行为。

## 1. 产品与规则

Kitty 是本地编程智能体。它接收用户任务，构建上下文，调用模型，执行工具，保存工作状态，并能在同一任务现场继续工作。

产品目标是持久化的智能体工作能力：

- 单一 lead agent 循环；
- 可持久保存的 session 与任务事实；
- 支持长任务的有界上下文；
- core 工具与可选 extension；
- 后台命令与 subagent；
- 可观测、可恢复的宿主运行边界。

核心规则：

- 模型负责计划、优先级和语义取舍。
- 机器模块负责执行、校验、持久化和暴露事实。
- CLI、TUI、Web、Telegram 和 worker 复用同一条 host turn 边界。
- 不保留兼容层、别名、旧状态或平行事实源。
- 代码、测试、CLI 输出和本文档必须描述同一个当前产品事实。

## 2. 系统地图

主链路：

```text
宿主输入
  -> host turn
  -> agent turn
  -> context request
  -> provider request
  -> 工具批次或最终回答
  -> session / control-plane / observability 持久化
  -> 宿主输出
```

项目持久状态位于 `.kitty/`：

```text
.kitty/.env
.kitty/sessions/
.kitty/memory/{sessions,project,user,evidence}/
.kitty/events/
.kitty/changes/
.kitty/extensions/
.kitty/control-plane.sqlite
.kitty/observability/{events,crashes,terminal}/
```

`src/project/statePaths.ts` 负责这些路径。`src/context/repoRoots.ts` 负责解析执行根目录和共享状态根目录，包括 Git worktree。

## 3. 配置与项目发现

### 职责

- `src/config/`：读取 `.kitty/.env`、校验运行配置、创建模板、执行配置诊断。
- `src/provider/catalog.ts`：定义 provider 与 model 的固有事实。
- `src/project/`：构建项目地图并管理 `.kitty` 路径。
- `src/context/projectContext.ts`：为 turn 加载项目事实和运行时 skill 清单。

### 运行配置

`resolveRuntimeConfig()` 是运行时入口。它加载项目环境，校验必填字段，解析选定的 provider/model 组合，并返回路径和宿主配置。

主要用户配置：

- `KITTY_PROVIDER`
- `KITTY_MODEL`
- `KITTY_BASE_URL`
- `KITTY_API_KEY`
- thinking、reasoning effort、输出和上下文限制
- extension 开关
- Telegram 配置

未知 provider、不支持的 provider/model 组合、缺失必填项和非法值必须显式失败。运行时不能静默猜测 model 或 provider。

`kitty init` 创建项目状态模板。`kitty doctor` 展示配置和 provider 连接事实。

## 4. Agent 与 Host Turn

### 职责

- `src/agent/`：模型驱动的 turn 循环、prompt layer、profile、工具批次推进、turn 持久化、标题和 memory 更新。
- `src/host/`：所有宿主共用的生命周期、session 绑定、工具注册表创建、turn 事件、abort 处理、lead 等待与恢复。
- `src/interaction/`：宿主无关的交互输入输出驱动。

### Turn 行为

`runHostTurn()` 是统一 turn 边界。它：

1. 记录 host 和 session 的 `turn.started` 事实。
2. 创建已启用的工具注册表。
3. 运行 lead 或 worker agent turn。
4. 当 execution 拥有阻塞型 wait policy 时处理 lead 等待。
5. 记录 completed、failed 或 aborted 事实。
6. 关闭本轮工具资源。

`runAgentTurn()` 负责模型/工具循环。每一轮循环：

1. 加载项目上下文和当前 task lifecycle 事实。
2. 构建 prompt layer 与有界 provider request。
3. 将 context budget 事实保存到 session。
4. 请求模型。
5. 流式输出 reasoning 和回答回调。
6. 执行工具批次或收束最终回答。
7. 最终回答后写入 session title、memory 和完成态 task lifecycle 事实。

Provider 临时失败走有界的 retry/recovery 事实。Abort 必须通过 host lifecycle 退出，不能伪造正常完成。

## 5. Context 与 Session 连续性

### 职责

- `src/context/`：prompt 组成、项目事实、对话窗口、压缩和 context budget 测量。
- `src/session/`：session schema、持久快照、消息、checkpoint、workset、task state、memory 和 session 事件。
- `src/runtime/memory/`：project、user、evidence、session memory asset 的持久访问。

### Session 事实

Session 保存可见消息、context budget、task state、checkpoint、workset、session diff、可选标题和模型写出的 session memory。快照存入 `.kitty/sessions/`；每次保存同步写入可审阅的 session memory asset。

内部 wake/reminder 消息不作为普通用户对话渲染，也不进入自然对话历史。

Session memory 使用以下固定 Markdown 区块：

- `Current Focus`
- `User Constraints`
- `Decisions`
- `Open Threads`
- `Verification Facts`
- `Reusable Lessons`

机器负责区块形状和持久化。模型基于本轮实际证据写入内容。

### Context budget

Context 优先保留可见的近场对话。超过配置预算后，它摘要较早消息，并压缩早期 tool/user/assistant 内容，同时保留安全的近期 tail 和工具边界。

Provider replay 是 wire contract。DeepSeek 兼容工具调用历史必须保留所需 reasoning content；无法 replay 的历史工具批次必须转换成明确的摘要事实，不能发送无效请求。

Context budget 记录 limit、estimate、remaining、compression mode、source、prompt hotspot 和 cache layout 事实。它只测量，不替模型决定任务路线。

## 6. Provider 层

### 职责

- `src/provider/catalog.ts`：provider/model catalog 与 capability 事实。
- `src/provider/capabilities.ts`：请求期 capability 投影。
- `src/provider/client.ts`、`transport.ts`、`connection.ts`：client、base URL、probe。
- `src/provider/request.ts`：请求生命周期、streaming fallback、retry 接入和 observability。
- `src/provider/*Adapter.ts`：Responses 与 Chat Completions wire adapter。

Provider 与 model 是独立事实。Provider 决定 transport、endpoint 行为、认证形态和 probe 行为；model 决定 wire API、限制、thinking/reasoning 选项、工具、usage、cache 和 reasoning replay 要求。

Provider 层把模型响应、streaming、usage 和临时 transport 失败归一为 agent 事实。它不增加任务策略。

## 7. Tools 与 Extensions

### Core 工具

`src/tools/` 负责工具注册表与 core 工具实现。当前 core 工具：

- `read`
- `write`
- `edit`
- `bash`
- `send_file`

工具执行真实操作，返回有界证据，记录 changed path，并在需要时保留可恢复的原始输出。Tool output projection 限制上下文成本，但不伪造语义结论。

### Extensions

`src/extensions/definitions.ts` 是 extension 注册表。当前 extension：

- `todo`：session checklist 事实。
- `worktree`：Git worktree 生命周期。
- `network`：结构化 HTTP 工作。
- `background`：可持久追踪的非阻塞命令执行。
- `subagent`：聚焦的独立 agent execution。
- `skills`：运行时 skill 发现与显式加载。

Extension 只在配置启用时进入同一工具注册表。它们不是另一条 agent loop，也不是 core 工具。

运行时 skill 是项目能力包。Context 只暴露 skill 清单；模型在相关时显式加载 skill 或资源。Skill 不自动路由模型行为。

## 8. Control Plane 与 Execution

### 职责

- `src/control/`：task lifecycle、execution record、wake signal 的 SQLite schema 和持久账本。
- `src/execution/`：execution 启动、worker 生命周期、输出读取、reconcile、取消、lead wait 和进程树终止。
- `src/subagent/`：subagent 专用 execution 构建。

`.kitty/control-plane.sqlite` 是 execution 生命周期的唯一事实源。Execution 保存 kind、state、assignment、工作目录、pid、output/summary、wait policy、timeout 和关闭事实。

当前 execution kind：

- `background`：非阻塞的本地命令执行。
- `subagent`：独立 worker agent 执行。

当前 state：

- `created`
- `running`
- `paused`
- `completed`
- `failed`
- `aborted`
- `stale`

### Background 与 Subagent 语义

`background_run` 启动非阻塞 execution。读取、等待、停止和 CLI 命令都读取同一份 control-plane record。

`subagent_launch` 记录 objective、boundary、expected output、worker identity 和阻塞型 lead wait policy。Subagent 运行时，lead host 让出当前轮。等待期间，worker runtime UI event 会复放到 lead 当前输出流。Execution 收束后，host 从终态 execution 构建 wake fact，并恢复 lead 做收口。

Lead 不能根据工具名称或旧 tool result 猜测 execution 状态，只能读取 execution record。Deadline 到达时，阻塞 execution 进入 paused 并唤醒 lead。

### 取消与恢复

Execution stop/cancel 必须终止完整进程树：

- Windows：`taskkill /T /F`。
- POSIX：先终止进程组和子孙进程，短暂等待后升级为 `SIGKILL`。

Reconcile 会检测仍标记为 running 但进程已消失的 record，并将其关闭为 `stale`。Status 与 TUI 读取 reconcile 后的 control-plane 事实。

## 9. Runtime 事实与 Observability

### 职责

- `src/runtime/`：从持久事实构建 runtime status 和自然语言 scene summary。
- `src/runtime-ui/`：宿主无关的可见 turn event 与 tool display 投影。
- `src/observability/`：结构化事件、terminal log 和 crash report。

`buildRuntimeStatus()` 读取 session、memory asset、skill、project map、control-plane execution/wake signal、model request event 和 tool-output event。它不创建第二套状态。

Observability 记录：

- host turn 开始与结束；
- provider request 开始、完成、失败与 usage；
- tool-output projection 事实；
- session event；
- terminal transcript log；
- crash report。

Terminal log 使用 UTF-8，记录可读的用户输入、reasoning、assistant text、status 和工具边界。它是排查证据，不是运行时状态输入源。

## 10. Hosts 与用户界面

### CLI 与 API

- `src/cli/`：命令解析与 presenter。
- `src/host/localApi.ts`：本地 session/message/event/status API。
- `src/telegram/`：Telegram polling host。
- `src/web/`：Web host。

`kitty`、`kitty tui`、`kitty agent`、Web、Telegram 和 worker 命令都进入同一条 host/agent turn 主链路。`status`、`events`、`background`、`execution`、`doctor`、`eval` 等 CLI 命令暴露已存事实，不能创建平行生命周期语义。

### TUI

`src/shell/tui/` 是 Ink 宿主壳。它负责终端输入、滚动、resize、transcript layout、composer geometry、runtime dock 渲染和清理；它不拥有 session 或 execution 事实。

TUI 规则：

- Transcript 的 user、assistant、reasoning、system、subagent、subagent-reasoning 使用同一个正文框架。Role 可以改变 gutter、颜色和强调，但不能改变正文起始列。
- Footer 的 model 标签与 Runtime Dock 的 activity/background/subagent 标签使用同一个左侧内容 inset。
- Model metadata 位于 composer 下方左侧；context budget 位于右侧。
- Runtime Dock 保持稳定两行结构，展示当前 activity、运行时长、lead blocking 和 live background/subagent lane。
- TUI 只显示 control-plane 状态为 `created` 或 `running` 的 background/subagent lane。
- 存在 live execution lane 时，TUI 轻量刷新 execution 账本。Execution 进入终态后必须清除 lane；启动时的 `running` 文案不能成为错误的当前状态。
- 阻塞型 subagent 的 reasoning、工具动作和回答必须显示在当前 lead transcript，直到 lead 恢复。
- 首屏 transcript 保持空白。User message 使用紧凑的低对比整行背景。Reasoning 是低强调信息。
- Transcript 与 footer 之间使用一行空白背景，不使用显眼的分割线。

## 11. 验证

日常确定性验证：

```powershell
npm.cmd run verify
```

`npm.cmd run verify` 执行 typecheck、build 和编译后的 core test。Core test 不调用真实 provider。

TUI 定向验证：

```powershell
npm.cmd run test:build
node --test .test-build/tests/shell/tui-render.test.js .test-build/tests/shell/tui-store.test.js .test-build/tests/shell/tui-shell.test.js
```

显式产品验收：

```powershell
npm.cmd run eval:local
npm.cmd run eval:production
```

`eval:production` 使用当前 `.kitty/.env`，可能消耗真实 API；它不能进入普通确定性测试。

## 12. Agent 修改纪律

修改 Kitty 前：

1. 阅读本文档和相关模块边界。
2. 追踪完整路径：输入、context、state、tool effect、持久事实、host output、test。
3. 每项机器事实只保留一个 owner。Presenter 只投影事实，不能重新计算或复制事实源。
4. 修改当前行为时，同步更新对应测试和本文档。
5. 先运行定向测试；完成后运行 `npm.cmd run verify`。

不要在当前代码中保留废弃接口、废弃状态、旧术语或迁移包装。历史只能作为 research 证据。
