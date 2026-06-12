# 产品体验闭环重构计划

## 目标

把当前已经存在的主干能力打磨成可验证、可理解、可继续的成熟体验：

- `kitty eval` 从场景清单升级为可运行的本地验收。
- `kitty spec` 和 `kitty status` 从状态字段升级为清楚的当前现场。
- `skills` 从“能发现和加载”升级为可审查的能力包体验。
- `kitty init` / `kitty doctor` 从配置检查升级为首次成功路径。

只处理当前真实存在的能力。不写旧兼容，不写不存在的入口，不把历史残留包装成产品说明。

## 参考依据

- Codex：会话、工具、状态、恢复和输出是稳定主链路；内部事实不能伪装成用户输入。
- OpenCode：上下文和状态源需要稳定、可组合、可解释；状态变化在安全边界进入下一轮。
- Aider：首次配置、模型警告、测试命令和用户下一步要具体。
- Goose：真实 agent 产品需要可运行评测和清楚的运行现场，而不只是文档描述。

结论：产品成熟度不靠模块数量，而靠每条用户路径是否能自己闭环。

## 设计

### 1. Evaluation

`kitty eval` 输出场景，也能运行本地机器验收。

- 场景仍然描述用户体验、机器事实和验收点。
- 新增 runner，把可检查事实转成 pass/fail/skip。
- `--run` 运行本地验收。
- `--json` 输出同一事实模型。
- 不让模型打分，不做语义裁判。

### 2. Spec 产品现场

Spec workflow summary 增加产品化字段：

- 当前阶段中文说明。
- 下一步动作。
- 等待用户确认项。
- 文档完成度。
- checkpoint / workspace 现场。

工具返回、status 和 CLI 复用同一 summary，不各自拼一套。

### 3. Skill 能力包体验

Skill discovery 增加 package health：

- metadata 是否完整。
- 是否有正文。
- 是否有资源。
- 依赖命令是否声明。
- references / scripts / examples / assets 资源分组。

`skill_list` / `skill_check` / `kitty status` 复用同一事实，不让工具各自判断。

### 4. Init / Doctor 首次成功路径

`kitty init` 和 `kitty doctor` 给出用户能直接执行的下一步：

- 哪些文件已创建或已存在。
- `.kitty/.env` 是否可用。
- provider / model / baseUrl / API key 是否齐。
- 下一步是填 API key、运行 doctor，还是直接启动 kitty。

### 5. Runtime UI

`kitty status` 保留机器事实，但先展示“当前现场”：

- 当前焦点。
- 下一步。
- 是否有阻塞。
- active execution。
- memory / spec / project map 是否可用。
- 详细账本放到后面。

## 执行清单

- [x] 重写 evaluation 数据模型和 runner。
- [x] 给 `kitty eval` 增加 `--run`。
- [x] 增加 eval runner 测试。
- [x] 扩展 spec workflow summary，并让工具/status 复用。
- [x] 增加 spec 产品现场测试。
- [x] 增加 skill package health 和资源分组。
- [x] 增加 skill list/check/status 测试。
- [x] 改进 init / doctor 输出和 preflight next steps。
- [x] 增加首次成功路径测试。
- [x] 改进 runtime status 文案结构。
- [x] 同步 README、philosophy、spec。
- [x] 运行 `npm.cmd run verify`。

## 完成标准

- `kitty eval --run` 能输出真实本地验收结果。
- `kitty spec` / `kitty status` 能让用户看懂当前阶段和下一步。
- skill 包能显示健康状态和资源结构。
- `kitty init` 后用户知道下一步该填什么、跑什么。
- `kitty doctor` 失败时给出明确修复动作，成功时给出可启动事实。
- README、philosophy、spec、测试和源码讲同一套当前事实。
