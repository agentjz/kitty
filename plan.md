# 小猫智能体全局成熟化计划

## 总判断

小猫智能体现在不是缺少能力，而是缺少一条统一的任务生命周期主干。

已有能力包括 agent loop、context、session memory、core tools、extension tools、spec、skills、background、subagent、team、worktree、network、runtime status、Telegram、observability 和测试。问题是这些能力还没有围绕同一个用户体验闭环稳定协作。

成熟形态不是把外部项目拼贴进来，也不是让模型对每句话都进入大工程模式。

成熟形态是：

用户给出目标。模型判断任务边界。机器保存事实。简单任务直接回答。普通任务局部执行。复杂任务进入计划。长任务进入后台或协作。等待有边界。中断能恢复。记忆不失真。状态可审阅。交付有证据。

核心原则：

- 瘦 agent loop。
- 厚 runtime。
- 模型做活判断。
- 机器做死事实。
- 状态事实只有一处。
- 工具面来自注册表。
- 上下文服务当前轮。
- 历史留作证据。
- memory 负责连续性和沉淀。
- background、subagent、team 必须可见、可恢复、可终止。

## 不做什么

- 不复制 Codex、Goose、LangGraph、OpenHands、Letta 的外壳。
- 不用关键词、正则、机器分支判断用户意图。
- 不把用户一句话直接写进 prompt。
- 不让简单输入触发全局工程。
- 不让 lead 因后台、subagent 或 team 永久卡死。
- 不把 wake、checkpoint、execution 状态伪装成用户新目标。
- 不把 observability 做成决策层。
- 不在 prompt、spec、tests、registry、config 里维护多套工具事实。
- 不保留空壳兼容层。
- 不靠“看起来有字段”冒充生命周期闭环。

## 外部参考的正确用法

只取原则，不抄实现。

Codex 参考：

- thread / rollout / interrupt / background cleanup / dynamic tools / compaction 边界。
- 取其“运行时事实清楚、恢复路径清楚”，不复制 Rust 结构和完整协议复杂度。

Goose 参考：

- agent-visible 与 user-visible 分层。
- cancel token、session manager、extension/source/skill 思路。
- 取其“可见性和取消边界”，不复制 MCP 重生态。

LangGraph 参考：

- thread、run、checkpoint、interrupt 的状态分离。
- 取其“状态机和恢复边界”，不把 Kitty 改成 graph 框架。

OpenHands 参考：

- 长任务现场、start task、pause/resume、事件轨迹。
- 取其“用户能看懂任务现场”，不复制 app server。

Letta 参考：

- memory 分层和长期记忆意识。
- 取其“memory 是资产”，不把 Kitty 改成 memory-first 产品。

## 一次性重构主线

本次重构必须先建立 Task Lifecycle，再把所有核心能力接到同一条主线上。

不能先修 background，后面再想 memory。

不能先修 prompt，后面再想 runtime。

不能先修 subagent，后面再想 lead-wait。

主线是：

输入 -> Task Lifecycle -> Context -> Model -> Tools / Execution -> Runtime State -> Memory -> Output -> Verification

## Task Lifecycle

Task Lifecycle 是本次重构的核心。

它不是机器语义分类器。它只保存模型声明和运行事实。

模型负责判断当前任务属于什么工作形态。机器只保存：

- 当前 task id。
- task stage。
- objective。
- scope。
- boundary。
- reason。
- active execution ids。
- active spec id。
- active todo ids。
- verification facts。
- completion facts。
- updatedAt。

建议阶段：

- `light_response`：简单问答、解释、状态说明，不应默认用工具。
- `normal_work`：普通代码或文件任务，可以局部调查、修改、验证。
- `deep_work`：架构、重构、跨模块任务，需要全局调查。
- `spec_work`：requirements -> design -> tasks -> implement -> validate。
- `background_wait`：后台执行已启动，lead 不阻塞。
- `delegated_wait`：subagent/team 阻塞执行，lead 让出当前轮。
- `recovery`：provider、execution、session、wake 或 checkpoint 恢复。
- `completed`：当前目标完成，有输出和证据。

Task Lifecycle 的作用：

