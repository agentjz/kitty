# 统一能力系统重建计划

## 1. 需求文档

Kitty 的核心边界是语言模型与模型之外可安装、可配置、可观察的统一能力系统；本地工作台不把这两个边界做成产品层容器，而按用户任务展示独立模块。基础网络搜索和下载必须开箱可用，不能要求用户另行注册第三方搜索凭证。

本次交付重建能力层。工具、技能包、Playwright MCP 和基础 Web 能力通过同一能力协议接入，由同一个管理器发现、启用、配置、报告健康状态并交给各自运行时。协议统一不等于执行机制统一：各类能力保留各自的输入、生命周期、状态和结果合同。

用户进入 `kitty start` 后按任务进入模型、网页端、工具与扩展、Skill、媒体、微信、Telegram 和其他设置等独立模块。内置能力和基础 Web 默认启用，Playwright 可以显式启停；页面不显示搜索凭证。

当前范围包括：内置工具与现有扩展的能力化、现有技能包的能力化、统一管理器、一个 Playwright MCP 能力，以及免凭证网页搜索、受控 HTTP(S) GET 读取与文件下载。

业务完成标准：模型可以在同一轮中使用已启用的能力；用户可以在 `kitty start` 查看能力状态；Playwright MCP 在连续轮次间复用正确的宿主级连接；`web_search`、`web_fetch` 和 `web_download` 无凭证真实执行并留下来源、响应或文件证据。

## 2. 当前事实

- `spec.md` 是当前技术事实主干。Kitty 已有稳定的智能体轮次、会话、控制平面、工具日志、恢复和多宿主边界；本次不重建这些主链。
- 当前工具执行已有 `ToolRegistry`，它组合内置与宿主工具来源、校验参数、处理冲突并执行模型工具调用。它是执行注册表，不是能力包管理器。
- `CapabilityManager` 已成为发现、安装状态、配置要求、默认启用、健康、生命周期、命名空间和呈现的唯一能力 owner；核心工具、内置能力、项目 Skill、Playwright MCP 与基础 Web 由 typed adapter 投影。
- 当前内置能力覆盖待办、定时任务、工作树、后台任务、文档、媒体与技能包并默认启用；Skill discovery 继续作为内容发现 owner，`loadProjectContext()` 只投影健康且启用的索引，正文、资源和声明脚本由 `skill_*` 工具按需加载。
- 基础 Web 已实现为默认就绪的 bundled 能力，固定贡献免凭证 `web_search`、`web_fetch` 与 `web_download`；搜索、读取和下载使用各自执行器并共享现有外部派发账本。
- `runHostTurn()` 仍是每轮 `ToolRegistry` 的创建与关闭 owner；交互式 CLI/TUI、Web、Telegram、微信和 one-shot 只借用项目级能力运行时，轮次注册表关闭不会终止 Playwright MCP。
- SQLite `tool_calls` 现有 `planned -> running -> success/error/interrupted/uncertain` 与 `pending/dispatched/settled` 派发事实；已派发后丢失响应会保留稳定 operation ID 和 `uncertain` 证据，恢复不盲目重放。
- `WebConfigService.save()` 先在候选项目中完成结构和运行时校验，再原子替换 `.kitty/.env`；只有持久提交成功后页面才显示已接受。
- `kitty start` 首页以扁平独立模块保留欢迎便签、Kitty 网页端、模型设置、工具与扩展、Skill、媒体、微信、Telegram 和其他设置；工具与扩展页显示管理器真实状态，Skill 支持项目内容包 CRUD，内置工具只读展示。
- 能力专属状态路径统一为 `.kitty/capabilities/`；SQLite `capability_states` 拥有启停操作、owner token/generation、心跳、租约、子进程 identity、健康与终态。
- `dev.md` 定义强制生命周期审查门槛：用户会在任意边界连续中断、关闭终端、杀死进程、断电并重启。新能力必须检查接受、执行、提交、中断、失败、恢复、重放和清理，正常退出不是正确性前提。
- 现有工具账本与控制平面是工具副作用、运行中租约和恢复的归属者；能力管理器不能另建一套内存生命周期或在丢失响应后盲目重放外部动作。
- 变更前 `npm.cmd run verify` 已通过：439 项 core 测试中 438 通过、0 失败、1 项 POSIX 专用测试在 Windows 跳过；本次替换后必须重新运行。
- `rapid-dev-skill.md` 是本次项目所有者明确要求下载的执行说明，不是 Kitty 产品源码。其通用扫描误把 `ref/repos/` 下参考仓库计入 Kitty，不能作为架构事实。

搜索后端调查已经收束：

- DuckDuckGo 官方 Instant Answer JSON 对通用网页问题实际返回 0 条结果，不能冒充通用网页搜索；官方 `robots.txt` 同时禁止 `/html` 与 `/lite` 抓取，因此不采用页面抓取方案。
- Microsoft Bing 官方搜索域的 RSS 入口无需凭证并真实返回标准 XML；响应版权条款限制个人、非商业 RSS 阅读器之外的用途。项目所有者在知情后明确要求第一版直接采用 Bing；该授权与上游可用性风险必须保留在收口中。
- Microsoft Playwright MCP 官方支持 stdio、持久 user data dir、文件输出、`--image-responses=omit` 与 headless 配置；官方 MCP TypeScript SDK 当前明确 v1.x 是生产稳定线，因此客户端采用 `@modelcontextprotocol/sdk` v1，不采用尚未稳定的 v2。

当前已确认 Bing RSS 在本机无需凭证返回真实结果；实现后必须在线验证搜索来源、外部下载、证据与派发终态。

## 3. 失败测试

