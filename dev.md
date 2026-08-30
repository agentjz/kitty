# Kitty Development Discipline

`dev.md` 是 Kitty 当前开发纪律。它约束如何改 Kitty，不描述 Kitty 对用户运行时的能力。

`VERSION_LOG.md` 与 Git 历史保留演进证据。`spec.md` 保留当前产品事实。`dev.md` 保留当前工程节奏。

## 1. 改动原则

激进改动可以接受。激进不等于随意。

每次大改必须先回答：

- 当前问题属于主链路、状态、provider、工具、执行、呈现、测试还是文档。
- 当前事实的唯一 owner 是谁。
- 哪些代码是当前产品主链路需要的。
- 哪些代码只是历史平台、旧语义或测试续命。
- 改完后用什么行为证明它真的变稳。

没有 owner 的事实不能新增。只有测试在使用、当前源码主链路不用的能力不能保留。

## 2. 当前事实优先级

事实优先级：

1. 当前源码主链路。
2. 当前 `spec.md`。
3. 当前确定性测试和 production eval。
4. 当前运行日志和状态文件。
5. `VERSION_LOG.md` 与 Git 历史里的演进证据。
6. 用户偏好和旧讨论。

历史只能解释为什么，不自动决定现在保留什么。

## 3. Owner 规则

每个事实只能有一个 owner。

- Provider/model 能力：`src/provider/catalog.ts` 和 provider capability/dialect 投影。
- Provider 请求体：provider request body 构建层。
- Context budget：context runtime。
- Session snapshot：session schema/store。
- Execution lifecycle：control-plane ledger 和 execution 层。
- Runtime status：runtime status 聚合层。
- TUI/CLI/Telegram：只投影事实，不拥有事实。
- Tool output：output governance 和 model projection。

Presenter 不能重新计算事实。UI 不能保存第二套生命周期。测试不能为旧能力制造当前事实。

## 4. 测试规则

测试保护行为，不保护口号。

优先测试：

- provider request body wire contract；
- context budget 和 compression 行为；
- tool call / tool result replay；
- session snapshot schema 和 corrupt handling；
- execution running -> terminal lifecycle；
- abort、retry、fallback、process tree kill；
- TUI 只投影 active control-plane execution；
- tool output raw/projection 分层。

降低或删除：

- 固定某句提示词、README、site 文案的测试；
- 固定 `.env.example` 大段模板长相的测试；
- 固定颜色、按钮圆角、页面装饰的测试；
- 只证明旧 capability/protocol 平台还存在的测试；
- 当前源码主链路不用、只靠测试引用的模块测试。

## 5. 删除规则

删除优先于兼容。

直接删除：

- 当前主链路不用的历史平台层；
- 只靠测试引用的旧模块；
- 旧别名、旧包装、旧语义；
- 当前产品没有的能力入口；
- 为了平滑过渡存在的中间层。

保留必须满足至少一个条件：

- 当前运行时主链路直接使用；
- 当前 CLI/TUI/Telegram 用户路径直接使用；
- 当前 `spec.md` 明确描述且代码真实存在；
- 当前 production eval 需要；
- 它是公开包入口的一部分，并且仍是当前事实。

## 6. 统一规则

能统一的统一。能合并的合并。

统一不是把不同职责塞进一个文件。统一是让同一种事实只有一套规则、一套入口、一套测试。

优先统一：

- provider/model/request 方言：统一进 catalog、capabilities、dialect、request body。
- execution output 读取：background 与 execution CLI 共用同一个 reader。
- runtime scene 投影：CLI/TUI 只读 runtime facts，不各自重算。
- 错误分类：retry、fallback、CLI 展示共用错误 kind，不散落 message 猜测。
- 配置 contract：init template、env example、doctor/preflight 读取同一个配置事实。
- 工具输出治理：raw 保存、projection、model view 只走一条链。
- 工具结果先保护事实完整性：工具 owner 先约束单次输出，投影不得再做固定短摘要；只有 context owner 能在整体请求真实超限时压缩旧历史。

禁止统一：

- 把状态 owner 和 presenter 合并。
- 把 provider 真实 wire 差异伪装成通用参数。
- 把历史能力包装成当前产品能力。
- 为了减少文件数量合并变化原因不同的模块。

## 7. 错误规则

错误分类要服务恢复和用户判断。

关键路径错误应该能区分：

- 用户配置错误；
- provider contract 错误；
- provider 临时错误；
- tool 参数错误；
- tool 执行错误；
- session 损坏；
- execution lifecycle 错误；
- abort/cancel。

不能靠到处匹配 message 字符串长期维持行为。message 可以用于展示，不能成为核心控制流的主要 contract。

## 8. 中断、崩溃与恶劣用户路径

把用户视为会在任意边界连续按 Ctrl+C、关闭终端、杀死 Node 进程、让 Agent 杀死自身进程、断电或重启主机。正常退出不是正确性的前提。

