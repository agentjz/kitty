# 上下文与会话

Context 和 Session 共同保证任务连续性。

Provider raw messages 由 `src/context/runtime/compression/` 从当前用户输入帧构建。

同 session 对话连续性由两层组成：

- `src/session/memoryCompaction.ts` 在可见 assistant 结果完成后构建内部模型请求，让模型更新 session memory。
- `src/agent/turn/lifecycle.ts` 固定触发 session memory 更新，并把更新失败记录到 observability。
- `src/context/runtime/sessionBrief/` 把模型写出的 session memory 和结构化事实摘录注入当前轮。

记忆更新请求包含当前用户输入、assistant 可见结果、工具结果、checkpoint 和 session diff。结构化事实摘录包含会话开头锚点、近期对话、长文本首尾和工具活动名称。它不做语义压缩。

当前目标执行连续性由 `src/context/runtime/workingMemory/` 承接。

关键代码：

- `src/context/projectContext.ts`
- `src/context/runtime/`
- `src/context/runtime/workingMemory/`
- `src/context/runtime/sessionBrief/`
- `src/context/runtime/compression/`
- `src/session/`
- `src/session/checkpoint/`

对应测试：

- `tests/context/`
- `tests/session/`
