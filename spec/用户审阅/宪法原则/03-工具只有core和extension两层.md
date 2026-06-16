# 工具只有 core 和 extension 两层

工具体系只保留两层：

- `core`
- `extension`

Core 工具固定为 `read`、`edit`、`write`、`bash`。

Extension 是可启用、可禁用、独立存在的工具集合。当前 extension 是 `todo`、`worktree`、`network`、`background`、`subagent`、`skills`。

Skills 仍然是 extension，不是第三层工具体系。它只提供 skill 索引和按需加载；是否加载由模型判断。

不把扩展能力塞进 core，也不为同一能力保留平行入口。

当前落点：

- `src/tools/`
- `src/tools/index.ts`
- `src/extensions/`
- `src/config/extensions.ts`
