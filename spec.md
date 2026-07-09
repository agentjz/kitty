# Kitty Spec

`spec.md` 是仓库级真相源。本文是当前唯一规格入口，不再维护分散规格目录。

本文按两个审阅层组织：

- 用户审阅：目标、边界、主流程、验收。
- 技术实现：核心模块边界、状态、流程、测试与验证。

两类内容长期分离，但使用统一主题编号（`T01...`）对齐。

## 快速入口

1. 用户审阅
2. 技术实现
3. 用户审阅与技术实现映射
4. 职责审查

---

# 用户审阅

这里写项目所有者现在能直接审阅的事实。

阅读顺序：
1. Kitty 核心地图
2. 宪法原则
3. T01-系统定位与主线
4. T02-核心体验
5. T03-工具与扩展
6. T04-宿主与验证
7. 用户审阅与技术实现映射

本层只写当前存在的产品边界、核心模块边界和验收事实。

---

# Kitty 核心地图

Kitty 的核心体验是：

搜得到，看得懂，改得准，跑得通，记得住，能继续。

## Agent

Agent 负责一轮一轮驱动模型工作。

它问模型，执行工具，继续推进，最后收尾。它不替 Context、Session、Provider、Tools、Observability 做事。

Agent turn 的固定生命周期包括：接收当前用户输入、构建当前上下文、请求模型、执行工具批次、处理恢复、完成收口、更新同 session 记忆。这个生命周期只编排机器事实，不替模型规划路线。

Task Lifecycle 是当前任务的运行事实主干。它保存在 control plane，记录 session、stage、reason、active execution、todo、验证事实和完成事实。Agent loop 读取它并注入当前上下文；`kitty status` 展示它；它不判断用户意图，也不把用户原话升级成目标。

## Context

Context 负责模型当前看到什么。

长上下文压缩属于这里，因为它决定哪些信息进入模型视野。Context budget report 暴露 limit、estimated、remaining、usage ratio、压缩模式和 prompt hotspots；它是机器测量事实，不替模型判断取舍。

当前轮直接携带同 session 的近场可见对话。短会话依靠真实对话自然延续；长会话在预算压力下摘要旧对话并保留最近对话 tail。同一个 session 的更长对话脉络由模型写出的 session memory 进入当前轮，负责长任务连续体验；runtime facts 只作为 evidence block 进入判断，不伪装成用户新要求。

Project Map 是 Context 的机器事实入口。它由 `src/project/map.ts` 生成，暴露目录、入口文件、package scripts、测试目录、核心项目文档和 git 状态。Context 把它呈现为 project orientation evidence。它不判断语义重要性，不替模型选方案，不把全量目录树塞进 prompt。

## Session

Session 负责连续性。

它保存对话脉络、工作记忆、checkpoint 和恢复状态。用户要的是任务还能继续，而不是每次从零开始。

Session memory 由模型在 turn 收口时写出。机器提供当前用户输入、assistant 可见结果、工具结果、checkpoint 和 session diff 这些事实，然后保存结构化记忆文本。运行时状态保存在 session record；同一次保存会把这段记忆写成 `.kitty/memory/sessions/*.md`，作为可审阅资产。工作记忆保留模型写出的当前工作焦点、todo、近期工具批次、工作集和执行连续性事实。历史工具结果、运行事件和文件变更留作证据，需要时再取。

结构化 session memory 使用固定 Markdown 区块：`Current Focus`、`User Constraints`、`Decisions`、`Open Threads`、`Verification Facts`、`Reusable Lessons`。机器只维护格式边界，区块内容由模型写。

`kitty memory` 读取 `.kitty/memory/sessions/`、`.kitty/memory/project/`、`.kitty/memory/user/`、`.kitty/memory/evidence/` 这些资产，支持创建 project/user/evidence asset、列出、读取、搜索、删除，以及把某条记忆追加到 runtime skill `references/`。每条 asset 暴露 kind、id、title、scope、tags、路径和 evidence references。搜索是多词候选召回，只返回命中资产和证据行。它只暴露和搬运已经保存的记忆事实，不替模型判断哪些历史应该进入当前轮，也不替模型判断哪些经验值得长期复用。

Session workset 记录同一会话实际读取和变更过的文件。`read`、`edit`、`write` 成功后更新这份事实，`kitty status` 和当前上下文只展示简短工作集。工作集只说明当前现场，不替模型判断重要性。

## Control Plane

Control Plane 负责后台执行的机器事实。

它使用 `.kitty/control-plane.sqlite` 保存 task lifecycle、background、subagent execution、派工边界、pid、状态、退出码、输出摘要和 wake signal。它只负责保存、清理和恢复事实，不替模型判断是否应该后台或派 subagent。

lead-wait 不是按工具名猜出来的。control-plane 的 execution 记录保存 `waitPolicy`，host 按这个事实决定 lead 是否让出当前轮。

当前默认事实是：subagent 创建阻塞型 execution；background 创建非阻塞 execution。lead 创建阻塞型 execution 后让出当前轮，由 host lifecycle 等待 execution 结束。等待期间，host 会轮询该 execution 绑定的 subagent session events，把 worker 写入的 runtime UI event 复放到当前输出流；用户看到的当前流从 lead 切到 subagent 的工具、思考和回答，execution settled 后再切回 lead。worker 的最终可见回答会写回 execution summary/output，派工目标、边界和期望输出会随 execution 一起进入 wake fact，作为 lead synthesis 的协作证据。

background execution 可以通过工具和 CLI 查看、读取输出、等待和停止。`background_run` 只启动并记录非阻塞 execution；`background_read` 按 summary、tail 或 full 模式读取已记录输出；`background_wait` 等待指定 execution settled；`background_stop` / `background_terminate` 关闭指定 execution；`kitty background` 是用户直接审阅和控制后台任务的入口。这些入口都读取同一份 control-plane 事实。停止和取消执行使用跨平台进程树终止：Windows 走 `taskkill /T /F`，POSIX 先尝试进程组信号，再递归处理子孙 pid，并在短等待后升级到 SIGKILL。

subagent execution 可以通过工具和 CLI 审阅、读取输出和取消。`subagent_launch` 创建带 objective、boundary 和 expected output 的独立上下文执行；`subagent_read` 显式读取执行结果；`subagent_cancel` 终止仍在运行的子执行及其子进程树并发布 wake fact。`kitty execution` 是跨 background 和 subagent 的统一审阅入口，支持 list、inspect、read 和 cancel。它只暴露 control-plane 事实，不创建第二套状态。CLI/status/TUI inspector 是补充入口，不替代阻塞等待期间的实时 subagent 输出流。外部取消和 deadline pause 之后，host 会重新读取 execution 终态再构建 wake facts，避免 lead 用旧 running 快照收口。

阻塞型 execution 使用 `timeoutMs` 形成 lead wait deadline。deadline 到达后，execution 会被标记为 `paused` 并发布 wake signal，让 lead 恢复后基于事实判断继续等、终止、重派或收束。

正常 stop 中断当前 turn。退出、进程终止和下次启动 reconcile 通过 control plane 找到仍在运行或已经丢失的执行。`kitty status` 构建现场前会 reconcile 仍标记 running 但 pid 已消失的 execution，把它们标记为 stale 并保留已有输出摘要。

