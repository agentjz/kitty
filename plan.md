# Kitty Runtime Catalog Plan

## 1. 需求文档

用户要的不是“能发请求”，而是一个不会乱吞输入、不会乱猜模型、不会把内部事实伪装成用户意图的本地 agent 运行体验。

用户希望做的事很简单：

- 选一个 provider 和 model。
- 填好 `.kitty/.env`。
- `kitty init` 能生成一致的模板。
- `kitty doctor` 能明确告诉他哪里能跑、哪里会错。
- 真正对话时，输入不会莫名消失，模型在思考、工具调用、总结记忆、生成标题时状态都看得见。

用户应该看到的体验：

- provider 和 model 是两层，不是一锅粥。
- 当前启用的是哪个 provider、哪个 model、哪种 wire API，一眼能看懂。
- DeepSeek 在 thinking + tool call 场景下不会再因为 `reasoning_content` 丢失而 400。
- YLS / TTAPI 这类中转不会被当成官方 OpenAI。
- CLI、TUI、Web 三个入口讲的是同一套 turn 事实，只是展示不同。
- 用户刚发出的第二条消息不会被 UI、driver、总结任务、模型慢响应这些阶段掩盖成“吞了”。

当前范围包含：

- 参照 opencode，把 Provider 和 Model 分开。
- Provider 管入口、认证、SDK/协议类型、默认 URL、probe 和默认 request 片段。
- Model 管 capabilities、cost、limit、wire API、request 参数、thinking/reasoning、tool call、cache 和 replay 规则。
- 把 provider/model catalog 做成 Kitty 的主事实源。
- 同步 `.kitty/.env`、`.kitty/.env.example`、env template、init、doctor。
- 把 turn 生命周期明确成可见状态：等待模型、回答中、工具执行中、主回答结束后总结记忆/标题中、空闲。
- 解决 DeepSeek thinking/tool call 的 `reasoning_content` 回传要求。
- 修掉 TUI / CLI / Web 里“输入看起来被吞掉”的体感问题。

当前范围不包含：

- 不做模型路由。
- 不做非 OpenAI SDK provider 的一次性全量接入。
- 不把 144 个 provider 的所有模型硬塞到 `.env` 注释里。
- 不做旧兼容、不保留 legacy 分支、不写假过渡。

业务完成标准：

- 用户能从模板和 doctor 明确知道当前模型怎么配。
- 用户发送输入后，不会因为 turn 收尾或总结阶段误以为消息没发出去。
- turn 的各阶段在 CLI/TUI/Web 上是同一个事实，不是三套各说各话。
- DeepSeek tool-call replay 有测试锁死。

## 2. 当前事实

### provider / model

- `src/provider/capabilities.ts` 仍靠 provider/model 字符串推导 wire API、reasoning 和 timeout。
- `src/provider/request.ts` 先推导 capabilities，再选 `responsesAdapter` 或 `chatCompletionsAdapter`。
- `src/provider/chatRequestBody.ts` 对 DeepSeek 有局部逻辑：thinking 默认启用；若 assistant 带 toolCalls 但没有 `reasoningContent`，会关闭 thinking。
- `src/provider/chatCompletionsAdapter.ts` 会读取和回传 `reasoning_content`。
- `src/provider/responsesAdapter.ts` 已有未提交改动，覆盖 OpenAI Responses 的 reasoning 开关测试。
- `src/provider/cachePolicy.ts` 还在用 capabilities 推导 cache 行为。
- `src/provider/client.ts` 的 timeout 也来自 capabilities。
- `src/config/providerPresets.ts` 现在只有 YLS、TTAPI、DeepSeek 三个 preset。
- `src/config/projectEnvTemplate.ts` 从 preset 生成 `.kitty/.env` 和 `.kitty/.env.example`。
- `src/config/init.ts` 只负责生成本地三件套文件，不懂模型 catalog。
- `src/config/preflight.ts` 只校验 env keys 和 provider preset。
- `src/cli/commands/doctor.ts` 只输出 provider/model/baseUrl 并 probe `/models`。

### turn / 输入 / 现场