- 未提供任何第三方搜索凭证时，Web 能力必须保持 `ready` 并贡献 `web_search`、`web_fetch`、`web_download`。
- `web_search` 必须以真实免凭证请求返回通用网页结果；配置模板和页面不能要求搜索凭证。
- `web_fetch` 必须有界读取网页正文和响应事实；`web_download` 必须以原子方式写入用户指定文件并返回文件证据。
- 搜索响应 XML 解析、来源数量、HTTP 正文投影、证据文件大小和下载字节数必须有稳定边界；畸形响应、超大页面或超大下载不得产生误报、上下文污染或残留部分文件。
- 搜索、读取或下载派发后连接丢失时，必须保留稳定 operation ID 并结算为 `uncertain`；已记录派发的同一调用再次执行时不得再次发起网络请求。
- 已有能力管理、Playwright 跨轮复用、持久配置接受点、强杀恢复和幂等清理测试必须继续通过，证明 Web 替换没有产生第二个执行 owner，也没有破坏现有宿主与用户友好入口。

这些失败以面向产品行为的自动测试、持久状态检查、真实 Bing RSS 搜索、真实外部下载和宿主级轮次演练验证；不以旧文件或旧字符串不存在作为验收。

## 4. 目标

- 建立唯一的能力管理器 `CapabilityManager`，作为能力描述、发现、配置、默认启用、健康、生命周期所有权和呈现状态的事实归属者。
- 将核心工具、内置能力、技能包、Playwright MCP 和基础 Web 以类型明确的能力包表示。包是分发和配置单元，工具不是包的同义词。
- 保留 `ToolRegistry` 作为模型工具执行归属者；管理器只把已就绪能力贡献的工具交给它，不能接管工具执行和工具账本。
- Playwright MCP 成为第一版唯一的外部 MCP：它有命名空间、配置、健康检查、宿主级客户端池、连续轮次复用、关闭和异常恢复边界。
- 基础 Web 是默认启用、免凭证的 bundled 能力，固定贡献 `web_search`、`web_fetch` 与 `web_download`；搜索返回来源，受控 GET 返回有界正文与响应证据，下载原子提交有界文件。
- `kitty start` 以独立的工具与扩展模块管理当前真实能力状态；模型设置继续只管理语言模型，工具与扩展页面不出现搜索凭证或独立网页研究配置区。
- 旧扩展配置、旧扩展本地状态和旧模型工具面按断裂式重建替换，不提供迁移、别名、双读写或兼容入口。
- `spec.md`、README、配置模板、测试和实现只描述新主干。
- 恶劣用户路径下，能力配置只有在持久提交后才显示已接受；能力启动、停止和外部调用都有稳定操作标识、租约、可恢复终态和幂等清理。强杀、断电或关闭宿主后，恢复只读取持久归属者，不从网页端或内存状态猜测。

## 5. 不做范围

- 不实现任意第三方脚本代码插件加载。
- 不实现通用“任意 MCP 服务”市场、安装器或远程仓库；第一版外部 MCP 只有 Playwright。
- 不把 Playwright 当成搜索索引，也不以浏览器抓取伪装成搜索后端。
- 不内置需要独立第三方凭证的搜索服务，不抓取搜索结果 HTML，不接入公共代理或任意搜索市场。第一版按项目所有者的明确决定固定使用 Bing RSS；其用途限制和上游稳定性属于已知剩余风险，不伪装成无约束公共 API。
- 不重写智能体循环、模型提供方、会话、控制平面、宿主输入通道或既有后台任务语义。
- 不保留旧 `network` 工具名、旧扩展开关、环境键、状态格式或兼容转发。
- 不迁移 `.kitty/` 中旧扩展数据；重建时只保留新数据结构可识别的状态。

## 6. 设计

### 产品与协议边界

能力协议统一的是包级事实，不是把不同能力压进一个 `execute()`：

```text
能力包
  -> 描述：标识、类型、版本、显示名称、默认启用状态
  -> 配置结构与就绪检查
  -> 生命周期范围与健康状态
  -> 有类型的能力贡献
  -> 清理与恢复合同

有类型的能力贡献
  -> 内置工具：模型可调用的本地动作
  -> 技能包：说明、资源和声明的脚本
  -> MCP：通过持久客户端提供的远程工具目录
  -> Web：免凭证搜索与有界文件下载
```

`CapabilityManager` 负责能力包发现、配置校验、启用、就绪、健康状态投影、命名空间分配和进程范围运行时租约。每种能力有各自的适配器；管理器不解析技能包内容、不执行工具、不实现 MCP 通信协议，也不拼造研究结论。

`ToolRegistry` 仍是唯一的模型工具执行注册表。能力适配器只贡献已就绪工具。工具名称使用稳定的能力包命名空间，尤其要避免 MCP 工具重名。核心文件与命令工具表现为默认启用但可停用的内置能力贡献，而不是第二套产品系统；停用后注册表不能从 builtin catalog 或宿主额外工具路径重新注入它们。

### 运行时与状态

宿主拥有项目范围的能力运行时。一轮执行借用已就绪贡献，轮次结束后释放借用；只要项目运行时仍在，释放借用不能终止 Playwright 客户端。进程退出负责最终清理。并行浏览器动作使用能力租约和串行化策略，不能依赖每轮注册表清理。

能力配置和状态在 `.kitty/` 或控制平面中拥有独立的当前结构所有者，原子写入，结构变更时重置。能力健康状态由所属运行时计算并投影到网页端，不能从陈旧开关猜测。至少区分禁用、需要配置、启动中、就绪、降级和已停止。

具体归属：SQLite `capability_states` 保存发现后的启用覆盖、稳定操作 ID、owner token/generation、heartbeat、lease、子进程 identity、健康和终态；环境文件只保存当前真实能力的专属配置。能力配置先生成候选内容并完成结构与运行时校验，原子替换成功才算接受。能力状态 schema 变更按项目现行断裂规则重建，不读旧 extension 状态。

