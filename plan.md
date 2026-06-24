# TUI Live Facts Plan

## 1. 需求文档

用户使用 TUI 时，只需要看到当前正在发生的真实事情。

底部最多两行。没有事情发生时，不显示“空闲”“上一轮完成”“无任务”这类废信息。

工具调用和结果应该像对话现场的一部分自然出现。`todo_write` 是工具事件，应该按工具结果显示，不做常驻 todo 面板。

后台任务和 subagent 只有在活着或刚发生失败时才显示。用户需要知道它们是否还活着、正在跑什么；不需要看到“后台空”“子代理空”。

当前命令必须尽量显示原文。不要把命令改写成泛泛的人话。

CLI、TUI、Web 的体验必须来自同一套运行事实。它们只是不同外壳，不是三套产品逻辑。工具摘要、todo 预览、命令原文、失败事实、后台/subagent 事实都应由共享主干产生，各 UI 只负责按自己的形态呈现。

业务完成标准：

- TUI 不再常驻空状态。
- 当前执行动作显示真实工具名、命令或必要事实。
- `todo_write` 结果进入 transcript，而不是被 dock 吃掉。
- background / subagent 只在有真实活动时出现在底部。
- 不新增快捷键面板、本地状态命令或展开层。

## 2. 当前事实

- `src/shell/tui/store.ts` 的 dock 默认值包含“空闲”“没有后台任务或子代理正在执行”。
- `src/shell/tui/components/RuntimeDock.ts` 固定渲染工作、后台任务、子代理、上下文。
- `src/shell/tui/turnDisplay.ts` 在模型等待结束、工具完成、flush、dispose 时写入“空闲”“完成”类状态。
- `src/shell/tui/turnDisplay.ts` 只按工具名包含 `background` / `subagent` 判断 lane。
- CLI runtime-ui 已有 `buildToolCallDisplay` / `buildToolResultDisplay`，其中 `bash` call 会保留原始 command。
- `todo_write` 工具结果包含 `preview: formatTodoBlock(items)`。
- CLI/Telegram 已经通过 runtime-ui 共享部分工具展示逻辑；TUI 当前没有充分复用这条主干。
- TUI 现有测试保护“工具结果不进 transcript”，这和本次目标冲突。
- 当前工作区已有独立的版本同步改动：`package.json` 和 `package-lock.json` 从 `0.0.12` 到 `0.0.13`。本计划不处理它。

## 3. 失败测试

- TUI 初始 dock 渲染不应出现“空闲”“无任务”“上一轮完成”。
- `background_run` 调用时底部显示该工具正在运行；完成后不继续显示“完成”占位。
- `subagent_launch` 调用时底部显示该工具正在运行；完成后不继续显示“完成”占位。
- `bash` 工具调用时底部显示原始 command。
- `todo_write` 工具结果的 preview 进入 transcript。
- 普通工具结果不因为本次改动全部刷进 transcript。

## 4. 目标

- 重构 TUI dock state，使它表达“当前活动事实”，而不是默认状态表。
- 复用 runtime-ui 的工具展示能力生成当前动作和工具结果文本，避免 TUI 自己重复维护命令、todo、失败展示逻辑。
- 保留 background / subagent 活动事实，但不显示空状态。
- 让 `todo_write` 作为工具结果进入 transcript。
- 更新测试，使它们保护当前产品体验。

## 5. 不做范围

- 不做完整 todo 常驻列表。
- 不做 `Ctrl+T`、`Ctrl+B`、`Ctrl+E`。
- 不做 `/todo`、`/status`、`/events` 的 TUI 本地命令。
- 不做工具状态的人话归类系统。
- 不做三层 dock。
- 不做“空闲”“无任务”“上一轮完成”这类占位文案。
- 不处理版本号同步改动的提交。

## 6. 设计

主链路：

1. Agent callback 产生模型、工具、状态事件。
2. TUI turn display 把事件投影成：
   - 当前动作：只在模型等待或工具运行时存在。
   - 活跃执行：只记录 background / subagent 活着或失败的事实。
   - transcript：用户、模型、reasoning、必要工具结果。
3. RuntimeDock 只渲染存在的事实：
   - 第一行：当前动作。
   - 第二行：background / subagent / context 中存在的事实。
4. 事件结束后清掉当前动作，不写“完成”占位。

模块边界：

- `store.ts` 维护 TUI 状态结构和状态更新。
- `turnDisplay.ts` 负责把 agent callbacks 转成 TUI 状态变化。
- `RuntimeDock.ts` 只负责渲染已有 dock facts，不决定事实。
- runtime-ui tool display 维护跨 CLI/TUI/Web 可复用的工具事实投影：工具调用摘要、todo 预览、失败细节、命令原文。
- CLI、TUI、Web 可以有不同视觉形态，但不能各自重新发明工具语义。

## 7. 实施任务

- [x] 修改 `TuiRuntimeDockState`：删除 `work.active/label/detail`、`background`、`subagent` 的空字符串默认语义，改为可选当前动作和可选 live facts。
- [x] 修改 `RuntimeDock.ts`：只渲染存在的行；没有事实时只显示上下文或不显示占位废话。
- [x] 修改 `turnDisplay.ts`：工具调用用 runtime-ui 共享投影生成当前动作，`bash` 显示原始命令；工具完成清掉当前动作。
- [x] 修改 `turnDisplay.ts`：background / subagent 只在工具调用、失败或仍需显示活跃事实时更新，不写“空闲”。
- [x] 修改 `turnDisplay.ts`：`todo_write` 工具结果复用 runtime-ui 共享投影追加到 transcript。
- [x] 检查 CLI/TUI/Web 工具显示边界，确认本次不制造 TUI 私有工具语义。
- [x] 更新 TUI shell/render 测试，覆盖上述失败测试。
- [x] 运行相关 TUI 测试。
- [x] 运行完整验证。

## 8. 验证计划

- `npm.cmd test -- tests/shell/tui-shell.test.ts tests/shell/tui-render.test.ts`
- `npm.cmd run verify`
- 手动检查 `node dist/cli.js tui` 的底部不出现空闲占位。

## 9. 收口

已完成实现、定向测试和完整验证。

已改文件：

- `src/shell/tui/store.ts`
- `src/shell/tui/components/RuntimeDock.ts`
- `src/shell/tui/shell.ts`
- `src/shell/tui/turnDisplay.ts`
- `src/shell/tui/toolFacts.ts`
- `tests/shell/tui-render.test.ts`
- `tests/shell/tui-shell.test.ts`
- `plan.md`

验证已通过：

- `npm.cmd run typecheck`
- `npm.cmd run test:build; node --test .test-build/tests/shell/tui-shell.test.js .test-build/tests/shell/tui-render.test.js`
- `npm.cmd run verify`

目标完成：

- TUI dock 不再制造“空闲”“无任务”“上一轮完成”占位。
- 当前动作从共享 runtime-ui 工具投影生成，`bash` 保留原始命令。
- `todo_write` preview 进入 transcript。
- background / subagent 只在有真实工具事实时显示，且无关工具不会清掉活跃事实。
- CLI/TUI/Web 边界已核对：本次没有新增 TUI 私有工具语义，TUI 复用 runtime-ui 工具展示主干。

未验证：

- 手动打开 `node dist/cli.js tui` 检查真实终端底部观感。

剩余风险：

- `background_run` 的真实长期运行状态仍来自 execution/control plane；本次只改 TUI 当前回调事件投影，不新增轮询或后台账本读取。
