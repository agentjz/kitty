# Session 与 Provider

Session 是任务现场。

它保存消息、任务状态、checkpoint、session diff 和恢复所需事实。

Session 不把所有旧消息直接灌进当前轮。当前轮使用当前用户输入帧；同 session 连续体验由模型写出的 session memory 和结构化事实摘录承接；当前目标执行连续性由 working memory 承接；checkpoint 和 session diff 用于恢复和取证。

Session memory 不是工具。它是每轮完成后的固定生命周期行为：模型负责写记忆，机器负责保存、版本化、下一轮注入，并把失败记录到 observability。

Provider / Config 负责模型连接、provider 差异、请求恢复、环境变量和运行配置。
