# Kitty Development Discipline

`dev.md` 是 Kitty 当前开发纪律。它约束如何改 Kitty，不描述 Kitty 对用户运行时的能力。

`history.md` 保留演进证据和失败路径。`spec.md` 保留当前产品事实。`dev.md` 保留当前工程节奏。

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
5. `history.md` 里的演进证据。
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
- TUI/CLI/Web/Telegram：只投影事实，不拥有事实。
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
- 当前 CLI/TUI/Web/Telegram 用户路径直接使用；
- 当前 `spec.md` 明确描述且代码真实存在；
- 当前 production eval 需要；
- 它是公开包入口的一部分，并且仍是当前事实。

## 6. 统一规则

能统一的统一。能合并的合并。

统一不是把不同职责塞进一个文件。统一是让同一种事实只有一套规则、一套入口、一套测试。

优先统一：

- provider/model/request 方言：统一进 catalog、capabilities、dialect、request body。
- execution output 读取：background、subagent、execution CLI 共用同一个 reader。
- runtime scene 投影：CLI/TUI/Web 只读 runtime facts，不各自重算。
- 错误分类：retry、fallback、CLI 展示共用错误 kind，不散落 message 猜测。
- 配置 contract：init template、env example、doctor/preflight 读取同一个配置事实。
- 工具输出治理：raw 保存、projection、model view 只走一条链。

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

- UI 只有在 SQLite transaction 提交后才能把输入视为已接受并回显；提交失败必须明确显示未接收，不能只留在进程内存、输入框或 presenter 状态。SQLite 必须使用能抵抗进程强杀和断电的 durability 配置。
- 同一 session 的执行保持串行，但 admission 不能等待上一轮结束。当前 owner 清理期间收到的新输入必须持久排队并自动接棒。
- Ctrl+C 只取消当前有效 owner。连续 Ctrl+C 必须幂等，不能误删、跳过或取消后续已接受输入。
- running turn 依靠 owner token、heartbeat 和 lease 判定存活。进程消失后，过期 owner 必须进入明确终态，不能永久阻塞队首。
- 重启必须从 SQLite 恢复 queued turn；不能要求用户重输，不能重复 admission，也不能把展示字符串当作恢复事实。
- 工具副作用不盲目重放。恢复使用 tool journal、结果 envelope 和文件 hash 判断已知事实，未知边界返回 interrupted evidence。
- 测试必须覆盖 interrupt cleanup 期间提交、连续中断、queued turn 重启恢复、expired running 对账、进程树终止和重复恢复幂等性。

## 9. 发布规则

普通提交前：

```powershell
npm.cmd run verify
```

按改动类型加测：

- provider/catalog/request：provider contract 测试；
- context/session：context 或 session 定向测试；
- execution/background/subagent：execution lifecycle 测试；
- TUI：TUI render/store/shell 定向测试；
- README/site 文案：不为纯文案增加核心测试。

发布关键版本前再显式跑：

```powershell
npm.cmd run eval:local
npm.cmd run eval:production
```

`eval:production` 使用真实 provider，不进入普通 verify。

## 10. 收口规则

每次大改收口只写事实：

```text
现象：
根因：
修复：
验证：
剩余风险：
```

不要把临时判断写成长期规则。不要把历史失败写进当前产品主干。
