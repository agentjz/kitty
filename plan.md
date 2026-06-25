# Provider / Model Catalog Plan

## 1. 需求文档

用户要解决的问题：Kitty 现在的多 provider 适配不够硬。Provider、Model、wire API、thinking、工具调用、缓存和成本事实混在一起，导致换模型时体验不稳定，尤其是 GPT 中转、DeepSeek thinking/tool call 和 OpenAI-compatible 之间容易互相误判。

使用者：本地使用 Kitty 的用户。用户只想在 `.kitty/.env` 里选择 provider、base URL、model 和 key，然后 `kitty doctor` 能明确告诉他配置是否可用，运行时不会因为模型协议细节吞消息、慢半拍或 400。

用户应该看到的体验：

- `.kitty/.env` 能清楚配置当前入口和模型。
- `.kitty/.env.example` 和 `kitty init` 生成的模板讲同一个事实。
- `kitty doctor` 能检查 provider、model、wire API、thinking、tool call、reasoning replay、上下文上限和连接状态。
- DeepSeek thinking 模式下，只要发生工具调用，后续请求必须完整回传该 assistant 轮的 `reasoning_content`，不能再因为丢 reasoning 触发 400。
- YLS / TTAPI 这类 GPT 中转不能被粗暴当成“官方 OpenAI”，它们是 OpenAI SDK 入口上的具体 provider profile，wire API 和 request 能力由 model/profile 决定。

当前范围包含：

- 参照 opencode，把 Provider 和 Model 分开。
- Provider 管入口、认证、SDK/协议类型、base URL、默认 headers/body、连接探测。
- Model 管 capabilities、cost、limit、wire API、thinking/reasoning、tool call、cache、request 参数。
- 建立 Kitty 自己的 provider/model catalog 主事实源。
- 同步 `.kitty/.env`、`.kitty/.env.example`、env template、init 和 doctor。
- 覆盖 DeepSeek 官方 thinking + tool call 的 `reasoning_content` 回传要求。
- 覆盖 GPT 中转、OpenAI-compatible、DeepSeek official 的真实配置。

当前范围不包含：

- 不新增模型路由。
- 不把 Anthropic/Gemini/Bedrock 等非 OpenAI SDK 协议一次性接成真实 SDK。
- 不把几千行模型清单硬塞进 `.env` 注释里污染用户配置。
- 不做旧兼容、不保留 legacy 分支、不写“旧配置如何迁移”的产品主线。

业务完成标准：

- 用户能从模板选择当前模型。
- 配错时 doctor 能说明哪里错。
- 运行时只从 catalog 读取 provider/model 能力，不再靠 provider 名或 model 前缀到处猜。
- DeepSeek tool-call reasoning replay 有自动测试保护。

## 2. 当前事实

当前代码事实：

- `src/provider/capabilities.ts` 用 provider/model 字符串推导 `wireApi`、reasoning、timeout。
- `src/provider/request.ts` 先解析 capabilities，再选择 `responsesAdapter` 或 `chatCompletionsAdapter`。
- `src/provider/chatRequestBody.ts` 目前对 DeepSeek 有专门逻辑：thinking 默认 enabled；如果发现带 toolCalls 的 assistant 轮没有 `reasoningContent`，会关闭 thinking。
- `src/provider/chatCompletionsAdapter.ts` 能从 streaming delta 读取 `reasoning_content`，也会在 assistant + toolCalls 消息里回传 `reasoning_content`。
- `src/provider/responsesAdapter.ts` 用 Responses API；当前未提交改动里已加了 `thinking=disabled` 时不发送 reasoning 的测试和实现。
- `src/provider/cachePolicy.ts` 通过 capabilities 判断 OpenAI/DeepSeek/generic cache 行为。
- `src/provider/client.ts` 用 OpenAI SDK 创建 client pool，timeout 也来自 capabilities。
- `src/config/providerPresets.ts` 当前只有 YLS、TTAPI、DeepSeek 三个 preset。
- `src/config/projectEnvTemplate.ts` 从 `PROVIDER_PRESETS` 生成 `.kitty/.env` 和 `.kitty/.env.example`。
- `src/config/init.ts` 只负责创建 `.kitty/.env`、`.kitty/.env.example`、`.kittyignore`。
- `src/config/preflight.ts` 只按 env keys 和 provider preset 匹配做 preflight。
- `src/cli/commands/doctor.ts` 输出 provider/model/baseUrl 并探测 `/models`。
- `src/types/config.ts` 的 runtime config 只有 `provider/baseUrl/model/thinking/reasoningEffort`，没有独立 provider ID + model info 的解析产物。

