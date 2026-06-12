# 入口闭环补全计划

## 目标

把已经存在但用户无法完整使用的入口补成当前事实主干。

本轮只处理真实不完整点：session events 已经被 host 记录，也能被 local API 读取，但普通 CLI 没有审阅入口。结果是事件层有地基、有测试，却没有用户可见闭环。

不新增新概念。不做旧兼容。不为了统一而重写已经正常工作的 CLI、interactive、Telegram 或 worker 链路。

## 排查结论

- `runHostTurn` 已统一写入 `turn.started`、`turn.completed`、`turn.failed`、`turn.aborted`。
- `createLocalAgentApi` 能创建 session、发送消息、读取 events、读取 status。
- `kitty status` 展示当前现场，但不适合展示单 session 事件流。
- `kitty sessions` 只列 session 摘要，不展示 turn 事件。
- `src/session/events.ts` 只有 API 和测试在读，用户没有直接入口。
- `src/evaluation/` 已拆成 `harness/scenarios/checks/golden/types`，不再是本轮主矛盾。

## 设计

新增当前 CLI 入口：

```bash
kitty events [sessionId] [-n 20] [--json]
```

行为：

- 不传 `sessionId` 时读取最新 session。
- 传 `sessionId` 时读取指定 session。
- `-n/--limit` 控制读取数量。
- 默认文本输出按时间顺序展示 event type、createdAt、host、message/details。
- `--json` 输出 `{ sessionId, events }`。
- 没有 session 时给出清楚提示。
- 没有 events 时给出清楚提示。

边界：

- events 是机器事实审阅入口，不是对话历史入口。
- 不把 events 注入模型。
- 不让 CLI presenter 重新判断语义，只格式化已有事件记录。
- 不改变 `runHostTurn`、Telegram、interactive 的生命周期主干。

## 执行清单

- [x] 重写 `plan.md`。
- [x] 新增 CLI `events` 命令。
- [x] 给 `events` 命令补测试。
- [x] 同步 README 和 spec 当前入口事实。
- [x] 运行 `npm.cmd run verify`。
- [x] 真实运行 `node dist\cli.js events --json`。

## 完成标准

- 用户能直接用 CLI 查看当前 session 的机器事件。
- `session events` 不再只是 API 内部能力。
- 文档、代码、测试讲同一个当前事实。
- 完整验证通过。