- 这是一项强制 lifecycle review gate，适用于每个新功能，不只适用于 turn。设计、实现和测试收口前都必须逐项检查接受、执行、提交、中断、失败、恢复、重放和清理边界。
- UI 只有在 SQLite transaction 提交后才能把输入视为已接受并回显；提交失败必须明确显示未接收，不能只留在进程内存、输入框或 presenter 状态。SQLite 必须使用能抵抗进程强杀和断电的 durability 配置。
- 运行中的普通输入是当前 turn 的 durable steer。它进入当前 turn 的下一次模型请求，不中断、不并发开新 turn，也不伪装成当前 turn 结束后的队列。
- steer 的 session message 使用稳定 ID。进程在“消息落账”和“steer 标记 consumed”之间死亡时，恢复必须补齐状态而不重复消息。
- Ctrl+C 只取消当前有效 owner，并明确 reject 尚未消费的 steer。连续 Ctrl+C 必须幂等，不能误删、跳过或把 steer 启动成新 turn。
- 关闭终端、SIGHUP/SIGTERM、进程被杀和断电不是 Ctrl+C。可控关闭必须 detach 当前 turn；不可控消失由 owner token、heartbeat 和 lease 对账，同一 turn 从 durable session、tool journal 和 pending steer 恢复。
- running turn 依靠 owner token、heartbeat 和 lease 判定存活。过期 running owner 回到可恢复 admission；final close 边界不确定时进入明确失败，不能永久阻塞，也不能盲目重放已展示的最终回答。
- 工具副作用不盲目重放。恢复使用 tool journal、结果 envelope 和文件 hash 判断已知事实，未知边界返回 interrupted evidence。
- 展示层状态也必须抗中断：草稿、locale、滚动锚点、选择范围和复制失败不能反推或覆盖运行事实；重启后读取持久 owner，不读取展示字符串。
- 测试必须覆盖 provider 等待、工具执行和 final 竞态中的 steer，连续中断、终端 detach、强杀恢复、expired running 对账、进程树终止、消费幂等和重复恢复。

每个功能收口时必须回答：

- 接受事实何时持久化，提交前崩溃会怎样。
- 执行中 Ctrl+C、关闭终端、强杀和断电分别落到什么状态。
- 恢复读取哪个 owner，是否会丢失、重复或错误重放。
- 清理是否幂等，失败是否保留可行动证据。
- 用户连续重复操作时，状态机是否仍只有一条合法路径。

## 9. 超长对话、上下文压力与真实验收

长任务连续性是发布门槛，不以短对话绿灯代替。

- 修改 provider、context、session、host turn、tool replay、cache 或压缩逻辑时，必须检查超长对话、持续压力、接近上限、触发压缩、不可压缩超限和恢复后的继续执行。
- 确定性测试负责边界算法：预算计算、tail 保护、summary、context epoch、tool batch 完整性、不可压缩请求的本地失败和 provider 请求未发生。
- `eval:production` 负责真实主链路：使用当前真实 Provider 连续完成多轮对话，直到实际触发上下文压缩；必须留下 completed turns、durable session、context epoch 和可审阅 budget。
- 压缩后必须继续完成真实模型请求，并保留当前用户输入、最新事实和完整工具调用边界；不能只证明 `compressed=true`。
- 上下文打爆测试使用真实 Host、真实配置、真实 session/control plane 和真实 Provider adapter。对于机器已经能判定不可容纳的请求，正确结果是在发送 completion 前明确失败；禁止为了“真调用”向 Provider 盲发已知超限内容。
- 压力测试必须有界：固定最大轮数、输入规模、输出上限、总等待和隔离工作区。高 Token 消耗、长时间空转或无限循环不是强度证据。
- 结果只按行为判定：完成轮数、压缩模式、epoch、session/turn 终态、最终事实连续性、明确 overflow 错误和无伪造 assistant 回复；不固定模型措辞。

生产验收命令：

```powershell
npm.cmd run eval:production
```

它必须包含真实 Provider 探测、普通多轮、超长对话与上下文压力、后台等待、修复任务和 runtime status；任一项失败都不能用普通单测绿灯覆盖。

## 10. 发布规则

源码开发入口使用与发布包相同的构建合同：

```powershell
npm.cmd run dev -- --help
```

`dev` 先生成当前 CLI CJS 与 TUI ESM，再启动 `dist/cli.js`。不要增加只在源码执行器中成立、发布 bundle 不成立的第二套模块语义。

普通提交前：

```powershell
npm.cmd run verify
```

按改动类型加测：

- provider/catalog/request：provider contract 测试；
- context/session：context 或 session 定向测试；
- execution/background：execution lifecycle 测试；
- TUI：TUI render/store/shell 定向测试；
- README/site 文案：不为纯文案增加核心测试。

发布关键版本前再显式跑：

```powershell
npm.cmd run eval:local
npm.cmd run eval:production
```

`eval:production` 使用真实 provider，不进入普通 verify。

## 11. 收口规则

每次大改收口只写事实：

```text
现象：
根因：
修复：
验证：
剩余风险：
```

不要把临时判断写成长期规则。不要把历史失败写进当前产品主干。
