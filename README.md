# 小猫智能体 Kitty

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

小猫智能体是给本地代码仓库使用的 agent harness。

它把模型、工具、上下文、会话、变更记录和验证事实收进一个稳定的本地编程体验里，让长任务可以被推进、保存、恢复和继续。

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
| 🗺️ Project Map | 目录、入口、脚本、测试、spec 和 git 事实进入短项目地图 |
| 🔌 Provider | OpenAI-compatible provider、请求恢复、连接诊断 |
| ❄️ 缓存与省钱 | 读取 provider usage 里的缓存命中事实，记录 cache hit / miss / read / write，展示稳定前缀指纹和最近请求命中状态 |
| 🛠️ Core tools | `read`、`edit`、`write`、`bash` |
| 🧩 Extensions | `todo`、`worktree`、`network`、`background`、`subagent`、`skills`、`spec` |
| 🧾 Control plane | SQLite 账本记录 task lifecycle、execution、deadline、输出健康、wait policy、pid、状态和 wake 事实；host 负责等待和恢复 lead |
| 📐 Spec 模式 | `requirements.md`、`design.md`、`tasks.md`、`notes.md`、workflow brief、workflow summary、`kitty spec --status` 和隔离 worktree |
| 💬 产品面 | CLI、交互终端、Telegram 私聊服务 |
| 📎 证据记录 | session events、终端日志、崩溃记录、文件变更记录 |
| 🧪 Evaluation | `kitty eval` 只暴露机器检查，`--run` 会跑本地检查闭环 |

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

执行一次明确任务：

```bash
kitty "检查这个仓库并修复失败测试"
```

进入 spec 工作流：

```bash
kitty spec
```

## ⌨️ 常用命令

| 命令 | 用途 |
| --- | --- |
| `kitty` | 进入默认 agent 交互；有历史会话时先选择继续或新建，也可直接接收一次性 prompt |
| `kitty agent` | 显式进入 agent 模式 |
| `kitty spec` | 进入 requirements -> design -> tasks -> implement -> validate 工作流 |
| `kitty spec --status` | 查看当前 spec 阶段、下一步、待确认项、文档进度、工具面和工作区 |
| `kitty background` | 查看后台任务；`wait <id>` 等待任务；`stop <id>` 停止任务 |
| `kitty resume [sessionId]` | 恢复最近会话或指定会话 |
| `kitty sessions` | 查看最近会话 |
| `kitty events [sessionId]` | 查看最近会话或指定会话的机器事件 |
| `kitty config show` | 查看从 `.kitty/.env` 解析出的当前运行配置 |
| `kitty config path` | 查看当前项目 `.kitty/.env` 路径 |
| `kitty status` | 查看当前项目现场：焦点、下一步、阻塞项、session、context budget、memory、skills、project map、execution、wake、spec |
| `kitty memory` | 创建、查看、读取、搜索、删除 runtime memory assets，或把 memory 沉淀到 spec notes / skill references |
| `kitty changes` | 查看记录的文件变更 |
| `kitty undo [changeId]` | 撤销最近一次或指定变更 |
| `kitty diff [path]` | 查看当前 git diff |
| `kitty doctor` | 检查 `.kitty` 文件、env contract、provider preset、runtime、provider 连接和下一步 |
| `kitty eval` | 查看机器检查；`kitty eval --run` 运行本地机器验收 |
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
| `spec` | durable spec 文档、状态、任务、checkpoint、隔离 worktree，并把 spec stage 接入 task lifecycle |

默认 agent 会启用 `todo`、`worktree`、`network`、`background`、`subagent`、`skills`。`spec` 不随默认 agent 自动启用；需要 spec 工作流时使用 `kitty spec`。

Runtime skills 放在项目 `SKILL.md`、`.skills/**/SKILL.md` 或 `skills/**/SKILL.md`。默认上下文只显示 skill 名称、说明、路径、健康状态和资源索引；完整正文必须由模型明确调用 `skill_load` 后进入当前轮。Skill 包内的 `references/`、`scripts/`、`examples/` 和 `assets/` 会作为资源分组出现，需要时用 `skill_read_resource` 读取资源，或用 `skill_run_script` 运行已声明的 `scripts/` 资源。Skill frontmatter 可用 `requires` 声明命令依赖，运行时用 `skill_check` 检查包健康和依赖可用性。`.codex/skills/**` 是 Codex 维护本仓库用的开发规范，不属于小猫运行时 skill。

当前仓库内置四个开发阶段 runtime skill：`research`、`plan`、`development`、`verification`。其中 `plan` 强制把 `plan.md` 写成从目标、当前事实、交付标准、失败测试、实施路线、详细检查单到验证计划的完整执行合同。

Provider 请求优先携带同 session 的近场可见对话。短会话不靠账本拼上下文；长会话超预算时摘要旧对话，保留最近对话 tail。Session memory 由模型在 turn 收口时按固定 Markdown 区块写出：`Current Focus`、`User Constraints`、`Decisions`、`Open Threads`、`Verification Facts`、`Reusable Lessons`。机器只维护格式和保存边界，不替模型判断事实重要性。

Provider usage 会归一化缓存事实：DeepSeek 的 `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens`，OpenAI 的 `prompt_tokens_details.cached_tokens`，Anthropic 的 `cache_read_input_tokens` / `cache_creation_input_tokens`，以及 Gemini cached content tokens。`model.request` observability 事件会记录这些字段，`kitty status` 会显示最近模型请求的缓存命中和 context cache layout。OpenAI 请求会使用同 session 稳定 `prompt_cache_key`；DeepSeek 不写无效 `cache_control`，优先保持稳定前缀和命中观测。

`kitty eval --run` 包含 cache economy 检查：usage 字段解析、provider cache policy 和 stable prefix fingerprint 都必须能机器验证。真实省钱仍取决于 provider 是否返回 usage，以及同一 session 的前缀是否真的被上游缓存命中。

Session workset 记录当前会话实际读过和改过的文件。`read` 成功后记录读取事实，`edit` / `write` 成功后记录变更事实和 change id。工作集会进入 session、working memory 和 `kitty status`，让用户看到当前任务真正碰过哪些文件。

Memory assets 分为 `session`、`project`、`user` 和 `evidence`。每条 asset 暴露 kind、id、title、scope、tags、路径和 evidence references。Session memory 由模型写，project/user/evidence assets 通过 `kitty memory --create <kind> --title <title> --content <content>` 创建成可审阅 Markdown 资产。`kitty memory -q <query>` 做多词候选召回，只返回命中的资产和证据行，不替模型判断语义重要性。`kitty memory <memoryId> --append-to-spec <specId>` 可以追加到 spec `notes.md`，`kitty memory <memoryId> --append-to-skill <skillName>` 可以写入该 skill 的 `references/`。这两条路径只沉淀已保存事实，不替模型判断哪些经验值得复用。

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
| Spec runtime | `src/spec/` |
| Host 边界 | `src/host/` |
| Session events | `.kitty/events/`, `src/session/events.ts` |
| CLI / Shell / Telegram | `src/cli/`, `src/shell/`, `src/telegram/` |
| Runtime UI | `src/runtime-ui/` |
| Observability | `src/observability/` |
| Evaluation | `src/evaluation/`, `tests/evaluation/` |
| 产品宣传页 | `site/` |
| GitHub Pages 发布 | `.github/workflows/pages.yml` |
| Specs | `spec/` |
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

Spec、代码和测试共同描述同一个当前现实。项目入口、配置、文档和测试都跟随当前实现同步维护。
