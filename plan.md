# 工具输出治理系统 Plan

## 1. 需求文档

用户要解决的是省 token 和保持上下文干净。

Kitty 执行命令、搜索、测试、构建、后台任务时，经常会产生很长输出。成熟体验不是把这些输出直接塞给模型，也不是简单截断后丢失证据，而是：

- 用户和模型先看到短、准、可行动的结果。
- 完整原始输出仍然可恢复。
- 上下文只承载当前推理需要的证据。
- 状态里能看到哪些工具输出最费 token、压缩是否有效。

使用者是日常用 Kitty 做开发、测试、搜索、调试和长任务的人。

完成后的体验：

- 命令输出很长时，模型不会被日志淹没。
- 失败测试、构建错误、搜索结果会更像“证据摘要”，不是原始日志。
- 需要完整输出时，能看到保存路径。
- `kitty status` 能看到最近工具输出治理情况和节省比例。

当前范围包含：

- bash 工具输出治理。
- 工具结果进入模型前的统一投影。
- 原始输出保存、压缩输出、节省事实和降级事实。
- status/observability 暴露最近工具输出治理事实。
- 针对常见命令的轻量结构化压缩：test/build/typecheck/search/git diff。

当前范围不包含：

- 不接入 RTK 作为运行时依赖。
- 不做外部命令自动改写。
- 不做向量检索或长期记忆改造。
- 不做 provider 价格计算。

业务完成标准：

- 工具输出进入模型前经过同一治理主干。
- 长输出可恢复，短证据可用。
- 节省事实可见。
- 测试覆盖真实用户路径。

## 2. 当前事实

- `src/tools/outputCapture.ts` 已经能保存 bash 大输出，并返回 `outputPath`、`truncated`、`outputChars`、`outputBytes`。
- `src/tools/bash.ts` 把 bash 运行结果序列化为 JSON，并把输出截断到 4000 字符。
- `src/agent/toolResults/modelProjection.ts` 是工具结果进入模型前的投影层。
- `src/agent/turn/toolBatchLifecycle.ts` 是工具调用结果写入 session 和 observability 的主链路。
- `src/context/runtime/compression/builder.ts` 会在上下文超预算时压缩旧消息。
- `src/provider/usageNormalizer.ts` 已有 provider cache usage 归一化。
- `src/runtime/status.ts` 和 `src/cli/commands/runtimeStatusPresenter.ts` 已显示 context/cache/model request 信息。
- `README.md` 已声明 Cost Kernel 和大输出压缩方向。
- RTK 的可借鉴点是：原始输出可恢复、压缩输出进上下文、节省可观测、按命令类型压缩、失败降级。

当前缺口：

- 工具输出治理逻辑分散在 bash、outputCapture、modelProjection 和 context compression。
- 没有统一的 Tool Output Kernel。
- bash 输出主要是通用截断，不会按命令类型形成结构化证据。
- 没有统一记录原始字符数、模型投影字符数、节省比例、治理模式和输出路径。
- status 看不到最近工具输出治理事实。

未知点：

- 不同 provider 对工具消息 token 的实际计费只能通过 usage 间接确认；本次只做字符/token 估算和事实记录。

## 3. 失败测试

- bash 长输出应该保存完整输出路径，同时给模型短投影。
- `npm test` / `npm run build` / `tsc` 类输出应该提取失败、错误、文件和摘要。
- `rg` / `grep` 类输出应该提取匹配数量、前几条证据和截断提示。
- `git diff` 类输出应该提取变更文件和关键片段，不把整段 diff 放进模型。
- 工具输出治理事件应该写入 observability。
- `kitty status` 应该能显示最近工具输出治理节省事实。
- context compression 仍应保持 stable prefix 不被工具输出变化污染。

## 4. 目标

- 新增 `Tool Output Kernel` 作为工具输出治理主干。
- bash 运行结果生成 raw capture + kernel projection + governance facts。
- model projection 复用 kernel，不再单独维护 bash 压缩规则。
- observability 记录 `tool.output` 事件。
- runtime status 聚合最近 `tool.output` 事件。
- CLI status 展示最近工具输出节省情况。
- README 同步当前事实。
- 相关测试和 `npm.cmd run verify` 通过。

## 5. 不做范围

- 不运行 RTK。
- 不把 RTK 规则复制成依赖。
- 不做旧输出格式兼容。
- 不新增用户不可见的假能力入口。
- 不做语义重要性机器判断；结构化压缩只处理命令输出里的死事实。

## 6. 设计

主链路：