外部调用扩展工具终态合同，显式表达不确定结果。工具账本和恢复路径负责结算：适配器不能仅因派发后丢失响应就重试动作。Bing RSS 搜索和 HTTP(S) 下载都在交给网络栈前记录 `dispatched`；完整响应或明确 HTTP 状态可结算，连接中断、超时或派发后取消结算 `uncertain`。

`tool_calls` 增加外部派发事实：稳定 operation ID、owner token/generation、dispatch state、heartbeat 与 lease。外部适配器在调用交给远端前持久标记 dispatched；派发后连接丢失直接结算 `uncertain`，不进入普通失败重试。Skill、本地工具和能力管理器不能另建第二份工具调用账本。

### 恶劣用户与中断边界

能力管理器的配置变更、启停和健康投影必须有唯一持久归属者。网页端只有在配置事务提交后才能把操作显示为已接受；提交失败或宿主在提交前消失时，显示未接受，不能留下只存在于页面或内存的假状态。

能力运行时至少区分未配置、启动中、就绪、停止中、已停止、降级和启动结果未知。启动 Playwright 进程使用稳定操作标识、所有者令牌、心跳和租约。可控关闭只释放当前宿主的借用；宿主被杀、终端关闭或主机重启后，由过期租约和控制平面账本对账。恢复可以重新建立已确认停止的浏览器服务，但不能把派发中的浏览器动作或网页研究请求当作未发生而重放。

工具调用仍由工具账本拥有。派发前、派发后未回包、已获得结果和已持久提交必须是可区分的事实；派发后中断一律留下不确定证据，等待模型或用户基于证据决定下一步。关闭、终止、重复启停和清理必须幂等，连续中断不能产生第二个执行所有者或遗留子进程。

### 能力包类型


- 内置能力：当前核心与保留的本地行为。它只暴露适合模型使用的结果级工具。
- 技能包：内容包。它可贡献说明、资源和声明的脚本，但默认不把全文注入每轮上下文。
- MCP：第一版只有 `playwright` 能力包。它启动和配置批准的 MCP 命令、发现工具、分配命名空间、控制客户端池，并把输出转换为有上限的证据文件。
- Web：bundled 结果能力，固定贡献 `web_search`、`web_fetch` 和 `web_download`。搜索结构化解析 Bing RSS，返回标题、URL、摘要和有界原始证据；受控 GET 只接受 HTTP(S)，返回最终 URL、状态、有限响应头、正文投影和证据；下载限制响应字节数并原子替换目标文件。
不注册模型可见的通用 `network`、任意方法/请求体/凭证注入、HTTP session/suite、探测、追踪、OpenAPI 或代理工具。

### 用户工作流

`kitty start` 以扁平独立模块呈现模型、工具与扩展、Skill、媒体、微信、Telegram 和其他设置。用户在模型设置中配置模型凭证，在工具与扩展中管理能力启停，在其他设置中配置 Playwright 运行方式与操作超时；Web 无凭证、无独立配置表单，Skill 初始化与现有欢迎便签、媒体、微信和 Telegram 工作流继续保留。

### 影响边界

实现必须追踪并替换扩展定义、运行时配置与结构、环境模板、注册表组合、宿主生命周期、控制平面与工具结果合同、上下文技能包投影、网页端配置和读取模型、类型化呈现、构建输入、测试、`spec.md` 与 README。最终文件清单由调查决定；不因文件陈旧而保留。

已确认的 owner 影响清单：

- 输入入口：`runHostTurn()`、`InteractiveSessionDriver`、one-shot、Web、Telegram、微信；它们只借用项目级能力运行时，并在宿主关闭时幂等释放。
- 直接消费者：`ToolRegistry` 接受就绪能力的 typed tool sources；context 读取同一持久启用状态筛选 Skill 索引；runtime/Web 只投影 manager snapshot。
- 持久状态：`ControlPlaneLedger` 拥有 capability lifecycle 与 tool dispatch；`statePaths` 拥有 `.kitty/capabilities/`；`.env` 只拥有专属配置值。
- 展示出口：runtime status、typed locale catalog、`kitty start` bootstrap 与能力工作流；页面不推断健康或保存第二套状态。
- 错误与恢复：turn/tool ledger 结算外部不确定性；capability lease 与 process identity 结算 MCP owner；parent-death watchdog 和过期 lease 对账清理子进程。
- 测试与文档：能力发现/状态、配置接受点、跨轮复用、强杀恢复、不确定派发、研究证据、Web bootstrap、模板、`spec.md`、README 和本计划同步。

## 7. 实施任务

- [x] 从宿主输入开始，经上下文、模型提供方、工具账本、控制平面、能力状态、网页配置和测试完成全局语义调查；在本计划记录准确归属者和消费者。
- [x] 定义当前能力包清单、能力包类型、就绪和健康状态、配置合同与能力状态结构；删除静态扩展开关归属。
- [x] 实现 `CapabilityManager` 和保留内置工具、技能包的适配器；除新管理合同外不改变其产品行为。
- [x] 用动态能力包配置和可观察健康状态替换静态扩展配置、环境模板和 `kitty start` 能力投影。
- [x] 增加外部工具和研究贡献所需的工具结果不确定性、证据文件上限和能力来源呈现；同步账本和恢复行为。
- [x] 实现项目范围的 Playwright MCP 运行时、工具发现与命名空间、生命周期租约、配置和类型化输出与证据边界。
- [x] 将 `dev.md` 的恶劣用户生命周期审查落实到能力配置、启停、MCP 子进程和研究派发：定义持久接受点、操作标识、租约、心跳、中断结算、恢复和幂等清理。
- [x] 调查免凭证搜索后端并用真实请求验证 DuckDuckGo Instant Answer、DuckDuckGo HTML/Lite 与 Bing RSS 的可用性、结果形状、机器访问和授权边界。
- [x] 实现默认就绪的 Web 定义与适配器：结构化 Bing RSS `web_search`、受控有界 `web_fetch`、有界原子 `web_download`、来源/响应/文件证据、健康投影和不确定终态。
- [x] 将保留能力的专属持久状态迁移到新归属者，并直接重置旧扩展状态，不做迁移。
- [x] 用结果级覆盖替换受影响测试：能力包发现与配置、就绪、跨轮次 MCP 复用、不确定派发恢复、研究证据投影和重置行为。
- [x] 收敛配置 schema、env 模板、Web 表单、本地化与测试中的搜索配置；Web 使用内部固定边界；重新生成 `.kitty/.env` 与 `.kitty/.env.example`。
- [x] 将当前能力清单同步到 `spec.md`、README、`philosophy.md`、测试和本地化呈现。
- [x] 运行定向检查、完整验证、构建、既有 Playwright live、真实 Bing 搜索、真实页面读取和真实外部下载演练；更新本计划的事实和收口。

