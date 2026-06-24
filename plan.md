# Raw Command Fact Integrity Plan

## 1. 需求文档

Kitty 执行命令时，要保持原汁原味。

用户或模型给出的命令是什么，Kitty 就交给当前 shell 执行什么。Kitty 不替用户翻译命令，不把类 Unix 命令改成 PowerShell cmdlet，不把 package manager 命令改成 `.cmd`，不改写 `&&`。如果命令在当前 shell 下失败，那就是应暴露的真实环境事实。

用户需要可信结果：成功就是成功，失败就是失败。不能出现命令不存在却显示 completed。

本次完成标准：

- 删除命令转换主线。
- 删除 requested command / actual command 这类由转换制造出的双事实。
- PowerShell 错误必须返回非 0。
- PowerShell CLIXML 错误不原样喷给用户。
- `bash` 和 `background_run` 都记录原始 command 和真实执行状态。

## 2. 当前事实

- 现有未提交改动曾加入 `.cmd` 归一化和 requested/actual command 字段。
- 用户已经明确否定这类转换：原汁原味比替用户修命令更重要。
- `platformTransforms.ts` 曾把 `ls`、`cat`、`rm`、`cp`、`mv`、`touch`、`mkdir` 翻译成 PowerShell cmdlet，并已暴露 wildcard 语义破坏。
- `platform.ts` 当前仍会把 `npm`、`npx`、`pnpm`、`yarn` 改成 `.cmd`，并把 `&&` 改成 PowerShell `if ($?)`。
- `launch.ts` 当前是唯一真正启动 shell 的入口。
- `bash.ts` 和 `backgroundRun.ts` 都依赖 commandRunner 或 launch。
- 已确认 session 中出现过 `yarn.cmd` 不存在但 `exit=0 status=completed`，这是机器事实错误。
- 参考 Continue CLI：terminal command 选择 shell 后直接 spawn 原始 command，后台 job 按 child close 的 exitCode 写 `completed` 或 `failed`。
- 参考 Codex app-server/TUI 文档和测试：command execution 事实主干是 command、status、exitCode、output delta，最终 completed item 是权威结果。

## 3. 失败测试

- Windows 命令准备不应再存在；`npm --version`、`ls foo*`、`cmd1 && cmd2` 都不应被 Kitty 改写。
- 不存在命令通过 command runner 执行时，exit code 必须非 0。
- 不存在命令输出不应包含原始 `#< CLIXML`。
- `bash` 工具执行不存在命令时，payload status 必须是 `failed`。
- `background_run` 执行不存在命令后，后台 execution 必须落成 `failed`。

## 4. 目标

- commandRunner 不做命令翻译，只做 shell 启动、超时、stall、输出捕获和事实记录。
- PowerShell wrapper 把 PowerShell 错误和 native exit code 转成真实 exit code。
- `bash` payload、metadata 和 `background_run` ledger 都讲同一个事实。
- 相关测试和完整验证通过。

## 5. 不做范围

- 不做 `.cmd` 自动替换。
- 不做 `&&` 自动兼容。
- 不做 Unix 命令到 PowerShell cmdlet 的翻译。
- 不新增提示词提醒用户用什么 shell 语法。
- 不处理 taskState 的 `exit unknown`，本次只修执行事实主链路。

## 6. 设计

主链路：

1. 工具收到原始 command。
2. `launchCommand` 把原始 command 放入当前 shell wrapper。
3. PowerShell wrapper 负责把错误转成非 0 exit code。
4. commandRunner 捕获输出并清理 CLIXML 展示噪音。
5. `bash` payload 和 metadata 使用原始 command。
6. `background_run` ledger 使用原始 command，并在进程关闭时记录真实 status/exitCode/output。

模块边界：

- 删除 `platform.ts`、`platformArgs.ts`、`platformTransforms.ts` 这条转换主线。
- `launch.ts` 只负责启动 shell 和 PowerShell wrapper。
- `output.ts` 只负责 shell 输出清理。
- `run.ts` 只负责同步命令生命周期。
- `backgroundRun.ts` 只负责后台生命周期，不维护命令转换事实。

## 7. 实施任务

- [x] 删除 commandRunner 平台命令转换文件。
- [x] 从 `launchCommand` 返回值中删除 actual/requested command 分叉。
- [x] 从 `runCommandWithPolicy` 返回值中删除 requestedCommand。
- [x] 从 `bash` payload 中删除 requestedCommand，保留原始 command。
- [x] 从 `background_run` 中删除 command prepare 和 requestedCommand。
- [x] 修 PowerShell wrapper，让错误稳定返回非 0。
- [x] 增加 PowerShell CLIXML 输出清理。
- [x] 补 command runner、bash、background 失败事实测试。
- [x] 跑相关测试。
- [x] 跑完整验证。

## 8. 验证计划

- `npm.cmd run test:build; node --test .test-build/tests/utils/command-runner.test.js .test-build/tests/tools/foundation-tools.test.js .test-build/tests/extensions/background-tools.test.js`
- `npm.cmd run verify`
- 检查 `git status --short`

## 9. 收口

已完成。

交付事实：

- 删除 `platform.ts`、`platformArgs.ts`、`platformTransforms.ts`，命令执行层不再翻译用户命令。
- `launchCommand` 不再返回 requested/actual command 分叉，只启动原始 command。
- `runCommandWithPolicy` 返回原始 command 和真实执行结果。
- `bash` payload 保留原始 command，删除 `requestedCommand`。
- `background_run` ledger 和 payload 保留原始 command，删除 command prepare 和 `requestedCommand`。
- PowerShell wrapper 使用 `ErrorActionPreference = Stop`，catch 后写 stderr 并退出 1。
- 新增 command output 清理，PowerShell CLIXML 不再原样进入用户可见输出。
- 新增缺失命令失败测试，覆盖 command runner、bash、background。

参考事实：

- Continue CLI 的 terminal command 选择 shell 后直接 spawn 原始 command。
- Continue background job 按 child close 的 exitCode 写 completed/failed。
- Codex commandExecution 的权威事实是 command、status、exitCode、output。

验证结果：

- 定向验证通过：`npm.cmd run test:build; node --test .test-build/tests/utils/command-runner.test.js .test-build/tests/tools/foundation-tools.test.js .test-build/tests/extensions/background-tools.test.js`
- 完整验证通过：`npm.cmd run verify`
- 完整验证结果：234 tests passed。

剩余风险：

- `taskState` 里 `exit unknown` 仍是后续机器事实治理线索，本次未改。

未执行 commit / push；用户未明确要求。