- `src/shell/tui/controller.ts` 已有 `queuedInputs`，能避免 pending input 未打开时直接丢输入。
- `src/interaction/sessionDriver.ts` 处理输入、local command、turn 调用、退出确认、interrupt。
- `src/agent/turn/run.ts` 在主回答结束后还会走 title 和记忆总结。
- `src/agent/turn/lifecycle.ts` 负责 memory/title 的后处理请求，但它们对 UI 来说不是独立可见阶段。
- `src/shell/tui/turnDisplay.ts` 只把 `onModelWaitStart/Stop`、tool、assistant、reasoning 映射到当前 dock 和 transcript。
- `src/web/turnDisplay.ts`、`src/shell/cli/turnDisplay.ts`、`src/runtime-ui/agentCallbacks.ts` 也只知道等待/输出/工具，不知道“总结中”。
- `src/session/messages.ts` 会根据模型决定是否回放 reasoningContent。

### 测试事实

- `tests/config/project-env-template.test.ts` 要求模板从当前 preset 生成。
- `tests/config/preflight.test.ts` 期望默认 preset 是 DeepSeek official V4。
- `tests/provider/request-body-cache.test.ts` 已覆盖 OpenAI cache key 和 DeepSeek 不发 cache_control。
- `tests/provider/responses-request-body.test.ts` 是当前未提交测试，覆盖 OpenAI Responses reasoning disabled/default reasoning。
- `tests/shell/tui-shell.test.ts` 已覆盖 input queue、tool facts、assistant streaming。
- 现有测试还没有直接锁死“主回答结束后总结/记忆阶段”的 UI 事实。

### 配置事实

- `.kitty/.env.example` 默认 DeepSeek official V4。
- `.kitty/.env` 当前启用 YLS，中转 base URL 是 `https://code.ylsagi.com/codex`，模型是 `gpt-5.5`。
- 当前 `.kitty/.env` 与现有 preset 不匹配。

### 参考事实

- opencode 的 `ProviderV2.Info` 管 provider 入口、认证、api 类型、默认 request。
- opencode 的 `ModelV2.Info` 管 providerID、capabilities、request、cost、limit、status。
- opencode 的 catalog 在请求前合并 provider/request 和 model/request。
- opencode 通过 `models.dev` 维护 provider/model catalog；当前可见 144 个 provider。
- Codex 的 `ModelClient` 明确区分 session-scoped 和 turn-scoped，turn 参数显式传入。
- Codex 的 `ModelClientSession` 只在 turn 内缓存 websocket / sticky routing，turn 之间不能乱带状态。
- `opencode` 和 `codex` 都把“请求协议 / 连接 / 认证 / 轨道状态”跟“模型能力”拆开。

### DeepSeek 官方事实

- thinking mode 支持 tool call。
- tool call 轮次之后，后续请求必须完整回传 `reasoning_content`，否则 400。
- `reasoning_effort` 的实际可用值和映射不是随便猜的，必须按官方文档处理。

## 3. 失败测试

### provider / model

- Provider 和 Model 必须能独立表达能力，不允许只靠 provider 前缀或 model 前缀猜 wire API。
- YLS / TTAPI 这种中转必须被标成独立 provider profile，不能混成 official OpenAI。
- OpenAI official / OpenAI-compatible / DeepSeek official 的 wire API 选择必须由 catalog 决定。

### DeepSeek replay

- assistant message 有 toolCalls 且带 reasoningContent 时，后续请求必须完整回传 reasoningContent。
- assistant message 有 toolCalls 但 reasoningContent 缺失时，不能继续发出会触发 400 的 thinking 请求。
- DeepSeek 的 reasoning effort 映射必须符合官方规则。

### env / init / doctor

- `.kitty/.env.example` 必须等于模板输出。
- `kitty init` 生成的文件必须和模板一致。
- `kitty doctor` 必须能识别当前 active provider/model 是否真的是 catalog 里的合法组合。
- 本地 `.kitty/.env` 不能因为模板变化被误删真实 key。

### turn / 输入 / 现场

- 用户连续输入第二条消息时，不能因为 driver 尚未 ready、turn 还没收尾、summary/title 还在跑而“丢消息”。
- 主回答结束后进入标题/记忆总结阶段时，UI 必须显示明确的收尾状态，而不是保持空白或假空闲。
- CLI/TUI/Web 的 turn 事件必须一致：等待模型、回答中、工具中、总结中、空闲。
- TUI 的 queued input 只能解决“输入过早到达”的队列问题，不能代替收尾状态。