- 防止小任务被误升级成大工程。
- 防止旧目标拖回当前轮。
- 防止内部 wake 变成用户意图。
- 防止 lead 无限等待。
- 让 runtime status 能显示“现在到底处于什么阶段”。

## Agent Loop

Agent loop 只做编排：

- 接收当前输入。
- 读取 Task Lifecycle。
- 构建 context。
- 请求模型。
- 执行工具批次。
- 处理 provider 恢复。
- 处理 execution wait。
- 收口 session memory。
- 返回结果。

Agent loop 不做：

- 不判断用户语义。
- 不写死工具列表。
- 不管理 memory asset。
- 不管理 spec 文档细节。
- 不管理 team 成员细节。
- 不做 runtime status 展示。

必须补齐：

- 每轮开始写入 task lifecycle turn fact。
- 模型输出没有工具且有可见回答时，按当前阶段收口。
- 模型输出空响应时，保留现有继续机制，但要记录为 lifecycle fact。
- task completed 时清理当前 run state，避免旧目标污染下一轮。

## Context

Context 负责模型当前看到什么。

当前事实：

- raw provider messages 只取当前用户输入帧。
- 同 session 连续性来自模型写出的 session memory。
- working memory 保存当前目标执行事实。
- wake facts 作为 internal fact block 进入，不作为用户输入。

必须补齐：

- 注入 Task Lifecycle block。
- `light_response` 阶段不注入过多工程化上下文。
- `deep_work` 阶段才强调全局调查和完整验证。
- `delegated_wait` 恢复时只注入 execution wake facts。
- `background_wait` 只注入后台状态事实，不诱导 lead 轮询。
- context compression 只压当前帧；长期连续性仍靠 session memory。

禁止：

- 机器从旧用户输入抽 semantic anchors。
- 机器用关键词判断“重要记忆”。
- 把旧 assistant 回答变成可复述历史面。

## Session / Memory

Session 负责连续性。Memory 负责沉淀。

当前正确方向：

- session memory 由模型写。
- 机器提供当前输入、assistant 可见输出、工具事实、checkpoint、session diff。
- `.kitty/memory/sessions/*.md` 是可审阅资产。

必须补齐：

- memory update 输入结构化为固定区块：
  - current objective
  - user constraints
  - decisions
  - unresolved next steps
  - verification facts
  - reusable lessons
- memory 输出仍由模型写，不由机器拼。
- task completed 后 memory 应避免保留“继续当前重构”这类旧惯性，除非仍是未完成事项。
- memory asset 支持归档、沉淀、删除。
- memory search 只做字面证据检索，不判断重要性。
- memory -> spec notes / skill references 保持 sink 边界，不混在 store 里。

验收：

- 用户问“刚刚做什么”，能靠 session memory 回答。
- 用户说一个简单问题，不会因旧 memory 开始全局重构。
- internal wake 不更新 session memory。
- 删除 memory asset 同步清 session record。

## Runtime

Runtime 是本地工作环境，不是隐藏垃圾桶。

目录职责：

- `.kitty/.env`：配置事实。
- `.kitty/sessions/`：会话记录。
- `.kitty/memory/`：记忆资产。
- `.kitty/control-plane.sqlite`：execution、team、wake、task lifecycle。
- `.kitty/specs/`：spec 资产。
- `.kitty/observability/`：证据日志。

必须补齐：

- runtime status 输出“现场摘要”，不是数据库 dump。
- status 显示当前 task lifecycle。
- status 显示 active execution、deadline、last output、stalled/no output。
- status 显示 wake facts 待处理。
- status 显示 spec 当前阶段。
- status 显示 memory 是否存在、最近更新时间。
- status 显示 team 成员和 worker 结果。

Runtime 不做：

- 不建议“下一步应该做什么”。
- 不判断任务语义。
- 不隐藏失败。

## Background

Background 是长任务现场。

当前已有：

- `background_run`
- `background_check`
- `background_terminate`
- execution record
- timeout_ms
- output summary
- stale reconcile

必须补齐：

- `lastOutputAt`
- `startedAt`
- `deadlineAt`
- `noOutputForMs`
- `timedOut`
- `stalled`
- `terminatedBy`
- `closeReason`

后台卡住处理：