## Provider / Config

Provider / Config 负责连接模型。

它处理不同模型 API 的差异，也处理临时失败恢复。网络抖动和 provider 临时失败不能轻易打断编程体验。

Provider 和 Model 分开维护。Provider 管入口、认证、transport 和 API 风格；Model 管 wire API、上下文限制、输出限制、reasoning、tool 和 cache 能力。YLS、TTAPI 这类中转站是 relay provider 事实，不污染标准 provider。DeepSeek reasoning replay 是 provider wire contract，不是提示词规则。

Config 负责首次成功路径：`kitty init` 创建 `.kitty` 模板，用户填写 `.kitty/.env`，`kitty doctor` 暴露 env key、provider/model catalog、API key、base URL 和 provider probe 事实。缺核心配置时直接报错，不静默猜默认。

## Tools

Tools 是模型的手脚。

核心工具是 `read`、`edit`、`write`、`bash`。搜索、Git、构建、测试都通过 `bash` 做。

工具输出治理属于工具层的机器事实。`bash` 执行后保留原始输出恢复路径，同时把测试失败、搜索结果、git diff 和超大通用输出投影成有界证据给模型。它只压缩和暴露事实，不替模型判断重要性。

复杂任务使用 `plan.md` 作为总管文档。plan skill 约束需求文档、当前事实、失败测试、目标、不做范围、设计、实施任务、验证计划和收口；运行时工具面仍由当前 agent runtime 和 extension registry 决定。

## Extensions

Extensions 是单一 `agent` 循环里的可插拔工具集合。

扩展开关由配置集中控制。当前扩展是 `todo`、`worktree`、`network`、`background`、`subagent`、`skills`。默认 agent 打开这些扩展。扩展打开后进入同一个工具注册表；关闭后不出现在模型工具面里。

Skills 是项目运行时知识包。Context 只放 skill 索引、健康状态和资源索引，不把 skill 全文或资源内容一次性塞进提示词。模型自己判断是否需要某个 skill，再通过工具显式加载正文或读取资源；机器只发现、分组、列出、读取、检查依赖和记录事实。

Skill 包可以声明 `references/`、`scripts/`、`examples/` 和 `assets/` 资源。资源会被分组进入 skill health。`skill_run_script` 只能运行该 skill 资源索引里属于 `scripts/` 的文件；它不是第二个 `bash`，也不做语义路由。Skill frontmatter 可以用 `requires` 声明命令依赖，`skill_check` 检查包健康和这些声明事实。

## Host

Host 是 CLI、TUI、Web、Telegram 进入 agent 的共同边界。

宿主负责输入输出和运行边界，不绕过 agent 主循环。

`kitty status` 是宿主层的运行现场入口。它先展示 Current scene：Now、Focus、Next、Blocked、Background、Memory、Skills、Cost、Tool output 和 Recovery；再展示 Runtime facts：session、context budget、workset、memory files、skills、project orientation、execution 和 wake。它只负责把当前 runtime 现场讲清楚，不替模型决策。

Host 还提供本地 session/event API。它能创建 session、发送一轮消息、读取 session events 和读取 status，供 CLI、Telegram、未来 UI 或远程入口复用同一条 agent 主链路。

`kitty events` 是 session events 的 CLI 审阅入口。它按 session 展示 turn started、completed、failed、aborted 等机器事件，不替代对话历史。

`kitty eval` 是真实体验验收入口。它列出 runtime status、项目地图、memory、extension、skill、config、cache economy、tool output governance、生产现场、host turn、远程入口和 recovery 的验收场景和机器事实。`kitty eval --run-local` 运行本地可验证检查，输出 pass/fail/skip，不替模型打分。`kitty eval --run-production` 是独立生产路径验收入口，必须显式执行，不进入普通 `npm test`。

TUI 和 Web 都只是宿主壳。它们复用同一份 session、events、runtime status 和 turn display，不维护第二套任务状态。`kitty` 裸启动默认进入 TUI；`kitty tui` 是显式同义入口；`kitty agent` 保留文字版交互。TUI 负责滚动、输入、resize、runtime dock 和清理生命周期；语义判断仍由 agent loop 和模型完成。

## Observability

Observability 是记录仪。

它记录 session events、终端日志和崩溃事实。它服务排查、复盘和恢复，不替模型决策。

---

# 宪法原则

宪法原则只保留当前实现真正承载、长期有效、会影响架构判断的原则。

不为了历史编号保留空壳。

不为了纪念旧设计保留旧路径。

不使用脚本生成或批量机械改写。

当前原则：

1. `01-一个agent循环.md`
2. `02-上下文和session是连续性基础.md`
3. `03-工具只有core和extension两层.md`
4. `04-机器层只执行和记录事实.md`
5. `05-spec测试代码必须同步.md`
6. `06-只写当前事实主干.md`

---

# 一个 agent 循环

Kitty 当前只有一个主体验：agent。

CLI、交互终端和 Telegram 都应进入同一条 host -> agent turn 主链路。

这个原则保护的是用户体验和实现边界：入口可以不同，主循环不能分裂。

当前落点：

- `src/agent/`
- `src/host/`
- `src/cli/`
- `src/interaction/`
- `src/shell/`
- `src/telegram/`

---

# 上下文和 session 是连续性基础

Kitty 的长期价值是任务能继续。

Context 决定模型当前看到什么。Session 保存任务现场。近场可见对话、checkpoint、working memory、模型写出的 session memory 和压缩摘要都服务这个连续性。

这些结构提供事实，不替模型规划路线。

同 session 的近场可见对话保持在 provider 主轨。短会话先靠真实对话自然延续；长会话超预算时摘要旧对话，保留最近对话 tail。模型写出的 session memory 承接更长任务脉络。机器只附带计数、工具活动名称、更新时间和预算来源这类死事实。工具产物、运行事件和文件变更留在证据层，需要时再取。

机器只保存事实、边界和记忆文本。模型负责把当前轮事实压缩成同 session 记忆。进入记忆模型的事实包括当前输入、assistant 可见结果、工具结果、checkpoint 和 session diff。session record 是运行时状态入口；`.kitty/memory/sessions/*.md` 是同一次保存生成的可审阅记忆文件。

当前落点：

- `src/context/`
- `src/context/runtime/workingMemory/`
- `src/context/runtime/sessionBrief/`
- `src/context/runtime/compression/`
- `src/session/`
- `src/session/checkpoint/`

---

# 工具只有 core 和 extension 两层

工具体系只保留两层：

- `core`
- `extension`

Core 工具固定为 `read`、`edit`、`write`、`bash`。

Extension 是可启用、可禁用、独立存在的工具集合。当前 extension 是 `todo`、`worktree`、`network`、`background`、`subagent`、`skills`。

Skills 仍然是 extension，不是第三层工具体系。它只提供 skill 索引和按需加载；是否加载由模型判断。

不把扩展能力塞进 core，也不为同一能力保留平行入口。

当前落点：

- `src/tools/`
- `src/tools/index.ts`
- `src/extensions/`
- `src/config/extensions.ts`

---

# 机器层只执行和记录事实

机器层负责执行工具、保存状态、记录事件、暴露结果。

