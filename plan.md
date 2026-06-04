# Memory 成熟体验计划

## 判断

Kitty 的 memory 主干方向是对的：模型写记忆，机器保存事实、投影资产、下一轮注入。问题不在“有没有 memory”，而在 memory 还是一段混合 summary，审阅性、更新边界和长期沉淀都不够硬。

成熟 agent 的共同原则：

- Codex：thread/session 保持连续，但压缩和恢复是生命周期事实，不伪装成用户输入。
- LangGraph：短期状态、checkpoint、长程持久化分层。
- Letta：memory 应该是可审阅的块，而不是聊天残渣。
- Goose：可复用能力和会话现场都应该是资产，而不是散落提示词。
- Aider/opencode：配置、状态和错误服务用户下一步，主干事实只维护一处。

Kitty 不复制外部架构。Kitty 的主线是：session memory 负责同 session 连续体验；working memory 负责当前目标执行；checkpoint/execution/event 留证据；memory asset 供用户审阅和沉淀。

## 目标

把 session memory 从“单段摘要”升级为“模型写出的固定结构记忆资产”。

机器只做格式边界、长度边界、保存、读取、搜索、删除、沉淀。机器不判断哪句话重要，不做关键词/正则语义分类。

模型负责把事实写进固定区块。

## Memory 结构

session memory 正文采用固定 Markdown 区块：

```md
## Current Objective
...

## User Constraints
...

## Decisions
...

## Open Threads
...

## Verification Facts
...

## Reusable Lessons
...
```

区块含义：

- `Current Objective`：当前仍然影响下一轮行动的目标。
- `User Constraints`：稳定用户约束和偏好，只保留会影响未来行动的内容。
- `Decisions`：已经形成、会影响后续执行的决定。
- `Open Threads`：未解决事项、下一步、阻塞。
- `Verification Facts`：工具、测试、文件变化等可验证事实。
- `Reusable Lessons`：可以沉淀到 skill/spec 的经验，不写临时聊天废料。

空区块写 `None`。旧 memory 如果不是这个格式，作为 previous memory 交给模型，由模型在下一次生命周期更新中改写成固定结构。

## 本轮交付清单

1. [x] `plan.md` 改为 memory 专项计划。
2. [x] `src/session/memory.ts` 集中维护 memory 区块定义、格式说明、边界规范和机械归一化。
3. [x] `src/session/memoryCompaction.ts` 使用同一份 memory 区块定义生成模型更新请求。
4. [x] `src/session/memoryAsset.ts` 投影为可审阅资产，元数据和 memory 正文边界清楚。
5. [x] `src/context/runtime/sessionBrief/build.ts` 注入结构化 memory，但仍不回灌 raw history，不把内部 wake 当用户意图。
6. [x] `src/runtime/memory/*` 保持资产读取、搜索、删除、沉淀为事实操作，不增加机器语义判断。
7. [x] 测试覆盖：固定结构提示、模型写出的结构化 memory 被保存、旧 memory 可进入下一次更新、asset 可审阅、search/delete/sink 行为不退化、internal wake 不写 memory。
8. [x] spec/README/philosophy 如有当前事实偏差，同步为“结构化 session memory asset”。
9. [x] 运行 `npm.cmd run typecheck`。
10. [x] 运行 `npm.cmd run verify`。

## 非目标

- 不引入向量库。
- 不做机器语义分类。
- 不把 memory 做成工具。
- 不恢复 raw transcript 回灌。
- 不把 checkpoint、execution、observability 混进 session memory 的存储主干。
- 不为了结构化而增加空壳数据库或兼容层。

## 验收标准

- 新 turn 结束后，session memory 是固定 Markdown 区块。
- 下一轮上下文能看到结构化 session memory，但 raw provider messages 仍只包含当前用户输入帧。
- `.kitty/memory/sessions/*.md` 是用户可审阅资产。
- `kitty memory` 的 list/read/search/delete/sink 继续正常。
- internal wake 不更新 memory。
- 文档、代码、测试讲同一个 memory 当前事实。
- 完整验证通过。
