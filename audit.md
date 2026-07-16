# Kitty 生命周期核心审判

本文只记录当前 0.0.36 生命周期事实。历史问题和旧能力只进入 Git 与 `VERSION_LOG.md`，不作为当前产品主干。

## 审判范围

必须保护以下不变量：

1. 同一 session 同一时刻只有一个有效 turn owner generation。
2. stale owner 不能写 session、消费 steer、启动或结算 tool effect、提交终态。
3. foreground/background execution 从创建到终态始终有 durable ownership、lease 和 recovery 事实；进入 active 状态的 process 必须有 creation identity。
4. terminal 不倒退；不能确认的副作用显式进入 `uncertain` 或 `lost`。
5. CLI、TUI、Telegram 与 Local API 复用同一 host turn 和 control-plane 事实。

## 当前裁决

### SQLite Control Plane

- `.kitty/control-plane.sqlite` 是 session、turn、steer、tool call、context epoch、task lifecycle、execution、wake、runtime event 与 Telegram lifecycle 的唯一持久主干。
- 数据库使用 Node 内置 `node:sqlite`，启用 WAL、`synchronous=FULL`、busy timeout 与显式 transaction mode。
- schema version 不匹配时在 exclusive transaction 中按当前 schema 重建；不读取、不迁移、不修复旧 schema。
- 普通 load、status、wait 和 UI projection 不取得 recovery ownership。

### Turn 与 Session

- Turn admission 先写 durable queue，再按 session 队首 claim 随机 token 与单调 generation。
- Heartbeat、closing、finish、detach、session append、steer consume 与 tool transition 都校验有效 token、generation 和 lease。
- Session history append-only，保存使用 revision CAS；final session revision 与 turn terminal 在同一事务提交。
- Active turn 的普通输入进入 durable steer；final closing 前必须确认没有 pending steer。
- Ctrl+C abort 当前 turn 并 reject 未消费 steer；终端关闭或宿主信号 detach 当前 turn，留给同一 durable turn 恢复。

### Tool Effect

- Tool identity 是 `(turn_id, call_id)`，状态机是 `planned -> running -> success/error/interrupted/uncertain`。
- 每项真实调用前再次检查 abort 与 turn ownership，再激活 running。
- 未激活计划恢复为 interrupted；已激活但无法确认的非读副作用恢复为 uncertain；副作用不自动盲目重放。
- Typed evidence 同时保存 model view、compact view、provenance、facts、error、artifact 与 truncation。

### Execution 与 Process

- 状态机是 `created -> running -> cancelling -> completed/failed/aborted/lost`，terminal 不允许倒退。
- 每条 execution 显式保存 owner session、creator session、parent turn、origin tool call、controller token、generation 和 lease。进入 active 状态并保存 PID 时必须同时保存 creation identity；登记前已经结束的极短进程从 created 直接结算 terminal，不留下孤立 PID。
- Bash、skill script 与 background command 共用 launch-time watchdog、进程树终止和 durable settlement。
- Windows 使用 `taskkill /T /F` 并复查退出；POSIX 使用独立 process group、子孙枚举和 TERM/KILL 升级。
- 只有 lease 过期后 recovery 才能提升 generation；终态与唯一 wake signal 在同一事务提交。

### Host 与 Telegram

- EOF、`/exit` 与宿主终止信号先关闭准入，再有界 detach active turn 并终止当前 session 的 execution tree；其他 session 不受影响。
- 重复中断或信号升级为 forced exit，信号退出码保留。
- Telegram service 使用 SQLite token/generation/lease；update ID 进入 durable inbox并绑定唯一 turn，回复通过 queued/sending/sent/uncertain outbox 交付。
- 远端调用后无法确认本地提交时进入 uncertain，不自动盲重试。

## 验证合同

- `npm.cmd run verify`：类型、生产构建、包内容和 core lifecycle 测试。
- `npm.cmd run eval:local`：host turn、background、runtime status 与 recovery drills。
- `npm.cmd run eval:production`：真实配置、provider probe、真实多轮 turn、真实工具修复任务和 SQLite runtime status。
- Production tool turn 必须同时证明失败证据、真实修改、复验通过、final sentinel、durable session/turn/tool call、foreground execution ownership 和 wake signal。
- 当前系统没有实机执行的平台必须明确记录为未验证，不能沿用历史绿灯代替本轮事实。
