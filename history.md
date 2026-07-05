# Kitty 开发历史

更新时间：2026-07-05

当前代码锚点：本次 `0.0.19` 发布提交

当前包版本：`@jun133/kitty@0.0.19`

用途：给后续窗口继续理解 Kitty。它不是 `spec/`，不是 README，也不是产品宣传。它记录从前身项目到当前版本的开发轨迹：做了什么，没做什么，试过什么，删过什么，失败在哪里，最后证明什么是对的。

项目所有者确认的命名演进：

```txt
hajimi -> DeepSeek CLI / deepseekcli -> Universe -> camera -> Athlete -> Deadmouse -> Kitty
```

说明：这个顺序以项目所有者确认的记忆为主。当前可见 Codex session 能证明 2026-03 已有 DeepSeek CLI 和 hajimi，2026-04 进入 Universe、camera、Athlete、Deadmouse，2026-05 进入 Kitty。更早的 hajimi 起点可能不在当前可见 Codex session 里。局部阶段可能有并行实验、分叉目录或临时名字，但这些都属于同一条 agent 项目演进线，不是外部旁系项目。

写法规则：

- 按历史阶段写，允许重复。
- 重复不是问题，因为历史本来就是不断尝试、推翻、重建、再收束。
- 每个阶段尽量写清：当时要解决什么，做了什么，哪条路错了，为什么错，哪条路对了，为什么对，最后进入当前主干的是什么。
- DeepSeek 只是其中一个阶段案例，不单独神化，也不单独做红线章节。
- 后续只有项目所有者明确要求更新时，才继续追加或重写这份文件。

证据来源：

- 当前仓库 `AGENTS.md`
- 当前仓库 `.codex/skills/kitty-agent-development/SKILL.md`
- 当前仓库 `spec/`
- 当前仓库 `VERSION_LOG.md`
- 当前仓库 git 历史
- Codex 全局 session：`C:\Users\Administrator\.codex\sessions`
- 关键 Kitty 长会话：`2026-05-20` 到 `2026-07-05`
- 前身项目相关会话：hajimi、DeepSeek CLI、Universe、camera、Athlete、Deadmouse、harness/provider/TUI/subagent 等项目探索

## 快速索引

| 阶段 | 时间 | 主题 | 最后留下的东西 |
| --- | --- | --- | --- |
| 00 | 2026-03 到 2026-04 | hajimi / DeepSeek CLI / Universe / camera / Athlete / Deadmouse 前身谱系 | 一个循环、少数硬工具、session/compact/resume/background/subagent 这些基础问题 |
| 01 | 2026-04 下旬 | 能力平台膨胀 | tools/skills/MCP/team/subagent/workflow 的统一能力协议曾经存在 |
| 02 | 2026-05-02 到 2026-05-03 | spec、context、checkpoint | spec 工作流、上下文运行时、隔离 checkpoint 的早期形态 |
| 03 | 2026-05-05 | 极简化大删减 | 保姆式兜底被砍掉，但也埋下过度瘦身问题 |
| 04 | 2026-05-20 到 2026-05-22 | 从过度瘦身回到成熟骨架 | core + extension、todo、lead wait、lifecycle、spec/code/test 对齐 |
| 05 | 2026-06-04 到 2026-06-12 | 记忆与上下文自然性 | 近场对话 + session memory + working memory + runtime facts 证据层 |
| 06 | 2026-06-12 到 2026-06-17 | skill、plan、eval、cache | runtime skills 四阶段、plan 单文件合同、缓存布局、生产验收分层 |
| 07 | 2026-06-18 到 2026-06-24 | TUI 产品壳 | Ink TUI、滚动、IME、光标、Markdown、session picker、runtime dock |
| 08 | 2026-06-22 到 2026-06-26 | 工具输出治理与现场表达 | raw output 落盘、模型只看投影、命令原样执行、自然现场 |
| 09 | 2026-06-25 到 2026-07-01 | 多 provider 与 DeepSeek replay | provider/model 分离、relay provider、DeepSeek reasoning_content 修复 |
| 10 | 2026-06-26 | eval 分层 | 日常测试和真实生产路径验收分离 |
| 11 | 2026-06-25 到 2026-06-26 | 多 provider | provider/model 分离，relay provider 单独管理 |
| 12 | 2026-07-01 | DeepSeek replay | 空 `reasoningContent` 也必须保存和回放 |
| 13 | 2026-07-01 | 发布体验 | 0.0.18 发布、postinstall/site/README 微调、默认 TUI |
| 14 | 2026-07-05 | 历史文档 | `history.md` 接住从前身项目到 Kitty 的开发轨迹 |
| 15 | 2026-07-05 | 真实生产路径验收 | GPT/YLS 真实 provider 下验证 core 工具准确性、resume、events/status/memory/terminal log |

## 阶段 00：前身谱系，Kitty 不是凭空开始的

时间：2026-03 到 2026-04

相关会话：

- `审查 deepseek-cli 流程合理性`
- `Evaluate deepseekcli project quality`
- `Design persistent agent loop`
- `推进 Universe 终端TUI与DeepSeek适配`
- `评估 agent 是否需要 harness`
- `彻底修复 Athlete 主干长难任务问题`
- `重构 Harness provider 抽象`
- `实现可恢复的多 Agent 调度系统`
- `压力测试 Agent Harness 约束边界`
- `统一将Athlete改名为Deadmouse`
- `强化 Deadmouse 临时SPEC底座`
- `研究 harness 约束冲突`
- `检查 DeepSeek 上下文压缩`
- `研究项目阶段与Agent设计`

当时要解决的问题：

这条线一开始不是 Kitty 这个名字。按项目所有者确认，它经历了 hajimi、DeepSeek CLI / deepseekcli、Universe、camera、Athlete、Deadmouse，最后收束成 Kitty。当前可见 Codex session 从 2026-03 的 DeepSeek CLI 和 hajimi 开始，后续 Universe、camera、Athlete、Deadmouse、Kitty 的路径比较清楚。它们不是旁系参考，而是同一个 agent 项目在不同名字、不同阶段下的试验。

最早的问题很朴素：怎样让一个模型不只是聊天，而是在本地真正干活。它要能读项目、跑命令、改文件、连续工作、长任务不中断、出错能恢复、上下文不爆炸。

当时做过的路线：

1. hajimi：最早的远程、init、聊天控制页和 Markdown 试验。
   hajimi 阶段已经有 remote 模块、手机聊天控制页、init、Linux/Windows 差异、Markdown 渲染、停止当前任务、新建对话、空对话这些体验问题。后来 Kitty 的 init、remote、TUI、Markdown、跨平台命令体验，都能在这里看到早期影子。

2. DeepSeek CLI：验证最小 agent 是否能跑起来。
   当时重点是 DeepSeek API、CLI 流程、权限模式、上下文压力、400 错误、长时间连续工作。早期曾经把权限想成 read-only 和 agent 两档，后来又明确安全审批不是主线，核心是 agent 模式能直接干活。

3. deepseekcli 多版本比较。
   曾经比较过多个 deepseekcli 项目，不看提交次数，看代码质量。那时已经开始关注超大文件、运行态目录、`.env`、`.gitignore`、stream renderer、worktree store、状态路径这些工程细节。早期结论是：强架构要继续收成稳架构。

4. persistent agent loop。
   那时已经出现后来反复回到的 12 类思想：一个循环、Bash 工具、计划、子任务独立上下文、知识按需加载、上下文压缩、任务写磁盘、resume、错误恢复、工具结果回灌、长任务持续推进。

