# Slash Commands Plan

## 1. 需求文档

用户想要类似 OpenCode 的斜杠命令体验，但当前先不做 TUI。

真正要解决的问题是：用户在交互对话里输入 `/status`、`/background`、`/memory` 这类命令时，应该直接看到本地现场，而不是把这些文字发给模型。

使用者是 Kitty 交互模式用户。用户完成任务时应该看到：

- 输入 `/help` 能看到当前可用斜杠命令。
- 输入 `/status` 能看到当前项目现场。
- 输入 `/background` 能看到后台任务现场。
- 输入 `/memory`、`/skills`、`/events`、`/doctor` 能看到对应本地事实。
- 输入 `/sessions`、`/copy`、`/export`、`/clear`、`/exit` 有明确行为。
- 未来 TUI 能从同一份命令注册表读取命令名、说明、别名和分类。

当前范围包含：

- 建立一处 slash/local command 注册表。
- 扩展当前交互模式可执行的本地命令。
- 更新 help 和 interactive intro。
- 增加测试保护命令识别、帮助输出和本地执行。
- README 同步当前斜杠命令体验。

当前范围不包含：

- 不实现 TUI。
- 不做命令补全 UI。
- 不新增模型切换、主题切换、fork、provider connect。
- 不做会话内 `/new`。当前 `kitty` 启动前已经提供新建/恢复选择；会话内切换需要 driver 生命周期重构，不能做假入口。
- 不做旧兼容包装。

业务完成标准：

- 交互模式中的斜杠命令不会进入模型。
- 所有可用命令来自同一注册表。
- 测试能证明命令列表、帮助和关键命令行为可用。

## 2. 当前事实

当前代码事实：

- `src/interaction/localCommandDefinitions.ts` 已有本地命令定义：exit、reset、help、session、config、multiline。
- `src/interaction/localCommands.ts` 执行这些命令。
- `src/shell/cli/intro.ts` 手动挑选部分命令展示。
- `src/cli/commands/*` 已有 CLI 能力：status、background、events、memory、doctor、sessions、init、config、eval、web 等。
- `src/web/turnDisplay.ts` 把工具生命周期作为 status 输出，不把工具内容塞进普通消息。
- opencode 的 slash 命令来自 keymap/command registry 的 `slashName`，不是 TUI 内部硬编码一份列表。

当前测试事实：

- `tests/interaction/local-commands.test.ts` 覆盖现有本地命令。
- `tests/shell/interactive-intro.test.ts` 覆盖 intro 展示。
- `tests/cli/program.test.ts` 覆盖 CLI 顶层命令存在。

当前文档事实：

- README 已列出 CLI 命令，但没有说明交互模式 slash commands。

当前缺口：

- 本地命令和未来 TUI slash command 没有统一 metadata。
- 交互模式缺少 `/status`、`/background`、`/memory`、`/skills`、`/events`、`/doctor` 等生产现场命令。
- `/help` 和 intro 不是从同一命令集合自然生成。

当前未知点：

- 正式 TUI 的命令补全交互还未实现。

## 3. 失败测试

- 如果命令定义不能导出 slash command metadata，应失败。
- 如果 `/help` 没有列出当前可用斜杠命令，应失败。
- 如果 `/status`、`/background`、`/memory`、`/skills`、`/events`、`/doctor` 进入模型而不是本地处理，应失败。
- 如果 intro 仍然手动维护另一份命令事实，应失败。
- 如果 README 不说明交互 slash commands，应失败。

## 4. 目标

- `localCommandDefinitions` 成为交互 slash command 的唯一注册表。
- `handleLocalCommand` 支持生产常用命令并输出本地事实。
- CLI intro 和 `/help` 从注册表生成。
- 测试覆盖命令 metadata、帮助输出、关键命令行为。
- README 同步交互 slash command 能力。

## 5. 不做范围

- 不做 TUI。
- 不做 command palette。
- 不做模糊搜索。
- 不做模型路由或 provider 切换。
- 不做主题系统。

## 6. 设计

主链路：