模型负责基于当前目标和证据判断下一步。

Runtime、tool registry、control plane、observability、checkpoint、verification 这些结构不能变成第二个脑子。

Task Lifecycle 只负责把当前任务事实按阶段保存和暴露。它可以记录 turn、delegated wait、provider recovery、active execution、验证事实和完成事实，不能替模型判断任务路线。

等待也必须是事实边界。lead wait deadline 来自 execution timeout，机器只负责在超时后标记状态并发布 wake；继续等待、终止、重派或收束由模型根据事实判断。

当前落点：

- `src/agent/turn/`
- `src/agent/turn/lifecycle.ts`
- `src/control/ledger.ts`
- `src/execution/background.ts`
- `src/tools/`
- `src/extensions/`
- `src/observability/`
- `src/session/`
- `src/runtime-ui/`

---

# Spec、测试、代码必须同步

Spec、测试、代码必须描述同一个当前现实。

Spec 不写不存在的模块。

测试不写旧概念黑名单，只写当前架构正向事实。

代码变化后，相关 spec 和测试必须同步。没有验证不能说完成。

当前落点：

- `spec.md`
- `tests/`
- `src/`
- `npm.cmd run verify`

---

# 只写当前事实主干

当前产品面只承认当前实现真实存在的能力。

源码、测试、spec、README、CLI 输出和运行状态必须讲同一个当前事实。

没有当前入口、当前工具、当前状态或当前测试支撑的能力，不进入产品语言。

历史提交、旧设计和旧数据只作为 research 证据，不进入当前源码主干。

需要的能力按当前现实建立；不需要的能力不写说明、不写分支、不写测试。

当前落点：

- `.codex/skills/kitty-agent-development/SKILL.md`
- `src/`
- `tests/`
- `spec.md`
- `README.md`
- `philosophy.md`

---

# 系统定位与主线

Kitty 是本地 agent 编程工作台。

当前只有一个主体验：用户把任务交给 agent，agent 读取上下文、调用模型、执行工具、保存 session，并在需要时继续同一任务现场。主线包含 provider/model catalog、turn 生命周期、session memory 和可审阅的运行现场。

核心体验：

- 搜得到
- 看得懂
- 改得准
- 跑得通
- 记得住
- 能继续

---

# 产品定位

Kitty 服务本地编程任务。

它不是聊天壳，也不是自动项目经理。它的机器层只执行工具、保存现场、记录事实；路线判断仍由模型在当前目标和证据基础上完成。

当前产品面包括：

- CLI
- 交互终端
- Telegram 私聊服务

---

# 当前范围

当前 Kitty 覆盖：

- 单一 agent 主循环
- 项目上下文和运行时上下文
- session、checkpoint、工作记忆
- provider/model catalog、连接诊断和请求恢复
- 四个 core 工具
- 六个 extension 工具集合
- CLI、交互终端、Telegram
- 运行时展示和 observability
- 按源码模块组织的测试

扩展能力必须通过当前 extension 结构进入，不塞进 core。

---

# 核心体验

当前核心体验由 Agent、Context、Session、Provider / Config、Tools、Extensions、Host、Observability 共同组成。

---

# Agent 与 Context

Agent 负责驱动一轮模型工作。

Context 负责模型当前看到什么。

Context 包含近场可见对话、项目上下文、运行时上下文、工作记忆、session memory 和长上下文压缩。它提供事实，不替模型规划路线。

Provider 请求里的 raw messages 使用同 session 的近场可见对话。internal wake 和内部控制输入不进入自然对话主轨。预算足够时保留完整可见对话；超预算时摘要旧对话，保留最近对话 tail。Session memory 承接更长任务脉络，runtime facts 只作为证据层。

Session memory 是模型写出的同 session 记忆。每个可见 assistant 结果完成后，agent turn 生命周期固定发起一次内部记忆更新请求；机器把当前轮用户输入、assistant 可见响应、工具结果、checkpoint、session diff 和已有记忆交给模型，再保存模型写出的结构化记忆文本，并同步生成 `.kitty/memory/sessions/*.md` 供审阅。主回答结束后，title 和记忆总结属于可见的收尾阶段，不应被伪装成空闲。

Session memory 正文使用固定 Markdown 区块：`Current Focus`、`User Constraints`、`Decisions`、`Open Threads`、`Verification Facts`、`Reusable Lessons`。区块格式由机器提供，区块内容由模型根据事实写出。

机器附带的运行事实只保留可验证的死事实，例如可见 turn 计数、工具活动名称、memory 更新时间和上下文预算来源。它不生成用户锚点，不替模型判断用户意图，也不把 runtime facts 当成自然对话历史。

---

# Session 与 Provider

Session 是任务现场。

它保存消息、任务状态、checkpoint、workset、session diff 和恢复所需事实。

Session 不把运行账本伪装成对话。当前轮使用同 session 的近场可见对话；预算足够时保留完整可见对话，超预算时摘要旧对话并保留最近对话 tail。同 session 长任务连续体验由模型写出的 session memory 承接；当前工作焦点和执行连续性由 working memory 承接；checkpoint 和 session diff 用于恢复和取证。

Session memory 不是工具。它是每轮完成后的固定生命周期行为：模型负责按固定区块写记忆，机器负责保存、版本化、下一轮注入，并把失败记录到 observability。session record 是运行时状态入口；`.kitty/memory/sessions/*.md` 是同一次保存生成的可审阅记忆文件。

固定区块是格式边界，不是机器语义判断。机器不决定哪些事实重要，只提供 `Current Focus`、`User Constraints`、`Decisions`、`Open Threads`、`Verification Facts`、`Reusable Lessons` 这些稳定栏目。

Session workset 是当前现场索引。文件被读取或变更后进入 workset，记录路径、读取次数、变更次数、最后工具和 change id。它让模型和用户知道当前任务真正碰过哪些文件，但不替模型判断哪些文件重要。

Provider / Config 负责 provider/model catalog、模型连接、provider 差异、请求恢复、环境变量和运行配置。

Provider 和 Model 分开维护事实。Provider 负责入口、认证、transport、超时和连接探测；Model 负责 wire API、工具能力、reasoning、cache、上下文上限、输出上限和请求参数。正常 provider 走标准探测；中转 provider 作为 `relay` transport 统一管理，连接探测按当前模型的 wire API 走真实请求入口，而不是默认假设 `/models` 一定存在。

YLS 和 TTAPI 是当前内置 relay provider。它们不是普通 OpenAI-compatible provider，也不靠 CLI/TUI 特判；catalog 声明 provider transport，request / doctor 从 catalog 推导行为。DeepSeek 是标准 provider，thinking + tool call 的 reasoning_content 回传属于 provider/model 的事实，不是 session 的随手补丁。

DeepSeek 工具调用链路的用户体验要求是：模型调用工具后，工具结果能回到同一轮现场，模型继续完成回答。内部必须完整保留 DeepSeek 要求回传的 thinking `reasoning_content`；压缩上下文和请求恢复不能把它当成普通可删摘要。这个字段不展示成用户内容，也不写成用户意图，只作为 provider 后续请求的 wire 事实。

---

# 工具与扩展

工具只有两层：

- `core`
- `extension`