### 完整验证

- `npm.cmd run verify` 必须通过。

## 4. 目标

- provider/model/catalog 三层分开。
- runtime 只解析一次 catalog，不再在各模块里重复猜。
- DeepSeek tool-call replay 安全。
- `.kitty/.env`、`.kitty/.env.example`、`kitty init`、`kitty doctor` 同一套事实。
- CLI/TUI/Web 的 turn 现场一致。
- 输入不会被 turn 收尾阶段伪装成吞消息。

## 5. 不做范围

- 不做模型路由。
- 不做传统意义上的“全 provider 全 SDK 接入”。
- 不做 UI 重写。
- 不做旧兼容。
- 不把全量 opencode 模型明细硬塞进 env 注释里。

## 6. 设计

### 主链路

输入配置 -> catalog 解析 provider/model -> request 组装 -> provider client / wire API 发送 -> assistant/tool/reasoning 回写 session -> 主回答结束 -> 如果需要，进入 title/memory 总结 -> UI 回到可输入状态 -> 事件和 observability 记录同一事实。

### 模块边界

- `src/provider/catalog.ts`：主事实源。
- `src/provider/providerCatalog.ts`：provider 入口、认证、协议、探测。
- `src/provider/modelCatalog.ts`：model 能力、限额、费用、request、replay。
- `src/provider/resolve.ts`：runtime config -> resolved profile。
- `src/provider/request.ts`：统一请求入口。
- `src/provider/chatRequestBody.ts` / `responsesAdapter.ts`：按 resolved profile 组装 wire body。
- `src/provider/cachePolicy.ts`：按 model capability 算 cache 行为。
- `src/provider/client.ts`：按 provider profile 选 baseUrl/timeout/pool。
- `src/provider/connection.ts`：按 provider/model 做 doctor probe。
- `src/config/providerPresets.ts`：只做模板用的可选 preset 视图。
- `src/config/projectEnvTemplate.ts`：只负责生成当前模板。
- `src/config/init.ts`：只负责落地模板文件。
- `src/interaction/sessionDriver.ts`：输入调度、turn 调用、退出、interrupt、排队。
- `src/agent/turn/run.ts`：主 turn 逻辑。
- `src/agent/turn/lifecycle.ts`：title/memory 总结阶段。
- `src/shell/*/turnDisplay.ts`、`src/runtime-ui/agentCallbacks.ts`：把 turn 阶段统一映射为可见状态。

### 状态设计

turn 需要至少分成这些可见状态：

- `idle`
- `waiting_model`
- `answering`
- `tool_running`
- `summarizing_title`
- `summarizing_memory`
- `recovering`
- `finalizing`

这样用户在 TUI/CLI/Web 看到的就不是“黑箱吞输入”，而是“当前真的在做什么”。

### provider / model 设计

Provider 只管：

- provider id / label
- 认证来源
- base URL / candidate URL
- SDK / 协议类型
- probe 行为
- 默认 request 片段

Model 只管：

- providerId
- wire API
- capabilities
- cost / limit
- request 参数默认值
- reasoningContent replay 规则
- cache policy

### DeepSeek 设计

- DeepSeek official 走 chat.completions。
- thinking + tool call 场景必须保留 reasoningContent。
- 缺 reasoningContent 时，不许再默默构造“可能会 400”的请求。
- 若当前 session 已经丢了必要事实，应该让 runtime 明确暴露，而不是 UI 假装没事。

### turn 现场设计

主回答结束后，title 和记忆总结应该被标成独立 busy phase。

CLI/TUI/Web 不需要显示内部实现细节，但必须显示“总结中”这类可理解状态。

这不是多余 UI，而是防止用户把正常收尾误看成输入被吞。

## 7. 实施任务

- [x] 建立 provider/model catalog 类型和查询。
  - 文件：`src/provider/catalog.ts`、`src/provider/providerCatalog.ts`、`src/provider/modelCatalog.ts`、`src/provider/resolve.ts`
  - 验收：能从 provider+model 解析出唯一 resolved profile。

