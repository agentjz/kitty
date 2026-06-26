# Kitty 开源级架构封顶验收 Plan

## 1. 需求文档

用户要解决的不是某个局部 bug，而是确认 Kitty 是否具备优秀开源 agent 项目应有的维护方式，并把不足一次性收成可执行交付。

这次交付面向两类人：

- 日常使用 Kitty 的用户：希望 Kitty 能长期作为主力本地 agent 使用，不卡在上下文、provider、TUI、工具输出、恢复和诊断上。
- 继续开发 Kitty 的维护者：希望仓库结构、模块边界、spec、测试和配置事实清楚，不靠口头记忆维护。

业务完成标准：

- Kitty 的维护方式达到优秀开源项目标准：核心主干清楚、模块职责清楚、配置事实集中、测试能验收真实路径。
- 把“顶尖标准”翻成可验收的终局，不写成“继续优化”。
- 把任务定成生产级封顶验收，不写成后续优化或逐步改进。
- 接到明确问题后，把 research、设计、实现、测试、文档同步和验证收成一个完整交付。
- 不交半成品。

当前范围包含：

- 仓库结构和 monorepo 判断。
- `spec/` 当前事实主干补齐。
- core harness 主链路：session、turn、context、tool、state、recovery、output。
- provider/model/transport/relay/request/usage/cache 边界。
- CLI/TUI/Web/Telegram 作为 UI 壳的事实一致性。
- eval 从检查集合升级成生产路径验收，并且生产路径验收独立于普通 `npm test`。
- 大文件职责审查和必要拆分。
- `.kitty/.env` 动态配置边界审查。

当前范围不包含：

- 企业安全沙箱。
- team 复活。
- 远程控制新方案。
- 为了显得专业而机械改 monorepo。
- 为了减少行数而机械拆文件。
- 把所有内部常量塞进 `.env`。

## 2. 当前事实

已确认仓库事实：

- Kitty 当前是单 npm 包，不是 monorepo：根 `package.json` 没有 `workspaces`，包名是 `@jun133/kitty`。
- 当前源码按模块组织在 `src/agent`、`src/context`、`src/provider`、`src/session`、`src/tools`、`src/shell/tui`、`src/web`、`src/telegram` 等目录。
- `spec/` 目前只有入口和少量主题文档，技术实现中只看到 `T04-Host边界.md`，覆盖面明显落后于代码主干。
- `.kitty/.env` 与 `.kitty/.env.example` 都有 33 个 active `KITTY_*` key，key 集合一致。
- 配置主链路集中在 `src/config/envKeys.ts`、`src/config/projectEnvTemplate.ts`、`src/config/runtime.ts`、`src/config/schema.ts`、`src/config/preflight.ts` 和对应测试。
- 核心动态参数已经进入 `.env`：provider、model、baseUrl、apiKey、thinking、reasoningEffort、上下文预算、输出 token、read bytes、Telegram、extension switches、show reasoning、command stall timeout。
- 缺失或非法的核心运行配置会报错，不是静默兜底。
- 源码仍有内部常量，例如 status recent limit、provider timeout、retry delay、tool output preview、TUI layout rows、memory/session truncation。这些不自动等于 `.env` 缺口。

已确认参考项目事实：

- opencode 是 monorepo，拆出 `packages/opencode`、`llm`、`schema`、`protocol`、`session-ui`、`tui`、`web`、`sdk`、`plugin` 等包。
- Cline 是 monorepo，拆出 `apps/*` 和 `sdk/packages/*`。
- Codex 是 Rust workspace，拆出 `core`、`protocol`、`tui`、`thread-store`、`model-provider`、`skills`、`plugins`、`exec-server` 等 crate。
- Goose 是 Rust workspace，拆出 `goose`、`goose-cli`、`goose-providers`、`goose-sdk`、`goose-server`、`goose-test` 等 crate。
- 这些项目采用 workspace/monorepo 的原因是多产品面、多可复用包、多发布边界，不是因为目录多就更成熟。

已确认结构压力：

- 超过 300 行并需要职责审查的源码文件包括：
  - `src/evaluation/checks.ts`
  - `src/shell/tui/transcriptLayout.ts`
  - `src/context/runtime/compression/builder.ts`
  - `src/session/snapshot.ts`
  - `src/provider/responsesAdapter.ts`
  - `src/host/turn.ts`
  - `src/protocol/manifest.ts`
  - `src/telegram/service.ts`
- 这些文件不一定都要拆，但必须逐个证明职责单一、变化原因一致、内部耦合合理。

当前缺口：