当前测试事实：

- `tests/config/project-env-template.test.ts` 要求 `.kitty/.env.example` 从模板生成，并要求本地 `.kitty/.env` 当前 active provider block 匹配已知 preset。
- `tests/config/preflight.test.ts` 期望默认 preset 是 DeepSeek official V4。
- `tests/provider/request-body-cache.test.ts` 已覆盖 OpenAI prompt cache key 和 DeepSeek 不发送 cache_control。
- `tests/provider/responses-request-body.test.ts` 是未提交新增测试，覆盖 OpenAI Responses thinking disabled/default reasoning。

当前配置事实：

- `.kitty/.env.example` 当前默认 DeepSeek official V4，备选 YLS GPT-5.4、TTAPI GPT-5.4。
- `.kitty/.env` 当前启用 YLS，中转 base URL 是 `https://code.ylsagi.com/codex`，模型是 `gpt-5.5`，thinking enabled，reasoning effort high；真实 key 不进入计划正文。
- 当前 `.kitty/.env` 的 active block 不匹配 `PROVIDER_PRESETS`，完整测试会因此失败。

参考项目事实：

- opencode 的 `ProviderV2.Info` 管 provider id/name/enabled/env/api/request。
- opencode 的 `ModelV2.Info` 管 providerID、model api、capabilities、request、variants、cost、status、limit。
- opencode 的 catalog 在请求前合并 provider.request 和 model.request，模型能力不散落在调用点。
- opencode 通过 `models.dev` 获取 provider/model catalog；当前 `models.dev/api.json` 可见 144 个 provider。
- Continue/Cline/Goose/Codex 都区分“OpenAI-compatible 入口”和“官方 OpenAI/Responses 能力”，不会只靠 provider 名猜完整模型行为。

DeepSeek 官方事实：

- DeepSeek thinking mode 默认 enabled，`reasoning_effort` 支持 high/max；low/medium 映射 high，xhigh 映射 max。
- DeepSeek Create Chat Completion 当前模型 ID 包含 `deepseek-v4-flash`、`deepseek-v4-pro`。
- DeepSeek thinking mode 下，无工具调用轮次的 `reasoning_content` 可不参与后续上下文；但发生工具调用的 assistant 轮，后续所有请求必须完整回传 `reasoning_content`，否则 API 返回 400。
- DeepSeek chat completion 输出里 `reasoning_content` 与 `content` 同级，工具结果用 `role=tool` 和 `tool_call_id` 回传。

当前缺口：

- Provider 与 Model 没有分层主事实源。
- `resolveProviderCapabilities`、`chatRequestBody`、`cachePolicy`、`client`、`connection` 都各自从 provider/model 字符串推断事实。
- DeepSeek reasoning replay 是 adapter/message 里的局部行为，还没有 Model capability 明确表达。
- YLS/TTAPI 作为中转没有独立 provider profile，容易和 official OpenAI 混成一个 provider。
- env template、env example、本地 env、init、doctor、tests 没有围绕 catalog 形成闭环。
- opencode 支持的 provider/model catalog 还没有成为 Kitty 可审阅资产或生成源。

未知点：

