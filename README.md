# 小猫智能体 Kitty

![demo](site/images/product.png)

官网：https://agentjz.github.io/kitty/

<p align="center">
  <strong>🐾 一个本地 agent 编程工作台：搜得到，看得懂，改得准，跑得通，记得住，能继续。</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@jun133/kitty"><img alt="npm" src="https://img.shields.io/npm/v/%40jun133%2Fkitty?color=111827&label=npm"></a>
  <img alt="node" src="https://img.shields.io/badge/node-%3E%3D20-339933">
  <img alt="typescript" src="https://img.shields.io/badge/TypeScript-5.9-3178C6">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-0f766e">
  <img alt="agent" src="https://img.shields.io/badge/mode-agent-7c3aed">
</p>

![demo](site/images/demo.png)


小猫智能体是给本地代码仓库使用的 agent harness。

它把模型、工具、上下文、会话、变更记录和验证事实收进一个稳定的本地编程体验里，让长任务可以被推进、保存、恢复和继续。

它的主线不是自我改造，而是把本地 coding agent 做成可恢复、可验收、省钱的执行系统：

- 本地执行内核：聊天只是入口，session、workset、execution、events、memory 和 status 才是任务现场。
- 生产现场：`kitty status` 把当前目标、下一步、阻塞、后台、成本、恢复、skill 和 memory 汇成一眼可读的现场。
- Cost Kernel：即使只用一个模型，也通过稳定前缀、易变尾部、大内容压缩、按需 skill 和 cache usage 审阅来省 token。
- 产品级验收合同：`kitty eval` 验证真实用户路径，而不是只证明模块能 import。

## ✨ 为什么是小猫智能体

小猫智能体的核心体验很明确：

- 🧭 一个 agent 主循环负责推进任务。
- 🛠️ 四个 core 工具完成基础编程闭环。
- 🧩 扩展能力通过 extension 进入，保持核心清楚。
- 🧠 Context 和 Session 专门负责连续性。
- 📌 机器层执行、记录、恢复事实；模型基于目标和证据判断路线。

## 🚀 当前能力

| 能力 | 当前事实 |
| --- | --- |
| 🧭 Agent 循环 | 模型、工具、session、收尾都在同一个主循环里推进 |
| 🧠 Context | 近场可见对话、项目上下文、项目地图、运行时上下文、工作记忆、工作集、长上下文压缩和预算报告 |
| 💾 Session | 会话记录、checkpoint、todo、工作集、恢复现场、结构化可审阅 memory assets |
| 🗺️ Project Map | 目录、入口、脚本、测试、仓库文档和 git 事实进入短项目地图 |
| 🔌 Provider | OpenAI-compatible provider、请求恢复、连接诊断 |
| ❄️ Cost Kernel | 稳定前缀和易变尾部分离，大输出压缩，skill 默认只给索引，读取 provider usage 里的 cache hit / miss / read / write，status 显示稳定比例和最近请求命中状态 |
| 🛠️ Core tools | `read`、`edit`、`write`、`bash` |
| 🧩 Extensions | `todo`、`worktree`、`network`、`background`、`subagent`、`skills` |
| 🧾 Control plane | SQLite 账本记录 task lifecycle、execution、deadline、输出健康、wait policy、pid、状态和 wake 事实；host 负责等待和恢复 lead |
| 🧯 Production scene | `status` 把 session、background、subagent、memory、skills、cache、wake 和失败边界投影成当前现场、下一步和阻塞原因 |
| 📋 Plan 工作流 | `plan.md` 是当前任务总管，配合 plan skill 管理需求、事实、失败测试、目标、设计、任务、验证和收口 |
| 💬 产品面 | CLI、交互终端、Telegram 私聊服务 |
| 📎 证据记录 | session events、终端日志、崩溃记录、文件变更记录 |
| 🧪 Evaluation | `kitty eval` 暴露产品验收场景，`--run` 会跑本地可验证检查闭环 |

## ⚡ 快速开始

安装依赖并构建：

