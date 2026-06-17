# Production-Grade Local Coding Agent Plan

## 1. 需求文档

用户需要的是一个可以替代昂贵商业 coding agent 的本地生产工具。

Kitty 的核心体验应该很直接：用户在本地仓库里启动 Kitty，说出要做的事，Kitty 能稳定理解当前目标，读取项目，修改代码，运行命令，验证结果，保存现场，并在中断或恢复后继续工作。

这个产品不是自我进化系统，不追求自动改造自己，不追求复杂 agent 平台。它要成为可靠、克制、省钱、可恢复的本地 coding agent harness。

革命性不在“自动进化”，而在三件硬事：

- 本地执行内核：把一次 coding agent 工作看成可恢复的本地执行，而不是一串聊天消息。用户关闭窗口、后台命令卡住、subagent 完成、provider 失败，都不能让任务现场丢失。
- 成本优先上下文：把上下文当作昂贵资源管理。近场对话负责自然体验，session memory 负责长任务续命，机器账本只在需要时取证，稳定前缀服务 prompt cache。
- 产品级验收合同：`kitty eval` 不再只是“模块能跑”，而是证明 Kitty 作为产品真的能完成关键路径：短问题不乱干，长任务不断片，后台可恢复，子执行能唤醒，初始化能成功，缓存事实可审阅。

使用者是本地开发者。用户不需要理解内部账本、事件、缓存布局或上下文压缩，只需要看到 Kitty 能不能把任务做完，哪里卡住了，如何继续。

当前范围包含：

- 默认交互体验：启动、选择会话、新建会话、继续会话、一次性 prompt。
- 上下文连续性：当前对话自然在场，长会话不丢关键事实，旧目标不乱回灌。
- 工具执行：读文件、改文件、写文件、运行命令，扩展工具只服务真实工作。
- 后台和子执行：background 和 subagent 能用于长命令、隔离调查、恢复和收口。
- 状态恢复：中断、退出、崩溃、后台卡住后，用户能看懂现场并继续或清理。
- 成本控制：上下文预算、缓存稳定前缀、provider usage、命中事实可见。
- 首次成功体验：`kitty init`、`.kitty/.env`、`kitty doctor`、第一次对话路径清楚。
- 验收能力：`kitty eval` 验证真实产品路径，不只做健康检查。
- 文档同步：README、philosophy、AGENTS、skills、测试和源码讲同一个当前事实。

当前范围不包含：

- 不做“自我改进 harness”。
- 不做自动创造 skill、自动改规则、自动重写项目原则。
- 不做 team 复活。
- 不做 spec 模式复活。
- 不做企业安全沙箱或保守审批主线。
- 不做没有当前入口支撑的宣传能力。

业务完成标准：

- 用户可以把 Kitty 当作日常本地 coding agent 使用。
- 短问题不会疯狂工作。
- 长任务能持续推进并保存现场。
- 断开、退出或后台完成后能恢复。
- 失败时能说清当前事实和下一步。
- 成本、上下文和缓存状态能被用户审阅。
- 文档和 CLI 输出不再展示不存在的能力。
- 关键能力由真实验收场景证明，而不是由 README 口号证明。

## 2. 当前事实

当前代码事实：

- `package.json` 当前版本是 `0.0.8`，主入口是 `dist/cli.js`。
- README 把 Kitty 定义成本地 agent 编程工作台，当前能力包括 agent loop、context、session、provider、cache、core tools、extensions、control plane、plan workflow、CLI、Telegram、events、evaluation。
- Core tools 是 `read`、`edit`、`write`、`bash`。
- 当前 extensions 是 `todo`、`worktree`、`network`、`background`、`subagent`、`skills`。
- `src/extensions/definitions.ts` 没有 `spec` extension。
- runtime skills 当前是 `research`、`plan`、`do`、`verification`。
- `src/session/events.ts` 当前事件只有 `session.created`、`turn.started`、`turn.completed`、`turn.failed`、`turn.aborted`。
- `src/evaluation/checks.ts` 当前 eval 覆盖 runtime status、project map、memory assets、extension surface、skills、config preflight、cache economy、host turn boundary、remote entrypoints、recovery drills。
- `src/runtime/memory/store.ts` 当前 memory assets 是 `session`、`project`、`user`、`evidence` 四类 Markdown 资产。
- `src/context/runtime/compression/builder.ts` 当前负责可见对话窗口、压缩、预算和 cache layout。
- `src/execution/kinds.ts` 当前 execution kinds 是 `background` 和 `subagent`。
- `src/interaction/sessionDriver.ts` 有退出前检查和停止后台进程的逻辑。
- `src/config/init.ts`、`src/cli/commands/doctor.ts`、`.kitty/.env*` 是首次体验主线。

