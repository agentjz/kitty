# Kitty TUI Visual Activity Plan

## 1. 需求文档

用户要优化 Kitty TUI 的真实工作体验。问题不是缺顶栏、侧栏或 inspector，而是当前界面太像线性日志和配置雏形：用户不能一眼看清当前是谁在执行、运行了多久、是否阻塞 lead、最近在做什么、失败原因是什么。

使用者是在终端里用 Kitty 做真实开发任务的人。理想体验：

- 当前工具运行时，底部工作条用少量中文提示说清楚“正在运行：bash npm.cmd run test”，并显示已运行多久。
- subagent 阻塞 lead 时，TUI 像 lead 输出一样显示 subagent 的实时工具、思考和回答，而不是黑盒等待。
- background、subagent、context 仍显示在底部 runtime dock，但不再靠松散字符串和中文关键词判断状态。
- 命令、路径、工具名保持原文，不做无意义翻译；只中文化状态提醒和 UI 标签。
- 布局稳定，不引入顶栏、侧栏、inspector，不破坏历史上已修好的滚动、IME、光标和 resize 基线。

本次范围包含：

- TUI activity model：统一当前前台活动、状态、channel、工具名、摘要、运行时长、阻塞事实和 severity。
- Runtime Dock 升级：保留底部固定区域，结构化展示当前 activity、background/subagent/context lanes。
- subagent 前台化：复放 runtime-ui event 时按 channel 显示，不再只插入一个频道标签。
- 少量中文化：状态词、运行中、已运行、阻塞 lead、失败等；idle 不显示状态词。
- 测试和 spec 同步。

本次范围不包含：

- 不做顶栏/状态栏。
- 不做 inspector 面板。
- 不做侧栏。
- 不做完整 command palette。
- 不新增第二套 execution 状态。
- 不把命令、路径、工具名翻译成中文。

业务完成标准：

- TUI 能清楚显示当前 activity 和运行时长。
- background/subagent/context dock 信息更清楚，且布局稳定。
- subagent live stream 在 transcript 中作为 subagent speaker 展示。
- 当前 runtime facts 仍来自 session/runtime-ui/status/control-plane，不在 TUI 内重造任务状态。
- 局部 TUI 测试、build/typecheck 通过。

## 2. 当前事实

代码事实：

- TUI 是 Ink 壳，主入口在 `src/shell/tui/`。
- 当前布局是 transcript + footer；footer 内是 `RuntimeDock` 两行和 `Composer`。
- `TUI_DOCK_ROWS` 当前为 2，稳定高度是历史成功基线。
- 接手时 TUI 当前活动仍混在 dock 字符串状态中，没有一等 activity。
- `RuntimeDock` 颜色通过字符串包含“失败/错误/运行/等待/完成”判断。
- `createTuiTurnDisplay` 接收 agent callbacks 和 runtime-ui event，把 tool/status 投影到 dock。
- subagent worker 已写 runtime-ui events，host lead-wait 会复放到当前 callbacks。
- transcript role 当前只有 `user/assistant/reasoning/system`。
- channel 切换时当前 TUI 只 append `[子代理]` 这类 system 行，然后 assistant_text 仍按 assistant role 追加。
- `toolFacts.ts` 复用 runtime-ui `buildToolCallDisplay/buildToolResultDisplay`，但只返回字符串 fact。
- `projectRuntimeStatusToDock` 从 runtime status scene 投影 background/subagent/context 到 dock。

文档事实：

- `spec/技术实现/T08-TUI与RuntimeUI/README.md` 明确 TUI 只是壳，不拥有第二套 agent 状态。
- 同一 spec 要求 TUI 展示当前后台、subagent、context、工具运行现场。
- history TUI 阶段证明：不能靠局部补丁修布局；composer/layout/editing/transcript projection 必须边界清楚。
- history 还证明：runtime dock 常驻是避免布局高度变化导致光标漂移的成功路线。

测试事实：

- `tests/shell/tui-render.test.ts` 覆盖 dock、composer、transcript、markdown、宽字符。
- `tests/shell/tui-store.test.ts` 覆盖 runtime status 到 dock 的投影。
- `tests/shell/tui-shell.test.ts` 覆盖 turn display、subagent runtime-ui replay、background dock、raw bash command。
- 接手时部分测试还保护旧字符串状态；这不符合当前事实主干，必须删除。

缺口：

- TUI 没有统一 activity model。
- dock 不知道 activity 已运行多久。
- dock severity 靠中文/英文字符串猜。
- 旧字段和兼容渲染违反“只写当前事实主干”，不能保留。
- tool running、subagent running、background running 没有统一显示语法。
- subagent channel 的 assistant/reasoning 没有单独 transcript speaker 样式。
- status 文案有中英混杂和不清晰问题，例如 `Lead resumed...` 会直接进 dock。