## 8. 验证计划

- 增加测试，证明能力包描述与配置产生正确的就绪状态，且只有已就绪工具贡献能够进入注册表。
- 使用可控 MCP 测试替身增加宿主级双轮次测试，证明一个项目范围的 Playwright 客户端被复用，且只在宿主关闭时清理。
- 增加账本与恢复测试：远端派发丢失结果时结算为不确定，而不是伪装失败或被重放。
- 增加恶劣用户路径测试：配置提交前强杀不得显示已接受；连续启停和中断必须幂等；Playwright 启动或调用中宿主消失后，不遗留子进程、不产生第二个所有者、不盲目重放浏览器动作。
- 使用可控后端测试替身验证 Web 合同：RSS 结构化解析、编号来源、有界证据、HTTP 已知失败、HTML/JSON 正文投影、派发后断连的 `uncertain` 与禁止重放；下载验证精确字节、原子提交、大小上限和无部分目标文件。
- 实现后运行 `npm.cmd run typecheck`、定向测试集、`npm.cmd run build` 和 `npm.cmd run verify`。
- 运行 `node .test-build/scripts/verify-live-capabilities.js web`，真实请求 Bing RSS、验证非空来源和证据文件，真实读取一个搜索结果，再下载真实外部资源并校验文件字节与 artifact；任一失败即不通过。
- 只在可执行文件与配置已具备后运行明确的本地 Playwright MCP 路径，记录命令、结果和任何不可用的浏览器依赖。
- 不运行 `kitty start` 视觉自动化或截图；已授权的 Playwright MCP live 验收只验证能力自身的真实启动、导航、跨借用复用与清理，视觉质量仍由人工审查。
- 检查最终源码、生成配置、`spec.md`、README 和 `git diff --check`；报告任何尚未验证的环境条件。

## 9. 收口

状态：完成。统一能力系统、免凭证 Web、配置与呈现、文档、定向测试、完整验证和真实外部验收均已收口。

已确认：

- 项目所有者已确认产品边界：语言模型与模型之外的能力；能力统一管理协议，但按类型分别执行。
- 项目所有者已确认对能力层进行断裂式重建。
- 项目所有者已将第一版外部 MCP 限定为 Playwright。
- 当前工具执行与恢复 owner、项目级能力运行时边界、配置持久接受点、Skill 按需加载边界和 Web 受影响面已经由源码与定向验证确认。
- 搜索后端调查确认 DuckDuckGo Instant Answer 不能返回通用网页结果，HTML/Lite 不允许抓取；Bing RSS 在当前环境无需凭证真实返回 10 条 XML 结果。项目所有者在明确知晓响应版权限制后决定使用 Bing；Playwright 客户端继续采用官方稳定 v1 SDK。
- Web 定向集证明默认就绪、三个工具贡献、RSS 结构化来源、有界证据、HTML 正文投影、下载精确字节与原子超限保护、派发后不确定终态和禁止重放；相关能力/config/i18n/runtime UI/Web 定向集 37 项全部通过。
- `node .test-build/scripts/verify-live-capabilities.js web` 真实返回 8 条 Bing 结果，读取 `nodejs.org` 搜索结果，并下载、解析和校验 326,014 bytes 的 Node 发布索引。
- 项目所有者澄清必须保留 `kitty start` 的欢迎便签、网页端、媒体、微信、Telegram 和其他设置；当前实现以扁平独立模块保留这些入口，并提供独立的工具与扩展、Skill 管理入口。
- 能力、Web、配置、i18n、runtime UI、公共类型与本地控制台定向集 37 项全部通过。
- `npm.cmd run typecheck`、`npm.cmd run build` 与 `npm.cmd run verify` 均通过；完整 core 为 443 项：442 通过、0 失败、1 项 POSIX 专用测试跳过；包清单为 21 个文件且无原生 addon。
- `node .test-build/scripts/verify-live-capabilities.js playwright` 已再次真实启动官方 MCP 与 Chromium，导航并读取 loopback 页面，发现 24 个工具，连续借用复用 PID 14632，关闭后确认进程消失。
- 最终 `node .test-build/scripts/verify-live-capabilities.js web` 真实返回 8 条 Bing 结果，读取 `nodejs.org` 搜索结果，并下载、解析和校验 326,014 bytes 的 Node 发布索引；第一次收口调用因完整测试 runner 已清理 `.test-build` 而未进入能力，重新执行 `npm.cmd run test:build` 后原命令通过。
- `git diff --check` 通过；旧凭证型 Web 合同扫描为 0；`.kitty/.env` 与 `.kitty/.env.example` 各有 44 个唯一配置键且键集合完全一致。

尚未确认：POSIX 进程树清理无法在当前 Windows 主机实测；Web 视觉审美按项目规则留给人工验收。本轮未再次启动浏览器自动化，Playwright 采用本次统一能力实现阶段已经通过的真实 live 结果，并由最终完整测试中的 4 项生命周期测试复验未回归。

