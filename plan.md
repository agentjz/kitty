# 小猫智能体成熟化计划

## 判断

成熟的 agent 不是一个更大的聊天机器人，也不是一个工具集合。

成熟的 agent 是一个能长期接住用户目标的本地工作台：用户交代目标后，它能理解当前任务，组织上下文，调用工具，沉淀记忆，启动后台工作，派出协作者，等待结果，恢复现场，验证交付，并把证据留在用户可审阅的位置。

小猫智能体当前已经有骨架：agent 主循环、context、session、core tools、extensions、control plane、spec、skills、memory asset、CLI、Telegram 和测试结构都在。问题不是从零开始，而是把这些能力做成稳定、厚实、自然的产品体验。

## Research 结论

### 历史演进

历史里有三个明显阶段。

第一阶段是超重阶段。很多能力都存在，但职责挤在 agent、capability、runtime、tool preview、protocol 等局部里。它证明了项目曾经有足够厚的能力想象，也暴露了过度集中、协议过重、观测过重、文件职责混杂的问题。

第二阶段是极简阶段。核心被压到很轻，四个 core tools 的边界变清楚了，但 extension、network、spec、todo、worktree、team、subagent、background、测试厚度和用户体验也被一起削薄。它证明了“瘦核心”是对的，也证明了“只剩核心”是不够的。

第三阶段是恢复阶段。成熟方向逐渐变清楚：核心保持瘦，能力放进 extension；状态落到 control plane；spec 变成独立工作流；session memory 由模型写；memory 同步投影成可审阅资产；lead-wait 由 execution policy 驱动，而不是由工具名硬猜。

结论：不能回到超重，也不能停在极简。正确方向是“瘦主循环，厚运行环境”。

### 当前事实

当前已经具备这些基础：

- 一个 agent 主循环负责模型请求、工具批次、恢复、收口和记忆更新。
- Context 只决定当前模型看到什么，不把 raw history 直接回灌。
- Session 保存连续性，session memory 由模型根据事实写出。
- Core tools 保持四个：`read`、`edit`、`write`、`bash`。
- Extension 已恢复为 `todo`、`worktree`、`network`、`background`、`subagent`、`team`、`skills`、`spec`。
- Control plane 用 SQLite 记录 execution、team、pid、状态、wait policy 和 wake facts。
- Spec 已经有 requirements、design、tasks、notes、checkpoint 和隔离 worktree。
- Skills 已经能发现、索引、加载正文和读取资源。
- 测试覆盖了 core tools、extensions、spec、session、context、execution、host、interaction、telegram 等主要入口。

当前仍然不够成熟的地方：

- Memory 还是“会写会保存”，但用户还没有清晰的记忆资产浏览、整理、复用和长期沉淀体验。
- Skill 还是“能加载文档和资源”，但还没有完整的能力包体验：脚本执行、示例、依赖、版本、安装、可审阅边界都不够厚。
- Runtime 还是“有状态目录和账本”，但用户看不见完整现场：正在跑什么、谁在等什么、哪些结果可恢复、哪些资产被沉淀。
- Subagent 和 team 已能启动和回传，但还不像真实协作：缺少清晰分工、结果合并、失败重派、队伍状态和 lead synthesis。
- Background 已有生命周期，但用户体验还应更像长任务现场，而不是几条工具记录。
- Spec 工作流有骨架，但还要更像真正的需求、设计、任务、实现、验证体验，而不是工具操作集合。
- 测试数量已恢复一部分，但还缺长任务、打断、恢复、协作、记忆沉淀这类真实产品行为的组合测试。

### 外部参考

当前主流 agent 方向给出的共同结论是：

- Prompt 应稳定，动态内容应渐进式加载。
- Planning 应变成可执行的长程任务组织，而不是提示词里的口号。
- Memory 应从 raw history 走向结构化压缩和文件化资产。
- Tools 应优先利用 CLI、脚本和本地环境能力，不为每个动作发明复杂 API。
- Workflow 应从刚性流程转为 skill、script、spec 和少量确定性主干的混合体验。
- Environment 应成为有状态运行时，而不是无状态工具调用。

