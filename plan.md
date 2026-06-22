# TUI 长会话性能 Plan

## 1. 需求文档

用户已经能舒服地使用 Kitty TUI。现在要解决的是长会话变多后卡顿的问题。

使用者是长期把 Kitty 当生产工具的人。用户在一个 session 里连续聊天、看历史、滚动、等待流式回复时，TUI 应该保持顺滑，不因为历史消息变多就明显卡住。

用户体验上要做到：

- 长会话打开后可以继续滚动和输入。
- 模型流式回复时，界面稳定刷新，不因为每个小片段都全屏重算而卡顿。
- 旧消息已经稳定后不反复解析和换行。
- 当前屏幕只渲染当前需要看的行。
- 滚动、窗口 resize、底部状态刷新不应该触发整段历史的重复 markdown 解析。

当前范围包含 TUI transcript 的投影缓存和可见窗口渲染。

当前范围不包含换 TUI 框架、不重写 agent/session/provider 主链路、不做 Web/TUI 统一 UI 框架、不做复杂虚拟列表库。

业务上完成的标准：长会话性能主因从“每次全量重算”变成“稳定消息复用缓存，活跃消息局部更新，可见窗口渲染”。

## 2. 当前事实

当前代码事实：

- `src/shell/tui/store.ts` 的 `TuiState.transcript` 保存当前 session 的可见消息投影。
- `createInitialTuiState(session)` 会把 session messages 转成 TUI transcript entries。
- `appendTranscriptText()` 对 streaming assistant/reasoning 会更新最后一条 entry 的 text。
- `src/shell/tui/components/Transcript.ts` 每次渲染调用 `renderTranscriptLineViews(state.transcript, width).slice(...)`。
- `renderTranscriptLineViews()` 当前会遍历全部 entries。
- `src/shell/tui/transcriptLayout.ts` 对 assistant/reasoning 调用 `renderMarkdownLines()`，内部使用 `marked.lexer()`。
- 每次测量行数 `measureTranscriptRows()` 也会重新调用完整 layout。
- 滚动函数 `getMaxScrollOffset()` 通过 `measureTranscriptRows()` 计算最大 offset。
- dock 状态更新会更新 TUI state；如果 Transcript 组件重新渲染，当前实现没有显式 projection cache。
- 当前 TUI 已有滚动、markdown、宽字符、光标、mouse wheel、runtime dock、session picker 测试。

当前测试事实：

- `tests/shell/tui-store.test.ts` 覆盖滚动、streaming 合并、换行、markdown 行视图。
- `tests/shell/tui-render.test.ts` 覆盖 Transcript 渲染、markdown 输出、长文本 wrap、光标坐标。
- 目前没有测试保护“稳定消息不重复 markdown 解析”。
- 目前没有测试保护“Transcript 只渲染 visible rows”以外的 projection 缓存行为。

外部参考事实：

- opencode 把 session message、part、tool、reasoning、text delta 拆成有 id 的结构，流式更新时只更新对应 part。
- opencode 的 TUI 用真实 scroll container 管 children 和 scrollTop，不靠每次全量字符串 slice 作为核心模型。
- kilocode 的 markdown stream 相关实现体现了 stable block 思路：稳定块缓存，流式末尾局部更新。
- Textual 的成熟结构是 ScrollView、RichLog、Markdown widget 分层，各自负责滚动、追加和渲染。
- Ink 本身不会自动给长列表做虚拟化；基于 Ink 的长会话需要项目自己控制投影缓存和刷新频率。

当前缺口：

- 没有 transcript projection cache。
- 没有按 entry id / width / text signature 复用 markdown+wrap 结果。
- 滚动最大 offset 计算仍可能全量重算。
- TUI state 同时承担事实投影和渲染入口，缺少独立 projection 层。

当前未知点：

- 真实长会话下的具体帧耗时没有内置 profiler；本轮用结构性测试保护主要性能路径。
- Ink 内部 diff/render 成本仍存在，本轮只减少 Kitty 自己的重复 projection 成本。

## 3. 失败测试

自动失败测试：

- 如果同一批 transcript 在同一宽度下连续渲染两次，稳定 entry 的 markdown/layout 被重复计算，应失败。
- 如果只追加一个 streaming delta，旧 entry 的 cached rows 被重新生成，应失败。
- 如果 dock 更新导致 state 变化，但 transcript 引用和宽度不变时，Transcript 重新全量 projection，应失败。
- 如果滚动读取 visible rows 需要重新解析全部 markdown，应失败。
- 如果 viewport 只需要 8 行，但 Transcript 实际渲染超过 visible rows，应失败。
- 如果宽度变化后缓存没有按宽度失效，应失败。
- 如果 streaming delta 走两套不同更新路径，应失败。

命令验证：

- `npm.cmd run test:build`
- `node --test .test-build\tests\shell\tui-*.test.js`
- `npm.cmd run verify`

手动检查：

- 打开长 session，滚动历史、等待流式回复、调整窗口大小，观察卡顿是否明显降低。

## 4. 目标

- 新增 TUI transcript projection 层。
- 稳定消息按 entry id、role、text、width 缓存 markdown 和 wrap 后的 line views。
- Transcript 组件通过 projection 层拿 visible rows，不再自己全量 layout 后 slice。
- Store/Controller 的滚动最大 offset 使用 projection row count，不重复跑纯 layout。
- 流式输出继续立即进入 TUI controller；性能优化不靠首帧/后续帧特判。
- 保持当前 TUI 用户体验、视觉和测试行为不变。
- 增加性能结构测试，防止未来退回全量重算模型。

## 5. 不做范围

