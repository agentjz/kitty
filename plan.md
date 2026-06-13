# Web Shell 体验

## 目标

`node dist/cli.js web` 启动一个嵌入式 HTTP 服务，提供手机/浏览器可访问的网页版聊天界面。交互逻辑与终端 Shell 完全一致，仅展示层不同。

## 当前事实

- `InteractionShell` 接口定义在 `src/interaction/shell.ts`，包含 `input: ShellInputPort`、`output: ShellOutputPort`、`createTurnDisplay()`
- `ShellInputPort` 有 `readInput()`、`readMultiline()`、`bindInterrupt()` 方法
- 终端实现位于 `src/shell/cli/shell.ts`，通过 `createCliInteractionShell()` 创建
- Telegram bot 是已有非终端 Shell 实现，位于 `src/telegram/`
- `src/web/` 目录当前不存在
- 项目使用 `commander` 注册 CLI 命令，telegram 命令注册在 `src/telegram/cli.ts`
- 浏览器原生支持 WebSocket，不需要额外前端库
- 前端引入 Bootstrap CDN + Markdown 渲染库 CDN，无构建工具
- 服务端需要 `ws` 包实现 WebSocket 服务器

## 设计

### 新增依赖
- `ws` — WebSocket 服务器（服务端需要）

### 新增文件（`src/web/`）

| 文件 | 职责 |
|---|---|
| `serveHtml.ts` | 返回内联 HTML 页面字符串（Bootstrap CDN + WebSocket 客户端 + Markdown 渲染库） |
| `inputPort.ts` | 实现 `ShellInputPort` — `readInput()` 等待 WebSocket 消息后 resolve |
| `outputPort.ts` | 实现 `ShellOutputPort` — 通过 WebSocket 推送文本到浏览器 |
| `turnDisplay.ts` | 实现 `InteractionTurnDisplay` — 流式输出逐段推送 WebSocket |
| `shell.ts` | 组装 `WebInteractionShell`（input + output + createTurnDisplay） |
| `index.ts` | `startWebShell()` — 启动 HTTP + WebSocket 服务，创建 session driver 并运行 |

### 新增文件（`src/cli/commands/`）
| 文件 | 职责 |
|---|---|
| `web.ts` | 注册 `web` 命令，解析 runtime，调用 `startWebShell()` |

### 修改文件
| 文件 | 改动 |
|---|---|
| `package.json` | 添加 `ws` 依赖 |
| `src/cli/program.ts` | 导入并注册 `registerWebCommand` |

### 启动流程

1. `kitty web` 解析 runtime
2. 创建 HTTP Server + WebSocket Server，监听 `0.0.0.0:PORT`
3. 检测局域网 IP，打印：
   - `🌐 Kitty Web Shell 已启动`
   - `📡 局域网地址: http://192.168.x.x:PORT`
   - `🛑 Ctrl+C 停止服务`
4. 创建 `WebInteractionShell`
5. 创建 `InteractiveSessionDriver` 并 `run()`
6. 浏览器访问 → 收到 HTML 页面 → 建立 WebSocket 连接
7. 用户输入 → WebSocket → `readInput()` resolve → agent 处理 → 流式输出 → WebSocket 推回页面
8. Ctrl+C → 关闭 server → 退出

### WebSocket 协议

#### 客户端 → 服务端
```json
{"type":"input","text":"用户消息"}
{"type":"interrupt"}
```

#### 服务端 → 客户端
```json
{"type":"delta","text":"部分文本"}     // 流式增量
{"type":"message","text":"完整消息"}   // 整段消息（工具调用、状态等）
{"type":"interrupt","text":"中断提示"} // 中断通知
```

### 页面布局

- 底部固定栏：文本输入框 + 📤 发送按钮 + ⏸ 暂停按钮（Bootstrap Icons）
- 上方聊天区域：消息列表，自动滚动到底部
- Markdown 渲染：使用 CDN 加载 marked 或 markdown-it
- 响应式：Bootstrap 网格，手机竖屏/电脑横屏自适应

## 改动清单

- [ ] `npm install ws` + package.json 添加依赖
- [ ] 新建 `src/web/serveHtml.ts`
- [ ] 新建 `src/web/inputPort.ts`
- [ ] 新建 `src/web/outputPort.ts`
- [ ] 新建 `src/web/turnDisplay.ts`
- [ ] 新建 `src/web/shell.ts`
- [ ] 新建 `src/web/index.ts`
- [ ] 新建 `src/cli/commands/web.ts`
- [ ] 修改 `src/cli/program.ts`
- [ ] 构建 & 本地验证
- [ ] 运行 `npm run verify`

## 验收

- `node dist/cli.js web` 启动成功，打印局域网地址
- 手机浏览器访问地址，看到聊天界面
- 输入文字点发送，Kitty 回复逐字流式出现在页面
- Markdown 格式正常渲染
- 点暂停按钮中断当前回复
- 终端 Ctrl+C 停止服务
- 终端同时显示所有交互日志
