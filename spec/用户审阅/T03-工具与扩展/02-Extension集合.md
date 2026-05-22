# Extension 集合

当前 extension 集合：

- `todo`
- `worktree`
- `network`
- `background`
- `subagent`
- `team`
- `skills`
- `spec`

扩展开关由配置集中控制。扩展开启后进入同一个 agent 工具面；关闭后不进入工具面。

extension 的名字、默认开关、说明、工具集合入口和能力边界来自同一个定义表。以后新增扩展时，在这一处增加事实。

默认 agent 工具面启用 `todo`、`worktree`、`network`、`background`、`subagent`、`team`、`skills`。`spec` 不随默认 agent 自动启用，它有独立的 `kitty spec` 工作流入口。

extension 是工具集合。`spec` 同时有隔离的 spec 模式入口，用于 requirements、design、tasks、implement、validate 工作流；普通 agent 模式不自动进入 spec 工作流。

`todo` 是会话级 todo 写入和展示，不拆成独立读写任务板。

`network` 是一组网络工作工具：HTTP session、请求、探测、下载、trace 和 OpenAPI 检查放在同一个扩展集合里。

`background` 是后台命令 execution 工具集合。它把后台进程写入 control-plane 账本，支持检查、终止和异常终止后的 reconcile。它默认不阻塞 lead。

`subagent` 是聚焦 agent execution 工具集合。它把子执行写入 control-plane，支持启动和检查。subagent execution 默认带阻塞型 `waitPolicy`；lead 启动后让出当前轮，host 等 subagent 结束后用 internal wake 事实恢复 lead。

`team` 是 teammate execution、成员和消息工具集合。成员、消息和队友执行都进入 control-plane。team execution 默认带阻塞型 `waitPolicy`；lead 启动 teammate 后让出当前轮，worker 完成后 teammate 状态回到 idle。

`skills` 是项目运行时 skill 工具集合。它发现项目 `SKILL.md`、`.skills/**/SKILL.md` 和 `skills/**/SKILL.md`，只把名称、说明和路径作为索引放进运行事实。模型认为当前任务需要某个方法时，显式调用 `skill_load` 读取完整正文。机器不做关键词匹配、语义路由或自动加载。

`.codex/skills/**` 是 Codex 开发本仓库时使用的项目级开发规范，不进入小猫运行时 skill 发现范围。
