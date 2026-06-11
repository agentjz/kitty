# 记忆与自然上下文重构计划

## 目标

把 Kitty 的会话体验从“从账本拼回上下文”改成“自然延续当前对话”。

当前只处理存在的主干能力：session messages、session memory、working memory、runtime facts、tool evidence、context budget、status、测试和文档。不写旧兼容，不解释不存在的能力。

## 源码依据

- Codex：`ref/repos/codex/codex-rs/core/src/compact.rs` 和 `session/rollout_reconstruction.rs` 表明主线是 thread / rollout history；compaction 是替换历史的 checkpoint，不是把运行事实伪装成用户记忆。
- Aider：`ref/repos/aider/aider/history.py` 和 `/tokens` 实现表明 chat history 是一等上下文；repo map、文件、系统提示、历史分别计量，超预算时摘要旧历史并保留新 tail。
- LangMem：`ref/repos/langmem/src/langmem/short_term/summarization.py` 表明摘要只在 token 阈值后触发；running summary 记录已经摘要过的消息，新近消息保持原样。
- OpenCode：`ref/repos/opencode/packages/opencode/test/v2/session-message-updater.test.ts` 表明 compaction / tool / assistant event 应还原为清晰会话消息；事件是构造消息的证据，不是替代消息本身。

结论：真实近场对话必须先进入模型；session memory 是长任务连续性；runtime facts 是证据层。三者不能互相冒充。

## 当前缺口

- `buildCompressedContextRequest` 只取当前用户帧，短 session 也看不到第一轮到当前轮的自然对话。
- session memory 和 completion facts 被迫承担“刚刚聊了什么”的职责，体验像读记录。
- `继续` 这种短输入本应由模型根据近场对话理解，但当前上下文容易让模型转向项目状态检查。
- context budget 只有总量和 prompt hotspot，看不出压力来自真实对话、session memory、runtime facts 还是项目上下文。

## 设计

### 1. 近场对话是 provider 主轨

Provider request 使用当前 session 的可见对话窗口：

- 保留用户与 assistant 的自然消息。
- 保留必要 tool boundary，避免孤立 tool output。
- 排除 internal wake 和内部控制输入。
- 预算足够时保留完整可见对话。
- 超预算时摘要旧对话，保留最近 tail。

### 2. Session memory 是连续性资产

Session memory 继续由模型在 turn 收口时写入。它负责长任务焦点、约束、决策、未完成事项和验证事实，不替代短会话近场对话。

### 3. Runtime facts 是证据层

Task lifecycle、execution、wake、completion facts、checkpoint、session diff 只作为事实证据进入 prompt。它们不描述“用户刚刚说过什么”，也不压过近场对话。

### 4. Budget 按来源暴露

Context budget 增加来源分桶：

- system prompt。
- near-field conversation。
- summarized conversation。
- compacted tail。

status 和测试使用同一个 budget 事实，不另造统计逻辑。

## 执行清单

- [x] 新增可见对话窗口构建器，统一过滤 internal 输入和保护 tool boundary。
- [x] 主 provider request 从当前用户帧改为近场可见对话。
- [x] 压缩逻辑改为摘要旧可见对话、保留近场 tail。
- [x] context budget 增加来源分桶。
- [x] 保留 session memory 生命周期，但不让它替代短会话原始对话。
- [x] 更新“当前用户帧”相关测试为“近场对话”行为。
- [x] 增加 internal wake 不进入近场对话测试。
- [x] 增加短 session 从第一轮回溯的行为测试。
- [x] 增加 budget 分桶测试。
- [x] 同步 philosophy / spec 中的当前记忆设计。
- [x] 运行 `npm.cmd run verify`。

## 完成标准

- 短 session 里，模型请求包含可见近场对话，而不是只包含当前用户输入。
- 长 session 超预算时，旧对话被摘要，新近对话保持原样。
- internal wake 不进入用户对话主轨。
- budget 能说明上下文压力来源。
- 代码、测试、文档讲同一个当前事实。
- `npm.cmd run verify` 通过。