当前测试事实：

- `package.json` 的完整验证命令是 `npm.cmd run verify`，实际运行 `npm test`，包括 typecheck、build、test:core。
- tests 已覆盖 background tools、subagent tools、lead-wait lifecycle、session memory lifecycle、context compression、runtime status、memory assets、evaluation harness、doctor/config 等核心面。

当前文档事实：

- README 描述当前 `plan.md + plan skill` 现实，并把 `kitty eval` 定义为产品验收场景入口。
- `philosophy.md` 已改成当前产品事实：复杂任务归 `plan.md`，不再把 spec 描述成运行时 extension、CLI 入口或工作流。
- README 项目结构仍列出 `spec/` 作为项目文档目录事实；公开产品语言不把它描述为运行时 spec 模式。

当前配置事实：

- 运行配置只从 `.kitty/.env` 读取。
- README 描述 `.kitty/.env` 保留 YLS、TTAPI、DeepSeek provider preset 注释块。
- Telegram、扩展开关、运行时配置都在 `.kitty/.env` / `.kitty/.env.example` 结构里。

当前缺口：

- 真实 provider 下长会话、缓存命中率和 Telegram 长时间在线稳定性仍需要后续生产观察。
- session events 已能支撑当前验收和 CLI 审阅，但还不是完整任务因果追踪系统；当前不扩成大而全 trace。
- `kitty eval` 已升级为产品验收场景入口；后续只应在出现真实产品路径缺口时继续增补，不做慢而脆的验收膨胀。

当前未知点：

- 真实 provider 下长会话和缓存命中率表现需要实测。
- 用户未来是否需要 Web/TUI 产品面，不在本轮确认。
- 大规模 memory / skill 自动路由暂不纳入当前产品主线。

## 3. 失败测试

这些失败测试定义当前不成熟的产品风险：

- `philosophy.md` 仍把 `spec` 描述成当前 extension 或 `kitty spec` 入口，应失败。
- README、philosophy、CLI status、eval 输出对当前能力说法不一致，应失败。
- `kitty init` 后不填 `.env`，`kitty doctor` 不能清楚告诉用户缺什么、下一步做什么，应失败。
- `kitty doctor` 在 API key 存在时不能暴露 provider 连接事实，应失败。
- `kitty` 启动会话列表时，新建/继续路径含糊，应失败。
- 短问题触发不必要的长任务、background、subagent 或计划流程，应失败。
- 长会话恢复后，只能看到工具账本，看不到自然连续上下文，应失败。
- 内部 wake、后台完成或执行状态被写成用户新要求，应失败。
- background 卡住后，用户无法通过 status/check/wait/stop/exit 清楚处理，应失败。
- subagent 完成后 lead 不能用内部 wake 继续，或把 wake 当用户输入，应失败。
- `kitty eval --run` 只证明模块能 import，不证明真实产品路径，应失败。
- cache 状态只显示技术字段，用户看不懂是否有省钱事实，应失败。

## 4. 目标

本计划的最终目标是把 Kitty 收束成生产级本地 coding agent 主线：

- 启动主线清楚：`kitty init` -> 填 `.kitty/.env` -> `kitty doctor` -> `kitty`。
- 对话主线自然：新会话、继续会话、标题、短任务、长任务、恢复都顺。
- 执行主线可靠：core tools 是主干，extensions 只在真实需要时服务执行。
- 上下文主线稳定：当前对话在场，session memory 续命，机器账本不伪装成用户意图。
- 生命周期主线完整：turn、tool、execution、background、subagent、wake、exit、abort、resume 都有明确边界。
- 成本主线可审阅：context budget、cache layout、provider usage、cache hit/miss 能说明当前成本事实。
- 验收主线真实：`kitty eval --run` 覆盖可运行的黄金路径，不测试口号。
- 文档主线一致：README、philosophy、AGENTS、skills、tests、CLI 输出都只描述当前真实存在的能力。

