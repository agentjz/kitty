# Kitty TUI 多行粘贴 Plan

## 1. 需求文档

用户在 Windows Terminal 等终端复制多行提示词、代码或日志后，确认终端自己的安全提示即可把整段内容一次性粘贴到 Kitty 输入框。粘贴中的换行只能成为草稿内容，不能被当成 Enter 提交，也不能把后续行散落为新的输入。粘贴后用户可以继续编辑，再主动提交。

本次只解决 TUI 文本粘贴。完成标准是中英日韩、代码、CRLF/CR/LF 和尾随换行都能进入同一草稿，光标与持久草稿一致，过程中没有 turn 或命令被意外触发。

## 2. 当前事实

- Kitty 使用 Ink 7.1；该版本提供正式 `usePaste`，负责启用 bracketed paste 并把完整 payload 送入独立 paste channel。
- 当前 `Composer` 只注册 `useInput`，没有注册 `usePaste`，因此没有开启 bracketed paste。
- Composer 状态本身已支持多行、宽字符、上下移动、持久草稿和显式组合键插入换行。
- Input gateway 使用 UTF-8 `StringDecoder` 并过滤鼠标序列；它没有把 paste marker 当业务输入处理，Ink parser 可以跨 chunk 组装 marker 和 payload。
- OpenCode 在 paste 边界把 Windows CRLF 和裸 CR 统一为 LF；Codex 把 paste 作为独立事件，并只对不可靠终端增加复杂 burst fallback。
- 当前目标 Windows Terminal 支持 bracketed paste；没有证据要求在 Kitty 重建计时式 burst 猜测器。

## 3. 失败测试

- Composer 收到 `first\r\nsecond\rthird\n` 的 paste event 后，草稿必须是 `first\nsecond\nthird\n`，光标位于末尾，不能调用 submit。
- 在已有草稿光标中间粘贴多行时，前后文本必须原样保留。
- 空 paste 不改变草稿，也不提交。
- Bracketed paste marker 与 UTF-8 payload 被任意拆 chunk 后，input gateway 必须原样交给 Ink parser，不能被鼠标过滤器吞掉或改写。
- TUI 组件必须注册 Ink `usePaste`，不能依赖 `useInput` 猜测多字符输入。

## 4. 目标

- `InkRuntime` 暴露当前依赖自带的 `usePaste`。
- `Composer` 注册独立 paste handler；`useInput` 继续只处理键盘事件。
- `TuiComposerInteraction` 成为粘贴写入草稿的唯一 owner：归一化换行、按当前光标插入、关闭临时 overlay、持久化草稿、同步 slash menu。
- 粘贴事件不进入 session、turn 或模型，直到用户显式提交。
- `spec.md`、自动测试与正式构建描述同一行为。

## 5. 不做范围

- 不自绘 Windows Terminal 的“仍然粘贴/取消”弹窗；该确认属于终端，Kitty 只正确消费确认后的 payload。
- 不读取系统剪贴板，不接管 `Ctrl+V`，不绕过终端安全设置。
- 不把大段粘贴替换成 `[Pasted N lines]`，不裁剪、不设魔法长度。
- 不实现无证据的计时式 paste-burst 猜测器。

## 6. 设计

终端确认粘贴后，在 bracketed paste 模式下发送 `ESC[200~ payload ESC[201~`。Input gateway 只保持字节、UTF-8 与控制序列完整；Ink parser 识别 marker，通过 `usePaste` 一次发出 payload。Composer 把 payload交给 controller，controller 交给 `TuiComposerInteraction.handlePaste()`。

`handlePaste()` 先把 `CRLF` 和裸 `CR` 归一为 `LF`，再按当前 UTF-16 cursor 插入草稿。该路径不接受 `Key.return`，因此不可能触发 submit。草稿更新复用当前持久化与布局链路；失败或空 payload 不产生额外状态。

## 7. 实施任务

- [x] 增加失败测试，覆盖多行、CRLF/CR、光标中插入、空粘贴和 gateway 分块。
- [x] 接入 Ink `usePaste`，增加 controller / interaction 的显式 paste API。
- [x] 同步 `spec.md` 与组件测试，不增加自定义提示或隐藏裁剪。
- [x] 运行定向测试、`npm.cmd run verify` 与工作区卫生检查。

## 8. 验证计划

- 运行 composer interaction、gateway、render 定向测试。
- 运行 `npm.cmd run verify`，确认 typecheck、CLI/TUI build 与全部核心测试。
- 确认 `git diff --check`、`.test*` 和 Kitty Node 进程为零。
- 不需要真实 provider：粘贴在模型请求前完成，真实 API 不参与该输入边界。

## 9. 收口

目标已完成。多行 paste 失败测试全部转绿；定向输入、gateway 与 render 测试 46/46 通过；`npm.cmd run verify` 完成 typecheck、CLI/TUI 正式构建和 339 项核心测试，其中 338 通过、0 失败、1 项仅因 Windows 跳过 POSIX。该能力位于模型请求前，不需要真实 provider。未经用户明确要求不 commit、不 push。