- `spec/` 没覆盖 provider、memory、context、tools、TUI、eval、config、protocol 等关键模块设计。
- Kitty 当前是“单包模块化”，但内部边界还没有完全达到优秀 workspace 项目的清晰程度。
- eval 已有基础，但还没有把真实生产路径完整封顶；真实 provider 和长链路验收必须显式触发，不能混进日常测试。
- UI 壳共享底层 runtime 的方向正确，但还需要验收 CLI/TUI/Web/Telegram 是否只呈现同一事实，而不是各自推导状态。
- provider 层已经明显加强，但仍要审查 relay、Responses、Chat Completions、DeepSeek reasoning replay、usage/cache 是否各在正确位置。

未知点：

- 真实 provider 多日长任务下的漂移、缓存命中稳定性、TUI 长时间滚动性能无法只靠一次本地测试完全证明。
- 是否需要 monorepo，要等包边界和发布边界完成审查后决定，不能先入为主。

## 3. 失败测试

以下任何一条成立，都视为本次封顶验收失败：

- `spec/` 仍不能让新维护者理解 Kitty 的核心模块边界。
- provider/model/transport/relay/request/usage/cache 的职责不能分别用一句话说清。
- `.env` 缺失用户必须配置的动态参数，或源码里存在用户经常要改却只能改代码的运行参数。
- `.env` 被内部展示限制、preview 长度、列表行数等产品边界污染。
- CLI/TUI/Web/Telegram 对同一 session 的现场状态说法不一致。
- eval 不能覆盖真实产品路径，只剩函数级检查。
- 真实 provider、长会话、background/subagent 实战验收被塞进普通 `npm test`，导致日常开发测试变慢或消耗真实 API。
- 大文件职责审查后仍保留明显混杂：状态管理、规则计算、数据读写、渲染展示、外部接线、错误兼容、业务判断混在一起。
- README、spec、代码、测试讲的不是同一套当前事实。
- `npm.cmd run verify` 不通过。

## 4. 目标

本次交付的终局目标：

- 给出并落实 Kitty 当前最合适的维护形态：继续单包模块化，或在证据支持下拆成 workspace；不能凭“monorepo 更高级”行动。
- 补齐 `spec/` 核心模块事实，让它真正成为仓库级当前事实主干。
- 把 core harness 主链路写清、验清、必要时拆清：输入 -> turn -> context -> provider/tool -> session/event -> status -> UI。
- 把 provider 层定型为清楚的能力合同：Provider、Model、Transport、Relay、Request Lifecycle、Usage/Cache Facts。
- 把 `.env` 定型为用户动态配置入口，不缺用户必须改的参数，也不塞内部产品常量。
- 把 eval 定型为生产路径验收系统，覆盖 init/doctor、provider、长会话、恢复、background、subagent、TUI、tool output、cost/cache。
- 把验收分成两层：日常确定性测试随 `npm test` 跑；真实 provider、真实 token 消费和长任务验收只由显式命令触发。
- 对超过 300 行核心文件完成职责审查；需要拆的拆，不需要拆的写清保留理由。
- 同步 README、spec、tests，保证它们只描述当前实现，不写旧兼容和假未来。

## 5. 不做范围

- 不为了追随 opencode/Codex 形式而强行 monorepo。
- 不把 `.env` 变成所有数字常量的收纳箱。
- 不引入新数据库、新框架、新协议，只为显得高级。
- 不做安全审批主线。
- 不做 team 或 legacy。
- 不重写 TUI 视觉，除非现有结构阻断事实一致性或生产路径验收。
- 不新增长期记忆大系统；本轮只审查和稳固现有 memory/context 主链路。

## 6. 设计

### 6.1 维护形态

当前默认设计是“单包发布，内部按 workspace 标准维护”。

判断规则：

- 只有当 core、protocol、provider、TUI、Web、SDK、eval 需要独立版本、独立测试、独立发布或被外部复用时，才拆 monorepo。
- 否则保留单包，先把内部模块边界、spec 和测试做到足够硬。

### 6.2 Core Harness 主链路

核心链路必须只有一条：

用户输入进入 host。
host 建立 turn。
context 选择当前事实。
provider 或 tool 执行。
session/event 记录结果。
runtime status 暴露现场。
CLI/TUI/Web/Telegram 呈现同一事实。
eval 验收真实路径。

任何 UI 壳不得拥有第二套任务状态。

### 6.3 Provider 边界