未知点：

- Ink 组件内实时计时刷新是否需要定时器。需要优先用 state 中的 startedAt + React interval 派生显示，不把每秒 tick 写回 controller 状态。
- 是否需要把 dock 高度从 2 行变成 3 行。优先保持 2 行；如果信息拥挤，再按固定高度改 3 行并更新 layout tests。

## 3. 失败测试

先补或更新这些测试：

- `RuntimeDock` 渲染 running activity 时显示“正在运行：bash npm.cmd run verify”和“已运行 12s”。
- `RuntimeDock` 渲染 failed activity 时显示“失败：edit ...”，不靠字符串包含判断颜色。
- idle dock 保留稳定两行结构，第一行显示“空闲”，不制造 background/subagent 假事实。
- `onToolCall("bash")` 后 dock activity 是 running，summary 保留原始命令。
- `onToolResult("bash")` 后当前 activity 清除。
- `onRuntimeUiEvent` 来自 `subagent/tool_call` 时 dock 显示“子代理正在运行：read src/index.ts”，并标记阻塞 lead。
- `assistant_text` 来自 subagent 时 transcript 使用 subagent role 或等价 speaker，不再只混进 assistant。
- runtime status 投影 background/subagent lanes 不丢 context。
- 中文提示不翻译命令、路径、工具名。

## 4. 目标

- 新增 TUI activity 数据结构，替换 dock current 字符串的主要路径。
- Runtime Dock 用结构化 activity/lanes 渲染：当前活动、运行时长、阻塞 lead、background/subagent/context。
- Turn display 从 runtime-ui/tool callbacks 构造 activity，并在完成/失败/abort 时收束。
- Transcript 支持 subagent speaker 呈现，subagent live stream 不再黑盒。
- 少量中文化状态提醒，不翻译命令和路径。
- `spec/技术实现/T08-TUI与RuntimeUI/README.md` 同步当前事实。
- TUI 相关测试和完整 build/typecheck 通过。

## 5. 不做范围

- 不做顶栏、侧栏、inspector、palette。
- 不做 runtime status 新事实源。
- 不做 execution 数据库 schema 变更。
- 不做 Web/Telegram UI 改造。
- 不做大规模主题重绘。
- 不做旧 plan 里的 background/subagent lifecycle 再实现。

## 6. 设计

### 主链路

1. agent/runtime-ui event 进入 `createTuiTurnDisplay`。
2. turn display 调用 `toolFacts/activity` 把 event 转成 `TuiActivity`.
3. controller 只保存 TUI 展示状态，不持久化 runtime 事实。
4. `RuntimeDock` 根据 activity.startedAt 在组件内派生 elapsed 文本。
5. transcript 根据 event channel 写入对应 speaker role：lead 仍 assistant/reasoning，subagent 使用 subagent role。
6. tool result/error/status 清理或更新 activity。
7. runtime status 继续只投影 background/subagent/context lanes，不接管当前 activity。

### 模块边界

- `store.ts`：定义 `TuiActivity`、dock state、纯状态更新。
- `toolFacts.ts` 或新增 `activity.ts`：把 tool/runtime-ui event 投影为 activity，不渲染 React。
- `RuntimeDock.ts`：只渲染 dock，不解析 JSON、不判断业务。
- `turnDisplay.ts`：连接 callbacks、runtime-ui event、controller。
- `transcriptTypes/transcriptFrame/transcriptLayout`：增加 subagent role 的显示样式。
- tests：保护行为，不测装饰口号。

### Activity 字段

- `kind`: `model | tool | subagent | background | status`
- `channel`: `lead | subagent | system`
- `status`: `running | waiting | failed | completed`
- `label`: 少量中文状态标签，例如 `正在运行`
- `summary`: 原始工具/命令/path 摘要，例如 `bash npm.cmd run verify`
- `detail`: 最近输出或补充事实，可选
- `startedAt`: epoch ms，用于 elapsed
- `blockingLead`: boolean
- `severity`: `info | warning | error | success`

### 中文化边界

中文化：

- 正在运行
- 正在等待
- 已运行
- 阻塞 lead
- 子代理
- 后台
- 上下文
- 空闲
- 失败

不中文化：

- `bash`
- `read`
- `edit`
- `subagent_launch`
- command string
- path
- execution id

### 运行时长

- activity 创建时写 `startedAt`。
- `RuntimeDock` 内部每秒刷新当前时间，仅用于 render。
- 不把每秒 tick 写入 controller，不污染状态和 session。
- 小于 60 秒显示 `12s`，大于等于 60 秒显示 `1m 05s`，大于等于 1 小时显示 `1h 02m 03s`。

## 7. 实施任务

