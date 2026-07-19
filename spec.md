# Kitty 规格

`spec.md` 是仓库当前技术事实的唯一主干。它描述当前存在的能力、各模块的职责边界，以及测试必须保护的行为。

## 1. 产品与规则

Kitty 是一个智能体。它接收用户任务，构建上下文，调用模型，执行工具，保存工作状态，并能在同一任务现场继续工作。

当前运行时最低版本是 Node.js 22.13.0。控制平面使用 Node 内置的 `node:sqlite`，安装 Kitty 不下载或编译第三方 SQLite 原生扩展。生产构建输出 CLI CJS、TUI ESM 与本地 Web 静态资产；Ink 的可选 `react-devtools-core` 保持 external，未安装时不影响 TUI 启动。

源码开发入口 `npm run dev` 先执行同一生产构建，再启动 `dist/cli.js`。开发入口与发布入口必须共享模块解析、CLI bundle 和 TUI chunk 合同，不维护只对 TypeScript 源码执行器成立的第二套运行路径。

产品目标是持久化的智能体工作能力：

- 每个 session 一个 agent loop；
- 可持久保存的 session 与任务事实；
- 支持长任务的有界上下文；
- core 工具与可选 extension；
- 后台命令；
- 机器驱动的持久定时任务；
- 可观测、可恢复的宿主运行边界。

核心规则：

