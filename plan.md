# Kitty Production TUI Lifecycle Plan

## 1. 需求文档

Kitty 的 TUI 必须把运行中的新输入理解为对当前任务的引导。用户在模型等待、流式回复或工具执行期间提交文本后，文本应立即被可靠接收，在当前 turn 的下一个模型请求中作为新的用户约束出现；它不能中断当前动作、并发启动另一个 turn、等当前 turn 结束后排队，也不能丢失。`Ctrl+C` 是唯一明确的当前 turn 中断操作。

长输出仍在增长时，用户必须能脱离底部阅读历史，并用鼠标跨页选择和复制已渲染文本。新输出、状态变化和窗口缩放不能把阅读位置拉回底部，也不能破坏选择。

范围包含 durable steer、host/agent turn 生命周期、交互驱动、TUI 状态呈现、滚动锚点、鼠标选择、自动滚动、剪贴板、TUI presentation locale、故障恢复、测试、`spec.md` 和 README 当前事实同步。已有 slash command、composer、历史、草稿和 overlay 能力必须继续工作。

业务完成标准：一个活跃 turn 只存在一个执行 owner；运行中提交的所有 steer 按接收顺序进入这个 owner，并在下一次可用的模型边界消费；即使上一响应看似已经完成，只要存在未消费 steer，当前 turn 就继续。用户能在持续输出时稳定滚动、跨页选择并复制。中断、强杀和重启后，不出现吞消息、重复执行或把 steer 伪装成新 turn。

## 2. 当前事实

- `turn_steers` 已在 SQLite 中持有同一 turn 的递增 steer、确定 message ID 和 `pending/consumed/rejected` 状态。
- `runAgentTurn()` 在每次 context 构建前消费 steer，并在 final closing 事务边界再次检查；final 同时到达 steer 时保存当前 assistant 输出并继续同一 turn。
- `TurnLedgerRepo.claim()` 保证同一 session 只有一个有效 execution owner。运行中的普通输入写入 active turn steer，不创建第二个执行 owner。
- `Ctrl+C` 显式 abort 当前 turn 并拒绝未消费 steer；中断清理窗口的新输入进入下一 durable turn，不再挂到即将 aborted 的 owner。
- 终端 EOF/关闭属于 recoverable detach：本地执行停止，active turn 回到 queued，pending steer 保持 pending；强杀则由 lease expiry 完成同一 turn 恢复。
- Codex 当前实现把新用户输入放入 active turn 的 pending input，由 agent loop 在后续模型请求前 drain；pending input 会强制继续当前 turn，interrupt 独立 abort task。这是参考事实，不是需要照抄的数据结构。
- TUI 的 composer、overlay、历史与 SQLite 草稿由 controller/store 持有。命令、历史、帮助和编辑器路径已有行为测试。
- Transcript 使用 `follow/detached`、稳定 row anchor 和 unseen row count；流式追加与 resize 不把 detached 阅读位置拉回底部。
- Input gateway 解析 SGR/X10 mouse press、drag、release 和 wheel，鼠标序列不会进入 composer 键盘流。
- Selection owner 使用渲染 row ID 与字符列，支持宽字符、跨行文本、边缘自动滚动和字符级高亮；`Ctrl+C` 有选择时复制，无选择时中断。
- Clipboard 优先使用平台 native provider，失败后在 TTY 使用 OSC52；复制失败保留选择并显示可恢复错误。
- `KITTY_LOCALE` 已接入 runtime config、项目模板、session picker、TUI chrome、command/help、CLI/doctor/status/runtime UI 与 Telegram presentation；英文 schema 冻结 421 个 typed key，十二份 catalog 的 key 与占位符集合完全一致，运行时没有语言 fallback。Locale 只影响 presentation，不进入 prompt 或 control-plane。
- `.kitty/control-plane.sqlite` 仍是运行时事实主干，使用 WAL、`synchronous=FULL`、busy timeout 和外键；没有新增 JSON 状态源。
- Composer 已收敛为单一动态 frame；Ink adapter 统一下移一行到真实文本基线。Input gateway 可跨 chunk 保留 UTF-8/IME 与鼠标 framing，并把 EOF/close 投递给 controller。
- 核心测试 runner 使用仓库内 `.test-tmp` 作为子进程临时根，每个临时 workspace 建立独立 Git 项目发现边界，并在成功、失败或 spawn error 后清理 `.test-build` 与 `.test-tmp`。
- 统一 `run-tests.mjs` 已运行完整核心测试：339 项，338 通过、0 失败、1 项 POSIX-only 在 Windows 跳过；runner 正常返回并清理 `.test-build` 与 `.test-tmp`。
- `npm.cmd run test:eval` 通过 11/11；重新构建 production bundle 后，`npm.cmd run eval:local` 的 14 个本地产品验收全部通过。Eval 已删除 Web 旧事实，并从结构化 status/Telegram attachment 事实验收，不再匹配本地化展示字符串。
- Node 22 runtime contract 与 Ink optional devtools external 已写入当前构建配置。CLI CJS、TUI ESM production bundle、CLI version 与 TUI import smoke 均通过；先前 esbuild Access denied 在当前最终验证中未复现，没有替换 tsup 或降低构建语义。