- `catalog`：provider/model 固有事实，包括能力、限制、成本、cache、reasoning、tool support。
- `transport`：请求端点、headers、stream/non-stream、doctor probe。
- `relay`：YLS/TTAPI 等中转差异，不污染标准 provider。
- `responsesAdapter`：Responses API 消息和事件转换。
- `chatCompletionsAdapter`：Chat Completions 消息和事件转换。
- `request`：一次模型请求生命周期，包括 abort、retry、usage、cache facts、错误归一。
- `usageNormalizer`：usage 字段归一，不做请求判断。

### 6.4 配置边界

配置分四类：

- `.env`：用户必须知道或经常修改的运行参数。
- provider catalog：provider/model 固有事实。
- tool args：每次工具调用可能不同的参数。
- internal constants：产品边界和展示限制，用测试保护，不进 `.env`。

如果某个参数缺失会导致用户路径失败，并且用户合理需要修改，就必须进入 `envKeys -> template -> runtime -> schema -> preflight -> tests` 全链路。

### 6.5 Spec 边界

`spec/` 必须覆盖核心模块设计，但不写实现流水账。

最低覆盖：

- T01 核心主链路。
- T02 session/context/memory/recovery。
- T03 tools/extensions/tool output governance。
- T04 host/UI shells。
- T05 provider/model/relay/usage/cache。
- T06 config/init/doctor。
- T07 eval/production acceptance。

用户审阅写体验和验收。
技术实现写模块边界、状态归属、数据流和测试。

### 6.6 Eval 边界

eval 不是口号检查。

eval 分两层：

- 日常确定性验收：随 `npm test` / `npm.cmd run verify` 运行，不访问真实 provider，不消耗真实 API，不依赖长时间等待。
- 生产路径验收：独立命令手动触发，允许使用当前 `.kitty/.env` 的真实 provider，允许消耗 token，允许跑更长链路。

生产路径验收必须覆盖：

- 新项目 init -> doctor -> 首次对话。
- provider 配置错误 -> 用户可修复诊断。
- 长会话 -> 压缩 -> 继续。
- background 启动 -> 卡住 -> status 可见 -> stop 干净。
- subagent 启动 -> worker 完成 -> lead 接回。
- 大工具输出 -> model projection 有界 -> raw evidence 可恢复。
- TUI 长输出 -> 滚动、输入、现场稳定。
- cost/cache facts -> status 可见。

### 6.7 文件职责

超过 300 行触发审查，不自动拆。

保留条件：

- 一句话能说清职责。
- 变化原因一致。
- 内部耦合合理。
- 拆开会增加错误边界。

拆分条件：

- 状态管理、规则计算、数据读写、渲染展示、外部接线、错误兼容、业务判断混在一起。
- 测试难以覆盖真实行为。
- 新能力只能继续往同一个文件硬塞。

## 7. 实施任务

- [ ] Research 收束：复查 Kitty、opencode、Cline、Codex、Goose 的结构边界，记录只影响当前设计的证据。
- [ ] 维护形态决策：判断 Kitty 是否继续单包模块化，或拆 workspace；写出证据和结论。
- [ ] Spec 补齐：新增或更新 T01-T07 用户审阅与技术实现文档，覆盖核心主链路、provider、context/memory、tools、UI、config、eval。
- [ ] 大文件职责审查：逐个审查 8 个超过 300 行核心文件，能保留就写清理由，必须拆就按变化原因拆。
- [ ] Provider 封顶：检查并必要时调整 catalog、transport、relay、adapter、request、usage/cache 的边界和测试。
- [ ] Config 封顶：审查 `.env`、`.env.example`、template、runtime、schema、preflight、tests，确认用户动态参数无漏项，内部常量不污染 env。
- [ ] Runtime 事实主干验收：确认 session/event/status 是 CLI/TUI/Web/Telegram 的共同事实源。
- [x] Eval 封顶：把 eval 拆成日常确定性验收和生产路径验收；普通 `npm test` 不跑 eval，不跑真实 provider，不消耗真实 API。
- [x] 生产验收入口：提供显式命令运行真实配置、provider probe 和真实项目 status；命令名、输出和风险提示写清。
- [x] README 同步：README 写清 `npm test`、`test:eval`、`eval:local`、`eval:production` 的边界；开发事实指向 `spec/`。
- [x] 全局残留扫描：清除旧兼容、假未来、team、legacy、过重命名和文档旧事实；本轮扫描确认 eval 只保留当前 `--run-local` / `--run-production` 两个运行入口。
- [x] 完整验证：运行局部测试、构建、`npm.cmd run verify`、`npm.cmd run test:eval`、`npm.cmd run eval:local`、`npm.cmd run eval:production`。
- [x] 收口：更新本 plan 的完成事实、验证结果、未验证内容和剩余风险。

## 8. 验证计划