- 不替换 Ink。
- 不引入 OpenTUI、Bun 或独立 TUI 框架。
- 不做完整虚拟 DOM 引擎。
- 不改变 session 事实存储。
- 不改变模型上下文管理。
- 不改变用户可见消息内容。
- 不删除当前 markdown 渲染能力。
- 不用“隐藏历史”解决卡顿。

## 6. 设计

主链路：

`session/messages/events -> TuiState.transcript -> TranscriptProjectionCache -> visible line views -> Ink Transcript render`

模块边界：

- `transcriptLayout.ts`：保留单条 entry 到 line views 的纯布局能力，不持有缓存。
- `transcriptProjection.ts`：新增 projection cache，负责缓存、失效、visible slice、row count。
- `store.ts`：保留 TUI state reducer 和兼容纯函数；需要 row count 时可接收 projection。
- `controller.ts`：持有 TUI 运行期 projection cache。
- `components/Transcript.ts`：只渲染 projection 给出的 visible rows。
- `turnDisplay.ts`：继续只把 agent callbacks 投给 controller，不直接处理缓存。

状态归属：

- session record 仍是会话事实源。
- TUI transcript 仍是屏幕投影源。
- projection cache 是运行时派生缓存，不写入 session，不进入 memory，不作为业务事实。
- scroll offset 仍在 TUI state。

缓存规则：

- cache key：`entry.id + width`。
- cache signature：`entry.role + entry.text`。
- 同 id、同 width、同 signature 复用 line views。
- text 或 role 变化只失效该 entry 对应 width 的缓存。
- width 变化只重算当前 width；其他 width 可保留或按需清理。
- entries 删除或替换后 purge 不在当前 transcript 的 id。

流式刷新：

- 每个 delta 走同一条 `appendStreaming()` 路径。
- 不做首个 delta、后续 delta、首次回答、再次回答之类的策略分叉。
- 流式手感保持立即可见；性能主因交给 projection cache 和 visible rows。

错误和恢复：

- projection cache 失败不能吞掉消息；纯 layout 函数仍可作为 fallback。
- dispose 后不能继续通知 listener。

测试边界：

- 用 instrumentation 计数证明 cached projection 不重复 layout 稳定 entry。
- 用 controller 测试证明多个 streaming delta 走同一条更新路径。
- 保留现有 render tests，证明视觉输出不变。

## 7. 实施任务

- [x] 新增 `transcriptProjection.ts`，封装 projection cache、row count、visible slice。
- [x] 调整 `transcriptLayout.ts`，导出单 entry layout 能力并支持测试计数注入。
- [x] 调整 `store.ts`，让 visible rows / max offset 可使用 projection cache，同时保留纯函数兼容。
- [x] 调整 `controller.ts`，持有 projection cache，并把 scroll/resize/content append 接到缓存 row count。
- [x] 调整 `components/Transcript.ts`，使用 controller/projection 提供的 visible line views，避免组件内全量 layout。
- [x] 删除 streaming 首 delta/后续 delta 特判，保留统一立即更新路径。
- [x] 增加 TUI projection/cache/streaming 同路径测试。
- [x] 跑 TUI 局部测试。
- [x] 跑完整验证。
- [x] 更新收口记录。

## 8. 验证计划

局部验证：

```bash
npm.cmd run test:build
node --test .test-build\tests\shell\tui-*.test.js
```

完整验证：

```bash
npm.cmd run verify
```

手动验收：

```bash
node dist/cli.js tui
```

手动检查长 session：

- 打开历史较长的 session。
- 滚动到顶部和底部。
- 发送一条会产生长回复的消息。
- 观察 streaming 期间输入区、滚动区、底部状态是否顺滑。
- 调整终端宽度，确认换行正确且不丢消息。

未验证内容：

- 自动测试不能完全测出真实终端渲染帧率；需要真实长 session 体验确认。

剩余风险：

- Ink 自身的 React tree diff 和终端输出仍有成本；本轮只解决 Kitty 自身重复 projection 的主因。
- 极端超长单条消息仍然需要重算该条 active message；后续可进一步做 markdown stable block。

## 9. 收口

已完成。

完成事实：

- 新增 [transcriptProjection.ts](C:/Users/Administrator/Desktop/kitty/src/shell/tui/transcriptProjection.ts)，把 transcript projection cache 独立成运行时派生层。
- `transcriptLayout.ts` 导出单条 entry 的纯布局函数，继续只负责布局，不持有缓存。
- `store.ts` 的 scroll、visible rows、max offset 计算可以接收 projection cache；默认纯函数路径仍保留。
- `TuiController` 持有 projection cache，滚动、resize、append 都走同一缓存边界。
- `Transcript` 主路径改为从 controller 获取可见行，不再在组件里每次全量 layout 后 slice。
- streaming 继续统一立即进入 transcript，不做首 delta/后续 delta 策略分叉；性能优化由 projection cache 承担。
- 新增测试保护稳定 entry 缓存、宽度失效、可见窗口和 streaming 同路径更新。

验证事实：

- `npm.cmd run test:build; node --test .test-build\tests\shell\tui-*.test.js` 通过，35 个 TUI 测试全绿。
- `npm.cmd run verify` 通过，214 个测试全绿。

未验证内容：

- 未在真实交互 TTY 中打开超长 session 手动感受帧率；自动测试只能证明结构性重复计算被移除。

剩余风险：

- 极端超长单条 active assistant message 仍需要重算该条消息；后续如果还卡，应做 markdown stable block，而不是回到全量重算。
- Ink 自身的 React diff 和终端输出成本仍存在，本轮只解决 Kitty 自己重复 projection 的主因。

commit / push：

- 用户未明确要求，本轮未 commit、未 push。