## 3. 失败测试

1. provider 等待期间提交文本会创建第二个 `session_turns`：目标是只存在一个 running turn，新输入成为该 turn 的 pending steer。
2. 工具执行期间连续提交两条输入：目标是工具不中断，两条 steer 按接收顺序进入工具后的下一次模型请求。
3. 模型返回 final 的同时收到 steer：目标是 final 不结束 active turn，steer 持久化并触发同 turn 的后续模型请求。
4. steer 被接收后进程在消费前崩溃：目标是 steer 保持 pending；恢复时不把它伪装成新 turn，也不静默丢弃。
5. steer 消费后进程崩溃：目标是消费与 session user message 落账保持原子边界，不重复插入同一 steer。
6. `Ctrl+C` 时存在 pending steer：目标是中断当前 turn，不把 steer 启动为新 turn；持久记录明确标记未执行原因。
7. 无 active turn 时提交：目标是正常创建一个新 turn，不错误写入 steer 表。
8. 内部 wake/delegated closeout：目标是保持 host 内部生命周期，不把内部 fact 当用户 steer。
9. 用户滚离底部后 provider 持续追加：目标是可见历史锚点不动，并显示新内容提示。
10. 流式输出和工具状态更新期间 PageUp/PageDown、滚轮仍可操作，且回到底部后恢复 follow 模式。
11. 鼠标从 viewport 中部拖到顶部并继续：目标是自动向上滚动、扩大选择并保持文本顺序。
12. 有选择时按 `Ctrl+C`：目标是复制选择且不 abort；无选择时按 `Ctrl+C` 才 abort。
13. 剪贴板系统 fallback 失败：目标是保留选择并显示可恢复错误，不让输入或 turn 状态损坏。
14. 窗口缩放、overlay 打开/关闭和流式追加：目标是阅读锚点与选择尽可能稳定，组件不重叠。
15. 中文 IME 提交的 UTF-8 字节跨 stdin chunk：目标是 composer 收到完整字符，不出现替换字符或丢字。
16. stdin EOF/close：目标是关闭当前输入等待并进入既有 detach/恢复边界，不让 TUI 永久挂起。
17. 核心测试在受限系统临时目录运行命令：目标是 runner 提供仓库内可写且与 Kitty 根项目隔离的临时根，子进程测试不因 cwd 权限或父项目 skill 泄漏而失败。
18. Windows 进程树终止失败：目标是测试必须在有界时间内报告失败且不挂住 runner；`taskkill /T` 部分失败后仍要收束 root，并继续验证 descendant 已终止。
19. TUI production bundle：目标是 Ink 的 optional devtools peer 保持可选且可被 bundler 解析；Kitty 宣称的 Node engine 与 Ink 7 的真实最低版本一致。
20. 任一已注册 locale 缺少 key、占位符与英文 schema 不一致或通过英文 fallback 补齐：目标是构建或测试直接失败，不向用户混合语言。
21. 使用 `zh-TW`、`es`、`pt-BR`、`fr`、`de`、`ru`、`ar`、`hi` 启动 CLI/TUI/Telegram presenter：目标是配置被接受，关键帮助、诊断、状态和交互提示来自对应完整 catalog。
22. README 快速路径与当前 Node、locale、host、构建和测试事实不一致：目标是首次用户只按文档即可安装、初始化、配置、启动和排错。
23. `/copy` 不能把对话全文回显到聊天区，也不能依赖交互驱动可能落后的内存快照；必须从当前 session 的持久账本导出外部 user、assistant reasoning 和 assistant reply，并只在聊天区报告文件路径。
24. 仓库开发 skill 统一位于 `.agents/skills/`；`AGENTS.md`、skill 自身事实和文档不能继续指向旧开发器专用目录。

