# Kitty 生产级封顶验收 Plan

## 1. 需求文档

用户要的不是“继续优化 Kitty”，而是把 Kitty 做到可以长期作为主力本地 agent 使用的顶尖标准。

最终体验必须是：

- 用户启动 Kitty 后，能清楚进入会话、继续任务、看到当前现场。
- 长任务不会因为上下文、后台任务、subagent、provider 差异或 TUI 展示而断片。
- 工具输出不会浪费大量 token，也不会因为压缩丢失关键证据。
- provider、中转、模型能力、reasoning、usage、cache 都有清楚边界。
- CLI、TUI、Web 只是不同外壳，底层 session、event、status、provider、tool 事实一致。
- 命名朴素、准确、可维护；不用 `kernel`、`engine`、`manager` 这类过重词掩盖职责。

业务完成标准：

- Kitty 的核心链路达到“可长期使用、可恢复、可诊断、可省 token、可验证”的状态。
- 不再把同一方向拆成一堆小尾巴反复补。
- 代码、测试、spec、README 对当前事实讲同一套话。

当前范围包含：

- provider/model/relay 能力边界。
- context/session/memory/recovery 连续性。
- tool output 治理与命名重整。
- cost/cache 可观测事实。
- CLI/TUI/Web 现场表达一致性。
- eval 真实场景验收。
- 全局命名和文件职责审查。

当前范围不包含：

- 企业安全沙箱。
- team 复活。
- 远程控制新能力。
- 新长期记忆大系统。
- 为了显得高级而引入框架、数据库、协议或抽象。

## 2. 当前事实

已确认仓库事实：

- 当前 `plan.md` 不存在。
- `git status --short` 为空，Kitty 源码当前干净。
- `spec/` 已经成为事实主干，包含用户审阅和技术实现两棵树。
- `package.json` 当前版本为 `0.0.15`，构建入口包含 CLI CJS 和 TUI ESM。
- `src/provider/` 已拆出 `catalog.ts`、`transport.ts`、`responsesAdapter.ts`、`chatCompletionsAdapter.ts`、`usageNormalizer.ts`、`cachePolicy.ts`、`retryPolicy.ts`。
- `src/tools/outputKernel/` 存在，导出 `governToolOutput` 和 `ToolOutputGovernance`；`rg` 未发现 `kernal` 拼写错误，但 `outputKernel` 命名过重。
- `tests/tools/output-kernel.test.ts` 仍用 “output kernel” 描述产品行为。
- 超过 12000 字节的源码文件包括 `src/evaluation/checks.ts`、`src/session/snapshot.ts`、`src/context/runtime/compression/builder.ts`、`src/protocol/manifest.ts`、`src/shell/tui/transcriptLayout.ts`、`src/telegram/service.ts`、`src/agent/turn/run.ts`，需要职责审查。
- 测试覆盖已经较厚，但生产级验收仍更偏单元和局部行为，真实用户路径 eval 还不够完整。

已确认参考项目事实：

- Codex 最新主线在加厚 `world_state`、`thread/turn`、`context_window`、`exec-server`、`skills/plugins` 和恢复能力。
- opencode 把 provider、protocol、schema、session-ui、route、transport 拆清楚，强调多端共享事件和会话事实。
- Goose 把 provider 放到 `goose-providers`，有 canonical model metadata、request log、retry、thinking、usage estimator，并修过 DeepSeek/Kimi thinking tool call 流式边界。
- LiteLLM 最新主线继续加厚 gateway、router、call lifecycle、cache、cost、provider transformation。
- RTK 的重点是输出压缩、never-worse guard、token savings analytics；它的命名多用 `compact`、`filter`、`truncate`、`analytics`，不用大词包装普通输出处理。

当前缺口：

