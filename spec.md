# Kitty 规格

`spec.md` 是仓库当前技术事实的唯一主干。它描述当前存在的能力、各模块的职责边界，以及测试必须保护的行为。

## 1. 产品与规则

Kitty 是一个智能体。它接收用户任务，构建上下文，调用模型，执行工具，保存工作状态，并能在同一任务现场继续工作。

当前运行时最低版本是 Node.js 22。生产构建输出 CLI CJS 与 TUI ESM；Ink 的可选 `react-devtools-core` 保持 external，未安装时不影响 TUI 启动。

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
- CLI、TUI、Telegram 和 worker 复用同一条 host turn 边界。
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
.kitty/events/
.kitty/changes/
.kitty/exports/
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

- `KITTY_LOCALE`：`zh-CN`、`zh-TW`、`en`、`ja`、`ko`、`es`、`pt-BR`、`fr`、`de`、`ru`、`ar` 或 `hi`，默认 `zh-CN`；只影响 presentation。
- `KITTY_PROVIDER`
- `KITTY_MODEL`
- `KITTY_BASE_URL`
- `KITTY_API_KEY`
- thinking、reasoning effort、输出和上下文限制
- extension 开关
- Telegram 配置

未知 provider、不支持的 provider/model 组合、缺失必填项和非法值必须在配置 schema 显式失败。运行时不能静默猜测 model 或 provider。

默认 provider profile 是 Agnes AI。当前具名 provider profile 还包括 NVIDIA NIM、Groq、Cerebras、Gemini、DeepSeek、OpenAI、YLS 和 TTAPI。`openai-compatible` 仅用于用户明确配置的高级兼容 endpoint；它不是任何具名 provider 的别名。

`kitty init` 创建项目状态模板。`kitty doctor` 展示配置和 provider 连接事实。

## 4. Agent 与 Host Turn

### 职责

- `src/agent/`：模型驱动的 turn 循环、prompt layer、profile、工具批次推进、turn 持久化和标题更新。
- `src/host/`：所有宿主共用的生命周期、session 绑定、工具注册表创建、turn 事件、abort 处理、lead 等待与恢复。
- `src/interaction/`：宿主无关的交互输入输出驱动。

本地命令名称、别名、分类、说明和解析只由 `src/interaction/localCommandDefinitions.ts` 持有。CLI/TUI 等壳可以采用不同呈现，但必须把规范输入交回 `InteractiveSessionDriver`；壳不能直接调用命令 handler 或维护第二张命令表。

`/copy` 把当前 session 的外部 user 消息、assistant reasoning 和 assistant reply 按顺序导出到 `.kitty/exports/conversation-<sessionId>.md`，聊天区只显示导出路径。Tool、system 和 internal user fact 不进入面向用户的对话文件。

### Turn 行为

`runHostTurn()` 是统一 turn 边界。它：

1. 将输入写入 durable turn queue。
2. 按 session 队首原子 claim owner token，并维持 lease heartbeat。
3. 记录带 turn ID 的 `turn.started` 事实并创建工具注册表。
4. 运行 lead 或 worker agent turn；所有 session 写入和工具边界校验 owner token。
5. 当 execution 拥有阻塞型 wait policy 时处理 lead 等待。
6. 记录 completed、failed 或 aborted 终态并释放 lease。

`runAgentTurn()` 负责模型/工具循环。每一轮循环：

1. 加载项目上下文和当前 task lifecycle 事实。
2. 构建 prompt layer 与有界 provider request。
3. 将 context budget 事实保存到 session。
4. 请求模型。
5. 流式输出 reasoning 和回答回调。
6. 执行工具批次或收束最终回答。
7. 最终回答后写入 session title 和完成态 task lifecycle 事实。