## 4. 目标

- `session_turns` 只表示真正的 host turn，不再承担 steer 缓冲。
- 新建 durable steer owner，以 turn ID 和递增顺序维护 `pending/consumed/rejected` 事实。
- host 将 steer reader 作为当前 turn 能力传给 agent；其他宿主可复用同一接口。
- agent 在每次 provider request 前消费 steer，并把它作为同一 turn 的外部 user message持久化。
- final 路径在提交完成前再次检查 pending steer，消除“最后一刻丢 steer”的竞态。
- driver 保证同一 session 只有一个运行 owner；运行中普通输入调用 steer，中断清理期间的新输入可以 durable admission 等待前一 owner 收束。
- UI 明确显示“已引导当前任务”，不用 queued/pending turn 文案混淆用户。
- transcript 以明确 follow/detached viewport 状态维护滚动，而不是从展示字符串或最后一行推断。
- TUI 自己拥有选择范围、自动滚动和复制行为；alternate screen 不依赖终端原生不可跨页的选择。
- 测试覆盖 provider wait、tool execution、final race、abort、crash recovery、stream scroll、跨页选择和 clipboard failure。
- Presentation locale 对同一命令、帮助和交互事实只改变文案，不改变 command name、状态或持久化数据。
- TUI composer 的可见文本与终端 IME 光标必须来自同一个动态布局模型；底部元信息只展示模型与上下文，不承担命令教学。

## 5. 不做范围

- 不为旧的“运行中输入创建后续 turn”行为保留兼容层或迁移入口。
- 不用系统提示词特判 steer；它是消息生命周期事实。
- 不在 provider transport 中途注入正在生成的 HTTP 请求；steer 在下一个安全模型边界生效。
- 不把本地 slash command 作为 steer；本地命令仍由 interaction owner 处理。
- 不把审美判断写成截图测试；只验证布局、可见性、焦点和交互事实。
- 不翻译 slash command 名、配置键、provider/model、文件路径、代码、日志原文和工具原始证据。
- 不执行 commit、push、发布或版本升级，除非用户再次明确授权。

## 6. 设计

### 主链路

```text
idle submit
  -> admit session turn -> claim lease -> runHostTurn -> runAgentTurn

active submit
  -> InteractiveSessionDriver.steerActiveTurn
  -> SQLite turn_steers(pending, turn_id, sequence)
  -> active runAgentTurn next safe boundary
  -> atomically append external user message + mark steer consumed
  -> build context -> next provider request in the same turn

Ctrl+C
  -> active turn AbortController -> host abort -> reject remaining pending steers
```

### Durable steer owner

`turn_steers` 持有 `id, turn_id, session_id, sequence, input, message_id, status, created_at, consumed_at, rejected_at, rejection_reason`。同一 turn 的 sequence 唯一且在事务内递增。queued/running turn 可以接收 steer；closing 或 terminal turn 拒绝新 steer。

消费采用事务边界：读取 pending steer、向 canonical session 聚合追加对应 external user message、将 steer 标记 consumed。由于 session aggregate 当前通过独立 store API 保存，若无法跨 repo 共享同一 SQLite transaction，则由幂等 steer message ID 和 CAS 重试保证“重复调用不重复消息、已落消息可补标 consumed”。不能用“先删后写”。

turn 正常完成前必须原子检查没有 pending steer。若发现 steer，agent 继续循环。turn aborted/failed 时剩余 pending steer 进入 rejected 并保留原因；它们不能自动成为下一 turn，因为那会改变用户语义。

### Agent loop

