# T06 配置、初始化与诊断

Config 层负责让用户能明确配置 Kitty，并在配置错误时得到可修复诊断。

## 当前模块边界

- `src/config/envKeys.ts`：当前 `.kitty/.env` contract 的唯一 key 清单。
- `src/config/projectEnvTemplate.ts`：`kitty init` 写出的 `.env` / `.env.example` 模板。
- `src/config/providerPresets.ts`：可见 provider preset。它服务用户选择，不替 runtime 猜默认 provider。
- `src/config/schema.ts`：运行时 config 归一和必填校验。
- `src/config/runtime.ts`：从当前项目读取 `.kitty/.env` 并生成 `RuntimeConfig`。
- `src/config/preflight.ts`：不加载完整 runtime，也能检查 `.kitty` 文件、env key、provider/model catalog 和下一步动作。
- `src/cli/commands/init.ts`：创建本地 `.kitty` 模板。
- `src/cli/commands/doctor.ts`：先打印 preflight，再做 provider probe。

## 配置分类

`.env` 只放用户必须知道或经常修改的运行参数：

- provider、model、base URL、API key。
- thinking、reasoning effort、output token。
- 上下文预算、读取上限、项目文档上限。
- extension 开关。
- Telegram 配置。
- command stall timeout。

不进入 `.env`：

- UI 展示行数。
- 预览字符数。
- eval fixture 数字。
- 内部 list limit。
- provider/model 固有能力。

这些属于产品边界或 catalog 事实，用代码和测试保护。

## 初始化路径

用户路径：

1. `kitty init`
2. 填 `.kitty/.env`
3. `kitty doctor`
4. `kitty` / `kitty tui` / `kitty web`

如果 `.kitty` 不存在，doctor 只报告 bootstrap 路径，不假装 runtime ready。

## 失败诊断

配置错误要暴露可修复事实：

- 缺哪些 env key。
- provider/model 是否能在 catalog 解析。
- API key 是否存在。
- base URL 与 provider/model 是否匹配。
- provider probe 是 models 还是 responses。

缺失核心配置时直接报错，不做静默默认。

## 验收

- `tests/cli/program.test.ts`
- `tests/config/*.test.ts`
- `node dist/cli.js doctor`
- `kitty eval --run-production`