交互宿主在 active turn 期间收到的普通外部输入不是新 turn，而是写入 SQLite `turn_steers` 的 durable steer。Steer 按 turn 内 sequence 排序，状态为 `pending`、`consumed` 或 `rejected`；agent 在下一次 context 构建前消费，并以确定 message ID 写入同一 session。Final answer 进入持久化前必须通过 turn `closing` 事务边界确认没有 pending steer；若同时到达新 steer，则保存当前 assistant 输出并继续同一 turn。

`Ctrl+C` 是显式 abort：当前 turn 进入 aborted，未消费 steer 进入 rejected。中断清理尚未结束时的新输入必须 admit 为下一 durable turn，不能写到即将 aborted 的 owner。终端 EOF/关闭是 recoverable detach：停止本地执行但把 active turn 放回 queued，pending steer 保持 pending；进程强杀后由 lease expiry 完成同一 turn 恢复。任何时刻同一 session 只能有一个有效 execution owner。

Provider request 是临时失败的唯一重试 owner：同一逻辑请求最多四次调用、总等待最多 90 秒，并优先采用服务端 `Retry-After`。Agent turn 不得重新发送已耗尽重试预算的请求。Abort 必须中断当前请求或等待，不能伪造正常完成。

## 5. Context 与 Session 连续性

### 职责

- `src/context/`：prompt 组成、项目事实、对话窗口、压缩和 context budget 测量。
- `src/session/`：SQLite session 聚合、消息、checkpoint、workset、task state 和 session 事件。

### Session 事实

Session 保存 append-only 可见消息、revision、context budget、task state、checkpoint、workset、session diff 和可选标题。`sessions` 与 `session_messages` 表位于 `.kitty/control-plane.sqlite`；保存使用 revision CAS，不能覆盖并发提交。模型生成的 session title 只接受普通标题文本；工具协议、tool call JSON 或空文本不能写成标题事实。

内部 wake/reminder 消息不作为普通用户对话渲染，也不进入自然对话历史。

产品不维护自动长期 memory。长任务连续性来自同一 session 的 append-only message、task/checkpoint/workset、tool journal 和 context epoch。

### Context budget

Context 优先保留可见的近场对话。超过配置预算后，它摘要较早消息，并压缩早期 tool/user/assistant 内容，同时保留安全的近期 tail 和工具边界。

近期 canonical tool evidence 使用 model view；较旧 tool evidence 在 normal/aggressive/hard compression 中直接切换为自身 compact view。compact view 已有严格边界，context 不再对它进行第二次无语义字符串截断。状态与上下文压缩读取 compact evidence，而不是再次解析 model-facing 文本。

Provider replay 是 wire contract。DeepSeek 兼容工具调用历史必须保留所需 reasoning content；无法 replay 的历史工具批次必须转换成明确的摘要事实，不能发送无效请求。

Context budget 记录当前有效 limit、estimate、remaining、compression mode、source、prompt hotspot 和 cache layout 事实。压缩结果写入 context epoch，保存 source message count、last message ID、SHA-256 prefix hash、summary 和 budget。最小请求仍超限时本地抛出 `ContextBudgetExceededError`，不得发送已知超限请求。

## 6. Provider 层

### 职责

- `src/provider/catalog.ts`：provider/model catalog、Chat Completions 请求方言与 capability 事实。
- `src/provider/capabilities.ts`：请求期 capability 投影。
- `src/provider/client.ts`、`transport.ts`、`connection.ts`：client、base URL、probe。
- `src/provider/request.ts`：请求生命周期、streaming fallback、retry 接入和 observability。
- `src/provider/chatRequestBody.ts`：Chat Completions 通用 request body 装配。
- `src/provider/chatRequestDialect.ts`：Chat Completions provider/model 请求方言投影。
- `src/provider/*Adapter.ts`：Responses 与 Chat Completions wire adapter。

Provider 与 model 是独立事实。Provider 决定 transport、endpoint 行为、认证形态和 probe 行为；model 决定 wire API、限制、工具、usage、cache、reasoning replay 和 Chat Completions 请求方言。方言包括 reasoning 参数、tool choice、stream usage 和输出 token 参数名；request body 只能投影这些事实，不能按 provider 名称散落特判。