这和小猫当前方向一致：机器负责事实、模型负责判断；主干维护事实，边缘负责呈现。

## 成熟体验

一个成熟的小猫智能体，用户感受到的应该是这些。

### 1. 不失忆

用户不用反复解释刚确认过的目标、限制、路线和下一步。小猫能记住同一个 session 的关键脉络，也能避免把很久以前的目标误当成当前目标。

好的体验不是把全部历史塞回模型，而是让模型看到当前任务需要的记忆：当前用户输入、session memory、working memory、运行事实和必要项目上下文。

### 2. 不乱跑

用户说一个目标，小猫能先判断边界，再选择工具。它不会因为看到旧日志、wake signal、checkpoint、工具输出，就把内部事实当成用户新要求。

内部事件是证据，不是用户意图。

### 3. 能继续

长任务被打断、退出、后台执行、subagent 运行、team 执行后，小猫能恢复现场。用户回来时，不应该面对一堆技术状态，而应该看到：做到了哪里，谁还在跑，结果是什么，下一步是什么。

### 4. 会沉淀

一次任务结束后，重要经验应该沉淀成可审阅资产：session memory、spec、skill、notes、测试、变更记录。沉淀不是自动写一堆废话，而是让未来任务更快、更准、更少返工。

### 5. 会协作

Subagent 不是装饰。Team 也不是工具名。成熟体验应该是 lead 能把明确边界的工作派出去，自己让出控制，等待结果，再综合结论继续推进。

用户看到的是“我让一队 agent 干活”，不是“我调用了几个状态查询工具”。

### 6. 能验证

小猫不是只给解释。它应该尽量运行能证明结果的命令、测试、检查或真实操作，并把验证结果作为交付的一部分。

验证不是机器强迫模型走流程，而是模型根据任务判断什么证据足以交付。

## 核心模块标准

### Agent Loop

Agent loop 只做编排。

它负责接收输入、构建上下文、请求模型、执行工具、处理恢复、收口记忆和返回结果。它不承载业务生态，不写死工具列表，不替模型做语义判断。

成熟标准：

- 主循环短而稳定。
- 生命周期清楚。
- 每轮收口能更新 session memory。
- 工具批次、provider 恢复、lead-wait、toolless turn 都有明确边界。

### Context

Context 负责模型当前看到什么。

成熟标准：

- 当前用户输入是当前轮中心。
- 同 session 连续性来自 session memory 和 working memory。
- 历史工具结果、checkpoint、observability 只在需要时作为证据进入。
- 内部 wake、后台状态、execution 结果不能伪装成用户新输入。
- 压缩由模型总结关键事实，机器只提供事实边界和存储。

### Session / Memory

Session 负责连续性，Memory 负责沉淀。

成熟标准：

- session record 是运行状态入口。
- session memory 是模型写出的连续性摘要。
- memory asset 是可审阅文件投影。
- working memory 保存当前目标执行事实。
- checkpoint 用于恢复和取证，不把旧目标拖回当前轮。
- 用户能浏览、搜索、整理、删除和复用记忆资产。

### Tools

Tools 分两层。

Core tools 是基础编程闭环：`read`、`edit`、`write`、`bash`。

Extension tools 是可插拔能力包：`todo`、`worktree`、`network`、`background`、`subagent`、`team`、`skills`、`spec`。

成熟标准：

- 工具面来自注册表和当前运行配置。
- 不在 prompt、测试、文档里维护第二套工具事实。
- 机器只执行工具和返回证据。
- 模型决定何时使用工具。
- Extension 能独立启用、禁用、测试和演进。

### Skills

Skill 应该是能力包，不只是提示词片段。

成熟标准：

- `SKILL.md` 描述方法、边界、使用时机。
- `references/` 放知识资料。
- `scripts/` 放可执行脚本。
- `examples/` 放示例。
- `assets/` 放素材。
- 上下文默认只出现 skill 索引。
- 模型自己判断是否加载 skill。
- 需要脚本时，脚本作为 skill 资源被执行或引用，而不是把所有细节塞进 prompt。

### Spec

Spec 是计划工作流，不是普通文档目录。

成熟标准：

