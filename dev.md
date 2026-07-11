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

## 8. 发布规则

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

## 9. 收口规则

每次大改收口只写事实：

```text
现象：
根因：
修复：
验证：
剩余风险：
```

不要把临时判断写成长期规则。不要把历史失败写进当前产品主干。
