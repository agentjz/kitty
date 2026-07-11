# Kitty Mature Engineering Baseline Plan

## 1. 需求文档

Kitty 已经具备一个智能体工作台的核心形态：它能接收任务、组装上下文、调用模型、执行工具、保存 session、管理后台和子代理、暴露 runtime status，并通过 CLI/TUI/Web/Telegram 进入同一条主链路。

现在要解决的不是“再加一个功能”，而是把项目拉到成熟工程基线：激进改动仍然允许，但代码、测试、文档、运行状态和发布节奏必须稳定。成熟不是慢，也不是保守。成熟是：每个事实有唯一 owner，每条测试保护真实风险，每个模块有明确变化原因，每个发布有可重复验收。

这份计划完成后，Kitty 应该达到以下状态：

- 当前主链路不用的旧平台层被删除；
- 同类事实被统一到一个 owner；
- provider、context、session、execution、tool output、runtime projection 都有明确 contract；
- 测试不再保护文案、模板、装饰和旧语义；
- 错误分类能指导 retry、fallback、CLI 展示和恢复；
- 大文件按变化原因审计，必要时拆分；
- `spec.md`、`dev.md`、代码、测试描述同一个当前事实；
- `history.md` 保留历史证据，不进入当前产品主干；
- `npm.cmd run verify` 是可靠的日常门槛，production eval 是显式真实验收。

当前范围包含：

- 删除当前主链路不用、只靠测试续命的旧 capability/protocol 平台；
- 统一 provider request contract；
- 统一 execution output reader；
- 统一 runtime projection owner；
- 统一 config contract；
- 统一 tool output raw/projection/model-view 链路；
- 建立 provider/config/session/tool/execution 错误分类；
- 清洗测试，删除文案/模板/装饰型测试；
- 补齐核心行为 contract 测试；
- 审计超过 300 行的文件，按变化原因决定拆分或保留；
- 固化 release gate；
- 同步 `spec.md` 和 `dev.md`。

当前范围不包含：

- 不重写 `history.md`；
- 不新增 provider；
- 不发布 npm；
- 不升级版本；
- 不重做 TUI 视觉；
- 不引入旧兼容层；
- 不为了减少行数机械拆文件；
- 不为了测试数量好看保留无意义测试；
- 不把当前没有的能力写进文档或输出。

业务完成标准：

```text
当前能跑的主链路更清楚。
当前不用的历史层被删除。
重复事实收敛为单 owner。
测试保护行为，不保护装饰。
错误能分类，恢复路径更准。
完整 verify 通过。
spec/dev/代码/测试一致。
```

## 2. 开始时事实与实施后更新

### 2.1 主链路事实

当前 `spec.md` 定义的主链路是：

```text
宿主输入
  -> host turn
  -> agent turn
  -> context request
  -> provider request
  -> 工具批次或最终回答
  -> session / control-plane / observability 持久化
  -> 宿主输出
```

对应源码：

- `src/host/turn.ts`：host turn、session event、lead wait、wake closeout、observability、abort/failure 收口。
- `src/agent/turn/run.ts`：agent/model/tool loop。
- `src/context/runtime/`：prompt layers、conversation window、compression、context budget。
- `src/provider/`：catalog、capabilities、request body、dialect、adapter、retry、fallback、usage。
- `src/session/`：snapshot、messages、memory、task state、todo、workset。
- `src/control/`：SQLite control-plane ledger。
- `src/execution/`：background/subagent execution lifecycle、cancel/reconcile/process tree。
- `src/runtime/`：status 聚合和 scene 投影。
- `src/shell/tui/`：TUI 状态、布局、transcript、runtime dock。
- `src/tools/`：core tools、tool registry、tool output governance。
- `src/extensions/`：当前扩展工具注册。

### 2.2 规模事实

开始时 research 统计：

- `src`：约 417 个 TS/TSX 文件，约 34332 行。
- `tests`：约 74 个 TS/TSX 文件，约 9069 行。
- 当时 `npm.cmd run verify` 通过；最终验证结果见第 9 节。

开始时超过 300 行、需要做职责审查的源码文件：

