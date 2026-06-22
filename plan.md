# TUI Markdown Render Kernel Plan

## 1. 需求文档

Kitty 的 TUI 要像成熟 agent 终端一样显示模型回复：标题、列表、引用、代码块、表格、行内代码、链接、加粗和斜体都应该自然呈现。

使用者是在 TUI 里长时间对话、读代码、看计划、看工具结论的人。用户不应该看到 Markdown 源码符号漏出来，也不应该因为回复变长而滚动、换行、缓存变慢。

当前范围包含 TUI 里的 assistant / reasoning Markdown 展示、终端宽度换行、滚动行数计算、长会话投影缓存和测试保护。

当前范围不包含 Web Markdown 重写、完整 HTML 渲染、浏览器复制按钮、重型语法高亮系统。

业务完成标准：TUI 回复看起来像结构化文档，长会话仍按可见行滚动，源码消息仍原样保存在 transcript，不为了渲染改变事实。

## 2. 当前事实

- `src/shell/tui/markdown.ts` 使用 `marked.lexer` 解析 block，但随后把内容压成 `{ kind, text }` 平面行。
- 行内 Markdown 目前通过 `stripMarkdownInline` 的字符串替换剥离，无法保留 strong / em / code / link 的展示语义。
- `src/shell/tui/transcriptLayout.ts` 负责角色布局、宽度计算、换行和 Markdown 行样式，但只能给整行设置一种样式。
- `src/shell/tui/components/Transcript.ts` 只渲染 `row.text`，没有 span 渲染入口。
- `TuiTranscriptProjection` 已经按 entry id、文本和宽度缓存单条消息布局，没有全历史每帧重排。
- 当前测试只覆盖标题、列表、代码、引用没有漏出代码围栏；没有覆盖行内样式、链接、代码语言、宽字符表格和 span 渲染。
- `package.json` 已有 `marked`、`string-width`、`wrap-ansi`、`ink`，不需要为了本轮引入重型 Markdown 依赖。
- opencode 的成熟经验是把 assistant 内容作为 markdown renderable 处理，不手写剥离成普通文本；Web 端有 parse / sanitize / cache / streaming block。
- Codex 的成熟经验是保留原始 Markdown，流式阶段按稳定边界提交，最终用 source-backed Markdown cell 重排。
- Goose 的经验暴露了长会话不能每轮重建全部 Markdown，否则会拖慢甚至 OOM。

## 3. 失败测试

