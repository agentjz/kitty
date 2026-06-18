# Ink TUI Plan

## 1. 需求文档

用户要的不是“多一个界面”，而是一个真正可长期使用的终端工作台。

这个 TUI 要像 `tui-prototype.html` 和 OpenCode 截图表达的方向：主区域只承载人真正关心的对话内容，底部固定承载输入框和运行现场。用户不应该被工具账本、内部事件、数据库摘要淹没。

### 用户视角

启动体验：

- 用户运行 `kitty tui` 进入 TUI。
- 未来可以考虑让 `kitty` 默认进入 TUI，但本轮先保留现有 CLI 行为，新增明确入口，避免破坏当前稳定交互。
- 进入后直接看到当前 session 的最近对话；没有 session 时显示空白对话和可输入状态。
- TUI 不做欢迎页，不做营销页，不做纵向分割面板。

主对话区：

- 只显示用户输入、模型思考、模型回复。
- 用户输入以左侧蓝色竖线高亮，像截图里的块状用户消息。
- thinking 以弱化、斜体感、低亮度方式显示，但仍然在主区可读。
- assistant 回复正常显示，支持长文本换行。
- 工具调用、工具结果、后台细节、subagent 状态不灌进主对话区。

滚动体验：

- 主对话必须可滚动。
- `PageUp` / `PageDown` 能按页滚动。
- `Home` / `End` 能跳到顶部 / 底部。
- 新内容追加时，如果用户已经在底部，自动跟随到底部。
- 如果用户正在看历史，新内容不能强行把视图拉到底；底部要有“有新内容”的状态提示。
- 鼠标滚轮必须能滚动主对话区。
- Windows Terminal、普通终端、VS Code terminal 至少要做真实手动验收；鼠标滚动不可只靠想象。

底部输入区：

- 输入框固定在底部。
- `Enter` 发送。
- `Ctrl+J` 插入换行，输入框高度随内容增长但有上限。
- `Ctrl+C` 在模型运行中中断当前 turn；空闲时不误退出，遵循现有 exit guard。
- 本轮不做复杂命令面板，但 `/help`、`/status`、`/background` 等已有 slash commands 必须能在 TUI 输入框里执行。

底部现场区：

- 只显示用户真实关心的运行现场：
  - 后台任务：空闲、运行中、卡住、完成、失败。
  - subagent：空闲、运行中、等待、完成、失败。
  - 上下文占用：当前已用、预算、压缩状态。
- 工具调用和工具结果以底部动态状态更新，不刷屏进入主对话。
- 长后台任务要有动态变化，不是只在结束时突然出现一行。

斜杠命令：

- TUI 复用当前 `localCommandDefinitions` 注册表。
- 不在 TUI 里再维护一套命令列表。
- 本轮先做基础执行：用户输入注册过的 slash command 后，本地处理并把结果以系统输出或现场提示显示。
- 不做模糊搜索、命令面板、补全弹层；这些是后续 TUI 壳层增强，不进入本轮主线。

失败体验：

- provider 请求失败时，TUI 不崩，底部现场显示失败，主对话保留当前 session。
- 工具失败时，底部现场显示失败摘要。
- 后台卡住时，底部现场显示卡点。
- 终端 resize 后布局保持可用，主区和底部不重叠。
- 退出时清理 renderer 和输入模式，不把终端留在坏状态。

业务完成标准：

- 用户可以用 `kitty tui` 真实聊天。
- 用户可以滚动历史，不再遇到“页面压根无法滚动”的失败。
- 用户可以用鼠标滚轮滚动。
- 用户能在底部看到后台、subagent、上下文占用。
- 用户能用已有 slash commands。
- TUI 是壳层；删掉 TUI 不影响 agent、session、provider、tools、runtime 主干。

## 2. 当前事实

当前代码事实：

- 当前项目是 Node 22 可运行，源码以 TypeScript 为主。
- `package.json` 还没有 `ink`、`react`、`@types/react` 等 TUI 依赖。
- `tsconfig.json` 只包含 `src/**/*.ts`，还没有 TSX 编译入口。
- `tsconfig.tests.json` 只包含 `src/**/*.ts` 和 `tests/**/*.ts`，还没有 TSX 测试入口。
- `src/interaction/sessionDriver.ts` 已经把交互输入、local commands、turn 执行、中断、退出清理连成主干。
- `src/interaction/shell.ts` 已定义 `InteractionShell`、`ShellInputPort`、`ShellOutputPort`、`InteractionTurnDisplay`，这是 TUI 壳层应该复用的边界。
- `src/shell/cli/interactive.ts` 负责当前 readline CLI 交互启动。
- `src/shell/cli/turnDisplay.ts` 通过 runtime-ui callbacks 渲染 assistant、reasoning、status、tool call、tool result。
- `src/runtime-ui/events.ts` 已有 runtime UI event 协议。
- `src/runtime-ui/agentCallbacks.ts` 能把 agent callbacks 转成 runtime UI events。
- `src/interaction/localCommandDefinitions.ts` 已成为 slash command 注册表。
- `tui-prototype.html` 是当前视觉和交互方向参考，不是产品代码。