在每次 context 构建前调用 `consumePendingSteers()`，将新 session 返回给 loop。provider/tool 正在执行时只持久接收，不中断。无工具响应进入 final 前再执行一次 drain；有 steer 则先保存 assistant 响应，再追加 steer，然后继续请求。这样模型既看见已经输出的内容，也看见用户的新约束。

assistant 响应的 session 落账与 UI streaming 分开：流式文本可以已经显示，但只要 steer 在 final commit 边界前到达，turn 就继续。UI 不伪造撤回；后续模型得到完整上下文并调整。

### Host 与 driver

`runHostTurn()` 仍唯一拥有 turn lease、heartbeat、abort、tool registry 和终态。它向 `runAgentTurn()` 注入当前 turn 的 steer consumer。提交时：无 active turn 则 admit 新 turn；有未中断 active turn 则 durable steer；active turn 已收到 interrupt 时，新输入 admit 为下一 turn 并等待当前 owner 收束。

本地命令继续先解析并执行；只有 `continue` 的普通文本参与 start/steer。显式 interrupt/quit 与终端 detach 使用不同 abort reason，不能互相伪装。

### 滚动

store 明确维护 `scroll.mode = follow | detached` 与稳定 anchor。append 只在 follow 时移动到底部；detached 时保持 anchor，并增加 unseen count。滚轮、PageUp/PageDown 在 provider wait、stream、tool 状态和 overlay 状态下由同一输入 owner处理。viewport 行数变化按 anchor 重投影，不按旧 offset 盲算。

### 选择与复制

输入 gateway 解析 SGR mouse down/move/up/wheel。store 维护 transcript 文本坐标的 anchor/focus，而不是屏幕颜色或 React 节点。projection 为每个可见渲染行提供稳定 row ID 与纯文本；拖到 viewport 边缘时 controller 定时滚动并更新 focus。stream append 不改变既有 row ID。

有选择时 `Ctrl+C` 调用 clipboard owner，成功后清除高亮，失败则报告错误并保留选择；无选择时才交给 interrupt。Esc 清除选择。clipboard 先尝试平台 native provider，失败后在 TTY 使用 OSC52；输出内容来自渲染后的 transcript 行，保持换行顺序。

### Presentation locale

`KITTY_LOCALE` 接受 `zh-CN`、`zh-TW`、`en`、`ja`、`ko`、`es`、`pt-BR`、`fr`、`de`、`ru`、`ar`、`hi`，默认 `zh-CN`。`src/i18n/` 以英文 schema 冻结 typed message key，各 locale 必须显式提供完整 catalog；键集合和每个 message 的占位符集合必须完全一致，不允许运行时 fallback。TUI、session picker、CLI/doctor/status/runtime UI、local command metadata、interaction 与 Telegram 只读取 locale 后投影文本。命令名、路径、provider/model、工具证据、机器 JSON 和模型自然回复保持原文。

### Composer 与 IME 光标

Composer 内容框是可见输入文本和终端光标坐标的唯一几何 owner。Ink 完成布局后测量该内容框相对输出原点的真实位置；文本布局计算当前字符光标在内容框内的显示单元坐标，再由唯一的 Ink adapter 将容器行转换到下一行的文本基线。运行中状态、welcome 切换、overlay、换行和 resize 只会触发重新测量，不再维护独立光标行、双 frame 或从 footer 行数反推光标。

TUI input gateway 使用有状态 UTF-8 decoder 跨 chunk 还原键盘与 IME 提交，鼠标事实过滤后再交给 Ink。stdin 的 `end`、`close` 和错误必须幂等关闭 controller 输入，使 host 走既有 recoverable detach，而不是只结束一个无人观察的中间流。

核心测试 runner 为测试进程注入仓库内的专用临时根；每个测试 workspace 建立自己的项目发现边界，不能继承 Kitty 根项目事实。Node test runner 为单项测试设置有界超时；进程故障测试使用独立的已知 parent/child 清理路径，失败时必须释放句柄，不能靠强制退出掩盖泄漏。Windows 进程终止在 `taskkill /T` 非零且 root 仍存活时使用 Node 原生 kill 收束 root，行为测试仍负责证明 descendant 是否真正结束。

### 文件职责

