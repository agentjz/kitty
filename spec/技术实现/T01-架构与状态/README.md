# 架构与状态

当前源码根：

- `src/agent`
- `src/cli`
- `src/config`
- `src/context`
- `src/extensions`
- `src/host`
- `src/interaction`
- `src/observability`
- `src/project`
- `src/provider`
- `src/runtime-ui`
- `src/session`
- `src/shell`
- `src/telegram`
- `src/tools`
- `src/types`
- `src/utils`

当前测试根与这些源码根对应。

`src/provider` 的当前边界是 provider/model catalog、transport、wire adapter、request、usage、cache 和连接探测。Provider catalog 维护 provider 身份、入口、认证形态、transport 和超时；model catalog 维护 wire API、能力、限制和请求参数。`transport` 统一处理标准 provider 与 relay 中转 provider 的探测入口；YLS、TTAPI 这类中转只作为 relay provider 实例进入 catalog，不在 CLI、TUI、session 或 error 层散落特判。
