# 工具与扩展

工具层由 `src/tools/` 和 `src/extensions/` 组成。

`src/tools/` 管 core 工具和工具 runtime。

`src/extensions/` 管 extension 工具集合。

`src/protocol/` 管 extension 能力协议、package、port、governance 和收敛检查。

`src/host/toolRegistry.ts` 负责把 core 工具面和当前启用的六个 extension 工具集合装配成当前入口真实暴露给模型的工具面。