- 模型负责计划、优先级和语义取舍。
- 机器模块负责执行、校验、持久化和暴露事实。
- CLI、TUI、Telegram、微信 iLink 和本地 API 复用同一条 host turn 边界。
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
.kitty/extensions/
.kitty/control-plane.sqlite
.kitty/observability/{events,crashes,terminal}/
```

`src/project/statePaths.ts` 负责这些路径。`src/context/repoRoots.ts` 负责解析执行根目录和共享状态根目录，包括 Git worktree。

## 3. 配置与项目发现

### 职责

- `src/config/`：读取 `.kitty/.env`、校验运行配置、创建模板、执行配置预检。
- `src/provider/catalog.ts`：定义 provider 与 model 的固有事实。
- `src/project/`：构建项目地图并管理 `.kitty` 路径。
- `src/context/projectContext.ts`：为 turn 加载项目事实和运行时 skill 清单。

### 运行配置

`resolveRuntimeConfig()` 是运行时入口。它加载项目环境，校验必填字段，解析选定的 provider/model 组合，并返回路径和宿主配置。

主要用户配置：

- `KITTY_LOCALE`：`zh-CN`、`en`、`ja` 或 `ko`，默认 `zh-CN`；只影响 presentation。其他值直接拒绝，不提供旧 locale 迁移或别名。
- `KITTY_PROVIDER`
- `KITTY_MODEL`
- `KITTY_BASE_URL`
- `KITTY_API_KEY`
- `KITTY_MEDIA_PROVIDER`、`KITTY_MEDIA_BASE_URL`、`KITTY_MEDIA_API_KEY`
- `KITTY_MEDIA_IMAGE_MODEL`、`KITTY_MEDIA_VIDEO_MODEL`
- `KITTY_MEDIA_REQUEST_TIMEOUT_MS`、`KITTY_MEDIA_POLL_INTERVAL_MS`
- thinking、reasoning effort、输出和上下文限制
- extension 开关
- Telegram 与微信 iLink 配置

未知 provider、不支持的 provider/model 组合、缺失必填项和非法值必须在配置 schema 显式失败。运行时不能静默猜测 model 或 provider。

默认 provider profile 是 Agnes AI，另有 DeepSeek official 与 Zhipu AI 具名 profile。Zhipu AI 默认模型是免费的 `glm-4.7-flash`，使用标准 BigModel API 端点，支持工具调用、自动上下文缓存与 preserved thinking。`openai-compatible` 是用户后续接入兼容 Chat Completions 免费模型的通用协议入口，不携带厂商模型 preset 或厂商 wire 特判。Kitty 不维护本地模型部署或本地模型 preset。

项目 env 模板使用中文短注释说明 Provider 参数。Agnes 与 Zhipu GLM-4.7 Flash 使用 `KITTY_THINKING=enabled|disabled`，不发送 `KITTY_REASONING_EFFORT`；DeepSeek 使用相同思考开关，并将推理强度收敛为 `high` 或 `max`。

图片/视频配置独立于语言模型配置。当前媒体 Provider 是 Agnes AI：图片模型 `agnes-image-2.1-flash`，视频模型 `agnes-video-v2.0`。媒体密钥优先使用 `KITTY_MEDIA_API_KEY`，为空时运行时回退到 `KITTY_API_KEY`，但 Web 保存和展示仍按独立媒体字段处理。

图片生成遵循 Agnes 官方合同：`POST /v1/images/generations`，URL 输出位于 `extra_body.response_format`。只对 Provider 已明确返回的 408、429、502、503、504、520、522、524 做有界重试；429 无 `Retry-After` 时等待一分钟，网络中断、客户端超时和用户取消不自动重放。`agnes-image-2.1-flash` 连续 503 后回退到当前账户可用的 `agnes-image-2.0-flash`，两模型合计最多四次请求。Abort 会中断请求或退避并阻止 fallback；未知外部副作用边界继续由 tool journal 结算为 interrupted/uncertain。Web 实时错误与 session replay 复用 typed tool presentation，展示精简 HTTP 状态和 Agnes request ID，不暴露嵌套上游错误体。

`kitty start` 是唯一初始化与本地控制台入口。它创建或补齐 `.kitty/.env`、`.env.example` 与 `.kittyignore`，再监听 `127.0.0.1` 随机端口并尝试打开浏览器；浏览器失败只保留可手动打开的 URL，不停止服务。文件已存在时只向两个 env 文件补充当前模板缺失的配置键，不覆盖已有值、自定义内容或 ignore 规则。独立 `kitty init` 不存在。

本地控制台是引导式工作流壳：首页按任务展示 Kitty 网页端控制、语言模型设置、插件与 Skill 开关、微信远程控制、Telegram 远程控制及其他设置，不使用后台管理侧栏。语言模型设置只负责 Provider、模型、密钥、连接测试和模型行为；插件与 Skill 开关在同一工作流中管理 Extension 开关并只读查看项目 Skill；其他设置承载语言、人格、上下文、文件和渠道参数。人格选项从当前 agent profile registry 投影，当前内置 `INTP` 与 `毒舌`，后者用于证据优先、直接且不攻击人的需求分析和代码审查。点击模块后进入单任务的配置、验证与运行详情，通过工作台按钮返回。渠道信息流在用户位于底部时继续跟随，离开底部后保持阅读位置，用户通过原生滚动回到底部。Web 从 `KITTY_LOCALE` 读取 `zh-CN`、`en`、`ja` 或 `ko`，由现有 typed catalog 投影页面、运行参数、人格选项、Extension 说明、状态和事件 presentation；外部 Web 壳在 WebSocket 首包接收同一套 locale 文案，Markdown assistant 内容由 `marked` 渲染，工具只显示已经投影的名称、目标、进度和结果摘要，不把原始 JSON 参数或返回暴露给用户。默认简体中文，provider/model、env key、Skill 内容与模型输出保持原文。后端拥有配置、Provider 探测、微信登录、channel lifecycle 和只读 Skill API；定时任务只通过 Agent scheduler 工具管理，不进入 Web。写请求必须携带启动期随机 token 且 Origin 必须等于当前 loopback origin；配置只接受已知 env key。`KITTY_API_KEY` 是运行时和持久配置唯一使用的 Provider 密钥；选择其他 Provider 时，页面清空密钥输入并要求在保存前填入对应密钥，不保存 Provider 专属副本。注释中的替代 Provider 预设只用于人工参考，不进入运行或展示判断。loopback 页面读取并显示 `.kitty/.env` 的当前值，包括 API Key 和 Bot Token；空 secret 更新保留原值，显式 clear 才删除。除远程渠道的 SSE 信息流外，`kitty start` 还提供带启动 token 的 `/web` WebSocket 工作壳；它复用同一 session、InteractiveSessionDriver 和 typed runtime events，不复制 Agent 核心。所有写入只在用户点击保存后发生，不自动保存或切换模型。

## 4. Agent 与 Host Turn

### 职责

- `src/agent/`：模型驱动的 turn 循环、prompt layer、profile、工具批次推进、turn 持久化和标题更新。
- `src/host/`：所有宿主共用的生命周期、session 绑定、工具注册表创建、turn 事件、abort 处理与恢复。
- `src/interaction/`：宿主无关的交互输入输出驱动。

本地命令名称、别名、分类、说明和解析只由 `src/interaction/localCommandDefinitions.ts` 持有。CLI/TUI 等壳可以采用不同呈现，但必须把规范输入交回 `InteractiveSessionDriver`；壳不能直接调用命令 handler 或维护第二张命令表。

`/export` 把当前 session 的外部 user 消息、assistant reasoning 和 assistant reply 按顺序导出到 Kitty 当前运行根目录的 `conversation-<sessionId>.md`，聊天区只显示导出路径。Tool、system 和 internal user fact 不进入面向用户的对话文件。

### Turn 行为

`runHostTurn()` 是统一 turn 边界。它：

1. 将输入写入 durable turn queue。
2. 按 session 队首原子 claim owner token 与单调 generation，并维持 lease heartbeat。
3. 记录带 turn ID 的 `turn.started` 事实并创建工具注册表。
4. 运行当前 session 的 agent turn；所有 session、steer 与工具写入都校验 token、generation 和有效 lease。
5. 在同一事务提交最终 session revision 与 completed、failed 或 aborted 终态。

`runAgentTurn()` 负责模型/工具循环。每一轮循环：

1. 加载项目上下文和当前 task lifecycle 事实。
2. 构建 prompt layer 与有界 provider request。
3. 将 context budget 事实保存到 session。
4. 请求模型。
5. 流式输出 reasoning 和回答回调。
6. 执行工具批次或收束最终回答。
7. 最终回答后写入 session title 和完成态 task lifecycle 事实。

交互宿主在 active turn 期间收到的普通外部输入不是新 turn，而是写入 SQLite `turn_steers` 的 durable steer。Steer 按 turn 内 sequence 排序，状态为 `pending`、`consumed` 或 `rejected`；agent 在下一次 context 构建前消费，并以确定 message ID 写入同一 session。Final answer 进入持久化前必须通过 turn `closing` 事务边界确认没有 pending steer；若同时到达新 steer，则保存当前 assistant 输出并继续同一 turn。

后台命令与 agent loop 在同一 turn 并行。`background_wait` 没有短、中、长任务分支；它在 execution 出现可见进度、进入终态、当前 turn 收到 pending steer 或显式安静等待上限到达时返回，模型再根据这些事实继续等待或收束。无变化期间不发起 provider 请求。Steer 只唤醒 wait，仍由上述唯一消费边界写入 session。

`Ctrl+C` 是显式 abort：当前 turn 进入 aborted，未消费 steer 进入 rejected。中断清理尚未结束时的新输入必须 admit 为下一 durable turn，不能写到即将 aborted 的 owner。`/exit`、终端 EOF/关闭和宿主终止信号把 active turn 放回 queued，同时终止当前 session 的 foreground/background 进程树；其他 session 不受影响。关闭有固定 deadline，重复信号升级为强制退出。父进程被强杀时，父死亡监护器负责终止目标进程树，重启后 lease reconcile 把未收口记录转成明确终态。任何时刻同一 session 只能有一个有效 turn owner generation。

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
- `src/provider/chatCompletionsAdapter.ts`：统一 Chat Completions wire adapter。

Provider 与 model 是独立事实。Provider 决定默认 endpoint 和 probe 行为；model 决定限制、工具、usage、cache、reasoning replay 和 Chat Completions 请求方言。当前语言请求统一使用 Bearer 与 Chat Completions；通用 `openai-compatible` 使用标准方言和用户显式填写的 model/base URL，Agnes、DeepSeek 与 Zhipu 的 wire 差异由 catalog model profile 投影，request body 不按 provider 名称散落判断。Zhipu 标准 API 的 Agent 请求使用 `thinking.type` 并设置 `clear_thinking: false`，工具调用后的 assistant 消息必须原样回放 `reasoning_content`。

Chat Completions 的 HTTP abort signal 必须作为 SDK request options 传递，不能进入 JSON body。只有明确的无状态 stream framing 故障可以降级为一次非流式请求；认证、参数校验、限流和 HTTP provider error 不得被非流式 fallback 重放。

语言模型请求对 429、临时网络故障和 5xx 使用同一个最多四次、总等待不超过 90 秒的逻辑请求预算；等待可被用户中断并通过 host status 暴露。服务端 `Retry-After` / `retry-after-ms` 是等待事实，不能被本地退避上限缩短；超过总等待预算时直接停止自动重试。Zhipu 错误方言只重试 1302、1303、1305、1312；每日/周期额度、套餐、模型权限与公平使用限制 1304、1308、1309、1310、1311、1313 不自动重试。智谱并发权益按账号、模型和时段动态变化，Kitty 不硬编码虚假的 RPM 或并发数。

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

每个 tool result 同时保存当前唯一的 typed evidence：call id、tool、status、summary、provenance、facts、error、artifact、truncation、model view 和 compact view。Tool intent 以 `(turn_id, call_id)` 写入 `tool_calls`，状态为 `planned -> running -> success/error/interrupted/uncertain`。每个工具紧邻真实调用前校验 turn token、generation、lease 与 abort，再从 planned 激活；恢复时未激活 intent 进入 interrupted，已激活但无法确认的副作用进入 uncertain，副作用工具不自动重放。工具实现拥有原始结果；evidence builder 拥有模型证据合同；session 保存 canonical evidence；context 只选择 full 或 compact view；宿主展示继续读取 display/raw result。

模型证据遵循最小充分原则：必须足以判断本次操作是否成功、作用于哪里、产生了什么关键事实、失败根因是什么、下一步如何恢复。工作区内目标使用相对路径；工作区外目标保留绝对路径。read 返回实际行区间和 continuation；edit/write 返回目标和变更范围；bash 返回 cwd、exit code、duration、头尾输出和 artifact recovery。大输出保留头尾，明确省略规模，并提供可执行的 `read` 恢复参数。

`bash` 只有正常零退出才返回成功。非零退出、超时、停滞和中断都是失败 tool result；payload、evidence、callbacks、session blocker、observability 和模型视图必须使用同一状态。

同一模型批次只对连续、声明为 read effect 且 parallel-safe 的工具并发执行。write、process、external 和 state effect 保持模型给出的顺序。并发读取产生的 session/workset 事实必须归并后持久化，不能用吞掉状态更新换延迟。

### Extensions

`src/extensions/definitions.ts` 是 extension 注册表。当前 extension：

- `todo`：session checklist 事实。
- `worktree`：Git worktree 生命周期。
- `network`：结构化 HTTP 工作。
- `background`：可持久追踪的非阻塞命令执行。
- `scheduler`：持久提醒与预写本地命令的机器调度 CRUD。
- `documents`：分页读取 DOCX 与带文字层 PDF，并以原子写和二进制变更记录创建 Word DOCX。
- `media`：通过 Agnes Provider 生成图片、编辑图片，以及创建/查询异步视频任务；图片和完成视频进入项目内 typed file artifact，视频任务的不透明 `video_id` 持久在 `.kitty/extensions/media/video-tasks/`。
- `skills`：运行时 skill 发现与显式加载。

Extension 只在配置启用时进入同一工具注册表。它们不是另一条 agent loop，也不是 core 工具。

运行时 skill 是项目能力包。Context 只暴露 skill 清单；模型在相关时显式加载 skill 或资源。Skill 不自动路由模型行为。
仓库当前提供 `dev` 与 `agnes-media` 运行时 skill。`agnes-media` 只约束图片工具、视频 create/poll 顺序、`video_id`、低频轮询和产物恢复；协议事实仍由媒体 Provider/工具 owner 维护。

## 8. Control Plane 与 Execution

### 职责

- `src/control/`：session、turn、tool call、context epoch、task lifecycle、execution、scheduled task/trigger、remote message、service lease、wake 和 runtime event 的 SQLite schema 与账本。
- `src/execution/`：前台与后台 execution 的启动、identity、watchdog、heartbeat、reconcile、取消和进程树终止。
- `src/remote/`：Telegram 与微信共用的 service lifecycle、per-peer command queue、turn state、process lock 和 durable delivery queue。

项目目录是持久化与管理员审阅边界；session 是运行所有权边界。每个 session 独立保存消息、turn、草稿和后台 execution，普通 session picker 只投影用户会话。

每条 execution 必须持久化 `ownerSessionId`、`createdBySessionId`、`parentTurnId` 与 `originToolCallId`。这些字段从 host -> agent turn -> tool call -> background 显式传递；业务归属不能从 cwd、时间差、全局集合或异步隐藏上下文推断。Session-facing list/read/wait/stop/cancel、runtime status 与 TUI dock 必须从 `ownerSessionId` 查询。

后台查询只读取当前 `ownerSessionId + parentTurnId + originToolCallIds` 创建的 execution，不能使用工具批次前后的全局集合差值。Turn/session 写入使用显式 turn-scoped store 与 lease token；execution lease 同样通过函数参数校验，不使用隐藏上下文提供业务事实。

当前 control-plane schema 只支持当前数据模型。schema version 不匹配时在 SQLite exclusive transaction 中清空并按当前 schema 重建；不读取、不迁移、不修复旧数据。

`.kitty/control-plane.sqlite` 是运行事实的唯一持久主干。Execution 保存 kind、state、command、工作目录、session/turn/tool-call ownership、pid、output/summary、timeout 和关闭事实。

当前 execution kind：

- `background`：非阻塞的本地命令执行。
- `foreground`：当前 turn 等待完成的 bash 或 skill script。

当前 state：

- `created`
- `running`
- `cancelling`
- `completed`
- `failed`
- `aborted`
- `lost`

### Background 语义

`background_run` 启动非阻塞 execution。读取、等待、停止和 CLI 命令都读取同一份 control-plane record。Agent 不能根据工具名称或展示字符串猜测 execution 状态，只能读取 execution record。Deadline 到达时进入 cancelling，终止进程树，确认后进入 aborted 并发布 wake signal。

`background_wait` 是非并行的 read effect，返回 `progress`、`settled`、`steer` 或 `quiet_timeout` 以及最新 execution snapshot。Running output 的密集变化先合并再返回，避免逐 chunk 请求模型。`background_run`、stop 和 terminate 是 process effect；check、read 和 wait 是 read effect。CLI `background wait` 复用同一个 change wait owner，但保持“等待终态或总 timeout”命令语义。

进程内 signal 只负责降低同进程唤醒延迟，不保存业务状态。每次唤醒都重新读取 SQLite；跨进程变化、遗漏通知和宿主重启依靠有界 SQLite fallback，因此进程内 observer 消失不会丢失 execution 事实。本产品不为该能力新增 continuation scheduler、daemon 或宿主退出后继续运行的独立服务。

### Scheduled task 语义

`scheduled_tasks` 是定义与 next deadline 的唯一 owner，`scheduled_triggers` 是每次触发的唯一 owner。Agent 通过 `schedule_create`、`schedule_list`、`schedule_update`、`schedule_delete` 使用同一领域 service；Web 不提供调度管理入口。计划支持一次性 ISO 时间、分钟级固定间隔和带 IANA timezone 的每日时间，最小间隔一分钟。

Scheduler 只有取得项目内唯一 service lease 后才能运行，并只为最近 deadline 设置一个本机 timer。等待、唤醒和 trigger claim 不创建 Agent turn、不请求 provider、Token 消耗为零。Trigger 只执行创建时已经确认的 reminder 文本或预写本地命令；不支持“到点再调用 Agent 判断”。提醒结果直接在 trigger transaction 中持久化；命令复用 foreground execution ledger、process identity、watchdog、heartbeat 和进程树终止边界。

同一 `(task_id, scheduled_for)` 只有一个 trigger。Claim transaction 同时持久化 trigger 并推进或关闭 task；禁用/删除与 claim 竞争时以该 transaction 为准，正在执行的 task 不能删除。进程强杀或断电后，过期 claim 可被新 scheduler 取得：action 尚未开始时可以继续；已有 execution 时只对账终态，跨越未知副作用边界的命令进入 `uncertain`，不得盲目重放。Kitty 未运行或主机断电期间不承诺准点；重启后一次性过期任务执行一次，重复任务跳过停机期间的密集补跑并计算下一个未来时间。

### 取消与恢复

Execution stop/cancel 必须终止完整进程树：

- Windows：`taskkill /T /F`。
- POSIX：先终止进程组和子孙进程，短暂等待后升级为 `SIGKILL`。

Reconcile 以 lease 和 heartbeat 判断 ownership；PID 只用于诊断和进程树终止。进程消失或 lease 丢失且无法确认正常终态时关闭为 `lost`。Execution 终态与 wake signal 在同一事务内幂等提交。

Ctrl+C 或 controlled detach 通过 turn AbortSignal 立即中断正在等待的 `background_wait`，不伪造成功结果，也不改写 execution 终态。宿主强杀或断电后，进程内 signal 丢失；watchdog、turn/execution lease 和 tool journal 继续负责恢复。已激活但未落结果的 wait 按 read effect 结算为 `interrupted`，不能升级为未知副作用，也不能触发 `background_run` 重放。

每个 execution controller 持有随机 token、单调 generation 和有限 lease。任何进入 active 状态并持久化 PID 的 execution 必须同时保存平台 creation identity；无法取得 identity 的存活进程不能进入 running，已经在登记前结束的极短进程可以从 created 直接结算 terminal 且不保存 PID。停止前必须确认 identity，避免 PID 复用误杀。普通 status、wait 和 UI projection 不取得 recovery ownership；只有 lease 过期后 recovery 才能提升 generation。

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
- `src/weixin/`：微信 iLink 扫码登录、消息轮询、媒体收发和最终回复投影。
- `src/remote/`：远程宿主共用的进程所有权、排队、turn 状态与投递生命周期。
- `src/web/`：loopback HTTP、显式配置、只读 Skill、channel manager、SSE 与静态 Bootstrap 工作流。

`kitty` TUI、`kitty run`、`kitty resume`、Telegram、微信和本地 API 都进入同一条 host/agent turn 主链路。Web 是配置与运行管理壳，不创建第二条 Agent loop。`status` 与 `background` CLI 命令只暴露已存事实，不能创建平行生命周期语义。Evaluation harness 是开发脚本，不属于公共 CLI。

Telegram 与微信 service 使用同一套 SQLite service lease、signal shutdown、per-peer queue、turn state、durable inbox 和 durable outbox。每个 host 的 token、generation 与 heartbeat 保证单 owner；lease 丢失立即停止 service。远端消息 ID 按 host 分区进入 `remote_inbox` 并与唯一 turn ID 绑定；`processing` 在崩溃后可重新 claim，`completed` 与 `failed` 是终态。回复和显式文件进入 `remote_outbox`，状态为 queued、sending、sent 或 uncertain；远端调用后无法确认本地提交时不得自动盲重试。发送前缺少微信 context token 时保持 queued，等待后续入站消息补全协议上下文。

Telegram 使用 Bot API 长轮询。微信使用 iLink SDK：`kitty weixin login` 扫码取得项目本地凭证，`kitty weixin serve` 使用 sync buffer 长轮询私聊消息，`kitty weixin logout` 清除凭证、sync buffer 与 context token。微信只接受白名单私聊，不处理群聊；文本、图片、视频、语音和文件进入同一 host turn，入站二进制先持久化为本地附件。微信正常 turn 只投影最后一条 assistant 回复和 `send_file` 显式文件，不投影 reasoning、tool、todo 或中间 assistant 文本。

TUI、Telegram 和微信只从 `localCommandDefinitions.ts` 投影命令元数据。TUI 支持 `/status`、`/export`、`/exit`、`/stop`、`/new`；远程支持 `/help`、`/status`、`/stop`、`/new`。`/stop` 只 abort 接收命令时的 active turn，不武装未来任务；`/new` 在当前 peer 队列内创建并持久化新 session、原子替换 binding，旧 session 保留。TUI `/new` 同时清空当前窗口 transcript、历史和草稿 owner。

Web 启动的 Telegram/微信服务仍取得各自 process lock 和 SQLite lease。`remote/events.ts` 只 tee 已有 Agent callbacks，把入站、reasoning、工具、assistant、final 和 error 事件按 host 实时投影到各自工作流的信息流；它不改变远端回复规则，也不保存第二套 turn 状态。Markdown 由本地打包的 `marked` 解析并在浏览器按允许元素和属性清理。

两个远程 service 在 TTY 启动时复用 TUI 的 Kitty 字标事实，分别显示 `kitty weixin` 与 `kitty telegram` banner；非 TTY 日志降级为单行。启动事实只包含版本、状态目录、白名单数量与连接方式，不输出 token 或用户 ID。

SIGINT、SIGTERM 或 service lease 丢失会 abort active turn，并在固定等待上限后清理该 host 活动 session 的 execution 进程树。进程强杀、终端关闭、断电或主机重启不能依赖 finally：`remote_inbox` 保留已接收消息，`remote_outbox` 的遗留 `sending` 在新 owner 启动时转为 `uncertain`，不会把可能已经送达的回复或文件盲目重发。iLink SDK 的底层长轮询不提供原生 AbortSignal；宿主会立即停止等待，但底层请求最多仍可存活到协议超时。

微信收到普通消息后立即把 turn 放入 per-peer queue，不等待长任务完成就继续下一次轮询，因此后发 `/stop` 可以到达 active turn。iLink sync buffer 先只在当前进程 stage，让后续长轮询前进；对应 batch 的所有 inbox 任务进入终态后再按接收顺序持久 commit。进程在二者之间强杀时，重启仍从旧 durable sync buffer 获取原消息，SQLite inbox 负责去重，不能以提前提交 cursor 换取响应速度。

### TUI

`src/shell/tui/` 是 Ink 宿主壳。它负责终端输入、滚动、resize、transcript layout、composer geometry、overlay/focus、runtime dock 渲染和清理；它不拥有 session 或 execution 事实。

TUI 规则：

- Composer 是 controller/store 持有的受控状态，React 组件不能私有持有另一份 draft 或 cursor。唯一键盘入口按全局动作、顶层 overlay、composer 编辑的顺序分派。
- Composer 内容框是可见输入与终端 IME 光标的唯一几何 owner。Ink 布局后测得的内容框绝对位置与当前字符的显示单元偏移生成光标坐标，再由唯一 renderer adapter 将容器行下移到文本基线；welcome、运行中状态、overlay、换行和 resize 不得维护独立光标行、双 frame 或 footer 行数补偿。
- 输入 `/` 打开共享命令补全；`Ctrl+P` 打开同源命令面板；Up/Down 或 Ctrl+P/N 选择，Tab 补全，Enter 经原 input queue 执行，Esc 只关闭顶层 overlay。
- `Ctrl+R` 搜索当前 session 的外部用户输入历史。普通 Up/Down 先在多行草稿内移动，到首尾边界后才遍历历史；历史条目不可被原地修改。
- 空草稿输入 `?` 打开真实键位帮助。Home/End 按当前行移动，Ctrl+Home/End 同时定位 transcript 和整个草稿；Delete 向前删除，Backspace 向后删除；Ctrl+K/U/W/Y 使用 composer kill buffer。
- `Ctrl+G` 释放 TUI raw input 并启动 `$VISUAL`、`$EDITOR` 或平台默认编辑器；编辑成功后替换草稿，失败时保留原草稿并显示错误，临时文件必须清理。
- Composer 通过 Ink `usePaste` 启用标准 bracketed paste。终端拥有多行粘贴确认；确认后的完整 payload 通过独立 paste event 一次进入草稿，Windows `CRLF` 与裸 `CR` 在边界归一为 `LF`。粘贴换行不得触发 submit、命令执行或 turn admission，也不得裁剪或替换成摘要占位符。
- 未提交草稿同步写入 SQLite `interaction_drafts`，以 session ID 和 shell 为 owner；只有数据库短暂占用时才进入待写重试。草稿不属于 session message 或模型上下文；提交时清除，正常退出时 flush，恢复时 clamp cursor。
- 命令、历史和帮助共享一个判别式 overlay 状态；同一时刻只能有一个顶层交互，响应式行预算不能覆盖 composer、dock 或 transcript。
- Transcript 滚动状态只能是 `follow` 或 `detached`。Detached 状态保存稳定 row anchor 和 unseen row count；流式追加、工具状态更新与 resize 不能把阅读位置拉回底部。
- Input gateway 使用有状态 UTF-8 decoder 保留跨 chunk 的中文与 IME 提交，并对跨 chunk 的 SGR/X10 mouse press、drag、release 和 wheel 做完整 framing；鼠标序列不得进入 composer 键盘流。stdin EOF、close 或错误必须幂等关闭 controller 输入，让 active turn 进入 recoverable detach，并由 session driver 终止当前 root session tree 的进程。Selection 使用渲染 row ID 与字符列，支持宽字符、跨行选择、边缘自动滚动和字符级高亮。
- 有 selection 时 `Ctrl+C` 复制，不触发 turn interrupt；无 selection 时才中断。Esc 清除 selection。Clipboard 优先使用平台 native provider，失败后在 TTY 使用 OSC52；复制失败必须保留 selection 并显示错误。Windows native provider 必须通过 PowerShell 显式把 stdin 设为 UTF-8 后写入 Unicode clipboard，不得把 UTF-8 字节交给按本地代码页解码的 `clip.exe`。
- Session picker、TUI chrome、CLI/status/runtime UI、command/help、interaction、Telegram、微信提示与本地 Web 读取 runtime locale 的 typed catalog。简体中文、英文、日文、韩文四份 catalog 必须拥有完全一致的 key 与占位符集合，运行时不做语言 fallback。Web bootstrap 返回当前 locale 和结构化文案投影，浏览器不维护第二套翻译源。Locale 不能进入 prompt、session message、tool evidence 或 control-plane 状态；命令名、路径、provider/model、env key、机器 JSON、Skill 内容和模型回复保持原文。
- Welcome 品牌版本直接读取发布包版本；标识上方只显示版本，不显示项目地址或额外入口。Kitty 文本标识与一行 `猫咪：尽情地探索并享受吧！` 组成独立品牌身份，正文由 typed locale catalog 提供。版本行不参与标识居中；窄终端可以隐藏签名，但不得挤压 session choice 或 composer。
- Session picker 从 TUI composition root 显式接收当前 runtime config 的 model，只在底部控制行左侧显示 typed 模型标签与模型名，右侧保留选择/打开/退出控制。Picker 不读取配置、不推断模型，也不把显示事实写回 session 或 runtime。

- Transcript 的 user、assistant、reasoning、system、tool、change、plan 使用同一个正文框架。Role 可以改变颜色和强调，但不能改变正文起始列；user、reasoning、tool、change 与 plan 不绘制装饰性左侧竖线。Composer 只使用 panel padding 作为左边界，不绘制输入竖线。
- Assistant Markdown 以 `marked` GFM AST 为语法事实，并在当前正文宽度重新投影；嵌套/任务列表必须保留层级，宽表格降级为 key/value records，确认含表格的 `md` / `markdown` fence 才展开。Resize 必须从原始 source 重排，不能缓存旧换行。
- `runtime-ui/toolPresentation.ts` 把核心工具调用和结果规范化为宿主无关的 typed presentation facts。CLI、TUI、Telegram、微信和 Local API 只消费这些事实；壳不能重新解析工具 JSON、猜测状态或定义第二份工具语义。Agent、provider、host、session、execution、tools 与共享 runtime/presentation 模块不得 import TUI/CLI/Telegram/微信 adapter；依赖只能从 composition root 和壳指向端口与运行事实。
- `write` / `edit` 成功后，共享投影从工具结果的 path 与标准 unified diff hunk 生成 change fact；所有 hunk 都保留，未修改的文件区段不进入该事实。TUI 仅为新增、删除和上下文行添加样式，不做第二次隐式裁剪；上游若限制证据，必须携带显式 truncation/artifact recovery。不得从未完成的流式参数推断变更结果。
- `read` / `bash` 完成后只展示紧凑工具摘要。TUI 不保存第二份详情、没有工具全文展开状态，也不监听工具展开快捷键；原始工具结果继续由 session/evidence 事实保存。`write` / `edit` 的 typed change fact 和所有相关 diff hunk 不受此规则影响。
- `todo_write` 完成后直接消费共享 fact 中的 typed items，显示计划完成数与 pending / in_progress / completed 层级；完成项使用删除线。TUI 不解析 `preview` 文本推断计划状态。
- Footer 的 model 标签与 Runtime Dock 的 activity/background 标签使用同一个左侧内容 inset。
- Model metadata 位于 composer 下方左侧；context budget 位于右侧。Footer 不显示分隔点、斜杠命令或命令面板教学。
- Context budget 必须属于当前选中的 session。项目全局 runtime status 不能用另一条最近已保存 session 的 budget 覆盖新建或已选 session。
- 用户提交后到最终模型回答完成期间，TUI 在 Runtime Dock 第一行右侧显示本轮持续时间；思考、工具调用和后续模型请求不重置它。
- Runtime Dock 保持稳定两行结构；第一行左侧展示当前 activity，右侧展示本轮持续时间；第二行展示 live background lane。activity 不显示参数正文或命令；`write` / `edit` 工具开始时显示共享调用事实中的目标路径，参数流式生成期间显示 provider 已实际接收的累计 UTF-8 字节数。
- TUI 只显示 control-plane 状态为 `created`、`running` 或 `cancelling` 的 background lane。
- 存在 live execution lane 时，TUI 轻量刷新 execution 账本。Execution 进入终态后必须清除 lane；启动时的 `running` 文案不能成为错误的当前状态。
- 首屏 transcript 保持空白。User message 使用紧凑的低对比整行背景。Reasoning 是低强调信息。
- Transcript 与 footer 之间使用一行空白背景，不使用显眼的分割线。

## 11. 验证

日常确定性验证：

```powershell
npm.cmd run verify
```

`npm.cmd run verify` 执行 typecheck、build 和编译后的 core test。Core test 不调用真实 provider。

开发入口 smoke：

```powershell
npm.cmd run dev -- --help
npm.cmd run dev -- --version
```

TUI 定向验证：

```powershell
npm.cmd run test:build
node --test .test-build/tests/shell/tui-command-menu.test.js .test-build/tests/shell/tui-external-editor.test.js .test-build/tests/shell/tui-gateway.test.js .test-build/tests/shell/tui-render.test.js .test-build/tests/shell/tui-store.test.js .test-build/tests/shell/tui-shell.test.js
```

`scripts/run-tests.mjs` 统一运行 core/evaluation 测试。它为子进程提供仓库内隔离临时根，每个临时 workspace 建立独立项目发现边界，单项测试使用有界超时，并在结束、启动失败或收到终止信号时终止测试进程树并清理生成状态。会写 control plane 的 evaluation check 只在 `.test-tmp/evaluation` 隔离工作区运行，并在 suite 的 `finally` 中删除。

显式产品验收：

```powershell
npm.cmd run eval:local
npm.cmd run eval:production
```

`eval:production` 使用当前 `.kitty/.env`，可能消耗真实 API；它不能进入普通确定性测试。

Production tool acceptance 是真实修复任务，不是固定字符串工具演示。隔离工作区先处于失败状态；真实模型必须检查文件、运行失败验证、从长输出尾部读取根因、修改目标、重新验证通过，并在最终回答中引用成功 sentinel。缺少失败证据、真实变更、复验通过或最终消费中的任一项都判失败。

Production background acceptance 使用真实 provider 和真实渐进输出子进程。真实模型必须在一个 turn 中调用 `background_run`、至少两次 `background_wait`，分别消费 running progress 与 settled sentinel，并在最终回答引用终态 sentinel；SQLite 必须留下一个 completed turn、terminal tool calls、正确 ownership 的 completed background execution 和唯一 wake signal。

该真实任务还必须在当前 SQLite 控制平面留下 completed turn、terminal tool calls、带明确 session/turn/tool-call ownership 的 foreground executions 与对应 wake signals。真实 provider 任务证明生产主链路；hard kill、lease 过期、stale generation、PID identity 和进程树终止由确定性 recovery 测试证明，不能用一个平台的结果冒充另一个平台实机验收。

## 12. Agent 修改纪律

修改 Kitty 前：

1. 阅读本文档和相关模块边界。
2. 追踪完整路径：输入、context、state、tool effect、持久事实、host output、test。
3. 每项机器事实只保留一个 owner。Presenter 只投影事实，不能重新计算或复制事实源。
4. 修改当前行为时，同步更新对应测试和本文档。
5. 先运行定向测试；完成后运行 `npm.cmd run verify`。

不要在当前代码中保留废弃接口、废弃状态、旧术语或迁移包装。历史只能作为 research 证据。