结构检查：

```bash
rg -n "legacy|team\\(|team legacy|旧兼容|兼容旧" src tests spec README.md package.json
rg -n "kernel|kernal|engine|manager" src tests spec README.md package.json
```

配置检查：

```bash
node dist/cli.js doctor
```

测试与构建：

```bash
npm.cmd run typecheck
npm.cmd run test:core
npm.cmd run build
npm.cmd run verify
```

日常产品路径验收：

```bash
node dist/cli.js status
```

产品验收：

```bash
node dist/cli.js eval --run-local
node dist/cli.js eval --run-production
node dist/cli.js tui
```

要求：

- `npm test` 和 `npm.cmd run verify` 不默认运行真实 provider 生产验收。
- 生产验收必须由维护者显式执行。
- 生产验收输出必须说明它会使用当前 `.kitty/.env`，可能消耗真实 API。

手动验收：

- 用当前 `.kitty/.env` 跑一轮真实 provider 对话。
- 触发一次 provider 配置错误，确认错误能指导用户修复。
- 跑一轮长输出 TUI，确认滚动、输入、现场不乱。
- 跑一次大工具输出，确认模型输入有界，原始证据可恢复。
- 跑一次 background/subagent 路径，确认 status 和接回自然。

未验证内容必须在收口中明确写出。

## 9. 收口

已完成本轮 eval 独立交付。

完成事实：

- eval 从普通日常测试链路中独立出来。
- `npm.cmd test` / `npm.cmd run verify` 只运行日常确定性测试，不运行 `tests/evaluation/`。
- 新增 `scripts/run-core-tests.mjs`，明确排除 `.test-build/tests/evaluation/`。
- 新增 `npm.cmd run test:eval`，只运行 eval harness 测试。
- 新增 `npm.cmd run eval:local`，显式运行本地产品验收。
- 新增 `npm.cmd run eval:production`，显式运行生产路径验收。
- `kitty eval --run-local` 运行本地验收。
- `kitty eval --run-production` 运行生产验收，使用当前 `.kitty/.env`，会提示可能消耗真实 provider。
- 生产验收拆出 `src/evaluation/production.ts`，先检查 config preflight；配置不 ready 时跳过 provider probe，避免无意义触网。
- eval 失败会设置非零退出码。
- README、philosophy、spec 已同步 eval 分层事实。
- 本地 `.kitty/.kittyignore` 已通过 `node dist/cli.js init` 补齐，当前项目 preflight ready。

失败测试结果：

- 普通测试不再跑 eval：已通过 `npm.cmd run verify` 验证，core 测试数为 249。
- eval 独立测试：`npm.cmd run test:eval` 通过，9 个 eval 测试全绿。
- 本地产品验收：`npm.cmd run eval:local` 通过。
- 生产路径验收：`npm.cmd run eval:production` 通过，YLS provider probe 为 responses，resolvedBaseUrl 为 `https://code.ylsagi.com/codex`。

修改文件：

- `package.json`
- `scripts/run-core-tests.mjs`
- `src/cli/commands/evaluation.ts`
- `src/evaluation/checks.ts`
- `src/evaluation/harness.ts`
- `src/evaluation/production.ts`
- `src/evaluation/types.ts`
- `tests/cli/program.test.ts`
- `tests/evaluation/harness.test.ts`
- `README.md`
- `philosophy.md`
- `spec/用户审阅/系统核心/核心地图.md`
- `spec/用户审阅/T04-宿主与验证/README.md`
- `spec/用户审阅/T04-宿主与验证/01-Eval验收分层.md`
- `spec/用户审阅/与技术实现映射.md`
- `spec/技术实现/README.md`
- `spec/技术实现/T04-Host边界.md`
- `spec/技术实现/T07-验收分层/README.md`
- `spec/技术实现/与用户审阅映射.md`
- `plan.md`

验证命令：

- `npm.cmd run typecheck`
- `npm.cmd run test:eval`
- `npm.cmd run test:core`
- `npm.cmd run verify`
- `npm.cmd run eval:local`
- `npm.cmd run eval:production`
- `node dist/cli.js doctor`
- `node dist/cli.js init`

未验证内容：

- 未在交互 TTY 中打开 `node dist/cli.js tui`，因为当前工具环境不是交互终端。
- 未做多日真实长任务漂移观察。

剩余风险：

- 当前生产验收真实触达 provider probe 和 runtime status，但还不是完整多轮真实对话长跑。后续如果要更重的实战验收，应继续放在 `eval:production`，不能回灌到 `npm test`。

commit / push：

- 用户本轮未要求 commit / push，未执行。
