<div align="center">

# Kitty Agent

### 如何设计一个智能体

从工具循环开始，理解目标、使用工具、持续行动，完成任务。

[官网](https://luckymaomi.github.io/kitty/) · [快速开始](docs/quickstart.md) · [技术规格](spec.md) · [开发规则](AGENTS.md)

<p>
  <a href="https://www.npmjs.com/package/@jun133/kitty"><img alt="npm" src="https://img.shields.io/npm/v/%40jun133%2Fkitty?color=111827&label=npm"></a>
  <a href="https://github.com/luckymaomi/kitty/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/luckymaomi/kitty?style=flat&amp;color=ca8a04"></a>
  <img alt="Node.js" src="https://img.shields.io/badge/node-%3E%3D22.13-339933">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-3178C6">
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-0f766e"></a>
</p>
</div>

![kitty TUI 运行界面](site/kitty-tui-demo.gif)

## 一个模型，如何成为真正的智能体？

模型很会思考，也很会表达，但仅仅拥有一个聊天框，它仍然只能给出答案。

真正的智能体需要看见外部世界，需要采取行动，需要记住已经发生的事情，也需要在漫长、复杂甚至随时可能中断的任务中继续向前。

Kitty 展示了这个过程：从最简单的工具循环开始，一步一步为模型装上行动、记忆、上下文、计划、后台执行和恢复能力，最终组装成一个能够持续完成任务的智能体。

## 从会回答，到会完成

### 第一步：让模型能够行动

工具把模型与真实世界连接起来。

它可以读取资料、修改文件、运行命令、查看结果。每一次工具调用都会产生新的事实，模型根据这些事实继续判断：下一步该做什么，是否需要再次行动，任务是否真的已经完成。

这就是 Agent Loop，也是 Kitty 的起点。

### 第二步：让每次行动都有连续性

一次请求可以给出一个答案，但复杂任务往往需要很多轮判断。

Kitty 用 session 保存对话和任务现场，用 context 组织当前真正需要的信息，用 skills 提供已经沉淀好的做事方法。即使任务很长，模型仍然知道自己正在做什么、已经确认了什么、接下来还要完成什么。

### 第三步：让复杂任务持续推进

真正的工作不会永远在几秒钟内结束。

Kitty 可以把复杂目标拆成清晰步骤，让耗时命令在后台运行，并在执行过程中继续接收新的引导。你看到的是一个正在推进、可以观察、可以中断、也可以继续的工作现场。

## 开始使用

安装 Kitty：

```bash
npm install -g @jun133/kitty@latest
```

进入希望 Kitty 工作的项目目录，启动本地控制台：

```bash
kitty start
```

Kitty 会补齐项目文件并打开配置界面。配置完成后启动 TUI：

```bash
kitty
```

Kitty 会打开会话界面。你可以新建任务，也可以回到之前保存的现场。

第一次使用 Windows 命令行、不熟悉项目目录或不知道如何填写配置，可以按 [小白快速启动](docs/quickstart.md) 一步一步操作。

## 直接执行一次任务

```bash
kitty run "调查当前项目，找出最重要的问题，完成修改并验证结果。"
```

Kitty 会调查事实、判断边界、调用工具、检查结果，并把已经完成的现场保存下来。

## 打开 Kitty，理解智能体

如果你正在研究“如何设计一个智能体”，Kitty 的源码覆盖了从模型请求到生产生命周期的完整链路：

```text
输入 -> Session -> Context -> Model -> Tools -> Runtime Facts -> 下一次判断
```

你可以从工具循环开始阅读，再进入 session、context、background execution、steer、恢复和多端交互。

## 常用入口

| 命令 | 用途 |
| --- | --- |
| `kitty` | 启动 Kitty |
| `kitty start` | 初始化项目并打开本地控制台 |
| `kitty run <prompt>` | 执行一次明确任务 |
| `kitty resume [sessionId]` | 恢复最近或指定会话 |
| `kitty status` | 查看当前运行现场 |
| `kitty background` | 查看或控制后台执行 |
| `kitty telegram serve` | 启动 Telegram 私聊服务 |
| `kitty weixin login` | 扫码登录微信 iLink |
| `kitty weixin serve` | 启动微信私聊服务 |
| `kitty weixin logout` | 清除微信 iLink 登录状态 |
| `kitty --version` | 查看版本 |

在 TUI 输入 `/` 可以查看 `/status`、`/export`、`/stop`、`/new` 和 `/exit`；空输入时按 `?` 可以查看键位。

支持中文、英文、日文和韩文四种语言。

## 继续了解

- [官网：如何设计一个智能体](https://luckymaomi.github.io/kitty/)
- [小白快速启动](docs/quickstart.md)
- [当前技术事实](spec.md)
- [设计哲学](philosophy.md)
- [开发规则](AGENTS.md)

## License

[MIT](LICENSE)
