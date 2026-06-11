# 四条主线成熟化计划

## 目标

把当前 Kitty 从“能跑”推进到“用户能看懂、能恢复、能持续使用”的运行体验。

本轮只处理当前存在的四条主线：

- 上下文预算管理。
- Background / subagent 真实体验。
- Spec / plan 工作流。
- Doctor / init / 配置体验。

不做旧兼容，不写不存在的能力，不把历史残留包装成当前事实。

## 判断

当前主干已有可用骨架：

- context 已经只把当前用户帧作为 raw messages，并有压缩链路。
- execution 已经有后台任务、subagent、lead wait、wake signal 和健康状态。
- spec 已经有 requirements -> design -> tasks -> implement -> validate -> archive。
- init 已经能生成 `.kitty/.env`、`.kitty/.env.example`、`.kitty/.kittyignore`。

缺口不在“再造一套系统”，而在四个事实没有被稳定暴露：

- 上下文预算没有成为清楚的运行事实。
- 后台和 subagent 的状态输出偏原始，用户不容易判断发生了什么。
- spec 阶段门存在，但当前阶段、下一步和工具面不够清楚。
- doctor 在配置解析失败前缺少本地预检，init 也没有给出模板状态事实。

## 设计

### 上下文预算

预算结果由 context request 生成，同一份事实进入 runtime status 和测试：

- `limitChars`
- `estimatedChars`
- `remainingChars`
- `usageRatio`
- `compressed`
- `compressionReason`
- `promptMetrics.hotspots`

机器只暴露数字、边界和压缩事实；模型负责判断是否需要继续读文件、沉淀记忆或缩小范围。

### Background / Subagent

execution ledger 是唯一事实源。

新增统一 execution 摘要：

- active / recent 分组。
- status、health、deadlineAt、lastOutputAt、outputPreview。
- assignment objective / boundary / expectedOutput。
- closeReason、error、changedPaths。

`background_check`、`subagent_check`、`kitty status` 只呈现这份摘要，不各自发明状态语言。

### Spec / Plan 工作流

spec 保持当前 spec mode，不改名，不恢复旧模式。

新增 workflow summary：

- active spec。
- current stage。
- confirmed gates。
- next gate。
- document state。
- writable tool surface。
- isolated workspace。

prompt、status、spec 工具输出引用同一份 summary。提示词保持通用，不用硬编码用户话术。

### Doctor / Init / 配置

本地配置体验分成两层：

- preflight：不依赖完整 runtime，检查 `.kitty` 文件、env key、provider preset、extension switches。
- runtime probe：runtime 能加载且有 API key 时，再探测 provider。

init 负责创建模板并暴露 created / skipped / expected files，不强行覆盖用户本地密钥。

doctor 先输出本地 preflight，再输出 runtime 和 provider 连接事实。

## 执行清单

- [ ] 增加 context budget report，并接入 context request。
- [ ] 在 runtime status 中暴露最近一次 session 的 context budget。
- [ ] 测试 budget report 的 limit、usage、compressionReason、hotspots。
- [ ] 增加 execution summary helper，统一 background/subagent/status 输出。
- [ ] 改造 `background_check` 输出为 active/recent/stale/summary。
- [ ] 改造 `subagent_check` 输出为 active/recent/summary。
- [ ] 测试 background/subagent check 的用户可见状态。
- [ ] 增加 spec workflow summary helper。
- [ ] 在 spec prompt、runtime status、spec open/create 输出中暴露 workflow summary。
- [ ] 测试 spec 阶段门、next gate、工具面和文档状态。
- [ ] 增加 config preflight helper。
- [ ] doctor 先运行 preflight，再加载 runtime，再 provider probe。
- [ ] init 输出模板状态，并保持不加载 runtime。
- [ ] 测试 doctor 在缺 `.env`、缺 key、模板完整时的输出。
- [ ] 同步 README / philosophy / spec 中与四条主线有关的当前事实。
- [ ] 运行 `npm.cmd run verify`。

## 完成标准

- `kitty status` 能看清上下文预算、execution 健康、active spec 阶段门和配置状态。
- `background_check` 和 `subagent_check` 输出用户可理解的执行事实，不再只倒原始账本。
- spec 模式能清楚显示当前阶段、下一步、确认门和工具面。
- `kitty init` 是稳定模板创建体验，`kitty doctor` 是稳定本地诊断体验。
- 代码、测试、README、philosophy、spec 讲同一个当前事实。
- `npm.cmd run verify` 通过。
