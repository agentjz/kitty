# Kitty 真实生产路径验收与失败闭环 Plan

## 1. 需求文档

用户要确认 Kitty 现在能不能作为日常生产工具使用。

这不是新增功能任务。当前要解决的是：用当前构建产物在真实桌面工作区里跑普通用户会跑的路径，发现真实失败，把失败定位到正确层，能修的修根因，能复现的沉淀为测试或 eval，最后让代码、spec、history 和验收事实讲同一个当前现实。

使用者是 Kitty 维护者和未来日常使用 Kitty 做本地开发任务的人。

当前范围包含：

- 直接使用 `node dist/cli.js` 或全局 `kitty`。
- 在桌面创建隔离真实工作区。
- 用真实 provider 进行多轮自然语言对话。
- 覆盖 CLI/TUI、工具调用、文件创建修改、长任务、中断恢复、session/events/status/memory、terminal log、observability、provider tool call。
- 把可复现失败转成测试或 eval 保护。
- 同步相关 spec/history/README 或版本事实。

当前范围不包含：

- 不新增远程控制。
- 不新增 UI 产品形态。
- 不新增工具体系概念。
- 不把失败粗暴归因给模型。
- 不用 mock 代替真实生产路径结论。

业务完成标准：给出基于真实命令、真实文件、真实日志和真实 provider 返回的结论，说明 Kitty 是否能投入日常生产使用。

## 2. 当前事实

- `@jun133/kitty` 当前包版本已升级到 `0.0.19`。
- `dist/cli.js` 存在，重新 build 后 `node dist/cli.js --version` 应输出 `0.0.19`。
- `spec/` 当前事实主干定义 Kitty 为本地 agent 编程工作台。
- 当前主链路是 host -> agent turn -> context -> provider -> tools -> session/control-plane/observability -> host output。
- 当前入口包括裸 `kitty` TUI、`kitty agent` 文字交互、一次性 prompt、sessions/events/status/memory/doctor/eval。
- 当前 core 工具是 `read`、`edit`、`write`、`bash`。
- 当前 extension 是 `todo`、`worktree`、`network`、`background`、`subagent`、`skills`。
- 当前 provider/model 已分离，DeepSeek thinking tool call replay 是 wire contract。
- 当前 production eval 已覆盖真实 config preflight、provider probe、两轮真实 turn、一个隔离 eval 工具调用 turn和 runtime status。
- 当前 `.kitty/.env` 存在并包含 provider、model、base URL、API key 等 key。
- 旧 `plan.md` 是上一轮默认 TUI 收口记录，已替换为本轮执行合同。

当前缺口：

- production eval 不等同于真实用户在桌面工作区长时间使用 `dist/cli.js`，本轮已用隔离桌面工作区补充真实手动验收。
- 现有 eval 的工具调用使用专用 eval 工具，不能完全代表模型使用真实 core 工具改文件，本轮已用 20 个真实 core 工具修复任务补充观察。
- TUI/CLI interactive 可接住输入，`总结中` 会明确显示；Windows PTY 输入回显会重复字符，但提交后的 `>` 原文是干净事实。
- terminal log 已从 delta 串改为可读块，并修复 fallback 工具调用缺少 path 的 observability 问题。
- 中断后 resume 可继续同一 session；但旧 session replay 可能让模型先按旧事实回答，明确要求读取当前文件/测试后可以纠偏。

当前未知点：

- 当前真实 provider 已确认是 `yls`，model 是 `gpt-5.5`，wire API 是 `responses`，doctor probe 通过。
- 本轮没有切到 DeepSeek provider；DeepSeek replay 只按已有 production eval 和 spec 事实覆盖。
- 20 个有效工具准确性任务未触发 provider wire/replay 错误；1 个无效评测来自测试夹具不一致。

## 3. 失败测试

以下任一情况都算失败：