当前测试事实：

- `tests/interaction/local-commands.test.ts` 覆盖 slash command 注册表和本地执行。
- `tests/shell/interactive-intro.test.ts` 覆盖当前 CLI intro。
- `tests/runtime-ui/*` 覆盖 runtime UI 事件呈现策略。
- 当前没有 TUI 测试。

当前文档事实：

- README 说明 CLI、交互模式、Telegram、Web、runtime-ui 等当前入口。
- README 还没有真实 Ink TUI 入口。

外部参考事实：

- Ink 官方定位是 React for interactive command-line apps；安装主干是 `ink` + `react`，它用 Yoga/Flexbox 做终端布局。来源：Ink GitHub README。  
  https://github.com/vadimdemedes/ink
- OpenCode 当前主 TUI 使用 OpenTUI，不是 Ink；但它给出的产品经验很重要：split footer、主 scrollback、底部 composer、状态行、命令注册表、resize/replay 测试。
- OpenCode 的测试里专门覆盖 scrollback、footer、statusline、resize、slash autocomplete，这说明 TUI 的难点不是画出来，而是滚动、输入、状态和恢复。
- Ink 鼠标滚动不是产品级开箱即得能力；可以参考 `ink-mouse` 或直接处理终端 mouse escape sequences，但必须用真实终端验收。

当前缺口：

- 没有 `kitty tui` 命令。
- 没有 Ink app。
- 没有 TUI 输入框。
- 没有 TUI scrollback。
- 没有鼠标滚轮适配。
- 没有把 InteractionShell 接到 Ink。
- 没有把 runtime-ui events 投影成 TUI 状态。
- 没有 TUI 测试和手动验收脚本。

当前未知点：

- Ink 最新稳定版本与本项目 tsup CJS bundle 的兼容细节需要安装后验证。
- 鼠标滚轮在 Windows Terminal / VS Code Terminal 下的 escape sequence 表现需要真实测试。
- Ink 对中文宽字符和长行换行的实际表现需要快照和人工检查。

## 3. 失败测试

自动失败测试：

- 如果 `kitty tui --help` 或 CLI 命令列表没有 TUI 入口，应失败。
- 如果 TUI shell 不能提交输入到现有 `InteractiveSessionDriver`，应失败。
- 如果 TUI shell 不能执行已有 slash command registry 的命令，应失败。
- 如果 runtime-ui events 不能被转换成主对话区消息和底部现场状态，应失败。
- 如果 PageUp/PageDown/Home/End 不能改变 scrollback offset，应失败。
- 如果追加内容时不能区分“跟随底部”和“用户正在看历史”，应失败。
- 如果底部状态不能显示 background、subagent、context 三类事实，应失败。
- 如果 TypeScript build 不能处理 TSX，应失败。
- 如果 README 没有说明 `kitty tui` 和基础操作，应失败。

手动失败测试：

- 在 Windows Terminal 运行 `node dist/cli.js tui`，鼠标滚轮不能滚动主区，应失败。
- 在 VS Code Terminal 运行 `node dist/cli.js tui`，鼠标滚轮不能滚动主区，应失败。
- 终端高度很小时，输入框和底部现场遮挡主对话，应失败。
- 长对话超过一屏时，PageUp/PageDown 无效，应失败。
- 模型运行时工具/后台事件刷进主对话区，应失败。
- Ctrl+C 后终端输入模式损坏，应失败。

## 4. 目标

- 新增 `kitty tui` 命令，明确进入 Ink TUI。
- 新增 Ink TUI 壳层，复用现有 `InteractiveSessionDriver`，不复制 agent 主循环。
- 新增 TUI `InteractionShell`：
  - input port 由 Ink composer 驱动。
  - output port 写入 TUI transcript 或底部状态。
  - turn display 把 runtime-ui events 写入 TUI store。
- 新增 TUI 状态模型：
  - transcript entries：user、reasoning、assistant、system。
  - runtime facts：background、subagent、context。
  - scroll state：offset、stickToBottom、newContentPending。
  - composer state：draft、rows、busy。
- 新增滚动能力：
  - keyboard scroll。
  - mouse wheel scroll。
  - resize 后保持合法 offset。
- 新增底部现场：
  - 后台任务状态。
  - subagent 状态。
  - context budget 状态。
- 复用 slash command 注册表，不在 TUI 维护第二份命令事实。
- 增加测试、README 和 plan 收口。

## 5. 不做范围