剩余风险：Bing RSS 响应明确限制个人、非商业 RSS 阅读器之外的使用并可能随时改变或停止；当前实现必须公开记录这一上游约束。Playwright 不是搜索索引。POSIX 进程树清理未在当前 Windows 主机实测。

改动文件：`src/capabilities/**`、`src/control/{capabilities,toolCalls,schema,ledger,lease}.ts`、`src/config/**`、`src/host/{toolRegistry,turn}.ts`、`src/tools/**`、`src/agent/**`、`src/context/runtime/prompt.ts`、`src/project/statePaths.ts`、`src/runtime*/**`、`src/web/**`、`src/i18n/**`、`src/types/**`、`src/media/generation.ts`、`tests/capabilities/**` 及受影响的 control/config/host/i18n/runtime-ui/skills/types/Web 测试、`scripts/verify-live-capabilities.ts`、`package*.json`、`tsconfig.tests.json`、`.kitty/.env*`、`spec.md`、`README.md`、`philosophy.md` 与本计划。

没有执行 commit、push、部署或外部服务配置。

## 10. `kitty start` 能力体验重做追加合同

### 10.1 需求

保留现有欢迎便签、网页端、媒体、微信、Telegram 和其他设置。`kitty start` 是项目初始化与本地控制台入口：首页不按“语言模型 / 能力”做二层聚合，而把模型、网页端、工具与扩展、Skill、媒体、微信、Telegram 和其他设置作为职责单一的独立模块。每个入口必须让第一次使用 Kitty 的人先看懂能完成什么，再决定是否进入。Skill 支持项目范围的创建、查看、修改和删除。页面所有固定说明、状态解释、计数、按钮和 Playwright 配置提示必须随 `KITTY_LOCALE` 在简体中文、英文、日文、韩文之间完整切换。Playwright 默认以可见浏览器运行，用户明确开启后台模式后才无头运行。

### 10.2 当前事实与对照

- 首页已经恢复一列独立工作流入口，欢迎便签、品牌头部和每项入口的用途说明保留；模型、网页端、工具与扩展、Skill、媒体、微信、Telegram 和其他设置互相独立。
- 静态能力名称、用途、状态解释、Skill 资源与命令依赖统计已经由四语 typed catalog 投影；能力定义层英文事实只进入按需技术明细。
- 工具与扩展页先显示能力用途、状态解释与本地化概览，再按需显示安装来源、工具名和运行明细；Skill 位于独立管理页。
- `INITIAL_CAPABILITY_CONFIG.playwright.headless` 与两份完整项目模板当前均为 `false`，页面以“后台运行浏览器”开关投影持久值。
- `initializeProjectFiles()` 当前初始化 `.kitty` 配置、ignore 文件和 `skills/`；本地控制台先建立能力状态 owner，再递归加载当前 Skill。Web Skill API 已支持创建、列表、读取、更新与删除。
- 能力状态、配置持久提交、工具执行 owner、微信、Telegram、媒体和 Skill 初始化边界均已验证，不属于本次重做范围。

### 10.3 失败测试

- [x] 四种 locale 的 bootstrap 必须为静态能力投影本地化名称、用途、状态解释和界面计数，不允许把定义层英文摘要作为固定界面说明。
- [x] 首页必须恢复扁平的独立模块入口；工具与扩展页只管理能力状态、工具目录和 Playwright 配置，Skill 页只管理 Skill 内容包。
- [x] 工具与扩展页必须存在面向新用户的概览、分类说明、状态解释、按需展开的工具明细和 Playwright 可见/后台模式提示。
- [x] Skill 包自身的名称、描述和正文保持用户原文，但资源数、命令依赖数和固定标签必须本地化。
- [x] Skill 页面必须完成创建、列表、读取、修改和删除；只允许更新或删除当前工作目录 `skills/` 树下的包，删除操作必须明确确认且拒绝越界目标。
- [x] `kitty start` 初始化必须创建当前模板、`skills/` 工作区和能力状态 owner，再递归加载现有 Skill；不得虚构一个空白 Skill。
- [x] 初始配置和完整 env 模板必须把 Playwright `headless` 设为 `false`，显式保存后仍按持久值投影。
- [x] 欢迎语、媒体、微信、Telegram、其他设置、Web 工作台和 Skill 新建的现有正向测试不得回归。

### 10.4 目标与设计

首页恢复上一版清晰的扁平工作流入口，每个模块一张入口卡，不设置产品层容器。工具与扩展页先显示就绪、需处理和已关闭的本地化概览，再按“常用工具”“互联网与浏览器”分组；Skill 从该页拆成独立工作流。每项用本地化图标、名称、日常用途和状态解释构成主要阅读路径；安装来源与稳定工具名收进可展开技术明细。静态能力由 capability id 映射 typed locale catalog；项目 Skill 保留内容原文。Playwright 配置使用“后台运行浏览器”开关，默认关闭，并明确关闭时会显示浏览器窗口以便观察。Skill CRUD 由 `WebSkillService` 拥有文件写入，服务端路由负责认证与请求边界，网页只保存持久提交后的结果。

### 10.5 实施任务

- [x] 增加四语能力目录、用途、概览、状态解释、技术明细和 Skill 统计文案，并保持 typed catalog key 与占位符完全一致。
- [x] 重构能力列表的纯呈现逻辑，静态能力使用本地化目录；把技术工具名与 owner 错误收进按需明细。
- [x] 调整首页、工具与扩展页、独立 Skill 页及响应式样式，恢复单模块入口层级，保留全部既有工作流。
- [x] 扩展 `WebSkillService`、服务端路由和网页交互，完成项目 Skill CRUD 与 `skills/` 工作区初始化；收口前补齐更新路径的真实路径边界校验。
- [x] 把 Playwright 初始无头配置改为 `false`，同步项目 env 模板、生成文件、配置测试、事实文档和页面提示。
- [x] 增加新用户理解路径、四语投影、默认可见浏览器和既有入口保留的正向测试；定向集 25 项全部通过。
- [x] 运行定向测试、`npm.cmd run typecheck`、`npm.cmd run build`、`npm.cmd run verify` 与 `git diff --check`，回填实际事实、未验证项和剩余风险。