- YLS 中转对 `gpt-5.5` 的实际 wire API 能力需要用真实请求或用户现有可用事实确认；计划按当前 `.kitty/.env` 作为本地事实写入 catalog，但不假装它等同官方 OpenAI。
- opencode/models.dev 全量 provider 中，哪些能通过 Kitty 当前 OpenAI SDK 路径直接使用，哪些只是 catalog 可见但需要未来非 OpenAI SDK adapter，实施时必须显式标注。

## 3. 失败测试

先写应当失败或当前没有保护的行为：

- Provider/Model 分层测试：同一个 provider 下不同 model 能有不同 wire API、thinking、tool call、cache、limit，不允许只由 provider 推断。
- YLS profile 测试：`provider=yls` 或等价 profile 能指向 YLS base URL 和 OpenAI SDK 入口，但不能被标成 official OpenAI。
- OpenAI official 测试：official OpenAI + GPT Responses 模型走 Responses adapter；OpenAI-compatible chat 模型走 chat.completions。
- DeepSeek official 测试：`deepseek-v4-flash` / `deepseek-v4-pro` 使用 chat.completions，thinking 参数和 reasoning effort 按官方 high/max 规则生成。
- DeepSeek tool-call replay 测试：assistant message 有 toolCalls 且有 reasoningContent 时，后续 request body 必须包含完整 `reasoning_content`。
- DeepSeek 400 防护测试：assistant message 有 toolCalls 但 reasoningContent 缺失时，不能继续构造一个会触发 400 的 thinking tool-call 请求；必须在构造层给出明确失败或明确降级规则。
- env template 测试：`.kitty/.env.example` 必须由当前 template 生成；template 中的 provider/model 必须来自 catalog。
- 本地 env 测试：`.kitty/.env` 当前 active block 必须匹配 catalog 中一个可用 provider/model/profile，不泄露 key。
- init 测试：新项目 `kitty init` 生成的 `.env`、`.env.example` 与 template 一致，并能被 preflight 识别。
- doctor 测试：doctor 输出 provider/model catalog 诊断，包含 provider profile、model capability、wire API、reasoning replay、limit、connection probe。
- request observability 测试：`model.request` 事件记录 providerId、modelId、wireApi、baseUrl、usage/cache，不再只有模糊 provider 字符串。
- 完整验证：`npm.cmd run verify` 必须通过。

## 4. 目标

最终交付结果：

- 新增或重构出 `ProviderInfo` 与 `ModelInfo` 主事实源。
- 运行时解析配置时得到 `ResolvedModelProfile`：provider、model、adapter、wire API、request defaults、capabilities、limits、cost、cache policy。
- 所有 provider 请求构造、client timeout、doctor、cache policy、usage/cost/status 都读取同一个解析结果。
- DeepSeek reasoning replay 规则成为 model capability，不散落在字符串判断里。
- YLS、TTAPI、DeepSeek official、OpenAI official、OpenAI-compatible 都在 catalog 中有清楚边界。
- opencode/models.dev 支持的 provider/model 作为 Kitty catalog 输入来源或可审阅 snapshot 进入代码/资产，但当前运行只启用 Kitty adapter 真正支持的协议。
- `.kitty/.env`、`.kitty/.env.example`、env template、init、doctor 同步。
- 测试覆盖真实产品行为。

## 5. 不做范围

- 不实现 Anthropic/Gemini/Bedrock 原生 SDK 请求。
- 不引入模型路由或自动选便宜模型。
- 不做 UI 重构。
- 不做远程服务。
- 不把所有模型展开成 `.env` 巨型注释；完整模型事实进 catalog，用户配置只保留当前启用项和少量清晰示例。
- 不保留旧 `resolveProviderCapabilities` 的字符串猜测作为主线；如果保留函数名，只能变成 catalog 查询薄封装。

## 6. 设计

主链路：

