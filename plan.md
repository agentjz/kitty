# Kitty 缓存与省钱专项计划

## 目标

把缓存省钱能力接成当前真实主链路：请求侧尽量稳定前缀，provider usage 统一归一，运行时能看到 token 与缓存事实，eval 能防回归。

本轮不做语义 response cache，不做外部代理，不伪造 provider 未支持的请求字段，不用本地类型声明替代真实依赖。

## 当前事实

- `ProviderUsageSnapshot` 已包含输入、输出、总量、推理、缓存读取、缓存创建、缓存命中、缓存未命中和命中率。
- `normalizeProviderUsage` 是 provider usage 归一入口，覆盖 DeepSeek、OpenAI、Anthropic、Gemini 返回的缓存 usage 字段。
- Chat Completions 和 Responses adapter 都复用 usage normalizer。
- `model.request` observability 事件会写入 usage 明细和 `usageAvailable`。
- `kitty status` 会读取最近 `model.request` 事件并展示缓存 usage。
- OpenAI 请求会基于 session 或 project 生成稳定 `prompt_cache_key`。
- DeepSeek 不写无效 `cache_control`，依赖上游自动 prefix cache，并通过返回 usage 观测命中。
- 其他 provider 当前只解析返回 usage，不在请求侧声明未接入的 cache control。
- context budget 已包含 cache layout：stable prefix fingerprint、volatile tail fingerprint 和对应字符规模。
- `kitty eval --run` 已包含 `cache-economy-ready` 检查。
- `@types/ws` 已通过真实依赖安装解决，不保留本地假声明。

## 交付标准

- usage 解析只维护一处：`src/provider/usageNormalizer.ts`。
- 请求缓存策略只维护一处：`src/provider/cachePolicy.ts`，并引用现有 provider capabilities，不另造 provider 判断。
- 请求侧只写当前已实现字段：OpenAI `prompt_cache_key`。
- DeepSeek 请求不出现 `cache_control`。
- observability、runtime status、README、eval 和测试讲同一个当前事实。
- `npm.cmd test` 通过。

## 失败测试

- DeepSeek usage 输入包含 `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens` 时，输出命中、未命中和命中率。
- OpenAI usage 输入包含 `prompt_tokens_details.cached_tokens` 时，输出缓存读取 token。
- Anthropic usage 输入包含 `cache_read_input_tokens` / `cache_creation_input_tokens` 时，只作为返回 usage 被解析，不触发请求侧 cache control。
- Gemini usage 输入包含 cached content token 字段时，输出缓存 token。
- OpenAI 请求带稳定 `prompt_cache_key`。
- DeepSeek 请求不带 `cache_control` 和 `prompt_cache_key`。
- 未识别 provider 不获得请求缓存控制字段。
- context cache layout 在同一稳定 system prompt 下保持 stable prefix fingerprint 不变。
- runtime status 能展示最近模型请求缓存事实。
- eval 包含 cache economy 检查。

## 实施结果

### Provider usage

- [x] 扩展 `src/provider/metrics.ts` 的 usage 结构。
- [x] 新增 `src/provider/usageNormalizer.ts`。
- [x] 改造 `src/provider/chatCompletionsAdapter.ts`。
- [x] 改造 `src/provider/responsesAdapter.ts`。
- [x] 增加 `tests/provider/usage-normalizer.test.ts`。

### Provider cache policy

- [x] 新增 `src/provider/cachePolicy.ts`。
- [x] policy 引用 `resolveProviderCapabilities`，不另造 provider 分类事实源。
- [x] OpenAI 请求写入稳定 `prompt_cache_key`。
- [x] DeepSeek 请求保持自动 prefix cache，不写无效请求字段。
- [x] 未识别 provider 不获得请求缓存控制字段。
- [x] 增加 `tests/provider/cache-policy.test.ts`。
- [x] 增加 `tests/provider/request-body-cache.test.ts`。

### Observability 和 status

- [x] `src/provider/request.ts` 写入完整 usage 明细。
- [x] `src/runtime/status.ts` 读取最近 `model.request` 事件。
- [x] `src/runtime/statusTypes.ts` 暴露最近模型请求和 cache layout。
- [x] `src/cli/commands/runtimeStatusPresenter.ts` 展示模型缓存和 cache layout。
- [x] 扩展 observability 和 runtime status 测试。

### Context cache layout

- [x] `src/context/runtime/compression/builder.ts` 输出 stable prefix / volatile tail 指纹。
- [x] `src/context/runtime/budget.ts` 和相关类型携带 cache layout。
- [x] 扩展 context compression 测试。

### Eval 和文档

- [x] `src/evaluation/checks.ts` 增加 cache economy 检查。
- [x] `src/evaluation/types.ts` 增加检查 id。
- [x] `tests/evaluation/harness.test.ts` 锁定检查列表。
- [x] README 同步当前缓存事实。
- [x] 本计划同步当前实现和验证边界。

## 验证

- [x] `npm.cmd install`
- [x] `npm.cmd run test:build`
- [x] `npm.cmd run typecheck`
- [x] `npm.cmd test`

## 剩余边界

- 真实省钱取决于 provider 是否返回缓存 usage，以及上游是否真的命中缓存。
- 当前没有新增缓存 env key；缓存策略来自 provider capabilities 和 session/project 稳定事实。
- 当前没有接入 Anthropic 请求侧 `cache_control`。Anthropic 相关代码只解析 provider 返回的 usage。
- 费用金额没有实现，因为当前没有统一价格表事实源。现在只展示 token 和缓存命中事实。
