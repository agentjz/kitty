# Host 边界

Host 负责把产品入口接到 agent turn。

当前入口：

- CLI agent
- interactive shell
- Telegram
- local session/event API
- status
- eval

Host 不负责模型策略。

Host 不负责工具内部实现。

Host 工具注册边界：

- `src/host/toolRegistry.ts`

`runHostTurn` 只接收 `extraTools` 和 `runtimePromptState`，不在 turn 生命周期里拼工具 registry。

`kitty status` 使用 `src/runtime/status.ts` 聚合当前现场。CLI presenter 只负责呈现：当前焦点、下一步、阻塞项、session、context budget、memory、skills、project map、execution 和 wake。

`src/host/localApi.ts` 提供本地 API：创建 session、发送消息、读取 session events、读取 status。它复用 `runHostTurn`，不绕过 agent 主循环。

`src/session/events.ts` 把 session event 写入 `.kitty/events/*.jsonl`。事件类型包括 session created、turn started、turn completed、turn failed 和 turn aborted。事件是机器事实，不进入用户消息。

`kitty events` 使用 `src/cli/commands/events.ts` 读取 `src/session/events.ts` 的同一份事件事实。默认读取最新 session，也可以按 session id 读取；CLI presenter 只格式化事件，不判断语义。

`kitty eval` 使用 `src/evaluation/`。`harness.ts` 只负责编排；`checks.ts` 运行本地机器检查和显式生产验收检查。检查结果是 pass/fail/skip 事实，不调用模型评分。

eval 分两层：

- `kitty eval --run-local`：本地确定性验收，允许进入 eval 自己的测试脚本，但不进入普通 `npm test`。
- `kitty eval --run-production`：显式生产路径验收，允许使用当前项目真实配置和更长链路，必须由维护者主动执行。

