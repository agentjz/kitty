# 上下文与会话

Context 和 Session 共同保证任务连续性。

Provider raw messages 由 `src/context/runtime/conversationWindow.ts` 先构建同 session 近场可见对话，再交给 `src/context/runtime/compression/` 做预算压缩。internal wake 和内部控制输入不进入自然对话主轨。

`src/context/runtime/budget.ts` 生成 context budget report，记录 limit、estimated、remaining、usage ratio、压缩模式、压缩原因、来源分桶和 prompt hotspots。Agent turn 把最近一次 budget 保存到 session，`kitty status` 从 session 投影这份机器测量事实。

同 session 对话连续性由两层组成：

- `src/session/memory.ts` 集中维护 session memory 的固定 Markdown 区块和长度边界。
- `src/session/memoryCompaction.ts` 在可见 assistant 结果完成后构建内部模型请求，让模型更新结构化 session memory。
- `src/agent/turn/lifecycle.ts` 固定触发 session memory 更新，并把更新失败记录到 observability。
- `src/context/runtime/sessionBrief/` 把模型写出的 session memory 和可验证运行事实注入当前轮。
- `src/session/memoryAsset.ts` 把同一次保存里的 session memory 写到 `.kitty/memory/sessions/*.md`，使用 runtime memory 统一 metadata 头，作为可审阅文件资产。

记忆更新请求包含当前用户输入、assistant 可见结果、工具结果、checkpoint 和 session diff。模型按 `Current Focus`、`User Constraints`、`Decisions`、`Open Threads`、`Verification Facts`、`Reusable Lessons` 六个区块写记忆。`sessionBrief` 不从旧对话生成用户锚点或长文本首尾摘录；长任务连续性来自模型写出的 session memory，自然近场连续性来自 provider raw messages 里的可见对话。机器只附带可见 turn 计数、工具活动名称和更新时间这类死事实。

Runtime memory asset 由 `src/runtime/memory/metadata.ts` 统一解析 kind、title、scope、tags、updated 和 evidence refs；`src/runtime/memory/writer.ts` 统一创建 project/user/evidence asset；`src/runtime/memory/search.ts` 做多词候选召回，返回 score 和命中行，不把结果自动注入上下文。

Session workset 由 `src/session/workset.ts` 维护，随 session snapshot 保存。`read`、`edit`、`write` 成功后通过工具上下文记录文件读取和变更事实。`src/context/runtime/workingMemory/` 和 `src/runtime/status.ts` 只投影这份 workset，不另建第二套事实。

当前工作焦点和执行连续性由 `src/context/runtime/workingMemory/` 承接。

关键代码：

- `src/context/projectContext.ts`
- `src/context/runtime/`
- `src/context/runtime/conversationWindow.ts`
- `src/context/runtime/workingMemory/`
- `src/context/runtime/sessionBrief/`
- `src/context/runtime/compression/`
- `src/session/`
- `src/session/workset.ts`
- `src/session/memoryAsset.ts`
- `src/session/checkpoint/`

对应测试：

- `tests/context/`
- `tests/session/`
