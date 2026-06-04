# 宿主与验证

当前宿主：

- CLI
- 交互终端
- Telegram 私聊服务

宿主复用同一个 agent 主链路。

宿主负责运行边界。lead 因阻塞型 subagent/team execution 让出当前轮时，宿主等待 execution 进入终态或 deadline 到达，再用 internal wake facts 恢复 lead。wake 不进入用户输入，也不写入 session memory。

`kitty status` 展示当前 runtime 现场：session、task lifecycle、memory、execution、deadline、team、wake 和 spec。它只展示事实，不给下一步建议。

当前验证入口：

- `npm.cmd run verify`
