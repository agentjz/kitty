# T08 TUI 与 Runtime UI

TUI 和 Web 都是壳。它们不拥有第二套 agent 状态，只呈现 session、event、runtime status 和 turn display 的同一事实。

## 当前模块边界

- `src/shell/tui/`：Ink TUI 壳。负责 session picker、transcript、composer、runtime dock、键盘鼠标输入和清理生命周期。
- `src/runtime-ui/`：跨宿主复用的运行时展示事实。负责 todo、工具状态、turn display 的文本投影。
- `src/host/`：所有宿主进入 agent 的共同 turn 边界。
- `src/session/`：对话和事件事实。
- `src/runtime/status.ts` / `src/runtime/scene.ts`：当前现场事实。
- `src/web/`：Web 壳，复用 host 主链路和 runtime events。

## TUI 职责

TUI 负责：

- 启动时选择 session 或新建 session。
- 展示用户、assistant、reasoning、tool fact。
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

底部现场只展示当前正在发生的事：

- 当前工具或命令原文。
- background / subagent 是否在跑。
- context 占用。
- 总结中、标题生成中等 turn lifecycle 状态。

没有事实时不制造假状态；需要稳定布局时可以显示短的空闲行。

## 验收

- `tests/tui/*.test.ts`
- `tests/web/*.test.ts`
- `tests/host/*.test.ts`
- 交互手动验收：长 markdown、长工具输出、窗口 resize、滚动、中文输入、Ctrl+C。