- requirements 负责用户目标和验收口径。
- design 负责结构和取舍。
- tasks 负责执行路径。
- notes 负责过程事实和用户确认。
- implement 前必须有清楚的计划资产。
- validate 阶段必须回到验收口径。
- spec 可以使用隔离 worktree 和 checkpoint。
- spec 模式和默认 agent 模式隔离，但共享同一个核心运行时。

### Runtime

Runtime 是小猫的本地工作环境。

成熟标准：

- `.kitty/` 是运行现场，不是垃圾桶。
- `.kitty/.env` 是配置事实入口。
- `.kitty/control-plane.sqlite` 是 execution 和协作账本。
- `.kitty/memory/` 是记忆资产。
- `.kitty/sessions/` 是会话记录。
- `.kitty/observability/` 是证据记录。
- 用户可以看到 runtime status：当前 session、执行、后台任务、team、memory、spec、最近验证和异常。

### Background

Background 是长任务现场。

成熟标准：

- 启动后有 execution record。
- 可以检查状态、输出、退出码和摘要。
- 可以终止。
- 进程退出或宿主重启后能 reconcile。
- lead 不靠猜测判断后台状态，而是读取账本事实。

### Subagent / Team

Subagent 和 team 是真实协作体验。

成熟标准：

- lead 能派发边界清楚的任务。
- blocking execution 让 lead 暂停当前轮。
- worker 完成后写回 summary/output。
- wake 只作为内部事实进入，不污染用户输入。
- lead 恢复后综合结果继续推进。
- team 有成员状态、inbox、消息和最终 synthesis。
- 失败能被看见，并支持重派或收束。

### Observability

Observability 是记录仪。

成熟标准：

- 记录事件、终端日志、崩溃、工具事实和执行状态。
- 服务排查、复盘和恢复。
- 不替模型做决策。
- 不把可观测性做成产品主线。

### Tests

测试保护真实体验。

成熟标准：

- 单元测试保护模块边界。
- 集成测试保护 agent 主链路。
- 生命周期测试保护打断、退出、后台、wake、恢复。
- 长任务测试保护 memory、spec、team、verification 的组合体验。
- 测试不写口号，不测试偏好，不测试某句 prompt 必须出现。

## 改造方向

### 第一件事：把 Runtime 做成用户能理解的环境

新增或补强 runtime status 体验。

用户应该能一眼看到：

- 当前 session 是什么。
- 最近目标是什么。
- memory 资产在哪里。
- 有哪些 background、subagent、team execution。
- 谁在运行，谁已完成，谁失败。
- 哪些 wake facts 等待 lead 消化。
- 当前 spec 是否存在，处于哪个阶段。

这不是为了做 dashboard，而是为了让“能继续”变成用户可感知能力。

### 第二件事：把 Memory 做成资产

当前 memory asset 已经有入口，下一步要做成完整体验。

应该补齐：

- memory 列表。
- memory 读取。
- memory 搜索。
- memory 清理。
- memory 和 session 的关系展示。
- 任务结束后把可复用经验沉淀为 skill 或 spec notes 的路径。

Memory 的目标不是存更多，而是让长期任务少失忆、少重复、少跑偏。

### 第三件事：把 Skill 做成包

Skill 不应停留在 Markdown 加载。

应该补齐：

- skill package schema。
- resource 类型识别。
- scripts 执行入口。
- skill 示例读取。
- skill 依赖和环境检查。
- skill 安装或复制路径。
- skill 使用后的证据记录。

模型读 skill 决定路线，机器执行 script 和记录事实。

### 第四件事：把 Subagent / Team 做成协作

当前已有执行和等待基础，下一步要补体验厚度。

应该补齐：

- lead 派工时的任务边界记录。
- worker 结果结构化回传。
- team 成员 idle/running/done/failed 的清楚状态。
- lead wake 后的 synthesis 规范。
- 失败、超时、用户中断后的收束策略。
- team 级最终报告。

重点不是增加更多 team 工具，而是让用户看到“协作完成了什么”。

### 第五件事：把 Spec 做成高质量计划工作流

Spec 应该像产品经理和架构师协作，而不是像文件编辑器。

应该补齐：

