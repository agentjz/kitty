# Kitty 生产级硬化收口 Plan

## 1. 需求文档

用户要的不是继续堆功能，而是把当前已经成型的 Kitty 收成能长期当主力工具使用的硬软件。

这轮要解决四个实际问题：

- 生产验收不能只探测 provider，要能跑真实用户路径。
- eval 和 build 不能互相抢 `dist`，脚本要经得起维护者并行误用。
- `spec/` 要覆盖核心模块事实，新维护者能按 spec 理解系统。
- 超过 300 行的核心文件要完成职责审查，需要拆的拆，不需要拆的写清理由。

完成标准：

- 日常测试仍然快、确定、不花真实 API。
- 生产验收显式运行，允许消耗真实 provider，并覆盖真实多轮对话路径。
- 构建脚本不会因为两个 eval 并行运行抢同一个输出目录。
- spec、README、代码、测试讲同一套当前事实。
- 对超重文件给出当前事实结论，不靠行数机械拆。

## 2. 当前事实

仓库事实：

- 当前分支 `master` 与 `origin/master` 同步，工作区干净。
- `npm test` 走 `npm run check && npm run test:core`。
- `test:core` 用 `scripts/run-core-tests.mjs` 排除 `tests/evaluation/`。
- `test:eval` 只跑 `tests/evaluation/**/*.test.js`。
- 修改前，`eval:local` 和 `eval:production` 都会先执行 `npm run build`。
- 修改前，两个 eval 脚本并行执行时，两个 build 会同时清理 `dist`，已经复现过 `tsup` unlink race。
- `src/evaluation/production.ts` 目前只有 config preflight、provider probe、runtime status 三个 production checks。
- `src/evaluation/checks.ts` 同时维护 local scenario 清单、check runner、大量 fixture 和具体检查逻辑，当前 729 行。
- 超过 300 行的源码文件有 8 个：
  - `src/evaluation/checks.ts`
  - `src/shell/tui/transcriptLayout.ts`
  - `src/context/runtime/compression/builder.ts`
  - `src/session/snapshot.ts`
  - `src/provider/responsesAdapter.ts`
  - `src/host/turn.ts`
  - `src/protocol/manifest.ts`
  - `src/telegram/service.ts`
- `spec/` 已有 T01/T02/T03/T04/T07，但 provider/config/TUI/runtime UI 的技术事实仍不完整。

参考项目事实：

- Codex、opencode、Goose 这类成熟 agent 项目都把日常确定性测试和真实 provider/真实长链路验收分开。
- 成熟项目的生产验收不是函数清单，而是可复现用户路径：配置、会话、模型请求、状态、恢复。
- workspace/monorepo 不是成熟本身；当前 Kitty 仍适合单包发布、内部按清晰模块边界维护。

当前缺口：

- production eval 缺真实多轮对话路径。
- eval 脚本 build 步骤有并发清理风险。
- spec 对 provider/config/TUI 的事实覆盖不够硬。
- 超重文件职责审查还没落成仓库事实。

## 3. 失败测试

以下情况视为失败：

- 并行运行 `npm.cmd run eval:local` 与 `npm.cmd run eval:production` 仍会因为 `dist` 清理互相失败。
- `npm.cmd run verify` 触发真实 provider 或运行 `tests/evaluation/`。
- `npm.cmd run eval:production` 不包含真实多轮 agent turn 验收。
- production eval 在配置缺失时仍无意义触网。
- `spec/` 仍无法说明 provider/model/relay/usage/cache、config/init/doctor、TUI/runtime UI 的当前边界。
- 8 个超过 300 行的文件没有职责结论。
- README/package/spec/plan 与实际命令不一致。

## 4. 目标

本轮交付目标：

- 修掉 eval 脚本的 build 并发风险。
- 给 production eval 增加真实多轮对话验收，使用当前真实 provider，写入隔离的临时工作区，不污染用户当前 session。
- production eval 保持显式触发，普通 test/verify 不运行。
- 补齐 spec：T05 Provider、T06 Config、T08 TUI/Runtime UI。
- 新增核心文件职责审查文档，逐个说明 8 个超重文件当前是否保留、为何保留、后续什么条件才拆。
- 同步 README/package/plan，跑完整验证。

## 5. 不做范围

- 不做多日真实长跑。
- 不引入新数据库、新框架、新 UI。
- 不拆 monorepo。
- 不做 team、legacy、旧兼容。
- 不把内部展示常量塞进 `.env`。
- 不为降低行数机械拆文件。

## 6. 设计

### 6.1 Eval 构建边界

`build` 仍负责清理并生成 `dist`。

eval 脚本不再各自触发 `build`。新增 eval preflight 脚本，只检查 `dist/cli.js` 是否存在；不存在就报错提示先运行 `npm.cmd run build`。

这样可以避免两个 eval 同时抢 `dist`。日常完整验证仍由 `npm test` 的 `check` 阶段构建。

### 6.2 Production Eval 多轮对话

新增 production check：

- `production-real-turn`

执行方式：

