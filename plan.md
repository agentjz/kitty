# Kitty Production Runtime Rebuild Plan

## 1. 需求文档

Kitty 要从可用的本地编程 Agent 重建为可以承担长任务、故障恢复、后台执行和多 Agent 协作的生产运行时。

用户面对的最终体验：

- 输入一旦被 Kitty 接收，就不会因并发、崩溃、重启或宿主切换而丢失。
- 同一 session 只有一个有效执行 owner；不同 session 可以并行。
- 每次工具调用都有可恢复的开始、结果和失败事实。工具已经改变文件但进程随后崩溃时，Kitty 不会假装没有执行，也不会静默重放。
- background 和 subagent 有明确 owner、心跳、deadline、取消确认和终态。失去执行权的 worker 不能继续提交文件修改。
- 上下文压缩可验证、可恢复、不会发送已知超预算请求。
- CLI、TUI、Web、Telegram、worker、status 和 observability 读取同一事实主干。
- 产品不依赖自动长期 memory。连续性来自同一 session 的 durable items、context epoch、工具证据和任务状态。

范围包含 session、host turn、agent turn、context、tools、control plane、execution、provider observability、runtime status、CLI/TUI/Web/Telegram、测试、eval、spec 和 README 的一致重建。

业务完成标准：真实 provider 修复任务能在并发输入、工具失败、强制中断、进程重启、context 压缩和 subagent 超时后继续完成；所有状态可从 SQLite 事实主干解释。

## 2. 当前事实

- `runHostTurn()` 是统一宿主边界，但输入、session、host event、task lifecycle 和 observability 分别写入不同存储。
- `SessionStore` 直接覆盖 `.kitty/sessions/*.json`，没有 revision、CAS、durable input inbox 或跨进程 owner。
- Local API 可并发加载并执行同一 session。Telegram 只有进程内 peer queue。
- assistant tool call 在批次执行前写入 session；tool result 在整个批次执行后才逐个写入。崩溃或 abort 可留下已执行副作用但缺少 result 的历史。
- typed `ToolResultEnvelope`、bash raw artifact、provider/model 分层、DeepSeek replay 和只并发安全读取是成熟设计，应保留。
- execution 和 wake 位于 SQLite，但 close 与 wake 不是一个事务；worker 没有 claim token、heartbeat 或 fencing。
- lead wait deadline 只把 execution 写成 `paused`，不会停止 worker。
- context compression 是临时字符串投影，没有持久 epoch、源范围/hash；hard 模式可能返回仍超过预算的请求。
- runtime status 拼接 JSON session、SQLite、JSONL observability、memory Markdown 和实时 project map，不具备一致 revision。
- 自动 session memory 每个外部 turn 再调用一次模型；runtime long memory 是 Markdown CRUD/全文匹配，没有自动召回闭环。
- 当前约 309 个测试覆盖 provider、tool evidence、host、TUI 和 execution happy path，但缺少同 session 并发、工具落账故障点、worker fencing、wake 事务、context epoch 和崩溃恢复测试。
- `npm.cmd run typecheck` 在重建前通过。工作区在创建本计划前干净。
- 本地参考源码显示：Codex 使用 typed append-only rollout 和 history revision；OpenCode 分离 durable prompt admission 与 execution coordinator；Gemini CLI 使用显式 tool-call 状态机；Cline 使用 session status lock 和 compaction source hash。

未知点将在实现中用失败测试收束：真实 provider 对中断工具批次的 replay 行为、Windows 强杀后的进程树收口时序、现有 production eval 配置是否当前可用。

收口阶段的新事实：真实 provider 已完成文件修复和最终验证，但首次使用了不适用于 PowerShell 的命令；`bash` 原始结果保存了 shell 信息，模型视图却被 output governance 投影覆盖，没有保留该恢复事实。根治边界是通用工具证据投影和“依赖基线证据的修改先完成取证”执行不变量，不是针对命令、文件、模型或评测写分支。