5. Universe。
   这个阶段把“我要做一个 terminal-first agent runtime”写成 spec。重点不是 UI，而是低耦合、模块化、AI 能按模块实现、超长任务复杂任务、未来能扩展多 agent。Universe 还要求 DeepSeek reasoner、tool use、超长任务、thinking 动画、工具调用详情，目标是全面超过 hajimi 的 12 个原则。

6. camera。
   这个阶段开始做 v0 单 Agent React + Ink 终端交互壳。它继承 Universe 的 spec 思路，但更聚焦“终端交互壳”：流式输出、思考过程、工具调用详情、模型状态、启动命令、可测试体验。

7. Athlete。
   这个阶段开始进入真正 harness：provider、browser、document、spec、prompt、状态边界、长难任务、后台任务、子代理、多 agent 调度、控制面账本、TUI、真实 API 测试。

8. Deadmouse。
   Athlete 后来被整体改名为 Deadmouse。这个阶段继续强化底座，重点变成：机器层约束不要互相打架，工具触发不要靠关键词正则，模型判断和机器硬事实要分层。

当时证明有效的想法：

一个 agent 不是聊天框。它至少需要：

- 入口：用户输入怎么进入一轮 turn。
- 上下文：模型当前看到什么。
- 工具：模型怎么改变真实世界。
- 状态：做过什么、正在做什么、卡在哪里。
- 恢复：断了之后怎么继续。
- 输出：用户看到什么。

早期就已经出现过一句很重要的思想：

```txt
One loop & Bash is all you need.
```

这句话后来没有被机械照抄，但它留下了一个方向：少数硬工具比一堆花工具更可靠。工具越多，不代表 agent 越强；核心 loop、context、session、tool result、recovery 不稳，工具越多越乱。

### hajimi 阶段：先做出能被人用的 agent 壳

hajimi 是这条线更早的项目名。能从 session 看到的问题包括：remote 模块、手机访问、本地局域网地址、聊天式控制页、停止任务、init 在 Linux 上失败、Markdown 渲染不要靠字符串魔法拼接。

这一阶段走对的地方：

- 一开始就关心用户怎么控制 agent，而不是只关心模型 API。
- remote 体验、手机控制页、新建对话、停止任务这些都是真实产品体验。
- init 跨平台问题很早就暴露了。
- Markdown 渲染很早就被要求使用库，而不是手拼字符串。

这一阶段走错的地方：

- remote 更多是局域网体验，不是后来讨论的“任何地方两台机器都能互联”。
- 手机聊天控制页容易变成外壳优先，底层 harness 不够稳时会放大问题。
- UI 样式反复改，容易消耗精力。

最后留下来的实践：

- init/doctor/首次成功体验必须认真做。
- remote/TUI/Web 都只是壳，不是 harness 主干。
- Markdown 这类呈现问题要用成熟库和统一渲染管线。
- 停止当前任务、清理生命周期、用户可见现场都是核心体验，不是装饰。

### DeepSeek CLI 阶段：先证明模型能在本地跑起来

DeepSeek CLI 是起点。它解决的是“模型能不能通过 CLI 和本地工程发生关系”。当时大量讨论的是 API 是否能通、`.env` 放在哪里、中文乱码、上下文限制、400 错误、压力测试、持续运行。

这一阶段走对的地方：

- 先把 provider 接起来，而不是空谈 agent。
- 先用真实 API 测试，而不是只写 mock。
- 先暴露上下文和 token 限制问题，而不是假设模型无限强。
- 先承认安全沙箱不是这个项目主线。

这一阶段走错的地方：

- 一开始容易把流程写成过度强制的 Research / Plan / Execute / Verify 机械循环。
- 一开始容易把“无限时间、无限 token、永远不要停”当成能力目标，但后来证明这需要 harness 生命周期支撑，不能只靠提示词。
- 一开始容易把权限、模式、安全策略想得太重。后来证明这个项目更需要长任务连续性、上下文管理、工具可靠性，而不是保守审批。

最后留下来的实践：

- `.env` 是真实 provider 配置入口。
- provider 错误必须被认真对待，不能归咎为模型抽风。
- 长时间运行和上下文压力是核心问题，不是边角问题。
- 安全审批不做主线。

### Universe / camera 阶段：从脚本变成 terminal-first runtime

Universe 和 camera 阶段的核心是：这不是一个命令行小脚本，而是一个终端优先的 agent runtime。那时开始要求 spec、模块化、低耦合、适合 AI 按模块实现。

这一阶段做对的地方：

- 明确了“不是聊天工具，不是玩具，不是功能拼盘”。
- 明确了 terminal-first。
- 明确了复杂任务要有 session、compact、resume、sub-agent、任务账本。
- 明确了文档必须能指导后续 AI 开发，而不是散文。

这一阶段走错的地方：

- spec 文档容易越写越大。
- 文档如果不能和代码同步，就会变成第二个世界。
- 过早追求完整产品清单，会让实现阶段反复推倒。

最后留下来的实践：

- spec 是仓库事实主干，不是装饰。
- 文档、测试、代码必须讲同一个当前事实。
- 复杂任务可以用文档管总，但运行时不一定要做一个独立 spec 模式。

### Athlete 阶段：harness 真正变厚

Athlete 是这条线第一次明显变成“工业化 agent harness”。它开始处理 provider、browser、document、web、TUI、后台、子代理、多 agent、控制面、真实 API 测试。

当时做对的地方：

- 开始区分模型问题和 harness 问题。
- 开始要求真实长难任务测试，而不是只看单元测试。
- 开始把 provider / browser / document 生态绑定问题收敛到 harness 抽象。
- 开始重视后台进程退出、用户可见、生命周期清理。
- 开始认为 SPEC 必须和当前代码对齐，因为用户不会看代码，只看 spec 判断系统。

当时走错的地方：

- 机器层约束一度太强，容易和模型判断打架。
- 关键词正则一度被用于判断 web、browser、interactive intent，这后来被判定为坏方向。
- 多 agent / team 容易从“能力”滑成“组织表演”。
- 生态工具太多时，容易过度绑定某一类实现，比如 Playwright、特定文档工具、特定 provider。

最后留下来的实践：

- 该智能的交给模型，该稳定的交给机器。
- 工具触发不能主要靠关键词正则。
- 机器硬规则应该管执行边界、参数契约、失败暴露、状态记录。
- provider 适配要做抽象，但不能掩盖不同 provider 的真实 wire 差异。
- 后台和 subagent 必须有 lifecycle 和 control-plane。

### Deadmouse 阶段：强约束开始被重新审视

Athlete 改名 Deadmouse 后，主线变成底座强化和约束冲突修复。

这个阶段最重要的问题是：机器层面强约束到底什么时候有用，什么时候会伤害 agent。

当时证明错误的路线：

- 用机器正则替代模型判断。
- 用固定关键词判定工具意图。
- 用过度严格的 guard 让模型无法自然工作。
- 把所有可能问题都做成规则，导致规则之间互相打架。

当时证明正确的路线：

- 模型负责语义判断。
- 机器负责死事实和硬边界。
- loop guard 可以有，但应该看工具分级和是否有进展，而不是统一粗暴阈值。
- command policy、workflow guard、tool argument contract 这类确定性约束可以保留。

最后进入 Kitty 的实践：

- “机器做死事实，模型做活判断”成为核心原则。
- 搜索只暴露证据行，不判断重要性。
- 工具输出治理只压缩和投影事实，不替模型下判断。
- agent 开发时必须先看事实，再判断边界，最后行动。

当时走错过的路：