- `outputKernel` 不是错字，但不是最准确的职责名。它实际做的是 tool output 分类、投影、压缩指标和恢复提示，更接近 `toolOutputGovernance` 或 `toolOutputProjection`。
- provider 已有结构，但还需要一次性收束成 provider/model/transport/relay/request lifecycle 的终局边界。
- cost/cache 有事实，但还没有形成用户可理解、可追踪、可验收的生产账。
- CLI/TUI/Web 共享底层逻辑，但现场表达是否完全一致还需要验收。
- eval 还不能证明“真实生产路径可用”。
- 大文件中可能存在职责过宽，不应只按行数拆，但必须审查变化原因是否一致。

未知点：

- 真实 provider 长时间运行下，context drift、summary 质量、cache 命中、TUI 长输出性能仍需要实战或场景 eval 证明。
- 当前 spec 是否已经完整覆盖最新 provider relay、TUI 现场、tool output 治理，需要执行时逐项对照。

## 3. 失败测试

执行前必须把以下内容视作失败场景：

- `rg -n "outputKernel|output-kernel|tool output kernel|kernal|Kernal" src tests spec README.md package.json` 仍出现旧命名。
- `rg -n "legacy|team\\(|team legacy|旧|兼容旧" src tests spec README.md` 出现不属于当前事实主干的残留。
- provider 中 `catalog`、`transport`、`relay`、`responsesAdapter`、`chatCompletionsAdapter` 的职责边界无法用一句话说明。
- `node dist/cli.js doctor` 对当前 `.kitty/.env` 的 provider 错误不能给出可执行诊断。
- `node dist/cli.js status`、TUI 底部现场、Web status 对同一 session 暴露的核心事实不一致。
- tool output 治理不能证明 raw evidence 可恢复、model-facing projection 有界、token savings 可记录。
- eval 不能覆盖 init/doctor、长会话压缩、provider 错误、background、subagent、TUI 长输出、cache/cost 事实。
- `npm.cmd run verify` 不通过。

## 4. 目标

本次交付的终局目标：

- 形成一套顶尖标准的 Kitty 本地 agent harness：输入、上下文、工具、状态、恢复、输出、成本事实全部闭环。
- provider 层按 Provider、Model、Transport、Relay、Request Lifecycle、Usage/Cache Facts 分清职责。
- tool output 模块命名回到职责本身，删除 `outputKernel` 这种过重表达。
- context/session/memory/recovery 保持连续性，不把内部状态伪装成用户意图。
- CLI/TUI/Web 共享 session/event/status 主事实，只做各自呈现。
- eval 成为真实产品验收，而不是静态检查集合。
- spec、README、tests 与当前实现同步。
- 全局命名审查完成，去掉不准确的大词、假抽象和历史残留。

## 5. 不做范围

- 不做企业安全审批主线。
- 不做 team。
- 不做远程 SSH/Telegram 替代方案。
- 不做新 UI 大改或 TUI 视觉翻新，除非它阻断现场表达一致性。
- 不做 provider 自动路由，因为当前用户主要使用单模型或明确配置模型。
- 不做旧路径兼容层；重命名后源码、测试、文档只保留当前事实。
- 不为了减少行数机械拆文件。

## 6. 设计

### 6.1 总主线

按成熟 harness 主链路收束：

输入进入 host。
host 建立 turn。
context 组装当前事实。
provider 执行模型请求。
tool 执行改变状态。
session/event 记录事实。
runtime status 暴露现场。
CLI/TUI/Web 渲染同一事实。
eval 证明真实路径。

### 6.2 Provider 终局边界

- `catalog`：只描述 provider/model 能力、限制、成本、cache、reasoning、tool support。
- `transport`：只负责 HTTP 请求形态、endpoint、headers、stream/non-stream。
- `relay`：只负责 YLS/TTAPI 这类中转差异，不污染正常 provider。
- `responsesAdapter` / `chatCompletionsAdapter`：只负责协议消息转换。
- `request`：只负责编排一次请求生命周期，包括 abort、retry、usage、cache facts、error normalization。
- `usageNormalizer`：只负责 usage 字段归一，不做请求判断。

### 6.3 Tool Output 终局边界

