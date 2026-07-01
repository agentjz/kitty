# T07 验收分层

Kitty 的测试和产品验收分两层。

## 日常确定性测试

入口：

- `npm.cmd test`
- `npm.cmd run verify`
- `npm.cmd run test:core`

职责：

- 类型检查。
- 构建。
- 本地单元和集成测试。
- 不访问真实 provider。
- 不消耗真实 API。
- 不运行 `tests/evaluation/`。

实现事实：

- `package.json` 的 `test:core` 通过 `scripts/run-core-tests.mjs` 枚举 `.test-build/tests/**/*.test.js`。
- `scripts/run-core-tests.mjs` 明确排除 `.test-build/tests/evaluation/`。

## eval harness 测试

入口：

- `npm.cmd run test:eval`

职责：

- 验证 eval 自身的场景列表、local suite、production suite 和 CLI 分层。
- 不承担普通日常测试。
- 不直接访问真实 provider。

## 本地产品验收

入口：

- `kitty eval --run-local`
- `npm.cmd run eval:local`

职责：

- 跑本地可验证产品场景。
- 使用 fixture、假 provider 或本地状态构造机器证据。
- 验证 runtime status、project map、memory、extension、skill、config、cache economy、tool output governance、host turn、remote entrypoints 和 recovery drills。
- npm 脚本只检查 `dist/cli.js` 是否存在，不主动 build，避免并行 eval 抢同一个 `dist`。

## 生产路径验收

入口：

- `kitty eval --run-production`
- `npm.cmd run eval:production`

职责：

- 必须由维护者显式执行。
- 使用当前项目 `.kitty/.env`。
- 可以访问真实 provider。
- 可以消耗真实 API。
- 验收当前配置、provider probe、隔离 session 真实多轮 turn、真实工具调用 turn 和真实项目 runtime status。
- npm 脚本只检查 `dist/cli.js` 是否存在，不主动 build，避免并行 eval 抢同一个 `dist`。

生产验收不能进入 `npm test` 或 `npm.cmd run verify`。

真实工具调用 turn 使用一个隔离 eval 工具验证 provider tool call、tool result 回传、最终 assistant answer 和 turn events。它用于发现 DeepSeek thinking tool call 这类只会在真实 provider wire contract 下暴露的问题。
