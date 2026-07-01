# DeepSeek 工具调用 400 修复 Plan

## 1. 需求文档

用户要解决的实际问题是：使用 DeepSeek 模型时，只要模型走工具调用，后续请求就可能返回 400，导致 Kitty 无法完成真实任务。

用户需要的体验：

- DeepSeek 能正常完成“模型决定调用工具 -> 工具返回结果 -> 模型继续回答”的完整回合。
- 如果 provider 返回 DeepSeek wire contract 错误，Kitty 暴露清楚原因，不把消息吞掉。
- 修完后必须用当前 `.kitty/.env` 的真实 DeepSeek 配置实测工具调用链路。

完成标准：

- 自动测试覆盖 DeepSeek 工具调用后续请求必须携带 `reasoning_content`。
- 真实 DeepSeek provider 工具调用验收通过。
- 普通 verify 仍通过。

## 2. 当前事实

已确认事实：

- 当前 `.kitty/.env` 是 `KITTY_PROVIDER=deepseek`、`KITTY_MODEL=deepseek-v4-flash`、`KITTY_BASE_URL=https://api.deepseek.com`。
- `src/provider/catalog.ts` 已声明 DeepSeek 使用 `chat.completions`，`reasoningContentReplay=tool-call-required`。
- `src/provider/chatRequestBody.ts` 对 DeepSeek 会发送 `thinking`，并在 assistant tool call message 缺 `reasoningContent` 时抛错。
- `tests/provider/deepseek-replay.test.ts` 只测试了“已有 reasoningContent 会进入请求体”和“缺失会抛错”。
- 现有测试没有覆盖真实 agent turn 中“第一轮 provider 返回 tool_calls + reasoning_content，工具执行后第二轮请求必须回传同一 reasoning_content”的完整链路。
- DeepSeek 官方文档要求：thinking 模式下，若某轮发生工具调用，后续请求必须完整回传该轮 assistant message 的 `reasoning_content`，否则 API 会 400。

已收束事实：

- 真实 DeepSeek 流式工具调用返回的 `reasoning_content` 会被当前 `chatCompletionsAdapter` 收集到 assistant response。
- 工具执行后的第二次 provider 请求原先可能因为 request config 缺 provider 或 hard compression 删除 reasoningContent 而丢失 replay 必需字段。
- 当前 400 的根因是 DeepSeek thinking + tool call 的 `reasoning_content` replay 没有在所有后续请求路径里被当成 provider wire contract 保住。

## 3. 失败测试

以下情况视为失败：

- 构造一轮 assistant tool call + reasoningContent + tool result 后，DeepSeek 请求体没有把 `reasoning_content` 放回 assistant tool call message。
- agent turn 测试里，第二次 provider 请求看不到第一轮 tool call assistant 的 `reasoningContent`。
- 真实 DeepSeek 工具调用验收返回 400。
- 修复后 `npm.cmd run verify` 不通过。

## 4. 目标

本轮交付目标：

- 把 DeepSeek 工具调用 replay 作为 provider wire contract 固化到测试。
- 若发现请求体或上下文压缩丢 `reasoning_content`，修到主链路。
- 增加显式真实验收方式，能用当前 `.kitty/.env` 实测 DeepSeek 工具调用。
- 更新 spec，说明 DeepSeek 工具调用 replay 的当前事实。

## 5. 不做范围

- 不改 YLS/TTAPI relay 逻辑。
- 不引入新 provider 框架。
- 不改 TUI/Web/Telegram UI。
- 不做旧兼容，不写 legacy 分支。
- 不用关键词或正则判断语义。

## 6. 设计

主链路：

用户输入进入 session。provider 返回 assistant tool call。agent 保存 assistant message，其中必须包含 `toolCalls` 和 DeepSeek 返回的 `reasoningContent`。工具执行后保存 tool message。下一轮构建 context request 时，assistant tool call 和 tool message 必须在同一工具边界里保留，并在发给 DeepSeek 的 Chat Completions request 中带上 `reasoning_content`。