`core` 固定，`extension` 可启用、可禁用、独立存在。

---

# Core 工具

Core 工具固定为当前四个：

- `read`
- `edit`
- `write`
- `bash`

它们支撑基础编程闭环。搜索、Git、构建、测试和本地命令通过 `bash` 完成。

---

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

---

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

---

# Eval 验收分层

`kitty eval` 是产品验收入口，不是普通测试入口。

普通开发时：

- 跑 `npm.cmd test`。
- 不跑真实 provider。
- 不消耗真实 API。
- 不跑 eval。

需要验收 Kitty 真实产品路径时：

- 跑 `kitty eval --run-local` 做本地产品验收。
- 跑 `kitty eval --run-production` 做显式生产路径验收。

生产路径验收会使用当前 `.kitty/.env`，可以访问真实 provider。它必须由维护者主动执行，不能混进日常测试。

---

# 与技术实现映射

| 用户审阅事实 | 技术实现事实 |
| --- | --- |
| 单一 agent 运行体验 | `src/agent/`、`src/host/`、`src/cli/` |
| 上下文负责模型看到什么 | `src/context/` |
| session 是任务现场 | `src/session/` |
| session memory 生成可审阅文件资产 | `src/session/memoryAsset.ts`、`.kitty/memory/sessions/` |
| provider 和 config 负责 provider/model catalog、模型连接与运行配置 | `src/provider/`、`src/config/` |
| provider/model/relay/usage/cache 是模型连接主干 | `spec.md` |
| init / doctor 是首次成功体验 | `spec.md` |
| core 工具是 `read/edit/write/bash` | `src/tools/` |
| extension 是可插拔工具集合 | `src/extensions/`、`src/config/extensions.ts` |
| 当前扩展是 `todo/worktree/network/background/subagent/skills` | `src/extensions/`、`src/skills/` |
| execution 生命周期事实进入 control-plane | `src/control/ledger.ts`、`src/execution/`、`src/interaction/exitGuard.ts` |
| 宿主只复用 agent 主链路 | `src/host/`、`src/interaction/`、`src/shell/`、`src/telegram/` |
| TUI 和 Web 只是 UI 壳 | `spec.md` |
| 记录层只记录事实 | `src/observability/`、`src/project/` |
| 测试只写当前正向事实 | `tests/` |
| eval 是按需产品验收，不属于日常测试链路 | `src/evaluation/`、`tests/evaluation/`、`package.json` |

---

# 技术实现

这里写当前代码实现事实。

阅读顺序：
1. `T01-架构与状态/`
2. `T02-上下文与会话/`
3. `T03-工具与扩展/`
4. `T04-宿主与验证/`
5. `T05-Provider与模型/`
6. `T06-配置初始化诊断/`
7. `T07-验收分层/`
8. `T08-TUI与RuntimeUI/`
9. `职责审查/`
10. `与用户审阅映射.md`

本层只写当前核心模块实现、状态归属、执行流程、失败路径和测试验证事实。

---

# 架构与状态

当前源码根：

- `src/agent`
- `src/cli`
- `src/config`
- `src/context`
- `src/extensions`
- `src/host`
- `src/interaction`
- `src/observability`
- `src/project`
- `src/provider`
- `src/runtime-ui`
- `src/session`
- `src/shell`
- `src/telegram`
- `src/tools`
- `src/types`
- `src/utils`

当前测试根与这些源码根对应。

`src/provider` 的当前边界是 provider/model catalog、transport、wire adapter、request、usage、cache 和连接探测。Provider catalog 维护 provider 身份、入口、认证形态、transport 和超时；model catalog 维护 wire API、能力、限制和请求参数。`transport` 统一处理标准 provider 与 relay 中转 provider 的探测入口；YLS、TTAPI 这类中转只作为 relay provider 实例进入 catalog，不在 CLI、TUI、session 或 error 层散落特判。

---

# 状态归属

当前状态归属：

- 配置：`src/config/`
- session：`src/session/`，路径由 `src/config/paths.ts` 给出
- memory 资产：`.kitty/memory/sessions/`、`.kitty/memory/project/`、`.kitty/memory/user/`、`.kitty/memory/evidence/`，由 `src/runtime/memory/` 统一创建 project/user/evidence、列出、读取、搜索、删除和沉淀
- session memory 资产：`.kitty/memory/sessions/`，由 `src/session/memoryAsset.ts` 从 session save 同步写出，带统一 metadata 头和 `Evidence: session:<id>`
- project map：`src/project/map.ts`，由 `src/context/projectContext.ts` 和 `src/runtime/status.ts` 读取，暴露目录、入口、脚本、测试、spec 和 git 事实
- change history：`src/agent/changes/`，路径由 `src/config/paths.ts` 给出
- context snapshot：`src/context/runtime/`
- task lifecycle：`src/control/taskLifecycle.ts`，状态归属 control-plane 账本
- checkpoint：`src/session/checkpoint/`
- extension 状态：`.kitty/extensions/`，代码入口在 `src/extensions/shared.ts`
- control-plane 账本：`.kitty/control-plane.sqlite`，代码入口在 `src/control/ledger.ts`
- execution 生命周期：`src/execution/`，状态归属 control-plane 账本
- observability 状态：`.kitty/observability/`，代码入口在 `src/observability/`
- 项目状态路径：`src/project/statePaths.ts`

当前有 SQLite 控制面账本。

control-plane 只记录机器事实：task lifecycle、execution、wait policy、background process、subagent execution、wake signal、pid、状态、时间、deadline、last output、退出码、输出摘要、close reason、changed paths 和 error。它不判断任务路线，不替模型规划，不把记录层变成第二个脑子。

Task Lifecycle 记录当前 session 的 task id、stage、reason、active execution、active todo、验证事实和完成事实。Agent loop 在 turn 开始、provider recovery、delegated wait 和完成收口时写入这些事实。Context 注入当前 Task Lifecycle block；runtime status 展示当前 session 的 Task Lifecycle。普通用户输入只属于当前 turn，不写入 Task Lifecycle 目标字段。

background、subagent 是当前接入 control-plane 的 execution 类型。退出清理、异常终止后的 reconcile、wake signal 都基于这个账本。

lead-wait 由 execution 的 `waitPolicy` 决定，不由工具名或 execution kind 临时判断。当前 subagent 默认写入 `lead=while_execution_active`，background 默认写入 `lead=none`。

工具创建阻塞型 execution 后，lead turn 返回 `yield.execution_wait`；`src/host/turn.ts` 等待 execution 进入终态，再把 execution 结果作为 internal wake 输入交回 lead。internal wake 不会成为新的用户目标，也不会写入 session memory。

lead-wait 有 deadline。`src/execution/leadWait.ts` 使用 execution 的 `timeoutMs` 计算等待边界；deadline 到达后，阻塞型 execution 会被标记为 `paused` 并发布 wake signal，避免 lead 永久下线。

agent worker 执行完成后，`src/execution/worker.ts` 从 worker session 中读取最后一条可见 assistant 回答，写入 execution summary/output，并记录 changed paths、close reason 和 error。lead wake 使用这些 execution 事实恢复协作上下文。

---

# 上下文与会话

Context 和 Session 共同保证任务连续性。