- 不让 `kitty` 默认进入 TUI；本轮只新增 `kitty tui`。
- 不做 OpenTUI，不引入 Bun。
- 不做 Web UI 重构。
- 不做命令面板、模糊搜索、slash autocomplete 弹层。
- 不做主题系统。
- 不做文件选择器。
- 不做 provider/model 切换 UI。
- 不做点击按钮；鼠标本轮只要求滚轮滚动。
- 不做复杂 markdown 渲染；本轮先保证纯文本、换行、中文、代码块文本可读。
- 不重写 agent/session/provider/tool/runtime 主干。

## 6. 设计

主链路：

`kitty tui` -> resolve runtime/session -> start Ink app -> TUI shell -> `InteractiveSessionDriver` -> `runHostTurn` -> runtime-ui events -> TUI store -> Ink render。

模块边界：

- `src/cli/commands/tui.ts`：只注册 `kitty tui` 命令并接入 runtime/session。
- `src/shell/tui/start.tsx`：只启动 Ink app，绑定 session driver 生命周期。
- `src/shell/tui/shell.ts`：实现 `InteractionShell`，把 driver 输入输出接到 TUI store。
- `src/shell/tui/store.ts`：维护 TUI 壳层状态，不保存业务事实。
- `src/shell/tui/components/App.tsx`：布局总装。
- `src/shell/tui/components/Transcript.tsx`：主对话区渲染和滚动。
- `src/shell/tui/components/Composer.tsx`：底部输入框。
- `src/shell/tui/components/RuntimeDock.tsx`：后台、subagent、context 现场。
- `src/shell/tui/input/scroll.ts`：键盘和鼠标滚动解析。
- `src/shell/tui/turnDisplay.ts`：把 agent callbacks 转成 TUI event/store 更新。
- `src/shell/tui/format.ts`：纯呈现格式化，不能读取 runtime 事实。

状态归属：

- session 事实仍归 `SessionStore`。
- turn 生命周期仍归 host/agent。
- slash commands 仍归 `localCommandDefinitions` 和 `localCommands`。
- background/subagent/context 事实仍来自 runtime status、execution 和 callback events。
- TUI store 只保存当前屏幕需要的投影状态。

滚动设计：

- transcript 保存完整 entries。
- renderer 根据 terminal height 计算主区可见行数。
- 每条 entry 先通过 wrapping 计算占用行。
- `scrollOffset` 表示从顶部开始的可见行偏移。
- `stickToBottom=true` 时新内容自动滚到底。
- 用户 PageUp、鼠标上滚后 `stickToBottom=false`。
- End 或滚到底后恢复 `stickToBottom=true`。
- 鼠标滚轮通过 raw input escape sequence 解析为 line delta；失败时键盘滚动仍可用，但手动验收必须通过后才算完成。

输入设计：

- composer 使用 Ink 输入组件或自写受控输入。
- `Enter` 提交当前 draft。
- `Shift+Enter` 插入换行；如果终端无法可靠区分，提供 `Ctrl+J` 作为可测备用换行键，并在 README 写明。
- 提交后把文本交给 TUI input queue，由 `ShellInputPort.readInput()` resolve。
- local command 仍由 `InteractiveSessionDriver` 调用 `handleLocalCommand`。

runtime event 投影：

- assistant_text -> transcript assistant 追加。
- reasoning -> transcript reasoning 追加。
- status -> bottom workline 或 system entry，按事件语义决定。
- tool_call/tool_result/tool_error -> 默认进入 bottom runtime dock，不进入主 transcript。
- 工具失败可产生短 system entry，但不刷完整工具 payload。

底部现场设计：

- `Background`：来自 runtime status active executions 和 background tool events。
- `Subagent`：来自 execution kind/subagent events 和 runtime status。
- `Context`：来自 session context budget。
- 没有事实时显示“空闲 / 未知”，不伪造。

依赖设计：

- runtime dependency：`ink`、`react`。
- dev dependency：`@types/react`。
- CLI 产物是 `dist/cli.js`，不静态导入 Ink。
- TUI 产物是 `dist/tui.mjs`，单独作为 ESM 构建。
- `kitty tui` 只加载 `dist/tui.mjs`；没有 fallback 到源码。

OpenCode 经验取舍：

- 采用：主 scrollback + 固定 footer、命令注册表、状态行、resize/scroll 测试。
- 不采用：OpenTUI、Bun、复杂插件路由、主题系统、模型/agent/provider 面板。
- 原因：Kitty 当前需要一个可删可换的壳层，不需要把 TUI 变成第二套应用框架。

## 7. 实施任务

