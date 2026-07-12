# Kitty 生命周期主干重建 Plan

## 1. 需求文档

Kitty 必须让每个 session 只有一个有效 agent loop，并在 CLI、TUI、Telegram 和 Local API 中保持同一套持久化、并发、中断、后台执行和恢复语义。

用户关闭终端、杀死宿主、重复发送信号、打开多个窗口或重启服务后，已经接受的输入、正在执行的副作用、后台进程和最终结果都必须落入可判断的状态；不得出现旧 owner 继续写入、工具重复执行、进程失去归属、完成态倒退或无限等待。

本次范围包含 turn、session、steer、tool effect、foreground/background process、host shutdown、reset 和 Telegram ingress/outbox 的统一生命周期。当前 schema 直接重建，不迁移旧数据，不保留兼容路径。

本次不以 UI 投影、输出刷新、测试脚手架或一般性 I/O 健壮性为交付目标。只有当它们直接阻断核心生命周期验收时，才修改必要接线。

业务完成标准：所有入口复用同一 ownership 与 supervisor 主干；故障注入证明没有 stale write、无声重复副作用、永久 active 记录、孤儿进程或无界 shutdown；完整验证和真实生产验收通过。

## 2. 当前事实

- 基线为 `0a4b78f refactor agent lifecycle around session background work`，本地领先远端一个提交。
- 工作区原有未跟踪 `audit.md`；本计划由当前任务恢复。
- `spec.md` 已声明 session 唯一 turn owner、execution lease/heartbeat、`cancelling`、进程树终止和原子 terminal+wake。
- Execution 已持有 controller token、generation、lease、heartbeat、process identity 与 cancelling 状态。
- Turn/session/steer/tool 写入已在同一 SQLite transaction 校验 owner generation。
- Tool journal 使用 `(turn_id, call_id)` 与 planned/running/terminal 状态。
- Foreground/background 已接入 durable process supervision、launch-time watchdog 与 tree termination。
- CLI/TUI/Telegram shutdown 已有 abort、deadline 与升级合同。
- Telegram inbox/outbox/service lease 已进入 SQLite 主干。
- 第二轮仓库调查、成熟实现调查、实现与定向故障测试已完成。
- 当前定向故障集 25 项：24 通过、0 失败、1 项平台跳过；完整验收待执行。

## 3. 失败测试

实施前必须补齐并确认以下测试在旧实现失败：

- owner 校验后转移 turn lease，旧 owner 的 session append、steer consume、tool transition 和 terminal commit 全部不得落盘。
- output/complete、terminate/complete 和双 close 并发时，execution terminal 不得倒退，wake 只能出现一次。
- tool batch 在 abort 或 lease loss 后不得启动下一个副作用工具；已跨越副作用边界但未结算的工具进入 `uncertain`。
- create、spawn、supervision、PID identity、running commit 和 settlement 各点硬杀后，不得留下永久 active row 或孤儿进程树。
- PID 被复用时不得向新进程发送终止信号。
- EOF、单次信号、重复信号、忽略 AbortSignal 的 provider/tool 均在 deadline 内退出并记录原因。
- 双终端争用同一 session 时只能有一个 generation 写入；session message 必须严格 append-only。
- active turn/background 存在时 reset 必须先排空或失败，不得先删除 control plane。
- Telegram 重复 update 只能绑定同一 durable turn；双 service acquire 只能一个成功；shutdown 不启动排队 turn。
- Telegram 远端发送成功但本地未提交时进入可见 `uncertain`，不得无声自动重发。

## 4. 目标

- 一个 SQLite control plane 保存 session、turn、steer、tool effect、execution、service ownership 和恢复事实。
- 所有可变 owner 使用显式 token、单调 generation、lease 和条件状态转换。
- session append、turn fencing、steer consumption、closing/terminal commit 使用同一事务边界。
- tool effect 使用 `planned -> running -> success/error/interrupted/uncertain`。
- execution 使用 `created -> running -> cancelling -> completed/failed/aborted/lost`。
- foreground 和 background process 共用 launch、identity、watchdog、tree termination、settlement 和 recovery。
- 所有 host 使用同一有界 shutdown supervisor；reset 是项目级 exclusive lifecycle operation。
- Telegram 使用 durable inbox、outbox 和 service lease，不以 PID 文件或内存队列作为事实主干。
- `spec.md`、代码、测试和 `audit.md` 描述同一当前事实。

## 5. 不做范围

- 不修复仅影响 background 尾部刷新、TUI cwd 投影、空态 watcher、cleanup stack、session picker 或通用 HTTP body 限制的问题。
- 不为旧 SQLite schema 写 migration、兼容读取、旧字段推断或 legacy wrapper。
- 不承诺外部 Telegram API 的严格 exactly-once；只保证本地 ownership、可见 uncertain 和禁止无声盲重试。
- 不恢复子代理、leader/worker 或第二条 agent loop。
- 未经用户明确要求不 push。

## 6. 设计

### 6.1 调查合同

先完成当前仓库主链、历史实现、Codex 官方事实和成熟开源实现调查。参考只用于验证 ownership、supervision、cancellation、process tree 和 durable recovery 边界，不直接复制产品结构。

### 6.2 生命周期内核

业务归属与运行 controller 分离。Turn、execution、service lock 均保存随机 owner token、单调 generation、lease deadline 和 heartbeat。Token 防猜测，generation 防旧 owner 的幂等误判，lease 负责失联判定。任何写操作都用 `WHERE token + generation + active state + lease > now` 证明 owner；affected rows 为零即停止旧执行。