Provider raw messages 由 `src/context/runtime/conversationWindow.ts` 先构建同 session 近场可见对话，再交给 `src/context/runtime/compression/` 做预算压缩。internal wake 和内部控制输入不进入自然对话主轨。

`src/context/runtime/budget.ts` 生成 context budget report，记录 limit、estimated、remaining、usage ratio、压缩模式、压缩原因、来源分桶和 prompt hotspots。Agent turn 把最近一次 budget 保存到 session，`kitty status` 从 session 先投影成 Current scene 里的成本现场，再在 Runtime facts 里展示机器测量事实。

同 session 对话连续性由两层组成：

- `src/session/memory.ts` 集中维护 session memory 的固定 Markdown 区块和长度边界。
- `src/session/memoryCompaction.ts` 在可见 assistant 结果完成后构建内部模型请求，让模型更新结构化 session memory。
- `src/agent/turn/lifecycle.ts` 固定触发 session memory 更新，并把更新失败记录到 observability。
- `src/context/runtime/sessionBrief/` 把模型写出的 session memory 和可验证运行事实作为 Conversation continuity evidence 注入当前轮。
- `src/session/memoryAsset.ts` 把同一次保存里的 session memory 写到 `.kitty/memory/sessions/*.md`，使用 runtime memory 统一 metadata 头，作为可审阅文件资产。

记忆更新请求包含当前用户输入、assistant 可见结果、工具结果、checkpoint 和 session diff。模型按 `Current Focus`、`User Constraints`、`Decisions`、`Open Threads`、`Verification Facts`、`Reusable Lessons` 六个区块写记忆。`sessionBrief` 不从旧对话生成用户锚点或长文本首尾摘录；长任务连续性来自模型写出的 session memory，自然近场连续性来自 provider raw messages 里的可见对话。机器只附带可见 turn 计数、工具活动名称和更新时间这类死事实，并明确标注为 evidence，不把它们写成用户意图。

Runtime memory asset 由 `src/runtime/memory/metadata.ts` 统一解析 kind、title、scope、tags、updated 和 evidence refs；`src/runtime/memory/writer.ts` 统一创建 project/user/evidence asset；`src/runtime/memory/search.ts` 做多词候选召回，返回 score 和命中行，不把结果自动注入上下文。

Session workset 由 `src/session/workset.ts` 维护，随 session snapshot 保存。`read`、`edit`、`write` 成功后通过工具上下文记录文件读取和变更事实。`src/context/runtime/workingMemory/` 和 `src/runtime/status.ts` 只投影这份 workset，不另建第二套事实。

当前工作焦点和执行连续性由 `src/context/runtime/workingMemory/` 承接。

关键代码：

- `src/context/projectContext.ts`
- `src/context/runtime/`
- `src/context/runtime/conversationWindow.ts`
- `src/context/runtime/workingMemory/`
- `src/context/runtime/sessionBrief/`
- `src/context/runtime/compression/`
- `src/session/`
- `src/session/workset.ts`
- `src/session/memoryAsset.ts`
- `src/session/checkpoint/`

对应测试：

- `tests/context/`
- `tests/session/`

---

# 工具与扩展

工具层由 `src/tools/` 和 `src/extensions/` 组成。

`src/tools/` 管 core 工具和工具 runtime。

`src/extensions/` 管 extension 工具集合。

`src/protocol/` 管 extension 能力协议、package、port、governance 和收敛检查。

`src/host/toolRegistry.ts` 负责把 core 工具面和当前启用的六个 extension 工具集合装配成当前入口真实暴露给模型的工具面。

---

# Core 工具

Core 工具文件：

- `src/tools/read.ts`
- `src/tools/edit.ts`
- `src/tools/write.ts`
- `src/tools/bash.ts`

Core 工具名：

- `src/tools/index.ts`

工具 registry：

- `src/tools/registry.ts`
- `src/tools/core/registry.ts`
- `src/tools/core/runtimeRegistry.ts`

工具输出治理：

- `src/tools/outputGovernance/`

`bash` 工具执行后把完整原始输出写入可恢复路径，再把模型可见输出交给 output governance。治理层按输出类型分类，生成 test / build / typecheck / search / git diff / generic 的有界投影，并记录 raw chars、projected chars、raw tokens、projected tokens、saved tokens、savings ratio、truncated、output path 和 degraded reason。

这层只负责保存、压缩、投影和记录机器事实。不判断任务重要性，不替模型选择路线，不把搜索命中当成语义结论。

---

# Extension 注册

Extension 真相源：

- `src/extensions/definitions.ts`

这里集中维护：

- extension id
- 默认开关
- 用户可读说明
- 工具集合工厂
- capability 描述、适用场景和成本等级

当前 id：

- `todo`
- `worktree`
- `network`
- `background`
- `subagent`
- `skills`

当前默认开关：

- `todo`: 开
- `worktree`: 开
- `network`: 开
- `background`: 开
- `subagent`: 开
- `skills`: 开

Registry：

- `src/extensions/registry.ts`
- `src/config/extensions.ts`

`registry.ts` 只根据配置读取 definition 并创建工具集合。`config/extensions.ts` 只根据 definition 生成默认开关和读取启用 id。

共享状态工具：

- `src/extensions/shared.ts`

Extension 工具返回 JSON 时使用共享结果出口；单个扩展可以保留有语义的薄命名函数，但不重复实现 JSON 输出格式。

当前启用面就是这六个 extension，不再写七个或更少的过期说法。

---

# Extension 工具清单

## todo

- `todo_write`：写入当前会话 todo 列表，结果进入 session 和 working memory，并显示 checklist preview。

## worktree

- `worktree_create`：创建 git worktree，并记录 lifecycle state。
- `worktree_events`：读取最近 worktree lifecycle 事件。
- `worktree_get`：读取一个 worktree 事实。
- `worktree_keep`：标记或取消保留 worktree 路径。
- `worktree_list`：列出当前仓库 worktree。
- `worktree_remove`：删除 git worktree，并记录 lifecycle state。

## network

- `download_url`：只下载 HTTP(S) URL 到本地文件，并上报 changed path。
- `http_probe`：探测一个 HTTP endpoint 的状态、耗时和响应头。
- `http_request`：执行单个 HTTP 请求，支持 session 默认值和断言。
- `http_session`：集中管理 HTTP base URL、headers、query、cookies 和 token。
- `http_suite`：按顺序执行 HTTP 请求步骤和断言。
- `network_trace`：写入结构化网络证据 JSON，request 必须包含 method 和 url。
- `openapi_inspect`：读取 OpenAPI JSON 并列出 operations。
- `openapi_lint`：检查 OpenAPI JSON 的核心结构事实。

## background

- `background_run`：启动后台命令，写入 control-plane execution 账本，持续记录运行输出预览、摘要、last output 和 deadline，返回 execution id、pid、deadline 和状态。
- `background_check`：读取后台 execution 摘要，并 reconcile 已丢失的 running pid；输出 total、active、recent、health、deadline、last output 和 output preview。
- `background_read`：按 summary、tail 或 full 模式读取已记录后台输出。
- `background_wait`：等待指定后台 execution 完成或超时，返回最新 lifecycle、health 和 output preview。
- `background_stop`：停止指定后台 execution，终止其子进程树，并返回最终 lifecycle 事实。
- `background_terminate`：终止一个后台 execution 的子进程树，等待当前宿主进程内的后台 handle 释放，并把生命周期关闭为 aborted。

