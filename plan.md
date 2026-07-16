# 事件驱动后台等待 Plan

## 1. 需求文档

Kitty 用户需要在一个任务中启动耗时命令，同时让 Agent 保持同一任务现场。命令没有变化时 Agent 保持沉默；命令出现新进度、结束、失败，或用户补充要求时，Agent 恢复判断并决定处理结果、继续等待或结束任务。

该能力面向使用 Kitty 执行测试、构建、日志分析和其他耗时本地工作的用户。用户不需要判断任务属于短、中或长任务，也不需要手工反复查询状态。

当前范围包含：

- 后台 execution 与当前 turn 并行运行；
- `background_wait` 在进度、终态、steer、abort 或显式安静等待上限到达时返回；
- 普通输出变化合并后再唤醒模型，避免逐行调用模型；
- Runtime Dock 继续直接显示 control-plane execution 事实；
- 当前 turn 在等待后继续使用现有 context、checkpoint、workset 和 tool journal；
- Ctrl+C、终端关闭、Node 强杀、execution 丢失和重复恢复保持现有 durable lifecycle 语义；
- 使用真实 provider 验收渐进输出、同 turn 多次等待和最终结果消费。

当前范围不把后台 execution 变成独立系统服务。终端关闭、宿主结束或父进程死亡仍按当前产品规则终止本 session 的进程树，恢复读取明确的 completed、failed、aborted、lost 或 interrupted 事实。

业务完成标准：用户要求 Kitty 启动一个会分阶段输出的真实后台任务时，Agent 使用同一 turn 等待变化，至少消费一次运行中进度和最终终态，最终回答基于真实输出；无变化期间不产生模型轮询，用户 steer 和中断不会被等待吞掉。

## 2. 当前事实

- `runHostTurn()` 为 session turn queue、owner token、generation、lease、steer、closing 和最终事务收口的唯一 host 边界。
- `runAgentTurn()` 在同一 turn 内循环执行 provider request、工具批次和后续 provider request。
- `background_run` 创建带 session、turn、tool-call ownership 的 SQLite execution，启动受 watchdog 管理的子进程，按输出增量更新 execution，并在终态原子写入 execution 与 wake signal。
- `background_wait` 现由独立 change wait owner 驱动，进程内 signal 降低延迟，SQLite fallback 处理跨进程、漏通知和重启；它返回 progress、settled、steer 或 quiet timeout。
- `background_wait` 现为非并行 read effect；run/stop/terminate 为 process effect，check/read 为 read effect。已激活但未落结果的 wait 在恢复时结算为 interrupted，不是 uncertain side effect。
- active turn 的 durable steer 会立即通知当前进程中的 wait observer；wait 只返回 steer reason，既有 `consumePendingTurnSteers()` 仍是唯一消费 owner。
- Ctrl+C abort 当前 turn；终端 EOF、关闭和宿主终止信号 detach active turn，并终止当前 session 的 foreground/background 进程树。
- hard kill 后 turn 由 lease reconcile 恢复；父死亡 watchdog 终止子进程；运行中的无结果工具由 tool journal 结算为 interrupted 或 uncertain。
- Runtime Dock 已直接读取 SQLite active execution；无需新增展示状态或由模型播报每条输出。
- `npm.cmd run verify` 最终为 351 项、350 通过、0 失败、1 项 Windows 上跳过的 POSIX 测试。
- `npm.cmd run eval:local` 通过；`npm.cmd run eval:production` 通过新增真实后台场景及既有 provider、对话、修复和 runtime status 场景。
- Codex 当前 unified exec 使用 process/output notification 配合有界 yield/poll；可借鉴的是“进程继续、变化唤醒、模型再判断”，不复制其 sandbox 或远端 execution 架构。
- 真实 provider 验收实际留下 `background_run + 4 次 background_wait`、一次 running progress、一次 settled、一个 completed turn、一个带 PID identity 的 completed background execution 和一个 wake signal。

## 3. 失败测试

以下实现前失败合同现已全部转绿：

1. running execution 在等待开始后产生新输出时，`background_wait` 应在安静上限之前返回 `progress`，而不是继续阻塞到终态或 timeout。
2. 多个短间隔输出应先合并，再返回一个最新 execution snapshot，不能逐 chunk 唤醒。
3. 没有输出变化时，等待不得提前返回；显式安静上限到达时返回 `quiet_timeout` 和仍在运行的 execution 事实。
4. execution 进入 completed、failed、aborted 或 lost 后，等待立即返回 `settled`。
5. active turn 出现 pending steer 时，等待应迅速返回 `steer`；下一次 agent loop 消费同一 durable steer，不创建第二个 turn。
6. AbortSignal 触发时等待立即抛出 abort，不能伪造成功 tool result，也不能改变 execution 终态。
7. hard kill/expired turn 恢复时，已激活的 `background_wait` 作为 read effect 结算为 interrupted，不得成为 uncertain side effect；同一 turn 仍只恢复一次。
8. terminal close 期间等待必须响应 detach abort；session driver 继续终止 owned process tree，turn 回到 queued，pending steer 保留。
9. 真实 provider 必须在一个 production turn 中调用 `background_run`，至少调用两次 `background_wait`，消费一次 progress 和一次 settled，读取最终 sentinel，并留下 completed turn、terminal tool calls、completed background execution 与唯一 wake signal。