1. 把机器层约束想得太重。
   DeepSeek CLI、Athlete、Deadmouse 阶段都反复走过这条路。早期一度强调强约束、审批、机器硬门、复杂安全边界。后来 Kitty 的目标变了：不是企业安全沙箱，不是保守权限系统，而是探索大模型 agent 能力上限。安全审批不再是主线。

2. 把多 agent 想成组织结构。
   Athlete / Deadmouse 阶段有 team、teammate、message bus、policy、request store、coordination policy 等设计。它们在工程上能成立，但用户体验上容易变成概念壳。后来 Kitty 留下 subagent 作为“独立上下文隔离”，不再保留 team 叙事。

3. 把自我改进、dreaming、远程操控看得太早。
   Deadmouse 之前就讨论过 self-improve / dreaming：让 agent 24 小时看自己的源码、改自己、测试自己、再合并。后来 Kitty 阶段也讨论过 SSH/Telegram 式远程控制。最后这些都被放到主线之外。原因不是它们永远不可能，而是它们会把项目带离本地 harness 主干。

当时留下来的正确实践：

- agent 的核心不是工具数量，而是 harness 链路稳定。
- provider 要抽象，但不能抽象到看不见具体 API 差异。
- background/subagent 的生命周期必须有控制面事实。
- spec 可以帮助开发，但不能让 spec 变成第二套运行模式。
- 大模型负责活判断，机器负责死事实。

为什么这个阶段重要：

后来的 Kitty 看起来像 5 月开始重构，但它不是从 0 开始。DeepSeek CLI、Universe、camera、Athlete、Deadmouse 都是同一条项目线的前身。比如“不做安全审批主线”“工具少而硬”“上下文压缩要自然”“后台任务退出要收尸”“subagent 是上下文隔离，不是组织结构表演”“机器做死事实，模型做活判断”，都不是后期临时拍脑袋，而是在这些前身项目里反复试错后留下来的。

## 阶段 01：能力平台膨胀，曾经真的做过很厚的生态层

时间：2026-04 下旬

关键提交：

- `5cfd286`：当前目标帧、显式委派前缀、Lead 单兵执行、team/subagent 通道、旧 todo/checkpoint/task board carryover 隔离
- `132ea7c`：Team 由机器派发
- `44084c5`：重构能力协议平台，统一 tools/skills/MCP/team/subagent/workflow 扩展入口
- `c43298d`：改进 package，harness 可观测性
- `a5e6e41`：capability package 生命周期、scripted provider harness、regression case

当时要解决的问题：

Kitty 的前身或相邻项目已经开始追求“能力生态”。当时的判断是：agent 不能只有几个内置工具，将来必须支持工具、skill、MCP、team、subagent、workflow、能力包、manifest、runner、artifact、progress、wake signal。

当时做过的东西：

- `src/capabilities/*`
- `src/protocol/*`
- capability package 安装、列出、启用、禁用、诊断、结构测试
- tools / skills / MCP / team / subagent / workflow 统一注册入口
- provider scripted harness
- 从真实 session + trace 捕获 regression case
- background、team、subagent、worktree、network、document、browser、skill 等大量工具包

这条路为什么当时看起来对：

它解决了一个真实问题：agent 不能永远只有 core。只要未来要扩展，就需要能力边界、manifest、注册、启用、禁用、诊断、执行、回传、artifact、progress。这个方向不是错的。

后来发现的问题：

1. 平台厚度过早。
   当核心 turn、context、session、provider、tool result、recovery 还没完全稳的时候，能力平台越厚，越难判断错误来自哪里。

2. 概念太多。
   tools、skills、MCP、team、subagent、workflow、capability、protocol、package、runner 同时出现，新窗口和模型都容易被概念带跑。

3. team 变成伪产品。
   team 可以写出代码结构，但用户真正需要的是上下文隔离和任务完成，不需要“团队成员”叙事。

4. 测试数量多，但不一定保护当前产品体验。
   当时测试数量很大，后来曾经被拿来对比当前测试变少。但历史证明，测试多不等于正确；测试必须保护真实产品行为，而不是保护旧概念。

最后留下来的实践：

- 保留 core + extension 的思想。
- 保留 runtime tool registry。
- 保留 skill 能力包。
- 保留 subagent 作为独立上下文隔离。
- 保留 background/control-plane/lifecycle 这类真实运行事实。
- 删除 team 主线。
- 不把 capability platform 全量搬回来。

为什么这条历史重要：

后面每次用户觉得 Kitty “太薄”时，都会回看这个阶段。这个阶段证明：项目确实曾经很厚，但厚不等于成熟。成熟的厚度应该来自清晰职责，而不是能力名词堆叠。

## 阶段 02：spec、context、checkpoint 的早期骨架

时间：2026-05-02 到 2026-05-03

关键提交：

- `c937e27`：规划 Spec 模式开发工作流
- `d7151a1`：refactor agent context runtime
- `de8241e`：实现 SPEC 模式与隔离检查点
- `f0f5d69`：add web workbench and foundation tool loop
- `d8adcb2`：foundation tools for speed-first runtime
- `f0d9920`：foundation tools to four-tool core
- `35e7e98`：reorganize foundation tools as core layer

当时要解决的问题：

一方面想让 agent 真能写代码，另一方面想让复杂任务不乱跑。所以出现了两条并行主线：

1. foundation tools：让模型能搜、读、写、改、跑。
2. spec workflow：让复杂开发有 requirements、design、tasks、implement、validate 这样的阶段。

当时做过的东西：

- SPEC 模式。
- 隔离 checkpoint。
- context runtime。
- web workbench。
- foundation tool loop。
- 四个基础工具主线。
- todo / plan / spec 的早期讨论。

走对的地方：

1. 四个基础工具是正确的。
   核心工具最终长期保留为 `read`、`edit`、`write`、`bash`。搜索、git、构建、测试都可以通过 `bash` 做。这个方向后来被反复确认。

2. checkpoint 需要隔离。
   旧任务、旧目标、旧判断不能整段回灌到当前轮，否则模型会被拉回过去。checkpoint 可以作为连续性证据，但不能成为当前 objective 的主人。

3. context 是核心模块。
   上下文不是提示词堆叠。它决定模型当前看到什么，也决定长期任务能不能继续、省不省 token、会不会污染当前判断。

走偏的地方：

1. spec 作为交互模式过重。
   spec workflow 适合复杂开发，但如果做成运行时模式，会多出入口、多出状态、多出用户心智负担。

2. web workbench 过早。
   Web 是壳，不是主干。当主循环还在变，Web 太早容易变成第二套状态。

3. 工具越拆越容易失焦。
   工具可以分层，但基础工具不能被拆成一堆细碎 CRUD，让模型每次都在工具名之间犹豫。

最后留下来的实践：

- 四个 core tools 继续保留。
- spec 模式后来被删除，但 spec 文档留下来做当前事实主干。
- plan skill 后来继承 spec workflow 的“单文件总管”价值。
- checkpoint/session/context 继续作为连续性基础。

为什么这个阶段重要：

它是后面“plan 取代 spec 模式”的前身。不是 spec 错，而是 spec 不应该是一个独立运行模式。正确形式后来变成：`plan.md` 管当前任务，`spec/` 管仓库事实。

## 阶段 03：2026-05-05 极简化，砍掉保姆式复杂度，也砍过头了

时间：2026-05-05

关键提交：

- `c5428d2`：重构为极简核心架构
- `45a25d0`：压扁核心边界并移除保姆式兜底
- `e0e9404`：压扁核心运行时并保留持续运行地基
- `8c2b238`：接入 Super 扩展模式与 Socratic 工作流