- requirements、design、tasks、notes 的用户可读体验。
- 每阶段用户确认和变更记录。
- implement 前后的 diff、测试、验证映射。
- spec checkpoint 的恢复体验。
- spec 与 memory、skill 的沉淀关系。

Spec 不是默认模式的负担。它是需要时开启的深工作流。

### 第六件事：把 Background 做成可恢复长任务

Background 应该支持真实长任务。

应该补齐：

- 输出摘要更新。
- 卡住检测。
- 用户可见状态。
- 终止与清理。
- host 重启后的 reconcile。
- 完成后进入 lead wake facts。

### 第七件事：补长任务产品测试

需要增加组合测试，而不是只测单个函数。

重点测试：

- 用户中断后恢复 session。
- subagent 完成后 lead 恢复且不把 wake 当用户输入。
- team 多成员完成后 lead synthesis。
- background 运行、完成、终止、reconcile。
- spec 从 requirements 到 validate 的完整闭环。
- memory asset 在 turn 收口后可审阅。
- skill 只索引、不自动全文注入，按模型选择加载。

## 不做什么

- 不把企业安全沙箱当主线。
- 不为了工具多而堆工具。
- 不为了核心瘦而删除真实体验。
- 不把语义判断交给正则、关键词或机器分支。
- 不把用户话术直接写进提示词。
- 不做假兼容。
- 不在 prompt、文档、测试和源码里维护多套事实。
- 不把 observability 做成决策层。
- 不把历史提交当标准答案。
- 不把当前实现当标准答案。

## 一次性重构原则

这份计划不是分期路线图。

执行时必须把它当作一次完整重构的验收清单：先全局 research，再统一设计边界，然后一次性改完核心链路，最后用整体测试和真实交互收口。

允许按依赖顺序施工，不允许按局部完成度交付。

不能只做 Runtime，不做 Memory。

不能只做 Skill，不做 Runtime。

不能只做 Subagent，不做 lead-wait 和 wake。

不能只做 Spec，不做验证闭环。

不能只做代码，不同步 spec、README、AGENTS、测试。

每个模块都要同时满足四件事：

- 用户体验说得通。
- 源码职责说得清。
- 状态事实只有一处。
- 测试能保护真实行为。

## 最终形态

小猫智能体最终应该长成这样：

用户给出目标。

小猫先理解边界，再组织上下文。

简单任务直接用 core tools 完成。

复杂任务写 todo。

需要计划时进入 spec。

需要能力时加载 skill。

需要查外部时用 network。

需要隔离改动时用 worktree。

需要长跑时开 background。

需要并行时派 subagent 或 team。

执行过程写入 control plane。

关键经验沉淀进 memory asset。

完成后用验证证据收口。

下次回来，用户不用重新解释一切。

这就是成熟 agent 的体验：不是更会聊天，而是更能把真实任务从开始带到完成。

## 一次性重构 Checklist

使用方式：

- 开工前先完整勾勒当前事实和历史证据。
- 开工后按依赖顺序施工，但所有大项都必须在同一次重构中收口。
- 任一大项没完成，都不能认为这次成熟化完成。
- 任一模块出现双事实源、提示词硬塞、正则语义判断、假兼容或空壳，都必须返工。

### 0. 全局 Research 闸门

- [ ] 读取当前 `AGENTS.md`、README、核心 spec、源码、测试、`.kitty/.env*` 和 git 状态。
- [ ] 对比历史超重阶段、极简阶段、成熟恢复阶段，写清每个阶段解决了什么、丢了什么、带来什么坏逻辑。
- [ ] 画出当前核心链路：用户输入 -> session -> context -> model -> tools -> execution/control plane -> host -> memory -> output。
- [ ] 找出所有双事实源：工具列表、扩展开关、配置默认值、runtime 状态、spec 状态、execution 状态、memory 状态。
- [ ] 找出所有超重文件：职责混合、变化原因混杂、状态读写和展示混在一起的文件。
- [ ] 找出所有薄体验：代码有工具，但用户感受不到完整能力的地方。
- [ ] 确认本次重构边界：要重建什么、删除什么、保留什么、不碰什么。

### 1. 架构总线