## subagent

- `subagent_launch`：启动聚焦 subagent execution，写入 objective、boundary、expected output、timeout/deadline 等派工事实，返回 execution id、actor、deadline 和状态。execution 默认带阻塞型 `waitPolicy`；lead 调用后会让出当前轮，由 host 等 execution 结束后唤醒 lead。等待期间，subagent 的 runtime UI event 会被复放到当前输出流。worker 最终可见回答写入 execution summary/output/changed paths。
- `subagent_check`：列出 subagent execution 摘要；输出 total、active、recent、health、派工边界、deadline 和 worker summary/output preview。
- `subagent_read`：按 summary、tail 或 full 模式读取已记录 subagent 输出。
- `subagent_cancel`：取消仍在运行的 subagent execution，终止其 worker 子进程树，关闭为 aborted 并发布 wake fact。

## skills

- `skill_list`：列出项目运行时 skill 的名称、说明和路径，不读取完整正文。
- `skill_load`：按精确名称读取一个 skill 的完整正文。模型决定是否加载；机器不做关键词匹配、语义路由或自动加载。使用事实记录到 observability 和 task lifecycle。
- `skill_read_resource`：按 skill 名称和资源路径读取该 skill 包声明的资源文件。资源只能来自该 skill 的资源索引。
- `skill_run_script`：按 skill 名称和资源路径运行该 skill 包声明的 `scripts/` 资源。它不是第二个 bash；只能执行 skill 资源索引里属于 `scripts/` 的文件，并记录命令输出事实、observability 事件和 task lifecycle 事实。
- `skill_check`：检查 skill frontmatter 里 `requires` 声明的命令依赖是否可用。它只检查声明事实，不替模型判断是否应该使用该 skill。

---

# Extension 能力协议

当前 extension 不直接变成新的运行核心。

Extension 先注册工具集合，再通过 capability package 暴露能力边界。

实现落点：

- `src/extensions/definitions.ts`：extension id、默认开关、说明、工具集合工厂和 capability 元数据的集中真相源。
- `src/extensions/registry.ts`：根据配置创建 extension 工具集合。
- `src/extensions/capabilities.ts`：读取 definition，把 enabled extension 转成正式 capability package。
- `src/protocol/`：capability、package、port、governance、diagnosis、manifest 协议。
- `tests/protocol/extension-capabilities.test.ts`：验证 extension capability package 和真实工具收敛。

协议事实：

- capability package 不允许机器自动选择策略。
- capability package 不允许自动派发。
- extension tool 只能执行声明的机器操作。
- lead agent 决定是否调用工具、何时调用工具、如何解释结果。
- 声明的 tools 必须和真实暴露的工具收敛。
- capability 描述、适用场景和成本等级不在 adapter 里分散维护。
- `background`、`subagent` extension 的 capability package 仍只暴露工具边界；执行生命周期事实归 `src/control/ledger.ts` 和 `src/execution/`。

---

# 宿主与验证

宿主边界：

- `src/host/`
- `src/interaction/`
- `src/shell/`
- `src/telegram/`
- `src/cli/`

运行展示：

- `src/runtime-ui/`

验证入口：

- `npm.cmd run verify`

测试目录：

- `tests/agent`
- `tests/cli`
- `tests/config`
- `tests/context`
- `tests/extensions`
- `tests/host`
- `tests/interaction`
- `tests/observability`
- `tests/project`
- `tests/provider`
- `tests/runtime-ui`
- `tests/session`
- `tests/shell`
- `tests/telegram`
- `tests/tools`
- `tests/types`
- `tests/utils`

---

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

---

# T05 Provider 与模型

Provider 层负责把 Kitty 的模型请求变成当前 provider 能接受的 wire request，并把返回、usage、cache、错误恢复成统一事实。

## 当前模块边界

- `src/provider/catalog.ts`：provider/model 固有事实。包括 provider id、label、transport、API kind、超时、model wire API、context/output 限制、reasoning、tool、cache 能力。
- `src/provider/capabilities.ts`：把 catalog 事实投影成请求期能力，不读取 `.env`。
- `src/provider/transport.ts`：根据 provider transport 和 base URL 生成 endpoint、headers 和 probe 入口。
- `src/provider/connection.ts`：doctor / production eval 的连接探测。它报告 provider、model、base URL 组合是否可用，不替用户猜配置。
- `src/provider/request.ts`：一次 provider 请求生命周期。它处理 stream/non-stream、abort、usage、cache facts 和错误归一。
- `src/provider/responsesAdapter.ts`：OpenAI Responses wire API 转换。
- `src/provider/chatCompletionsAdapter.ts`：Chat Completions wire API 转换。
- `src/provider/chatRequestBody.ts`：Chat Completions 请求体，包含 DeepSeek reasoning replay 这类 wire 要求。
- `src/provider/usageNormalizer.ts`：把 provider usage 字段归一成 runtime 可读事实。
- `src/provider/cachePolicy.ts`：把 provider/model cache 能力转成请求事实和 status 事实。

## Provider 与 Model 分离

Provider 管入口、认证、transport 和 API 风格。

Model 管 wire API、上下文限制、输出限制、reasoning、tool、cache 能力。

`resolveModelProfile` 必须同时解析 provider 和 model。未知 provider 或 provider 下没有该 model，直接报错，不做默认猜测。

## Relay 边界

YLS、TTAPI 这类中转站是 provider transport 的特殊事实，不污染标准 provider。

Relay provider 可以使用 Responses probe，而不是默认 `/models`。404 诊断必须提示同时检查 `KITTY_PROVIDER`、`KITTY_MODEL` 和 `KITTY_BASE_URL`，不能只怪 base URL。

## Reasoning Replay

DeepSeek thinking tool call 后续请求必须回传 `reasoning_content`。这个是 provider wire contract，不是 prompt 规则。

当前事实位置：

- `src/session/messages.ts` 决定哪些 assistant reasoning content 能进入后续请求。
- `src/provider/chatRequestBody.ts` 负责按 provider/model capabilities 生成请求体。
- `src/provider/chatCompletionsAdapter.ts` 负责保存 DeepSeek thinking tool call 的 replay 字段；如果本次 tool call 的 reasoning token 为 0，也必须保存空字符串，不能折叠成字段缺失。
- `src/context/runtime/compression/builder.ts` 构建 provider request 时必须携带 provider；只靠 model 无法判断 DeepSeek replay 规则。
- hard compression 可以删除普通 assistant reasoning content；不能删除带 tool call 的 assistant `reasoningContent`，否则下一轮 DeepSeek 请求会缺必需字段。
- `tests/provider/deepseek-replay.test.ts` 保护这个行为。

如果 DeepSeek assistant message 同时包含 tool call 和 thinking reasoning，后续所有请求都必须保留同一条 assistant message 的 `reasoning_content`。这个字段可以是空字符串；空字符串表示本次 tool call 没有可见 reasoning token，但 wire 字段仍然存在。

