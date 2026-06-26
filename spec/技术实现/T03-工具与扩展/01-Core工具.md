# Core 工具

Core 工具文件：

- `src/tools/read.ts`
- `src/tools/edit.ts`
- `src/tools/write.ts`
- `src/tools/bash.ts`

Core 工具名：

- `src/tools/index.ts`

工具 registry：

- `src/tools/registry.ts`
- `src/tools/core/registry.ts`
- `src/tools/core/runtimeRegistry.ts`

工具输出治理：

- `src/tools/outputGovernance/`

`bash` 工具执行后把完整原始输出写入可恢复路径，再把模型可见输出交给 output governance。治理层按输出类型分类，生成 test / build / typecheck / search / git diff / generic 的有界投影，并记录 raw chars、projected chars、raw tokens、projected tokens、saved tokens、savings ratio、truncated、output path 和 degraded reason。

这层只负责保存、压缩、投影和记录机器事实。不判断任务重要性，不替模型选择路线，不把搜索命中当成语义结论。
