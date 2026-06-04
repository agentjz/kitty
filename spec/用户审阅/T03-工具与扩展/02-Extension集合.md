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

`background` 是后台命令 execution 工具集合。它把后台进程写入 control-plane 账本，记录 deadline、last output、输出摘要、close reason 和异常终止后的 reconcile。它默认不阻塞 lead。

`subagent` 是聚焦 agent execution 工具集合。它把子执行写入 control-plane，支持启动和检查。subagent execution 默认带阻塞型 `waitPolicy`，带 timeout/deadline；lead 启动后让出当前轮，host 等 subagent 结束或 deadline 到达后用 internal wake 事实恢复 lead。worker 的最终可见回答、changed paths、close reason 写回 execution，lead 醒来时能看到实际结论。

`team` 是 teammate execution、成员和消息工具集合。成员、消息和队友执行都进入 control-plane。team execution 默认带阻塞型 `waitPolicy`，带 timeout/deadline；lead 启动 teammate 后让出当前轮，worker 完成或 deadline 到达后恢复，teammate 状态回到 idle，最终可见回答和 changed paths 写回 execution。

`skills` 是项目运行时 skill 工具集合。它发现项目 `SKILL.md`、`.skills/**/SKILL.md` 和 `skills/**/SKILL.md`，只把名称、说明、路径和资源索引放进运行事实。模型认为当前任务需要某个方法时，显式调用 `skill_load` 读取完整正文；需要 skill 包内资料、脚本、示例或资产时，显式调用 `skill_read_resource` 读取。机器不做关键词匹配、语义路由或自动加载。skill 加载和脚本运行会记录到 observability 和 task lifecycle。

`spec` 是深工作流工具集合。创建、打开、更新 state 和更新 task 时，会把 active spec 和阶段事实同步到 Task Lifecycle；普通 agent 不因此自动进入 spec。

`.codex/skills/**` 是 Codex 开发本仓库时使用的项目级开发规范，不进入小猫运行时 skill 发现范围。