## 3. 失败测试

重建前必须新增并先证明以下行为会失败：

1. 两个并发 host turn 使用同一 session 时，当前实现会丢消息或重复执行；目标是 durable admission 后串行完成。
2. write/edit/bash 已产生副作用而 result 尚未写入时模拟崩溃；目标是恢复为明确的 interrupted tool result，不产生悬空 provider history。
3. abort 发生在工具完成与结果持久化之间；目标是结果先落账，再结束 turn。
4. execution close 成功但 wake 写入点失败；目标是一个事务内同时完成，重复 close 不产生重复 wake。
5. subagent 超过 deadline 后继续尝试写文件；目标是 fencing 拒绝写入并终止进程树。
6. worker PID 存活但 heartbeat/claim 已过期；目标是按 lease 事实进入 lost/stale，不把 PID 当 owner。
7. context epoch 的源消息前缀被改变；目标是拒绝使用旧 epoch并重新压缩。
8. system prompt 加最小 tail 仍超过预算；目标是本地结构化失败，不发送 provider 请求。
9. runtime status 在并发更新中读取；目标是返回单一 ledger revision 的一致投影。
10. provider retry、alternate base URL、stream fallback；目标是每次真实 HTTP attempt 有唯一 attempt ID，总调用预算不超过四次，且总有 terminal event。
11. CLI/TUI/Web/Telegram 对同一 session 并发提交；目标是共用 durable inbox 和 owner。
12. 删除长期 memory 后，长 session 经压缩、重启和 resume 仍保留用户约束、工具失败、changed paths 和恢复路径。

## 4. 目标

- `.kitty/control-plane.sqlite` 成为运行事实主干，保存 session、message、turn admission、turn lease、tool journal、context epoch、execution、wake、task lifecycle 和 runtime event。
- `SessionStore` 从 SQLite 读取聚合 session，不再写 JSON snapshot 或 session memory asset。
- 所有外部输入先写 durable turn record，再由唯一 owner claim；owner 通过 lease heartbeat 续期，写入使用 fencing token 校验。
- tool call intent 在执行前落账，tool result 在每个调用完成后立即落账；恢复时补齐明确的 interrupted result。
- execution terminal transition、wake outbox 和 task linkage 使用同一事务。
- subagent worker claim、heartbeat、deadline、cancel 和写权限使用同一 execution token。
- context epoch 保存源消息数量、源前缀 hash、摘要 items 和预算事实；无可行请求时显式失败。
- observability 使用 turnId、itemId、toolCallId、executionId、requestId、attemptId 关联。
- runtime status 从 SQLite 一致读取；project map 和终端日志只作为外部投影或 artifact。
- 删除 runtime long memory、自动 session memory 总结及其 CLI/status/prompt surface。
- spec、README、测试和 eval 只描述重建后的当前事实。

## 5. 不做范围

- 不增加企业审批、安全沙箱或权限工作流主线。
- 不引入向量库、知识图谱、自动长期记忆或隐藏用户画像。
- 不保留 JSON session 兼容读取、旧 memory 兼容入口、旧状态别名或带版本编号的类型/表/API。
- 不模仿某个参考项目的 UI 或产品术语。
- 不提交、不 push、不发布 npm 包，除非项目所有者另行明确要求。

## 6. 设计

### 主链路

```text
host input
  -> durable turn admission
  -> session owner claim + lease
  -> append user message
  -> build context from durable items + current context epoch
  -> provider request / attempt events
  -> append assistant tool intents
  -> execute one effect boundary
  -> append typed tool result immediately
  -> repeat or append final assistant answer
  -> terminal turn transition
  -> release owner
  -> host projection
```

### SQLite owner

`ControlPlaneLedger` 负责打开数据库、schema 和 transaction。表使用稳定业务名：