如果当前轮本地已发现 tool-call assistant message 缺失 `reasoningContent`，应在构建请求体前失败，不能发送一个必然 400 的请求。已经保存在 session 历史里的不可回放 tool batch 不能伪造 reasoning；context 层把它投影成普通 assistant 历史事实，并跳过对应 tool message，避免一条坏历史永久卡死后续对话。

## Usage 与 Cache

Provider usage 进入 observability 和 runtime status。

OpenAI cached tokens、DeepSeek cache hit/miss、stable prefix fingerprint 都是机器事实。它们只用于展示和验收，不替模型判断任务价值。

## 验收

- `tests/provider/model-catalog.test.ts`
- `tests/provider/connection.test.ts`
- `tests/provider/deepseek-replay.test.ts`
- `tests/provider/request-body-cache.test.ts`
- `tests/provider/usage-normalizer.test.ts`
- `tests/provider/cache-policy.test.ts`
- `kitty eval --run-production`，其中 `production-tool-turn` 使用真实 provider 跑一次工具调用闭环。

---

# T06 配置、初始化与诊断

Config 层负责让用户能明确配置 Kitty，并在配置错误时得到可修复诊断。

## 当前模块边界

- `src/config/envKeys.ts`：当前 `.kitty/.env` contract 的唯一 key 清单。
- `src/config/projectEnvTemplate.ts`：`kitty init` 写出的 `.env` / `.env.example` 模板。
- `src/config/providerPresets.ts`：可见 provider preset。它服务用户选择，不替 runtime 猜默认 provider。
- `src/config/schema.ts`：运行时 config 归一和必填校验。
- `src/config/runtime.ts`：从当前项目读取 `.kitty/.env` 并生成 `RuntimeConfig`。
- `src/config/preflight.ts`：不加载完整 runtime，也能检查 `.kitty` 文件、env key、provider/model catalog 和下一步动作。
- `src/cli/commands/init.ts`：创建本地 `.kitty` 模板。
- `src/cli/commands/doctor.ts`：先打印 preflight，再做 provider probe。

## 配置分类

`.env` 只放用户必须知道或经常修改的运行参数：

- provider、model、base URL、API key。
- thinking、reasoning effort、output token。
- 上下文预算、读取上限、项目文档上限。
- extension 开关。
- Telegram 配置。
- command stall timeout。

不进入 `.env`：

- UI 展示行数。
- 预览字符数。
- eval fixture 数字。
- 内部 list limit。
- provider/model 固有能力。

这些属于产品边界或 catalog 事实，用代码和测试保护。

## 初始化路径

用户路径：

1. `kitty init`
2. 填 `.kitty/.env`
3. `kitty doctor`
4. `kitty` / `kitty agent` / `kitty web`

如果 `.kitty` 不存在，doctor 只报告 bootstrap 路径，不假装 runtime ready。

## 失败诊断

配置错误要暴露可修复事实：

- 缺哪些 env key。
- provider/model 是否能在 catalog 解析。
- API key 是否存在。
- base URL 与 provider/model 是否匹配。
- provider probe 是 models 还是 responses。

缺失核心配置时直接报错，不做静默默认。

## 验收

- `tests/cli/program.test.ts`
- `tests/config/*.test.ts`
- `node dist/cli.js doctor`
- `kitty eval --run-production`

---

# T07 验收分层

Kitty 的测试和产品验收分两层。

## 日常确定性测试

入口：

- `npm.cmd test`
- `npm.cmd run verify`
- `npm.cmd run test:core`

职责：

- 类型检查。
- 构建。
- 本地单元和集成测试。
- 不访问真实 provider。
- 不消耗真实 API。
- 不运行 `tests/evaluation/`。

实现事实：

- `package.json` 的 `test:core` 通过 `scripts/run-core-tests.mjs` 枚举 `.test-build/tests/**/*.test.js`。
- `scripts/run-core-tests.mjs` 明确排除 `.test-build/tests/evaluation/`。

## eval harness 测试

入口：

- `npm.cmd run test:eval`

职责：

- 验证 eval 自身的场景列表、local suite、production suite 和 CLI 分层。
- 不承担普通日常测试。
- 不直接访问真实 provider。

## 本地产品验收

入口：

- `kitty eval --run-local`
- `npm.cmd run eval:local`

职责：

- 跑本地可验证产品场景。
- 使用 fixture、假 provider 或本地状态构造机器证据。
- 验证 runtime status、project map、memory、extension、skill、config、cache economy、tool output governance、host turn、remote entrypoints 和 recovery drills。
- npm 脚本只检查 `dist/cli.js` 是否存在，不主动 build，避免并行 eval 抢同一个 `dist`。

## 生产路径验收

入口：

- `kitty eval --run-production`
- `npm.cmd run eval:production`

职责：

- 必须由维护者显式执行。
- 使用当前项目 `.kitty/.env`。
- 可以访问真实 provider。
- 可以消耗真实 API。
- 验收当前配置、provider probe、隔离 session 真实多轮 turn、真实工具调用 turn 和真实项目 runtime status。
- npm 脚本只检查 `dist/cli.js` 是否存在，不主动 build，避免并行 eval 抢同一个 `dist`。

生产验收不能进入 `npm test` 或 `npm.cmd run verify`。

真实工具调用 turn 使用一个隔离 eval 工具验证 provider tool call、tool result 回传、最终 assistant answer 和 turn events。它用于发现 DeepSeek thinking tool call 这类只会在真实 provider wire contract 下暴露的问题。

---

# T08 TUI 与 Runtime UI

TUI 和 Web 都是壳。它们不拥有第二套 agent 状态，只呈现 session、event、runtime status 和 turn display 的同一事实。

`kitty` 裸启动默认进入 TUI。`kitty tui` 是同一入口的显式命令，`kitty agent` 保留文字版交互。

## 当前模块边界

- `src/shell/tui/`：Ink TUI 壳。负责 session picker、transcript、composer、runtime dock、键盘鼠标输入和清理生命周期。
- `src/cli/commands/tuiMode.ts`：TUI 启动边界。`kitty` 和 `kitty tui` 共用它，不各自复制启动逻辑。
- `src/runtime-ui/`：跨宿主复用的运行时展示事实。负责 todo、工具状态、turn display 的文本投影。
- `src/host/`：所有宿主进入 agent 的共同 turn 边界。
- `src/session/`：对话和事件事实。
- `src/runtime/status.ts`：读取结构化运行事实。
- `src/runtime/scene.ts`：统一自然现场投影。CLI、TUI 和未来 UI 读取它，不各自重算 execution、memory、skill、cost 的语义。
- `src/observability/terminalLog.ts`：terminal log 投影。它记录用户提交、assistant/reasoning 可读块、status、tool call/result/error 边界；fallback 渲染必须携带工具参数，不能把 `read/edit/write` 这类工具退化成 `(missing path)`。
- `src/web/`：Web 壳，复用 host 主链路和 runtime events。

## TUI 职责

TUI 负责：

- 启动时选择 session 或新建 session。
- 展示用户、assistant、reasoning、tool fact。
- 把 terminal log 写成可审阅现场，而不是一字符一字符的 stream delta。
- 处理滚动、resize、输入、鼠标滚轮。
- 显示当前后台、subagent、context、工具运行现场。
- 在退出和中断时释放输入、渲染和 turn 生命周期资源。