输入配置 `.kitty/.env` -> `loadRuntimeConfig` 读取 provider/baseUrl/model/thinking/reasoningEffort -> provider/model catalog 解析为 `ResolvedModelProfile` -> provider client 创建 -> adapter 构造 request -> model 返回 message/toolCalls/reasoningContent -> session 保存 assistant/tool facts -> 后续请求按 model replay policy 回放 -> observability/status/doctor 暴露同一事实。

模块边界：

- `src/provider/catalog.ts`：维护 ProviderInfo、ModelInfo、ResolvedModelProfile 类型和查询。
- `src/provider/providerCatalog.ts`：内置 provider profile。Provider 只描述入口、认证、SDK/协议类型、base URL 默认值、headers/body、probe 策略。
- `src/provider/modelCatalog.ts`：内置 model profile。Model 只描述 providerId、wire API、capabilities、cost、limit、cache、request 参数、reasoning replay 策略。
- `src/provider/resolve.ts`：把 runtime config 解析成 ResolvedModelProfile。其它模块不再自己猜 provider/model。
- `src/provider/request.ts`：接收 ResolvedModelProfile 或在入口处解析一次，再调用 adapter。
- `src/provider/chatRequestBody.ts`：只根据 ResolvedModelProfile 构造 Chat Completions body。
- `src/provider/responsesAdapter.ts`：只根据 ResolvedModelProfile 构造 Responses body。
- `src/provider/cachePolicy.ts`：从 ModelInfo.cache 生成 cache policy。
- `src/provider/client.ts`：从 ProviderInfo/ResolvedModelProfile 读取 base URL candidates、timeout、SDK type。
- `src/provider/connection.ts`：从 ProviderInfo probe 策略和 ModelInfo 生成 doctor 诊断。
- `src/config/providerPresets.ts`：不再是能力源，只是从 catalog 中选出的 env preset 列表。
- `src/config/projectEnvTemplate.ts`：从 preset/catalog 生成 `.env` 和 `.env.example`。
- `src/config/preflight.ts`：检查 env active provider/model 是否能被 catalog 解析。
- `tests/provider/*` 与 `tests/config/*`：围绕 catalog 行为重写/补齐。

核心类型：

```ts
type ProviderApiKind = "openai-sdk" | "openai-compatible" | "deepseek-openai-compatible" | "unsupported";

interface ProviderInfo {
  id: string;
  label: string;
  apiKind: ProviderApiKind;
  authEnv: "KITTY_API_KEY";
  defaultBaseUrl: string;
  request: { headers: Record<string, string>; body: Record<string, unknown> };
  probe: { modelsEndpoint: boolean; timeoutMs: number };
}

interface ModelInfo {
  id: string;
  providerId: string;
  label: string;
  wireApi: "responses" | "chat.completions";
  capabilities: {
    tools: boolean;
    reasoning: boolean;
    reasoningContentReplay: "never" | "tool-call-required";
    streaming: boolean;
    usage: boolean;
    cache: "prompt-cache-key" | "provider-automatic" | "none";
  };
  request: {
    thinkingDefault?: "enabled" | "disabled";
    reasoningEffortDefault?: "high" | "max" | "xhigh";
    maxOutputTokensParam: "max_tokens" | "max_output_tokens";
  };
  limit: { context: number; output: number };
  cost?: { input: number; output: number; cacheRead?: number; cacheWrite?: number };
}
```

Provider 设计：

- `openai-official`：官方 OpenAI。默认可用 Responses。
- `yls-codex`：YLS GPT 中转。使用 OpenAI SDK 入口，但不是 official OpenAI；model 决定走 Responses 还是 Chat。
- `ttapi`：TTAPI GPT 中转。使用 OpenAI SDK 入口，但不是 official OpenAI。
- `deepseek`：DeepSeek official。OpenAI-compatible Chat Completions，支持 thinking/tool call reasoning replay。
- `openai-compatible`：用户自定义 OpenAI-compatible。默认 Chat Completions，capabilities 保守，需要用户显式选择 model catalog 或 future custom model。

