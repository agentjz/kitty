# Agent 与 Context

Agent 负责驱动一轮模型工作。

Context 负责模型当前看到什么。

Context 包含近场可见对话、项目上下文、运行时上下文、工作记忆、session memory 和长上下文压缩。它提供事实，不替模型规划路线。

Provider 请求里的 raw messages 使用同 session 的近场可见对话。internal wake 和内部控制输入不进入自然对话主轨。预算足够时保留完整可见对话；超预算时摘要旧对话，保留最近对话 tail。Session memory 承接更长任务脉络，runtime facts 只作为证据层。

Session memory 是模型写出的同 session 记忆。每个可见 assistant 结果完成后，agent turn 生命周期固定发起一次内部记忆更新请求；机器把当前轮用户输入、assistant 可见响应、工具结果、checkpoint、session diff 和已有记忆交给模型，再保存模型写出的结构化记忆文本，并同步生成 `.kitty/memory/sessions/*.md` 供审阅。

Session memory 正文使用固定 Markdown 区块：`Current Focus`、`User Constraints`、`Decisions`、`Open Threads`、`Verification Facts`、`Reusable Lessons`。区块格式由机器提供，区块内容由模型根据事实写出。

机器附带的运行事实只保留可验证的死事实，例如可见 turn 计数、工具活动名称、memory 更新时间和上下文预算来源。它不生成用户锚点，不替模型判断用户意图，也不把 runtime facts 当成自然对话历史。