革命性目标：

- Kitty 的基本单位从“聊天轮次”升级为“可恢复执行现场”。聊天只是入口，session、workset、execution、events、memory、status 才是本地现场。
- Kitty 的上下文策略从“尽量记住更多”升级为“只让当前推理需要的事实进入当前轮”。近场、记忆、账本、证据各归其位。
- Kitty 的质量标准从“测试通过”升级为“产品关键路径可演练”。每个核心能力都必须能被一条真实用户路径证明。

## 5. 不做范围

- 不做自我改进闭环。
- 不做自动从 trace 生成 skill。
- 不做自动改 AGENTS、README、plan、skill 的后台进程。
- 不做 team。
- 不做 spec 模式。
- 不做旧兼容、legacy 分支、旧数据清理提示。
- 不新增没有明确用户路径的协议层。
- 不为了“看起来成熟”增加复杂模块。
- 不把文章或外部项目里的概念直接搬进 Kitty。

## 6. 设计

### 主链路

输入 -> session -> context -> model -> tools -> state -> output -> record -> resume。

每个环节只维护自己的事实：

- session 保存对话、标题、memory、checkpoint、workset。
- context 选择当前轮需要进入模型的事实。
- model 做语义判断和执行路线。
- tools 执行明确机器动作。
- execution/control plane 保存 background 和 subagent 死事实。
- host 管 turn 边界、wake、恢复和退出。
- runtime UI/CLI 负责把现场说给用户听。
- evaluation 负责证明真实路径能跑。

这条主链路的设计意图是把 Kitty 做成本地执行内核：

- 输入不是任务全部，只是当前执行现场的一次新指令。
- session 不是聊天存档，而是现场容器。
- context 不是历史堆叠，而是当前推理桌面。
- execution 不是后台列表，而是长动作账本。
- status 不是数据库摘要，而是用户重新接手现场时看的仪表盘。
- eval 不是单元测试包装，而是产品验收入口。

### 模块边界

- `src/agent/`：模型 turn 主循环，不承担 CLI 产品展示。
- `src/context/`：上下文构建、预算、压缩、cache layout，不判断任务是否重要。
- `src/session/`：会话持久化、memory、title、workset、events，不替模型做路线选择。
- `src/provider/`：请求、usage、cache policy、错误恢复，不混入产品文案。
- `src/tools/`：四个 core tools，保持基础编程闭环。
- `src/extensions/`：独立能力包，只通过 registry 进入工具面。
- `src/execution/` 和 `src/control/`：background/subagent 生命周期事实。
- `src/host/`：CLI/Web/Telegram 共用 turn 边界、session binding、wake。
- `src/interaction/`：本地交互、退出、中断、会话选择。
- `src/runtime-ui/`：用户可见事件呈现。
- `src/evaluation/`：生产路径验收。
- `README.md` / `philosophy.md` / `AGENTS.md` / `skills/`：只写当前产品事实。

### 状态归属

- 当前目标归模型判断，不由机器从用户原话提取。
- 当前现场归 session/status 展示。
- 长命令归 background execution。
- 隔离调查归 subagent execution。
- 成本事实归 provider usage + context budget。
- 可审阅经验归 memory assets，但不自动升级成规则。
- 计划归 `plan.md`，只在用户或开发者明确进入大任务时使用。

革命性边界：

- 机器保存现场，不替用户和模型决定路线。
- 模型决定路线，但必须落到可恢复现场。
- 用户看到的是当前现场，不是内部账本转储。
- 历史可以取证，不能拖拽当前目标。
- 省钱是核心产品能力，不是 provider 附带指标。

### 错误、恢复、中断