### 10.6 验证与收口

状态：完成。首页、工具与扩展、独立 Skill CRUD、四语呈现、初始化顺序、默认可见 Playwright、测试和事实文档均已收口。

实际验证：

- 配置/i18n/Web 定向集 25 项全部通过；补充真实路径越界保护后，本地控制台定向集 10 项全部通过，Windows junction 用例真实执行且未跳过。
- `npm.cmd run typecheck` 与 `npm.cmd run build` 通过；包检查为 21 个文件且无原生 addon。
- 首次 `npm.cmd run verify` 的高并发完整集中，`bash-output-governance` 出现一次前台命令非零终态；该用例单独复现通过，随后原样完整重跑通过。最终完整集为 445 项：444 通过、0 失败、1 项 POSIX 专用跳过。
- `node .test-build/scripts/verify-live-capabilities.js web` 真实返回 8 条 Bing 结果，读取 `https://nodejs.org/en`，下载并校验 326,014 bytes 的 Node 发布索引，搜索、响应和文件证据均已持久提交。
- `.kitty/.env` 与 `.kitty/.env.example` 已从当前模板完整重建，各 46 个配置键、键集合一致，`KITTY_PLAYWRIGHT_HEADLESS=false`；`git diff --check` 通过。

未验证：按项目规则没有启动 `kitty start` 浏览器、没有截图、没有运行浏览器自动化；本轮没有再次启动 Playwright MCP，沿用统一能力实现阶段已经通过的真实 MCP/Chromium 启动、导航、跨借用 PID 复用和清理结果，并由本轮完整测试中的 4 项 Playwright 生命周期测试复验未回归。POSIX 进程树清理无法在当前 Windows 主机实测。Web 视觉审美留给项目所有者人工验收。

剩余风险：Bing RSS 仍受个人、非商业 RSS 阅读器上游限制并可能停止；首次完整验证暴露过一次未稳定复现的高并发前台命令失败，单测复现和完整重跑均通过但仍作为环境时序风险记录；POSIX 进程树清理未在当前主机实测。

本追加合同改动集中在 `src/web/**`、`src/i18n/{zhCN,en,ja,ko}.ts`、`src/config/{capabilities,init}.ts`、`src/skills/schema.ts`、`src/control/capabilities.ts`、`src/capabilities/manager.ts`、相关 config/i18n/Web 测试、`.kitty/.env*`、`spec.md`、README 与本计划。没有执行 commit、push、发布或部署。

## 11. 标准 Skill 目录与同权 CRUD 修正合同

### 11.1 需求

Kitty 只从当前工作目录唯一的 `skills/` 根递归加载 `skills/**/SKILL.md` 内容包，不再组合任何其他 Skill 来源。仓库当前只提供 `read-only` 只读审计 Skill；媒体与开发工作流继续由各自能力和开发 Agent 边界负责，不重复包装成运行时 Skill。所有被 Kitty 加载并显示的 Skill 必须一视同仁地支持查看、修改和删除；页面新建的 Skill 写入 `skills/<name>/`。开发 Agent 使用的 `.agents/skills/`、隐藏 `.skills/`、项目根单文件和其他目录不进入 Kitty 运行时。

### 11.2 当前事实

- `discoverSkills()` 曾同时扫描根 `SKILL.md`、`.skills/**/SKILL.md` 和 `skills/**/SKILL.md`，存在多个运行时来源。
- `WebSkillService` 曾展示上述来源，却只把 `.skills/<name>/SKILL.md` 判定为可编辑；`skills/` 下的包因而只能读取。
- Web 新建和 `kitty start` 初始化曾使用 `.skills/`，与运行时 Skill 所在的 `skills/` 不一致。
- 仓库运行时目录曾包含 `agnes-media`、`dev` 与 `read-only` 三个包，超过当前只保留只读审计的产品边界。
- Skill 正文仍按需加载，能力状态与工具执行 owner 不受目录收敛影响。

### 11.3 失败测试

- [x] 运行时只递归发现当前工作目录唯一 `skills/**/SKILL.md` 来源；`.skills/`、`.agents/skills/`、根 `SKILL.md` 和其他目录不进入索引。
- [x] 标准目录名必须与 frontmatter `name` 一致，非法包明确失败。
- [x] `kitty start` 初始化 `skills/`，Web 新建写入 `skills/<name>/`。
- [x] `skills/` 中已有包与页面新建包均可读取、修改、删除，API 持久提交后立即刷新 Skill 与能力投影。
- [x] 符号链接或真实路径越出标准目录的包不进入索引，更新与删除也不得改变目标文件。

### 11.4 目标与设计

`src/skills/discovery.ts` 是标准运行时来源 owner，只递归枚举当前工作目录唯一 `skills/**/SKILL.md` 来源，校验包目录名并排除符号链接或真实路径越界包。`WebSkillService` 初始化和新建使用当前工作目录 `skills/`，CRUD 对该树内所有已发现包同权开放，写入前再次进行真实路径校验。页面不再维护 read-only Skill 分支，因为其他来源根本不进入列表。Context 继续只注入索引，正文与资源仍由 `skill_*` 工具按需读取。文档、工具说明和测试只描述这一个当前事实。

### 11.5 实施任务