- [x] 替换旧 plan 为当前 TUI activity 计划。
- [x] 新增/调整 TUI activity 类型和 store 更新函数。
- [x] 调整 `RuntimeDock` 为结构化渲染和运行时长显示。
- [x] 调整 `toolFacts`/`turnDisplay`，tool/runtime-ui event 投影 activity。
- [x] 增加 subagent transcript role 和样式。
- [x] 更新 TUI tests 覆盖 activity、elapsed、subagent speaker、中文边界。
- [x] 更新 T08 spec。
- [x] 运行局部 TUI tests。
- [x] 运行 `npm.cmd run test:build`、相关 shell tests、`npm.cmd run build`。
- [x] 运行 `npm.cmd run verify`。
- [x] 更新收口。

## 8. 验证计划

局部测试：

```bash
npm.cmd run test:build
node --test .test-build/tests/shell/tui-render.test.js
node --test .test-build/tests/shell/tui-store.test.js
node --test .test-build/tests/shell/tui-shell.test.js
```

构建：

```bash
npm.cmd run build
```

完整验证：

```bash
npm.cmd run verify
```

手动检查：

- 在 TUI 中触发 `bash` 工具，观察 dock 显示“正在运行：bash ... 已运行 Ns”。
- 在 subagent 阻塞 lead 时，观察 transcript 出现子代理 speaker 流，完成后回到 lead。
- 确认命令、路径、工具名没有被翻译。

## 9. 收口

状态：完成。

完成事实：

- 新增 `src/shell/tui/activity.ts`，把 TUI 当前活动统一为 `kind/channel/status/summary/detail/startedAt/blockingLead/severity`。
- `RuntimeDock` 改为只读取结构化 activity 渲染，不再靠字符串包含“失败/运行”等词判断状态。
- 删除旧字段、旧断言和兼容渲染；当前代码只服务结构化 activity。
- Dock 保持两行固定高度，running/waiting activity 显示少量中文状态和 `已运行 Ns`，命令、路径、工具名保留原文。
- `toolFacts` 和 `turnDisplay` 统一把 tool/runtime-ui/status 事件投影成 activity。
- subagent runtime-ui replay 的 assistant/reasoning 分别进入 `subagent` / `subagent_reasoning` transcript role；subagent tool call activity 标记 `blockingLead`。
- Transcript 增加 subagent 样式和 gutter，不新增第二套 execution 状态。
- T08 spec 已同步 activity/dock/subagent live stream 当前事实。

改动文件：

- `src/shell/tui/activity.ts`
- `src/shell/tui/components/RuntimeDock.ts`
- `src/shell/tui/controller.ts`
- `src/shell/tui/store.ts`
- `src/shell/tui/theme.ts`
- `src/shell/tui/toolFacts.ts`
- `src/shell/tui/transcriptFrame.ts`
- `src/shell/tui/transcriptLayout.ts`
- `src/shell/tui/transcriptTypes.ts`
- `src/shell/tui/turnDisplay.ts`
- `tests/shell/tui-render.test.ts`
- `tests/shell/tui-shell.test.ts`
- `spec/技术实现/T08-TUI与RuntimeUI/README.md`
- `plan.md`

验证结果：

- `npm.cmd run test:build`：通过。
- `node --test .test-build/tests/shell/tui-render.test.js .test-build/tests/shell/tui-store.test.js .test-build/tests/shell/tui-shell.test.js`：通过，42 个 TUI 相关测试通过。
- `npm.cmd run build`：通过。
- `npm.cmd run verify`：通过，275 个 core tests，274 pass，1 个平台跳过。

未验证内容：

- 没有打开真实交互 TUI 手动截图验收；当前通过 Ink render tests 和完整 verify 验证行为。

剩余风险：

- Dock 仍保持两行固定高度；极长 activity summary 会截断，这是为了不破坏历史上的 composer/IME/光标稳定基线。
- subagent role 当前是视觉区分和 activity 标记，不是独立 inspector；这符合本次明确不做 inspector 的范围。

## 10. 视觉动效补充

用户继续要求 TUI 更接近 opencode 的视觉成熟度：整体主色改为天蓝色，活动状态增加轻量动画，并改善无会话和有会话启动时的观感。

当前事实：

- opencode 的 TUI 使用蓝色强调边、prompt 左边框、底部快捷提示和局部 spinner。
- opencode 动画是局部组件动画，不把帧写进 session 或任务状态。
- Kitty 当前主题仍以金色为主，Dock marker 是静态符号，空 transcript 没有欢迎态；有历史 session 时才显示 session picker。

设计：

