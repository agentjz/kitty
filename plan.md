# Kitty Background/Subagent Production Plan

## 1. 需求文档

用户要把 Kitty 的后台任务和 subagent 做到可长期使用的生产级能力。

实际问题不是“多几个工具”或“恢复 team”。实际问题是：长任务、模型派工、独立上下文、后台命令、等待、取消、恢复、查看输出和最终收口必须成为同一条可靠产品路径。用户不应该猜一个 background 进程还在不在，也不应该猜 subagent 做了什么、卡在哪里、是否能停、结果是否已经回到 lead。

使用者是 Kitty 维护者，以及用 Kitty 处理真实本地开发任务的人。典型体验：

- 用户让 Kitty 跑长命令，lead 当前轮不被卡死，后台执行可查看、可读输出、可等待、可停止。
- 用户让 Kitty 派 subagent 研究或执行隔离任务，lead 能让出、等待、恢复，并基于可审阅结果收口。
- 用户随时能通过 CLI/TUI/status 看见 active/recent execution、输出摘要、最后活动时间、风险、下一步动作。更关键的是：当 lead 因阻塞型 subagent execution 暂停时，当前输出流必须切到 subagent，实时显示它的工具、思考和回答；subagent 结束后再切回 lead。
- Kitty 异常退出或用户中断后，再次启动能基于 control-plane 事实恢复判断。
- 行为不会滑向组织模拟。subagent 是独立上下文执行，不是 team 叙事。

当前范围包含：

- background 和 subagent 的统一 production lifecycle。
- execution 状态、输出、摘要、最后活动、deadline、wake、停止和恢复事实。
- CLI 工具入口、agent 工具入口、runtime status、TUI dock、spec、tests、eval 同步。
- 行为验收：什么时候该 background，什么时候该 subagent，什么时候不该派工，什么时候可以并行。
- 外部项目对比只作为证据：Codex 学 lifecycle/interrupt/notification，Gemini 学 eval，opencode 学 inspector，Goose 学顺序/并行边界。

当前范围不包含：

- 不恢复 team、teammate、message bus、组织角色系统。
- 不做企业审批/沙箱权限主线。
- 不引入远程云调度。
- 不做旧 control-plane 兼容分支。
- 不把外部项目 API 原样照搬进 Kitty。

业务完成标准：

- 一个真实长任务可以后台跑、被查看、读输出、等待、停止、异常恢复。
- 一个真实 subagent 可以启动、等待、超时暂停、取消、结果回传、被 status/TUI/CLI 审阅。
- lead 派工行为有测试保护，简单任务不会被鼓励过度委派。
- spec、代码、测试、CLI 输出和 runtime status 讲同一个当前事实。
- `npm.cmd run verify` 通过，并有专门 production eval 或真实演练覆盖 background/subagent。

## 2. 当前事实

当前文档事实：

- `spec/用户审阅/系统核心/核心地图.md` 定义 Task Lifecycle 是当前任务运行事实主干。
- Control Plane 使用 `.kitty/control-plane.sqlite` 保存 task lifecycle、background、subagent execution、派工边界、pid、状态、退出码、输出摘要和 wake signal。
- 当前默认事实：subagent 创建阻塞型 execution；background 创建非阻塞 execution。
- lead-wait 由 execution 记录里的 `waitPolicy` 驱动，不按工具名猜。
- background 当前可以通过工具和 `kitty background` 查看、等待和停止。
- 阻塞型 execution 到 deadline 后标记 `paused` 并发布 wake signal；继续等待、终止、重派或收束由模型判断。
- history 里已经确认：team 容易变成组织模拟；当前保留 subagent 作为独立上下文隔离。

当前代码事实：

