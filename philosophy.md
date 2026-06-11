# 小猫智能体哲学

## 🧠 历史与当下

过去应该怎样进入现在？

旧任务、旧判断和旧惯性整段进入当前轮时，会把模型带回已经过去的目标。

历史完全隔离时，模型每句话都像重新开局：用户刚刚确认过的事情要重复解释，刚刚走过的路要重新读取，长任务会变笨，token 会被浪费在反复找回上下文上。

小猫智能体把上下文分层：

- 同一个 session 的对话脉络由模型写出的 session memory 进入当前轮，负责用户连续体验。
- 当前任务工作记忆自动进入当前轮，负责执行连续性。
- 项目地图把目录、入口、脚本、测试、spec 和 git 状态作为机器事实进入当前轮，负责快速定向。
- checkpoint、工具产物、运行事件和文件变更记录留在证据里，只在需要取证或恢复时使用。
- 当前上下文是模型当下工作的桌面，只放当前用户输入、同 session 对话脉络、当前任务工作记忆、项目地图和必要工作集。
- 上下文预算是机器测量事实：limit、estimated、remaining、usage ratio、压缩模式和 prompt hotspots 会进入 session 和 status，帮助用户看到当前上下文压力。
- 长期原则写进可审阅的 spec、测试和源码。

模型写记忆负责续命，历史负责取证，上下文负责当下推理。

这条边界同时保护两件事：用户的任务有连续性，模型的当前工作焦点有清晰边界。

## 📌 用户与事实

Agent 应该更忠于用户，还是更忠于事实？

用户友好可以降低摩擦，也可能让用户更舒服地停留在自己的旧习惯、旧偏好和旧盲区里。

小猫智能体理解用户，尊重偏好，也把事实证据放在边界上。用户的上下文可以被接住，用户的历史可以被查询，当前判断仍然落在当前请求和当前证据上。

## 🛠️ 核心与扩展

能力越多，Agent 是否就越强？

默认能力越多，模型越容易分心，用户也越难判断系统到底在做什么。

小猫智能体的核心固定为 `read / edit / write / bash`。这四个工具负责基础编程闭环。

复杂能力通过 extension 独立存在。当前 extension 是 `todo`、`worktree`、`network`、`background`、`subagent`、`skills`、`spec`。它们可启用、可禁用，打开后进入同一个 agent 工具面，关闭后从工具面移除。

默认 agent 打开 `todo`、`worktree`、`network`、`background`、`subagent`、`skills`。`spec` 不默认混进普通 agent；需要计划工作流时，通过 `kitty spec` 进入隔离的 spec 模式。

扩展是工具集合。核心保持清楚，扩展保持独立。

Skills 也是 extension，不是第三套工具体系。它把可复用方法、资料、脚本、示例和素材组织成 runtime 能力包。默认上下文只出现 skill 索引和资源索引；是否加载正文、读取资源、运行脚本，由模型根据当前请求和工作焦点决定。机器只负责发现、读取、执行和记录事实。

## 📐 Spec

复杂任务应该只是聊天里的临时文字，还是应该成为可审阅的工作流？

小猫智能体把复杂任务交给 spec 工作流。`kitty spec` 会进入隔离的 spec 模式，围绕四个文档推进：

- `requirements.md`
- `design.md`
- `tasks.md`
- `notes.md`

Spec 的主流程是 requirements、design、tasks 三阶段；implement、validate、archive 是执行和收口状态。Workflow summary 会暴露 active spec、当前阶段、确认门、下一 gate、四个文档状态、工具面和隔离 workspace。

任务拆解进入 `tasks.md`，事实笔记和审阅痕迹进入 `notes.md`。checkpoint 保存 spec 状态、四个文档和隔离 worktree 的代码位置。

Spec 不是普通文档目录。它负责把模糊目标变成可审阅的计划资产：需求、设计、任务、过程笔记、验证证据和 checkpoint。重要的 session memory 可以沉淀进 spec notes，成为后续继续工作的证据。

## 💾 记忆与沉淀

记忆应该留在哪里？

