# Kitty 生命周期核心审判

本轮只审判会破坏以下不变量的问题：

1. 同一 session 同一时刻只有一个有效 turn owner generation。
2. stale owner 不能写 session、消费 steer、启动或结算 tool effect、提交终态。
3. foreground/background process 从创建到终态始终有 durable owner、lease、identity 和 recovery 事实。
4. terminal 不倒退；不能确认的外部副作用显式进入 `uncertain`。
5. CLI、TUI、Telegram、Local API 的关闭、恢复和 reset 有明确边界。

UI 投影、测试脚手架、通用 IO、TUI cleanup 与 session picker 不属于本轮核心，未作为交付项。

## 裁决

原 36 项问题不是 36 个独立根因。合并后只有五个核心根因，均有代码证据，均有必要重建：

- turn、session、steer 缺少同事务 fencing。
- tool effect journal 缺少 generation、planned 和 uncertain。
- execution 缺少 controller lease、合法状态机、creation identity 与统一进程树 supervision。
- host shutdown/reset 缺少有限关闭与 exclusive lifecycle。
- Telegram ingress、outbox 和 service ownership 缺少 durable 原子事实。

其余项是上述根因的派生症状或外围健壮性，不单独修补。

## 当前事实

### Turn 与 Session

- Turn claim 生成随机 token 与单调 generation；heartbeat、closing、finish、detach 全部强制校验 token、generation 和有效 lease。
- Session append、steer consume 与 tool transition 使用同一 SQLite connection 的事务校验。
- Session history 严格 append-only，禁止删除、重排或同 ID 改写。
- Final session revision 与 turn terminal 在同一事务提交；terminal commit 失败不能伪装成 completed。
- 普通 load、status 和 UI projection 不执行 recovery。

### Tool Effect

- Tool identity 是 `(turn_id, call_id)`，provider 的 `tool-0` 可在不同 turn 安全复用。
- 状态机是 `planned -> running -> success/error/interrupted/uncertain`。
- 每项真实工具调用前再次检查 abort 与 turn generation，再激活 running。
- 未激活的遗留计划进入 interrupted；已激活但无法确认的非读副作用进入 uncertain；stale owner 不能落账。

### Execution 与 Process

- 状态机是 `created -> running -> cancelling -> completed/failed/aborted/lost`，底层仓库拒绝非法跳转和 terminal 倒退。
- 每条 execution 保存 version、controller token、generation、lease、heartbeat、PID 与 creation identity。
- Bash、skill script 与 background command 共用 launch-time watchdog、identity、process tree termination 和 durable settlement。
- Spawn 返回调用者前已注册 parent-death watchdog；watchdog 同时验证 parent/target identity。
- Windows 使用 `taskkill /T /F` 并复查退出；POSIX 使用独立 process group、子孙枚举和 TERM/KILL 升级。
- Recovery 只有在 lease 过期后才能提升 generation；正常 wait/check 不抢健康 controller。
- Terminal 与唯一 wake signal 同一事务提交。

### Host 与 Reset

- EOF、quit、reset、信号先关闭准入，同时 abort turn 与终止当前 session 的 execution tree。
- Turn 等待和宿主关闭都有 deadline；重复中断或信号升级为 forced exit，信号退出码保留。
- `/reset` 先完成当前 lifecycle 收口，再在 SQLite exclusive transaction 中拒绝任何 active owner，最后清空当前事实。

### Telegram

- Service lock 是 SQLite token/generation/lease，不再使用 PID 文件；generation 在 release 后保持单调。
- Lease heartbeat 丢失会 abort service，旧 owner 不能继续 polling。
- Update ID 进入 durable inbox，并原子绑定唯一 turn ID。
- Outbox 使用 queued/sending/sent/uncertain；远端调用后本地无法确认时不自动盲重试。
- Shutdown 不启动新排队 turn，等待有界，并终止 active session 的 execution tree。

## 成熟实现调查

- OpenAI Codex：采用单一 process manager、先登记 live process 再等待、interrupt/output/exit 共享状态。
- Goose：采用独立 POSIX process group、Linux parent-death 与 parent PID 竞态复查原则。
- OpenCode：采用 sequence/fence 思想；未采用 JSON storage 或进程内锁作为跨进程事实主干。

Kitty 使用 SQLite generation 扩展到跨进程恢复，不复制这些项目的产品结构。

## 故障矩阵

- Turn lease 转移后，旧 generation 的 session、steer、tool 与 terminal 写入全部拒绝。
- Output/complete、cancel/complete、重复 close 不允许 terminal 倒退，wake 只有一条。
- Tool batch 中途 abort 后不启动下一副作用；planned 与 running 遗留状态可区分恢复。
- Parent hard kill、Windows 孙进程、POSIX process group、PID identity mismatch 均有真实进程测试。
- 健康 execution lease 不会被 check/wait 抢占；过期 owner 才能 recovery。
- 双 Telegram service 只有一个 owner；重复 update 只绑定一个 turn；发送不确定进入 uncertain。
- EOF、重复中断、reset 与 active execution 的有限收口有 host 测试。

最终通过状态以 `plan.md` 的完整验证与真实 API 结果为准。
