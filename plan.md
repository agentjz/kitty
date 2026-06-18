# Production Runtime Experience Plan

## 1. 需求文档

用户想把 Kitty 当作日常生产工具，而不是只在开发者理解内部账本时才好用。

真正要解决的问题是：长任务运行时，用户要能随时看懂当前现场、后台状态、恢复风险、成本状态和下一步动作。

使用者是本地开发者。用户完成任务时应该看到：

- `kitty status` 像现场说明，不像数据库摘要。
- `kitty background` 能直接说明后台任务是否健康、是否卡住、能做什么。
- `kitty eval --run` 能验证生产关键路径：现场可读、后台可控、恢复可演练、成本可审阅。
- README 说明当前生产级路线：现场、恢复、验收、成本。

当前范围包含：

- 建立 runtime scene 作为当前现场的统一投影。
- 让 status 和 background 命令复用该现场投影。
- 强化长任务恢复表达：中断、后台、subagent、wake、卡住状态必须能被用户看见。
- 强化 eval 场景和检查，覆盖现场表达、真实恢复、后台用户体验、成本观测、skill readiness、memory 可审阅和失败体验。
- 强化成本观测：最近请求 token/cache、稳定前缀、易变尾部和缓存未知边界都能看到。
- 强化 skill 产品化可见性：ready、资源、依赖、问题都出现在现场里，不默认灌正文。
- 强化 memory 自然性可见性：近期 session 是否有 memory、memory assets 是否可审阅。
- 强化失败体验：provider usage 缺失、后台无输出、deadline/stale、无 session 都有明确下一步。
- 同步 README 和 plan 收口。

当前范围不包含：

- 不新增模型路由。
- 不新增长期记忆系统。
- 不恢复已删除的 spec/team 能力。

业务完成标准：

- 用户能用 `kitty status` 直接知道当前目标、下一步、阻塞、后台、成本和恢复现场。
- 用户能用 `kitty background` 看懂后台任务状态，不需要理解 execution 字段。
- `kitty eval --run` 能机器验证这些生产现场能力存在。

## 2. 当前事实

当前代码事实：

- `src/runtime/status.ts` 聚合 session、memory、skills、project map、model usage、task lifecycle、execution 和 wake signals。
- `src/cli/commands/runtimeStatusPresenter.ts` 直接把 runtime status 格式化成 CLI 文本，里面混合了现场判断、成本呈现和字段渲染。
- `src/cli/commands/background.ts` 只按 execution 字段输出后台任务，用户需要自己理解 health、deadline、summary、output。
- `src/runtime/executionHealth.ts` 已能判断 running、no_output、stale、deadline_passed、settled。
- `src/evaluation/checks.ts` 已有 runtime-status、cache-economy、host-turn-boundary、remote-entrypoints、recovery-drills 检查。
- `src/evaluation/checks.ts` 文件较重，当前本轮只增加必要验收，不做无关拆分。

当前测试事实：

- `tests/runtime/status.test.ts` 覆盖 runtime status 的 session、context budget、cache layout、model usage 和 background health。
- `tests/evaluation/harness.test.ts` 覆盖 evaluation scenario 与 check 对齐，并跑本地机器验收。
- `tests/extensions/background-tools.test.ts` 覆盖 background 工具能力。

当前文档事实：

- README 已声明 Kitty 主线是本地执行内核、Cost Kernel 和产品级验收合同。
- README 已列出 status、background、evaluation，但还没有把“生产现场模型”讲成当前能力主线。

当前缺口：

- status 的现场判断只存在 presenter 内部，不能被 background 和 eval 复用。
- background CLI 输出偏字段列表，不像生产用户可读的现场说明。
- eval 没有明确检查“现场投影”“后台用户体验输出”“成本观测”“skill/memory 可审阅”和“失败体验”。
当前未知点：

- 真实 provider 长会话缓存命中率仍需长期实测。

## 3. 失败测试

- 如果 runtime status 无法生成统一 scene summary，应失败。
- 如果 `kitty status` 文本不包含当前现场、下一步、阻塞、后台、成本、恢复提示，应失败。
- 如果 background 命令不能把 no_output / deadline_passed / stale 翻译成用户可理解动作，应失败。
- 如果 eval 没有覆盖 production scene、background UX、cost observability、skill/memory readiness 和 failure experience，应失败。
- 如果 README 没有说明生产级路线是现场、恢复、验收、成本，应失败。

## 4. 目标

- 新增 runtime scene 模块，把 RuntimeStatus 转成用户可理解的现场投影。
- RuntimeStatus 类型携带 scene，status presenter 复用 scene，不在 presenter 内独立维护现场判断。
- Background CLI 复用同一套 execution 现场描述，输出 health、risk、next action 和 last output。
- Evaluation 增加生产现场验收场景，机器验证 scene、background UX、cost observability、skill/memory readiness 和 failure experience。
- README 同步生产级路线。

## 5. 不做范围

- 不改 provider 策略。
- 不新增配置项。
- 不做旧兼容或 legacy 输出。

## 6. 设计

主链路：

RuntimeStatus 原始事实 -> RuntimeScene 当前现场投影 -> status/background/eval 复用。

模块边界：