Model 设计：

- DeepSeek：`deepseek-v4-flash`、`deepseek-v4-pro`。
- GPT 中转：把当前实际用到的 `gpt-5.5` 纳入 YLS profile；保留模板中已出现的 `gpt-5.4`，但能力不能自动等同 official OpenAI。
- OpenAI official：放入当前 Kitty 支持的 GPT Responses/chat model profiles。具体 ID 以当前可验证事实和 opencode/models.dev snapshot 为准，不能靠记忆硬写。
- opencode/models.dev：作为 catalog seed 或生成脚本输入；只把 Kitty 当前 adapter 能真实调用的模型标为 enabled，其他 provider/model 标为 catalog-known but unsupported，不进入默认模板启用项。

DeepSeek reasoning replay 设计：

- session message 必须保存 assistant 的 `reasoningContent`。
- chat request body 转换时，如果 model capability 是 `tool-call-required`：
  - assistant message 有 toolCalls 且有 reasoningContent：原样回传 `reasoning_content`。
  - assistant message 有 toolCalls 但缺 reasoningContent：不构造 thinking enabled 的后续 tool-call 请求；应抛出用户可理解的 runtime error 或显式关闭 thinking 并记录原因。实现时优先选择不伪造事实。
  - assistant message 无 toolCalls：可不强制回传 reasoningContent。
- streaming 和 non-streaming 都必须读取 reasoning_content。

错误和恢复：

- provider/model 未在 catalog 中：配置错误，doctor 和 runtime 都给出同一条修复路径。
- provider 支持但 model unsupported：说明当前 adapter 不支持，不假装可用。
- DeepSeek replay 缺 reasoningContent：说明当前 session 缺少继续 thinking tool call 所需事实；不要静默发送会 400 的请求。
- 中转 base URL 404/405：继续保留 base URL candidate 逻辑，但由 ProviderInfo 控制。

文档关系：

- README 只说明用户如何配置 provider/model，不展开 catalog 实现细节。
- `.kitty/.env.example` 是模板产物。
- `.kitty/.env` 是本地当前事实，更新时保留真实 key，只修 active provider block 结构和 model/preset 一致性。

## 7. 实施任务

- [ ] 建立 provider/model catalog 类型和查询。
  - 文件：`src/provider/catalog.ts`、`src/provider/providerCatalog.ts`、`src/provider/modelCatalog.ts`、`src/provider/resolve.ts`。
  - 验收：单测能查询 provider、model、resolved profile，未知项报明确错误。

- [ ] 把 `resolveProviderCapabilities` 改成 catalog 薄封装或删除其主事实职责。
  - 文件：`src/provider/capabilities.ts`。
  - 验收：不再存在 provider/model 前缀硬猜主逻辑。

- [ ] 重接请求入口。
  - 文件：`src/provider/request.ts`、`src/provider/client.ts`。
  - 验收：adapter 选择、timeout、base URL candidate 来自 ResolvedModelProfile。

- [ ] 重接 Chat Completions body。
  - 文件：`src/provider/chatRequestBody.ts`、`src/provider/chatCompletionsAdapter.ts`。
  - 验收：DeepSeek thinking/reasoning/tool call replay 由 ModelInfo capability 驱动。

- [ ] 重接 Responses body。
  - 文件：`src/provider/responsesAdapter.ts`。
  - 验收：OpenAI/YLS GPT Responses 模型根据 ModelInfo 发送 reasoning，不再靠 provider 名。

- [ ] 重接 cache policy。
  - 文件：`src/provider/cachePolicy.ts`。
  - 验收：OpenAI prompt_cache_key、DeepSeek automatic cache、generic none 都来自 ModelInfo.cache。

