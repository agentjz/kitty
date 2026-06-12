# Host 边界

Host 负责把产品入口接到 agent turn。

当前入口：

- CLI agent
- CLI spec
- interactive shell
- Telegram
- status
- eval

Host 不负责模型策略。

Host 不负责工具内部实现。

Host 工具注册边界：

- `src/host/toolRegistry.ts`

`runHostTurn` 只接收 `extraTools` 和 `runtimePromptState`，不在 turn 生命周期里拼工具 registry。

隔离模式通过 host 边界注入额外工具和 prompt 状态。当前隔离模式是 `kitty spec`。

`kitty status` 使用 `src/runtime/status.ts` 聚合当前现场。CLI presenter 只负责呈现：当前焦点、下一步、阻塞项、session、context budget、memory、skills、project map、execution、wake 和 spec workflow。

`kitty eval` 使用 `src/evaluation/harness.ts`。它列出场景，也可以通过 `--run` 执行本地机器检查。检查结果是 pass/fail/skip 事实，不调用模型评分。