只留在模型上下文里，下一轮容易丢。只留在日志里，模型不容易用。全量塞回上下文，又会把旧目标拖回现在。

小猫智能体把记忆分成运行连续性和长期资产：

- session memory 由模型在 turn 收口时根据事实写出，并采用固定 Markdown 区块。
- working memory 保存模型写出的当前工作焦点、todo、近期工具批次和执行连续性事实。
- `.kitty/memory/sessions/*.md` 保存同 session 连续记忆。
- `.kitty/memory/project/*.md` 保存项目经验。
- `.kitty/memory/user/*.md` 保存用户画像。
- `.kitty/memory/evidence/*.md` 保存可审阅证据资产。
- memory asset 暴露 kind、id、title、scope、tags、路径和 evidence references，可以被用户创建、读取、搜索、删除，也可以沉淀到 spec `notes.md` 或 runtime skill `references/`。

Memory 搜索是候选召回，不是语义裁判。机器按文本 token、路径、标签和证据引用暴露命中行；是否采用这些记忆，由模型结合当前请求判断。

固定区块包括当前工作焦点、用户约束、决策、未结事项、验证事实和可复用经验。机器维护格式、保存文本和文件位置。模型判断哪些经验值得复用，哪些历史只适合取证。

## 🧾 运行现场

长任务应该靠模型记住，还是靠本地现场接住？

模型可以理解任务，但不能可靠地替代运行账本。长任务、后台进程、子执行和唤醒事实需要一个本地事实层。

小猫智能体用 control plane 保存这些死事实：background、subagent execution、派工边界、pid、状态、退出码、输出摘要、wait policy 和 wake signal。

`kitty status` 让用户看到运行现场：session、context budget、memory、project map、execution、wake、spec。它只呈现事实，不替模型做判断。

Background 是长任务现场。它记录运行输出摘要，能检查、终止、reconcile，也能在完成后把事实暴露给 lead。

Subagent 是隔离上下文协作现场。lead 派出有边界的任务后让出当前轮；worker 完成后把 summary/output 写回 execution；host 用内部 wake facts 恢复 lead。wake 是内部事实，不是用户新要求。

## ⚙️ 模型与机器

判断应该交给模型，还是交给机器？

机器更可靠，模型更会判断。机器开始替模型决定策略时，会形成第二套判断中心；模型只靠语言声称完成时，会失去事实地面。

小猫智能体让模型负责活判断，让机器负责死事实。模型决定路线，机器执行工具、保存现场、记录证据、维护边界和暴露验证结果。

Runtime 提供运行边界。Control plane 保存执行账本。Observability 记录事实。Checkpoint 保存可恢复现场。工具执行明确的机器操作。

Task Lifecycle 保存当前任务阶段和运行事实：阶段、原因、active execution、spec、todo、验证事实和完成事实。它是 control plane 里的事实账本，不是机器语义分类器，不把用户原话升级成目标。

Agent turn 生命周期负责把当前输入、工具批次、provider 恢复、checkpoint、session diff 和记忆更新串成可恢复的现场。生命周期只保存和暴露事实，不决定路线。

Lead wait 必须有边界。阻塞型 subagent execution 会让 lead 让出当前轮；execution 完成或等待 deadline 到达后，host 用 internal wake facts 恢复 lead。wake 是运行事实，不是用户新要求。

## 🧪 评测

Agent 不能只靠单元测试证明成熟。

小猫智能体用 evaluation harness 暴露真实体验场景：简单问题不疯狂工作、长会话不失忆、旧目标不回灌、项目地图帮助定向、memory 可审阅可追溯、background 可恢复可终止、subagent 能唤醒 lead、spec 工作流能闭环。

`kitty eval` 只列出验收场景和机器事实，不替模型打分，也不把口号写成测试。

## 🧱 当前事实主干

当前产品面只承认当前实现真实存在的能力。

源码、测试、spec、README、CLI 输出和运行状态必须讲同一个当前事实。没有当前入口、当前工具、当前状态或当前测试支撑的能力，不进入产品语言。

历史用于研究和判断，不进入当前产品主干。需要的能力按当前现实建立；不需要的能力不写说明、不写分支、不写测试。