- `src/context/runtime/compression/builder.ts`：460 行；
- `src/provider/catalog.ts`：441 行；
- `src/session/snapshot.ts`：356 行；
- `src/evaluation/production.ts`：350 行；
- `src/provider/request.ts`：322 行；
- `src/host/turn.ts`：312 行；
- `src/protocol/manifest.ts`：308 行；
- `src/telegram/service.ts`：306 行；
- `src/tools/edit.ts`：300 行。

行数不是拆分理由，但这些文件必须做职责审查。

### 2.3 已成熟的部分

这些部分已经有明显成熟工程味道，应保留并强化：

- `SessionStoreError` / `SessionCorruptError` 等 session 错误；
- `ToolExecutionError` 和工具参数 contract；
- control-plane SQLite ledger；
- context compression 和 DeepSeek replay 保护；
- provider/model catalog + request dialect 雏形；
- tool output raw/projection 分层；
- background/subagent lifecycle 和 process tree termination；
- TUI active lane 清理测试；
- `eval:local` / `eval:production` 分层。

### 2.4 已确认的开始缺口

开始时的缺口不是单点 bug，而是工程边界未完全收束；处理结果见第 9 节：

1. 旧 capability/protocol 平台残留。
   - `src/protocol/leadWait.ts` 被 control/execution 主链路使用，是当前事实。
   - `src/extensions/capabilities.ts` 只被 `tests/protocol/extension-capabilities.test.ts` 引用。
   - `src/protocol/capabilitySurface.ts` 只被 `tests/protocol/extension-capabilities.test.ts` 引用。
   - `src/protocol/assignment.ts`、`closeout.ts`、`executionPolicy.ts`、`manifest.ts`、`manifestBundle.ts`、`registry.ts`、`summary.ts`、`wakeSignal.ts` 等没有进入当前 host/agent/execution 主链路。

2. 测试保护对象不够成熟。
   - `tests/web/web-shell.test.ts` 测 CSS 颜色、圆角、textarea 高度。
   - `tests/agent/static-prompt.test.ts` 测固定 prompt 句子。
   - `tests/config/project-env-template.test.ts` 测 provider preset label/base URL 出现在模板里。
   - `tests/runtime/status.test.ts` 大量匹配自然语言 status 文案。
   - `tests/interaction/local-commands.test.ts` 匹配 slash help 文案。
   - `tests/docs/current-product-facts.test.ts` 直接匹配 README/philosophy 文案。

3. 错误分类不统一。
   - session/tool 已结构化。
   - provider/retry/fallback/CLI 展示仍大量靠 message/status/code 猜。

4. execution output 逻辑重复。
   - `src/execution/lifecycle.ts` 和 `src/execution/background.ts` 都有 tail/full/summary/truncate 逻辑。

5. runtime projection 边界需要继续硬化。
   - `runtime/status.ts` 应聚合事实。
   - `runtime/scene.ts` 应生成自然投影。
   - CLI/TUI/Web/Telegram 不应重新计算 execution risk、nextAction、active lane。

6. config contract 被模板测试绑死。
   - init template、env example、provider preset、doctor/preflight 应共用配置事实。
   - 测试应保护 required keys、catalog resolvability、ready/not_ready，不保护模板排版。

7. public surface 不够明确。
   - `src/types.ts` 是当前类型 barrel。
   - `src/protocol/index.ts` 不是 `package.json` 声明的公开入口，不能成为旧平台保留理由。

### 2.5 开始时的不确定点

- 是否存在外部用户直接 import `dist` 内部 protocol 文件：当前 package 没声明 public subpath，按当前事实不保留。
- `telegram/service.ts` 是否需要拆：需要按变化原因审查后决定。
- `provider/request.ts` 是否拆 retry/fallback/observability：已按职责拆出 observability，结果见第 9 节。

## 3. 失败测试

这些是本轮必须暴露和修正的失败类型。

### 3.1 旧平台只靠测试续命

失败定义：

```text
某个源码模块不被当前产品主链路使用，只被 tests 引用，但仍保留在 src。
```

检查命令：

