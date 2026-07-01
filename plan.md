# Kitty 默认 TUI 与展示收敛 Plan

## 1. 需求文档

用户要解决的实际问题是：TUI 已经成为更好的使用入口，裸 `kitty` 继续启动文字版交互不符合当前产品体验。同时官网刚加的副标题和示例横幅过度表达，偏离当前克制风格。

本轮要完成的体验：

- `kitty` 裸启动进入 TUI。
- `kitty "..."` 仍然支持一次性任务。
- `kitty agent` 保留文字版交互。
- `kitty tui` 作为显式 TUI 命令保留。
- README、官网、postinstall 和 spec 与入口事实一致。
- 官网不新增英文标语、副标题、小横幅。

## 2. 当前事实

- `src/cli/commands/session.ts` 当前负责裸 `kitty` 和 `kitty "prompt"`。
- `src/cli/commands/tui.ts` 当前负责 `kitty tui`。
- `src/shell/tui/start.ts` 已有 session picker、输入、滚动、runtime dock 和生命周期清理。
- `README.md` 当前写 `kitty` 启动交互式 agent，`kitty tui` 启动 TUI。
- `scripts/postinstall.cjs` 当前写 `kitty` 启动 TUI 前仍需同步。
- `site/index.html` 已恢复到原来的“找得准，改得对”表达，只保留 npm 安装命令模块。

## 3. 失败测试

以下情况视为失败：

- 裸 `kitty` 仍进入文字版交互。
- `kitty "prompt"` 被误改成 TUI。
- `kitty agent` 无法进入文字版交互。
- `kitty tui` 和裸 `kitty` 走两套启动逻辑。
- README / spec / postinstall 仍描述旧入口事实。
- 官网出现多余副标题、示例横幅或英文宣传语。

## 4. 目标

- 默认入口现代化：裸 `kitty` 进入 TUI。
- 入口边界清楚：一次性 prompt 继续一次性执行，文字版交互显式用 `kitty agent`。
- TUI 启动逻辑只有一份，避免 `kitty` 和 `kitty tui` 分叉。
- 展示文案收敛，只保留主句、正文、安装命令和能力卡片。

## 5. 不做范围

- 不升版本。
- 不 commit。
- 不 push。
- 不 publish。
- 不重做 TUI UI。
- 不全局汉化。

## 6. 设计

CLI 分发规则：

- `kitty`：无 prompt 时进入 TUI。
- `kitty "prompt"`：创建 session 并运行一次性 prompt。
- `kitty agent`：无 prompt 时进入文字版交互；带 prompt 时运行一次性 prompt。
- `kitty tui`：显式进入 TUI。

实现边界：

- 新增共享 `startTuiMode`，让 `kitty` 和 `kitty tui` 使用同一套启动逻辑。
- 不把 TUI 启动逻辑复制到多个 command。
- 不改变 session driver、provider、tools 和 runtime。

## 7. 实施任务

- [x] 新增共享 TUI 启动函数。
- [x] 让 `kitty tui` 调用共享 TUI 启动函数。
- [x] 让裸 `kitty` 调用共享 TUI 启动函数。
- [x] 保持 `kitty "prompt"` 一次性执行。
- [x] 保持 `kitty agent` 文字版交互。
- [x] 恢复官网原有 hero、卡片和宣传文案，只保留 npm 安装命令模块。
- [x] 更新 README、postinstall、spec。
- [x] 更新 CLI 测试。
- [x] 运行相关验证。

## 8. 验证计划

局部验证：

```bash
npm.cmd run test:build
node --test .test-build/tests/cli/program.test.js
```

轻量包验证：

```bash
node scripts/postinstall.cjs
```

## 9. 收口

已完成。

改动文件：

- `src/cli/commands/session.ts`
- `src/cli/commands/tui.ts`
- `src/cli/commands/tuiMode.ts`
- `src/cli/dependencies.ts`
- `src/cli/program.ts`
- `tests/cli/program.test.ts`
- `README.md`
- `scripts/postinstall.cjs`
- `site/index.html`
- `site/style.css`
- `site/script.js`
- `spec/技术实现/T06-配置初始化诊断/README.md`
- `spec/技术实现/T08-TUI与RuntimeUI/README.md`
- `spec/用户审阅/系统核心/核心地图.md`
- `plan.md`

完成事实：

- 裸 `kitty` 默认进入 TUI。
- `kitty "prompt"` 仍走一次性任务。
- `kitty agent` 保留文字版交互。
- `kitty tui` 复用同一 TUI 启动边界。
- 官网恢复到原来的“找得准，改得对”视觉和文案，只新增 npm 安装命令模块。
- TUI 会话选择页删除重复的小字 `Kitty Agent`，只保留艺术字 banner。
- 没有升版本。
- 没有 commit。
- 没有 push。
- 没有 publish。

已验证：

```bash
npm.cmd run test:build
node --test .test-build\tests\cli\program.test.js
node --test .test-build\tests\shell\tui-render.test.js
node scripts/postinstall.cjs
npm.cmd run build
node dist/cli.js --version
```
