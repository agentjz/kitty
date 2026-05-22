# Agent 与 Context

Agent 负责驱动一轮模型工作。

Context 负责模型当前看到什么。

Context 包含项目上下文、运行时上下文、工作记忆、session memory 和长上下文压缩。它提供事实，不替模型规划路线。

Provider 请求里的 raw messages 只取当前用户输入帧。上一轮和更早的同 session 对话不作为 raw history 回灌，而是通过 session memory 和结构化事实摘录进入运行时上下文。

Session memory 是模型写出的同 session 记忆。每个可见 assistant 结果完成后，agent turn 生命周期固定发起一次内部记忆更新请求；机器把当前轮用户输入、assistant 可见响应、工具结果、checkpoint、session diff 和已有记忆交给模型，再保存模型写出的记忆文本。

结构化事实摘录保留同 session 的用户锚点、近期用户输入、长用户输入首尾和工具活动名称。它是事实 fallback，不做语义压缩，不替模型判断用户意图，也不把旧 assistant 回答变成可复述的历史面。
