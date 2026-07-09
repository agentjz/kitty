# Extension 集合

当前 extension 集合：

- `todo`
- `worktree`
- `network`
- `background`
- `subagent`
- `skills`

扩展开关由配置集中控制。扩展开启后进入同一个 agent 工具面；关闭后不进入工具面。

extension 的名字、默认开关、说明、工具集合入口和能力边界来自同一个定义表。以后新增扩展时，在这一处增加事实。

默认 agent 工具面启用 `todo`、`worktree`、`network`、`background`、`subagent`、`skills`。

`todo` 是会话级 todo 写入和展示，不拆成独立读写任务板。

`network` 是一组网络工作工具：HTTP session、请求、探测、下载、trace 和 OpenAPI 检查放在同一个扩展集合里。

`background` 是后台命令 execution 工具集合。它把后台进程写入 control-plane 账本，记录 deadline、last output、输出摘要、close reason 和异常终止后的 reconcile。它默认不阻塞 lead。停止 background 会终止对应进程树，不只杀根 pid。

`subagent` 是聚焦 agent execution 工具集合。它把子执行写入 control-plane，支持启动、检查、读取和取消。subagent execution 默认带阻塞型 `waitPolicy`，带 timeout/deadline；lead 启动后让出当前轮，host 等 subagent 结束或 deadline 到达。等待期间，worker 把 runtime UI event 写入自己的 session events，host 把这些事件复放到当前输出流，所以用户看到的是 subagent 正在读什么、跑什么、答什么，而不是黑盒等待。worker 的最终可见回答、changed paths、close reason 写回 execution，lead 醒来时能看到实际结论。取消 subagent 会终止 worker 子进程树；lead wake 使用取消后的最新 execution 事实，不使用旧 running 快照。

`skills` 是项目运行时 skill 工具集合。它发现项目 `SKILL.md`、`.skills/**/SKILL.md` 和 `skills/**/SKILL.md`，只把名称、说明、路径和资源索引放进运行事实。模型认为当前任务需要某个方法时，显式调用 `skill_load` 读取完整正文；需要 skill 包内资料、脚本、示例或资产时，显式调用 `skill_read_resource` 读取。机器不做关键词匹配、语义路由或自动加载。skill 加载和脚本运行会记录到 observability 和 task lifecycle。

`.codex/skills/**` 是 Codex 开发本仓库时使用的项目级开发规范，不进入小猫运行时 skill 发现范围。

`background`、`subagent`、`skills` 之外，其余核心扩展保持当前配置事实，不在这个清单里假装存在更多集合。