当时要解决的问题：

项目太胖，概念太多，保姆式兜底太多。用户反复强调：不要把 agent 当小孩，不要什么都留证据，不要审批主线，不要一堆诊断味、分析味、保姆味的东西。Codex 的启发是：成熟工程师就是搜得到、看得懂、改得准、跑得通，不需要被一堆流程扶着走。

当时做的事情：

- 大量物理删除。
- 压扁核心边界。
- 删除 capability/protocol/execution/tool packs 的大量旧结构。
- 删除很多测试和 spec。
- 保留持续运行地基。
- 尝试留下 super / socratic 这类扩展壳。

当时走对的地方：

1. 保姆式兜底确实应该砍。
   假兼容、假过渡、旧残余、温柔包装错误，都会让项目越来越复杂。

2. 当前事实主干高于历史兼容。
   当前没有的能力，不应该出现在源码、测试、文档、prompt、status 里。

3. agent 应该像成熟工程师。
   它不需要每一步都被机器流程牵着走。机器负责执行、记录、验证、暴露结果；模型负责判断、路线、取舍。

走错的地方：

1. 从“不要保姆”滑向“过度瘦身”。
   删除太多之后，扩展、todo、background、subagent、spec 体验、测试厚度都变薄。

2. 测试被大幅削弱。
   旧测试不一定都对，但全部削掉会让后续重构缺少保护。

3. 生态层被砍得太狠。
   core 工具应该少而硬，但 extension 不能消失。agent 未来一定需要扩展。

4. Super / Socratic 没有形成真正主线。
   它们更像概念，不是用户真正需要的运行骨架。后来被删除。

最后留下来的正确实践：

- 不做旧兼容。
- 不做假历史。
- 不写 legacy 包装。
- 当前没有的能力不出现在产品主干。
- 但是不能为了删而删，不能为了减而减。
- 厚度应该来自清晰职责，不是来自概念数量。

为什么这个阶段重要：

这是 Kitty 的第一次大转折。它把项目从能力平台拉回 agent harness。但它也制造了第二个问题：瘦身过头。后面的 5 月下旬和 6 月工作，很多都是在修复“过度极简化”带来的薄弱体验。

## 阶段 04：从过度瘦身回到成熟骨架

时间：2026-05-20 到 2026-05-22

关键提交：

- `47f371d`：fix context compression budget
- `ea3cd9c`：restore mature spec and extension architecture
- `87eb2b7`：solidify agent turn lifecycle memory
- `a39082d`：add leadWait execution, runtime transition builders, and spec alignment
- `2166237`：update AGENTS.md, README.md and spec docs
- `526f3f2`：update 技术实现 and 用户审阅 docs; fix config paths and ledger
- `fc4207f`：runtime status, memory assets, and skill tool extensions
- `91a90c3`：update philosophy.md with extensions, skills, memory assets, and spec notes

当时要解决的问题：

2026-05-20 重新看 git 历史时，问题变成：删减之后是不是太薄了。用户指出基础工具只剩四个是一种偏激，之前有 subagent、team、worktree、network、protocol、生态层、spec、todo、测试，现在很多都没了。

这一阶段不是简单恢复旧代码，而是重新判断哪些厚度有价值。

当时反复研究的事实：

- 历史上 `44084c5` 曾经做过能力协议平台。
- `c5428d2` 以后大量能力被删。
- 当前极简版本跑得快，但缺扩展厚度。
- Codex 的启发不是工具多，而是当前目标清楚、工具可靠、历史不乱灌。
- todo 是功能，不是和 plan 并列的第二个工作流。
- plan / spec 是增强工作方式，不应该污染日常 agent 模式。

当时走过的路线：

1. 试图恢复旧 spec 工作流。
   一开始希望直接恢复历史 spec 模式，后来发现 spec 模式作为运行入口会制造额外状态和用户心智负担。

2. 试图恢复更多工具。
   network、worktree、todo、background、subagent 都被重新评估。结论不是全部恢复旧实现，而是按当前边界重建。

3. 试图恢复 team。
   旧 team 有数据库、消息、policy、request、profile 等完整结构。但真实测试后，team 的用户体验“不对”，更像组织模拟。后来被删除。

4. 重新设计 lead wait。
   旧实现不是 lead 自己轮询，而是 execution 带 `leadWaitPolicy`。当工具创建阻塞型执行后，lead 让出当前轮，等待 wake signal 再恢复。这条被重新接回当前架构。

走错的地方：

- 把旧实现当答案。
  历史提交是证据，不是标准答案。每次都要判断旧实现解决过什么问题、当前是否仍需要。

- 把恢复能力写成 legacy。
  用户明确否决了 team(legacy)、旧库清理提示、旧能力兼容分支。正确做法是：当前没有的能力，源码、测试、文档、status、prompt 都不出现。

- 把用户当前话术直接写进 prompt 或正则。
  这一阶段反复确认：用户话是线索，不是结论。不能把“用户 OK”之类文本写成规则，语义判断必须交给模型。

走对的地方：

- 重新确认核心模块：Agent、Context、Session、Provider/Config、Tools、Extensions、Host、Observability。
- 恢复 core + extension 边界。
- todo 回到会话级工作记忆。
- lead wait 回到 execution lifecycle。
- memory asset 作为可审阅投影出现。
- skill 作为 runtime 能力包出现。
- AGENTS.md 和开发 skill 开始承担“如何维护这个 agent”的规则。

最后进入当前主干的实践：

- 每次开发先做全局核心语义调查。
- 历史只作为证据，当前事实主干才进入源码。
- 不做旧兼容，不做假历史，不写 legacy 包装。
- extension 是 core 之外的工具集合，不是第二个 agent。
- subagent 是独立上下文隔离，不是 team。
- lead wait 属于 control-plane execution fact，不靠工具名猜。

为什么这个阶段重要：

它修正了 5 月 5 日的过度极简。Kitty 没有回到能力平台胖子，也没有停留在四工具瘦子，而是开始形成现在的中间路线：core 硬、extension 清楚、状态可恢复、文档测试代码同步。

## 阶段 05：记忆和上下文，从账本拼接改成自然连续

时间：2026-06-04 到 2026-06-12

关键提交：

- `f64eff5`：define mature agent lifecycle plan
- `30b7000`：complete agent lifecycle spine
- `3b0899b`：mature cli bootstrap and status
- `39afa07`：memory assets lifecycle, compact API alignment, and doc sync
- `2580af9`：Remove team collaboration tools
- `7de9b7e`：spec updates, skill polish, eval command, and code cleanup
- `281f127`：harden runtime memory assets
- `47bbcb2`：make session context feel present
- `091ab08`：record satisfied memory context baseline

当时要解决的问题：

记忆模块被认为“很烂”。真实体验里，模型像是在读 runtime facts、memory summary、task lifecycle 拼出来的上下文，而不是像 Codex 一样“我就在这条对话里一直听着”。

当时研究过的方向：

- Codex 的 session/thread/turn/context/tool/state/recovery 链路。
- 腾讯记忆系统。
- 长期记忆、skill memory、项目规则、失败教训。
- 近场对话、session memory、working memory、runtime facts 的分层。
- search / memory 搜索是否应该做语义判断。

走错的路线：

1. 想直接移植腾讯记忆。
   腾讯记忆适合长期记忆能力，但 Kitty 当时最痛的是同一 session 的自然连续。复杂长期记忆如果先上，会让账本味更重。

2. 把 memory 做成机器判断系统。
   搜索、召回、memory asset 都不能替模型判断重要性。机器只能暴露候选和证据行。

