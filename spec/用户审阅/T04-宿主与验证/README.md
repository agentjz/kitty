# 宿主与验证

当前宿主：

- CLI
- 交互终端
- Telegram 私聊服务
- 本地 session/event API

宿主复用同一个 agent 主链路。

宿主负责运行边界。lead 因阻塞型 subagent execution 让出当前轮时，宿主等待 execution 进入终态或 deadline 到达，再用 internal wake facts 恢复 lead。wake 不进入用户输入，也不写入 session memory。

本地 session/event API 提供创建 session、发送消息、读取 session events 和读取 status 的统一入口。事件只记录 session 创建、turn 开始、完成、失败和中断这些机器事实，不伪装成用户输入。

`kitty events [sessionId]` 展示最近会话或指定会话的 session events。它是事件事实的审阅入口，不是聊天记录入口。

`kitty status` 展示当前 runtime 现场：session、workset、task lifecycle、memory、execution、deadline、wake、skills、model cache 和 project map。它只展示事实，不给下一步建议。

当前验证入口：

- `npm.cmd run verify`
- `kitty eval`
- `kitty eval --run-local`
- `kitty eval --run-production`

`kitty eval --run-local` 会运行本地机器检查，也会用假 provider 跑真实 host turn golden 场景，验证 session、工具、workset 和 event 边界。

`kitty eval --run-production` 是显式生产路径验收入口，独立于普通 `npm test`，允许使用当前项目真实配置和更长链路。