- `sessions`：metadata、revision、当前派生状态。
- `session_messages`：append-only typed conversation items。
- `session_turns`：durable input、状态、owner token、lease、terminal error。
- `tool_calls`：call intent、effect、状态、result envelope、postcondition。
- `context_epochs`：源前缀、hash、压缩结果和预算。
- `executions`：worker token、attempt、heartbeat、deadline、cancel 状态。
- `wake_signals`：execution terminal transition 同事务产生的 outbox fact。
- `runtime_events`：结构化运行事件和关联 ID。

表名、类型名、函数名和字段名不使用版本编号或 legacy 命名。

### Session admission 与 fencing

Host 为每个外部输入创建 turn ID。claim 使用 SQLite 条件更新，只有 session 当前无有效 owner或 lease 已过期时成功。等待者保留 queued 状态并轮询。owner 定时续期。Session 写入必须携带当前 owner token；token 失效立即失败。内部 delegated closeout 复用原 turn owner，不创建伪用户 turn。

### 工具恢复

assistant tool call 本身是 intent。执行开始写 `tool_calls=running`。每个调用完成后立即把 canonical envelope 写入 `tool_calls` 和 `session_messages`。进程恢复时，任何没有 terminal result 的 intent 变为 `interrupted` error evidence，包含目标、已知事实和取证动作；机器不自动重放有副作用工具。

文件系统不能与 SQLite 原子提交。write/edit 使用原子临时文件替换，并记录执行前/后内容 hash。subagent 写工具在执行前校验 execution worker token 与 running lease；失权 worker不能提交。

### Execution

状态使用 `created`, `claimed`, `running`, `cancelling`, `completed`, `failed`, `aborted`, `lost`。`paused` 删除。deadline 到达进入 cancelling，终止进程树；终止确认后进入 aborted，无法确认则进入 lost。PID 只是诊断事实，worker token 和 heartbeat 才是 ownership。

### Context

近场消息和工具边界继续优先保留。压缩结果成为 context epoch，并以源消息数量、最后消息 ID、源前缀 hash 校验。tool evidence 只在 epoch 内从 model view 切换到 compact view，不再次截断。system prompt 和最小安全 tail 仍超限时抛出 `ContextBudgetExceededError`。

### Observability 与展示

运行事件写 SQLite。terminal log 和 crash report仍是 artifact，但不参与状态计算。Runtime status 在一个只读 transaction 中读取 session、turn、execution、wake、provider attempt、tool result 和 context epoch，再投影 scene。TUI/Web/Telegram 不拥有运行事实。

### 文件职责

- `src/control/`：数据库、schema、transaction 和各事实仓库。
- `src/session/`：SQLite session 聚合、消息 append、恢复和派生状态。
- `src/host/`：turn admission、lease 生命周期和宿主结果。
- `src/agent/turn/`：模型/工具推进，不拥有跨进程锁。
- `src/execution/`：worker claim、heartbeat、取消、reconcile 和 fencing。
- `src/context/runtime/`：context epoch、预算与 provider projection。
- `src/observability/`：runtime event 写入和 artifact。
- `src/runtime/`：只读一致投影。

## 7. 实施任务