3. 把 runtime facts 当对话记忆。
   lifecycle、completion facts、wake、status 是证据，不是用户刚说的话。如果它们进入得太重，模型会复述账本。

4. 用 prompt 补上下文问题。
   用户多次否决“在提示词里写死”。正确修法必须在 context/session 基础设施。

走对的路线：

- 近期可见对话直接进入 provider request，负责临场感。
- session memory 由模型在 turn 收口时写出，负责长任务连续。
- working memory 负责当前焦点、todo、近期工具批次、执行连续性。
- runtime facts 只作为 evidence block，不伪装成用户新要求。
- memory asset 可审阅，但不是当前轮唯一上下文。
- internal wake 用结构化 source，不靠文本前缀。

最后形成的满意基线：

`VERSION_LOG.md` 在 2026-06-12 记录为“记忆与上下文满意基线”。它的重要点是：

- session context 带入近期可见对话。
- session memory 不替代近期对话。
- runtime facts 只作为证据。
- internal wake 不污染用户可见记忆。
- context budget 暴露来源分桶。
- 提示词更简短、直接、面向行动。

为什么这个阶段重要：

这是 Kitty 第一次真正接近 Codex 的体验。不是因为它有更复杂的记忆库，而是因为它开始像同一条对话在继续。长期记忆、skill memory、向量库都不是第一优先级；当前轮自然连续才是核心。

## 阶段 06：skill、plan、cache、eval，运行时边界开始成型

时间：2026-06-12 到 2026-06-17

关键提交：

- `fa905c5`：完善 status/eval 命令，引入 skill health，丰富 spec workflow 呈现
- `b73856b`：docs 迁移 site，添加 GitHub Pages，重构 web shell，添加 development skills 包
- `b4c5f60`：Refine evaluation checks and plan template
- `5cdce51`：add plan.example.md
- `ad221d9`：provider 重构，cachePolicy/usageNormalizer/runtime status/compression/evaluation
- `47539f8`：Harden production turn lifecycle
- `dd01602`：Strengthen background and spec UX
- `44cd5a4`：Remove runtime spec mode and harden plan skill
- `a939778`：Harden runtime skills and context boundaries
- `387b09b`：Release 0.0.7

当时要解决的问题：

记忆基线满意之后，问题变成：怎样把 Kitty 变成生产工具，而不是一堆能用的入口。焦点集中在 skill、plan、init/doctor、eval、cache、background/subagent、status/events、首次成功体验。

当时走过的路线：

1. 做 local session/event API。
   一开始它看起来像“底层接口”，后来确认它的意义是给 CLI、Telegram、未来 UI 或远程入口复用同一条 agent 主链路。

2. 继续讨论 spec 模式。
   最后删除 runtime spec mode。原因是 plan skill 足够承担单文件总管，spec 应该回到仓库事实，不做交互模式。

3. 重写 plan skill。
   plan 从 todo list 变成单文件执行合同：需求、当前事实、失败测试、目标、不做范围、设计、任务、验证、收口都在一个 `plan.md` 里。

4. runtime skills 收敛。
   development 被改成 do，runtime skills 分成 research、plan、do、verification 四个阶段。每个阶段独立，不混职责。

5. cache 成本开始进入主线。
   研究 prompt caching、stable prefix、volatile tail、cache hit、成本观测。因为用户明确要未来替代 Codex/Claude Code，省 token 是核心能力。

走错的路线：

- 把 plan 当成“每次推进一点”的 checklist。
  用户反复否决半成品式推进。plan 必须支持一次完整交付。

- 把 eval 做成功能点清单。
  后来确认 eval 应该是生产路径验收。日常测试跑确定性检查，真实 provider 生产 eval 独立执行。

- 把 skill 正文默认塞进上下文。
  这会浪费 token，也会污染当前轮。正确方式是 discovery 只暴露索引，模型需要时显式 load。

- 把“怀疑主义”写成哲学散文。
  后来改成代码开发方法：质疑用户判断、当前实现、旧设计、测试结果和自己的第一反应，证据收束后行动。

最后形成的满意基线：

`VERSION_LOG.md` 在 2026-06-17 记录为“运行时边界与生产发布满意基线”，核心是：

- runtime skills：`research`、`plan`、`do`、`verification`。
- 内部 wake 用结构化 `source: internal`。
- 用户真实输入 `[internal] ...` 不会被误隐藏。
- internal wake 不触发 title/memory 重写。
- cache layout 区分 stable prefix 和 volatile runtime facts。
- `kitty eval` 的 cache economy 检查使用真实 runtime prompt layers。

为什么这个阶段重要：

它让 Kitty 从“能跑的 agent”变成“有开发方法和运行时边界的 agent”。这也是第二个满意版本 `0.0.7` 的来源。

## 阶段 07：TUI，终于承认终端界面是产品壳，不是主干

时间：2026-06-18 到 2026-06-24

关键提交：

- `ce11e3e`：Production Runtime Experience: unify scene projection across status/background/eval
- `616c12b`：Add polished Ink TUI shell
- `59c4b52`：fix tui composer layout
- `ce571ee`：render tui markdown structure
- `d99fd52`：fix Composer, composerLayout, and tui-render test
- `af74228`：TUI cursor positioning baseline and release 0.0.9
- `b1c8d17`：重构转录面板滚动与投影逻辑
- `6109ff1`：Improve TUI markdown rendering
- `eb309d5`：Polish TUI live facts

当时要解决的问题：

用户决定下一步做 TUI。原因很直接：CLI 能用，但现代 agent 应该有更好的终端体验。前身 Athlete 阶段已经失败过一次 TUI，最大问题就是历史区不能滚动、滚动不自然、闪烁、键盘不适配、输入体验怪。

这次 Kitty TUI 一开始就定了几个用户视角：

- 启动时有会话选择器。
- 输入框在底部。
- 历史消息可滚动。
- 鼠标滚动和键盘滚动要自然。
- 后台任务、subagent、上下文占用在底部显示。
- 不要纵向分割。
- 不要多余的 “Now / Next / Cost” 大面板。
- UI 是壳，可以随时删除，不能变成第二套状态。

当时研究和比较过的东西：

- Ink。
- opencode TUI。
- deepseek tui。
- Claude Code / Gemini 一类终端交互。
- hajimi / camera / Athlete 早期界面经验。
- React + Ink 的 ESM/CJS 运行边界。
- IME、中文宽度、光标坐标、终端 resize。

走错的路线：

1. 让 CLI 和 TUI 混在一条静态 import 链里。
   Ink 是 ESM 且有 top-level await，CJS CLI 直接 require 会报错。后来确认 TUI 和 CLI 应该分开入口，`dist/cli.js` 不静态 require Ink，TUI 由独立 ESM 入口启动。

2. 用局部补丁修光标。
   光标上移、下移、IME 候选框在 TUI 外、输入文本跑出界面、resize 变形，这些不能靠每处加一行修。它们共享同一套终端显示宽度、换行、行高、cursor cell、frame layout。

3. 假设输入是单行。
   用户明确指出输入多了会变多行。不能“算多行、渲染单行”，也不能“为了不出错就删多行”。

4. TUI 自己维护状态。
   如果 TUI 自己维护 todo、background、subagent、context，会和 CLI/Web 分叉。后来确认 TUI、CLI、Web 共享同一套 runtime facts，只是呈现不同。

5. 首次回答不渲染、后续回答才渲染这类特判。
   用户明确否决这种为了修表面 bug 的特判。全局类似特判都应该删除。