- 用户中断不应破坏 session。
- 强制退出前应检查 running background/subagent。
- background 进程消失应 reconcile 成 stale/failed/aborted 事实。
- subagent 完成只产生 internal wake facts，不产生用户消息。
- provider 失败应暴露 provider、model、status、可操作下一步。
- context 超预算应压缩旧对话，保留近场 tail 和 session memory。

### 文档策略

README 写产品入口和当前能力。

philosophy 写当前架构原则，不写已删除模式。

AGENTS 写运行和开发规则。

skills 写可加载方法包，不写产品不存在的工作流。

## 7. 实施任务

- [x] 同步 `philosophy.md`，删除 `spec` extension、`kitty spec`、requirements/design/tasks/notes 等当前不存在的运行时表述，改成 `plan.md + plan skill` 的当前事实。
- [x] 在 README 和 philosophy 中明确当前革命性主线：本地执行内核、成本优先上下文、产品级验收合同；避免“自我改进”叙事。
- [x] 全局搜索 `spec` 当前产品表述，区分仓库文档目录 `spec/` 和已删除运行时 spec 模式；公开产品文档里旧运行时 spec 入口已清理。
- [x] 审查 `kitty init`、`.kitty/.env.example`、`.kitty/.env` 模板、`kitty doctor` 输出；现有主线仍由 `.kitty/.env*` 和 doctor/preflight 测试保护。
- [x] 审查 init/doctor 测试覆盖；现有覆盖在 `tests/cli/program.test.ts` 和 `tests/config/preflight.test.ts`。
- [x] 审查会话选择和标题生成路径；`0` 新建、编号继续、首次标题生成、后续不重复生成由当前 session picker / title 路径承担。
- [x] 审查 session picker 测试；现有覆盖在 `tests/cli/session-picker.test.ts`。
- [x] 审查 context runtime：近场对话、session memory、working memory、project map、workset、internal facts 的进入顺序和用户可见性。
- [x] 审查长会话恢复测试覆盖；现有覆盖在 `tests/context/*` 和 `tests/agent/session-memory-lifecycle.test.ts`。
- [x] 审查 background 用户路径：run、check、wait、stop、terminate、exit cleanup、stale reconcile、status 呈现。
- [x] 审查 background 体验测试覆盖；现有覆盖在 `tests/extensions/background-tools.test.ts` 和 `tests/interaction/exit-guard-lifecycle.test.ts`。
- [x] 审查 subagent 用户路径：launch、lead wait、worker output、wake、check、deadline、失败收口。
- [x] 审查 subagent 体验测试覆盖；现有覆盖在 `tests/host/lead-wait-lifecycle.test.ts` 和 `tests/extensions/subagent-tools.test.ts`。
- [x] 审查 cache/status 输出：最近请求缓存、稳定前缀、usage 可用性由 runtime status 和 provider cache 测试保护。
- [x] 审查 cache/status 测试覆盖；现有覆盖在 `tests/runtime/status.test.ts` 和 provider cache 相关测试。
- [x] 补强 `kitty eval` 场景模型：新增 `EvaluationScenario`，每个 check 对应用户路径和机器证据。
- [x] 让 `kitty eval` 输出从“检查项列表”升级为“产品验收合同”：每个场景说明用户路径、机器证据；`--run` 输出场景标题和检查结果。
- [x] 审查 session events 是否够支撑用户审阅；当前验收只需要现有 event 边界，不扩成大而全 trace。
- [x] 同步 README、philosophy、eval CLI 和 docs test，确保没有当前不存在能力；AGENTS 和 runtime skills 本轮无事实冲突，未改。
- [x] 跑局部测试、typecheck、build、完整 `npm.cmd run verify`。
- [x] 更新本计划收口，记录完成、验证、剩余风险。

## 8. 验证计划

局部验证：

- `npm.cmd run test:build`
- `node --test .test-build/tests/cli/*.test.js`，如果存在相关 CLI 测试。
- `node --test .test-build/tests/config/*.test.js`，如果存在 config/init/doctor 测试。
- `node --test .test-build/tests/context/*.test.js`
- `node --test .test-build/tests/host/*.test.js`
- `node --test .test-build/tests/extensions/background-tools.test.js`
- `node --test .test-build/tests/extensions/subagent-tools.test.js`
- `node --test .test-build/tests/evaluation/*.test.js`