- 先通过 config preflight。
- 创建 `.kitty/eval-production/<timestamp-or-stable-id>` 隔离工作区。
- 使用当前 `.kitty/.env` 解析出的真实 provider config。
- 创建 session。
- 调用 `runHostTurn` 两次，输入短英文问题，使用真实 provider，但禁用工具面，避免文件系统副作用。
- 验收 session 有用户消息和 assistant 消息，events 有 turn started/completed，runtime status 可读。

边界：

- 它是真实 provider 验收，所以只在 `eval:production` 中运行。
- 配置不 ready 时跳过 provider probe 和 real turn。
- real turn 失败必须让 production eval 失败。

### 6.3 Spec 补齐

新增技术实现文档：

- `spec/技术实现/T05-Provider与模型/README.md`
- `spec/技术实现/T06-配置初始化诊断/README.md`
- `spec/技术实现/T08-TUI与RuntimeUI/README.md`
- `spec/技术实现/职责审查/README.md`

更新映射文档，让用户审阅和技术实现能互相指向。

### 6.4 超重文件职责审查

职责审查只写当前事实：

- 文件负责什么。
- 不负责什么。
- 当前是否拆。
- 如果不拆，为什么不拆。
- 未来触发拆分的具体信号。

不在源码里写假注释，不为了文档而重排代码。

## 7. 实施任务

- [x] 更新 package scripts：eval 脚本改为检查 dist 后运行，不再自行 build。
- [x] 新增 eval dist preflight 脚本，缺 dist 时给出明确修复命令。
- [x] 更新 production eval 类型、scenario、runner，加入 `production-real-turn`。
- [x] 为 production real turn 写测试，覆盖配置缺失跳过、production check 清单和 CLI 分层边界。
- [x] 补齐 provider/config/TUI 技术 spec 和映射。
- [x] 新增 8 个超重文件职责审查文档。
- [x] 更新 README 与 plan 命令事实。
- [x] 运行扫描、`npm.cmd run test:eval`、`npm.cmd run verify`、`npm.cmd run build`、`npm.cmd run eval:local`、`npm.cmd run eval:production`。
- [x] 收口 plan，写明完成事实、验证结果和剩余风险。

## 8. 验证计划

命令事实扫描：

```bash
rg -n "eval:local|eval:production|run-production|run-local|npm run build && node dist/cli.js eval" package.json README.md spec src tests
```

局部验证：

```bash
npm.cmd run test:eval
```

完整验证：

```bash
npm.cmd run verify
```

构建与显式 eval：

```bash
npm.cmd run build
npm.cmd run eval:local
npm.cmd run eval:production
```

并发验证：

```bash
Start-Job { Set-Location "C:\Users\Administrator\Desktop\kitty"; npm.cmd run eval:local }
Start-Job { Set-Location "C:\Users\Administrator\Desktop\kitty"; npm.cmd run eval:production }
Get-Job | Receive-Job -Wait
```

要求：

- 并发 eval 不再发生 `dist` unlink race。
- `verify` 不运行 eval tests。
- `eval:production` 明确包含真实 provider real turn。

## 9. 收口

已完成。

完成事实：

- `eval:local` / `eval:production` 不再主动执行 `npm run build`，改为 `scripts/ensure-dist-built.mjs` 检查 `dist/cli.js`。
- 新增 `scripts/ensure-dist-built.mjs`，缺少 `dist/cli.js` 时明确提示先运行 `npm.cmd run build`。
- production eval 新增 `production-real-turn`，显式使用当前 `.kitty/.env` 的真实 provider 跑隔离 session 两轮真实 host turn。
- production eval 配置不 ready 时跳过 provider probe 和 real turn，避免无意义触网。
- 新增 eval preflight 测试，`test:eval` 现在覆盖 11 个 eval 测试。
- 补齐技术 spec：Provider 与模型、配置初始化诊断、TUI 与 Runtime UI、职责审查。
- 职责审查记录了 8 个超过 300 行核心文件的当前职责、保留理由和拆分触发条件。
- README 和 T07 eval spec 已同步：运行 eval 前先 build，eval 不进入日常测试。

验证结果：

- `npm.cmd run typecheck`：通过。
- `npm.cmd run test:eval`：通过，11 个测试全绿。
- `npm.cmd run verify`：通过，249 个 core tests 全绿，不运行 eval tests。
- `npm.cmd run eval:local`：通过。
- `npm.cmd run eval:production`：通过，YLS provider probe 成功，`production-real-turn` 完成 2 个 user messages、2 个 assistant messages、2 个 completed turns。
- 并发运行 `eval:local` 与 `eval:production`：两个 PowerShell jobs 均 Completed，没有 `dist` unlink race。Job 输出中的中文乱码来自 PowerShell job 编码显示，不影响命令结果。

未验证内容：

- 未做多日真实长任务漂移观察。
- 未在交互 TTY 中手动打开 `node dist/cli.js tui`。

剩余风险：

- `src/evaluation/checks.ts` 已确认职责过宽，当前用职责审查记录为后续拆分触发点；本轮没有拆它，因为生产验收主线和 build race 是更直接的生产硬伤。

commit / push：

- 用户本轮未要求 commit / push，未执行。
