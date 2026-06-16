# Runtime Skill And Context Hardening Plan

## 1. 需求文档

用户要的是一个能长期作为生产工具使用的 Kitty：运行时 skill 阶段清楚，缓存设计真实省钱，内部唤醒不污染用户对话，文档和实际能力一致。

当前任务包含四件事：

- 把运行时 `development` skill 改成更短、更直接的 `do`。
- 让 `research`、`plan`、`do`、`verification` 四个 skill 成为独立阶段，不互相越界。
- 让缓存报告反映真实稳定前缀，不把每轮变化的 runtime facts 当成可缓存稳定区。
- 让内部 wake 使用结构化来源，不靠用户文本前缀判断。

业务完成标准：用户看到的内置 runtime skills 是 `research / plan / do / verification`；研究阶段只输出证据和下一阶段建议；执行阶段只负责落地；`kitty eval` 能检查真实 prompt 缓存稳定性；真实用户输入 `[internal] ...` 不会被误当内部消息隐藏。

## 2. 当前事实

- `skills/development/SKILL.md` 当前存在，frontmatter `name: development`。
- `README.md` 当前列出 `research`、`plan`、`development`、`verification`。
- `skills/research/SKILL.md` 出口最后写着“证据收束后，直接行动”，把 research 和 execution 混在一起。
- `src/skills/discovery.ts` 从 `SKILL.md` frontmatter 读取 skill 名，不硬编码 `development`。
- `src/skills/prompt.ts` 用英文向模型暴露 skill 索引，适合保持。
- `src/context/runtime/compression/builder.ts` 当前把完整 rendered system prompt 当 `stablePrefix`。
- `src/context/runtime/prompt.ts` runtime fact blocks 包含 session brief、task lifecycle、project map、skill index、internal facts 和 profile runtime facts。
- `src/agent/profiles/runtimeFacts.ts` 在 runtime facts 里写入 `new Date().toISOString()`。
- `src/context/runtime/prompt.ts` task lifecycle 和 project map block 当前包含 `Updated` 时间。
- `src/evaluation/checks.ts` 的 `cache-economy-ready` 用 `"stable system"` 做合成检查，不验证真实 runtime prompt。
- `src/session/turnFrame.ts` 当前用文本前缀 `[internal]` 判断内部消息。
- `StoredMessage` 当前没有结构化来源字段。
- 上下文窗口、session brief、task state 和压缩摘要都依赖 `isInternalMessage` 或 `readUserInput`。

## 3. 失败测试

- skill 目录和文档仍出现 runtime `development`，应失败。
- `research` skill 出口仍要求“直接行动”，应失败。
- 真实 prompt layers 的 stable cache fingerprint 被 runtime timestamp 或 task/project updated timestamp 改变，应失败。
- `kitty eval` 只用合成字符串验证缓存稳定性，应失败。
- 用户真实输入 `[internal] please keep this visible` 被上下文窗口、session brief 或 task state 当内部消息隐藏，应失败。
- 内部 wake 消息没有结构化来源，靠文本前缀过滤，应失败。

## 4. 目标

- Runtime skills 当前事实只剩四阶段：`research`、`plan`、`do`、`verification`。
- `research` 只负责调查收束，出口是证据、边界、建议下一阶段；不直接执行。
- `do` 只负责按已收束 research 和 plan 执行代码、测试、文档、验证。
- prompt cache layout 把 static + profile persona 作为 stable prefix，把 runtime facts 和 conversation 作为 volatile tail。
- cache evaluation 使用真实 runtime prompt layers 验证稳定前缀。
- StoredMessage 支持结构化 `source`，内部消息由 `source: "internal"` 判定；普通用户文本不因内容前缀被隐藏。
- README、spec、测试与当前实现一致。

## 5. 不做范围

- 不保留 `development` skill 作为旧别名。
- 不做旧 session 数据迁移分支；没有 `source` 的旧消息按外部消息处理。
- 不把模型语义判断交给机器关键词或正则。
- 不改 provider 实际缓存 API 协议，当前只修 prompt/cache layout 报告和 evaluation。
- 不重构 lead-wait 轮询为事件驱动；本轮只处理内部 wake 上下文边界。

## 6. 设计

主链路：

输入进入 session 时，消息携带结构化 source。外部用户消息进入 visible conversation、session brief、task state 和压缩摘要；内部 wake 只作为 runtime internal facts 进入当前轮，不作为用户目标进入对话历史。

Skill 主链路：

runtime skill discovery 仍只读取 `skills/**/SKILL.md`。目录 `skills/development` 改为 `skills/do`，frontmatter 改为 `name: do`。文档只呈现当前四阶段。research skill 的出口只交付调查结论和下一阶段建议；do skill 承接执行。

缓存主链路：

