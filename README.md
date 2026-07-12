# Kitty Agent

官网：https://luckymaomi.github.io/kitty/

<p align="center">
  <strong>🐾 一个 Agent 是如何设计的：从工具循环开始，组装成能完成任务的智能体。</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@jun133/kitty"><img alt="npm" src="https://img.shields.io/npm/v/%40jun133%2Fkitty?color=111827&label=npm"></a>
  <img alt="node" src="https://img.shields.io/badge/node-%3E%3D22-339933">
  <img alt="typescript" src="https://img.shields.io/badge/TypeScript-5.9-3178C6">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-0f766e">
  <img alt="agent" src="https://img.shields.io/badge/mode-agent-7c3aed">
</p>

## 一个 Agent 是如何组装的

Kitty 是一个智能体。它用一套可直接运行的实现，展示 Agent 如何从最初的工具循环，逐步拥有记忆、上下文、计划和协作能力。

模型先在工具循环中判断、调用工具、读取工具结果，再根据新事实继续判断。session 留下这一轮已经确认的现场；`AGENTS.md` 和 skills 提供长期规则与熟练做法；上下文把这些信息和用户输入组装成下一轮模型能看懂的完整输入。复杂任务会拆成 To Do，每次只推进一个步骤；需要独立调查时，子代理在自己的循环中完成工作，再把结果交回主 agent。

这让一个 Agent 能在真实项目里搜得到、看得懂、改得准、跑得通、记得住，并继续完成长任务。

## ⚡ 快速开始

安装 Kitty：

```bash
npm install -g @jun133/kitty
```

进入你想让 Kitty 工作的项目目录，然后初始化：

```bash
kitty init
```

打开 `.kitty/.env`，填入 provider 的 API key，再检查配置：

```bash
kitty doctor
```

启动 Kitty：

```bash
kitty
```

第一次使用 Windows 命令行、不会进入项目目录或不知道怎样填写配置，请按 [小白快速启动](docs/quickstart.md) 一步一步操作。

## Kitty 怎么工作

Kitty 默认进入 TUI。它会先显示最近会话：继续已有会话，或者新建会话。主区显示用户输入、思考和回复；工具、后台任务、subagent 和上下文占用会进入同一个工作现场。

运行中可以继续输入要求，Kitty 会在下一次模型请求中接收引导。`Ctrl+C` 用于中断；有文本选择时，`Ctrl+C` 优先复制。输入 `/` 可以探索命令，空输入按 `?` 可以查看键位。

交给 Kitty 一个真实目标：

```bash
kitty "用 Spring Boot 3、MySQL、Redis 和 Vue 3 做一个考试管理平台，包含题库、试卷、考试发布、在线作答和成绩归档"
```

这类任务会触发 Kitty 的完整工作方式：先调查当前资料和事实，再判断边界、调用工具、运行验证，并把现场留给下一轮继续。

## ⌨️ 入门命令

| 命令 | 用途 |
| --- | --- |
| `kitty` | 启动 Kitty TUI |
| `kitty init` | 初始化当前项目 |
| `kitty doctor` | 检查配置和 provider 连接 |
| `kitty resume` | 继续最近会话 |
| `kitty status` | 查看当前项目现场 |
| `kitty version` | 查看版本 |

其他命令不用背。运行 `kitty --help`，或在 TUI 输入 `/` 自己探索。

## ⚙️ 配置

项目运行配置只从 `.kitty/.env` 读取。`kitty init` 会创建 `.kitty/.env`、`.kitty/.env.example` 和 `.kitty/.kittyignore`。

主要配置：

- `KITTY_PROVIDER`
- `KITTY_BASE_URL`
- `KITTY_MODEL`
- `KITTY_API_KEY`
- `KITTY_PROFILE`
- `KITTY_LOCALE`

`KITTY_LOCALE` 支持 `zh-CN`、`zh-TW`、`en`、`ja`、`ko`、`es`、`pt-BR`、`fr`、`de`、`ru`、`ar` 和 `hi`。它只改变界面文案，不改变命令名、模型回复或工具证据。

## 📜 文档

- [小白快速启动](docs/quickstart.md)
- [当前技术事实](spec.md)
- [开发规则](AGENTS.md)

项目文档、代码和测试共同描述同一个当前现实。