- [ ] Agent loop 只保留编排职责：输入、上下文、模型、工具批次、恢复、收口、记忆更新。
- [ ] Context 只负责模型当前看到什么，不负责保存历史、不负责决策、不负责工具生命周期。
- [ ] Session 只负责连续性和运行状态入口。
- [ ] Control plane 只负责 execution/team/background/wake 的机器事实。
- [ ] Extensions 只负责工具集合和能力注册。
- [ ] Skills 只负责能力包发现、加载、资源读取和脚本入口。
- [ ] Spec 只负责计划工作流和计划资产。
- [ ] Observability 只负责记录证据。
- [ ] 每个核心文件能一句话说清负责什么、不负责什么。
- [ ] 删除或拆分职责混杂文件，不做原地缝补。

### 2. Runtime 环境

- [ ] 统一 `.kitty/` 目录职责：配置、sessions、memory、control plane、observability、spec、临时运行状态。
- [ ] 确认 `.kitty/.env`、`.kitty/.env.example`、模板和配置读取完全一致。
- [ ] 删除过时配置、空壳配置和未使用配置。
- [ ] 建立 runtime status 入口，让用户看到 session、memory、execution、background、subagent、team、spec、异常和最近验证。
- [ ] runtime status 只读取事实，不做语义判断。
- [ ] runtime status 输出要像用户现场，不像数据库 dump。
- [ ] 增加 runtime status 测试。

### Memory

- [ ] session memory 仍由模型根据事实写出。
- [ ] 机器只提供当前用户输入、assistant 可见结果、工具事实、checkpoint 和 session diff。
- [ ] 当前轮只直接携带当前用户输入；历史通过 session memory、working memory 和必要事实进入。
- [ ] 内部 wake 不作为用户输入进入长期记忆。
- [ ] checkpoint 用于恢复和取证，不把旧目标拖回当前轮。
- [ ] memory asset 成为可审阅资产，不只是隐藏状态。
- [ ] 增加 memory 列表、读取、搜索、清理能力。
- [ ] 展示 memory asset 与 session record 的关系。
- [ ] 建立从 memory 到 skill/spec notes 的沉淀路径。
- [ ] 增加 memory asset 行为测试，保护“同一次保存同时更新 session record 和可审阅文件”。

### Skills

- [ ] 明确 runtime skill package schema：`SKILL.md`、`references/`、`scripts/`、`examples/`、`assets/`。
- [ ] `.codex/skills/**` 只属于 Codex 开发规范，不进入小猫 runtime skill。
- [ ] 保持默认上下文只展示 skill 索引，不自动注入全文。
- [ ] 补 skill resource 类型识别。
- [ ] 补 skill script 执行入口。
- [ ] 补 skill 示例读取体验。
- [ ] 补 skill 依赖和环境检查。
- [ ] 记录 skill 使用证据：加载了什么、读了什么资源、执行了什么脚本。
- [ ] skill 加载由模型判断，机器只列出、读取、执行和记录事实。
- [ ] 增加 skill package 行为测试。

### Tools / Extensions

- [ ] 工具面只来自注册表和运行配置。
- [ ] README、spec、prompt、tests 不维护第二套工具事实。
- [ ] Core tools 只保留 `read`、`edit`、`write`、`bash`。
- [ ] Extension tools 保留 `todo`、`worktree`、`network`、`background`、`subagent`、`team`、`skills`、`spec`。
- [ ] 默认 agent 打开除 spec 外的可用 extension；spec 通过 spec 工作流隔离启用。
- [ ] 检查 network 是否仍是完整集合：HTTP session、request、probe、suite、download、trace、OpenAPI。
- [ ] 检查 worktree 是否保留创建、查看、保留、删除、事件能力。
- [ ] 检查 todo 是否是会话级 todo_write，而不是拆成不必要 CRUD。
- [ ] 每个 extension 可独立启用、禁用、测试和演进。
- [ ] 增加 extension registry 与真实工具面的同步测试。

### Background

- [ ] 补后台输出摘要更新。
- [ ] 补后台卡住检测或长时间无输出提示。
- [ ] 补后台终止后的状态收束。
- [ ] 补 host 重启后的 background reconcile。
- [ ] 补 background 完成后进入 lead wake facts 的体验。
- [ ] 增加 background 长任务生命周期测试。

