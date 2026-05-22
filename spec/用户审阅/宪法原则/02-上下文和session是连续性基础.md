# 上下文和 session 是连续性基础

Kitty 的长期价值是任务能继续。

Context 决定模型当前看到什么。Session 保存任务现场。Checkpoint、working memory、模型写出的 session memory 和压缩摘要都服务这个连续性。

这些结构提供事实，不替模型规划路线。

当前用户输入帧保持清楚。同 session 的对话脉络进入模型写出的 session memory 和结构化事实摘录，不整段回灌 raw history。工具产物、运行事件和文件变更留在证据层，需要时再取。

机器只保存事实、边界和记忆文本。模型负责把当前轮事实压缩成同 session 记忆。进入记忆模型的事实包括当前输入、assistant 可见结果、工具结果、checkpoint 和 session diff。

当前落点：

- `src/context/`
- `src/context/runtime/workingMemory/`
- `src/context/runtime/sessionBrief/`
- `src/context/runtime/compression/`
- `src/session/`
- `src/session/checkpoint/`