把 `outputKernel` 重命名为职责准确的模块。

候选终局名：

- 首选：`src/tools/outputGovernance/`
- 类型名保留或收束到 `ToolOutputGovernance`。
- 测试名改为 `tests/tools/output-governance.test.ts`。

理由：

- 当前模块不是 OS kernel，也不是运行核心。
- 它做的是治理：分类、投影、压缩、指标、恢复提示。
- `governToolOutput` 已经表达了真实职责，目录和测试应该与函数一致。

### 6.4 Cost/Cache 终局边界

- provider request 只记录事实，不做夸张估算。
- cost/cache facts 进入 session/event/status。
- CLI/TUI/Web 都能看到同一套成本事实。
- output governance 记录 saved tokens，但不伪造 provider cache hit。
- stable prefix 变化必须可追踪到输入事实变化。

### 6.5 Context/Session/Recovery 终局边界

- session 是运行账本。
- memory asset 是可审阅投影。
- working memory 是当前轮模型上下文。
- internal wake/status 不能进入用户意图。
- “继续”必须从当前 session facts 恢复，而不是复述历史。

### 6.6 UI 外壳一致性

- CLI、TUI、Web 不各自推导业务事实。
- UI 只订阅或读取 session/event/status。
- TUI 特有布局只做呈现，不拥有任务状态。
- local commands 不消耗模型 token，不污染 session memory。

### 6.7 Eval 终局边界

eval 必须覆盖真实用户路径：

- init -> doctor -> 首次对话。
- provider relay 正常和错误诊断。
- 长会话 -> 压缩 -> 继续。
- background 启动 -> 卡住 -> status 可见 -> stop 干净。
- subagent 启动 -> worker 完成 -> lead 接回。
- tool output 大输出 -> projection 有界 -> raw evidence 可恢复。
- TUI 长输出 -> 滚动和现场稳定。
- cost/cache facts -> CLI/TUI/Web 一致。

### 6.8 命名标准

命名必须遵守：

- 名字说职责，不说气势。
- 能用 `projection`、`governance`、`catalog`、`transport`、`adapter`、`store`、`snapshot`、`status`，不用 `kernel`、`engine`、`manager`。
- `utils` 只保留真正跨域的小函数；一旦承载业务判断，就迁入业务模块。
- 测试名描述产品行为，不描述内部口号。
- spec 使用用户能懂的名词，源码使用职责清楚的名词。

## 7. 实施任务

- [x] 全局命名审查：用 `rg` 扫描 `kernel/kernal/engine/manager/helper/utils/legacy/team`，逐项判断是职责准确、普通工具、还是假抽象。
- [x] 重命名 tool output 模块：`src/tools/outputKernel` -> `src/tools/outputGovernance`，同步 imports、tests、spec、README。
- [x] 收束 tool output 文案：测试和文档统一使用 “tool output governance”，不再出现 “output kernel”。
- [x] 审查大文件职责：逐个检查超过 12000 字节的源码文件，只有变化原因混杂时才拆。
- [x] Provider 边界验收：检查 `catalog/transport/relay/adapter/request/usage/cache` 是否按 6.2 分工，必要时移动逻辑，不保留旧包装。
- [x] Relay 终局验收：确认 YLS/TTAPI 中转差异只在 relay 层出现，正常 provider 不被中转特判污染。
- [x] Reasoning/tool-call 验收：确认 DeepSeek/Kimi reasoning 内容回传、无 thinking 模型、多轮 tool call 都有测试保护。
- [x] Cost/cache 事实贯通：确认 provider usage、cache policy、stable prefix、tool saved tokens 都进入统一事实，不各端各算。
- [x] CLI/TUI/Web 现场一致：确认三端读取同一 session/event/status 事实；UI 层不重复业务推导。
- [x] Recovery 验收：补齐或强化“继续”、background、subagent、TUI 重开后的恢复场景。
- [x] Eval 真实场景：把 6.7 的用户路径落成可运行 eval 或明确的自动测试。
- [x] Spec 同步：更新 `spec/用户审阅` 和 `spec/技术实现`，只写当前事实主干。
- [x] README 同步：README 只写宣传、安装、使用、核心体验，不塞开发细节。
- [x] 验证：运行局部测试、`npm.cmd run verify`、必要的 `node dist/cli.js doctor/status/eval/tui` 检查。
- [x] 收口：更新本计划收口，列明完成事实、验证命令、剩余风险。