用户输入 -> normalize local command -> 本地命令执行 -> 输出本地事实 -> 不进入模型。

模块边界：

- `src/interaction/localCommandDefinitions.ts` 只维护命令定义、别名、分类、展示顺序和格式化。
- `src/interaction/localCommands.ts` 只执行本地命令。
- `src/shell/cli/intro.ts` 只呈现注册表给出的命令。
- `tests/interaction/local-commands.test.ts` 覆盖命令识别和执行。
- `tests/shell/interactive-intro.test.ts` 覆盖 intro 不维护第二份命令事实。

状态归属：

- session/config/status/background/memory/events 等事实仍来自现有 store 和 runtime status。
- slash command 不制造新状态。
- `/clear` 只清空当前输入语义，在 readline CLI 中等价于本地 handled 提示；正式 TUI 可用同一命令 metadata 实现清空输入框。

错误边界：

- 没有 session events 时输出明确提示。
- status/background/memory/doctor 失败时输出错误文本，不把失败转给模型。
- 不存在的 slash 输入继续发给模型，避免本地命令层截断用户正常表达。

## 7. 实施任务

- [x] 扩展 `src/interaction/localCommandDefinitions.ts`，加入统一 slash command metadata、分类和帮助格式。
- [x] 扩展 `src/interaction/localCommands.ts`，实现 status、background、memory、skills、events、doctor、sessions、copy、export、clear。
- [x] 修改 `src/shell/cli/intro.ts`，从注册表生成命令说明。
- [x] 更新 `tests/interaction/local-commands.test.ts`，覆盖新增命令行为和 metadata。
- [x] 更新 `tests/shell/interactive-intro.test.ts`，覆盖 intro 生成。
- [x] 更新 README，说明交互 slash commands。
- [x] 运行局部测试和完整验证。
- [x] 更新收口。

## 8. 验证计划

局部验证：

- `npm.cmd run test:build`
- `node --test .test-build/tests/interaction/local-commands.test.js`
- `node --test .test-build/tests/shell/interactive-intro.test.js`

完整验证：

- `npm.cmd run verify`

手动检查：

- `node dist/cli.js` 进入交互后 `/help`、`/status`、`/background` 行为可读。

未验证内容：

- 正式 TUI 命令补全，因为本轮不做 TUI。

## 9. 收口

已完成。

完成事实：

- 交互 slash command 由 `src/interaction/localCommandDefinitions.ts` 统一维护，包含命令 id、分类、别名、slash name、说明、help 文本和 intro 展示标记。
- `/help` 和 CLI intro 都从同一注册表生成，不再各自维护命令列表。
- 交互模式新增本地处理：`/status`、`/background`、`/memory`、`/skills`、`/events`、`/doctor`、`/sessions`、`/copy`、`/export`、`/clear`。
- 本地 runtime 命令读取当前项目 state root 的事实，不把已注册 slash 输入发给模型。
- `/new` 没有进入当前实现；当前真实新建会话入口仍是 `kitty` 启动时的会话选择器。
- README 已增加交互模式斜杠命令说明。

修改文件：

- `plan.md`
- `README.md`
- `src/cli/commands/events.ts`
- `src/cli/commands/memory.ts`
- `src/interaction/localCommandDefinitions.ts`
- `src/interaction/localCommands.ts`
- `src/interaction/sessionDriver.ts`
- `src/shell/cli/intro.ts`
- `tests/interaction/local-commands.test.ts`
- `tests/shell/interactive-intro.test.ts`

验证结果：

- `npm.cmd run test:build` 通过。
- `node --test .test-build/tests/interaction/local-commands.test.js` 通过。
- `node --test .test-build/tests/shell/interactive-intro.test.js` 通过。
- `npm.cmd run verify` 通过，178 个测试全部通过。

未验证内容：

- 正式 TUI 命令补全未验证，因为本轮明确不做 TUI。

剩余风险：

- 已注册 slash command 会被本地截获；未注册的 `/...` 输入仍会发送给模型，以避免误伤用户正常表达。