## 4. 目标

- 新增 execution change wait owner，负责进程内变化通知、进度游标、输出合并和跨进程 SQLite fallback；它不保存业务终态。
- `BackgroundExecutionStore` 每次可见 lifecycle/output 变化后发布进程内 change signal；SQLite execution 继续是唯一持久事实。
- `background_wait` 返回 typed wait facts：`reason`、`waitedMs`、`changed` 和最新 execution summary。
- `background_wait` 显式标记为 read effect、非 parallel-safe；`background_run/stop/terminate` 保持 process effect，check/read 为 read effect。
- 等待检查当前 turn 的 pending steer，并在 steer 出现时返回；Agent 随后的既有 loop 负责 durable consume。
- context、session、tool evidence、observability 和各 host 继续走现有工具结果主链路，不增加第二套后台状态。
- `spec.md`、代码、确定性测试、local eval 和 production eval 描述同一当前行为。

## 5. 不做范围

- 不新增跨 turn continuation scheduler。
- 不新增 daemon、系统服务、开机启动或宿主退出后继续运行的外部进程。
- 不按任务持续时间维护短、中、长三套规则。
- 不让模型按固定频率调用 `background_check`。
- 不把 Runtime Dock 输出写回 session 或模型 context。
- 不自动判断 dev server 是否应该 detached；是否继续等待仍由模型根据用户目标判断。
- 不迁移旧 schema，不保留旧工具返回格式兼容层；当前工具合同和测试同步更新。

## 6. 设计

### 主链路

```text
provider 选择 background_run
  -> BackgroundExecutionStore 创建/启动 execution
  -> SQLite 持久化 ownership 与 running 状态
  -> 进程输出更新 SQLite，并发布进程内 change signal
  -> provider 选择 background_wait
  -> wait owner 读取当前 execution 和本 turn pending steer
  -> 等待 change signal；跨进程或遗漏通知时周期读取 SQLite
  -> progress 先短暂合并，再返回最新 typed snapshot
  -> tool evidence 持久化到同一 session
  -> agent loop 消费 steer、重建 context、再次请求 provider
  -> 模型处理进度、继续 wait 或收束最终回答
```

### 模块边界

- `src/execution/background.ts`：后台 execution store、启动注册、reconcile、stop 与进程生命周期；不再拥有等待策略。
- 新建 `src/execution/backgroundWait.ts`：等待 reason、进度 fingerprint、进程内通知、游标、去抖和 SQLite fallback；不修改 execution 终态。
- `src/extensions/tools/background/tools/backgroundWait.ts`：解析工具参数，把 turn/session/abort 传给 wait owner，返回 typed JSON。
- background 其他工具：只声明准确 effect；不新增另一套行为判断。
- `src/agent/toolResults/modelProjection.ts`：只投影 wait reason 与 execution facts，不推断是否应该继续等待。
- `src/evaluation/productionBackground.ts`：构造真实渐进输出任务并验收模型轨迹、最终产物与 SQLite 账本。

### 等待状态

`background_wait` 只有一套与时长无关的状态机：

- `progress`：running execution 的 status、output、summary、lastOutputAt、exit/error 等可行动事实相对该 turn 上次观察发生变化；短时间合并后返回。
- `settled`：execution 已进入 completed、failed、aborted 或 lost；立即返回并清理进程内游标。
- `steer`：当前 turn 存在 pending steer；立即返回，工具本身不消费 steer。
- `quiet_timeout`：调用者给定的安静等待上限到达；返回仍在运行的事实，不伪造进度。

进程内 signal 只优化延迟。等待仍定期从 SQLite 重新读取，因此 signal 丢失、不同进程写入或恢复后没有内存游标都不会造成永久等待。SQLite 是唯一终态 owner。

### 中断、崩溃与恶劣路径

- 接受：`background_run` 只有在 execution 已写 SQLite 并进入可审阅状态后才返回成功。
- 执行：wait 不持有 execution controller，不提升 execution generation，不根据 PID 猜状态。
- Ctrl+C：AbortSignal 中断 wait，host 按现有 turn abort 收口；pending steer rejected；read wait 不改变 background execution。
- steer：wait 只观察 pending 事实并返回；`consumePendingTurnSteers()` 继续是唯一消费 owner，稳定 message ID 与幂等语义不变。
- controlled close：PRESERVE_ACTIVE abort 中断 wait，host detach turn；exit guard 并行终止本 session 进程树。
- hard kill/Agent 自杀：内存 signal/游标消失；watchdog 终止进程，turn lease 和 execution lease 对账；wait tool 作为 read effect进入 interrupted，恢复后模型读取 execution/tool journal 决定下一步。
- 断电：已提交 SQLite 事实保留，未提交变化不算接受；重启不盲目重放 background_run 或任何副作用。
- final：只有模型退出工具循环后才进入既有 closing 边界；wait 不创建或展示 final answer。
- 重复操作：execution terminal close 与 wake 继续同事务幂等；重复 stop、重复 recovery 和连续 Ctrl+C 不产生第二个终态或 wake。