走对的路线：

- TUI 和 CLI 分开入口，但共享 host/session/event/runtime 主干。
- Composer 只渲染，layout 只计算，editing 单独管理。
- 光标位置计算收敛到 `composeInkCursorPosition()` 和 `shiftInkCursorRow()`。
- transcript frame、layout、wrap、projection 拆开。
- Markdown 渲染进入 TUI，但不是靠手拼字符串。
- runtime dock 两行常驻，避免布局高度变化导致光标漂移。
- `kitty` 裸启动进入 TUI，`kitty agent` 保留文字交互。

最后形成的满意基线：

`VERSION_LOG.md` 在 2026-06-18 记录 TUI 光标定位初步满意基线：

- Composer 光标定位重构。
- measured row 和 cursor cell 分离。
- Ink 光标坐标转换统一。
- 行偏移统一处理。
- 测试覆盖 cursor 组合逻辑。

为什么这个阶段重要：

TUI 阶段再次证明：UI 问题也必须按 harness 思维解决。不是“加一点样式”，而是输入、输出、滚动、光标、IME、resize、runtime facts、生命周期都要有同一套 frame model。这个经验直接来自 hajimi、camera、Athlete 早期 TUI 的失败。

## 阶段 08：工具输出治理，省 token 不是口号

时间：2026-06-22 到 2026-06-26

关键提交：

- `8a399c4`：Add tool output governance kernel
- `275bfde`：Keep shell commands raw
- `67dc91a`：Record tool lifecycle session events
- `24564da`：Harden production acceptance and tool output governance

当时要解决的问题：

用户越来越明确地要求 Kitty 未来替代 Codex/Claude Code。那省钱、省 token、高缓存命中就不是锦上添花，而是生产级核心能力。

真实问题是：工具输出太大。测试日志、搜索结果、构建输出、git diff、错误堆栈如果全部塞给模型，会浪费 token，也会污染上下文和 cache tail。模型需要证据，不需要海量噪音。

当时研究过的方向：

- RTK 这类省 token 思路。
- prompt caching。
- tool output projection。
- raw artifact。
- cache stable prefix / volatile tail。
- TUI 长会话卡顿是否因为消息全在内存。

走错的路线：

1. 把工具输出治理理解成“机器判断重要性”。
   用户反复强调：机器不能判断语义重要性。机器只做死事实，模型做活判断。

2. 手写命令转换。
   曾经出现过把模型输出的命令转换成 PowerShell/cmd/bash 变体的倾向。后来明确删除。命令必须原汁原味执行，失败也是事实。

3. 把输出 projector 看成随意拼字符串。
   用户质疑 `projectors.ts` 是否违反“禁止随意拼字符串”。最后确认：结构化投影可以生成 model-facing 文本，但它必须基于 typed facts、artifact path、计数、关键行，不是东一块西一块拼语义判断。

4. 为了 TUI 卡顿做“首次回答不渲染”这类特判。
   这类特判被否决。正确做法是 transcript projection、viewport、append、render 的物理层治理。

走对的路线：

- raw output 保存到恢复路径。
- 模型看到 compact projection。
- 搜索投影只暴露证据行。
- 测试失败投影暴露失败摘要、关键行、路径。
- git diff 投影暴露范围和摘要。
- 工具生命周期进入 session events。
- `bash` 命令原样执行，不做平台翻译。

最后进入当前主干的实践：

- `src/tools/outputKernel/*` 管工具输出治理。
- `src/agent/toolResults/modelProjection.ts` 管进入模型的投影。
- command runner 删除 platform transforms。
- background tools、bash、foundation tools 都保留原始命令事实。
- 工具输出是成本系统的一部分，不只是日志美化。

为什么这个阶段重要：

这阶段把“省 token”落到物理层。不是叫模型少说话，也不是硬截断，而是让工具输出从一开始就有 raw 与 projection 两层。用户以后要长期用 Kitty，这比加新工具更重要。

## 阶段 09：现场表达，从账本变成“当前现场”

时间：2026-06-18 到 2026-06-26

关键提交：

- `ce11e3e`：unify scene projection across status/background/eval
- `24564da`：Harden production acceptance and tool output governance
- `c79cbc1`：Split eval acceptance suites
- `09345fa`：Update specs and evaluation flow
- `55e62c7`：Release 0.0.16

当时要解决的问题：

用户听到一个评价：Kitty 呈现给 agent 时不够自然，不够现场，账本味很浓。这个评价被认为非常准确。

当时 Kitty 已经有 status、events、memory、execution、cost facts，但它们像几张表。生产级体验应该让用户一眼知道：

- 现在在做什么。
- 刚刚做了什么。
- 卡在哪里。
- 后台还有什么。
- subagent 是否还活着。
- 上下文占用多少。
- 工具输出是否过大。
- 这轮成本/缓存是否正常。

走错的路线：

1. 把 status 继续做成数据库摘要。
   这样虽然事实完整，但用户看到的是账本，不是现场。

2. 让 scene 成为第二事实源。
   这也错。scene 只能是投影，不能落盘，不能和 runtime status/session/control-plane/observability 分裂。

3. 为了“自然”牺牲机器事实。
   也不对。机器事实必须保留，只是用户第一眼不要被账本淹没。

走对的路线：

- runtime status、session、control-plane、observability 保留结构化事实。
- `scene` 只做自然投影。
- 用户先看自然现场，再看详细 runtime facts。
- context prompt/session brief/working memory 把运行事实作为 evidence，不伪装成用户新要求。
- TUI、CLI、README、spec 讲同一套当前事实。
- 超过 300 行文件做职责审查，但不为了行数硬拆。

最后形成的满意基线：

`VERSION_LOG.md` 在 2026-06-26 记录为“现场表达与上下文自然性满意基线”，包版本 `0.0.16`。

这个版本验证过：

- `npm.cmd run typecheck`
- `npm.cmd run build`
- `npm.cmd run verify`
- `npm.cmd run eval:local`
- `npm.cmd run eval:production`

为什么这个阶段重要：

这是 Kitty 从“机器账本可审计”走向“用户现场可理解”的阶段。它没有删除账本，而是把账本放回机器层，把当前现场放到用户层。这是成熟产品体验的关键。

## 阶段 10：eval 分层，真实生产路径单独验收

时间：2026-06-26

关键提交：

- `c79cbc1`：Split eval acceptance suites
- `09345fa`：Update specs and evaluation flow

当时要解决的问题：

用户问：eval 做成真实生产路径验收，能否独立出来，不要日常 `npm test` 跑，因为真实 provider 会消耗 token。

这个判断成立。日常测试应该快、稳定、确定性；生产验收应该能真实跑 provider、长会话、工具、恢复、background/subagent，但必须显式执行。

走错的路线：

- 把真实 provider 调用塞进普通测试。
- 把 eval 做成功能点清单。
- 用 mock 证明生产路径。
- 为了省事跳过长链路。

走对的路线：

- `npm test` / `verify` 跑本地确定性核心测试。
- `eval:local` 跑本地可验证验收。
- `eval:production` 显式跑真实 provider 生产路径。
- 生产 eval 可以消耗 token，但必须由用户主动触发。
- eval 场景要覆盖 init/doctor、长会话、background、subagent、成本/cache、tool output、recovery。

最后留下来的实践：

- eval 从日常测试里拆出。
- production eval 作为独立命令。
- README、spec、package scripts 同步。
- 真实生产路径不是每次开发都跑，但它必须存在。

为什么这个阶段重要：

这是生产级工具和玩具的分界之一。玩具只跑单元测试，生产工具要能在需要时跑真实链路验收，但不能让日常开发每次都消耗真实 token。

