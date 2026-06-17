# Cost Kernel Plan

## 1. 需求文档

用户要把 Kitty 当作长期生产工具使用，核心成本压力来自 token 和缓存命中率。

现在只有一个模型，所以省钱不靠模型路由。省钱主线应该落在 harness 本身：稳定前缀尽量稳定，易变事实尽量后置，大内容尽量外置，skill 和 memory 尽量按需，缓存命中和浪费点必须能被用户审阅。

使用者是本地开发者。用户完成任务时应该看到：

- Kitty 每轮请求尽量复用稳定前缀。
- 大段历史、工具输出和运行事实不会无脑塞进上下文。
- `kitty status` 能说明当前上下文成本结构、缓存布局和最近请求是否有缓存命中。
- `kitty eval --run` 能验证缓存主线不是口号。

当前范围包含：

- 固化 Cost Kernel 作为当前产品主线的一部分。
- 保证 context budget 持久化后不丢 cache layout。
- 让 status 更直接呈现“省钱现场”。
- 让 eval 覆盖稳定前缀、按需 skill、大内容压缩和 cache usage 事实。
- 同步 README / philosophy / plan。

当前范围不包含：

- 不做模型路由。
- 不做多模型自动切换。
- 不做外部缓存服务。
- 不做向量记忆系统。
- 不做 provider 价格表和人民币金额估算。

业务完成标准：

- 一个模型也能通过上下文结构和 prompt cache 尽量省钱。
- 缓存布局事实能跨 session 保存和重新读取。
- 用户能从 status 看出稳定前缀、易变尾部和最近 cache hit/miss。
- eval 能证明省钱主线当前可验证。

## 2. 当前事实

当前代码事实：

- `src/context/runtime/compression/builder.ts` 已把 prompt 分成 stable prefix 和 volatile tail，并生成 `ContextCacheLayoutReport`。
- stable prefix 当前包含 static prompt 和 profile persona；runtime facts、project map、task lifecycle、session brief、skill index 和近场对话属于 volatile tail。
- `src/skills/prompt.ts` 默认只注入 skill 索引，不注入 skill 正文和资源。
- `src/provider/usageNormalizer.ts` 已归一化 OpenAI、DeepSeek、Anthropic、Gemini 的缓存 usage 字段。
- `src/runtime/status.ts` 已从 observability 读取最近 `model.request` usage。
- `src/cli/commands/runtimeStatusPresenter.ts` 已显示 context budget、cache layout 和 recent model requests。
- `src/evaluation/checks.ts` 已有 `cache-economy-ready` 检查。
- `src/session/snapshot.ts` 保存 session snapshot 时会写出 `contextBudget.cacheLayout`，但读取时没有恢复 `cacheLayout`。

当前测试事实：

- `tests/context/compression.test.ts` 已验证稳定前缀不受 runtime facts 变化影响。
- `tests/provider/*cache*` 和 `tests/provider/usage-normalizer.test.ts` 已覆盖 provider cache policy 和 usage 归一化。
- `tests/runtime/status.test.ts` 已覆盖 status 显示 recent model cache facts。
- `tests/evaluation/harness.test.ts` 已覆盖 eval check 列表和运行。

当前文档事实：

- README 已写成本优先上下文，但还没有把 Cost Kernel 作为一条明确能力写厚。
- philosophy 已写上下文预算和 prompt cache 思路，但 status / eval / 持久化边界还不够明确。

当前缺口：

- `contextBudget.cacheLayout` 重载丢失，这是硬 bug，会削弱生产可审阅性。
- 省钱事实散在 context、status、eval、provider 中，没有一个清晰的成本核验结构。
- `kitty status` 的模型缓存行还偏技术字段，没有明确说明 stable/tail 比例和 usage 不可用时的含义。
- `kitty eval` 的 cache economy 检查还不够覆盖“skill 只给索引”和“大内容压缩不污染稳定前缀”。

当前未知点：

- 真实 provider 长会话 cache hit 率仍需带 API key 长时间观察。
- 不同 provider 的 usage 字段完整性由上游决定，Kitty 只能记录和呈现事实。

## 3. 失败测试

- session snapshot 写入 `contextBudget.cacheLayout` 后再读取，如果 `cacheLayout` 丢失，应失败。
- runtime prompt 中 skill 正文或 resource 内容默认进入上下文，应失败。
- runtime facts / project map / task lifecycle 改变后 stable prefix fingerprint 变化，应失败。
- 大量旧 tool 输出触发压缩后，稳定前缀 fingerprint 变化，应失败。
- `kitty status` 有 cache layout 时不显示 stable/tail 字符结构，应失败。
- `kitty eval --run` 不能验证 cache economy、stable prefix、usage normalization 和 skill index boundary，应失败。

## 4. 目标

- 修复 session snapshot 的 `cacheLayout` 读取。
- 为 Cost Kernel 建立明确的代码事实：稳定前缀、易变尾部、cache layout、usage 和 skill 按需加载都能被测试覆盖。
- 强化 `kitty status` 的成本呈现：用户能看到 cached、hit rate、stable/tail 字符、stable ratio。
- 强化 `kitty eval --run` 的 cache economy 检查：不仅验证 provider usage，也验证 stable prefix、volatile tail 和 skill index boundary。
- 同步 README / philosophy，明确一个模型下的省钱主线。

## 5. 不做范围

