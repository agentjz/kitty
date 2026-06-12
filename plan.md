# 启动会话选择体验计划

## 目标

`kitty` 或 `node dist/cli.js` 在没有 prompt 时，先让用户选择最近会话；没有历史会话时直接进入新会话。用户能从入口自然继续之前的上下文，而不是每次启动都默认开空白对话。

## 当前事实

- 默认入口和 `kitty agent` 都通过 `resolveCliSession()` 创建 session，再进入 `runCliMode()`。
- `kitty resume [sessionId]` 已经支持明确恢复会话。
- one-shot prompt 应保持创建新 session，不弹选择器。
- spec 模式有独立入口，本轮不把默认选择器塞进 spec。
- `SessionRecord.title` 已存在，应该由模型在第一次真实对话完成后生成。
- `SessionStore.list()` 已按 `updatedAt` 倒序返回最近会话。

## 设计

- 新增 CLI session picker，职责只做启动前会话选择。
- 触发条件：交互模式、没有显式 resume、存在历史 session。
- 选择规则：
  - `0` 新建会话。
  - `1..n` 恢复列表中的会话。
  - 输入为空默认选 `1`。
  - 无效输入继续提示。
  - 输入流关闭时取消启动，不创建隐式 session。
- 显示内容：编号、标题、相对更新时间、消息数。
- 选中旧会话后：
  - 未传 `-C` 时使用该 session 的 cwd。
  - 传了 `-C` 时使用当前 runtime cwd。
- session 标题由 turn 生命周期触发一次模型生成；已有标题后不再触发。

## 改动清单

- [x] 新增 `src/cli/commands/sessionPicker.ts`。
- [x] 调整 `resolveCliSession()` 返回 session 和 cwd。
- [x] 默认入口和 `kitty agent` 接入选择器。
- [x] 保持 `run`、one-shot prompt、`resume`、spec 模式现有边界。
- [x] 删除 session 保存层的机器派生标题。
- [x] 增加首轮完成后的模型标题生成生命周期。
- [x] 补 CLI picker 和 session title 测试。
- [x] README 同步启动体验。
- [x] 运行 typecheck、相关测试、完整 verify。

## 验收

- 没有历史 session：`kitty` 直接进入新会话。
- 有历史 session：`kitty` 展示编号列表。
- 输入 `0`：进入新会话。
- 输入 `1`：恢复最近会话。
- 输入无效值：继续提示，不误启动。
- 输入流关闭：退出，不创建 session。
- one-shot prompt 不弹选择器。
- `kitty resume` 继续直接恢复。
- 第一轮真实对话完成后生成标题。
- 已有标题的 session 后续不再生成标题。