## 8. 验证计划

局部验证：

```bash
rg -n "outputKernel|output-kernel|tool output kernel|kernal|Kernal" src tests spec README.md package.json
rg -n "legacy|team\\(|team legacy" src tests spec README.md
npm.cmd run typecheck
npm.cmd run test:core
```

产品入口验证：

```bash
npm.cmd run build
node dist/cli.js doctor
node dist/cli.js status
node dist/cli.js eval
node dist/cli.js tui
```

完整验证：

```bash
npm.cmd run verify
```

手动验收：

- 用当前 `.kitty/.env` 真实 provider 跑一轮普通对话。
- 用 TUI 跑一轮长输出，确认输入、滚动、现场、markdown 不错位。
- 触发一次大工具输出，确认模型看到的是有界证据，raw output 可恢复。
- 触发一次 provider 错误，确认诊断能指导用户修配置。

未验证内容必须在收口中明确写出。

## 9. 收口

已完成。

完成事实：

- `src/tools/outputKernel/` 已重命名为 `src/tools/outputGovernance/`，源码、测试和类型引用全部同步。
- `tests/tools/output-kernel.test.ts` 已重命名为 `tests/tools/output-governance.test.ts`，测试描述统一为 tool output governance。
- `kitty eval --run` 新增 `tool-output-governance-ready` 场景，验收测试失败、搜索输出和超大通用输出的有界投影、恢复路径和 saved tokens。
- Provider 边界已按当前事实验收：catalog 管 provider/model 能力，transport 管 doctor probe，relay 只通过 provider transport 进入，DeepSeek reasoning tool-call replay 有测试保护。
- Cost/cache 事实已按当前事实验收：provider usage、cache policy、stable prefix、tool saved tokens 进入 runtime status / scene / eval。
- CLI/TUI/Web 边界已按当前事实验收：CLI status 和 TUI dock 读取 runtime scene；Web 入口复用 interactive shell / host turn，不另建 agent 主线。
- `spec/用户审阅/系统核心/核心地图.md`、`spec/技术实现/T03-工具与扩展/01-Core工具.md`、`README.md` 已同步当前事实。
- `.kitty/.kittyignore` 通过 `node dist/cli.js init` 补齐，`.kitty/` 已被 git ignore，不进入仓库提交。

验证命令：

- `rg -n "outputKernel|output-kernel|tool output kernel|kernal|Kernal" src tests spec README.md package.json`：无命中。
- `rg -n "legacy|team\\(|team legacy" src tests spec README.md package.json`：无命中。
- `npm.cmd run typecheck`：通过。
- `node --test .test-build/tests/evaluation/harness.test.js`：通过。
- `node --test .test-build/tests/tools/output-governance.test.js .test-build/tests/tools/bash-output-governance.test.js`：通过。
- `npm.cmd run verify`：通过，253 个测试全绿。
- `node dist/cli.js eval --run`：通过，12 个产品验收场景全绿。
- `node dist/cli.js status`：通过。
- `node dist/cli.js doctor`：通过，YLS responses probe ok。

未验证内容：

- 未在真实交互 TTY 中打开 `node dist/cli.js tui`，因为当前工具环境不是交互终端；TUI 构建和自动化测试已由 `npm.cmd run verify` 覆盖。

剩余风险：

- 真实 provider 的多日长任务漂移、缓存命中稳定性和 TUI 长时间使用性能仍需要实际生产使用观察；本次已把本地可机器验证的封顶验收补齐。