- [x] 更新依赖和 TSX 配置：`package.json`、lockfile、`tsconfig.json`、`tsconfig.tests.json`。
- [x] 新增 `kitty tui` CLI 命令，接入现有 runtime/session 解析。
- [x] 新增 TUI store：transcript、runtime dock、composer、scroll state。
- [x] 新增 scroll 计算模块：wrap、viewport、PageUp/PageDown/Home/End、stick-to-bottom。
- [x] 新增 mouse wheel 输入适配：启用/关闭 mouse tracking，解析 wheel delta，退出时恢复终端。
- [x] 新增 Ink App 布局：单列布局，主 transcript，底部 runtime dock，底部 composer。
- [x] 新增 Transcript 组件：用户块、thinking、assistant、system 输出。
- [x] 新增 RuntimeDock 组件：后台任务、subagent、上下文占用。
- [x] 新增 Composer 组件：输入、Ctrl+J 换行、提交、中断、清空。
- [x] 新增 TUI InteractionShell：把 Ink 输入队列接到 `InteractiveSessionDriver`。
- [x] 新增 TUI turn display：把 runtime-ui callbacks 写入 TUI store。
- [x] 确保 slash commands 在 TUI 中复用当前 registry 和 handler。
- [x] 增加单元测试：scroll reducer、mouse sequence parser、runtime event projection、slash command path。
- [x] 增加组件/渲染测试：transcript 和 runtime dock 可渲染。
- [x] 增加 CLI 测试：`kitty tui` 命令存在，非 TTY 时给出清楚错误。
- [x] 更新 README：入口、按键、鼠标滚动、slash command、当前边界。
- [x] 构建并运行完整验证。
- [x] 验证 `dist/cli.js` 不包含 `require("ink")`，`dist/tui.mjs` 可独立 import。
- [ ] 真实 TTY 手动验收 `node dist/cli.js tui` 的滚动、鼠标、resize、slash command。
- [x] 更新 plan 收口。

## 8. 验证计划

局部验证：

- `npm.cmd install`
- `npm.cmd run test:build`
- `node --test .test-build/tests/shell/tui-*.test.js`
- `node --test .test-build/tests/cli/program.test.js`

完整验证：

- `npm.cmd run verify`

手动验收：

- `node dist/cli.js tui`
- 输入一条普通消息，确认主区出现用户块、thinking、assistant。
- 输入 `/help`，确认走本地 slash command。
- 输入 `/status`，确认显示本地事实，不进入模型。
- 造长 transcript，确认 `PageUp` / `PageDown` / `Home` / `End` 可用。
- 鼠标滚轮上滚/下滚主区。
- 模型运行中触发工具事件，确认工具状态在底部动态变化，不灌入主区。
- 调整终端高度和宽度，确认主区、dock、composer 不重叠。
- `Ctrl+C` 中断运行中 turn，空闲时不误杀后台任务。

未验证内容：

- 所有终端模拟器的鼠标行为无法自动穷尽；本轮至少验 Windows Terminal 和 VS Code Terminal。
- 正式 command palette 和 slash autocomplete 不在本轮。

剩余风险：

- Ink 对 mouse wheel 没有项目内既有封装，低层 escape sequence 需要真实终端验证。
- TSX/React 引入会增加依赖体积，但 TUI 是独立壳层，不应污染 agent 主干。

## 9. 收口

已完成本轮实现。

完成事实：

- 新增 `kitty tui` 命令。
- 新增独立 ESM TUI 入口 `src/tui.ts`，构建产物为 `dist/tui.mjs`。
- 主 CLI 产物 `dist/cli.js` 不静态导入 Ink，不包含 `require("ink")`。
- TUI 复用现有 session、InteractiveSessionDriver、InteractionShell、local command registry 和 turn display 边界。
- 新增 TUI controller、store、lifecycle、mouse wheel parser、shell、turn display、Ink component factories。
- 删除 `/multi`、`readMultiline`、`::end`、`::cancel` 整条旧能力链路；当前产品不再暴露多行命令。
- README 已记录 `kitty tui`、按键和当前边界。

验证事实：

- `npm.cmd run verify` 通过，193 个测试全绿。
- `node dist/cli.js tui --help` 正常输出 TUI 命令帮助。
- 非 TTY 下 `node dist/cli.js tui` 正确报错：`kitty tui requires an interactive TTY.`
- `node -e "import('./dist/tui.mjs')..."` 确认 TUI ESM 入口可加载。
- 全局扫描确认 `/multi`、`::end`、`readMultiline`、`ShellMultiline` 无源码/测试/文档残留。

未验证内容：

- 当前自动环境不是交互 TTY，无法真实操作鼠标滚轮、PageUp/PageDown、resize 和 slash command 输入。需要用户在 Windows Terminal 或 VS Code Terminal 手动运行 `node dist/cli.js tui` 体验确认。

剩余风险：

- 鼠标滚轮依赖终端 mouse escape sequence，已做解析测试，但不同终端仍需要真实手动确认。