```powershell
rg -n "listExtensionCapabilityPackages|CapabilityPackage|CapabilityManifest|CapabilityRegistry|createAssignmentContract|createCloseoutContract" src tests
```

完成后期望：

- 旧 capability package/protocol 平台不再出现在当前源码主干。
- `LeadWaitPolicy` 作为 execution 当前 contract 保留或迁移到 execution/control owner。

### 3.2 测试保护文案和装饰

失败定义：

```text
修改 README/site/prompt/CSS 纯展示细节导致核心 verify 失败，但产品行为没有变。
```

检查命令：

```powershell
rg -n "assert\.match|assert\.doesNotMatch|includes\(" tests
```

完成后期望：

- 剩余 match/contains 测试都保护 schema、wire contract、状态生命周期、安全边界、错误分类或真实用户路径。
- 纯文案、颜色、圆角、模板排版不进入 core test。

### 3.3 Provider contract 分散

失败定义：

```text
Chat Completions 请求体按 provider 名称散落特判，绕过 catalog/capability/dialect。
```

完成后期望：

- request body 只读 model profile / capabilities / dialect。
- DeepSeek、NVIDIA、Agnes、Gemini、openai-compatible 都有 request body contract 测试。

### 3.4 Retry/fallback 靠 message 猜

失败定义：

```text
认证错误、参数错误、限流、临时网络、stream framing、abort 不能明确分类。
```

完成后期望：

- abort 不 retry；
- 认证/参数/provider contract 错误不 fallback；
- stream framing 可以 fallback；
- 429/5xx/网络错误按 retry budget 重试；
- CLI 展示使用 error kind，不复制判断逻辑。

### 3.5 Execution output 重复

失败定义：

```text
background read、subagent read、execution read 的 tail/full/summary/truncate 行为不一致。
```

完成后期望：

- 单一 execution output reader；
- 调用方只负责接线；
- 统一测试覆盖 output selection。

### 3.6 UI 保存第二状态

失败定义：

```text
TUI 保存 completed/stale execution lane，或自己推导 execution 终态。
```

完成后期望：

- TUI 只显示 control-plane 中 created/running 的 live lane；
- settled execution 自动清除；
- TUI 不重新定义 execution lifecycle。

## 4. 目标

最终代码目标：

1. 删除旧 capability package/protocol 平台。
2. 保留或迁移 `LeadWaitPolicy` 到当前 execution/control owner。
3. Provider request contract 全部通过 catalog/capabilities/dialect 进入 request body。
4. Execution output 读取统一为一个 reader。
5. Runtime status/scene 是 runtime 投影唯一 owner。
6. Config contract 统一，测试不锁模板排版。
7. Tool output raw/projection/model-view 链路统一。
8. 错误分类用于 retry/fallback/CLI 展示。
9. 大文件完成职责审查，必要拆分。
10. `spec.md`、`dev.md`、测试和代码一致。

最终测试目标：

1. 删除只保护旧平台存在的测试。
2. 删除文案、模板、CSS 装饰测试。
3. 保留并补强 provider/context/session/execution/tool/TUI lifecycle contract 测试。
4. `npm.cmd run verify` 通过。
5. 关键改动可按 release gate 跑定向测试。

最终文档目标：

1. `history.md` 不改。
2. `dev.md` 写工程纪律。
3. `spec.md` 写当前产品事实。
4. `plan.md` 收口记录真实完成事实。

## 5. 不做范围

本轮不做：

- 不新增 provider。
- 不重写 `history.md`。
- 不发布 npm。
- 不升级版本。
- 不重做 TUI 视觉。
- 不修改教学站点视觉。
- 不引入企业权限审批主线。
- 不为了兼容保留旧 capability 平台。
- 不为了文件变少而合并职责不同的模块。
- 不为了测试数量变多而保留无意义测试。

## 6. 设计

### 6.0 成熟化矩阵

本轮不是“删一些测试”。本轮按主链路逐段收束。

