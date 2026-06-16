# Background 与 Spec 产品体验闭环计划

## 目标

把两个已有但体验不完整的能力补成可投入日常使用的闭环：

- background：用户和模型都能启动、查看、等待、停止后台执行，并看到输出、健康、deadline 和最终状态。
- spec：用户进入或查看 spec 时，能直接理解当前阶段、下一步、待确认项、文档进度、工具面和工作区。

不重建旧能力。不做假兼容。不把体验问题塞进提示词。

## 当前事实

- 当前基线已提交：`47539f8 Harden production turn lifecycle`。
- background 已有 `background_run` 和 `background_check` 工具，execution 账本会记录 pid、输出摘要、deadline、wake 和 stale reconcile。
- background 原先缺少 agent 可用的等待/停止工具，也缺少普通 CLI 用户可直接使用的 `list/wait/stop` 入口。
- `kitty status` 会显示 execution，但它是全局现场，不是专门的后台任务控制台。
- spec 已有独立 `kitty spec` 模式、阶段工具面、workflow summary、spec documents、checkpoint 和 status 展示。
- spec 原先体验偏工程字段。用户需要更直接看到“现在在哪一步、下一步做什么、等我确认什么、哪些文档还没完成”。
- 参考项目原则：Codex 的 background terminal 重在可读输出、可列出、可终止、完成不残留；Cline 强调长跑命令后台化并能看到新输出；成熟 spec/plan 体验把阶段与下一步作为第一屏事实。

## 交付标准

- 新增 `background_wait` 工具：按 execution id 等待后台执行完成或超时，返回最新状态、输出预览、健康事实。
- 新增 `background_stop` 工具：按 execution id 停止后台执行，返回最终账本状态。
- 新增 `kitty background` CLI：
  - `kitty background` 或 `kitty background list` 列出 active/recent background。
  - `kitty background wait <id>` 等待指定任务完成。
  - `kitty background stop <id>` 停止指定任务。
- background wait 会 reconcile stale pid，不会无限假等。
- spec workflow brief 集中维护一处，CLI intro、`kitty spec --status`、status presenter 复用同一格式。
- `kitty spec --status` 可直接查看当前 session 绑定的 spec；没有 active spec 时给出下一步。
- 测试覆盖工具、CLI 和 spec brief 的真实行为。
- README / spec 文档同步当前事实。

## 失败测试

- 模型启动 background 后不能等待或停止，只能反复 check：已修复。
- 后台进程已经结束或 pid 消失，wait 仍然卡住：已修复。
- CLI 用户不能直接看后台任务、等待任务或停止任务：已修复。
- spec 模式第一屏仍只显示工程字段，看不出阶段、下一步、待确认项：已修复。
- `kitty spec --status` 不存在或无法显示当前 workflow：已修复。
- 自动测试或 `eval --run` 失败：已验证通过。

## 实施结果

### 1. Background 主干

- 主文件：`src/execution/background.ts`
- 完成：新增 `waitForBackgroundExecution` 和 `isBackgroundExecutionActive`。
- 结果：等待逻辑复用 control-plane 账本、stale reconcile 和状态判断；不会在 CLI 或工具里各写一套生命周期规则。

### 2. Background 工具

- 主文件：`src/extensions/tools/background/`
- 完成：新增 `background_wait`、`background_stop`。
- 结果：模型可以按 execution id 等待或停止后台任务，并拿到统一的 lifecycle summary。

### 3. Background CLI

- 主文件：`src/cli/commands/background.ts`、`src/cli/program.ts`、`src/cli/runtime.ts`
- 完成：新增 `kitty background/list/wait/stop`。
- 结果：普通用户可直接审阅和控制后台任务；CLI runtime 显式暴露 `stateRootDir`，避免把工作目录和状态目录混用。

### 4. Spec workflow brief

- 主文件：`src/spec/workflowSummary.ts`
- 完成：新增 `formatSpecWorkflowBrief`。
- 结果：spec 当前阶段、下一步、等待项、文档进度、工具面、workspace 由同一处生成，边缘入口只负责呈现。

### 5. Spec CLI

- 主文件：`src/cli/commands/spec.ts`、`src/shell/cli/specInteractive.ts`、`src/cli/commands/runtimeStatusPresenter.ts`
- 完成：新增 `kitty spec --status`，spec intro 和 status presenter 复用 workflow brief。
- 结果：spec 入口第一屏更像产品现场，不像底层状态表。

### 6. 验证与文档

- 主文件：`tests/extensions/background-tools.test.ts`、`tests/cli/program.test.ts`、`tests/cli/spec-cli.test.ts`、`tests/runtime/status.test.ts`、`README.md`、`spec/用户审阅/系统核心/核心地图.md`、`spec/技术实现/T03-工具与扩展/03-Extension工具清单.md`
- 完成：补齐工具、CLI、runtime status、spec brief 测试和文档。

## 检查单

- [x] 写 background wait/stop 主干函数。
- [x] 新增 `background_wait` 工具并测试完成、超时、stale reconcile。
- [x] 新增 `background_stop` 工具并测试停止状态。
- [x] 新增 `kitty background list/wait/stop` CLI。
- [x] 补 CLI 命令注册测试。
- [x] 写 spec workflow brief 并替换分散展示。
- [x] 新增 `kitty spec --status`。
- [x] spec interactive intro 展示 workflow brief。
- [x] README 与 spec 文档同步。
- [x] 运行 `npm.cmd test`。
- [x] 运行 `node dist/cli.js eval --run`。
- [x] 运行真实 background CLI 验收。
- [x] 运行 `node dist/cli.js spec --status` 验收。

## 验证结果

- `npm.cmd test`：通过，184/184。
- `npm.cmd run verify`：通过，184/184。
- `node dist/cli.js eval --run`：通过，所有 eval checks passed。
- `node dist/cli.js background`：通过，显示 completed/failed background execution 的状态、健康、deadline、输出。
- `node dist/cli.js background wait exec-mqg72idv-mjwimq0w`：通过，返回 completed execution。
- `node dist/cli.js background stop exec-mqga5f6y-b2053j8z`：通过，running execution 关闭为 aborted。
- `node dist/cli.js spec --status`：通过，无 active spec 时显示下一步。
- `node dist/cli.js status`：通过，runtime status 显示当前现场、cache、executions、memory、spec facts。

## 收口

目标已完成。

失败测试已变绿。

改动范围集中在 background lifecycle、background CLI/tool、spec workflow brief、runtime status 呈现、测试和文档。

剩余风险：本轮真实 background CLI 验收覆盖了 list、wait completed、stop running 账本闭环；没有再跑一次真实模型主动调用 `background_wait/background_stop` 的端到端对话，因为自动工具测试已经覆盖工具执行，真实 provider 对话会额外消耗 token。
