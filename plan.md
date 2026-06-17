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

- `package.json` 当前版本是 `0.0.7`，主入口是 `dist/cli.js`。
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

- README 基本描述当前 `plan.md + plan skill` 现实。
- `philosophy.md` 仍写了 `spec` extension、`kitty spec`、requirements/design/tasks/notes 工作流，和当前源码事实冲突。
- README 项目结构仍列出 `spec/` 作为项目文档，这可以作为仓库文档事实，但不能描述为运行时 spec 模式。

当前配置事实：

- 运行配置只从 `.kitty/.env` 读取。
- README 描述 `.kitty/.env` 保留 YLS、TTAPI、DeepSeek provider preset 注释块。
- Telegram、扩展开关、运行时配置都在 `.kitty/.env` / `.kitty/.env.example` 结构里。

当前缺口：

- 产品主线还不够凝练：生产级本地 coding agent 的验收标准没有形成一个统一收口。
- `philosophy.md` 有已删除 spec 模式残留。
- `kitty eval` 已有机器检查，但还不够像真实生产验收场景集合。
- session events 作为事件边界偏薄，足够支撑当前 CLI 审阅，但还不能完整解释一次任务为什么成功或失败。
- background/subagent 有能力和测试，但仍需要真实用户体验级验收：卡住、deadline、wake、退出清理、恢复继续。
- init/doctor/config 有基础，但需要端到端真实首次成功验收。
- cache 已有 usage 和 layout，但生产使用还需要更明确的“省钱是否发生”的审阅路径。
- 当前能力不少，但革命性还没被产品化成一个明确体验：本地执行内核、成本优先上下文、产品级验收合同三条线还没有统一落到文档、CLI、status、eval 和测试里。

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

- [ ] 同步 `philosophy.md`，删除 `spec` extension、`kitty spec`、requirements/design/tasks/notes 等当前不存在的运行时表述，改成 `plan.md + plan skill` 的当前事实。
- [ ] 在 README 和 philosophy 中明确当前革命性主线：本地执行内核、成本优先上下文、产品级验收合同；避免“自我改进”叙事。
- [ ] 全局搜索 `spec` 当前产品表述，区分仓库文档目录 `spec/` 和已删除运行时 spec 模式，删除或改写不真实表达。
- [ ] 审查 `kitty init`、`.kitty/.env.example`、`.kitty/.env` 模板、`kitty doctor` 输出，确认首次成功路径只维护一处配置事实。
- [ ] 增加或补强 init/doctor 端到端测试：空项目 init、缺 API key doctor、有 API key provider preflight 可解释。
- [ ] 审查会话选择和标题生成路径，确认 `0` 新建、编号继续、首次标题生成、后续不重复生成的用户体验清楚。
- [ ] 增加或补强 session picker 测试，覆盖没有 session、有 session、选择新建、选择继续、默认提示文案。
- [ ] 审查 context runtime：近场对话、session memory、working memory、project map、workset、internal facts 的进入顺序和用户可见性。
- [ ] 增加长会话恢复验收测试：旧历史不乱回灌，当前用户输入仍是主目标，session memory 只做连续性。
- [ ] 审查 background 用户路径：run、check、wait、stop、terminate、exit cleanup、stale reconcile、status 呈现。
- [ ] 增加 background 真实体验测试：长命令卡住可 stop，进程消失可 reconcile，退出前能清理或阻止退出。
- [ ] 审查 subagent 用户路径：launch、lead wait、worker output、wake、check、deadline、失败收口。
- [ ] 增加 subagent 真实体验测试：lead 让出控制，worker 完成后 internal wake 恢复，wake 不进入用户对话。
- [ ] 审查 cache/status 输出：让用户能看懂最近请求是否命中缓存、稳定前缀是否存在、usage 是否可用。
- [ ] 增加 cache/status 测试：provider usage 字段归一化、cache hit/miss 展示、无 usage 时明确说明未知。
- [ ] 重构或补强 `kitty eval --run` golden scenarios：短问题、长会话、background、subagent、init/doctor、cache、recovery。
- [ ] 让 `kitty eval` 输出从“检查项列表”升级为“产品验收合同”：每个场景说明用户路径、机器证据、通过/失败原因。
- [ ] 审查 session events 是否够支撑用户审阅；只补当前生产验收需要的事件，不做大而全 trace。
- [ ] 同步 README、philosophy、AGENTS、runtime skill 文案，确保没有当前不存在能力。
- [ ] 跑局部测试、typecheck、build、完整 `npm.cmd run verify`。
- [ ] 更新本计划收口，记录完成、验证、剩余风险。

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

尚未执行。

当前计划已经否决“自我改进 harness”方向，收束为生产级本地 coding agent。

执行完成后必须更新：

- 完成了哪些任务。
- 修改了哪些文件。
- 跑了哪些验证。
- 哪些真实路径没有验证。
- 是否存在剩余风险。