- 新会话第一轮成功，第二轮用户消息被吞、延迟到不可理解或卡住。
- `总结中`、标题生成或 memory closeout 阶段挡住输入，让用户误以为空闲或消息丢失。
- 真实 provider tool call 后工具结果不能回到同一轮并产生最终回答。
- DeepSeek / relay / OpenAI-compatible 路径出现 wire contract 错误，却被归为模型问题。
- 工具调用多后 provider 报错且 session replay 无法恢复。
- 文件创建/修改成功但 workset、changes、events、memory/status 看不到事实。
- 中断后无法继续同一 session。
- terminal log 只有碎 delta 或噪音，缺少 turn、tool、final answer 边界，无法排查现场。
- observability events 缺少 provider request、tool、turn 关键边界。
- memory 变成账本或旧事实污染下一轮。
- TUI 卡顿、输入错位、滚动或 runtime dock 误导真实工作。

可自动化的失败必须沉淀到测试或 eval。不能自动化的失败必须记录复现命令、工作区路径、session id、日志路径和判断层。

## 4. 目标

最终交付：

- 一个真实桌面工作区生产验收记录。
- 明确结论：Kitty 是否能投入日常生产使用。
- 真实测试路径清单和证据。
- 根因问题清单，按 provider wire contract、session replay、context compression、tool output projection、TUI render、host lifecycle、memory closeout、observability log、config/env、用户提示词或模型本身分层。
- 对可修问题完成根因修复。
- 对可复现问题增加测试或 eval。
- spec/history/README 与当前事实同步。
- 运行必要局部验证和 `npm.cmd run verify`。

## 5. 不做范围

- 不发布 npm。
- 不 commit。
- 不 push。
- 不新增概念型功能。
- 不用脚本文案掩盖真实产品问题。
- 不把用户原话直接写成提示词硬约束。

## 6. 设计

主链路验收顺序：

1. 配置与构建：确认当前 dist、doctor、provider 配置和当前工作树。
2. 真实工作区：在桌面创建 `kitty-real-eval-workspace`，初始化 Kitty 配置，创建真实小项目。
3. CLI 生产路径：用 `node dist/cli.js agent` 或一次性 prompt 进行自然语言多轮任务，让模型调用真实工具创建/修改/验证文件。
4. TUI 生产路径：用 `node dist/cli.js` 进入 TUI，观察 session picker、输入、runtime dock、总结中、滚动和中断体验。
5. 恢复路径：中断一轮后用 `sessions`、`resume`、继续对话验证 session continuity。
6. 审阅路径：检查 `status`、`events`、`memory`、`.kitty/events`、`.kitty/observability`、terminal log、session json、tool output artifacts。
7. provider tool call：使用当前 provider 跑真实工具调用，并在可行时覆盖 DeepSeek/relay/OpenAI-compatible 当前配置路径。
8. 失败闭环：每个真实失败先定层，再复现，再修根因，再加测试/eval，再同步 spec/history。

模块边界：

- Provider 层只处理 wire request、response、usage、cache 和 provider contract。
- Session 层只保存对话、workset、memory、checkpoint 和 replay 事实。
- Context 层只决定进入模型的事实和压缩。
- Tool 层只执行和投影工具事实。
- Host/TUI 层只处理输入输出和生命周期。
- Observability 只记录可排查事实，不替模型判断。

## 7. 实施任务

- [x] 读取 AGENTS、history、VERSION_LOG、README、package、spec 和 Kitty 开发 skill。
- [x] 用白话收束当前产品事实和下一阶段目标。
- [x] 读取主链路代码与现有 production eval。
- [x] 替换本轮 `plan.md`。
- [x] 确认 dist、doctor、config 和 provider 当前事实。
- [x] 创建桌面真实验收工作区和真实小项目。
- [x] 用当前构建产物跑 CLI 多轮真实 provider 对话。
- [x] 验证真实 core 工具创建/修改文件和运行命令。
- [x] 跑一个长一点的自然语言开发任务。
- [x] 验证中断后继续和 session resume。
- [x] 验证 sessions/events/status/memory/terminal log/observability。
- [x] 验证 TUI 真实输入、输出、runtime dock、总结中和中断体验。
- [x] 运行现有 local/production eval，和手动验收互相对照。
- [x] 跑多组工具准确性任务矩阵，统计工具调用次数、无效调用和最终闭环率。
- [x] 定位发现的问题并按层分类。
- [x] 修复可闭环根因。
- [x] 为可复现失败增加测试或 eval。
- [x] 同步 spec/history/README 中被事实改变的部分。
- [x] 运行局部测试和 `npm.cmd run verify`。
- [x] 更新本计划收口。
- [x] 追加第三、第四批工具准确性任务，把有效任务数扩到 40 左右。
- [x] 统计新增任务的工具调用、失败恢复、越界修改和最终闭环率。
- [x] 判断新增失败是否需要继续改 Kitty harness；只修 harness，不为 GPT 做特判。
- [x] 追加验收收口和必要验证。

