# Session 与 Provider

Session 是任务现场。

它保存消息、任务状态、checkpoint、workset、session diff 和恢复所需事实。

Session 不把运行账本伪装成对话。当前轮使用同 session 的近场可见对话；预算足够时保留完整可见对话，超预算时摘要旧对话并保留最近对话 tail。同 session 长任务连续体验由模型写出的 session memory 承接；当前工作焦点和执行连续性由 working memory 承接；checkpoint 和 session diff 用于恢复和取证。

Session memory 不是工具。它是每轮完成后的固定生命周期行为：模型负责按固定区块写记忆，机器负责保存、版本化、下一轮注入，并把失败记录到 observability。session record 是运行时状态入口；`.kitty/memory/sessions/*.md` 是同一次保存生成的可审阅记忆文件。

固定区块是格式边界，不是机器语义判断。机器不决定哪些事实重要，只提供 `Current Focus`、`User Constraints`、`Decisions`、`Open Threads`、`Verification Facts`、`Reusable Lessons` 这些稳定栏目。

Session workset 是当前现场索引。文件被读取或变更后进入 workset，记录路径、读取次数、变更次数、最后工具和 change id。它让模型和用户知道当前任务真正碰过哪些文件，但不替模型判断哪些文件重要。

Provider / Config 负责 provider/model catalog、模型连接、provider 差异、请求恢复、环境变量和运行配置。DeepSeek thinking + tool call 的 reasoning_content 回传属于 provider/model 的事实，不是 session 的随手补丁。