Chat Completions 的 HTTP abort signal 必须作为 SDK request options 传递，不能进入 JSON body。只有明确的无状态 stream framing 故障可以降级为一次非流式请求；认证、参数校验、限流和 HTTP provider error 不得被非流式 fallback 重放。

Provider request 边界把 adapter、transport 和 SDK 失败归一为 `ProviderError`。错误 kind 驱动 retry、stream fallback 和 alternate base URL；CLI 只展示结构化错误事实。没有可用工具时，Chat Completions request 必须省略 `tools` 字段，不能发送空工具数组。Provider 层不增加任务策略。

## 7. Tools 与 Extensions

### Core 工具

`src/tools/` 负责工具注册表与 core 工具实现。当前 core 工具：

- `read`
- `write`
- `edit`
- `bash`
- `send_file`

工具执行真实操作，返回有界证据，记录 changed path，并在需要时保留可恢复的原始输出。每次 tool call 无论成功或失败都必须持久为下一次模型请求可见的非空 tool result；成功但没有文本输出时，机器明确记录该事实。Tool output projection 限制上下文成本，但不伪造语义结论。

每个 tool result 同时保存当前唯一的 typed evidence：call id、tool、status、summary、provenance、facts、error、artifact、truncation、model view 和 compact view。Tool intent 在副作用前写入 `tool_calls`，每个 canonical result 在执行完成后立即落账；恢复时悬空 intent 变成明确 interrupted evidence，副作用工具不自动重放。工具实现拥有原始结果；evidence builder 拥有模型证据合同；session 保存 canonical evidence；context 只选择 full 或 compact view；宿主展示继续读取 display/raw result。

模型证据遵循最小充分原则：必须足以判断本次操作是否成功、作用于哪里、产生了什么关键事实、失败根因是什么、下一步如何恢复。工作区内目标使用相对路径；工作区外目标保留绝对路径。read 返回实际行区间和 continuation；edit/write 返回目标和变更范围；bash 返回 cwd、exit code、duration、头尾输出和 artifact recovery。大输出保留头尾，明确省略规模，并提供可执行的 `read` 恢复参数。

`bash` 只有正常零退出才返回成功。非零退出、超时、停滞和中断都是失败 tool result；payload、evidence、callbacks、session blocker、observability 和模型视图必须使用同一状态。

同一模型批次只对连续、声明为 read effect 且 parallel-safe 的工具并发执行。write、process、external 和 state effect 保持模型给出的顺序。并发读取产生的 session/workset 事实必须归并后持久化，不能用吞掉状态更新换延迟。

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

- `src/control/`：session、turn、tool call、context epoch、task lifecycle、execution、wake 和 runtime event 的 SQLite schema 与账本。
- `src/execution/`：execution 启动、worker 生命周期、输出读取、reconcile、取消、lead wait 和进程树终止。
- `src/subagent/`：subagent 专用 execution 构建。

`.kitty/control-plane.sqlite` 是运行事实的唯一持久主干。Execution 保存 kind、state、assignment、工作目录、pid、owner token、heartbeat、lease、output/summary、wait policy、timeout 和关闭事实。

当前 execution kind：

- `background`：非阻塞的本地命令执行。
- `subagent`：独立 worker agent 执行。

当前 state：

- `created`
- `claimed`
- `running`
- `cancelling`
- `completed`
- `failed`
- `aborted`
- `lost`

### Background 与 Subagent 语义

`background_run` 启动非阻塞 execution。读取、等待、停止和 CLI 命令都读取同一份 control-plane record。

`subagent_launch` 记录 objective、boundary、expected output、worker identity 和阻塞型 lead wait policy。Subagent 运行时，lead host 让出当前轮。等待期间，worker runtime UI event 会复放到 lead 当前输出流。Execution 收束后，host 从终态 execution 构建 wake fact，并恢复 lead 做收口。