## 8. 验证计划

命令验证：

```bash
node dist/cli.js --version
node dist/cli.js doctor
node dist/cli.js init
node dist/cli.js agent
node dist/cli.js sessions
node dist/cli.js events
node dist/cli.js status
node dist/cli.js memory
node dist/cli.js eval --run-local
node dist/cli.js eval --run-production
npm.cmd run verify
```

真实工作区检查：

- `C:\Users\Administrator\Desktop\kitty-real-eval-workspace` 存在。
- 工作区包含真实小项目和 Kitty 产生的 `.kitty` 状态。
- session 中有多轮用户/assistant/tool 消息。
- events 有 turn/tool 边界。
- memory asset 可读。
- status 能说明当前现场。
- terminal log 与 observability 能定位 turn、tool、provider 和 final answer。

未验证内容必须在收口写明。

## 9. 收口

当前结论：Kitty 已经接近可日常生产使用，但不是“无风险放心托管长任务”的状态。作为本地编程 agent，用当前 GPT/YLS provider 跑读文件、改实现、跑测试、按失败继续修的路径，已经有足够证据支持日常使用；恢复旧 session 时的当前事实核验仍需用户保持警觉。

真实测试路径：

- `node dist/cli.js --version` 输出 `0.0.19`。
- `node dist/cli.js doctor` 确认 provider=`yls`、model=`gpt-5.5`、wire API=`responses`、provider probe ok。
- `C:\Users\Administrator\Desktop\kitty-real-eval-workspace` 跑过真实小项目、多轮 provider、core 工具、events/status/memory/terminal log、local/production eval。
- `C:\Users\Administrator\Desktop\kitty-tool-accuracy-workspace` 跑过 20 个有效工具准确性修复任务，全部最终通过；`cmd /c npm test` 覆盖 20 个模块并通过。
- 前 20 个有效工具修复 session：108 次 tool.started，107 次 tool.completed，1 次 tool.failed；工具分布 read=50、edit=23、bash=35。
- 中断恢复：`20260705091100-87c7af99` 被中断后可 `resume`，第一轮按旧事实误答，第二轮明确读测试并运行 `node src/csvSummary.test.js` 后纠偏通过。
- terminal log 修复验证：真实 interactive 后 `.kitty/observability/terminal/20260705/20260705093821-9d7c64cd.log` 记录 `[tool] read src\taskBoard.js:1-200`，不再是 `(missing path)`。

发现的问题和分层：

- 模型行为：`customer` session 改了测试而不是实现；这是任务解释/模型偏好，不是 harness。
- 模型工具参数：`cacheKey` 首次 `edit` 缺少 `edits`，harness 正确拒绝并同轮恢复；不是 wire contract。
- 模型实现迭代：`ledger` 需要 3 次 edit 和 3 次 bash 才修到通过；失败反馈能回到同一轮。
- 评测夹具：第一条 `csvSummary` 测试数据和断言不一致，导致无效中断 session；这不是 Kitty 失败。
- session replay / memory closeout 风险：恢复旧 session 时模型可被旧 near-field 事实带偏；二次明确检查当前文件和测试可恢复。status/title/memory 里仍可能残留旧 focus 文案，属于剩余产品风险。
- observability log：terminal log fallback 丢工具参数，显示 `(missing path)`；已修复并加测试。
- config/env：当前 PowerShell 下 `npm test` 会受 `npm.ps1` 执行策略影响，`cmd /c npm test` 或 `npm.cmd` 正常；不做平台命令特判。