- `control/turnSteers.ts`：durable steer 状态机与查询。
- `control/schema.ts`, `control/ledger.ts`：schema 和 repo 接线。
- `agent/turn/steering.ts`：steer 到 canonical session message 的幂等消费。
- `agent/turn/run.ts`：在模型循环安全边界协调消费与继续。
- `host/turn.ts`, `host/types.ts`：turn owner 注入和终态拒绝。
- `interaction/sessionDriver.ts`：start/steer/abort 三种用户动作仲裁。
- `shell/tui/store.ts`, `controller.ts`, `transcriptProjection.ts`：scroll/selection 事实。
- `shell/tui/input/*`, `components/Transcript.ts`：鼠标事件与展示。
- `shell/tui/clipboard.ts`：OSC52 与平台 fallback。
- `i18n/`：presentation locale、typed key、字典和插值。
- `tests/i18n/`：catalog 键/占位符完整性、无 fallback、配置切换和关键 presenter 行为。
- `README.md`, `docs/quickstart.md`：产品边界与首次用户可执行路径，不承载运行时事实。
- `session/transcriptExport.ts`：把持久 session 中面向用户的对话事实投影为 Markdown 文件；不负责命令解析或聊天区呈现。

超过 300 行按职责变化原因审查，不按行数机械拆分。

## 7. 实施任务

- [x] 写失败测试锁定 steer repo 状态机、顺序、有效 turn 校验、终态拒绝和中断清理窗口的新输入不丢失。
- [x] 建立 `turn_steers` schema/repo 并接入 control ledger。
- [x] 建立 agent steer consumer，保证 session message 幂等落账和 consumed 状态恢复。
- [x] 完成 steer drain 的 context/final 竞态边界，并用行为测试证明 final 同时到达 steer 时不会失败或丢失。
- [x] 保证单执行 owner；运行中提交走 steer，`Ctrl+C` 清理窗口的新输入进入下一 durable turn。
- [x] 更新 host 终态和 crash recovery，区分 explicit abort、terminal detach 和 lease-expiry recovery。
- [x] 更新 TUI 提交反馈和运行状态文案，删除 queued turn 语义。
- [x] 用失败测试锁定 streaming detached viewport，并建立 anchor/unseen owner。
- [x] 实现 SGR/X10 mouse selection、边缘自动滚动、稳定文本坐标和字符级高亮。
- [x] 实现 native/OSC52 clipboard；`Ctrl+C` 按 selection 优先级路由。
- [x] 建立 `KITTY_LOCALE` typed catalog，并接入 session picker、TUI chrome、slash commands、interaction 与 runtime scene。
- [x] 删除 Web host 全链路：移除 `kitty web`、`src/web/`、Web 测试、WebSocket 直接依赖和文档事实，并将远程入口 eval 收敛为 Telegram 验收。
- [x] 冻结完整 presentation message schema，让 CLI help、doctor/preflight、status presenter、host/runtime UI 与 Telegram 用户提示不得混杂未本地化固定文案。
- [x] 提供 `zh-CN`、`zh-TW`、`en`、`ja`、`ko`、`es`、`pt-BR`、`fr`、`de`、`ru`、`ar`、`hi` 十二份完整 catalog，不允许已注册语言缺 key 或回退英文。
- [x] 增加 locale 完整性、无 fallback、配置切换、非法值失败及关键 presenter 多语言行为测试。
- [x] 按核心链路复审并清理现存技术债务：terminal renderer 改为读取 typed result 状态，eval scene/Telegram 改为读取结构化事实并删除 Web 旧事实；超过 300 行文件按职责审查后未机械拆分。
- [x] 收敛 TUI footer：只展示模型和上下文，删除分隔点、斜杠命令与命令面板教学文案。
- [x] 基于 Ink 官方光标机制与参考实现重建 TUI IME 坐标链：候选窗必须跟随受控 composer 的真实终端光标，运行中输入、welcome 切换、resize、overlay 和多行换行不能依赖硬编码行列补偿。
- [x] 修复 TUI input gateway 的跨 chunk UTF-8/IME 解码、鼠标 framing 和 EOF/close 传播，并增加拆分中文、关闭幂等与鼠标过滤测试。
- [x] 重建核心测试临时根与项目隔离，保证命令、skill、bash 测试在受限环境仍使用真实子进程且不会继承仓库事实。
- [x] 硬化 Windows 进程树测试与 fallback：失败必须有界返回，成功必须同时终止 parent 和 child。
- [x] 对齐 Node 22 runtime contract，并将 Ink optional devtools 保留为 external。
- [x] 完成 CLI/TUI production bundle 与产物导入烟雾检查，未替换 tsup 或降低构建语义。
- [x] 保留根 `README.md` 的教学型产品定位、官网与徽章，并提供面向首次用户的 `docs/quickstart.md`。
- [x] 完成 `/copy` 文件导出：重新加载当前 session 的最新持久快照，按顺序保留 user、assistant reasoning 和 assistant reply，聊天区只报告导出路径。
- [x] 将 `kitty-agent-development` 与 `plan` 迁移到 `.agents/skills/`，并更新仓库中的真实路径引用和运行时隔离测试。
- [x] 同步 `spec.md` 与本计划，保证文档只描述实际交付的当前事实。
- [x] 在 `/copy`、README、文档迁移、skill 迁移和思考样式修改后重新运行定向测试、完整验证、evaluation、diff 与残留扫描。
- [x] 收口记录最新代码的实际验证、未验证项和剩余风险。

