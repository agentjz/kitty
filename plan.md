# Local Production Hardening Plan

## 1. 需求文档

Kitty 要在不依赖真实模型连续跑几天的前提下，提高本地生产可靠性。

使用者是准备把 Kitty 当日常工具的人。用户需要相信：安装包能用，第一次配置路径清楚，长 TUI 不容易卡，session 坏了不会拖垮列表，后台任务和大输出不会把现场弄乱。

当前范围包含本地可自动验证的生产硬化：TUI 长会话压力测试、session 损坏恢复、大输出治理压力测试、后台退出恢复演练、超重文件职责审查记录。发布包安装作为手动全局安装验收，不进入常规自动测试。

当前范围不包含真实 provider 连续多天实战、真实模型行为漂移评估、联网 API 长压测、完整 TUI 人工观感验收。

业务完成标准：不用真实 provider，也能通过一组本地验收证明 Kitty 的安装、数据、输出、TUI、后台和恢复路径更硬。

## 2. 当前事实

- `npm.cmd run verify` 当前通过，227 个测试通过。
- `package.json` 已有 build、test、verify；发布包安装可通过全局安装人工验收，不放入常规自动测试。
- CLI 已测试 `init`、`doctor`、`eval`、`events`、`background` 等入口。
- `SessionStore.listReadable` 能跳过损坏 session 并返回 skipped，但缺少 CLI/用户路径层面的损坏数据回归测试。
- TUI 已有布局、滚动、Markdown、projection cache 测试，但缺少大量消息、大量 Markdown、频繁窗口宽度变化的压力保护。
- tool output governance 已有投影测试和 bash 输出治理测试，但缺少超大输出不撑爆模型可见结果的压力测试。
- background 生命周期已有 list/wait/stop 和 recovery drill，但可以补充“运行中进程被标记 stale/退出后现场可读”的本地验收。
- 超过 300 行的核心文件有 `src/evaluation/checks.ts`、`src/shell/tui/transcriptLayout.ts`、`src/context/runtime/compression/builder.ts`、`src/session/snapshot.ts`、`src/provider/responsesAdapter.ts`、`src/host/turn.ts`、`src/protocol/manifest.ts`、`src/telegram/service.ts`；行数不是拆分理由，但必须做职责审查。

## 3. 失败测试

- 发布包 smoke：改为手动全局安装验收，不作为本轮自动失败测试。
- TUI 压力：当前没有测试证明 1000 条 transcript、复杂 Markdown 和 resize 下 projection 不全量重排历史。
- session 损坏恢复：当前缺少 CLI 层测试证明损坏 session 不会让 session 列表或事件路径整体失败。
- 大输出治理：当前缺少 10MB 级输出被压缩为有界 evidence 的测试。
- background 恢复：当前缺少面向 runtime scene 的 stale/running/background 现场表达测试增强。
- 职责审查：当前没有文档记录超重核心文件是否需要拆分、为什么保留或下一步怎么拆。

## 4. 目标

- 增加本地生产硬化测试，不依赖真实 provider。
- 增加 TUI 长会话压力测试，证明行数、滚动和 projection cache 在大 transcript 下可控。
- 增加 session 损坏恢复测试，证明损坏数据被暴露为 skipped，不阻断可读 session。
- 增加大输出治理压力测试，证明超大输出被有界投影，不把完整输出塞进模型可见结果。
- 增加 background 现场恢复测试，证明 stale/running 状态能被 runtime scene/status 看见。
- 在 `plan.md` 中记录超重文件职责审查结论；只在证据支持时拆分，不为了行数拆。
- 通过完整 `npm.cmd run verify`。

## 5. 不做范围

- 不做真实 provider 长时间测试。
- 不做联网 API 稳定性测试。
- 不新增企业安全沙箱。
- 不引入新 TUI 框架。
- 不为了超过 300 行自动拆文件。
- 不把测试写成口号检查。

## 6. 设计

主链路：

本地验收从用户入口和状态事实出发：发布包命令、session 数据、TUI transcript、background execution、tool output projection。测试只构造机器事实，不模拟模型语义判断。

模块边界：

- TUI 压力测试放在 shell TUI 测试，复用 `TuiTranscriptProjection` 和 store，不启动真实 TUI。
- session 损坏恢复测试放在 session/status 测试，验证 store 和 status 暴露 skipped；CLI picker 当前只消费可读 sessions，不额外呈现 skipped。
- 大输出治理测试放在 tool output kernel 测试，验证投影有界和 raw 可恢复边界。
- background 恢复测试放在 runtime/status 或 execution 测试，验证现场表达。
- 职责审查记录只写当前结论，不改代码主干，除非发现混杂职责必须拆。