- `src/control/executionRows.ts` 保存 execution 的 kind、status、assignment、command、prompt、actor、cwd、requestedBy、sessionId、pid、exitCode、output、summary、waitPolicy、deadline、lastOutputAt、changedPaths。
- `src/execution/leadWait.ts` 提供 lead-wait execution 列表、等待、deadline pause 和 wake fact 构建。
- `src/extensions/tools/background/tools/backgroundRun.ts` 启动命令、记录 background execution、持续写 running output/summary、结束时 close。
- `src/extensions/tools/background/tools/backgroundCheck.ts` list 并 reconcile stale running processes。
- `src/extensions/tools/background/tools/backgroundWait.ts` 等待指定 background settled。
- `src/extensions/tools/background/tools/backgroundStop.ts` 和 `backgroundTerminate.ts` 可以关闭指定 background。
- `src/extensions/tools/subagent/tools/subagentLaunch.ts` 创建 focused subagent execution，输入包含 objective、boundary、expected_output、prompt、role、timeout_ms。
- `src/subagent/launch.ts` 和 `src/execution/worker.ts` 启动独立 worker，worker 最终 visible answer 写入 execution summary/output/changedPaths。
- `src/host/turn.ts` 在 lead yield 后等待 blocking execution，再用 internal wake facts 恢复 lead。
- `src/runtime/status.ts`、`src/runtime/scene.ts`、`src/runtime/executionSummary.ts` 已把 execution 暴露到 runtime status/scene。
- TUI 已有 runtime dock 的 background/subagent 字段，但此前呈现仍是工具事实级别；阻塞等待期间没有把 subagent 的实时执行流接到当前 display。

当前测试事实：

- `tests/control/control-plane-ledger.test.ts` 覆盖 execution lifecycle、wait policy、wake signal、task lifecycle facts。
- `tests/execution/background-lifecycle.test.ts` 覆盖 background create/start/close/wake、stale pid reconcile、running output summary。
- `tests/extensions/background-tools.test.ts` 覆盖 background run/check/wait/stop/terminate 工具。
- `tests/extensions/subagent-tools.test.ts` 覆盖 subagent launch/check 工具。
- `tests/host/lead-wait-lifecycle.test.ts` 覆盖 lead yield、policy-based wait、host wait/resume、exact delegated closeout、deadline pause。
- `tests/evaluation/harness.test.ts` 已有 local/production eval 框架，但没有足够的 background/subagent 行为验收。

当前配置和命令事实：

- `package.json` 的完整验证命令是 `npm run verify`，实际 Windows 下应使用 `npm.cmd run verify`。
- `npm test` 等于 `npm run check && npm run test:core`。
- `npm run test:eval` 单独运行 evaluation tests。
- `kitty eval --run-local` 和 `kitty eval --run-production` 是产品验收入口。

当前外部证据：

- Gemini CLI 的 subagent 文档强调独立 context、specialized tools、custom subagents；eval 覆盖避免简单任务过度委派、优先 specialist、多 specialist 选择。
- Gemini background eval 覆盖 `read_background_output` 和 `list_background_processes` 的自然使用。
- opencode 有 subagent permission 派生、subagent tab/detail、background job list/get/start/extend/wait/promote/cancel。
- Goose 的经验是：有依赖的任务顺序跑；独立任务或共享计划后才并行。
- Codex 有 subagent lifecycle notification、child context、stop hooks、wait/interrupt 等更重的多 agent 能力。

本计划启动时确认的缺口：

- background 缺少一等 output read/tail/full 语义；现在 check/wait 会带 summary/preview，但产品入口不够直接。
- subagent 缺少 stop/cancel/interrupt 工具和 CLI 入口。
- subagent 缺少 lead 阻塞等待期间的 live stream takeover；status/CLI inspector 只能旁路审阅，不能替代当前输出流显示。
- background 和 subagent 共享 execution 原语，但 CLI 仍偏 background；缺少统一 `execution` 审阅入口。
- behavior eval 不足：没有防过度委派、background output 读取、并行前共享计划、顺序依赖任务的验收。
- subagent 工具面/角色/边界只是 launch 参数，未形成可审阅、可测试、可扩展的 registry 或 policy。
- 真实恢复演练不够：异常退出、stale pid、paused subagent、worker 丢失后的用户路径需要生产验收。

本计划启动时确认的未知点：

- subagent worker 在真实 provider 长任务中取消/中断的最佳机制需要通过代码调查确认。
- TUI 是否适合做完整 subagent inspector，还是先以 CLI/status 为主，需要以现有组件边界判断。
- 是否需要新增 `kitty execution` 命令，还是扩展 `kitty background` 和 `kitty status` 就够，需要在实现时以职责边界确认。
- provider 侧流式事件是否能低成本进入 subagent activity，需要读取 worker/turn callbacks 后决定。

## 3. 失败测试

以下失败测试必须先落地或在计划中明确对应验证方式。

自动测试：