- `src/runtime/status.ts` 继续聚合机器事实。
- 新增 `src/runtime/scene.ts` 负责从机器事实生成现场投影。
- `src/runtime/statusTypes.ts` 只定义 status 与 scene 类型。
- `src/cli/commands/runtimeStatusPresenter.ts` 只负责呈现 scene 和详细事实。
- `src/cli/commands/background.ts` 只负责 background 命令接线和输出。
- `src/evaluation/checks.ts` 增加产品验收，不替代单元测试。

状态归属：

- scene 不产生新事实，只投影已有 status。
- 阻塞判断来自 active executions 的 health。
- 下一步建议来自当前 session、active execution、blocked state、cache/model usage 等死事实。
- 成本状态来自 context budget cache layout 和 recent model usage。
- skill 状态来自 project context skill health。
- memory 状态来自 session memory 和 memory asset index。

错误与恢复：

- 没有 session 时 scene 明确提示 start session。
- 没有 provider usage 时显示 usage unavailable，不伪造成本结论。
- 后台无输出、超时、stale 都给出明确 next action。
- 中断、失败和 wake 只作为现场事实呈现，不伪装成用户新目标。

## 7. 实施任务

- [x] 新增 `src/runtime/scene.ts`，定义并生成现场投影。
- [x] 扩展 `src/runtime/statusTypes.ts`，让 `RuntimeStatus` 携带 `scene`。
- [x] 修改 `src/runtime/status.ts`，在聚合事实后生成 scene。
- [x] 修改 `src/cli/commands/runtimeStatusPresenter.ts`，优先呈现 scene，再呈现详细事实。
- [x] 修改 `src/cli/commands/background.ts`，后台输出使用 scene execution 描述。
- [x] 扩展 `tests/runtime/status.test.ts`，覆盖 scene、status 文本和后台 next action。
- [x] 扩展 eval 类型、场景和检查，覆盖 production scene / background UX。
- [x] 扩展 eval 检查，覆盖 cost observability、skill/memory readiness 和 failure experience。
- [x] 同步 README 的生产级路线。
- [x] 运行局部测试、build、完整 verify。
- [x] 更新收口。

## 8. 验证计划

局部验证：

- `npm.cmd run test:build`
- `node --test .test-build/tests/runtime/status.test.js`
- `node --test .test-build/tests/evaluation/harness.test.js`
- `node --test .test-build/tests/extensions/background-tools.test.js`

完整验证：

- `npm.cmd run verify`

手动检查：

- `node dist/cli.js status`
- `node dist/cli.js background`
- `node dist/cli.js eval --run`

未验证内容：

- 真实 provider 长会话成本曲线。

剩余风险：

- 现场投影只能基于已有机器事实；如果底层 execution 没有记录输出，scene 不能凭空知道任务语义。
- 真实 provider 成本曲线仍需长期运行后判断。

## 9. 收口

已完成。

完成事实：

- 新增 `src/runtime/scene.ts`，把 RuntimeStatus 投影成用户可读现场：当前状态、焦点、下一步、阻塞、后台、skill、memory、成本、恢复和 execution 风险。
- `buildRuntimeStatus` 现在携带 `scene`，status presenter 不再自己维护现场判断。
- `kitty status` 顶部新增 Scene 区域，先讲当前现场，再列详细事实。
- `kitty background` 输出新增 risk、health、summary、next、lastOutput，让后台任务不再只是字段列表。
- `kitty eval --run` 新增 `production-scene-ready` 场景，覆盖现场、后台、成本、skill、memory 和失败边界。
- README 已同步生产级路线：现场、恢复、验收、成本。
- `.codex/skills/plan/SKILL.md` 和 `skills/plan/SKILL.md` 已同步一次性完整交付标准。

修改文件：

- `.codex/skills/plan/SKILL.md`
- `skills/plan/SKILL.md`
- `README.md`
- `plan.md`
- `src/runtime/scene.ts`
- `src/runtime/status.ts`
- `src/runtime/statusTypes.ts`
- `src/cli/commands/runtimeStatusPresenter.ts`
- `src/cli/commands/background.ts`
- `src/evaluation/checks.ts`
- `src/evaluation/types.ts`
- `tests/runtime/status.test.ts`
- `tests/evaluation/harness.test.ts`
- `tests/extensions/background-tools.test.ts`

验证结果：

- `npm.cmd run test:build` 通过。
- `node --test .test-build/tests/runtime/status.test.js` 通过。
- `node --test .test-build/tests/evaluation/harness.test.js` 通过。
- `node --test .test-build/tests/extensions/background-tools.test.js` 通过。
- `npm.cmd run build` 通过。
- `node dist/cli.js status` 通过，Scene 区域可见。
- `node dist/cli.js background` 通过，当前无后台任务时清楚提示。
- `node dist/cli.js eval --run` 通过，`production-scene-ready` 场景通过。
- `npm.cmd run verify` 通过，176 个测试全部通过。

未验证内容：

- 真实 provider 长会话成本曲线仍需长期运行观察。

剩余风险：

- scene 只投影已有机器事实；底层没有记录的输出或语义不会被凭空推断。
- 成本命中率仍以 provider 返回 usage 为准，provider 不返回时只能显示未知。