- 主题改为天蓝色主强调，保留红/绿等语义色。
- 新增 TUI 渲染层动画 helper，只返回本地 frame，不进入 controller/session/control-plane。
- Runtime Dock running activity 使用 spinner frame；waiting 使用静态 marker；失败/完成仍静态。
- 空 transcript 保持空白第一屏，不显示欢迎态和快捷提示。
- session picker 使用同一蓝色强调、简洁快捷提示和静态选中行样式；不新增旧入口或额外状态。

任务：

- [x] 新增 TUI animation helper。
- [x] 更新主题为天蓝色主色。
- [x] Runtime Dock 使用 spinner 动画。
- [x] 空 transcript 保持空白第一屏，不显示 welcome/hints。
- [x] session picker 视觉调整。
- [x] 用户消息块保持紧凑，不使用整行深色背景铺满正文宽度。
- [x] 更新测试。
- [x] 运行局部 TUI tests。
- [x] 运行 build、verify。

收口事实：

- `src/shell/tui/animation.ts` 提供本地 spinner helper，动画只存在于渲染层，不进入 controller、session 或 runtime 状态。
- `src/shell/tui/theme.ts` 改为天蓝色主强调，保留 error/success/warning 语义色。
- `RuntimeDock` running activity 使用 spinner frame；waiting、失败和完成保持静态符号。
- 空 transcript 保持空白第一屏；session picker 使用同一蓝色视觉和静态选中样式。
- 用户提交消息保持紧凑，只保留常规 entry 间距，不在消息内部增加上下空白行。
- 没有恢复 `dock.current`，没有旧别名、兼容转发或历史适配层。

验证结果：

- `git diff --check`：无空白错误；仅 Windows 工作区 LF/CRLF 提示。
- `rg -n "dock\\.current|current\\?:|legacyCurrentActivity|updateCurrent\\(" src/shell/tui tests/shell plan.md "spec/技术实现/T08-TUI与RuntimeUI/README.md"`：无命中。
- `npm.cmd run test:build`：通过。
- `node --test .test-build/tests/shell/tui-render.test.js .test-build/tests/shell/tui-store.test.js .test-build/tests/shell/tui-shell.test.js`：通过，44 个 TUI 相关测试通过。
- `npm.cmd run build`：通过。
- `npm.cmd run verify`：通过，277 个测试，276 pass，1 skipped。

## 11. 空态降噪补充

用户继续指出第一屏不需要“新会话已就绪”、快捷键教程和点状闪烁动画。截图事实显示：空 transcript 中央文案、Runtime Dock 的“空闲”和 context 行、输入框同时存在，第一屏像状态说明页，而不是以输入为主的工作界面。

参考事实：

- opencode prompt 把输入区作为主视觉：左侧强调线、输入背景、底部低噪声 meta。
- opencode idle 状态不靠正文欢迎文案撑第一屏；spinner 只出现在真实非 idle 状态。
- opencode 有 animations_enabled 降级，但 idle 不应该有局部 pulse 动画。

设计判断：

- 空 transcript 不显示欢迎文案和快捷键提示；正文保持空白，输入框负责表达可输入。
- 去掉点状 pulse 动画；只保留 running/thinking 类 spinner。
- Runtime Dock 在没有 activity 时保留固定两行结构，第一行显示“空闲”，第二行显示 context。
- session picker 选中提示使用静态符号，不再闪烁。
- 不新增配置开关，不新增兼容层，不保留旧空态文案。

任务：

- [x] 删除空 transcript 欢迎态和快捷键文案。
- [x] 删除 pulse frame 导出和使用点。
- [x] Runtime Dock idle 行改为空白稳定行，waiting 使用静态 marker。
- [x] session picker 选中提示改为静态。
- [x] 更新 TUI tests 和 T08 spec。
- [x] 运行局部 TUI tests、build、verify。

收口事实：

- `Transcript` 空 transcript 不再渲染 `Kitty`、`新会话已就绪`、输入提示或快捷键教程。
- `RuntimeDock` idle 行恢复显示“空闲”；context 行有事实时继续展示，底栏保持两行信息结构。
- `RuntimeDock` running activity 保留 spinner；waiting 改为静态 `⋯`；失败和完成保持静态符号。
- `sessionPicker` 删除点状 pulse，标题区和选中行都使用静态渲染。
- `animation.ts` 只保留 spinner frame 和本地 frame hook，没有 pulse frame 导出。
- T08 spec 已同步空白第一屏、idle 两行结构和只保留 running spinner 的当前事实。

验证结果：

- `npm.cmd run test:build`：通过。
- `node --test .test-build/tests/shell/tui-render.test.js .test-build/tests/shell/tui-store.test.js .test-build/tests/shell/tui-shell.test.js`：通过，44 个 TUI 相关测试通过。
- `npm.cmd run build`：通过。
- `npm.cmd run verify`：通过，277 个测试，276 pass，1 skipped。
