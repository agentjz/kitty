# 职责审查

单一职责看变化原因，不看行数。

超过 300 行必须触发审查，但不是自动拆分理由。

## 当前结论

### `src/evaluation/checks.ts`

职责：本地 eval scenario 清单、local check 分发和 local fixture 验收。

不负责：production provider 实战、CLI 参数解析、test runner。

当前结论：需要拆。它已经同时包含 scenario 数据、runner、fixture 和多类检查实现，变化原因过多。本轮优先保证 production eval 厚度；后续再按 check domain 拆成 local checks 目录。

### `src/shell/tui/transcriptLayout.ts`

职责：TUI transcript 的可见行投影、宽度计算、滚动窗口和 markdown display facts。

不负责：Ink 组件渲染、session 存储、provider 请求。

当前结论：暂不拆。它的变化原因集中在“transcript 可见布局”。拆散会增加宽度模型分裂风险。触发拆分条件：markdown block layout、scroll projection、cache 三者任一继续独立膨胀。

### `src/context/runtime/compression/builder.ts`

职责：把 prompt layers 和 session messages 变成 provider request，并产出 context budget/cache layout facts。

不负责：provider 请求、session memory 写入、project map 生成。

当前结论：暂不拆。它维护的是同一个上下文预算算法。触发拆分条件：reasoning replay、tool output compaction、budget report 任一开始独立变化。

### `src/session/snapshot.ts`

职责：session snapshot 的 parse、normalize、serialize 和迁入当前 schema 的正向校验。

不负责：session store 文件读写、memory asset 投影。

当前结论：暂不拆。变化原因集中在 session schema。触发拆分条件：schema validation 和 normalization 开始需要不同测试矩阵。

### `src/provider/responsesAdapter.ts`

职责：OpenAI Responses API wire conversion。

不负责：Chat Completions、catalog、transport、retry。

当前结论：暂不拆。它是单一 wire adapter。触发拆分条件：stream parser、request builder、response mapper 继续扩展到需要独立测试 fixture。

### `src/host/turn.ts`

职责：宿主层一次 turn 的生命周期边界，包括 start/finish events、tool registry 生命周期、lead wait wake 和错误收口。

不负责：agent loop 内部策略、provider 请求、UI 渲染。

当前结论：暂不拆。当前复杂度来自同一 host lifecycle。触发拆分条件：lead wait closeout 或 event recording 继续独立变化。

### `src/protocol/manifest.ts`

职责：当前能力 manifest 的结构化描述。

不负责：执行工具、加载 extension、运行 skill。

当前结论：暂不拆。它是协议事实聚合。触发拆分条件：manifest schema、rendering、registry adapter 出现独立发布边界。

### `src/telegram/service.ts`

职责：Telegram polling/service lifecycle。

不负责：agent turn 实现、message chunking、file download 细节。

当前结论：暂不拆。它承担一个 host service 的生命周期。触发拆分条件：polling、delivery、session binding 任一继续加厚。