Recovery 只能由显式 coordinator 在取得新 generation 后执行。普通 load、status 和 UI projection 永远只读。

### 6.3 原子持久化

`ControlPlaneLedger` 持有唯一 SQLite connection 与 transaction。Turn-scoped session store 不再调用另一份 SessionStore 保存，而是直接执行 `saveOwned()`；该方法在同一事务校验 turn fencing、revision 和 canonical message prefix。

Steer consumption 使用 `consumeOwnedSteerAndSaveSession()`：append message 与 consumed generation 同一提交。Terminal 使用 `finishOwnedTurn()`；提交失败是 host outcome 失败，不能先返回 completed。禁止在 wrapper 中使用“写前 assert、写后 assert”代替原子 fencing。

Tool key 为 `(turn_id, call_id)`。计划批次只插入 planned；紧邻真实调用前由 `activateOwned()` 切 running；settle 只接受同 generation 的 running。副作用已经开始但 owner 丢失时由 recovery coordinator 标记 uncertain。

### 6.4 Process supervisor

`ExecutionSupervisor` 独占 create、claim、spawn、identity inspection、watchdog、heartbeat、output、cancel 和 settle。前台 bash 与后台命令都通过 supervisor，区别仅是调用者是否等待 terminal。

POSIX child 建立独立 process group；Linux parent-death helper采用 Goose 的 parent PID 复查原则。Windows 使用隐藏进程和完整 tree termination，kill 后复查；持久身份至少包含 PID、平台和 creation marker。状态转换全部携带 controller generation。取消先写 cancelling，再终止并确认身份退出，最后提交 aborted+wake。

### 6.5 Host 与 Telegram

Host 只负责准入、信号和呈现，生命周期事实进入统一 supervisor。Shutdown coordinator 先关闭准入，同时 abort turn 和 cancel execution；grace deadline 后 detach/force；重复信号直接升级。Reset 使用项目级 exclusive lease。

Telegram inbox/outbox/service ownership 使用 SQLite durable state，不保留 update commit JSON、delivery JSON 或 PID 文件平行主干。Update admission 与 turn ID 同一事务；outbox 对远端已调用但本地未确认的记录使用 uncertain，不承诺外部 exactly-once。

### 6.6 成熟实现取舍

- 采用 Codex 的单一 process manager、live process 先登记、interrupt/output drain/exit watcher共享状态。
- 采用 Goose 的 POSIX process group、Linux parent-death signal和 parent PID 竞态复查。
- 采用 OpenCode control-plane 的 sequence/fence思想，以 SQLite generation实现。
- 不采用 Codex 进程内 session 作为 durable owner，不采用 OpenCode JSON storage/进程内锁，不把 PID 当 ownership。

## 7. 实施任务

- [x] 完成第二轮全局语义调查，按输入 -> turn -> tool -> process -> record -> host output 记录事实。
- [x] 调查 Codex 官方行为及成熟开源实现，提炼可复用边界并记录不采用项。
- [x] 重写 `audit.md`：删除外围项，合并派生症状，保留核心证据与失败测试。
- [x] 更新本计划的最终 schema、状态机、模块职责和逐文件任务。
- [x] 增加并发、硬杀、重复信号、PID 复用和 ownership 故障测试。
- [x] 重建 control-plane schema 与原子 transaction API。
- [x] 重建 turn/session/steer ownership 与 terminal commit。
- [x] 重建 tool effect journal 与执行前 fencing。
- [x] 重建统一 process supervisor，并接入 foreground/background。
- [x] 重建 CLI/TUI/Local API shutdown 与 project reset 生命周期。
- [x] 重建 Telegram durable inbox/outbox/service lease 与有限 shutdown。
- [x] 同步 `spec.md` 与核心审查事实。
- [x] 运行局部测试、完整验证、故障演练、Evaluation 和真实模型验收。
- [x] 清理测试状态和残留进程，完成收口；按用户要求 commit，不 push。

## 8. 验证计划

- 类型检查与构建：`npm.cmd run check`。
- 核心完整验证：`npm.cmd run verify`。
- Evaluation：`npm.cmd run test:eval`。
- 本地验收：`npm.cmd run eval:local`。
- 生产验收：使用现有真实 provider 配置执行 `npm.cmd run eval:production`。
- Windows 实测：parent -> shell -> grandchild，覆盖正常退出、abort、timeout、宿主硬杀和 PID identity mismatch。
- 并发实测：双进程 session claim、tool settle、execution close、Telegram service lock、reset exclusion 和 SQLite busy。
- 卫生检查：`git diff --check`、`.test*`、Kitty/test Node 进程、control-plane active row 和临时文件。

## 9. 收口

实现与实践验收已完成：

- `npm.cmd run verify`：317 项，316 通过，0 失败，1 项平台跳过。
- `npm.cmd run test:eval`：12/12。
- `npm.cmd run eval:local`：13/13。
- DeepSeek `deepseek-v4-flash` 真实生产验收：5/5；真实两轮 turn、失败证据、文件修复、复验和最终回答闭环。
- 定向生命周期故障集：25 项，24 通过，0 失败，1 项平台跳过。
- `.kitty/.env`、`.kitty/.env.example` 与动态 env template 的现行 subagent 引用均为 0。

卫生检查通过：`git diff --check` 无错误，`.test*` 0，eval 隔离目录 0，control-plane SQLite 0，Kitty/test Node 进程 0，现行 subagent 引用 0。等待本地 commit；不 push。