- background output read：启动一个持续输出的 background execution 后，工具和 CLI 能读取 tail；进程完成后仍能读取 final output。
- background list/read/wait/stop 共享同一 control-plane facts；同一个 execution id 在工具、CLI、runtime status 中状态一致。
- stale background reconcile：记录为 running 但 pid 消失时，check/status 标记 stale/failed/aborted，并保留最后输出摘要。
- subagent cancel：启动 subagent execution 后能通过工具或 CLI 取消，execution close 为 aborted/cancelled，wake fact 可供 lead 恢复判断。
- subagent deadline pause：超时后状态为 paused，wake fact 包含 objective、boundary、expectedOutput、summary/output。
- lead wait policy：blocking/nonblocking 完全由 waitPolicy 决定，新增命令不回退到 kind/tool-name 判断。
- execution inspector：active/recent execution 在 runtime status、CLI JSON、text presenter 中包含 kind、status、summary、lastOutput、deadline、nextAction。
- internal wake hygiene：background/subagent wake 不污染 user visible session memory，不被当成用户新意图。
- delegated closeout：一个 subagent exact expected output 时，host 可以直接收口；多个或非 exact 时进入 lead synthesis。
- behavior eval：简单直接编辑任务不应派 subagent；需要长命令时应 background；需要独立研究时可以 subagent；有依赖任务不应无共享计划并行。

CLI/产品演练：

- `kitty background` 能列出、读输出、等待、停止 background。
- `kitty status --json` 能看到 active background/subagent execution 和 wake facts。
- 新增或扩展的 execution 审阅入口能用 id 查询单个 execution 的 full/tail output。
- subagent 长任务运行时，CLI/TUI 当前输出流切到 subagent，实时显示其工具、思考和回答；完成后切回 lead。
- 中断 Kitty 进程后重新启动，control-plane reconcile 后不会把已死 execution 展示成健康 running。

真实生产验收：

- 跑一个真实 background 长命令：持续输出、读 tail、等待完成、确认输出保留。
- 跑一个真实 subagent 研究任务：独立读取文件、返回结构化结论、lead 综合回答。
- 跑一个真实 subagent 取消任务：启动后取消，lead 不误报完成。
- 跑一个真实并行场景：只有独立任务或共享计划后并行；结果能审阅并收束。
- 跑一次 `kitty eval --run-local` 和 `kitty eval --run-production`，background/subagent 场景至少在 local 机器可验证层有覆盖。

## 4. 目标

最终交付结果：

- spec 更新：background/subagent production lifecycle、execution 原语、行为边界、验收入口写入当前事实主干。
- execution 核心能力：统一 load/list/inspect/read output/close/cancel/reconcile 的职责清晰，background 和 subagent 复用同一事实结构。
- background 生产能力：run/check/read/wait/stop/terminate 在工具和 CLI 中可用，输出读取支持 summary/tail/full，完成后输出仍保留。
- subagent 生产能力：launch/check/read/cancel/wait 或等价入口可用，blocking wait、deadline pause、cancel wake、worker closeout 可审阅。
- runtime status/TUI：active/recent execution 的状态、摘要、最后输出、风险、下一步动作清楚呈现，不另建状态源。
- behavior eval：防过度委派、background output、顺序/并行边界有测试或 eval 保护。
- 真实恢复：stale pid、worker 丢失、deadline pause、用户取消都有测试或演练证据。
- 文档同步：README/spec/必要 history 记录当前事实，不出现旧 team 或不存在入口。
- 完整验证：相关局部测试、`npm.cmd run test:eval`、`npm.cmd run verify` 通过。

完成判定：

- 所有失败测试转绿或有明确无法自动化的手动证据。
- `plan.md` 收口列出改动文件、验证命令、真实演练路径、剩余风险。
- 没有“后续再补同一主链路”的尾巴。若发现必须延期的能力，必须降级为不属于本次生产定义，而不是留 TODO。

## 5. 不做范围

- 不恢复旧 team 概念、旧 teammate 数据结构、旧 message bus、旧 request store。
- 不引入组织角色叙事。actorName/actorRole 只作为 execution 审阅事实，不成为 team 系统。
- 不做远程多机 worker。
- 不做企业权限审批主线。
- 不做旧数据库迁移兼容；当前没有的历史能力不写进产品主干。
- 不把模型行为规则只写成 prompt 口号；必须有 eval 或产品事实保护。
- 不把 background 和 subagent 做成两套状态系统。
- 不为了 UI 完整而阻塞生产主链路；CLI/status/control-plane 优先，TUI 跟随同一 runtime facts。