| 主链路 | 当前 owner | 成熟化动作 | 删除动作 | 验收 |
| --- | --- | --- | --- | --- |
| 配置进入运行时 | `src/config/` + provider catalog | env/template/doctor/preflight 读取同一配置事实 | 删除模板排版、preset 注释细节测试 | 缺 key、错 provider、错 model 明确失败 |
| 上下文进入模型 | `src/context/` + `src/session/` | prompt、memory、compression、budget 分清事实和投影 | 删除只锁固定 prompt 句子的测试 | 用户输入、近场对话、摘要、skill 清单按 contract 进入 request |
| provider 请求 | `src/provider/` | catalog/capability/dialect/request body 单链路 | 删除散落 provider 名称特判 | request matrix 覆盖当前 provider/model |
| 工具执行 | `src/tools/` + `src/extensions/definitions.ts` | core/extension 都进入同一 registry，output 走统一治理 | 删除旧 capability package 平台 | 工具结果有 raw/projection/model view |
| 后台与子代理 | `src/control/` + `src/execution/` | execution lifecycle、output reader、process kill、lead wait 单 owner | 删除旧 protocol execution/closeout/wake 包装 | running/terminal/read/stop/reconcile 行为一致 |
| 状态展示 | `src/runtime/` | status/scene 是唯一 runtime projection owner | 删除 CLI/TUI/Web 自己重算事实 | presenter 只格式化 RuntimeStatus |
| 用户界面 | CLI/TUI/Web/Telegram | 只投影事实，不保存第二状态 | 删除 CSS/文案装饰型 core test | lifecycle、输入输出、active lane 行为受测 |
| 可观测与恢复 | `src/observability/` + session/control-plane | 事件、terminal log、crash、wake fact 只做证据 | 删除把日志当状态源的假 contract | 失败可从事件和状态文件解释 |
| 测试体系 | `tests/` | 行为 contract 测试优先 | 删除当前主链路不用、只为旧模块续命的测试 | verify 绿且测试失败能指向真实风险 |
| 文档体系 | `spec.md` + `dev.md` + `history.md` | 当前事实、开发纪律、历史证据分离 | 删除当前没有的能力描述 | 文档、代码、测试同一事实 |

执行时每个改动必须落到这张矩阵之一。落不上去，说明它不是本轮成熟化主线。

### 6.1 文档分层设计

文档 owner：

- `history.md`：历史证据和失败路径，保留原始演进价值。
- `spec.md`：当前产品事实，只写当前存在能力。
- `dev.md`：开发纪律、测试纪律、删除规则、发布规则。
- `plan.md`：本轮硬化执行合同。

禁止：

- 把历史能力写进 `spec.md`；
- 把工程纪律写成产品能力；
- 把计划里的未实现目标写进 README。

### 6.2 删除设计

删除顺序：

1. 删除 `tests/protocol/extension-capabilities.test.ts`。
2. 删除 `src/extensions/capabilities.ts`。
3. 删除 `src/protocol` 中不被源码主链路引用的旧平台文件。
4. 保留或迁移 `leadWait.ts`。
5. 删除 `src/protocol/index.ts` 旧 barrel。

判断标准：

```text
当前源码主链路不用 + 当前 spec 不描述 + 只被测试引用 = 删除。
```

### 6.3 Provider contract 设计

Provider/model 当前事实归属：

- provider/model 固有事实：`src/provider/catalog.ts`；
- 请求期能力投影：`src/provider/capabilities.ts`；
- Chat Completions 方言：`src/provider/chatRequestDialect.ts`；
- output token clamp：`src/provider/maxOutputTokens.ts`；
- request body 装配：`src/provider/chatRequestBody.ts`；
- Responses request body：Responses adapter/request 模块。

规则：

- request body 不直接按 provider 名称散落特判；
- 新 provider/model 先进 catalog，再通过 capabilities/dialect 投影；
- context/output limit 由 model profile 决定；
- unknown provider/model 显式失败。

### 6.4 Execution 设计

Execution 当前事实归属：

- lifecycle record：control-plane SQLite；
- process termination：execution process layer；
- output read：新增单一 reader；
- status/scene：runtime projection；
- TUI dock：只读 active facts。

统一 reader：

