# T08 TUI 与 Runtime UI

TUI 和 Web 都是壳。它们不拥有第二套 agent 状态，只呈现 session、event、runtime status 和 turn display 的同一事实。

`kitty` 裸启动默认进入 TUI。`kitty tui` 是同一入口的显式命令，`kitty agent` 保留文字版交互。

## 当前模块边界

- `src/shell/tui/`：Ink TUI 壳。负责 session picker、transcript、composer、runtime dock、键盘鼠标输入和清理生命周期。
- `src/cli/commands/tuiMode.ts`：TUI 启动边界。`kitty` 和 `kitty tui` 共用它，不各自复制启动逻辑。
- `src/runtime-ui/`：跨宿主复用的运行时展示事实。负责 todo、工具状态、turn display 的文本投影。
- `src/host/`：所有宿主进入 agent 的共同 turn 边界。
- `src/session/`：对话和事件事实。
- `src/runtime/status.ts`：读取结构化运行事实。
- `src/runtime/scene.ts`：统一自然现场投影。CLI、TUI 和未来 UI 读取它，不各自重算 execution、memory、skill、cost 的语义。
- `src/observability/terminalLog.ts`：terminal log 投影。它记录用户提交、assistant/reasoning 可读块、status、tool call/result/error 边界；fallback 渲染必须携带工具参数，不能把 `read/edit/write` 这类工具退化成 `(missing path)`。
- `src/web/`：Web 壳，复用 host 主链路和 runtime events。

## TUI 职责

TUI 负责：

- 启动时选择 session 或新建 session。
- 展示用户、assistant、reasoning、tool fact。
- 把 terminal log 写成可审阅现场，而不是一字符一字符的 stream delta。
- 处理滚动、resize、输入、鼠标滚轮。
- 显示当前后台、subagent、context、工具运行现场。
- 在退出和中断时释放输入、渲染和 turn 生命周期资源。

TUI 不负责：

- 判断任务目标。
- 维护第二套 execution 状态。
- 语义总结历史。
- 直接操作 provider。

## 渲染边界

Transcript layout 统一处理 wrapping、markdown display facts、宽字符、底部贴合和滚动窗口。Composer layout 统一处理输入框显示行、光标坐标和中文宽度。

不要在组件里各自计算一套宽度和滚动，否则会复发光标错位和长回复显示不全。

## Runtime Dock

底部现场只展示当前正在发生的事。它不新建 execution 状态，只把 runtime-ui event、session event 和 runtime status 投影成 TUI activity。

- 当前 activity：工具、命令、subagent、后台等待或模型状态。
- 当前 activity 的状态、运行时长、是否阻塞 lead。
- background / subagent 是否在跑。
- context 占用。
- 总结中、标题生成中等 turn lifecycle 状态。

中文化只用于少量状态提醒，例如“正在运行”“已运行”“失败”“空闲”“阻塞 lead”。命令、路径、工具名、execution id 保持原文，不翻译。没有 activity 时底栏仍保持两行信息结构。

没有事实时不制造 background/subagent 假状态；需要稳定布局时显示短的 idle 行。运行时长和 running spinner 只在 TUI 组件内按 activity startedAt 或本地 animation frame 派生，不写回 session、control-plane 或 controller 状态。idle 和 waiting 不做点状 pulse 动画。

subagent 阻塞 lead 时，当前输出流必须切到 subagent channel，显示 subagent 的工具、思考和回答；subagent settled 后再切回 lead。旁路 status/CLI 审阅不能替代这个实时可见性。

空 transcript 保持空白第一屏，不显示欢迎文案或快捷键教程；已有 session 继续走 session picker。用户发送后的 transcript 消息保持紧凑，不使用整行深色背景铺满正文宽度。

## 验收

- `tests/tui/*.test.ts`
- `tests/web/*.test.ts`
- `tests/host/*.test.ts`
- 交互手动验收：长 markdown、长工具输出、窗口 resize、滚动、中文输入、Ctrl+C。
