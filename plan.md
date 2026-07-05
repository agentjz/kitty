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

- `@jun133/kitty` 当前包版本是 `0.0.18`。
- `dist/cli.js` 存在，`node dist/cli.js --version` 输出 `0.0.18`。
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

- production eval 不等同于真实用户在桌面工作区长时间使用 `dist/cli.js`。
- 现有 eval 的工具调用使用专用 eval 工具，不能完全代表模型使用真实 core 工具改文件。
- TUI 是否卡顿、输入是否被“总结中”阶段误导，需要真实交互观察。
- terminal log 和 observability 是否足够排查，需要读实际产物判断。
- 中断后继续和失败恢复需要真实路径验证。

当前未知点：

- 当前真实 provider 是 deepseek、relay 还是 openai-compatible，需要通过非泄密配置命令确认。
- 真实 provider 在工具调用较多后是否触发 wire/replay/上下文问题，需要长任务验证。
- terminal log 是否出现不可读 delta 串，需要真实日志判断。

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
- [ ] 用当前构建产物跑 CLI 多轮真实 provider 对话。
- [ ] 验证真实 core 工具创建/修改文件和运行命令。
- [ ] 跑一个长一点的自然语言开发任务。
- [ ] 验证中断后继续和 session resume。
- [ ] 验证 sessions/events/status/memory/terminal log/observability。
- [ ] 验证 TUI 真实输入、输出、runtime dock、总结中和中断体验。
- [ ] 运行现有 local/production eval，和手动验收互相对照。
- [ ] 定位发现的问题并按层分类。
- [ ] 修复可闭环根因。
- [ ] 为可复现失败增加测试或 eval。
- [ ] 同步 spec/history/README 中被事实改变的部分。
- [ ] 运行局部测试和 `npm.cmd run verify`。
- [ ] 更新本计划收口。

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

待执行。