```text
ExecutionRecord + mode + lines + maxChars
  -> id/kind/status/mode/output/truncated/bytes/summary/lastOutputAt
```

调用方：

- `background_read`；
- `subagent_read`；
- `kitty execution read`；
- CLI presenter。

### 6.5 Runtime projection 设计

Runtime facts owner：

- `buildRuntimeStatus()` 聚合 session、memory、skills、project map、control-plane、observability。
- `buildRuntimeScene()` 只从 RuntimeStatus facts 生成自然现场。
- CLI/TUI/Web/Telegram 只消费 RuntimeStatus 或 RuntimeScene。

规则：

- Presenter 不能重新计算 execution risk。
- TUI 不能保存终态 execution lane。
- Runtime scene 不落盘，不成为第二状态源。

### 6.6 Config contract 设计

Config facts owner：

- env key：`src/config/envKeys.ts`；
- initial defaults：`src/config/initialConfig.ts`；
- provider presets：`src/config/providerPresets.ts`；
- project template：`src/config/projectEnvTemplate.ts`；
- preflight/doctor：`src/config/preflight.ts` + CLI doctor。

测试只保护：

- required keys 完整；
- active provider preset 可解析；
- `.env.example` 能由当前模板生成；
- preflight ready/not_ready；
- catalog error 显式暴露；
- API key present/missing 显式暴露。

测试不保护：

- 注释顺序；
- 每个 preset 文案；
- 模板大段文本；
- 展示排版。

### 6.7 Tool output 设计

Tool output facts owner：

- raw output capture：工具输出捕获；
- governance projection：`src/tools/outputGovernance/`；
- model view：`src/agent/toolResults/modelProjection.ts`；
- observability：tool output event；
- recovery path：output metadata。

规则：

- 模型只看 bounded projection；
- 原始输出可恢复；
- projection 不替模型下语义结论；
- bash/test/search/git diff 大输出都走同一治理链。

### 6.8 错误分类设计

目标错误分类：

```text
ConfigError
ProviderError
  - auth
  - contract
  - temporary
  - rate_limit
  - server
  - not_found
  - stream_framing
ToolExecutionError
SessionStoreError
ExecutionLifecycleError
AbortError
```

使用规则：

- retry 读 ProviderError.kind；
- fallback 只接受 stream_framing；
- CLI 展示读 error kind；
- session corrupt 不伪装成 provider/model failure；
- abort 直接中止，不进入 retry/fallback。

### 6.9 大文件职责审计设计

审计标准不是行数，是变化原因。

保留大文件的条件：

- 单一职责；
- 同一变化原因；
- 没有混合 presenter/state/IO/business rule；
- 测试能覆盖核心 contract。

拆分条件：

- 状态管理、规则计算、数据读写、渲染展示混在一起；
- provider retry/fallback/observability/client selection 混在一起导致测试难；
- host turn 同时承担 lead wait streaming、wake closeout、host lifecycle，影响理解和验证；
- evaluation runner、scenario、assertion 混在一起。

候选判断：

- `catalog.ts`：事实表为主，可保留；推导逻辑外移。
- `snapshot.ts`：schema parse/serialize 为主，可保留。
- `compression/builder.ts`：如果 provider replay normalizer 干扰 compression，拆 replay。
- `provider/request.ts`：优先拆 retry/fallback/observability helper。
- `host/turn.ts`：优先拆 lead wait host adapter。
- `production.ts`：优先拆 scenario runner 和 assertions。

### 6.10 Release gate 设计

日常门槛：

```powershell
npm.cmd run verify
```

改动类型加测：

- provider/catalog/request：provider tests；
- context/session：context + session tests；
- execution/background/subagent：execution + host lead wait tests；
- TUI：tui render/store/shell tests；
- tool output：tools output governance tests；
- config：config/preflight/schema tests。

真实验收：

```powershell
npm.cmd run eval:local
npm.cmd run eval:production
```

`eval:production` 只在用户明确要求、关键 release 或 provider 主链路大改后执行。

### 6.11 不偏不倚验收口径

本计划完成后，项目必须同时满足四个条件：