- 行内 Markdown：`**bold**`、`*em*`、`` `code` ``、`[text](url)` 现在只能变成普通字符串，无法给 TUI 渲染层提供 span。
- 代码块语言：```ts 的 `ts` 当前丢失，TUI 无法显示语言标签。
- 表格宽度：当前用 `.length` 计算列宽，中文等宽字符会错位。
- Transcript 渲染：当前组件无法渲染一行内不同样式。
- 长会话性能：必须继续证明投影缓存只重排文本或宽度变化的 entry。
- 滚动一致性：布局行数和实际 Ink 输出行数必须保持一致，不能让 Ink 二次换行制造不可控行。

## 4. 目标

- TUI Markdown 主链路改成结构化 render kernel：Markdown source -> block/line/span -> transcript rows -> Ink span rendering。
- 原始消息文本仍由 transcript 保存，渲染只做投影，不改变事实。
- 行内样式保留到 `TuiTranscriptLineView`，组件按 span 渲染。
- 代码块保留语言标签；表格按终端 display width 对齐。
- 现有 projection cache 保留，长会话不全量重排。
- 增加自动测试覆盖 Markdown 内核、Transcript 集成和缓存行为。
- 大改后通过 `npm.cmd run verify`。

## 5. 不做范围

- 不做 Web Markdown。
- 不做完整语法高亮引擎。
- 不引入 opencode/OpenTUI 作为运行依赖。
- 不做旧 Markdown 平面行兼容分支；当前源码只保留当前实现主干。
- 不把 Markdown 渲染问题写成提示词规则。

## 6. 设计

主链路：

用户和模型消息仍进入 `TuiTranscriptEntry.text`。TUI 布局读取 entry，根据角色决定是否走 Markdown render kernel。Markdown kernel 使用 `marked` 解析 block 和 inline token，输出 display line。布局层按角色 frame 计算 body width，再把 line/span 按 display width 切成 transcript row。组件层只按 row frame 和 row spans 渲染。

模块边界：

- `markdown.ts`：Markdown render kernel 门面，负责把 Markdown source 转成 TUI display lines。
- `markdownInline.ts`：只负责 inline token 到 span，不判断内容重要性。
- `markdownTable.ts`：只负责表格 display-width 对齐。
- `transcriptLayout.ts`：只负责角色 frame、Markdown 行到 transcript row、宽度切行和样式映射。
- `Transcript.ts`：只负责 Ink 呈现，不解析 Markdown，不计算布局事实。

状态归属：

- 原始消息归 transcript。
- Markdown display model 是可丢弃投影。
- 行数、滚动和可见窗口继续由 TUI state / projection 主干维护。

错误边界：

- Markdown 解析失败时退化为纯文本 display line，但不丢消息。
- 宽度过窄时优先保证不越界，长词按 display width 切开。
- 链接在终端显示为 `text (url)`，但 span 仍标记为 link，便于后续增强。

测试影响：

- 增加 Markdown kernel 单测。
- 更新 transcript layout / render 测试验证 span、代码语言、宽字符表格。
- 保留缓存测试，确认没有全历史重排。

文档影响：

- 本轮是 TUI 内部能力增强，不改变公开命令；README 不需要新增入口。

## 7. 实施任务

- [x] 新增 `src/shell/tui/markdownInline.ts`，把 marked inline token 转成 `TuiMarkdownSpan`。
- [x] 新增 `src/shell/tui/markdownTable.ts`，用 `string-width` 做表格列宽和 padding。
- [x] 重写 `src/shell/tui/markdown.ts`，输出带 spans 和 code language 的 display lines。
- [x] 更新 `src/shell/tui/transcriptLayout.ts`，让 transcript row 支持 spans，并由同一宽度模型切行。
- [x] 更新 `src/shell/tui/components/Transcript.ts`，渲染 row spans，不在组件里解析 Markdown。
- [x] 增加 `tests/shell/tui-markdown.test.ts` 覆盖行内样式、代码语言、链接、宽字符表格和 fallback。
- [x] 更新现有 TUI store/render 测试，验证 Markdown 渲染和滚动行数仍一致。
- [x] 运行局部测试和完整验证。
- [x] 更新收口记录。

## 8. 验证计划

- 运行 `npm.cmd run test:core -- --test-name-pattern tui` 或等价局部测试，验证 TUI Markdown、布局、组件。
- 运行 `npm.cmd run verify`，验证类型、构建和全量测试。
- 手动检查构建产物不引入 CLI/TUI 静态耦合。
- 文档同步检查：确认 README 无新增命令事实需要更新。
- 未验证内容：真实终端截图和人工观感需要用户在 TUI 中体验。

## 9. 收口

目标已完成。

改动文件：

- `src/shell/tui/markdown.ts`
- `src/shell/tui/markdownInline.ts`
- `src/shell/tui/markdownTable.ts`
- `src/shell/tui/markdownTypes.ts`
- `src/shell/tui/transcriptLayout.ts`
- `src/shell/tui/components/Transcript.ts`
- `src/shell/tui/store.ts`
- `tests/shell/tui-markdown.test.ts`
- `tests/shell/tui-store.test.ts`
- `tests/shell/tui-render.test.ts`
- `plan.md`

验证结果：

- 局部 TUI 测试：`npm.cmd run test:build; node --test .test-build/tests/shell/tui*.test.js`，39 个测试通过。
- 完整验证：`npm.cmd run verify`，222 个测试通过。

文档同步：

- 本轮没有新增公开命令或配置项，README 不需要同步。

未验证内容：

- 未做真实终端截图审阅；需要在 `node dist/cli.js tui` 中人工体验 Markdown 观感。

剩余风险：

- 本轮未引入完整语法高亮；代码块已保留语言标签和 code span，可后续在同一 render kernel 上增强。

commit / push：

- 用户本轮未要求 commit 或 push，未执行。