## 6. 设计

### 6.1 主链路

background 主链路：

1. lead 判断某个本地命令应非阻塞执行。
2. `background_run` 创建 `kind=background`、`waitPolicy.lead=none` 的 execution。
3. process 启动后写入 pid、status、deadline、running output、summary、lastOutputAt。
4. 用户或 lead 用 check/read/wait/stop 查看或控制同一 execution。
5. 进程完成、失败、timeout、stop 后 close execution，发布 wake signal。
6. status/TUI/CLI 从 control-plane 投影当前事实。

subagent 主链路：

1. lead 判断任务需要独立上下文隔离。
2. `subagent_launch` 创建 `kind=subagent`、默认 blocking waitPolicy 的 execution，保存 objective、boundary、expectedOutput、prompt、actor facts。
3. worker 以独立 host session 执行任务，过程把 runtime UI event 写入自身 session events，供 lead wait 主进程复放。
4. lead 当前轮 yield，host lifecycle 等待 blocking execution。
5. host 等待期间轮询 blocking execution 的 session events，把 subagent runtime UI event 复放到当前 callbacks；用户看到当前流切到 subagent。
6. execution completed/failed/paused/cancelled 后发布 wake fact。
7. host 用 wake facts 恢复 lead；exact output 可直接 closeout，否则 lead synthesis；输出流切回 lead。
8. 用户仍可通过 status/CLI/TUI 审阅 subagent 状态和结果，但这不是实时可见性的主路径。

统一 execution 审阅链路：

1. 所有 execution 的事实只从 control-plane 读取。
2. runtime status 构建 active/recent/scene projection。
3. CLI text/JSON 和 TUI dock 只呈现 projection，不维护第二状态。
4. 工具结果给模型的投影保持短摘要，full output 通过 read/inspect 显式获取，避免上下文爆炸。

### 6.2 模块边界

- `src/control/*`：只负责 SQLite row、ledger、持久事实，不判断语义。
- `src/execution/*`：负责 execution lifecycle 操作、reconcile、wait、read output、summary、cancel/terminate 语义。
- `src/extensions/tools/background/*`：background 工具薄封装，只接 agent tool schema 和 execution API。
- `src/extensions/tools/subagent/*`：subagent 工具薄封装，只接 agent tool schema 和 subagent execution API。
- `src/subagent/*`：负责 worker launch/session 边界，不拥有 CLI/status 呈现。
- `src/runtime/*`：负责 scene/status projection，不落盘，不替模型决策。
- `src/cli/commands/*`：负责用户审阅和控制入口，不复制 lifecycle 逻辑。
- `src/shell/tui/*`：负责 runtime dock 和 transcript 呈现，不维护 execution 状态。
- `tests/evaluation/*`：负责行为验收，不替代 unit/integration tests。
- `spec/`：当前事实主干，必须和代码/测试一致。

### 6.3 状态归属

control-plane execution 必须保存或可投影：

- id、kind、status、requestedBy、sessionId、cwd。
- assignment：objective、boundary、expectedOutput。
- command 或 prompt。
- actorName、actorRole。
- pid。
- waitPolicy、timeoutMs、deadlineAt。
- output、summary、lastOutputAt。
- exitCode、error、closeReason、terminatedBy。
- changedPaths。
- createdAt、startedAt、closedAt、updatedAt。

不落盘为事实：

- status scene 的风险文案。
- CLI/TUI 装饰文本。
- 模型推测的下一步，除非由 task lifecycle 或 execution 明确记录。

### 6.4 输出策略

- tool result 默认返回短摘要、id、status、tail，不把 full output 自动塞回模型。
- `background_read` / `subagent_read` / `execution read` 提供 tail/full/summary 模式。
- status text 展示 summary 和 lastOutput 的短截断。
- JSON 输出保留结构化字段，便于测试和后续 UI。
- full output 保存在 control-plane 或现有 execution output 字段；若输出过大，必须有明确截断策略和可审阅 artifact，不默默丢事实。

### 6.5 中断和恢复

