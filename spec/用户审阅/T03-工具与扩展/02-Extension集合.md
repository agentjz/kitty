# Extension 集合

当前 extension 集合：

- `todo`
- `worktree`
- `network`
- `background`
- `subagent`
- `team`
- `spec`

扩展开关由配置集中控制。扩展开启后进入同一个 agent 工具面；关闭后不进入工具面。

extension 的名字、默认开关、说明、工具集合入口和能力边界来自同一个定义表。以后新增扩展时，在这一处增加事实。

默认 agent 工具面启用 `todo`、`worktree`、`network`、`background`、`subagent`、`team`。`spec` 不随默认 agent 自动启用，它有独立的 `kitty spec` 工作流入口。

extension 是工具集合。`spec` 同时有隔离的 spec 模式入口，用于 requirements、design、tasks、implement、validate 工作流；普通 agent 模式不自动进入 spec 工作流。

`todo` 是会话级 todo 写入和展示，不拆成独立读写任务板。

`network` 是一组网络工作工具：HTTP session、请求、探测、下载、trace 和 OpenAPI 检查放在同一个扩展集合里。

`background` 是后台命令 execution 工具集合。它把后台进程写入 control-plane 账本，支持检查、终止和异常终止后的 reconcile。

`subagent` 是聚焦 agent execution 工具集合。它把子执行写入 control-plane，支持启动和检查。

`team` 是 teammate execution、成员和消息工具集合。成员、消息和队友执行都进入 control-plane。