Lead 不能根据工具名称或展示字符串猜测 execution 状态，只能读取 execution record。Deadline 到达时进入 cancelling，终止进程树，确认后进入 aborted 并唤醒 lead。

### 取消与恢复

Execution stop/cancel 必须终止完整进程树：

- Windows：`taskkill /T /F`。
- POSIX：先终止进程组和子孙进程，短暂等待后升级为 `SIGKILL`。

Reconcile 以 lease 和 heartbeat 判断 ownership；PID 只用于诊断和进程树终止。进程消失或 lease 丢失且无法确认正常终态时关闭为 `lost`。Execution 终态与 wake signal 在同一事务内幂等提交。

## 9. Runtime 事实与 Observability

### 职责

- `src/runtime/`：从持久事实构建 runtime status 和自然语言 scene summary。
- `src/runtime-ui/`：宿主无关的可见 turn event 与 tool display 投影。
- `src/observability/`：结构化事件、terminal log 和 crash report。

`buildRuntimeStatus()` 读取 SQLite session、turn、context、execution、wake、model request 和 tool-output event，再投影 skill 与 project map。它不读取 JSON session、JSONL runtime event 或展示字符串作为状态源。

Observability 记录：

- host turn 开始与结束；
- provider logical request、每次 HTTP attempt、完成、失败、usage 与 request/attempt ID；
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

`kitty`、`kitty tui`、`kitty agent`、Telegram 和 worker 命令都进入同一条 host/agent turn 主链路。`status`、`events`、`background`、`execution`、`doctor`、`eval` 等 CLI 命令暴露已存事实，不能创建平行生命周期语义。

### TUI

`src/shell/tui/` 是 Ink 宿主壳。它负责终端输入、滚动、resize、transcript layout、composer geometry、overlay/focus、runtime dock 渲染和清理；它不拥有 session 或 execution 事实。

TUI 规则：

- Composer 是 controller/store 持有的受控状态，React 组件不能私有持有另一份 draft 或 cursor。唯一键盘入口按全局动作、顶层 overlay、composer 编辑的顺序分派。
- Composer 内容框是可见输入与终端 IME 光标的唯一几何 owner。Ink 布局后测得的内容框绝对位置与当前字符的显示单元偏移生成光标坐标，再由唯一 renderer adapter 将容器行下移到文本基线；welcome、运行中状态、overlay、换行和 resize 不得维护独立光标行、双 frame 或 footer 行数补偿。
- 输入 `/` 打开共享命令补全；`Ctrl+P` 打开同源命令面板；Up/Down 或 Ctrl+P/N 选择，Tab 补全，Enter 经原 input queue 执行，Esc 只关闭顶层 overlay。
- `Ctrl+R` 搜索当前 session 的外部用户输入历史。普通 Up/Down 先在多行草稿内移动，到首尾边界后才遍历历史；历史条目不可被原地修改。
- 空草稿输入 `?` 打开真实键位帮助。Home/End 按当前行移动，Ctrl+Home/End 同时定位 transcript 和整个草稿；Delete 向前删除，Backspace 向后删除；Ctrl+K/U/W/Y 使用 composer kill buffer。
- `Ctrl+G` 释放 TUI raw input 并启动 `$VISUAL`、`$EDITOR` 或平台默认编辑器；编辑成功后替换草稿，失败时保留原草稿并显示错误，临时文件必须清理。
- 未提交草稿同步写入 SQLite `interaction_drafts`，以 session ID 和 shell 为 owner；只有数据库短暂占用时才进入待写重试。草稿不属于 session message 或模型上下文；提交时清除，正常退出时 flush，恢复时 clamp cursor。
- 命令、历史和帮助共享一个判别式 overlay 状态；同一时刻只能有一个顶层交互，响应式行预算不能覆盖 composer、dock 或 transcript。
- Transcript 滚动状态只能是 `follow` 或 `detached`。Detached 状态保存稳定 row anchor 和 unseen row count；流式追加、工具状态更新与 resize 不能把阅读位置拉回底部。
- Input gateway 使用有状态 UTF-8 decoder 保留跨 chunk 的中文与 IME 提交，并对跨 chunk 的 SGR/X10 mouse press、drag、release 和 wheel 做完整 framing；鼠标序列不得进入 composer 键盘流。stdin EOF、close 或错误必须幂等关闭 controller 输入，让 active turn 进入 recoverable detach。Selection 使用渲染 row ID 与字符列，支持宽字符、跨行选择、边缘自动滚动和字符级高亮。
- 有 selection 时 `Ctrl+C` 复制，不触发 turn interrupt；无 selection 时才中断。Esc 清除 selection。Clipboard 优先使用平台 native provider，失败后在 TTY 使用 OSC52；复制失败必须保留 selection 并显示错误。
- Session picker、TUI chrome、CLI/doctor/status/runtime UI、command/help、interaction 与 Telegram 提示读取 runtime locale 的 typed catalog。十二份 catalog 必须拥有完全一致的 key 与占位符集合，运行时不做语言 fallback。Locale 不能进入 prompt、session message、tool evidence 或 control-plane 状态；命令名、路径、provider/model、机器 JSON 和模型回复保持原文。