### 文件职责审查

`src/execution/background.ts` 当前超过 300 行且混有等待策略。把等待策略移到 `backgroundWait.ts` 后，前者继续只负责后台生命周期，后者只负责观察变化，变化原因清楚；这次拆分由职责边界驱动，不由行数驱动。

## 7. 实施任务

- [x] 新增确定性失败测试，覆盖 progress、去抖、quiet timeout、settled、steer、abort 和 read-effect recovery。
- [x] 拆出 `backgroundWait.ts`，实现进程内 signal、per-turn cursor、SQLite fallback、进度 fingerprint 与 wait result。
- [x] 让 `BackgroundExecutionStore` 在 create/running/output/terminal 变化后发布 signal，且不改变事务 owner。
- [x] 更新 `background_wait` 工具输入输出与 background 工具 effect；同步 model projection。
- [x] 增加同一 agent turn 的 background progress -> wait -> steer/settled 行为测试。
- [x] 新增 production background acceptance，并接入 production evaluation 清单与类型。
- [x] 更新 `spec.md` 的 Background、turn、中断恢复和验证事实。
- [x] 运行定向测试并修复所有失败。
- [x] 运行完整验证、开发入口 smoke、local eval 与真实 production eval。
- [x] 更新本文件收口，记录实际文件、命令、未验证内容和剩余风险。

## 8. 验证计划

局部验证：

```powershell
npm.cmd run test:build
node --test .test-build/tests/execution/background-lifecycle.test.js .test-build/tests/extensions/background-tools.test.js .test-build/tests/agent/turn-steering.test.js .test-build/tests/interaction/session-driver-recovery.test.js .test-build/tests/control/lifecycle-fencing.test.js
```

完整验证：

```powershell
npm.cmd run verify
npm.cmd run dev -- --help
npm.cmd run dev -- --version
npm.cmd run eval:local
npm.cmd run eval:production
```

验证必须确认：

- typecheck、生产构建、包合同和 core tests 全绿；
- Windows 当前实机进程树、中断、hard-kill 与 PID identity 测试继续通过；
- POSIX 专属进程树测试只记录当前平台 skip，不能冒充 POSIX 实机通过；
- production background 场景真实调用 provider，并从 SQLite 检查同一 turn、tool effect、execution ownership、progress/settled wait evidence 和 wake 幂等；
- 文档中不出现未实现的 daemon、跨重启进程存活或 continuation scheduler。

未验证内容只有当前机器无法实机证明的 POSIX 进程树行为；其确定性测试保留并由 POSIX 环境执行。

## 9. 收口

状态：完成。

- 目标完成：同一 agent turn 可启动后台命令，在 progress、settled、steer 或 quiet timeout 时恢复模型判断；无变化时不请求模型。
- 失败合同已转绿：progress 合并、饱和输出后的继续更新、quiet timeout、settled、steer 不消费、abort、read-effect recovery、同 turn 多次等待和唯一 wake 均有确定性覆盖。
- 核心实现：新增 `backgroundSignals.ts` 与 `backgroundWait.ts`；`background.ts` 只保留 execution lifecycle；background tools、CLI wait、session driver steer 和 model projection 接入同一事实链。
- 验收实现：新增 `productionBackground.ts` 和 production check；真实失败曾发现 extension 工具未注入及 `background_run` ID 未进入模型投影，修复后真实 provider 全套通过。
- 文档与测试：更新 `spec.md`、background/evaluation/tool projection 测试，并新增同 turn 真实子进程测试。
- 验证通过：定向 30 项 lifecycle 组合、同 turn 子进程测试、`npm.cmd run verify`、`npm.cmd run dev -- --help`、`npm.cmd run dev -- --version`、`npm.cmd run eval:local`、`npm.cmd run eval:production`。
- 最终完整验证：351 项，350 通过，0 失败，1 项 Windows 上跳过的 POSIX 专属测试。Production background 为 1 turn、1 execution、1 wake，模型调用 1 次 run 和 4 次 wait。
- 未验证：当前 Windows 机器不能实机证明 POSIX 进程树终止；对应测试保留为平台 skip。进程内 signal 不是持久事实，硬杀后仍依靠 SQLite、watchdog 和 lease，这是设计边界。
- 未执行 commit 或 push；用户未要求。