## 阶段 11：多 provider，不能再用一个 OpenAI-compatible 模板硬套全部

时间：2026-06-25 到 2026-06-26

关键提交：

- `ad221d9`：provider 重构，cachePolicy/usageNormalizer 等
- `09345fa`：Update specs and evaluation flow
- 后续 `c42cca2`、`6c55e25` 继续修 DeepSeek replay

当时要解决的问题：

用户发现：用 GPT 无思考模型时，TUI 里第一条消息可以发，第二条像被吞掉，过很久才发送。后来判断这不只是 TUI 问题，而是多 provider 适配不够清楚导致的生命周期和收尾状态不透明。

随后明确参照 opencode 的设计：

```txt
Provider 和 Model 分开。
Provider 管入口、认证、SDK 类型。
Model 管 capabilities、cost、limit、request。
```

当时要同时解决几类事实：

- OpenAI Responses。
- OpenAI-compatible Chat Completions。
- DeepSeek thinking + tool call。
- YLS / TTAPI 这类中转站。
- GPT 无 thinking 模型。
- provider probe / doctor / eval。
- `.env.template`、`.env.example`、`.env`、init 模板三者一致。

走错的路线：

1. 未知 provider 容错。
   用户明确否决：“未知 provider 不需要容错，那你就得填对。”未知 provider 应该直接报错，不猜。

2. 所有 provider 都当 OpenAI-compatible。
   这会导致 relay 404、probe 错误、错误诊断怪异。

3. 中转站和标准 provider 混在一起。
   YLS、TTAPI 曾经花很久跑通。它们是中转站，不应该污染 OpenAI/DeepSeek 标准 provider 逻辑。

4. 用 UI queued 掩盖 provider 收尾。
   用户否决“允许用户输入立即本地显示为 queued”。如果还在总结记忆，就应该显示“总结中”，而不是让用户以为消息被吞。

走对的路线：

- provider catalog 保存 provider/model 固有事实。
- provider 管入口、认证、transport、API 风格。
- model 管 wire API、context/output limit、reasoning、tool、cache 能力。
- relay provider 单独管理。
- DeepSeek reasoning replay 是 provider wire contract，不是 prompt 规则。
- doctor / eval / init 都基于同一套 provider/model 事实。
- 配置缺失直接报错，不静默猜默认。

最后进入当前主干的实践：

- `src/provider/catalog.ts`
- `src/provider/capabilities.ts`
- `src/provider/transport.ts`
- `src/provider/connection.ts`
- `src/provider/request.ts`
- `src/provider/responsesAdapter.ts`
- `src/provider/chatCompletionsAdapter.ts`
- `src/provider/chatRequestBody.ts`
- `src/provider/usageNormalizer.ts`
- `src/provider/cachePolicy.ts`

为什么这个阶段重要：

多 provider 不是“base URL + model 名字”那么简单。provider/model 分离以后，Kitty 才能解释 404、400、cache、reasoning、tool、stream/non-stream、relay probe 这些真实差异。

## 阶段 12：DeepSeek reasoning_content 事故，根因是 harness replay

时间：2026-07-01

关键提交：

- `c42cca2`：fix deepseek tool reasoning replay
- `c9623a8`：Release 0.0.17
- `6c55e25`：Release 0.0.18

当时要解决的问题：

用户在另一个项目 `C:\Users\Administrator\Desktop\gaokao\.kitty` 里遇到 DeepSeek 400。现象是：前几轮能说，工具调用多了、历史批次变多后，某一轮突然报错。用户追问：这是模型问题还是 harness 问题？

关键事实：

- 出问题的不是 Kitty 自己的 session，而是 gaokao 项目的 `.kitty` session。
- 某条 assistant message 有 `tool_calls`，但没有 `reasoningContent`。
- usage 显示 `reasoningTokens: 0`。
- DeepSeek 官方规则：thinking 模式下，进行了工具调用的轮次，在后续所有请求中必须完整回传 `reasoning_content`。

最初容易误判的路线：

1. 认为是模型问题。
   如果模型没有输出 reasoning token，似乎可以认为没有 reasoning。这个判断错。

2. 让用户关闭 thinking。
   这是逃避 provider contract，不是修 harness。

3. 历史坏数据里伪造 reasoning。
   这也错。已经损坏的历史不能伪造原始 reasoning。

4. 只保留非空 reasoning。
   这是根因。代码把空字符串当成 undefined，导致字段缺失。

根因：

`chatCompletionsAdapter` 使用了类似逻辑：

```txt
reasoningContent.length > 0 ? reasoningContent : undefined
```

这会把空字符串折叠成字段缺失。但 DeepSeek tool-call replay 要求的是字段存在。即使本轮 `reasoningTokens` 为 0，也要保存 `reasoningContent: ""`。

最后修法：

- DeepSeek thinking + tool call 时，保存空 `reasoningContent`，不能折叠成 undefined。
- 当前轮如果发现 tool-call assistant message 缺 reasoningContent，构建请求体前失败，不发送必然 400 的请求。
- 已经损坏的历史 tool batch 不伪造 reasoning；context compression 把它投影成普通 assistant 历史事实，并跳过对应 tool message，避免坏历史永久卡死后续对话。
- `tests/provider/deepseek-replay.test.ts` 覆盖空 reasoning replay、当前轮缺 reasoning 拒绝、旧坏历史投影。
- `spec/技术实现/T05-Provider与模型/README.md` 记录 provider wire contract。

为什么这是 harness 问题：

模型可以不给可见 reasoning token，但只要是 DeepSeek thinking + tool call，harness 必须按 provider wire contract 保存和回放字段。某一批历史里少字段，是保存/replay 逻辑造成的，不是模型突然坏了。

为什么这个阶段重要：

它证明 provider 适配必须硬。DeepSeek 的问题不是提示词、不是 UI、不是用户配置，而是 wire replay 的字段级 contract。Kitty 以后遇到 provider 问题，必须先分清：模型行为、provider 规则、harness 保存、历史压缩、请求构建，分别是哪一层。

## 阶段 13：发布体验、README/site 和默认 TUI

时间：2026-07-01

关键事件：

- 发布 `@jun133/kitty@0.0.18`
- GitHub push
- npm publish
- 全局安装更新
- postinstall 中文提示
- README / site 增加 `npm install -g @jun133/kitty`
- 裸 `kitty` 默认进入 TUI

当时要解决的问题：

代码主干已经能跑后，用户开始关注“别人装了之后怎么知道下一步做什么”。这不是核心 harness，但属于产品可用性。

当时讨论过的体验：

- `npm install -g @jun133/kitty` 后能不能有中文提示。
- 看得见的信息可以少量中文化，但不需要全局汉化。
- site 中放一键安装命令。
- README/site 要有产品气质，不要堆开发细节。
- `kitty` 裸启动应该进入 TUI，因为 TUI 已经比普通 CLI 更现代。
- 启动 banner 只保留艺术字，不要上面再重复一个小字 `kitty agent`。

走错的路线：

1. site 改得太多。
   用户明确要求撤回：只加 npm install 版本的样子，不要把整个 site 改成另一种风格。

2. 为小提示加测试。
   用户否决。postinstall 友好提示不是核心，不需要站点安装脚本检查，不需要为文案加测试。

3. 全局汉化。
   用户只要“小部分友好提示”，不是所有输出都翻成中文。核心命令和机器事实不需要为了中文而中文。

4. 宣传文案太用力。
   用户要克制、冷静，但能不经意体现强。不要用“它不是什么”这种否定式堆叠，也不要加小横幅、副标题。