1. 删除：当前主链路不用的旧平台、旧测试、旧事实不存在。
2. 统一：同一种事实只有一个 owner，展示层不重算。
3. 保护：测试保护真实行为、wire contract、状态生命周期、错误边界。
4. 解释：`spec.md` 说明当前产品，`dev.md` 说明开发纪律，`history.md` 只保留历史。

只删测试但不统一 owner，失败。

只拆文件但错误和事实仍然散落，失败。

只跑绿 verify 但文档和代码事实不一致，失败。

只保留大文件不说明职责边界，失败。

只为了“成熟感”新增抽象，失败。

每个阶段收口都必须回答：

```text
保留了什么当前事实。
删除了什么历史残留。
统一到了哪个 owner。
新增或保留了什么行为测试。
spec/dev 是否需要同步。
```

### 6.12 执行顺序原则

顺序按风险收束，不按文件夹收束：

1. 先删当前主链路不用的旧平台，减少假事实。
2. 再统一 execution output，因为它影响 background/subagent/CLI/TUI。
3. 再统一 provider contract 和 error kind，因为它影响真实 API 请求和恢复。
4. 再清测试，把假保护删掉，把真 contract 留住。
5. 再审大文件，避免在旧事实还存在时做无意义拆分。
6. 最后同步 spec/dev 和 release gate。

这个顺序不能反过来。先拆文件或先改测试都会掩盖旧事实。

### 6.13 删除和合并决策表

删除：

```text
当前源码主链路不用
+ spec.md 不描述
+ package.json 不公开
+ production eval 不需要
+ 只被测试引用
= 删除
```

合并：

```text
同一种事实
+ 多个入口重复计算
+ 修改原因一致
+ 测试可用同一 contract 表达
= 统一到一个 owner
```

保留：

```text
当前主链路使用
或用户入口使用
或公开包入口使用
或 production eval 使用
或 spec.md 当前描述且代码真实存在
= 保留
```

拆分：

```text
一个文件混合状态 owner、外部 IO、业务判断、presenter、错误恢复
并且这些部分变化原因不同
= 拆分
```

不拆：

```text
文件超过 300 行
但职责单一、变化原因一致、测试边界清楚
= 保留并在收口说明理由
```

## 7. 实施任务

### 阶段 0：建立执行账本

- [x] 按 6.0 矩阵给每个后续改动标 owner。
- [x] 对删除候选跑引用检查。
- [x] 对统一候选记录当前重复点。
- [x] 对保留的大文件记录一句话职责。
- [x] 确认 `history.md` 不进入改动范围。

验收：

```powershell
git status --short
rg -n "CapabilityPackage|CapabilityManifest|CapabilityRegistry|createAssignmentContract|createCloseoutContract|listExtensionCapabilityPackages" src tests
rg -n "message\.includes|assert\.match|assert\.doesNotMatch|includes\(" src tests
```

### 阶段 1：删除旧平台层

- [x] 删除 `tests/protocol/extension-capabilities.test.ts`。
- [x] 删除 `src/extensions/capabilities.ts`。
- [x] 删除旧 `src/protocol/*` capability package 文件。
- [x] 迁移 `src/protocol/leadWait.ts` 到 execution owner。
- [x] 删除 `src/protocol/index.ts`。
- [x] 跑 typecheck，按编译错误清理残余引用。

验收：

```powershell
npm.cmd run typecheck
rg -n "CapabilityPackage|CapabilityManifest|CapabilityRegistry|createAssignmentContract|createCloseoutContract|listExtensionCapabilityPackages" src tests
```

### 阶段 2：统一 execution output

- [x] 新增单一 execution output reader。
- [x] `background_read` 改用统一 reader。
- [x] `subagent_read` 改用统一 reader。
- [x] `kitty execution read` 改用统一 reader。
- [x] 删除重复 tail/full/summary/truncate helper。
- [x] 增加 reader contract 测试。

验收：

```powershell
npm.cmd run test:build
node --test .test-build/tests/execution/*.test.js .test-build/tests/extensions/background-tools.test.js .test-build/tests/extensions/subagent-tools.test.js
```

### 阶段 3：统一 provider contract

