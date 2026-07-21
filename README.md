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

Kitty 展示了这个过程：没有夸张的炫技。从最简单的工具循环开始，一步一步为模型装上行动、记忆、上下文、计划、后台执行和恢复能力，最终组装成一个能够持续完成任务的智能体。

## 永久免费

Kitty 优先接入有免费层的模型，同时保留其他具名模型供用户选择。当前预设中可由相应 Provider 提供免费额度的入口包括 Agnes 2.0 Flash、Agnes 2.5 Flash、Gemini 3.5 Flash 和 GLM-4.7 Flash；具体可用地区、RPM、TPM、RPD、模型权限和免费政策由 Provider 的账号与项目决定，可能变化。

还有就是：Kitty 内置的模型都是免费的，并且我会到处寻找各种免费的大模型并加入配置。具体可用地区、RPM、TPM、RPD、模型权限和免费政策由 Provider 的账号与项目决定，这个可能变化。但免费就是基本的原则：无论是日常使用还是高强度开发，一切都应该是免费的！我正在做一个免费大模型的api中转站，把这些免费的东西尽可能一网打尽。

## 常用入口

| 命令 | 用途 |
| --- | --- |
| `kitty` | 启动 Kitty |
| `kitty start` | 初始化项目并打开本地工作台与 Kitty Web |
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

- [官网：Kitty Agent](https://luckymaomi.github.io/kitty/)
- [小白快速启动](docs/quickstart.md)
- [当前技术事实](spec.md)
- [设计哲学](philosophy.md)
- [开发规则](AGENTS.md)

## License

[MIT](LICENSE)
