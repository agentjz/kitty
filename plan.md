# 微信扫码账户绑定 Plan

## 1. 需求文档

Kitty 的微信远程控制应在扫码确认后自动绑定当前扫码账户。用户只需生成二维码、扫码并启动服务，不再手动查找、填写或维护微信用户 ID。

本次范围包括 CLI 和 `kitty start` 本地控制台的微信登录、凭证持久化、入站私聊授权和当前 UI 文案。完成后，只有扫码账户的私聊消息会进入 Kitty；登录结果不含可绑定的用户 ID 时，不能显示登录成功或启动服务。

本次不提供多人授权列表、旧凭证迁移或历史环境变量兼容。重新扫码会以新的完整凭证替换当前绑定；退出登录清除该绑定。

本次同时删除把人类可读展示文字、品牌名、翻译内容、banner 标签或页面标签冻结为特定字面量的测试。保留命令 ID、环境键、协议字段、持久状态、结构、排序和用户输入回显等机器或业务合同测试。

## 2. 当前事实

- `spec.md` 是当前事实主干；微信、Telegram 和本地 API 复用同一 host turn，但微信的登录、轮询、入站分类和凭证由 `src/weixin/` 持有。
- 当前 SDK `@openilink/openilink-sdk-node@0.6.0` 在二维码确认响应中返回 `ilink_user_id`，并把它投影为登录结果的 `user_id`；入站私聊发送者由 `from_user_id` 表示。
- `OpenILinkWeixinClient.loginWithQr()` 当前将 SDK `user_id` 写入可选的 `WeixinLoginState.userId`，但只要求 token，因而可接受没有绑定用户 ID 的成功结果。
- 凭证存于 `.kitty/weixin/credentials.json`，由 `WeixinCredentialStore` 原子写入并使用 owner-only 文件权限；当前凭证与授权白名单分别持有同一身份事实。
- `KITTY_WEIXIN_ALLOWED_USER_IDS` 经 `src/config/` 进入 runtime config；CLI、Web channel manager 和 `WeixinService` 以此允许列表启动或筛选入站消息。Web 还要求用户填写该环境变量。
- `WeixinService` 先通过 `classifyWeixinMessage()` 授权，后续的 session、context token、outbox、host turn、可观测事件和恢复边界不重新计算授权身份。
- 当前测试覆盖手工白名单分类、凭证原子写入、微信 host turn 及 Web 登录关闭 fencing；未覆盖成功扫码后将返回用户 ID 作为唯一入站授权事实。
- 工作区在开始时无 Git 改动。`.kitty/.env` 和 `.kitty/.env.example` 当前仍含将被移除的微信用户 ID 环境键。
- 扫描发现展示文字断言集中在 i18n、Web local console/chat shell、terminal renderer、远端 service intro、profile registry、session picker 与 runtime presentation 测试。它们混杂了需要保留的命令/状态/输入数据合同，必须按 owner 边界删除或改为结构断言，不能按字符串正则批量误删。

## 3. 失败测试

- 已确认二维码登录必须返回非空用户 ID；否则登录失败且不得写入可用凭证。
- 保存的微信凭证必须同时包含 token 和绑定用户 ID；服务只接受该 ID 的私聊消息，其他私聊与群聊均不得进入 host turn。
- CLI 和 Web 两条登录路径必须保存同一种完整凭证；Web 的登录、退出和关闭 generation fencing 保持有效。
- 微信服务启动必须从完整凭证取得绑定用户，不依赖环境变量；凭证缺失或不完整时明确拒绝启动。
- 配置模板、运行时 schema、Web 配置键和本地控制台呈现必须不再要求填写微信用户 ID；四种 locale 和 `spec.md` 只描述扫码绑定。
- 展示层测试不再要求某个界面、banner、翻译或 presentation summary 使用特定人类可读文字；仍验证 catalog key/占位符完整性、机器状态和结果结构。

## 4. 目标

- 二维码确认把 iLink 返回的用户 ID 与 token、端点和时间一起原子保存为唯一微信身份凭证。
- CLI `kitty weixin login` 与 Web 微信工作流都使用该完整凭证；登录成功表示账户已绑定。
- 微信 service 创建时读取完整凭证，将其中的一个绑定用户 ID 传入分类器；分类器只允许该账户的私聊消息进入现有 turn 链路。
- 移除微信手工用户 ID 配置、Web 表单和相关提示，不影响 Telegram 的独立白名单配置。
- 测试、env 模板、生成 env 文件和 `spec.md` 同步为同一当前事实。

## 5. 不做范围

