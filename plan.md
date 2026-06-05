# Codex 骨架重构计划

## 目标

把 Kitty 的当前轮运行骨架收束成 Codex 式 harness：

- Session 保存对话状态。
- Turn 表示一次模型执行。
- 当前用户输入只是当前输入，不由机器升级成目标。
- Working memory 承接模型沉淀的当前工作焦点。
- Control plane 只记录运行事实、工具执行、等待、恢复和完成。
- UI 展示回答、工具、状态、结果和 reasoning 调试流。

本轮不做腾讯长期记忆迁移。长期记忆只作为后续方向，不进入当前代码、测试和文档主干。

## 已修复问题

普通用户输入不再由机器升级成目标事实。

当前用户输入只属于当前 turn。模型如果认为后续需要保留工作焦点，会在 session memory 的 `Current Focus` 区块写出；机器只读取这个固定区块并保存为 `taskState.focus`。

简单问候、疑问符、确认句不会自动进入 task lifecycle，也不会自动生成 working memory focus。

## 设计

### Session

Session 只保存：

- messages
- session memory
- todo
- task state
- checkpoint
- session diff

`TaskState` 使用 `focus` 表示模型沉淀出的当前工作焦点。没有模型沉淀时，focus 为空。

### Turn

每一轮用户输入是 `Current turn input`。

机器只保存这轮输入，不判断它是不是目标。内部 wake 仍不是用户输入。

### Working Memory

Working memory 读取 `taskState.focus`、todo、checkpoint、recent tool batch。

它不从用户原话生成目标。

### Control Plane

Task lifecycle 记录：

- stage
- reason
- active executions
- active spec
- active todos
- verification facts
- completion facts

它不记录普通 turn 的目标。

Execution assignment 可以继续有 objective，因为 background/subagent 是模型显式派工，那里 objective 是派工契约，不是机器猜测。

### Prompt

Prompt 中：

- 当前输入来自 provider message frame。
- session memory 是模型写出的连续性。
- working memory 是模型沉淀的工作焦点。
- task lifecycle 是运行状态。

不再出现机器生成的目标事实。

### Status / UI

`kitty status` 展示：

- current focus
- latest session
- memory assets
- project map
- task lifecycle stage
- executions
- wake
- specs

没有 focus 时显示 `none`。

raw reasoning 默认可见，便于观察模型路线；需要安静输出时可通过 `.kitty/.env` 关闭。

## 执行清单

- [x] 删除普通 turn 自动写入 task lifecycle 目标。
- [x] 让 `TaskState` 使用 `focus` 承载模型写出的当前工作焦点。
- [x] checkpoint 从 focus 派生，不从用户输入派生。
- [x] working memory prompt 使用 `Focus`，不使用 `Objective/User input`。
- [x] runtime status 使用 focus，不显示机器猜测目标。
- [x] task lifecycle prompt 不输出普通 turn 目标。
- [x] 保留 execution assignment objective。
- [x] 保持 `KITTY_SHOW_REASONING` 默认开启。
- [x] 同步 README、philosophy、spec。
- [x] 更新测试，覆盖简单输入不会成为目标或 focus。
- [x] 运行 typecheck 和完整验证。
- [x] 扫描残留，确认不存在自动目标主干。

## 完成标准

- 用户说“你好”“？？？”只会作为当前 turn 输入，不会进入 task lifecycle 目标。
- 没有模型沉淀时，status focus 为 `none`。
- background/subagent 的 objective 仍作为模型显式派工契约存在。
- 文档、代码、测试讲同一个当前事实。
- `npm.cmd run verify` 通过。

## 验证结果

已运行：

```bash
npm.cmd run verify
```

结果：126/126 通过。