- [x] 审查 catalog/capabilities/dialect/request body 是否有散落特判。
- [x] 为当前 Chat Completions provider/model 建 request matrix。
- [x] 补齐 DeepSeek/NVIDIA/Agnes/Gemini/openai-compatible request body 测试。
- [x] 补齐 Responses request body 输出 token clamp 测试。
- [x] 保证 context effective budget 读取 model limit。

验收：

```powershell
npm.cmd run test:build
node --test .test-build/tests/provider/*.test.js .test-build/tests/context/compression.test.js
```

### 阶段 4：统一错误分类

- [x] 引入 provider error kind。
- [x] provider request/transport/adapter 投影错误 kind。
- [x] retry 使用 error kind。
- [x] stream fallback 只接受 stream_framing。
- [x] CLI/user-facing error 只做展示。
- [x] execution unknown/cancel/abort 使用结构化错误或稳定 code。
- [x] 增加错误分类测试。

验收：

```powershell
npm.cmd run test:build
node --test .test-build/tests/provider/retry-policy.test.js .test-build/tests/provider/request-fallback.test.js .test-build/tests/provider/connection.test.js .test-build/tests/cli/program.test.js
```

### 阶段 5：清洗测试

- [x] 删除 Web CSS/圆角/颜色/高度测试，保留 WebSocket 行为测试。
- [x] 删除 prompt 固定句子测试，保留“不硬编码工具表面”等不变量。
- [x] 删除 provider preset 模板展示测试，保留 env contract。
- [x] 删除 docs 纯文案测试，保留“不得出现已删除运行时能力”。
- [x] Runtime status 测试改为结构事实为主，自然语言为辅。
- [x] Local command help 测试改为 registry metadata 和 command execution 行为。

验收：

```powershell
rg -n "assert\.match|assert\.doesNotMatch|includes\(" tests
```

人工确认剩余匹配保护真实 contract。

### 阶段 6：统一 runtime projection

- [x] 确认 execution risk/nextAction 只在 runtime scene 或 execution summary owner 里计算。
- [x] CLI presenter 不复制 risk 规则。
- [x] TUI dock 只显示 active control-plane lanes。
- [x] Web/Telegram 不拥有 runtime facts。
- [x] 补强 TUI active lane lifecycle 测试。
- [x] TUI context budget 只读取当前选中 session，不读取全局 latest session。
- [x] TUI 单轮计时从用户提交持续到最终模型回答，不随模型或工具阶段重置。

验收：

```powershell
npm.cmd run test:build
node --test .test-build/tests/runtime/status.test.js .test-build/tests/shell/tui-store.test.js .test-build/tests/shell/tui-shell.test.js
```

### 阶段 7：统一 config contract

- [x] 保留 required env key 检查。
- [x] 保留 default active provider 可解析检查。
- [x] 保留 preflight ready/not_ready 检查。
- [x] 删除模板排版和 preset 注释细节检查。
- [x] 确保 init template、env example、doctor 使用同一配置事实。
- [x] 恢复 YLS 与 TTAPI 的当前 provider preset。

验收：

```powershell
npm.cmd run test:build
node --test .test-build/tests/config/*.test.js .test-build/tests/cli/program.test.js
```

### 阶段 8：大文件职责审计

- [x] 审计 `compression/builder.ts`。
- [x] 审计 `catalog.ts`。
- [x] 审计 `snapshot.ts`。
- [x] 审计 `production.ts`。
- [x] 审计 `provider/request.ts`。
- [x] 审计 `host/turn.ts`。
- [x] 审计 `telegram/service.ts`。
- [x] 审计 `tools/edit.ts`。
- [x] 对需要拆分的文件做最小边界拆分。
- [x] 对可保留的文件在 plan 收口写明理由。

验收：

```powershell
npm.cmd run typecheck
```

### 阶段 9：同步文档和 release gate

- [x] 更新 `spec.md` 当前事实。
- [x] 确认 `dev.md` 已覆盖本轮纪律，不增加重复规则。
- [x] 不改 `history.md`。
- [ ] 在 plan 收口记录实际完成、验证、风险。
- [x] 明确后续发布前命令。