TUI 不负责：

- 判断任务目标。
- 维护第二套 execution 状态。
- 语义总结历史。
- 直接操作 provider。

## 渲染边界

Transcript layout 统一处理 wrapping、markdown display facts、宽字符、底部贴合和滚动窗口。Composer layout 统一处理输入框显示行、光标坐标和中文宽度。

不要在组件里各自计算一套宽度和滚动，否则会复发光标错位和长回复显示不全。

## Runtime Dock

底部现场只展示当前正在发生的事。它不新建 execution 状态，只把 runtime-ui event、session event 和 runtime status 投影成 TUI activity。

- 当前 activity：工具、命令、subagent、后台等待或模型状态。
- 当前 activity 的状态、运行时长、是否阻塞 lead。
- background / subagent 是否在跑。
- context 占用。
- 总结中、标题生成中等 turn lifecycle 状态。

中文化只用于少量状态提醒，例如“正在运行”“已运行”“失败”“空闲”“阻塞 lead”。命令、路径、工具名、execution id 保持原文，不翻译。没有 activity 时底栏仍保持两行信息结构。

没有事实时不制造 background/subagent 假状态；需要稳定布局时显示短的 idle 行。运行时长和 running spinner 只在 TUI 组件内按 activity startedAt 或本地 animation frame 派生，不写回 session、control-plane 或 controller 状态。idle 和 waiting 不做点状 pulse 动画。

subagent 阻塞 lead 时，当前输出流必须切到 subagent channel，显示 subagent 的工具、思考和回答；subagent settled 后再切回 lead。旁路 status/CLI 审阅不能替代这个实时可见性。

空 transcript 保持空白第一屏，不显示欢迎文案或快捷键教程；已有 session 继续走 session picker。用户发送后的 transcript 消息保持单行紧凑高度，使用低对比整行背景，与输入框区域保持一致的视觉语言。

用户输入、reasoning 和 assistant 正文必须使用同一个 transcript 内容起点；role 可以有不同 gutter 和颜色，但不能让正文列互相错位。

Reasoning/thinking 是低强调信息；正文和左侧 gutter 使用同一暗金色系，不使用用户输入的亮金强调边。

底部 footer 不额外画顶部分隔线；Transcript 和 footer 之间保留一行空白间隔，依靠留白和背景层级区分区域，避免在运行状态和输入框之间出现抢眼横线或压迫感。

TUI 主题使用黑色/黑灰色作为区域底色，浅金色只用于文字、光标和强调信息；不要把大面积区域铺成棕金色。

## 验收

- `tests/tui/*.test.ts`
- `tests/web/*.test.ts`
- `tests/host/*.test.ts`
- 交互手动验收：长 markdown、长工具输出、窗口 resize、滚动、中文输入、Ctrl+C。

---

# 职责审查

单一职责看变化原因，不看行数。

超过 300 行必须触发审查，但不是自动拆分理由。

## 当前结论

### `src/evaluation/checks.ts`

职责：本地 eval scenario 清单、local check 分发和 local fixture 验收。

不负责：production provider 实战、CLI 参数解析、test runner。

当前结论：需要拆。它已经同时包含 scenario 数据、runner、fixture 和多类检查实现，变化原因过多。本轮优先保证 production eval 厚度；后续再按 check domain 拆成 local checks 目录。

### `src/shell/tui/transcriptLayout.ts`

职责：TUI transcript 的可见行投影、宽度计算、滚动窗口和 markdown display facts。

不负责：Ink 组件渲染、session 存储、provider 请求。

当前结论：暂不拆。它的变化原因集中在“transcript 可见布局”。拆散会增加宽度模型分裂风险。触发拆分条件：markdown block layout、scroll projection、cache 三者任一继续独立膨胀。

### `src/context/runtime/compression/builder.ts`

职责：把 prompt layers 和 session messages 变成 provider request，并产出 context budget/cache layout facts。

不负责：provider 请求、session memory 写入、project map 生成。

当前结论：暂不拆。它维护的是同一个上下文预算算法。触发拆分条件：reasoning replay、tool output compaction、budget report 任一开始独立变化。

### `src/session/snapshot.ts`

职责：session snapshot 的 parse、normalize、serialize 和迁入当前 schema 的正向校验。

不负责：session store 文件读写、memory asset 投影。

当前结论：暂不拆。变化原因集中在 session schema。触发拆分条件：schema validation 和 normalization 开始需要不同测试矩阵。

### `src/provider/responsesAdapter.ts`

职责：OpenAI Responses API wire conversion。

不负责：Chat Completions、catalog、transport、retry。

当前结论：暂不拆。它是单一 wire adapter。触发拆分条件：stream parser、request builder、response mapper 继续扩展到需要独立测试 fixture。

### `src/host/turn.ts`

职责：宿主层一次 turn 的生命周期边界，包括 start/finish events、tool registry 生命周期、lead wait wake 和错误收口。

不负责：agent loop 内部策略、provider 请求、UI 渲染。

当前结论：暂不拆。当前复杂度来自同一 host lifecycle。触发拆分条件：lead wait closeout 或 event recording 继续独立变化。

### `src/protocol/manifest.ts`

职责：当前能力 manifest 的结构化描述。

不负责：执行工具、加载 extension、运行 skill。

当前结论：暂不拆。它是协议事实聚合。触发拆分条件：manifest schema、rendering、registry adapter 出现独立发布边界。

### `src/telegram/service.ts`

职责：Telegram polling/service lifecycle。

不负责：agent turn 实现、message chunking、file download 细节。

当前结论：暂不拆。它承担一个 host service 的生命周期。触发拆分条件：polling、delivery、session binding 任一继续加厚。

---

# 与用户审阅映射

| 技术实现事实 | 用户审阅事实 |
| --- | --- |
| `src/agent/` | Agent 驱动一轮一轮模型工作 |
| `src/context/` | Context 决定模型当前看到什么 |
| `src/session/` | Session 保存连续性、checkpoint 和任务现场 |
| `src/provider/`、`src/config/` | Provider / Config 连接模型并归一化配置 |
| `src/provider/` | Provider / Model 分离，relay 中转、reasoning replay、usage/cache 都是 wire contract |
| `src/config/`、`src/cli/commands/init.ts`、`src/cli/commands/doctor.ts` | init / doctor 暴露可修复配置事实 |
| `src/tools/` | Core 工具是模型的基础手脚 |
| `src/extensions/`、`src/skills/` | Extension 是可启用、可禁用的工具集合，skills 是运行时方法包 |
| `src/host/` | Host 是产品面进入 agent 的共同边界 |
| `src/runtime-ui/` | Runtime UI 展示运行时事件 |
| `src/shell/tui/`、`src/runtime-ui/`、`src/web/` | TUI/Web 是 UI 壳，复用同一 runtime/session/event 主事实 |
| `src/observability/` | Observability 记录事实，不替模型判断 |
| `tests/` | 测试保护当前架构的正向事实 |
| `src/evaluation/`、`tests/evaluation/` | eval 是独立产品验收，不进入普通 `npm test` |
| 职责审查 | 超过 300 行的核心文件按职责和变化原因审查，不按行数机械拆 |