模块边界：

- `chatCompletionsAdapter`：只负责 DeepSeek/OpenAI-compatible streaming/non-streaming wire parse，不做 session 判断。
- `chatRequestBody`：负责把 ProviderMessage 转成 Chat Completions request body，并执行 DeepSeek wire contract 校验。
- `context/runtime/compression`：负责保留工具调用边界，不得在 DeepSeek replay 必需消息上删除 reasoningContent。
- `agent/turn`：负责保存 provider 返回的 assistant reasoning/tool call/tool result 事实。
- `evaluation` 或脚本：负责真实 provider 验收，不混进日常测试。

错误边界：

- 如果真实 provider 没返回 reasoningContent 却返回 tool_calls，Kitty 应在下一次请求前报出本地 wire contract 错误，而不是发送必然 400 的请求。
- 如果 provider 直接返回 400，错误信息必须保留 provider 原始事实，方便判断是请求体还是服务端限制。

## 7. 实施任务

- [x] 加测试覆盖 agent turn 第二次 provider 请求携带 DeepSeek `reasoningContent`。
- [x] 加测试覆盖 compression 不会在 DeepSeek 工具 replay 场景丢 `reasoningContent`。
- [x] 按测试结果修 provider/context/session 主链路。
- [x] 增加真实 DeepSeek 工具调用验收入口或脚本。
- [x] 用当前 `.kitty/.env` 运行真实 DeepSeek 工具调用验收。
- [x] 运行 provider/context/agent 局部测试。
- [x] 运行 `npm.cmd run verify`。
- [x] 更新 spec/provider 当前事实。
- [x] 更新收口记录。

## 8. 验证计划

局部验证：

```bash
npm.cmd run test:build
node --test .test-build/tests/provider/deepseek-replay.test.js
node --test .test-build/tests/context/compression.test.js
```

真实验收：

```bash
node dist/cli.js eval --run-production
```

如果新增独立 DeepSeek probe，则运行该 probe，并要求真实工具调用链路完成。

完整验证：

```bash
npm.cmd run verify
```

## 9. 收口

目标状态：已完成代码修复、局部测试、真实 DeepSeek production tool turn、spec 同步和完整 verify。

根因：

- recovery/context request 原先只携带 model，没携带 provider。DeepSeek replay 判断必须知道 provider，不能只靠 model 猜。
- hard compression 原先把 assistant `reasoningContent` 全删。普通 reasoning 可以删，带 tool call 的 assistant reasoning 是 DeepSeek 后续请求必需 wire 字段，不能删。

改动文件：

- `src/provider/retryPolicy.ts`
- `src/context/runtime/compression/builder.ts`
- `src/evaluation/types.ts`
- `src/evaluation/production.ts`
- `tests/provider/deepseek-replay.test.ts`
- `tests/evaluation/harness.test.ts`
- `spec/技术实现/T05-Provider与模型/README.md`
- `spec/技术实现/T07-验收分层/README.md`
- `spec/用户审阅/T02-核心体验/02-Session与Provider.md`
- `plan.md`

已验证：

```bash
npm.cmd run test:build
node --test .test-build/tests/provider/deepseek-replay.test.js .test-build/tests/evaluation/harness.test.js
npm.cmd run build
node dist/cli.js eval --run-production
npm.cmd run verify
```

真实 DeepSeek 生产验收结果：

- provider=`deepseek`
- model=`deepseek-v4-flash`
- `production-tool-turn` passed
- `assistantToolCalls=1`
- `reasoningReplay=1`
- `toolMessages=1`
- final answer contained `deepseek-tool-ok`

剩余风险：

- 真实 provider 长时间运行、更多工具组合和超长上下文仍需要后续生产使用观察；本轮已覆盖导致 400 的核心 wire contract。