- [x] 建立 SQLite session、turn、message、tool call、context epoch、runtime event schema 与 transaction API；新增失败测试验证事务和 CAS。
- [x] 重写 `SessionStore` 为 SQLite 聚合存储，增加 revision 和 append-only message ID；删除 JSON snapshot 与 session memory asset 写入。
- [x] 在 host 边界实现 durable admission、claim、heartbeat、等待、terminal transition 和 release；让所有 host 复用。
- [x] 重排 tool batch：intent 先落账、每个 result 立即落账、abort 后补 terminal evidence、恢复时修复悬空调用。
- [x] 为 write/edit 增加原子替换和内容 hash；为 subagent 工具写入增加 execution fencing。
- [x] 重建 execution 状态机、worker claim/heartbeat、deadline cancel、lost reconcile，并事务化 wake。
- [x] 建立 context epoch、源前缀校验和硬预算失败；删除每轮 session memory 模型调用。
- [x] 把 observability runtime event 迁入 SQLite，加入全链路关联 ID 和真实 provider attempt 预算。
- [x] 重写 runtime status/scene 为单 transaction 投影；同步 TUI/Web/Telegram/CLI。
- [x] 删除 runtime long memory、memory CLI、memory status/prompt/docs/tests 和无效目录声明。
- [x] 更新 provider、host、execution、context、recovery、跨 host 并发和故障注入测试。
- [x] 更新 `spec.md`、README 和 eval，使其只描述当前生产事实。
- [x] 修复命令失败的模型证据投影，保留实际 shell 和通用恢复路径；补充基线取证执行不变量，不引入任务或命令特判。
- [x] 运行定向测试、完整 verify、本地 eval、强杀恢复演练和真实 provider production eval。
- [x] 更新本计划收口，记录验证、未验证项和剩余风险。

## 8. 验证计划

局部验证：

```powershell
npm.cmd run test:build
node --test .test-build/tests/session/*.test.js .test-build/tests/control/*.test.js
node --test .test-build/tests/host/*.test.js .test-build/tests/execution/*.test.js
node --test .test-build/tests/agent/*.test.js .test-build/tests/context/*.test.js
node --test .test-build/tests/provider/*.test.js .test-build/tests/runtime/*.test.js
```

完整验证：

```powershell
npm.cmd run verify
npm.cmd run eval:local
npm.cmd run eval:production
```

额外实战：

- 并发 host 对同一 session 提交真实输入。
- 在 tool intent、文件写入、tool result、turn terminal 各边界强杀并恢复。
- 启动超时 subagent，确认 deadline 后进程树停止且失效 token 无法写入。
- 制造长上下文并执行两次压缩、重启和继续。
- 检查 SQLite 中一次真实任务的 turn、message、tool、execution、wake、request attempt 和 terminal event 关联完整。

production eval 依赖当前 `.kitty/.env` 和真实 provider；若外部 provider 不可用，必须记录实际阻塞，不能用 mock 宣称通过。

## 9. 收口

目标已完成。SQLite 现在统一持有 session、message、turn、tool call、context epoch、execution、wake 和 runtime event 事实；host admission、tool evidence WAL、execution lease/fencing、context hard budget、provider attempt correlation 和 runtime status 已接入同一主干。长期 memory 的实现、入口、路径、状态、测试和文档已删除。

验证事实：

- `npm.cmd run verify` 通过：typecheck、build、核心测试完成；279 个测试中 278 通过、0 失败、1 个 POSIX-only 测试在 Windows 按条件跳过。
- `npm.cmd run eval:local` 通过全部 14 个场景，包括 context epoch、工具输出治理、host boundary、background/subagent lifecycle 和 lost/abort/terminate 恢复演练。
- `npm.cmd run eval:production` 通过全部 5 个真实场景：DeepSeek provider probe、两轮 session、严格修复任务和 runtime status。修复任务先保留失败验证证据，再修改文件，再复验通过；tool.failed、tool.completed 和 turn.completed 闭环。
- 定向工具证据测试 12/12 通过；同 session 并发 admission、tool batch、local API 和 execution lifecycle 测试通过。
- 删除能力残留扫描无命中；内部源码没有版本编号或 legacy 命名。超过 300 行的文件已按职责和变化原因审查，没有为行数拆分。

未验证与剩余风险：没有在 POSIX 主机运行 Windows 本次构建，POSIX 进程树终止测试因此未执行；真实 provider 实战只覆盖当前 DeepSeek 配置，不代表所有 catalog provider 的实时服务稳定性。SQLite 设计面向单机多进程，不宣称提供跨主机分布式共识。当前没有 commit 或 push 请求，也未执行 commit 或 push。