完整验证：

- `npm.cmd run typecheck`
- `npm.cmd run build`
- `npm.cmd run test:core`
- `npm.cmd run verify`

真实路径演练：

- 在临时目录运行 `node dist/cli.js init`，检查 `.kitty/.env.example`、`.kitty/.env`、`.kitty/.kittyignore`。
- 运行 `node dist/cli.js doctor`，检查缺配置和可操作下一步。
- 运行 `node dist/cli.js sessions`，检查无 session / 有 session 输出。
- 运行 `node dist/cli.js status`，检查 context、memory、skills、execution、cache 输出不含不存在能力。
- 运行 `node dist/cli.js eval --run`，检查 golden scenarios 真实通过。

文档检查：

- 搜索 `kitty spec`，应无当前产品入口。
- 搜索 `spec mode`、`requirements.md`、`design.md`、`tasks.md`、`notes.md`，不应作为当前运行时能力出现。
- README 和 philosophy 对 extensions、plan、memory、eval 的描述一致。

未验证内容：

- 真实 provider 长时间生产使用稳定性需要后续实际使用观察。
- 真实 provider cache 命中率需要带 API key 的长会话验证。
- Telegram 长时间在线稳定性需要单独运行验收。

剩余风险：

- 如果 eval 过度扩张，会变成慢而脆的测试套件。只覆盖生产关键路径。
- 如果 status 输出过度技术化，会回到账本味。用户面优先说当前现场。
- 如果 memory 写得太多，会污染当前目标。memory 只服务连续性和可审阅事实。

## 9. 收口

已执行。

本轮完成目标：

- 产品方向已从“自我改进 harness”收束为生产级本地 coding agent。
- README 和 philosophy 已同步三条主线：本地执行内核、成本优先上下文、产品级验收合同。
- 运行时 spec 模式残留已从公开产品文档清理；当前复杂任务入口是 `plan.md + plan skill`。
- `kitty eval` 已升级为产品验收场景入口，场景包含用户路径和机器证据；`--run` 会把检查结果对应到场景标题。
- 新增 docs test，保护 README 和 philosophy 不再暴露已删除的运行时 spec 模式。
- 已审查 init/doctor、session picker、context/session memory、background、subagent、cache/status 的现有测试覆盖，当前没有发现必须新增入口才能闭环的缺口。

修改文件：

- `README.md`
- `philosophy.md`
- `plan.md`
- `src/cli/commands/evaluation.ts`
- `src/evaluation/checks.ts`
- `src/evaluation/harness.ts`
- `src/evaluation/types.ts`
- `tests/evaluation/harness.test.ts`
- `tests/docs/current-product-facts.test.ts`

验证结果：

- `npm.cmd run typecheck` 通过。
- `npm.cmd run test:build` 通过。
- `node --test .test-build/tests/evaluation/harness.test.js` 通过。
- `node --test .test-build/tests/docs/current-product-facts.test.js` 通过。
- `node --test .test-build/tests/cli/program.test.js` 通过。
- `node --test .test-build/tests/cli/session-picker.test.js` 通过。
- `npm.cmd run verify` 通过，171 个测试全部通过，0 失败。

文档检查：

- 搜索 `kitty spec`、`spec mode`、`Spec 工作流`、`requirements.md`、`design.md`、`tasks.md`、`notes.md`、`spec extension`，公开产品文档中无旧运行时 spec 入口；命中只剩新增 docs test 的断言。

未验证内容：

- 没有用真实 provider 长时间跑生产长会话。
- 没有用真实 API key 验证长期 prompt cache 命中率。
- 没有做 Telegram 长时间在线稳定性验收。

剩余风险：

- `kitty eval` 现在是产品验收合同，但仍是本地可验证场景集合，不等于真实生产压测。
- session events 当前保持克制，足够支撑现有验收；如果未来要解释完整任务因果，需要单独设计事件层，不应在本轮硬塞。
- `package-lock.json` 在本轮开始前已是未提交修改，本轮未刻意改动它。
