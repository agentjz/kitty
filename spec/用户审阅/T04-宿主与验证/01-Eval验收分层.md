# Eval 验收分层

`kitty eval` 是产品验收入口，不是普通测试入口。

普通开发时：

- 跑 `npm.cmd test`。
- 不跑真实 provider。
- 不消耗真实 API。
- 不跑 eval。

需要验收 Kitty 真实产品路径时：

- 跑 `kitty eval --run-local` 做本地产品验收。
- 跑 `kitty eval --run-production` 做显式生产路径验收。

生产路径验收会使用当前 `.kitty/.env`，可以访问真实 provider。它必须由维护者主动执行，不能混进日常测试。
