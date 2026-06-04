# 小猫智能体成熟体验收口计划

## 判断

小猫智能体现在不是缺少核心能力，而是需要把成熟 agent 的用户闭环打通。

成熟体验不是继续堆工具。成熟体验是：

- 空目录能启动。
- 配置问题能定位。
- 当前现场能看懂。
- 长任务能等待、恢复、终止。
- 记忆能接住连续性。
- skill/spec/subagent/team 都像真实工作流，不像孤立工具。
- 错误信息给下一步。

本轮收口只改体验主线，不改模型语义判断，不加机器语义分流。

## 对标原则

参考 `ref/repos` 中成熟项目，只取原则：

- Codex：thread/session 可恢复，工具和事件有结构化进度。
- Goose：configure/session/extension 边界清楚，session 可加载，扩展可见。
- LangGraph：长任务状态、checkpoint、interrupt 是运行事实。
- Letta：memory 是可审阅资产，不是聊天残渣。
- Aider：配置、诊断、错误提示服务用户下一步。
- opencode：初始化和 session 行为不要做特殊兼容壳，入口边界要清楚。

不复制外壳，不拼贴架构。

## 本轮交付

1. [x] `kitty init` 成为纯 bootstrap：空目录直接生成 `.kitty/.env`、`.kitty/.env.example`、`.kitty/.kittyignore`，不加载 runtime。
2. [x] CLI 配置错误统一转成可执行下一步：未初始化提示 `kitty init`，配置缺失提示文件位置和 `kitty doctor`。
3. [x] `kitty doctor` 在未初始化项目中给出明确 bootstrap 提示，而不是底层 env 错误。
4. [x] `kitty status` 输出先给现场摘要：当前目标、配置入口、session、memory、execution、team、spec、wake 的用户可见结论。
5. [x] `kitty status --json` 保持结构化事实不变。
6. [x] `config path` 保持 bootstrap 可用，不依赖 runtime。
7. [x] 测试覆盖首次启动、配置错误、status 现场摘要。
8. [x] 完整验证通过。

## 非目标

- 不引入权限沙箱。
- 不重写 provider。
- 不重写 memory。
- 不把用户话术写进 prompt。
- 不靠正则判断用户语义。
- 不为了“成熟”增加空壳命令。

## 验收标准

- 全新目录运行 `kitty init` 成功。
- 全新目录运行需要 runtime 的命令时，用户知道先运行 `kitty init`。
- 缺 API key 时，用户知道改哪个文件。
- `kitty status` 第一屏能回答“现在发生什么”。
- JSON status 仍是机器事实。
- `npm.cmd run verify` 通过。