本轮修复：

- `src/observability/terminalLog.ts`：terminal log fallback 的 `tool_call/tool_result/tool_error` 保留 payload，并把 cwd 传给 formatter。
- `tests/observability/terminal-log.test.ts`：新增 fallback 工具参数可审阅回归测试，同时保留 streamed block、输入回显去重、done 去重等测试。
- `dist/` 已重新 build，真实 `node dist/cli.js resume ...` 验证过工具路径显示。

已验证：

- `npm.cmd run test:build`
- `node --test .test-build\tests\observability\terminal-log.test.js`
- `npm.cmd run build`
- `cmd /c npm test` in `C:\Users\Administrator\Desktop\kitty-tool-accuracy-workspace`
- `npm.cmd run verify`，262 个 core tests 通过。

剩余风险：

- 恢复旧 session 时，模型第一轮可能仍按旧 near-field 事实回答；当前 workaround 是要求它重新读取当前文件或运行当前测试。是否要从 status/memory closeout 层进一步硬化，需要单独设计。
- 本轮只实测当前 GPT/YLS provider；DeepSeek/relay 的字段级 replay 仍依赖现有 provider 测试和 production eval，没有在本轮切换真实 provider 重跑。

## 10. 追加工具准确性矩阵

用户要求继续做大量真实测试，目标从 20 个有效工具修复任务扩到 40 个左右。

追加范围：

- 继续使用 `C:\Users\Administrator\Desktop\kitty-tool-accuracy-workspace`。
- 被测 Kitty 仍只操作隔离工作区，不进入 Kitty 源码目录。
- 追加任务覆盖查询字符串、semver、日期窗口、树形路径、feature flags、histogram、stack trace、路径清理、batch 分组、schema diff、range merge、cron 描述、依赖锁检查、dotenv 解析、颜色转换、slug、CSV join、metric rate、table sort、权限矩阵。
- 每个任务先放一个坏实现和一个目标测试；让 Kitty 只改对应实现文件并运行目标测试。
- 可接受模型多轮修复；重点记录无效工具调用、越界改动、失败后恢复能力。

追加验收口径：

- 有效任务最终测试通过。
- `cmd /c npm test` 覆盖全部模块并通过。
- `events` 能审阅每个 session 的 tool.started/tool.completed/tool.failed。
- 发现 harness 问题才改 Kitty；模型偏好和夹具错误只记录，不做特判。

追加收口：

- 本轮实际追加 22 个有效任务，总有效任务数达到 42。
- 新增任务覆盖 `queryString`、`semver`、`businessDays`、`treePaths`、`featureFlags`、`histogram`、`stackTrace`、`safePath`、`batch`、`schemaDiff`、`rangeMerge`、`cronText`、`lockCheck`、`dotenvParse`、`color`、`slug`、`csvJoin`、`metricRate`、`tableSort`、`permissions`、`dedupe`、`markdownLinks`。
- 新增 22 个 session 全部最终通过目标测试；没有 tool.failed。
- 新增任务中 `rangeMerge` 第一次把相邻区间也合并，目标测试失败后同轮修正；这是模型实现细节迭代，harness 反馈路径正常。
- `csvJoin` 使用 `write` 重写整个小文件而不是 `edit`，结果正确但工具选择略粗。
- 42 个有效修复任务总计：198 次 tool.started，197 次 tool.completed，1 次 tool.failed；工具分布 read=94、edit=45、write=1、bash=58。另有 1 次 resume terminal log 验证 read，不计入修复任务矩阵。
- 唯一 tool.failed 仍是此前 `cacheKey` 的一次 `edit` 参数缺失；harness 正确拒绝并同轮恢复。
- `cmd /c npm test` in `C:\Users\Administrator\Desktop\kitty-tool-accuracy-workspace` 已覆盖 42 个模块并通过。
- 没有新增需要修改 Kitty harness 的问题。