- background stop/terminate 操作 process，close execution，并发布 wake。
- subagent cancel/interrupt 操作 worker process 或 session abort，close execution，并发布 wake。
- deadline pause 不等于失败；lead 恢复后判断继续等待、取消、重派或收束。
- 启动和 check/status 时 reconcile running execution：pid 不存在则标记 stale/failed/aborted，并保留最后事实。
- worker 进程丢失必须成为 execution 事实，不能只在终端报错。

### 6.6 行为边界

- background 用于长时间本地命令、服务、watch、测试矩阵、持续输出任务。
- subagent 用于独立上下文研究、跨文件调查、可并行的独立子任务、需要隔离上下文的验证。
- lead 直接做简单、局部、明确的编辑和读取任务。
- 任务有依赖时顺序执行。
- 并行只在任务独立，或已有共享计划且边界清楚时使用。
- 这些规则进入 eval/测试和 extension descriptions，不只写 prompt 口号。

### 6.7 外部参考取舍

- 参考 Codex：subagent lifecycle notification、wait/interrupt、child context、stop hook 的边界。
- 参考 Gemini：subagent/background 行为 eval，尤其防过度委派和 output read。
- 参考 opencode：subagent inspector、background job service、permission 派生的结构思想。
- 参考 Goose：顺序/并行编排经验。
- 不照搬：Codex 重 multi-agent 工具组、opencode 权限主线、Gemini specialist registry 的完整产品面、Goose team-like 叙事。

## 7. 实施任务

- [x] 重新读取 `spec/用户审阅/系统核心/核心地图.md`、相关宪法原则、`history.md` background/subagent/team 段落，确认当前事实边界。
- [x] 读取 `src/control`、`src/execution`、`src/extensions/tools/background`、`src/extensions/tools/subagent`、`src/subagent`、`src/host`、`src/runtime`、`src/cli`、`src/shell/tui` 的主链路文件，记录具体改动点。
- [x] 读取 Gemini/opencode/Goose/Codex 参考文件中与 background/subagent 直接相关的实现和 eval，不引入无关架构。
- [x] 更新 `spec/用户审阅/系统核心/核心地图.md`，写明 production background/subagent lifecycle、统一 execution 审阅和行为边界。
- [x] 如有必要，新增或更新更细 spec 文件，限定为当前产品事实，不写旧 team。
- [x] 先写失败测试：background output read/tail/full、完成后输出保留、CLI JSON/text 一致。
- [x] 先写失败测试：subagent cancel/interrupt、deadline pause wake、worker lost/reconcile。
- [x] 先写失败测试：lead 阻塞等待 subagent 时，当前输出流实时显示 subagent runtime UI event，并在 wake 后切回 lead。
- [x] 先写失败测试：runtime status execution inspector 字段完整，TUI dock 从 runtime facts 投影。
- [x] 先写失败测试：behavior eval 覆盖直接任务不派工、长命令用 background、独立研究用 subagent、依赖任务顺序、共享计划后并行。
- [x] 在 `src/execution` 增加或整理统一 execution read/inspect/cancel/reconcile API，保持 control-plane 为唯一事实源。
- [x] 扩展 background execution API，支持 output read 的 summary/tail/full 模式和明确截断策略。
- [x] 增加 background tool 或扩展现有 check/wait，确保 agent 能显式读取 output，不靠 wait/check 偶然带出。
- [x] 扩展 `kitty background`，支持 list/read/wait/stop 的 text 和 JSON 路径，或明确迁移到统一 execution CLI。
- [x] 为 subagent 增加 cancel/stop/read/check/wait 中缺失的生产入口，命名和职责与 background 对齐。
- [x] 为 subagent worker 增加取消/中断/进程丢失后的 execution close 和 wake 事实。
- [x] 为 subagent worker 增加 runtime UI event 记录，并让 host lead-wait 复放到当前 display。
- [x] 确保 lead wait deadline pause、cancelled、failed、completed 都能构建清晰 wake facts。
- [x] 扩展 runtime execution summary，包含 lastOutput、deadline、risk、nextAction、actor、assignment expected output。
- [x] 扩展 `kitty status --json` 和 text presenter，确保 active/recent execution 可审阅。
- [x] 扩展 TUI runtime dock，只从 runtime status/session tool facts 呈现 execution，不维护第二套状态。
- [x] 更新 tool result projection，模型默认看到短摘要和 id，需要 full output 时用 read 工具。
- [x] 更新 evaluation harness，加入 background/subagent local machine-verifiable checks。
- [x] 更新 README 或相关用户文档，说明 background/subagent 当前入口和审阅路径。
- [x] 删除或避免任何 team/legacy/旧能力措辞进入当前产品主干。
- [x] 跑局部测试：control、execution、background tools、subagent tools、host lead wait、runtime status、CLI、TUI 相关测试。
- [x] 跑 evaluation tests：`npm.cmd run test:eval`。
- [x] build dist，跑 `kitty eval --run-local`。
- [x] 在隔离真实工作区跑 background 长命令演练：run、read tail、status、wait、read final output。
- [x] 在隔离真实工作区跑 subagent 真实任务演练：launch、status、完成、lead synthesis。
- [x] 在隔离真实工作区跑 subagent cancel 演练：launch、cancel、wake、status。
- [x] 在隔离真实工作区跑异常恢复演练：模拟 pid/worker 丢失后 check/status reconcile。
- [x] 跑 `npm.cmd run verify`。
- [x] 更新 `plan.md` 收口，列出完成事实、验证命令、真实演练路径、剩余风险。