- 命令超过 timeout：close 为 `failed` 或 `stale`，记录 timedOut。
- 长时间无输出：status health 显示 `no_output`，不自动语义判断。
- pid 消失：reconcile 为 `stale`。
- 用户 terminate：close 为 `aborted`。

关键原则：

- background 默认非阻塞。
- lead 不轮询。
- 模型需要状态时调用 check 或看 runtime facts。
- 机器只暴露死事实。

## Lead Wait / Subagent / Team

这是当前最需要补厚的生命周期。

当前已有：

- subagent/team 创建 blocking execution。
- lead yield。
- host 等待 execution 完成。
- wake facts 恢复 lead。
- worker summary/output 写回 execution。

问题：

- lead-wait 没有等待上限。
- worker 卡住时 lead 可能永久下线。
- timeoutMs 没有统一参与 lead-wait。

必须补齐：

- blocking execution 必须有 wait deadline。
- deadline 来自 execution timeoutMs 或 waitPolicy。
- 超过 deadline 后，execution 标记 `paused` 或 `stale`。
- 发布 wake signal。
- lead 恢复，让模型判断继续等、终止、重派或收束。
- team member 状态从 execution facts 派生，不另造第二事实源。
- team synthesis 必须基于 worker output 和 assignment boundary。

worker record 必须包含：

- objective
- boundary
- expectedOutput
- startedAt
- deadlineAt
- status
- summary
- output
- changedPaths
- error
- closeReason

验收：

- subagent 完成后 lead 醒来。
- subagent 卡住后 lead 也醒来。
- team 某成员失败后 lead 能综合失败事实。
- wake 不进入用户输入。
- wake 不更新 session memory。

## Tools / Extensions

工具面只有两层：

- Core tools：`read`、`edit`、`write`、`bash`
- Extension tools：`todo`、`worktree`、`network`、`background`、`subagent`、`team`、`skills`、`spec`

必须保持：

- 工具事实来自 registry。
- 默认 agent 打开除 spec 外的 extension。
- spec 通过独立工作流启用。
- tests/spec/README 不维护第二套工具事实。

必须补齐：

- extension capability 与真实 tools 自动对齐。
- runtime status 展示当前启用 extension。
- tool display 只负责呈现，不做策略判断。
- network 保持集合能力：request、session、probe、suite、download、trace、OpenAPI。
- todo 保持 `todo_write` 会话级体验，不拆成无意义 CRUD。

## Skills

Skill 是能力包，不是 prompt 大段注入。

当前已有：

- discovery
- load
- resource index
- read resource
- run declared script
- check requires

必须补齐：

- skill 使用证据进入 observability。
- skill 被加载后进入 task lifecycle facts。
- skill script 输出进入 execution 或 tool evidence。
- skill examples/resources 不自动全文进上下文。
- skill 可以从 memory asset 沉淀 references。

禁止：

- 机器关键词自动加载 skill。
- prompt 写死某个 skill 的内容。
- `.codex/skills` 进入小猫 runtime skill。

## Spec

Spec 是深工作流，不是普通文档目录。

当前已有：

- isolated `kitty spec`
- requirements/design/tasks/notes
- checkpoint
- isolated worktree
- stage tool surface

必须补齐：

- spec stage 与 Task Lifecycle 对齐。
- requirements 有验收口径。
- design 有边界和取舍。
- tasks 有验证方式。
- notes 记录过程事实和用户确认。
- implement 前必须有 confirmed requirements/design/tasks。
- validate 阶段回到验收口径。
- spec 完成后沉淀 memory 或 skill reference。

验收：

- spec 模式不污染普通 agent。
- 普通 agent 不自动进入 spec。
- spec checkpoint restore 不影响主仓库。
- spec 全流程有测试。

## Provider / Config

Provider 负责模型连接。Config 负责配置事实。

必须保持：

- `.kitty/.env` 是配置入口。
- provider presets 可见，但当前激活配置只读 env。
- 不用隐藏默认值覆盖用户认知。

必须补齐：

- provider 临时失败进入 recovery lifecycle。
- recovery facts 不污染用户目标。
- token/context 信息进入 runtime facts。
- 配置状态可被 `kitty status` 展示。

## Host / Interaction / Telegram

Host 是入口边界。

当前已有：

- interactive
- Telegram
- local commands
- stop/abort
- exit guard

