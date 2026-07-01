# T05 Provider 与模型

Provider 层负责把 Kitty 的模型请求变成当前 provider 能接受的 wire request，并把返回、usage、cache、错误恢复成统一事实。

## 当前模块边界

- `src/provider/catalog.ts`：provider/model 固有事实。包括 provider id、label、transport、API kind、超时、model wire API、context/output 限制、reasoning、tool、cache 能力。
- `src/provider/capabilities.ts`：把 catalog 事实投影成请求期能力，不读取 `.env`。
- `src/provider/transport.ts`：根据 provider transport 和 base URL 生成 endpoint、headers 和 probe 入口。
- `src/provider/connection.ts`：doctor / production eval 的连接探测。它报告 provider、model、base URL 组合是否可用，不替用户猜配置。
- `src/provider/request.ts`：一次 provider 请求生命周期。它处理 stream/non-stream、abort、usage、cache facts 和错误归一。
- `src/provider/responsesAdapter.ts`：OpenAI Responses wire API 转换。
- `src/provider/chatCompletionsAdapter.ts`：Chat Completions wire API 转换。
- `src/provider/chatRequestBody.ts`：Chat Completions 请求体，包含 DeepSeek reasoning replay 这类 wire 要求。
- `src/provider/usageNormalizer.ts`：把 provider usage 字段归一成 runtime 可读事实。
- `src/provider/cachePolicy.ts`：把 provider/model cache 能力转成请求事实和 status 事实。

## Provider 与 Model 分离

Provider 管入口、认证、transport 和 API 风格。

Model 管 wire API、上下文限制、输出限制、reasoning、tool、cache 能力。

`resolveModelProfile` 必须同时解析 provider 和 model。未知 provider 或 provider 下没有该 model，直接报错，不做默认猜测。

## Relay 边界

YLS、TTAPI 这类中转站是 provider transport 的特殊事实，不污染标准 provider。

Relay provider 可以使用 Responses probe，而不是默认 `/models`。404 诊断必须提示同时检查 `KITTY_PROVIDER`、`KITTY_MODEL` 和 `KITTY_BASE_URL`，不能只怪 base URL。

## Reasoning Replay

DeepSeek thinking tool call 后续请求必须回传 `reasoning_content`。这个是 provider wire contract，不是 prompt 规则。

当前事实位置：

- `src/session/messages.ts` 决定哪些 assistant reasoning content 能进入后续请求。
- `src/provider/chatRequestBody.ts` 负责按 provider/model capabilities 生成请求体。
- `src/provider/chatCompletionsAdapter.ts` 负责保存 DeepSeek thinking tool call 的 replay 字段；如果本次 tool call 的 reasoning token 为 0，也必须保存空字符串，不能折叠成字段缺失。
- `src/context/runtime/compression/builder.ts` 构建 provider request 时必须携带 provider；只靠 model 无法判断 DeepSeek replay 规则。
- hard compression 可以删除普通 assistant reasoning content；不能删除带 tool call 的 assistant `reasoningContent`，否则下一轮 DeepSeek 请求会缺必需字段。
- `tests/provider/deepseek-replay.test.ts` 保护这个行为。

如果 DeepSeek assistant message 同时包含 tool call 和 thinking reasoning，后续所有请求都必须保留同一条 assistant message 的 `reasoning_content`。这个字段可以是空字符串；空字符串表示本次 tool call 没有可见 reasoning token，但 wire 字段仍然存在。

如果当前轮本地已发现 tool-call assistant message 缺失 `reasoningContent`，应在构建请求体前失败，不能发送一个必然 400 的请求。已经保存在 session 历史里的不可回放 tool batch 不能伪造 reasoning；context 层把它投影成普通 assistant 历史事实，并跳过对应 tool message，避免一条坏历史永久卡死后续对话。

## Usage 与 Cache

Provider usage 进入 observability 和 runtime status。

OpenAI cached tokens、DeepSeek cache hit/miss、stable prefix fingerprint 都是机器事实。它们只用于展示和验收，不替模型判断任务价值。

## 验收

- `tests/provider/model-catalog.test.ts`
- `tests/provider/connection.test.ts`
- `tests/provider/deepseek-replay.test.ts`
- `tests/provider/request-body-cache.test.ts`
- `tests/provider/usage-normalizer.test.ts`
- `tests/provider/cache-policy.test.ts`
- `kitty eval --run-production`，其中 `production-tool-turn` 使用真实 provider 跑一次工具调用闭环。