```bash
npm.cmd install
npm.cmd run build
```

初始化当前项目：

```bash
kitty init
```

启动交互式 agent：

```bash
kitty
```

如果已有会话，`kitty` 会先显示最近会话列表：输入 `1` 继续最近会话，输入 `0` 新建会话。没有历史会话时会直接新建。会话标题由模型在第一次真实对话完成后生成，后续保持稳定。

启动 Ink TUI：

```bash
kitty tui
node dist/cli.js tui
```

TUI 是可替换的终端壳层，复用同一套 session、driver、工具和斜杠命令。主区显示用户输入、thinking 和回复；工具、后台任务、subagent 和上下文占用在底部现场区呈现，不灌进主对话区。按键：`Enter` 发送，`Ctrl+J` 换行，`PageUp` / `PageDown` 滚动，`Home` / `End` 跳到顶部 / 底部，鼠标滚轮滚动，`Ctrl+C` 中断当前轮。

交互模式支持本地斜杠命令。斜杠命令直接读取本地现场，不发送给模型：

| 斜杠命令 | 用途 |
| --- | --- |
| `/help` | 查看当前可用斜杠命令 |
| `/status` | 查看当前项目现场 |
| `/background`、`/bg` | 查看后台任务现场 |
| `/memory` | 查看 runtime memory assets |
| `/skills` | 查看 runtime skills 健康状态 |
| `/events` | 查看当前 session 最近事件 |
| `/doctor` | 运行本地配置 preflight |
| `/sessions` | 查看最近会话 |
| `/session` | 查看当前 session id |
| `/copy` | 打印当前 session 对话文本 |
| `/export` | 打印当前 session JSON 快照 |
| `/clear` | 清空 UI shell 的当前输入语义 |
| `/reset` | 清空当前项目运行状态并退出 |
| `/exit`、`quit`、`q` | 退出当前会话 |

执行一次明确任务：

```bash
kitty "检查这个仓库并修复失败测试"
```

## ⌨️ 常用命令

| 命令 | 用途 |
| --- | --- |
| `kitty` | 进入默认 agent 交互；有历史会话时先选择继续或新建，也可直接接收一次性 prompt |
| `kitty agent` | 显式进入 agent 模式 |
| `kitty tui` | 进入 Ink 终端工作台，支持主区滚动、底部输入和运行现场 |
| `kitty background` | 查看后台任务；`wait <id>` 等待任务；`stop <id>` 停止任务 |
| `kitty resume [sessionId]` | 恢复最近会话或指定会话 |
| `kitty sessions` | 查看最近会话 |
| `kitty events [sessionId]` | 查看最近会话或指定会话的机器事件 |
| `kitty config show` | 查看从 `.kitty/.env` 解析出的当前运行配置 |
| `kitty config path` | 查看当前项目 `.kitty/.env` 路径 |
| `kitty status` | 查看当前项目现场：当前目标、下一步、阻塞、后台、恢复、成本、session、context budget、memory、skills、project map、execution、wake |
| `kitty memory` | 创建、查看、读取、搜索、删除 runtime memory assets，或把 memory 沉淀到 skill references |
| `kitty changes` | 查看记录的文件变更 |
| `kitty undo [changeId]` | 撤销最近一次或指定变更 |
| `kitty diff [path]` | 查看当前 git diff |
| `kitty doctor` | 检查 `.kitty` 文件、env contract、provider preset、runtime、provider 连接和下一步 |
| `kitty eval` | 查看产品验收场景；`kitty eval --run` 运行本地机器验收 |
| `kitty telegram serve` | 启动 Telegram 私聊服务 |

## 🛠️ 工具体系

Core 工具固定为四个：

| Tool | 作用 |
| --- | --- |
| `read` | 读取文件和上下文事实 |
| `edit` | 精确修改已有文件 |
| `write` | 写入新文件或完整内容 |
| `bash` | 搜索、Git、构建、测试和本地命令 |

Extension 是可启用、可禁用、独立存在的工具集合：

