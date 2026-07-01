# Session 与 Provider

Session 是任务现场。

它保存消息、任务状态、checkpoint、workset、session diff 和恢复所需事实。

Session 不把运行账本伪装成对话。当前轮使用同 session 的近场可见对话；预算足够时保留完整可见对话，超预算时摘要旧对话并保留最近对话 tail。同 session 长任务连续体验由模型写出的 session memory 承接；当前工作焦点和执行连续性由 working memory 承接；checkpoint 和 session diff 用于恢复和取证。

Session memory 不是工具。它是每轮完成后的固定生命周期行为：模型负责按固定区块写记忆，机器负责保存、版本化、下一轮注入，并把失败记录到 observability。session record 是运行时状态入口；`.kitty/memory/sessions/*.md` 是同一次保存生成的可审阅记忆文件。

固定区块是格式边界，不是机器语义判断。机器不决定哪些事实重要，只提供 `Current Focus`、`User Constraints`、`Decisions`、`Open Threads`、`Verification Facts`、`Reusable Lessons` 这些稳定栏目。

Session workset 是当前现场索引。文件被读取或变更后进入 workset，记录路径、读取次数、变更次数、最后工具和 change id。它让模型和用户知道当前任务真正碰过哪些文件，但不替模型判断哪些文件重要。

Provider / Config 负责 provider/model catalog、模型连接、provider 差异、请求恢复、环境变量和运行配置。

Provider 和 Model 分开维护事实。Provider 负责入口、认证、transport、超时和连接探测；Model 负责 wire API、工具能力、reasoning、cache、上下文上限、输出上限和请求参数。正常 provider 走标准探测；中转 provider 作为 `relay` transport 统一管理，连接探测按当前模型的 wire API 走真实请求入口，而不是默认假设 `/models` 一定存在。

YLS 和 TTAPI 是当前内置 relay provider。它们不是普通 OpenAI-compatible provider，也不靠 CLI/TUI 特判；catalog 声明 provider transport，request / doctor 从 catalog 推导行为。DeepSeek 是标准 provider，thinking + tool call 的 reasoning_content 回传属于 provider/model 的事实，不是 session 的随手补丁。

DeepSeek 工具调用链路的用户体验要求是：模型调用工具后，工具结果能回到同一轮现场，模型继续完成回答。内部必须完整保留 DeepSeek 要求回传的 thinking `reasoning_content`；压缩上下文和请求恢复不能把它当成普通可删摘要。这个字段不展示成用户内容，也不写成用户意图，只作为 provider 后续请求的 wire 事实。