- [x] 把 capability 推断改成 catalog 主事实。
  - 文件：`src/provider/capabilities.ts`
  - 验收：不再靠前缀硬猜主逻辑。

- [x] 重接请求入口和 client pool。
  - 文件：`src/provider/request.ts`、`src/provider/client.ts`
  - 验收：wire API、timeout、base URL 都来自 catalog。

- [x] 重接 chat/responses request body。
  - 文件：`src/provider/chatRequestBody.ts`、`src/provider/chatCompletionsAdapter.ts`、`src/provider/responsesAdapter.ts`
  - 验收：DeepSeek replay 和 OpenAI Responses reasoning 都按 model capability 走。

- [x] 重接 cache / doctor / preflight。
  - 文件：`src/provider/cachePolicy.ts`、`src/provider/connection.ts`、`src/cli/commands/doctor.ts`、`src/config/preflight.ts`
  - 验收：doctor 能说清 provider/model/wire API/limit/cache/replay。

- [x] 重写 env preset 和 init 模板。
  - 文件：`src/config/providerPresets.ts`、`src/config/projectEnvTemplate.ts`、`src/config/init.ts`
  - 验收：`.env.example`、`init`、`preflight` 共用同一模板事实。

- [x] 更新本地 `.kitty/.env` 的 active block。
  - 文件：`.kitty/.env`
  - 验收：当前启用项能被 catalog 识别，不删真实 key。

- [x] 补 DeepSeek 400 与 reasoning replay 测试。
  - 文件：`tests/provider/deepseek-replay.test.ts` 或现有 provider 测试
  - 验收：tool call 轮一定回传 reasoningContent；缺失时有明确保护。

- [x] 补 provider/model 分层测试。
  - 文件：`tests/provider/model-catalog.test.ts`
  - 验收：YLS / TTAPI / DeepSeek / OpenAI-compatible 边界清楚。

- [x] 补 turn 现场和输入队列测试。
  - 文件：`tests/shell/tui-shell.test.ts`、`tests/web/web-shell.test.ts`、`tests/interaction/*` 相关测试
  - 验收：queued input、等待模型、总结中、最终可输入都能测到。

- [x] 补 title / memory 总结阶段可见状态测试。
  - 文件：`tests/agent/*`、`tests/shell/*`
  - 验收：主回答结束后不是“空闲”，而是明确进入总结阶段。

- [x] 同步 README。
  - 文件：`README.md`
  - 验收：用户能看懂 provider/model、init、doctor、turn 现场。

- [x] 完整验证。
  - 命令：`npm.cmd run verify`
  - 验收：通过后再谈收口。

## 8. 验证计划

局部验证：

- `npm.cmd run typecheck`
- `npm.cmd run build`
- `node --test .test-build/tests/provider/*.test.js`
- `node --test .test-build/tests/config/*.test.js`
- `node --test .test-build/tests/shell/*.test.js`

完整验证：

- `npm.cmd run verify`

手动验证：

- `node dist/cli.js doctor`
- `node dist/cli.js tui`
- 连续发送两条输入，确认第二条不会被误判为吞掉。
- 看主回答结束后是否进入“总结中”而不是假空闲。

DeepSeek 重点验证：

- 跑一次带工具调用的 DeepSeek thinking 会话。
- 确认 assistant tool-call 轮的 reasoningContent 被保存。
- 确认后续 request body 原样回传 reasoningContent。

未验证内容：

- 非 OpenAI SDK provider 的真实连通性。
- opencode/models.dev 全量 144 provider 的逐个适配。

## 9. 收口

当前状态：计划已完成并收口。

已确认的核心事实：

- provider/model 分层是必须的。
- DeepSeek tool-call replay 的 400 风险是真实存在的。
- TUI/CLI/Web 的“吞输入”体感不仅是 provider 问题，也是 turn 生命周期和总结阶段不可见的问题。
- 当前本地 `.kitty/.env` 与模板 preset 不一致。

后续记录：

- 已完成。
- `npm.cmd run verify` 已通过。
- 变更已落实到 provider、config、turn、TUI 相关测试与计划文件。
- 仍未逐个验证的外部 provider 适配保留为已知边界，不作为本计划未完成项。