- [ ] 重接 provider connection / doctor。
  - 文件：`src/provider/connection.ts`、`src/cli/commands/doctor.ts`、`src/config/preflight.ts`。
  - 验收：doctor 输出 provider profile、model profile、wire API、reasoning replay、context/output limit、probe 结果。

- [ ] 重写 env preset 生成。
  - 文件：`src/config/providerPresets.ts`、`src/config/projectEnvTemplate.ts`。
  - 验收：preset 从 catalog 引用 provider/model；模板仍短、清楚、可手改。

- [ ] 同步三个环境文件事实。
  - 文件：`src/config/projectEnvTemplate.ts`、`.kitty/.env.example`、`.kitty/.env`。
  - 验收：`.env.example` 等于模板输出；`.env` active block 匹配 catalog；真实 key 不被删除。

- [ ] 同步 init。
  - 文件：`src/config/init.ts` 如有需要。
  - 验收：新项目 init 生成同一套模板，并能通过 preflight。

- [ ] 补 DeepSeek 400 防护测试。
  - 文件：`tests/provider/deepseek-reasoning-replay.test.ts` 或合适 provider 测试文件。
  - 验收：有 reasoningContent 时完整回传；缺 reasoningContent 时不发送危险 thinking request。

- [ ] 补 provider/model catalog 测试。
  - 文件：`tests/provider/model-catalog.test.ts`。
  - 验收：Provider 和 Model 分工清楚；YLS/TTAPI/DeepSeek/OpenAI-compatible 都有边界测试。

- [ ] 补 env/init/doctor 测试。
  - 文件：`tests/config/project-env-template.test.ts`、`tests/config/preflight.test.ts`、doctor 相关测试。
  - 验收：本地 env、example、init、doctor 都讲同一个 catalog 事实。

- [ ] 同步 README。
  - 文件：`README.md`。
  - 验收：Provider 章节从“OpenAI-compatible provider”更新为“provider/model catalog”，用户能看懂怎么配。

- [ ] 收口验证。
  - 命令：`npm.cmd run verify`。
  - 验收：完整通过；如果真实 provider smoke 另跑，记录命令和结果。

## 8. 验证计划

局部验证：

- `npm.cmd run typecheck`
- `npm.cmd run build`
- `node --test .test-build/tests/provider/*.test.js`
- `node --test .test-build/tests/config/*.test.js`

完整验证：

- `npm.cmd run verify`

手动检查：

- `node dist/cli.js doctor`
- `node dist/cli.js tui` 启动后确认当前 provider/model 现场不吞第二条输入。
- 检查 `.kitty/.env` 不泄露、不丢 key、active provider block 可被 catalog 识别。
- 检查 `.kitty/.env.example` 与 `buildProjectEnvTemplate(true)` 一致。

DeepSeek 真实风险检查：

- 构造一次 DeepSeek thinking + tool call 的测试会话。
- 确认 assistant tool call 轮的 `reasoning_content` 被 session 保存。
- 下一次请求确认 request body 仍完整带回该 `reasoning_content`。
- 如果真实 API 不跑，至少用 request body 测试锁死 400 根因。

未验证内容：

- 非 OpenAI SDK 原生 provider 不在本次真实运行范围内。
- opencode/models.dev 全量 144 provider 不逐个连通；本次只把 catalog 作为事实输入和未来扩展边界，不假装全部可运行。

## 9. 收口

当前状态：计划已写，尚未实现。

已确认事实：

- 当前 Kitty provider 能力存在字符串推断和局部 DeepSeek 防护。
- opencode 的成熟边界是 Provider/Model/Catalog 分层。
- DeepSeek 官方文档明确 thinking + tool call 后续必须完整回传 `reasoning_content`，否则 400。
- 本地 `.kitty/.env` 当前 active model 是 `gpt-5.5`，与现有 preset 不匹配。

实施完成后必须更新本节：

- 目标是否完成。
- 失败测试是否变绿。
- 改动文件清单。
- 运行验证命令。
- 未验证内容。
- 剩余风险。