- Transcript 的 user、assistant、reasoning、system、subagent、subagent-reasoning 使用同一个正文框架。Role 可以改变 gutter、颜色和强调，但不能改变正文起始列。
- Footer 的 model 标签与 Runtime Dock 的 activity/background/subagent 标签使用同一个左侧内容 inset。
- Model metadata 位于 composer 下方左侧；context budget 位于右侧。Footer 不显示分隔点、斜杠命令或命令面板教学。
- Context budget 必须属于当前选中的 session。项目全局 runtime status 不能用另一条最近已保存 session 的 budget 覆盖新建或已选 session。
- 用户提交后到最终模型回答完成期间，TUI 在 Runtime Dock 第一行右侧显示本轮持续时间；思考、工具调用和后续模型请求不重置它。
- Runtime Dock 保持稳定两行结构；第一行左侧展示当前 activity，过长摘要单行截断，右侧展示本轮持续时间；第二行展示 live background/subagent lane。
- TUI 只显示 control-plane 状态为 `created`、`claimed`、`running` 或 `cancelling` 的 background/subagent lane。
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
node --test .test-build/tests/shell/tui-command-menu.test.js .test-build/tests/shell/tui-external-editor.test.js .test-build/tests/shell/tui-gateway.test.js .test-build/tests/shell/tui-render.test.js .test-build/tests/shell/tui-store.test.js .test-build/tests/shell/tui-shell.test.js
```

`scripts/run-tests.mjs` 统一运行 core/evaluation 测试。它为子进程提供仓库内隔离临时根，每个临时 workspace 建立独立项目发现边界，单项测试使用有界超时，并在结束或启动失败时清理生成状态。

显式产品验收：

```powershell
npm.cmd run eval:local
npm.cmd run eval:production
```

`eval:production` 使用当前 `.kitty/.env`，可能消耗真实 API；它不能进入普通确定性测试。

Production tool acceptance 是真实修复任务，不是固定字符串工具演示。隔离工作区先处于失败状态；真实模型必须检查文件、运行失败验证、从长输出尾部读取根因、修改目标、重新验证通过，并在最终回答中引用成功 sentinel。缺少失败证据、真实变更、复验通过或最终消费中的任一项都判失败。

## 12. Agent 修改纪律

修改 Kitty 前：

1. 阅读本文档和相关模块边界。
2. 追踪完整路径：输入、context、state、tool effect、持久事实、host output、test。
3. 每项机器事实只保留一个 owner。Presenter 只投影事实，不能重新计算或复制事实源。
4. 修改当前行为时，同步更新对应测试和本文档。
5. 先运行定向测试；完成后运行 `npm.cmd run verify`。

不要在当前代码中保留废弃接口、废弃状态、旧术语或迁移包装。历史只能作为 research 证据。