| Extension | 作用 |
| --- | --- |
| `todo` | 会话级 todo 写入和可见 checklist |
| `worktree` | Git worktree 事实、创建、保留和删除 |
| `network` | HTTP session、请求、探测、下载、trace、OpenAPI 检查 |
| `background` | 后台命令执行、运行输出摘要、deadline、last output、检查、等待、停止和生命周期记录 |
| `subagent` | 聚焦子执行启动、派工边界、deadline、状态检查、worker 结论回传、wait policy、lead 挂起与 wake 恢复 |
| `skills` | 项目运行时 skill 包索引、正文加载、资源读取和脚本运行；使用事实进入 observability 和 task lifecycle |

默认 agent 会启用 `todo`、`worktree`、`network`、`background`、`subagent`、`skills`。

Runtime skills 放在项目 `SKILL.md`、`.skills/**/SKILL.md` 或 `skills/**/SKILL.md`。默认上下文只显示 skill 名称、说明、路径、健康状态和资源索引；完整正文必须由模型明确调用 `skill_load` 后进入当前轮。Skill 包内的 `references/`、`scripts/`、`examples/` 和 `assets/` 会作为资源分组出现，需要时用 `skill_read_resource` 读取资源，或用 `skill_run_script` 运行已声明的 `scripts/` 资源。Skill frontmatter 可用 `requires` 声明命令依赖，运行时用 `skill_check` 检查包健康和依赖可用性。`.codex/skills/**` 是 Codex 维护本仓库用的开发规范，不属于小猫运行时 skill。

当前仓库内置四个开发阶段 runtime skill：`research`、`plan`、`do`、`verification`。其中 `plan` 强制把 `plan.md` 写成单文件规格驱动执行合同：需求文档、当前事实、失败测试、目标、不做范围、设计、实施任务、验证计划和收口记录都在一个文件里闭环。

Provider 请求优先携带同 session 的近场可见对话。短会话不靠账本拼上下文；长会话超预算时摘要旧对话，保留最近对话 tail。Session memory 由模型在 turn 收口时按固定 Markdown 区块写出：`Current Focus`、`User Constraints`、`Decisions`、`Open Threads`、`Verification Facts`、`Reusable Lessons`。机器只维护格式和保存边界，不替模型判断事实重要性。

Cost Kernel 的边界很硬：省钱不靠模型路由，不靠把能力关掉，而靠上下文结构。稳定内容放在前缀，易变事实放在尾部；大段工具输出和旧历史进入压缩摘要或证据资产；skill 正文、resources、examples 不默认注入，模型需要时再加载。

Provider usage 会归一化缓存事实：DeepSeek 的 `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens`，OpenAI 的 `prompt_tokens_details.cached_tokens`，Anthropic 的 `cache_read_input_tokens` / `cache_creation_input_tokens`，以及 Gemini cached content tokens。`model.request` observability 事件会记录这些字段，`kitty status` 会显示最近模型请求的缓存命中和 context cache layout。OpenAI 请求会使用同 session 稳定 `prompt_cache_key`；DeepSeek 不写无效 `cache_control`，优先保持稳定前缀和命中观测。

`kitty eval` 是产品验收合同：每个场景都说明用户路径和机器证据。`kitty eval --run` 包含生产现场、恢复演练、远程入口、cache economy、skill/memory readiness 和失败边界检查。usage 字段解析、provider cache policy、stable prefix fingerprint、volatile tail、skill index boundary 和大输出压缩都必须能机器验证。真实省钱仍取决于 provider 是否返回 usage，以及同一 session 的前缀是否真的被上游缓存命中。

Session workset 记录当前会话实际读过和改过的文件。`read` 成功后记录读取事实，`edit` / `write` 成功后记录变更事实和 change id。工作集会进入 session、working memory 和 `kitty status`，让用户看到当前任务真正碰过哪些文件。

