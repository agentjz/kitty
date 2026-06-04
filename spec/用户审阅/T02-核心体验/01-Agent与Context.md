# Agent 与 Context

Agent 负责驱动一轮模型工作。

Context 负责模型当前看到什么。

Context 包含项目上下文、运行时上下文、工作记忆、session memory 和长上下文压缩。它提供事实，不替模型规划路线。

Provider 请求里的 raw messages 只取当前用户输入帧。上一轮和更早的同 session 对话不作为 raw history 回灌，而是通过模型写出的 session memory 进入运行时上下文。

Session memory 是模型写出的同 session 记忆。每个可见 assistant 结果完成后，agent turn 生命周期固定发起一次内部记忆更新请求；机器把当前轮用户输入、assistant 可见响应、工具结果、checkpoint、session diff 和已有记忆交给模型，再保存模型写出的记忆文本，并同步生成 `.kitty/memory/sessions/*.md` 供审阅。

机器附带的运行事实只保留可验证的死事实，例如可见 turn 计数、工具活动名称和 memory 更新时间。它不摘取旧用户输入，不生成用户锚点，不替模型判断用户意图，也不把旧 assistant 回答变成可复述的历史面。