## 8. 验证计划

局部自动测试：

```bash
npm.cmd run test:build
node --test .test-build/tests/control/control-plane-ledger.test.js
node --test .test-build/tests/execution/background-lifecycle.test.js
node --test .test-build/tests/execution/agent-execution-lifecycle.test.js
node --test .test-build/tests/extensions/background-tools.test.js
node --test .test-build/tests/extensions/subagent-tools.test.js
node --test .test-build/tests/host/lead-wait-lifecycle.test.js
node --test .test-build/tests/runtime/*.test.js
node --test .test-build/tests/cli/program.test.js
```

Evaluation 验证：

```bash
npm.cmd run test:eval
npm.cmd run build
node dist/cli.js eval --run-local
```

完整验证：

```bash
npm.cmd run verify
```

CLI 手动验收：

```bash
node dist/cli.js status --json
node dist/cli.js background
node dist/cli.js background read <execution-id>
node dist/cli.js background wait <execution-id>
node dist/cli.js background stop <execution-id>
```

如果实现统一 execution CLI，则还必须验证：

```bash
node dist/cli.js execution list --json
node dist/cli.js execution inspect <execution-id> --json
node dist/cli.js execution read <execution-id> --mode tail --tail 80
node dist/cli.js execution cancel <execution-id>
```

真实 background 演练：

- 在隔离工作区启动每 1 秒输出一行的命令。
- 启动后立即 status，必须看到 running execution。
- read tail，必须看到已产生输出。
- wait 完成，必须看到 completed 和 exitCode。
- 完成后 read full，必须能看到完整或明确截断的输出。

真实 subagent 演练：

- 派 subagent 调查隔离项目中的 3 个文件并返回结构化结论。
- lead 必须 yield 并在 wake 后综合结果。
- status 必须能看到 subagent active/recent 事实。
- output/summary 必须可通过 CLI 或 status 审阅。

真实取消/恢复演练：

- 启动长 subagent 后取消。
- status 显示 aborted/cancelled，不误报 completed。
- wake fact 让 lead 能说明取消事实。
- 模拟 background pid 丢失后 check/status reconcile，不展示健康 running。

文档检查：

- `spec/`、README、CLI help、tool descriptions 与当前能力一致。
- 不出现旧 team/teammate/message bus 当前产品入口。
- 行为边界有测试或 eval 支撑。

未验证内容处理：

- 如果某项无法自动化，必须在收口给出具体手动命令、工作区路径、execution id、观察结果。
- 如果发现无法一次完成的能力，必须重新判断是否属于本次 production 定义；属于则继续做完，不属于则从目标中删除并说明为什么不属于当前生产闭环。

## 9. 收口

状态：完成。

目标完成：

- background 和 subagent 复用统一 execution/control-plane lifecycle；新增 read/cancel/inspect/status/TUI/eval 路径已接入当前主干。
- lead 因阻塞型 subagent 暂停时，当前输出流会显示 `[子代理]` 的 reasoning、工具和回答，settled 后切回 `[决策主脑]`。
- 取消/停止使用跨平台进程树终止：Windows 使用 `taskkill /T /F`；POSIX 使用进程组信号、`pgrep -P` 子孙 pid 兜底和 SIGKILL 升级。
- 外部取消 race 已修复：lead wait 终态成立时重新读取 execution，wake facts 不再使用旧 running 快照。
- 行为边界进入 eval：直接任务由 lead 做、长命令用 background、独立上下文任务用 subagent、依赖任务必须先有共享计划。

