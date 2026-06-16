# 删除 Runtime Spec 模式计划

## 目标

删除 Kitty 的 runtime spec 模式，把当前任务管理统一到 `plan.md` 和 plan skill。

最终产品事实：

- 没有 `kitty spec` 命令。
- 没有 spec extension 工具。
- 没有 spec runtime prompt、spec mode、spec workflow status、spec workspace/checkpoint 运行能力。
- `.env` 不再有 `KITTY_EXTENSION_SPEC`。
- `kitty status`、`kitty eval`、README、测试和运行时 prompt 不再呈现 spec 模式。
- 仓库级 `spec/` 文档目录保留，作为项目设计和审阅文档，不是 runtime spec 模式。

## 当前事实

- 当前已提交基线：`dd01602 Strengthen background and spec UX`。
- 现有 spec 模式由这些主干组成：
  - CLI：`src/cli/commands/spec.ts`、`src/cli/specOneShot.ts`、`src/shell/cli/specInteractive.ts`。
  - Runtime：`src/spec/`。
  - Extension：`src/extensions/tools/spec/`。
  - 配置：`KITTY_EXTENSION_SPEC`、`extensions.spec`。
  - Status/eval/memory sink/project map：部分读取 `.kitty/specs` 或展示 spec facts。
  - 测试：`tests/spec/`、`tests/extensions/spec-tools.test.ts`、`tests/cli/spec-cli.test.ts`、`tests/shell/spec-interactive.test.ts` 等。
- `spec/` 目录不是 runtime spec 模式，它是仓库级设计文档和审阅资料。不能因为删除 runtime spec 模式就删掉该目录。
- `plan.md` 和 `.codex/skills/plan` 已经承担当前任务总管职责。

## 交付标准

- CLI 顶层命令不包含 `spec`。
- 默认 extension 集合不包含 `spec`，配置 schema 不要求 spec 开关。
- 工具注册表和 provider tool definitions 不暴露任何 `spec_*` 工具。
- runtime prompt 不再有 spec mode block。
- runtime status 不再读取或展示 runtime spec workspace。
- eval checks 不再包含 spec store 检查。
- memory sink 不再支持 append-to-spec。
- README 和仓库 spec 文档只描述当前事实：任务总管是 `plan.md`，`spec/` 是项目文档目录。
- 删除无用源码和测试，不保留 legacy/废弃提示/兼容分支。
- `npm.cmd run verify` 通过。

## 失败测试

- `kitty --help` 仍出现 `spec`：失败。
- `KITTY_EXTENSION_SPEC` 仍出现在 `.env`、`.env.example`、配置 schema 或测试：失败。
- 任意 `spec_*` 工具仍进入 extension surface：失败。
- `kitty status` 仍显示 `Spec workspace` 或 specs 运行事实：失败。
- `kitty eval --run` 仍检查 spec store：失败。
- README 仍把 spec 模式当产品能力：失败。
- `npm.cmd run verify` 失败：失败。

## 实施路线

### 1. CLI 与 Host 入口

- 主文件：`src/cli/program.ts`、`src/cli/dependencies.ts`
- 动作：删除 `registerSpecCommand`、`runSpecOneShot`、`startSpecInteractive` 接线。
- 删除文件：`src/cli/commands/spec.ts`、`src/cli/specOneShot.ts`、`src/shell/cli/specInteractive.ts`。

### 2. Spec runtime 与 extension

- 删除目录：`src/spec/`、`src/extensions/tools/spec/`。
- 动作：删除 extension registry 里的 spec 定义和工具挂载。
- 不做：不删除仓库根目录 `spec/` 文档。

### 3. 配置与 env

- 主文件：`src/config/extensions.ts`、`src/extensions/definitions.ts`、env 模板生成链路、`.kitty/.env`、`.kitty/.env.example`。
- 动作：删除 `extensions.spec` 和 `KITTY_EXTENSION_SPEC`。

### 4. Runtime status / eval / memory

- 主文件：`src/runtime/status.ts`、`src/runtime/statusTypes.ts`、`src/cli/commands/runtimeStatusPresenter.ts`、`src/evaluation/checks.ts`、`src/evaluation/types.ts`、`src/cli/commands/memory.ts`、`src/runtime/memory/sinks.ts`。
- 动作：删除 runtime specs 状态、spec store eval、append-to-spec 入口。
- 保留：project map 读取仓库 `spec/` 文档作为项目事实。

### 5. Prompt / UI / tests

- 主文件：`src/agent/prompt/*`、`src/runtime-ui/toolDisplay/call.ts`、相关测试。
- 动作：删除 spec mode prompt 测试、spec tool display 分支、spec CLI/extension/store 测试。
- 保留：`spec/` 文档目录相关 project map 测试。

### 6. 文档

- 主文件：`README.md`、`spec/用户审阅/系统核心/核心地图.md`、`spec/用户审阅/T03-工具与扩展/`、`spec/技术实现/T03-工具与扩展/`、`spec/技术实现/T04-Host边界.md`。
- 动作：删除 runtime spec 模式描述；把总管工作流改为 `plan.md + plan skill`。

## 检查单

- [x] 删除 CLI spec 入口和依赖接口。
- [x] 删除 `src/spec/` 与 `src/extensions/tools/spec/`。
- [x] 删除 extension/config/env 中的 spec 开关。
- [x] 删除 status/eval/memory sink 中的 runtime spec 运行事实。
- [x] 删除 prompt/UI/tests 中的 spec mode 和 `spec_*` 工具引用。
- [x] 同步 README 和仓库 spec 文档。
- [x] 跑 `rg` 确认只剩仓库文档语义的 `spec/` 引用。
- [x] 跑 `npm.cmd run verify`。
- [x] 更新本计划收口。

## 验证计划

- `rg -n "kitty spec|spec mode|spec_\\w+|KITTY_EXTENSION_SPEC|Spec workspace|spec-store-available" src tests README.md .kitty/.env .kitty/.env.example spec plan.md`
- `node dist/cli.js --help`
- `node dist/cli.js eval --run`
- `node dist/cli.js status`
- `npm.cmd run verify`

## 收口

目标已完成。

已删除 runtime spec 模式的 CLI、runtime、extension、prompt、status、eval、memory sink、测试和文档入口。当前默认 extension surface 是：

`todo,worktree,network,background,subagent,skills`

仓库根目录 `spec/` 保留为项目文档和审阅事实源，不再作为 runtime spec 模式或工具能力。

验证已跑：

- `npm.cmd run typecheck`：通过。
- `node dist/cli.js --help`：通过，顶层命令没有 `spec`。
- `node dist/cli.js status`：通过，runtime status 不显示 spec workspace。
- `node dist/cli.js eval --run`：通过，10 项 eval checks 全部 passed。
- `npm.cmd run verify`：通过，166/166 tests passed。
- `rg -n "kitty spec|spec mode|spec_\\w+|KITTY_EXTENSION_SPEC|Spec workspace|spec-store-available|extensions\\.spec|extension\\.spec|append-to-spec|appendRuntimeMemoryAssetToSpec|src/spec|extensions/tools/spec|tests/spec|Spec runtime|CLI spec|active_spec_id|activeSpecId|spec_work" src tests README.md .kitty/.env .kitty/.env.example spec`：无输出。

剩余风险：

- 旧 `.kitty` 运行状态目录和历史数据库如果来自删除前版本，可能仍然有旧文件或旧表结构；当前源码不创建、不读取、不展示 runtime spec 能力。
- `plan.md` 保留本次删除任务的旧名词，因为它是执行记录，不是产品能力入口。