PromptLayers 已经有三层：static、profilePersona、runtimeFactBlocks。稳定前缀只由 static 和 profile persona 渲染。runtime facts 与 conversation 一起作为 volatile tail 计算。这样模型仍收到完整 system prompt，但 cache layout 不再声称动态事实稳定。evaluation 使用真实 `buildContextRuntimePromptLayers` 构造两次不同 runtime facts，验证 stable fingerprint 不变、volatile fingerprint 变化。

文件职责：

- `src/session/turnFrame.ts` 负责消息来源判断和当前用户输入读取。
- `src/session/messages.ts` 负责创建带 source 的消息。
- `src/context/runtime/compression/builder.ts` 负责 request 压缩和 cache layout。
- `src/evaluation/checks.ts` 负责机器可验收 eval，不写合成假证明。
- `skills/*/SKILL.md` 负责 runtime skill 阶段定义。

## 7. 实施任务

- [x] 重命名 runtime skill：删除 `skills/development` 路径，新增 `skills/do/SKILL.md`，frontmatter 使用 `name: do`。
- [x] 重写 `skills/research/SKILL.md` 出口，确保 research 不要求直接行动。
- [x] 重写 `skills/do/SKILL.md`，确保 do 只执行已收束任务，不承担 research 和 plan。
- [x] 更新 README 中 runtime skill 列表，把 `development` 改为 `do`；spec 当前没有内置阶段列表需要同步。
- [x] 给 skill discovery 增加当前仓库四阶段检查，确保没有 `development` 残留。
- [x] 给 `StoredMessage` 增加结构化 `source`，更新 message 创建、快照解析和保存。
- [x] 改 `isInternalMessage` / `readUserInput` 入口，让内部判断基于 source，不基于文本前缀。
- [x] 更新 conversation window、session brief、task state、compression tests，证明真实 `[internal]` 用户输入可见，内部 source 消息不可见。
- [x] 更新 title/memory turn lifecycle，让内部 wake 不触发会话标题和 session memory 更新。
- [x] 重构 cache layout：stable prefix 只取 static/profile；runtime facts 进入 volatile tail。
- [x] 更新 cache/evaluation 测试，用真实 runtime prompt layers 验证稳定前缀和 volatile 变化。
- [ ] 跑相关测试、typecheck、完整 verify。
- [ ] 更新本计划收口。

## 8. 验证计划

- `npm.cmd run test:build`
- `node --test .test-build/tests/skills/skill-discovery.test.js`
- `node --test .test-build/tests/context/compression.test.js`
- `node --test .test-build/tests/evaluation/harness.test.js`
- `npm.cmd run typecheck`
- `npm.cmd run verify`
- 搜索 `development`，确认只剩非 runtime 旧词或无当前产品残留。
- 搜索 `[internal]`，确认不再作为用户消息语义来源。

未验证内容：不做真实 provider 计费命中率验证，因为本轮不发真实网络模型请求。

## 9. 收口

目标已完成。

失败测试已变绿：

- 当前仓库 runtime skills 现在是 `do`、`plan`、`research`、`verification`。
- `research` 出口只交付调查结论和下一阶段建议，不再要求直接行动。
- `do` 承担执行阶段，原 `skills/development` 已删除。
- cache layout 的 stable prefix 只包含 static prompt 和 profile persona；runtime facts 和 near-field conversation 进入 volatile tail。
- `kitty eval` 的 cache check 使用真实 runtime prompt layers 验证稳定前缀。
- `StoredMessage.source` 成为内部 wake 边界事实；真实用户文本 `[internal] ...` 仍可见。
- 内部 wake turn 不触发 session title 和 session memory 重写。

改动文件：

- `skills/development/SKILL.md` 删除，新增 `skills/do/SKILL.md`。
- `skills/research/SKILL.md`、`README.md`、`plan.md`。
- `src/session/*`、`src/agent/turn/*`、`src/context/runtime/*`、`src/evaluation/checks.ts`、`src/host/turn.ts`、`src/types/session.ts`。
- `tests/skills/skill-discovery.test.ts`、`tests/context/compression.test.ts`、`tests/evaluation/harness.test.ts`、`tests/host/lead-wait-lifecycle.test.ts`、`tests/agent/session-memory-lifecycle.test.ts`。

已运行验证：

- `npm.cmd run test:build`
- `node --test .test-build/tests/skills/skill-discovery.test.js`
- `node --test .test-build/tests/context/compression.test.js`
- `node --test .test-build/tests/evaluation/harness.test.js`
- `node --test .test-build/tests/host/lead-wait-lifecycle.test.js`
- `node --test .test-build/tests/agent/session-memory-lifecycle.test.js`
- `npm.cmd run typecheck`
- `npm.cmd run verify`

完整验证结果：`npm.cmd run verify` 通过，168 个测试通过。

未验证内容：没有发真实 provider 请求验证真实计费缓存命中率。

剩余风险：无已知代码风险；真实 provider 命中率仍取决于 provider 对 prompt cache 的实现和实际请求序列。