必须补齐：

- simple input 不应天然进入深工作惯性。
- stop 只中断当前 turn，不杀掉所有后台，除非用户明确退出。
- exit 时清理 running execution。
- Telegram 和 interactive 使用同一 HostTurn 生命周期。
- Telegram active turn 卡住时能 stop。
- HostTurn 等待 delegated execution 必须有 deadline。

## Observability

Observability 是记录仪。

必须记录：

- task lifecycle started/changed/completed
- memory update started/completed/failed
- execution started/running/paused/completed/failed/stale/aborted
- lead wait started/timeout/resumed
- background no output / timeout / terminate
- provider recovery
- skill load/script
- spec stage transition

禁止：

- observability 做决策。
- observability 变成用户主体验。
- 日志内容反向进入当前目标，除非模型显式读取。

## Runtime UI

Runtime UI 负责用户看得懂。

必须补齐：

- background/subagent/team 显示统一 execution card。
- todo_write 继续显示 checklist。
- tool preview 保持短、准、可读。
- long output 给摘要和路径。
- wake facts 不显示成用户消息。

## Tests

测试保护真实产品行为，不测试口号。

必须新增或改造：

- 简单输入不触发工具。
- 简单输入不触发 deep_work。
- 普通代码任务只局部调查。
- 明确重构任务进入 deep_work。
- deep_work 才要求全局核心调查。
- memory 不从旧用户输入机器摘语义。
- memory task completed 后不保留错误继续惯性。
- background timeout 被记录。
- background no output health 可见。
- lead-wait deadline 到期后 lead 恢复。
- subagent 完成后 lead synthesis。
- team 成员失败后 lead synthesis。
- wake 不进入 user input。
- wake 不更新 session memory。
- spec 全流程闭环。
- stop/abort/exit 后 runtime 可恢复。
- status 显示 task lifecycle 和 execution health。

## 一次性施工顺序

必须按主干顺序做，不能散修。

1. [x] 重建 Task Lifecycle 类型、store、session/runtime 投影。
2. [x] 把 Agent Loop 接入 Task Lifecycle。
3. [x] 把 Context 接入 Task Lifecycle block。
4. [x] 把 Memory update 与 task completion 边界重新收口。
5. [x] 把 Runtime status 接入 Task Lifecycle 和 execution deadline，并按单一职责拆分类型与 health 计算。
6. [x] 把 Background 补齐 deadline、lastOutputAt、health facts。
7. [x] 把 Lead Wait 补齐 deadline、timeout pause 和 wake 恢复入口。
8. [x] 把 Subagent/Team worker record 补齐 assignment/deadline/result。
9. [x] 把 Spec stage 接到 Task Lifecycle。
10. [x] 把 Skill 使用证据接到 lifecycle/observability。
11. [x] 同步 README、philosophy、spec 用户审阅、spec 技术实现中的本轮事实。
12. [x] 补全 Task Lifecycle、lead wait deadline、runtime status、background、subagent/team、spec、skill 产品链路测试。
13. [x] 运行完整验证。

## 验收标准

全部满足才算完成：

- 用户简单问一句，Kitty 可以简单答，不进入全局工程。
- 用户要求代码任务，Kitty 能局部调查、修改、验证。
- 用户要求重构，Kitty 能进入 deep_work，先全局调查再改。
- 用户进入 spec，Kitty 走 requirements -> design -> tasks -> implement -> validate。
- background 卡住不会污染主循环。
- subagent/team 卡住不会让 lead 永久下线。
- stop/abort/exit 后 runtime 状态一致。
- session memory 能接住连续体验，但不把旧目标拖回来。
- skill 按需加载，不自动塞全文。
- tools 事实只有 registry 一处。
- runtime status 能让用户看懂现场。
- tests/spec/code/README/philosophy 讲同一个当前事实。

## 最终体验

用户不需要理解内部模块。

用户感受到的是：

- 它知道当前目标。
- 它不会小题大做。
- 它复杂任务能做深。
- 它长任务不会死等。
- 它后台任务看得见。
- 它能派人协作。
- 它能恢复现场。
- 它记得住关键连续性。
- 它能把经验沉淀成资产。
- 它交付时有验证证据。

这就是小猫智能体的成熟方向。