Memory assets 分为 `session`、`project`、`user` 和 `evidence`。每条 asset 暴露 kind、id、title、scope、tags、路径和 evidence references。Session memory 由模型写，project/user/evidence assets 通过 `kitty memory --create <kind> --title <title> --content <content>` 创建成可审阅 Markdown 资产。`kitty memory -q <query>` 做多词候选召回，只返回命中的资产和证据行，不替模型判断语义重要性。`kitty memory <memoryId> --append-to-skill <skillName>` 可以写入该 skill 的 `references/`。这条路径只沉淀已保存事实，不替模型判断哪些经验值得复用。

查看配置：

```bash
kitty config show
```

扩展开关在 `.kitty/.env` 的 `KITTY_EXTENSION_*` 中维护。

## ⚙️ 配置

项目运行配置只从 `.kitty/.env` 读取。初始化后按 `.kitty/.env` 填写当前启用的 provider、模型、API key 和 profile。

`kitty init` 创建 `.kitty/.env`、`.kitty/.env.example` 和 `.kitty/.kittyignore`，并输出本地配置 preflight 和下一步。`kitty doctor` 先检查这些本地事实，再加载 runtime，最后在 API key 存在时探测 provider 连接；失败时说明该补什么，成功时说明可以启动 Kitty。

`.kitty/.env` 放当前启用的 provider 和 API key，同时保留 YLS、TTAPI、DeepSeek 三组 provider preset 注释块，方便直接切换。Telegram、扩展开关和运行时配置也在 `.kitty/.env` 与 `.kitty/.env.example` 中保持同一结构。

当前支持的主要环境配置包括：

- `KITTY_PROVIDER`
- `KITTY_BASE_URL`
- `KITTY_MODEL`
- `KITTY_API_KEY`
- `KITTY_PROFILE`
- `KITTY_REASONING_EFFORT`
- `KITTY_MAX_OUTPUT_TOKENS`
- `KITTY_TELEGRAM_TOKEN`
- `KITTY_TELEGRAM_ALLOWED_USER_IDS`
- `KITTY_TELEGRAM_PROXY_URL`
- `KITTY_TELEGRAM_API_BASE_URL`

## 🗺️ 项目结构

| 模块 | 路径 |
| --- | --- |
| Agent 主循环 | `src/agent/` |
| Context | `src/context/` |
| Session | `src/session/` |
| Provider / Config | `src/provider/`, `src/config/` |
| Core tools | `src/tools/` |
| Extensions | `src/extensions/` |
| Runtime skills | `src/skills/`, `skills/` |
| Project map | `src/project/map.ts` |
| Memory assets | `.kitty/memory/sessions/`, `.kitty/memory/project/`, `.kitty/memory/user/`, `.kitty/memory/evidence/` |
| Control plane | `src/control/`, `src/execution/` |
| Host 边界 | `src/host/` |
| Session events | `.kitty/events/`, `src/session/events.ts` |
| CLI / Shell / Telegram | `src/cli/`, `src/shell/`, `src/telegram/` |
| Runtime UI | `src/runtime-ui/` |
| Observability | `src/observability/` |
| Evaluation | `src/evaluation/`, `tests/evaluation/` |
| 产品宣传页 | `site/` |
| GitHub Pages 发布 | `.github/workflows/pages.yml` |
| 项目文档 | `spec/` |
| Tests | `tests/` |

## 🧪 开发

```bash
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:core
npm.cmd run verify
```

交付前运行：

```bash
npm.cmd run verify
```

## 📜 规则与规范

当前架构事实和宪法原则在 `spec/`。运行时 agent 规则在 `AGENTS.md`。维护本仓库源码的 Codex 开发规范在 `.codex/skills/kitty-agent-development/SKILL.md`。

重要入口：

- `AGENTS.md`
- `.codex/skills/kitty-agent-development/SKILL.md`
- `spec/用户审阅/系统核心/核心地图.md`
- `spec/用户审阅/宪法原则/`
- `spec/技术实现/`

项目文档、代码和测试共同描述同一个当前现实。项目入口、配置、文档和测试都跟随当前实现同步维护。