用户请求 -> 模型调用工具 -> 工具执行 -> Tool Output Kernel 生成治理结果 -> session 写入模型投影 -> observability 记录治理事实 -> status 展示节省现场。

模块边界：

- `src/tools/outputKernel/types.ts`：治理结果类型。
- `src/tools/outputKernel/classifier.ts`：根据命令和输出形态做工具输出类型分类。只做机械事实分类，不判断任务语义。
- `src/tools/outputKernel/projectors.ts`：按输出类型生成短证据。
- `src/tools/outputKernel/metrics.ts`：估算原始 token、投影 token、节省比例。
- `src/tools/outputKernel/index.ts`：主入口。
- `src/tools/outputCapture.ts`：继续只负责捕获和保存原始输出。
- `src/tools/bash.ts`：调用 kernel，把治理事实放进 result JSON 和 metadata。
- `src/agent/toolResults/modelProjection.ts`：读取治理投影，作为模型看到的工具结果。
- `src/agent/turn/toolBatchLifecycle.ts`：记录 `tool.output` observability 事件。
- `src/runtime/status.ts`：读取最近 `tool.output` 事件。
- `src/runtime/statusTypes.ts` 和 presenter：展示最近治理事实。

状态归属：

- 原始输出文件归 observability command-output。
- 单次工具治理事实归 tool result metadata 和 observability event。
- status 只聚合最近事实，不成为事实源。

错误和降级：

- 分类失败时使用通用压缩。
- 输出为空时返回空输出事实。
- 压缩后为空时回退到通用预览。
- 原始输出路径存在时始终保留恢复提示。

测试策略：

- 单测 Tool Output Kernel。
- 单测 bash 工具输出包含治理事实。
- 单测 model projection 使用治理投影。
- 单测 status 聚合 tool output facts。

## 7. 实施任务

- [x] 新增 Tool Output Kernel 类型、分类、投影、指标和入口。
- [x] 将 bash 输出接入 Tool Output Kernel。
- [x] 将工具结果模型投影改为优先使用治理投影。
- [x] 在 tool batch lifecycle 记录 `tool.output` observability 事件。
- [x] 在 runtime status 类型和读取逻辑中加入最近工具输出治理事实。
- [x] 在 CLI status 文本中展示工具输出治理摘要。
- [x] 增加 Tool Output Kernel、bash、model projection、status 测试。
- [x] 同步 README 当前事实。
- [x] 运行局部测试和完整验证。
- [x] 更新收口记录。

## 8. 验证计划

- `npm.cmd run test:build`
- `node --test .test-build/tests/tools/output-kernel.test.js`
- `node --test .test-build/tests/tools/bash-output-governance.test.js`
- `node --test .test-build/tests/agent/tool-result-projection.test.js`
- `node --test .test-build/tests/runtime/status.test.js`
- `npm.cmd run verify`

手动检查：

- `kitty status` 应显示最近工具输出治理事实。
- bash 长输出结果包含完整输出路径和治理摘要。

未验证内容：

- 不验证真实 provider 计费，只验证本地估算和记录。

## 9. 收口

目标已完成。

改动事实：

- 新增 `src/tools/outputKernel/`，作为工具输出治理主干。
- `bash` 输出接入治理结果，保留原始输出路径、短证据、估算 token 节省和降级事实。
- 工具结果进入模型前优先使用 `outputGovernance.projection`。
- `tool.output` observability 事件记录治理事实。
- `kitty status` 聚合并展示最近工具输出节省现场。
- `projectors.ts` 已拆成分发层，diagnostic/search/gitDiff/generic/recovery/shared 各自单一职责。
- README 已同步 Tool Output Kernel 当前事实。

验证事实：

- `npm.cmd run test:build` 通过。
- `node --test .test-build/tests/tools/output-kernel.test.js` 通过。
- `node --test .test-build/tests/tools/bash-output-governance.test.js` 通过。
- `node --test .test-build/tests/agent/tool-result-projection.test.js` 通过。
- `node --test .test-build/tests/runtime/status.test.js` 通过。
- `npm.cmd run verify` 通过，218 个测试全部通过。

未验证内容：

- 未验证真实 provider 计费，只验证本地估算、记录、投影和 status 聚合。

剩余风险：

- 当前结构化投影覆盖 test/build/typecheck/search/git diff 的常见文本形态；更细的工具专用解析应继续放在各自 projector 内，不应回到单文件堆规则。

commit / push：

- 用户已要求 commit；提交后以 git 记录为准。push 未要求，本次不执行。