- [x] 收敛 Skill 发现为当前工作目录单一 `skills/**/SKILL.md` 来源，统一初始化、新建和树内 CRUD 路径，保留真实路径越界保护。
- [x] 用结果测试覆盖标准来源、同权 CRUD、非标准目录排除和符号链接拒绝；不冻结仓库当前 Skill 数量或清单。
- [x] 删除重复的 `agnes-media` 与 `dev` 运行时内容包，只保留 `read-only`。
- [x] 同步 `spec.md`、README、四语固定提示和工具描述。
- [x] 运行定向测试、`npm.cmd run typecheck`、`npm.cmd run build`、`npm.cmd run verify` 与 `git diff --check`，回填实际收口。

### 11.6 验证与收口

状态：完成。

实际验证：

- 定向 Skill/Web/i18n/初始化集 33 项全部通过；其中 Skill 测试只保护来源规则、按需加载、同权 CRUD、名称合同和越界清理，不固定仓库当前 Skill 数量或清单。
- `npm.cmd run typecheck`、`npm.cmd run build`、`npm.cmd run verify` 全部通过；完整集 445 项为 444 通过、0 失败、1 项 POSIX 专用跳过。
- 独立运行时探针实际读取当前仓库 `skills/`，返回 `skills\\read-only\\SKILL.md`；未从根目录、`.skills` 或 `.agents/skills` 读取内容。
- `git diff --check` 通过；仓库 `skills/` 当前只保留 `read-only/SKILL.md` 内容包，媒体生成能力仍由独立能力工具提供。

未验证：按项目规则没有启动 `kitty start` 浏览器、没有截图、没有运行浏览器自动化；本轮改动未触及 Playwright MCP 执行 owner，完整验证中的 Playwright 生命周期测试已通过。POSIX 进程树清理仍无法在当前 Windows 主机实测，Web 视觉审美留给项目所有者人工验收。

剩余风险：未来新增 Skill 必须放在当前工作目录 `skills/` 树内，并遵守目录名与 frontmatter `name` 一致的合同；其他目录不会被 Kitty 发现。Skill 内容仍是用户可编辑的指令和资源，按需加载边界由 `skill_*` 工具 owner 维护。

## 12. 能力开关呈现修正合同

### 12.1 需求

工具与扩展页面的可停用能力使用旧版同类产品中的开关控件表达启用状态，不使用“启动/停止”文字按钮作为主控件。固定能力继续显示锁定和始终可用；切换仍通过现有能力 API 持久提交，页面只在服务端接受后刷新状态。

### 12.2 当前事实

- `renderCapabilitySettings()` 当前把可停用能力渲染成带“启动/停止”文字的按钮。
- 前端已经通过 `PUT /api/capabilities/:id` 调用 `CapabilityManager.setEnabled()`，后端持久化 operation、owner 和健康状态；本次不改执行或控制平面。
- 页面已有能力卡片、状态标签、技术明细和底部配置保存表单，微信、Telegram、欢迎便签和媒体工作流不受影响。

### 12.3 目标与设计

可停用能力渲染为带 `role="switch"` 的 checkbox，使用绿色启用轨道、禁用轨道和键盘焦点状态；控件的 `checked` 与能力快照一致，切换失败恢复原值。能力列表使用响应式两列卡片，窄屏退回单列；状态文字继续展示真实的禁用、启动中、就绪、降级和已停止状态。固定能力继续渲染锁图标。

### 12.4 实施与验证

- [x] 更新 `workflowViews.js`、`app.js` 和 `styles.css` 的能力开关呈现与失败回滚。
- [x] 保留现有 Web 能力 API 和持久提交合同，补充静态页面结构断言。
- [x] 运行定向 Web 测试、`npm.cmd run typecheck`、`npm.cmd run build`、`npm.cmd run verify` 与 `git diff --check`。

### 12.5 收口

状态：完成。

实际验证：Web 定向测试 10/10 通过；`npm.cmd run typecheck`、`npm.cmd run build` 与 `npm.cmd run verify` 通过，完整测试 445 项中 444 通过、0 失败、1 项 POSIX 专用检查在 Windows 跳过；`git diff --check` 通过。未启动浏览器自动化或截图，视觉观感按项目规则留给人工验收。

### 12.6 全局二元开关统一

用户验收发现 Playwright 后台模式仍使用 Bootstrap `form-switch`，与能力卡片的绿色开关形成两套视觉和交互呈现。源码调查确认本地控制台当前只有这两个 checkbox 入口；前者由配置表单持久提交，后者由能力 API 持久提交，执行 owner 不同但呈现控件应统一。

- [x] 将两处 checkbox 统一为同一套通用 switch 标记、轨道、滑块、启用态、关闭态和焦点态。
- [x] 删除不再使用的 Bootstrap switch 呈现规则，保持 Playwright 配置 ID、默认值和保存语义不变。
- [x] 补充两处正向结构验收，运行 Web 定向测试、`npm.cmd run typecheck`、`npm.cmd run build`、`npm.cmd run verify` 与 `git diff --check`。

状态：完成。

实际验证：真实本地控制台 Web 定向测试 10/10 通过；`npm.cmd run typecheck`、`npm.cmd run build` 与 `npm.cmd run verify` 通过，完整测试 445 项中 444 通过、0 失败、1 项 POSIX 专用检查在 Windows 跳过；构建产物已确认包含统一 `ui-switch`，`git diff --check` 通过。未启动浏览器自动化或截图，最终视觉观感按项目规则留给人工验收。

### 12.7 Core 工具启停与浏览器设置归位

用户需要在只与语言模型对话时停用“基础文件与命令”，并要求把浏览器运行方式、后台运行开关和单次操作超时全部放入“其他设置”。调查确认 core 工具虽然已投影为能力，但默认注册表和宿主额外工具路径仍会无条件加入 `read`、`edit`、`write`、`bash` 与 `send_file`；只改页面或 `canDisable` 会产生假开关。Playwright 配置继续使用唯一环境键 `KITTY_PLAYWRIGHT_HEADLESS` 与 `KITTY_PLAYWRIGHT_TIMEOUT_MS`，无需迁移或双写。