主要改动文件：

- execution/control-plane：`src/execution/background.ts`、`src/execution/lifecycle.ts`、`src/execution/leadWait.ts`、`src/execution/process.ts`、`src/execution/worker.ts`。
- 工具和 CLI：`src/extensions/tools/background/*`、`src/extensions/tools/subagent/*`、`src/cli/commands/background.ts`、`src/cli/commands/execution.ts`、`src/cli/program.ts`。
- runtime/TUI：`src/runtime/status.ts`、`src/runtime/scene.ts`、`src/runtime-ui/*`、`src/shell/tui/*`。
- eval/tests：`src/evaluation/*`、`tests/execution/process-lifecycle.test.ts`、`tests/host/lead-wait-lifecycle.test.ts`、`tests/extensions/*`、`tests/cli/program.test.ts`、`tests/shell/*`。
- 文档/spec：`README.md`、`spec/用户审阅/系统核心/核心地图.md`、`spec/用户审阅/T03-工具与扩展/02-Extension集合.md`、`spec/技术实现/T03-工具与扩展/03-Extension工具清单.md`、`plan.md`。

真实演练：

- 隔离工作区：`C:\Users\ADMINI~1\AppData\Local\Temp\kitty-bg-subagent-prod-20260709-111522`。
- background：`cmd /c bg-task.cmd`，execution `exec-mrcxpnpr-4yu90yfz`，最终 `completed`，full output 为 `bg-line-1` 到 `bg-line-5`。第一次模型猜 id 失败，随后通过 `background_check` 自恢复并读到真实 id。
- subagent 实时流：execution `exec-mrcxr0kb-inibobc9`，终端显示 `[决策主脑]` yield、`[子代理]` 读取 `note1.txt`/`note2.txt`/`note3.txt` 并输出 `{"alpha":"api","beta":"worker","gamma":"lead"}`，随后切回 `[决策主脑]`。
- subagent cancel 第一次暴露 wake race：账本为 `aborted`，lead 仍按旧 running 快照回答。已修 `waitForLeadWaitExecutions` 并加回归测试。
- subagent cancel 复测：execution `exec-mrcxvtdo-7t3k205x`，`execution cancel` 后状态 `aborted`、`terminatedBy=cli`，lead 最终回答 `Subagent execution cancelled by host lifecycle.`。进程检查：pid `46100` 不存在，`long-task.cmd`/`ping` 命令树无残留。
- 异常恢复：第一次取消演练中 subagent 内部 background `exec-mrcxsjis-8l7lvb6y` 被 reconcile 为 `stale`；eval `recovery-drills-pass` 也覆盖 stale、paused、terminated。

已运行验证：

- `npm.cmd run test:build`：通过。
- `node --test .test-build/tests/host/lead-wait-lifecycle.test.js .test-build/tests/execution/process-lifecycle.test.js .test-build/tests/extensions/subagent-tools.test.js`：通过；Windows 进程树测试真实执行，POSIX 进程树测试在 Windows 跳过。
- `npm.cmd run test:eval`：通过，11 个 eval tests passed。
- `npm.cmd run build`：通过。
- `node dist/cli.js eval --run-local`：通过。
- `npm.cmd run verify`：通过，272 个 core tests passed，1 个 POSIX 平台测试按平台跳过。
- `node dist/cli.js doctor`：通过，YLS `gpt-5.5` Responses probe ok。
- `node dist/cli.js eval --run-production`：通过，production config/provider/real turn/tool turn/runtime status 全部 passed。

未验证内容：

- Linux/macOS 没有本机实测。POSIX 实现按 Gemini CLI 的成熟边界落地，测试文件已覆盖但在当前 Windows 环境按平台跳过。

剩余风险：

- 真实 background 演练中模型第一次没有使用 `background_run` 的返回 id，而是猜了 id；它可通过 `background_check` 自恢复。当前未把这定为阻断，因为 lifecycle 和读取路径正确，但后续可以考虑让 background_run 的模型投影更硬。
- 不 commit / 不 push；用户未要求。