- 不加入模型路由。
- 不新增 env 配置。
- 不改变 provider 选择策略。
- 不引入外部数据库或缓存服务。
- 不把价格估算写死进代码。
- 不把语义判断交给机器规则。

## 6. 设计

主链路：

输入 -> context prompt layers -> compressed request -> provider request -> usage observability -> session contextBudget -> status/eval 审阅。

模块边界：

- `src/context/runtime/compression/builder.ts` 继续负责 cache layout 和预算事实。
- `src/session/snapshot.ts` 只负责把已生成的预算事实完整保存和恢复。
- `src/runtime/status.ts` 继续聚合 session budget 和 provider usage。
- `src/cli/commands/runtimeStatusPresenter.ts` 只负责把成本事实呈现给用户。
- `src/evaluation/checks.ts` 负责产品验收，不替代单元测试。

状态归属：

- stable prefix fingerprint 和 volatile tail fingerprint 属于 context budget。
- provider cache hit/miss 属于 observability model.request usage。
- 是否“值得加载某个 skill”仍由模型判断；机器只保证默认上下文只给索引。

错误和恢复：

- 旧 session 缺 `cacheLayout` 时允许读取为 undefined；当前新 session 保存后必须能恢复。
- provider 不返回 usage 时 status 明确显示 usage unavailable，不伪造命中率。

## 7. 实施任务

- [x] 修复 `src/session/snapshot.ts`，读取 `contextBudget.cacheLayout`。
- [x] 补测试：session snapshot roundtrip 保留 cache layout。
- [x] 补测试：runtime prompt skill index 不包含 skill body/resource 内容。
- [x] 补测试：压缩大 tool 输出后 stable prefix 保持稳定，volatile tail 变化。
- [x] 强化 status 成本呈现，显示 stable/tail ratio 和 usage unavailable 边界。
- [x] 强化 eval cache economy 检查，覆盖 stable prefix、volatile tail、usage normalization、skill index boundary。
- [x] 同步 README / philosophy 的 Cost Kernel 描述，删除模型路由暗示。
- [x] 运行局部测试、typecheck、build、完整 verify。
- [x] 更新收口。

## 8. 验证计划

局部验证：

- `npm.cmd run test:build`
- `node --test .test-build/tests/session/session-store.test.js`
- `node --test .test-build/tests/context/compression.test.js`
- `node --test .test-build/tests/runtime/status.test.js`
- `node --test .test-build/tests/evaluation/harness.test.js`
- `node --test .test-build/tests/provider/usage-normalizer.test.js`
- `node --test .test-build/tests/provider/cache-policy.test.js`

完整验证：

- `npm.cmd run verify`

手动检查：

- `node dist/cli.js eval --run`
- `node dist/cli.js status`

未验证内容：

- 真实 provider 长会话 cache hit 率。
- 真实价格节省金额。

剩余风险：

- provider 不返回 usage 时，Kitty 只能显示未知，不能判断省钱是否发生。
- 字符数不是 token 数，只能作为本地预算近似；真实 token 仍由 provider 计量。

## 9. 收口

已执行。

完成事实：

- 修复 `contextBudget.cacheLayout` 读取丢失问题，session snapshot roundtrip 后缓存布局事实不再丢。
- `kitty status` 的成本呈现增强：显示 stable/tail 字符、stable ratio、stable sources、volatile sources、cache miss 和 provider usage unavailable 边界。
- `kitty eval --run` 的 cache economy 场景增强：验证 provider usage 归一化、provider cache policy、stable/volatile fingerprint、skill index boundary 和大输出压缩。
- context 测试补齐：skill 默认只注入索引，不注入正文或 resource 路径；大 tool 输出压缩不改变稳定前缀。
- README 和 philosophy 已同步 Cost Kernel：一个模型也要省钱，省钱来自上下文结构和缓存命中，不来自模型路由。

修改文件：

- `README.md`
- `philosophy.md`
- `plan.md`
- `src/session/snapshot.ts`
- `src/cli/commands/runtimeStatusPresenter.ts`
- `src/evaluation/checks.ts`
- `tests/session/session-store.test.ts`
- `tests/context/compression.test.ts`
- `tests/runtime/status.test.ts`

验证结果：

- `npm.cmd run test:build` 通过。
- `node --test .test-build/tests/session/session-store.test.js` 通过。
- `node --test .test-build/tests/context/compression.test.js` 通过。
- `node --test .test-build/tests/runtime/status.test.js` 通过。
- `node --test .test-build/tests/evaluation/harness.test.js` 通过。
- `node --test .test-build/tests/provider/usage-normalizer.test.js` 通过。
- `node --test .test-build/tests/provider/cache-policy.test.js` 通过。
- `npm.cmd run verify` 通过，174 个测试全部通过，0 失败。
- `node dist/cli.js eval --run` 通过，cache economy 场景显示 `stablePrefix`、`compactedTailChars` 和 `skillIndex=only`。
- `node dist/cli.js status` 通过，当前仓库能正常显示 workspace、skills、model cache、project map 和 execution 现场。

未验证内容：

- 没有带真实 API key 跑长会话 cache hit 率。
- 没有估算真实金额节省。

剩余风险：

- provider 不返回 usage 时，Kitty 只能显示 unavailable，不能伪造命中率。
- 当前预算仍以字符数做本地近似；真实 token 和真实缓存账单以 provider usage 为准。
