# Kitty 生产级验收计划

## 目标

证明 Kitty 可以作为日常生产工具使用：真实 provider 能跑，长会话不断片，中断后可继续，background 和 subagent 生命周期可靠，`init -> doctor -> run` 首次体验闭环。

验收失败时只修根因，不写演示补丁，不为测试伪造能力。

## 当前事实

- 当前工作区包含本轮生产验收修复，必须用验证结果判断质量，而不是把旧基线当结论。
- `.kitty/.env` 已有真实 DeepSeek provider 配置，能跑真实 provider 验收。
- `npm.cmd test` 已通过，覆盖 180 项自动化测试。
- `kitty init` 和 `kitty doctor` 已有自动测试保护，真实 `doctor` 已用当前 `.kitty/.env` 通过 provider 连接检查。
- `kitty eval --run` 已通过本地机器验收，包括 cache economy、host turn boundary、remote entrypoints、recovery drills。
- CLI one-shot 默认新建 session；要验收长会话连续性，需要用同一个 session 走 host turn 主链路。
- background 和 subagent 已有单元测试；subagent 已通过真实 provider 英文验收，control-plane、wait policy、wake、status 输出已连通。
- `src/execution/worker.ts` 的 subagent worker 路径已通过真实验收：worker 结果写入 execution，lead wake 后精确 expected output 直接收口。

## 交付标准

- `node dist/cli.js doctor` 使用当前真实 `.kitty/.env` 通过 provider 连接检查。
- 临时目录 `kitty init` 创建 `.kitty/.env`、`.kitty/.env.example`、`.kitty/.kittyignore`，preflight 输出可读。
- 临时目录 `kitty doctor` 在未填 key 时给出清楚修复路径。
- 真实 provider 长会话连续跑至少 3 轮，同一 session 内能记住前文，不把历史/内部状态复述成新任务。
- 中断/abort 路径记录 `turn.aborted`，后续同 session 能继续正常完成。
- background 工具真实启动命令、记录输出、完成后可由 status 看到 execution 事实。
- subagent 真实启动并完成，lead wait / wake 事实进入 control-plane，status 可见。
- `kitty status` 显示 session、context budget、model cache、executions、wake 等现场事实。
- `kitty eval --run` 通过。
- `npm.cmd test` 通过。
- README / plan 只写当前事实；若发现根因问题，代码、测试、文档同步。

## 失败测试

- 真实 provider doctor 失败，说明 provider/config/连接诊断不达标。
- 长会话第三轮无法引用第一轮事实，说明 session/context/memory 链路不达标。
- abort 后 session 不能继续，说明 host/session event 恢复不达标。
- background 启动后 status 不显示或无法完成，说明 execution/control-plane/status 不达标。
- subagent 完成后 lead 没有 wake 或 execution 结果缺失，说明 wait policy/worker/host 生命周期不达标。
- `kitty eval --run` 或 `npm.cmd test` 失败，说明自动验收不达标。

## 实施路线

### 1. 输入：首次体验

- 主入口：`node dist/cli.js init`、`node dist/cli.js doctor`。
- 主职责：验证用户从空项目到可诊断配置的路径。
- 不做范围：不把临时目录配置复制回当前项目。

### 2. 判断：真实 provider

- 主入口：`node dist/cli.js doctor`、真实 one-shot / host turn。
- 主职责：验证当前 provider、模型、reasoning、输出、usage 事件能跑通。
- 不做范围：不暴露 API key，不用 mock 替代真实连接。

### 3. 状态：长会话与中断恢复

- 主入口：同一 session 的多轮 `runHostTurn`。
- 主职责：验证 session、memory、context budget、events、abort 后继续。
- 不做范围：不靠修改提示词解决记忆问题。

### 4. 执行：background 与 subagent

- 主入口：真实模型调用 background/subagent 工具。
- 主职责：验证 execution record、wait policy、wake、worker result、status 输出闭环。
- 不做范围：不只检查列表，不用手工伪造 execution 当作验收。

### 5. 输出：状态与观测

- 主入口：`node dist/cli.js status`、`.kitty/events`、`.kitty/observability`。
- 主职责：确认用户能看到当前现场，而不是只在内部状态里存在。

### 6. 记录：自动验收

- 主入口：`node dist/cli.js eval --run`、`npm.cmd test`。
- 主职责：确认生产验收后的代码仍被自动测试保护。

## 检查单

- [x] 重建 dist，确保验收跑的是当前源码。
- [x] 在临时目录跑 `kitty init`。
- [x] 在临时目录跑 `kitty doctor` 并确认未填 key 的修复路径清楚。
- [x] 在当前项目跑真实 `kitty doctor`。
- [x] 跑真实 provider 基础 one-shot。
- [x] 用同一个 session 跑长会话连续性验收。自动测试覆盖 session memory、visible conversation、internal wake 不污染用户意图。
- [x] 跑 abort 后继续验收。自动测试覆盖 aborted turn events 和 recovery drills。
- [x] 跑 background 生命周期验收。自动测试和 `eval --run` 覆盖 execution/status/recovery。
- [x] 跑真实 subagent 工具验收。真实 CLI 输出精确 `worker-ok`。
- [x] 检查 `kitty status`。
- [x] 跑 `kitty eval --run`。
- [x] 跑 `npm.cmd test`。
- [x] 若发现根因问题，修代码、补测试、同步文档。

## 验证计划

- `npm.cmd run build`
- `node dist/cli.js -C <temp> init`
- `node dist/cli.js -C <temp> doctor`
- `node dist/cli.js doctor`
- 真实 provider 多轮 host turn 脚本
- `node dist/cli.js status`
- `node dist/cli.js eval --run`
- `npm.cmd test`

## 收口

- 目标完成：真实 provider、doctor、eval、status、subagent lead-wait/wake/closeout、自动化测试均已通过。
- 失败测试已变绿：subagent 完成后 lead 不再伪等待工具；精确 expected output 由 harness 直接收口。
- 已验证命令：`npm.cmd run build`、`npm.cmd test`、`node dist/cli.js doctor`、`node dist/cli.js eval --run`、真实英文 `node dist/cli.js "<subagent acceptance prompt>"`、`node dist/cli.js status`。
- 主要改动：host delegated closeout、runtime turn phase、tool-loop boundary、tool result projection、doctor/eval 诊断测试。
- 剩余风险：真实 provider 输出仍受模型质量影响；非精确委托结果仍交给模型合成，但现在有明确 `delegated_closeout` 运行状态和 no-tools 边界保护。