生命周期调查同时确认：配置持久提交后会关闭旧项目能力运行时，却没有按新配置重建并启动仍然启用的 Playwright，因此页面出现“开启 + 已停止”；项目运行时池在异步关闭前先删除 Map 条目，关闭期间可能创建第二个 manager；本地控制台的并发 `close()` 不共享 Promise，任一清理失败会截断后续清理且 `wait()` 永远不结束；HTTP 路由未在关闭前停止 admission 和排空，SSE、WebSocket replay/control 的异步错误缺少统一结算；微信扫码登录是未跟踪任务，控制台关闭后仍可能写入凭证和发布事件。CLI `kitty start` 只监听 SIGINT/SIGTERM，未覆盖终端关闭相关的 SIGHUP/SIGBREAK。

实现后的第二轮全链审计又确认五个更深的生命周期缺口：项目运行时虽记录 borrow 数却未在配置替换前等待，带 `extraTools` / `builtinToolFilter` 的宿主注册表还会在新注册表实际关闭前提前释放 borrow；Web 内嵌 `InteractiveSessionDriver` 与 `kitty start` 同时拥有进程信号，前者可能在控制台事务清理完成前直接 `process.exit`；WebSocket replay 与 session control 任务没有进入关闭排空；Playwright 启动失败时会吞掉连接或子进程清理错误并释放 owner，且新子进程缺少 creation identity 时仍可能进入运行态；配置原子提交后仍有一次会把已提交配置误报为未接受的重复校验。上述缺口必须在本次收口中修正，不能由既有绿灯掩盖。

目标设计：项目运行时池按项目根串行执行获取、关闭和替换，旧 manager 完整关闭后才能发布新 manager；配置先原子提交，再使用新 runtime 重建 manager 并真实 reconcile 已启用外部运行时。控制台关闭使用唯一共享 Promise：先停止新 HTTP/WebSocket admission，关闭 SSE/WebSocket 输入并中断可取消请求，排空已接受路由，再停止微信/Telegram、scheduler、Web driver 和项目能力运行时；所有清理均执行并聚合错误，`wait()` 无论清理成功与否都必须结束。微信登录使用可取消的受跟踪任务和 generation fencing，关闭或登出后不得保存迟到凭证。恢复只读取控制平面、工具账本和能力 owner，不从页面状态推断。

失败测试与验收：

- [ ] `core-tools` 默认启用；持久停用后五个 core 工具不进入默认或带 `extraTools` / `builtinToolFilter` 的宿主注册表，重新启用后恢复，纯模型轮次可发送无 `tools` 请求。
- [ ] 已启用 Playwright 在配置保存导致旧连接关闭后，必须由新配置真实重建为 `ready`；启动失败投影 `degraded`，不得出现“开启 + 已停止”。
- [ ] 同一项目关闭与重建串行，关闭中的第二次获取不能创建第二 owner；Playwright 并发关闭共享结果并只清理一次。
- [ ] 配置替换必须等待已经借出的能力注册表释放；默认注册表和带宿主额外工具的注册表都必须把 borrow 保持到自身真实关闭，不能在活跃工具调用期间关闭 Playwright。
- [ ] 本地控制台重复/并发关闭等待同一事务；一个 cleanup 失败不阻断其余清理，HTTP/SSE/WebSocket 停止 admission 并结束连接，已接受配置提交完成后才关闭新运行时。
- [ ] WebSocket replay 与 session control 进入受跟踪排空；Web 内嵌会话驱动不另绑进程信号，`kitty start` 是控制台关闭的唯一 signal owner，连续信号复用同一优雅关闭并能在第二次信号或固定 deadline 强制收口。
- [ ] 微信扫码登录在关闭/登出后失效，迟到回调不能写凭证或发布连接成功；微信、Telegram 服务停止继续等待已有 service/lock 清理合同。
- [ ] `kitty start` 对 SIGINT、SIGTERM、SIGHUP 和 SIGBREAK 进入同一幂等关闭；第二次信号不创建第二关闭 owner。
- [ ] Playwright 只有在连接和子进程清理都确认完成后才能释放 owner；启动失败、creation identity 缺失或清理失败必须保留 `degraded` owner 和子进程证据，后续幂等清理成功后才能新建 generation。
- [ ] 配置原子替换后即视为已接受；随后 runtime resolve/reconcile 失败返回 `runtimeApplyError` 和降级状态，不能把已经落盘的配置伪装成保存失败。
- [ ] 浏览器运行方式说明、后台运行开关和 Playwright timeout 全部由“其他设置”唯一表单持久提交，timeout 保留 5000..600000、step 1000 和四语提示；工具与扩展页只保留能力状态和目录。

实施任务：

- [ ] 修正 core 能力贡献和两条注册表组合路径，增加结果级启停测试。
- [ ] 串行化项目运行时池，增加 manager/Playwright 可等待幂等关闭与 enabled runtime reconcile；配置保存后按新 runtime 原子重建并发布能力快照。
- [ ] 重建本地控制台关闭事务、请求排空、SSE/WebSocket 错误结算、微信登录取消与 CLI 信号接线，补生命周期测试。
- [ ] 保持能力 borrow 到每个真实工具注册表关闭，配置替换等待 borrow drain；收敛 WebSocket 异步任务和 Web 内嵌 signal owner，硬化 Playwright 启动失败清理与进程 identity 门槛。
- [ ] 将全部 Playwright 设置迁入“其他设置”，同步 typed runtime field、四语 catalog、README、`spec.md` 和 Web 正向测试。
- [ ] 先运行定向测试，再运行 `npm.cmd run typecheck`、`npm.cmd run build`、`npm.cmd run verify`、真实 Web/Playwright 能力验收与 `git diff --check`，回填完成事实、未验证项和剩余风险。

状态：执行中。