## 8. 验证计划

定向自动验证覆盖：control steer repo、agent loop、host admission、session driver、TUI store/gateway/render/selection/clipboard。

完整验证：

```powershell
npm.cmd run verify
```

最终验证事实：`npm.cmd run verify` 在最新代码上通过 typecheck、CLI/TUI production bundle 和完整 core suite；core 共 340 项，339 通过、0 失败、1 项 POSIX-only 跳过。`npm.cmd run test:eval` 通过 11/11，重新构建后的 `npm.cmd run eval:local` 通过全部 14 个本地验收。`/copy` 定向测试证明导出使用最新持久 session，并保留外部 user、assistant reasoning 和 assistant reply。`.agents/skills` 隔离测试证明开发 skill 不进入 Kitty runtime skill surface。

真实演练：

- provider 等待、流式回复和工具执行三个阶段各连续提交两条 steer，确认都进入当前 turn 的下一次请求。
- 在 final 文本即将结束时提交，确认当前 turn 继续且只生成一个 turn record。
- steer 接收后分别强杀消费前和消费后进程，重启检查 pending/consumed 事实与 session message 不丢不重。
- 有 pending steer 时按 `Ctrl+C`，确认当前 turn aborted、steer rejected、下一次输入创建正常新 turn。
- 持续生成长文本时滚到中部，使用滚轮/PageUp/PageDown 阅读并返回底部。
- 鼠标跨两页向上拖选，`Ctrl+C` 复制；无选择时 `Ctrl+C` 中断。
- 40x12、80x24、160x40 下缩放并打开 overlay，确认 viewport、选择、composer 和 footer 不重叠。

环境无法自动验证的原生终端剪贴板差异必须在收口中明确记录，不能假装已验证。

## 9. 收口

目标已完成。Durable steer、TUI 滚动/选择/复制/草稿/overlay、IME 输入网关、测试隔离、Windows 进程 fallback、421-key presentation schema、十二份无 fallback catalog、CLI/TUI/Telegram presenter、README/quickstart、文档迁移、开发 skill 迁移、思考样式和 `/copy` 已接入同一当前事实。

真实 production PTY 验证了首屏、中文宽字符输入、overlay 打开/关闭、多行输入和正常 cleanup：可见中文与终端光标稳定落在同一行，四个中文字符按八个显示单元推进；多行重绘后光标落在第二行文本基线。自动测试覆盖 resize、overlay row budget、selection、clipboard fallback、stdin close 与跨 chunk UTF-8/mouse framing。

未验证与剩余风险：当前工具不能驱动 Windows 原生 IME 候选窗，也不能拖动 ConPTY 改变真实窗口尺寸；候选窗视觉位置、人工拖窗和 native clipboard 仍需人在本机观察。POSIX 进程树测试在 Windows 按条件跳过。`eval:production` 需要当前项目完整 `.kitty/.env` 和真实 provider 额度，本轮未擅自调用。没有 commit、push 或发布请求，也未执行这些操作。