### Subagent / Team

- [ ] 明确 lead 派工记录：目标、边界、输入、期望输出。
- [ ] 明确 worker 结果结构：summary、output、status、error、changed paths。
- [ ] blocking execution 必须让 lead 让出当前轮，不做 lead 自己轮询表演。
- [ ] lead-wait 读取 execution waitPolicy，不按工具名硬猜。
- [ ] wake facts 是内部事实，不污染用户输入和长期记忆。
- [ ] 补 team 成员状态：idle、running、done、failed。
- [ ] 补 team inbox 的用户可理解展示。
- [ ] 补 lead wake 后的 synthesis 行为。
- [ ] 补失败、超时、用户中断后的收束策略。
- [ ] 增加 subagent/team 真实协作测试。

### Spec

- [ ] 打磨 requirements 用户体验：目标、范围、验收口径。
- [ ] 打磨 design 用户体验：结构、取舍、边界、风险。
- [ ] 打磨 tasks 用户体验：可执行步骤、验证方式、完成状态。
- [ ] 打磨 notes 用户体验：过程事实、用户确认、关键变更。
- [ ] 补 implement 前后的 diff、测试、验证映射。
- [ ] 补 spec checkpoint 恢复体验。
- [ ] 补 spec 与 memory、skill 的沉淀关系。
- [ ] spec 模式与默认 agent 模式隔离，但共享核心运行时。
- [ ] spec 工具、文档、状态、checkpoint、worktree 必须讲同一个事实。
- [ ] 增加 requirements -> design -> tasks -> implement -> validate 完整链路测试。

### Context / Wake / Recovery

- [ ] 检查 wake facts 进入模型的路径。
- [ ] 检查 wake facts 是否被 session store、memory compaction、checkpoint、observability 正确区分。
- [ ] 检查 provider recoverable failure 是否保存为恢复事实，而不是污染用户目标。
- [ ] 检查 exit、stop、abort、process kill 后的状态收束。
- [ ] 补长任务恢复测试：中断、退出、重新启动后，session 能继续。
- [ ] 补 lead-wait 组合测试：subagent/team 完成后 lead 恢复，并基于 execution facts 继续。

### Tests

- [ ] 先按目标测试结构补失败测试，再写实现。
- [ ] 补 agent 主链路集成测试。
- [ ] 补 context/session/memory 组合测试。
- [ ] 补 interruption/exit/recover 生命周期测试。
- [ ] 补 background/subagent/team/spec 的长任务组合测试。
- [ ] 补 skill package 资源和脚本测试。
- [ ] 补 runtime status 产品行为测试。
- [ ] 补工具注册表、extension 开关、spec 模式工具面的同步测试。
- [ ] 检查现有测试是否在测口号、偏好或固定 prompt 文案；有则改成行为测试。

### 文档同步

- [ ] 同步 README 当前能力和真实命令。
- [ ] 同步 `spec/用户审阅` 当前体验事实。
- [ ] 同步 `spec/技术实现` 当前模块边界。
- [ ] 同步 `AGENTS.md` 与实际运行规则。
- [ ] 同步 `.codex/skills/kitty-agent-development/SKILL.md` 与开发工作流。
- [ ] 删除过时文档、空壳文档和不存在能力描述。
- [ ] 确认文档、代码、测试讲同一个当前事实。

### 整体验收

- [ ] 运行类型检查。
- [ ] 运行构建。
- [ ] 运行测试。
- [ ] 运行完整验证命令。
- [ ] 用真实交互试跑默认 agent。
- [ ] 用真实交互试跑 spec 工作流。
- [ ] 用真实交互试跑 background。
- [ ] 用真实交互试跑 subagent。
- [ ] 用真实交互试跑 team。
- [ ] 用真实交互试跑 skill 加载和资源读取。
- [ ] 用真实交互试跑 memory 查看和复用。
- [ ] 检查 `.kitty/` 运行产物是否可理解、可恢复、可清理。
- [ ] 最后全局扫描一次坏逻辑：双事实源、提示词硬塞、正则语义判断、假兼容、空壳、职责混杂、文档漂移。