验收：

```powershell
npm.cmd run verify
```

## 8. 验证计划

定向验证按阶段执行。

最终完整验证：

```powershell
npm.cmd run verify
```

关键路径可选验证：

```powershell
npm.cmd run eval:local
```

真实 provider 验收只在用户明确要求时执行：

```powershell
npm.cmd run eval:production
```

最终 grep 验收：

```powershell
rg -n "CapabilityPackage|CapabilityManifest|CapabilityRegistry|createAssignmentContract|createCloseoutContract|listExtensionCapabilityPackages" src tests
rg -n "assert\.match|assert\.doesNotMatch|includes\(" tests
rg -n "TODO|FIXME|legacy|compat|alias" src tests spec.md dev.md
```

验收解释：

- 第一条确认旧平台层没有残留。
- 第二条人工确认剩余字符串匹配保护真实 contract。
- 第三条确认没有旧兼容和临时债务进入当前主干。

验证边界：

- `verify` 不调用真实 provider；本次已额外执行 DeepSeek production eval。
- TUI 的终端审美仍需要人眼验收，自动测试只保护可观察的布局与生命周期 contract。
- Windows 不执行 POSIX 进程树终止测试；该测试在当前平台按设计 skip。

## 9. 收口

完成状态：已完成。

### 实际完成

- 删除不进入当前主链路、仅由测试维持的 capability/protocol 平台；lead wait 已归属 `src/execution/leadWait.ts`。
- execution 的 background、subagent 与 CLI 读取统一到单一 output reader。
- provider 请求按 catalog、capability、dialect 组装；错误在请求边界归一，retry 与 stream fallback 按 error kind 决策。
- 空工具数组不再进入 Chat Completions request；工具成功但没有文本输出时，会写入明确的非空模型事实。
- 已用 DeepSeek 真实 production eval 证明工具链闭环：assistant tool call、tool result、`tool.completed`、最终 assistant answer 均存在。
- TUI context budget 只读取选中的 session；本轮计时从用户提交持续到最终回答，显示在右侧 context 后，不因 thinking、工具或后续 provider request 重置。
- Runtime status 的 wake signal 只展示最新 10 条；取消 subagent 的最新 wake 不会被历史信号遮蔽。
- YLS 与 TTAPI 当前 provider preset 已恢复到 template/config 事实源；当前 `.kitty/.env` 使用 DeepSeek。
- 删除文案、模板和 CSS 外观型测试，保留 wire contract、状态生命周期、配置、工具与宿主行为测试。
- `spec.md` 已同步当前事实，`dev.md` 保持开发纪律；`history.md` 未修改。

### 验证

- `npm.cmd run verify`：通过，288 passed，1 skipped，0 failed。skip 为 Windows 上不适用的 POSIX 进程树测试。
- `npm.cmd run eval:local`：通过。
- `node dist/cli.js eval --run-production`：使用当前 DeepSeek 配置通过。
  - `production-config-preflight`
  - `production-provider-probe`
  - `production-real-turn`
  - `production-tool-turn`
  - `production-runtime-status`
- `git diff --check`：通过；仅有 Windows Git 换行提示，没有 whitespace error。

### 发布收口

- 项目所有者已明确要求发布；版本已从 `0.0.25` 升级至 `0.0.26`。
- 已提交并推送 `76bb94c` 到 `origin/master`。
- `@jun133/kitty@0.0.26` 已发布到 npm 的 `latest` tag。
- 已验证当前公开面和主链路。无法从仓库证明的外部私有 import 不构成保留已删除内部平台的理由。

已确认的最高优先级：

1. 删除旧 capability/protocol 平台。
2. 统一 execution output reader。
3. 统一 provider request contract。
4. 统一 provider/config/session/tool/execution 错误分类。
5. 清洗文案/模板/装饰型测试。
6. 同步 `spec.md` 和 release gate。

完成前不得：

- commit/push，除非用户明确要求；
- publish；
- 改 `history.md`；
- 保留旧兼容层；
- 用测试为当前主链路不用的代码续命。