- 不增加多个微信用户、邀请、共享或运行时修改授权成员的能力。
- 不读取、迁移或兼容缺少绑定用户 ID 的历史微信凭证；它们必须重新扫码。
- 不修改微信消息轮询、session、outbox、工具、Agent 或 Telegram 的既有生命周期。
- 不启动浏览器、截图或浏览器自动化；Web 结构和交互合同由源码、构建及自动测试验证，视觉验收由人类完成。
- 不删除命令名、配置键、数据库字段、工具 ID、协议 token、用户提交内容或持久状态的断言；它们不是可任意替换的展示文字。

## 6. 设计

主链路：

```text
二维码确认
  -> SDK LoginResult.user_id
  -> OpenILinkWeixinClient 验证并返回完整 WeixinLoginState
  -> CLI / Web 原子保存 credentials.json
  -> createWeixinService 读取绑定 userId
  -> classifyWeixinMessage 比较 from_user_id
  -> 已有微信 host turn / durable records / reply
```

`WeixinCredentialStore` 是扫码账户身份的唯一持久 owner。`WeixinLoginState.userId` 改为必填；load 只接受 token 和非空 user ID 都完整的当前凭证。SDK adapter 是外部响应校验边界，缺少 user ID 直接失败。

`WeixinService` 获得一个 `boundUserId`，而不是读取 runtime 配置的用户列表。分类器接受单一绑定身份并保持现有群聊、出站 echo、消息类型和附件分支。`createWeixinService()` 从 credential store 取得该值；CLI / Web 启动不再执行白名单空检查。

配置 owner 只保留微信连接与轮询参数：删除 `allowedUserIds`、对应 env key、parser、模板项和 Web 提交表单。删除环境键后，按项目规则完整重建 `.kitty/.env` 与 `.kitty/.env.example`，不增量保留旧模板行。

Web 仅呈现“扫码登录 -> 启动服务”两步。typed locale catalogs 删除手工授权文案，使用扫码绑定说明；CLI 登录成功不输出用户 ID。

## 7. 实施任务

- [x] 将微信登录状态和 SDK adapter 收敛为完整的 token + 绑定用户 ID 凭证，并补充缺少 user ID 的失败测试。
- [x] 让微信 service 与分类器从持久凭证消费唯一绑定身份，更新远程 host 测试。
- [x] 删除微信手工授权配置的 schema、env、模板、CLI/Web 启动依赖和 Web 表单，保留 Telegram 现有配置。
- [x] 更新四语 typed catalog、Web message projection、页面步骤与 `spec.md`。
- [x] 从当前模板完整重建 `.kitty/.env` 和 `.kitty/.env.example`。
- [x] 删除或结构化所有展示层文字断言，保留机器与业务合同，并以全局扫描复核。
- [x] 运行微信/Web/config/i18n 定向测试、完整验证和 diff 检查，回填结果。

## 8. 验证计划

- 执行 `npm.cmd run test:build`，再运行编译后的 `tests/weixin/weixin-remote.test.js`、`tests/web/channel-manager.test.js`、`tests/config/*.test.js` 和 `tests/i18n/catalog.test.js`。
- 执行 `npm.cmd run verify`、`npm.cmd run dev -- --help`、`npm.cmd run dev -- --version` 及 `git diff --check`。
- 源码复核 CLI 与 Web 登录、凭证读取、service 启动、分类和页面没有第二个授权事实源；不运行真实扫码或浏览器。
- 未验证项：真实 iLink 扫码和人工 Web 视觉/交互验收需要项目所有者在真实微信账户环境执行。

## 9. 收口

状态：完成。

- 展示层扫描覆盖 i18n、Web console/chat shell、CLI session picker、remote intro、runtime/TUI renderer、profile、session title、provider error 与 todo presentation 测试。已删除纯文案测试，或改为 catalog key/placeholder、非空、结构、尺寸、状态、隐私和持久事实断言。
- 保留命令 ID、环境键、协议字段、状态枚举、工具 ID、用户输入回显、文件内容、持久化和 API 合同测试；它们不是可替换的人类展示文案。
- `npm.cmd run test:build` 通过；相关编译测试 97/97 通过；`npm.cmd run verify` 通过：453 passed、0 failed、1 skipped；`git diff --check` 通过（仅有 Git 的 LF/CRLF 提示）。
- 此前已验证 `npm.cmd run dev -- --help` 和 `npm.cmd run dev -- --version`。未执行真实 iLink 扫码或浏览器验收；按项目规则，这两项仍由项目所有者完成。未请求 commit 或 push。