走对的路线：

- postinstall 用简短中文提示下一步。
- site/README 加全局安装命令。
- 不大改 site 原风格。
- `kitty` 默认 TUI，`kitty agent` 是文字交互。
- 只做必要产品体验，不为小体验增加测试负担。

最后状态：

- `@jun133/kitty@0.0.18` 已发布。
- `kitty.cmd --version` 为 0.0.18。
- PowerShell 直接 `kitty` 可能被 `.ps1` 执行策略影响，`kitty.cmd` 可用。

为什么这个阶段重要：

它提醒后续窗口：产品化不是乱加 UI，也不是把所有输出改中文。产品化是让首次安装、启动、初始化、TUI、README/site 这些真实接触点更顺，同时不污染核心 harness。

## 阶段 14：当前历史文档，给下一窗口接住上下文

时间：2026-07-05

当前任务：

用户准备换窗口，希望把这条超长对话和更早的项目演进整理成 `history.md`。这份文档不是整理成干净架构，而是按历史写：做了什么，没做什么，又做了什么，又删了什么，尝试什么，失败什么，最后什么证明有效。

当前已经确认：

- hajimi、DeepSeek CLI、Universe、camera、Athlete、Deadmouse、Kitty 是同一条项目演进线。
- 不能把 hajimi、deadmouse、athlete 写成外部旁系参考。
- 历史允许重复，因为项目就是在重复试错中演进。
- DeepSeek 是一个重要阶段，但不是唯一红线。
- 这份文档是给 AI 检索和接续用的，所以要结构化，但不能把历史压成单一逻辑图。

这份文档以后怎么用：

- 新窗口先读 `AGENTS.md`、`.codex/skills/kitty-agent-development/SKILL.md`、`spec/`、`VERSION_LOG.md`、`history.md`。
- 如果要继续开发，先确认当前事实主干，不要按历史旧能力直接恢复。
- 如果要理解为什么某条规则存在，就回到对应历史阶段看它是从哪个失败里来的。
- 如果用户要求更新历史，按阶段追加，不要把整份文档改成宣传稿。

## 阶段 15：真实生产路径验收，先打硬工具使用链路

时间：2026-07-05

当前任务：

用户要求不要继续堆新功能，而是用当前构建产物和真实 provider 验证 Kitty 是否能投入日常生产使用。重点不是让模型写超大项目，而是看它能不能准确读文件、改文件、跑测试、根据失败定位并修到通过。

本轮真实环境：

- provider：`yls`
- model：`gpt-5.5`
- wire API：Responses
- 构建产物：`node dist/cli.js`
- 主验收工作区：`C:\Users\Administrator\Desktop\kitty-real-eval-workspace`
- 工具准确性工作区：`C:\Users\Administrator\Desktop\kitty-tool-accuracy-workspace`

已验证路径：

- `doctor` 真实 provider probe。
- CLI/TUI/interactive 真实对话。
- 真实 core 工具 `read/edit/bash` 创建、修改和验证文件。
- 42 个隔离小模块修复任务，最终全量 `cmd /c npm test` 通过。
- `sessions/events/status/memory` 可读。
- `resume` 能继续中断 session。
- terminal log 从不可读 stream delta 收束为可读块。

工具准确性事实：

42 个有效修复 session 里，一共 198 次工具开始、197 次工具完成、1 次工具失败。工具分布是 read=94、edit=45、write=1、bash=58。唯一工具失败是模型第一次调用 `edit` 时漏传 `edits`，harness 正确拒绝并让同轮恢复。

最有价值的失败：

1. `customer` 任务中模型改了测试而不是实现。
   这是模型任务解释问题，不是 harness。它说明测试任务提示要尽量明确“不要改测试”，但不能为某个模型特判。

2. `ledger` 任务需要三轮 edit/test 才通过。
   这是模型实现判断迭代。harness 的价值是把失败测试准确回灌，让它能继续修。

3. 第一次 `csvSummary` eval 夹具本身不一致。
   数据按 `quantity * unitPrice` 合计是 622.5，但测试写成 682.5。模型因此长时间寻找缺失规则。这不是 Kitty 失败，而是 eval 夹具失败。后来修正夹具并重跑，Kitty 一轮通过。

4. 中断后 resume 第一轮回答被旧 session 事实带偏。
   它没有检查当前文件，却断言测试仍失败。第二轮用户明确要求读当前测试并运行命令后，模型能纠偏。结论：resume 链路可用，但旧 near-field 事实会影响模型判断；status/title/memory 还可能留下旧 focus 文案。

5. terminal log fallback 丢工具参数。
   真实日志出现 `[tool] read (missing path)`，但 events 里有完整参数。根因在 `src/observability/terminalLog.ts` fallback 创建 runtime UI event 时没带 payload。已修复并加 `tests/observability/terminal-log.test.ts` 覆盖。

6. `rangeMerge` 第一次把相邻区间也合并。
   测试失败后模型根据报错改成只合并重叠区间，并同轮通过。这说明失败测试能有效回灌给模型，不需要 harness 特判。

7. `csvJoin` 用 `write` 重写小文件。
   结果正确，测试通过，但工具选择比 `edit` 粗。当前不作为 harness 问题处理，因为被改文件很小、边界明确、没有越界改动。

本轮判断：

Kitty 当前可以作为日常本地编程 agent 使用，尤其适合隔离工作区里的读、改、跑、修闭环。它还不适合完全无人值守地恢复旧 session 后立刻相信模型对当前现场的判断；恢复后最好要求模型重新读取关键文件或运行关键测试。

这阶段留下的实践：

- 生产级验收要跑真实 provider 和真实文件，不只跑 mock。
- 工具准确性比新增工具数量重要。
- 失败要先分层：模型行为、夹具问题、provider wire、session replay、memory closeout、observability。
- terminal log 不是越多越好，必须能看懂 turn、tool 和 final answer。
- 不做 Windows/PowerShell 命令翻译特判；命令失败也是事实。

## 当前结论

Kitty 不是突然出现的 CLI 项目。它是从 hajimi 的远程聊天控制、DeepSeek CLI 的最小本地 agent、Universe/camera 的 spec 和终端壳、Athlete 的工业化 harness、Deadmouse 的约束冲突修复，一路收束到现在的本地 agent harness。

当前最稳定的主线是：

```txt
输入 -> 上下文 -> 模型 -> 工具 -> 状态 -> 恢复 -> 输出
```

当前最重要的边界是：

- 模型做活判断。
- 机器做死事实。
- 主干维护事实。
- 边缘负责呈现。
- 当前事实高于旧兼容。
- 历史只作为证据，不直接进入产品主干。

当前最该警惕的旧错误是：

- 为了能力多而堆能力。
- 为了安全而做审批主线。
- 为了智能而写关键词正则。
- 为了兼容而保留旧残余。
- 为了 UI 漂亮而做第二状态源。
- 为了省 token 而丢证据。
- 为了测试绿而不跑真实路径。
- 为了修表象而加特判。

当前最证明有效的实践是：

- core tools 少而硬。
- extension 明确边界。
- session 近场对话保持自然。
- memory 负责长连续，不替代对话。
- runtime facts 只做证据。
- provider/model 分离。
- relay provider 单独管理。
- DeepSeek replay 按 wire contract。
- tool output raw 与 projection 分层。
- TUI/CLI/Web 是壳，共享同一 runtime facts。
- eval 分成本地确定性和生产真实路径。
- plan 是单文件执行合同。
- spec 是当前事实主干。