错误、恢复、中断边界：

- 损坏 session 必须被记录为 skipped，不能吞掉。
- 大输出必须保留摘要和恢复线索，不能把完整 raw 输出塞进模型可见 evidence。
- TUI 压力测试不要求固定耗时，只要求 cache 行为和行数一致。

## 7. 实施任务

- [x] 新增 TUI 长会话压力测试，覆盖大量消息、Markdown、resize 和 projection cache。
- [x] 新增 session 损坏恢复测试，覆盖 `listReadable` 和 runtime status 的可恢复事实。
- [x] 新增大输出治理压力测试，覆盖 MB 级输出的有界投影。
- [x] 新增 background runtime scene 恢复测试，覆盖 running/stale/aborted 可见事实。
- [x] 对超过 300 行核心文件做职责审查，并在收口记录中写明拆或不拆的证据。
- [x] 运行局部测试。
- [x] 运行 `npm.cmd run verify`。
- [x] 更新收口记录。

## 8. 验证计划

- 运行新增局部测试文件。
- 运行 `npm.cmd run verify`。
- 检查 `git status --short`。
- 手动发布包 smoke：需要时做全局安装后检查 `kitty version`、`kitty init`、`kitty doctor`。
- 检查没有把旧能力、旧兼容或真实 provider 假测试写进当前主干。
- 未验证内容：真实模型长时间使用、真实终端人工观感。

## 9. 收口

已完成本地生产硬化实现和完整验证收口。

已改动：

- `src/runtime/scene.ts`：scene 现在包含 active executions 和 recent 中仍需恢复注意的 execution，避免 stale background 被“无 session”盖住。
- `src/cli/commands/runtimeStatusPresenter.ts`：status 文本展示 skipped session 数，并把 scene executions 作为当前现场呈现。
- `tests/shell/tui-store.test.ts`：增加 1000 条长 transcript / Markdown / resize / projection cache 压测。
- `tests/session/session-store.test.ts`：增加损坏 session 可跳过、可暴露测试。
- `tests/runtime/status.test.ts`：增加损坏 session status 展示、stale background recovery scene 测试。
- `tests/tools/output-kernel.test.ts`：增加 8MB+ generic output 有界投影测试。

职责审查：

- `src/evaluation/checks.ts` 647 行：职责已偏重，混合场景定义、检查执行、临时资源、WebSocket 演练。建议后续拆成 scenario registry、check runners、fixture helpers、remote entrypoint checks。
- `src/shell/tui/transcriptLayout.ts` 434 行：当前职责仍集中在 transcript 行模型和宽度布局，刚完成 Markdown span 接入，暂不拆；后续如果继续增长，应拆 span wrapping / role frame / style mapping。
- `src/context/runtime/compression/builder.ts` 380 行：职责集中在上下文压缩构造，保留；若再扩展 cache 策略，应拆 cache layout builder。
- `src/session/snapshot.ts` 356 行：职责集中在 session snapshot schema parse/serialize，保留；若 schema 继续增长，应拆 field readers。
- `src/provider/responsesAdapter.ts` 321 行：职责集中在 OpenAI Responses wire adapter，保留；若 tool-call event 分支继续增加，应拆 event reducer。
- `src/host/turn.ts` 313 行：职责集中在 host turn lifecycle，接近边界；后续增加恢复策略时应拆 turn boundary recorder / lead wait loop。
- `src/protocol/manifest.ts` 308 行：职责集中在 manifest schema parser，保留；若协议扩展应拆 validators。
- `src/telegram/service.ts` 306 行：职责集中在 Telegram polling service lifecycle，保留；若继续扩展命令，应拆 update loop handlers。

局部验证：

- `npm.cmd run test:build; node --test .test-build/tests/shell/tui-store.test.js .test-build/tests/session/session-store.test.js .test-build/tests/runtime/status.test.js .test-build/tests/tools/output-kernel.test.js`
- 26 个测试通过。

发布包 smoke：

- 按用户判断，不放入常规自动测试。需要时手动执行全局安装验收：全局安装后检查 `kitty version` / `kitty init` / `kitty doctor`。

完整验证：

- `npm.cmd run verify`
- 227 个测试通过。
