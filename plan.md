# Agnes 多模态与 llama.cpp 本地模型 Plan

## 1. 需求文档

Kitty 需要同时具备两类可长期使用的免费能力。

第一类是 Agnes AI 的图片和视频生成。用户应能在 Agent 对话中要求生成或编辑图片、创建或续查视频任务，最终拿到项目内的本地文件；也应能在 Web 工作台中独立配置和验证多模态 Provider，并直接输入提示词生成图片或视频。Web 必须展示生成状态、产物预览和本地文件路径，视频创建后自动按持久 `video_id` 低频查询，刷新页面后仍能继续当前浏览器会话中的查询。浏览器不能直接持有或调用 Agnes 密钥。视频排队期间不能用错误 ID 查询、不能高频空转，也不能因进程恢复而丢掉已经确认的任务事实。

第二类是本机 llama.cpp 文本推理。用户应能在现有“语言模型设置”中选择本地 Provider 和已安装模型，复用 Kitty 的同一 Agent、session、tool、streaming、context 和恢复链路。部署应匹配当前电脑的 8 GB RTX 5070 Laptop GPU、32 GB 内存和 D 盘空间；当前部署清单包含 Google Gemma 3 与两个适配显存的 Qwen3 GGUF 模型。Google Gemini 没有可下载的开放权重；本地 Google 模型使用官方开放权重 Gemma 3。

本次交付包含：Agnes 图片/视频 Provider 适配、两个 Agent 工具、运行时 Agnes 多模态 skill、Web 配置与人类生成工作台、llama.cpp Provider 适配、D 盘二进制与 Gemma/Qwen GGUF 模型部署、真实图片/视频/本地推理验收、边界测试和 `spec.md` 同步。commit/push 不在未明确授权的范围内。

业务完成标准：

- Agent 能生成一张 Agnes 图片并把有效图片文件保存到项目内。
- Agent 能创建 Agnes 视频任务，持久返回 `video_id`，按该 ID 查询到完成并保存有效视频文件。
- Web 工作台分别呈现语言模型设置和图像/视频设置，配置可读、可写、可验证。
- 人类能在 Web 输入提示词生成图片，看到可预览的有效图片和项目内路径；也能创建视频、看到持久 `video_id` 与排队/进行状态，并在完成后预览或下载有效视频。
- llama.cpp 在 `127.0.0.1` 提供 OpenAI-compatible API，Gemma 本地模型可按模型名加载；Kitty 能完成流式文本和真实工具调用。
- 配置错误、非法尺寸/帧数、认证失败、429/5xx、超时、中断、过快轮询、无效响应、下载失败和恢复边界都有明确行为和测试证据。

## 2. 当前事实

### 机器与外部服务

- 当前机器是 Ryzen 9 8945HX，16 核 32 线程，物理内存 34,142,187,520 字节。
- GPU 是 NVIDIA GeForce RTX 5070 Laptop GPU，显存 8,151 MiB；驱动 573.24，CUDA runtime capability 12.8。调查时桌面进程已占约 1.6 GiB 显存。
- D 盘约 512.7 GiB 可用，适合保存二进制和模型；部署目标为 `D:\AI\llama.cpp`。
- `llama-server` 与 `llama-cli` b10068 CUDA 12.4 已安装到 `D:\AI\llama.cpp\bin`，两个官方 ZIP 的 SHA-256 均通过；CMake、uv 与 ffmpeg 不属于当前运行依赖，未安装。
- llama.cpp 官方 Windows CUDA 12.4 发布包可在当前 NVIDIA 驱动上运行。当前官方 release 是 `b10068`；主程序包与 CUDA runtime 包均提供发布 SHA-256。
- Hugging Face 主站 API 可访问但大文件吞吐受限；当前 Gemma 从 ModelScope 官方镜像分段断点下载，并按固定 SHA-256 校验。
- 当前本地模型集合为 Google `gemma-3-12b-it-q4_0`、Qwen3 8B Q4_K_M 和 Qwen3 4B Q4_K_M；Gemma 已完整合并并通过 SHA-256 marker，Qwen 两个模型已加入 manifest，等待用户下载。Gemma 的 SHA-256 为 `dd53172ff3a7b1b16c8fb3d944b87f42a6228ff2de3825b8813ae90d988434cd`。Kimi、MiniMax、GLM、DeepSeek 和 Phi 不在当前本地部署清单中。
- 当前 `.kitty/.env` 已有非空 `KITTY_API_KEY`。值不进入日志、源码、plan、测试、截图或 Git；本机多模态配置会从该值初始化独立媒体密钥。

### Agnes 官方合同

- Agnes API base URL 是 `https://apihub.agnes-ai.com/v1`，Bearer 鉴权，免费账户限制为 RPM 20。
- 图片使用 `POST /v1/images/generations`。当前选择 `agnes-image-2.1-flash`；推荐 `size` 为 `1K` 至 `4K`，`ratio` 为官方八种比例；URL 输出必须使用 `extra_body.response_format = "url"`。
- 图片编辑输入是 URL 或 Data URI 数组。官方文档在参数表写顶层 `image`，说明区又写 `extra_body.image`；真实 1K 编辑成功证明当前 wire 使用 `extra_body.image`。
- 视频使用 `POST /v1/videos` 创建异步任务。当前模型是 `agnes-video-v2.0`。
- 新集成必须从创建响应字段 `video_id` 读取不透明 ID，并用 `GET /agnesapi?video_id=...` 查询；真实 2026-07-19 响应证明该字段的值当前可能以 `task_` 开头，因此不能用值前缀猜测字段语义。`task_id` 请求/响应字段不进入当前产品主干。
- `num_frames <= 441` 且满足 `8n + 1`，`frame_rate` 为 1 至 60，视频宽高必须是 64 的倍数。最终时长和尺寸以响应 `seconds`、`size` 为准。
- 视频状态是 `queued`、`in_progress`、`completed`、`failed`。真实 poll 响应使用顶层 `id` 回显任务，不重复 `video_id` 字段；poll normalization 以请求携带的持久 `video_id` 为 owner，并校验回显 `id` 不冲突。完成响应必须有可下载 URL。
- 400/401/403/404/413/415/422 是用户或合同错误；408/429/5xx 和网络失败可能临时；POST 在响应边界不确定时不能自动重放，GET 查询和下载可以有界重试并尊重 `Retry-After`。

### Kitty 代码与状态

- `spec.md` 是当前事实 owner；`dev.md` 要求每个新功能检查接受、执行、提交、中断、失败、恢复、重放和清理。
- `docs/history.md` 阶段 24/27 与提交 `49f61cb`、`1f46204` 已证明：Web 是任务工作流壳，不能拥有第二套 Agent/model/session 状态；配置、验证和机器结果应留在同一流程。阶段 08/19 与提交 `3138b34` 已证明：原始产物与 typed facts 分层，外部副作用必须先有持久 owner，未知 POST 边界不能盲目重放。
- `src/provider/catalog.ts` 是语言 Provider/model 能力 owner；请求经 capability/dialect/request-body 投影进入同一 OpenAI client 和 Agent turn。
- Agnes 文本 Provider 已存在，模型是 `agnes-2.0-flash`。当前 `agnes-thinking` wire 差异实际是通用 `chat_template_kwargs.enable_thinking` 形状，可由 Agnes 文本和 llama.cpp 共享。
- 当前具名 OpenAI-compatible Provider 都默认 Bearer 鉴权；缺少“无需鉴权的本地 Provider”事实。
- `RuntimeConfig`、`.kitty/.env`、env template、preflight、Web config service 共用一套配置链路；Web 只接受已知 env key，secret 空更新保留、显式 clear 才删除。
- Web 工作台的语言模型页面由 provider preset、runtime field projection 和 typed locale catalog 驱动。preset 选择值当前只用 provider ID，不能区分同一 Provider 的两个模型 preset。
- Web 已通过共享媒体服务提供人类图片生成、视频创建/查询、产物读取路由，以及提示词、状态、恢复轮询和媒体预览界面。
- Agnes 请求、下载和响应规范化以及图片/视频任务编排统一位于 `src/media/generation.ts`；Agent 与 Web 通过 artifact writer 投影各自的持久结果。
- Agent 工具由 extension registry 接入，同一 tool executor、control-plane tool ledger、session evidence 和所有宿主壳消费；不需要第二个 Agent 核心。
- tool ledger 在强杀恢复时把已启动的非只读副作用标为 `uncertain`，不会盲目重放。
- `ToolResultEnvelope` 已支持 `file` artifact，但 `ToolExecutionMetadata` 尚无通用 artifact 输入，evidence builder 目前主要从 command output 推断 artifact。
- 运行时 skill 从 `skills/**/SKILL.md` 发现，并通过现有 skills extension 按需加载。当前仓库只有 `skills/dev`。
- 上一轮完整验证通过 390 个测试，其中 389 passed、1 skipped；当前分支 `master` 与 `origin/master` 同步，工作树在新增本 plan 前干净。

### 当前缺口与未知点

- 媒体配置、catalog/adapter、两个工具、typed artifact evidence、Web 独立配置、媒体 probe 和 Agnes 运行时 skill 已实现；typecheck、skill validator 与 31 个定向测试已通过。
- 当前 key 已完成真实 Agnes 1K URL 图片生成、图片编辑和 81 帧视频 create/poll/download。两个 PNG 与 `generated/kitty/agnes-video-acceptance.mp4` 均通过 magic/非零大小校验；视频任务和二进制 change history 已持久化。
- 媒体边界测试仍缺 Base64、原子写失败清理、坏媒体、下载超限/中断、视频任务持久化、提前轮询、失败状态、完成无 URL 和等待中断。
- llama.cpp Provider/model preset、本机 CUDA binaries、Gemma/Qwen 模型下载清单和 router 启停状态脚本已完成；Gemma GGUF 已达到 manifest 精确字节数并通过 SHA-256 marker 校验。router 已真实加载并从 `/v1/models` 返回 `gemma-3-12b-it-q4_0.gguf`；中文非流式和流式通过，tool-call 探测返回 Python 代码而非 `tool_calls`，因此 Gemma capability 明确为 `tools: false`。Qwen 两个模型待下载后进行真实 tool-call 验收。
- llama.cpp router 对本地 GGUF 暴露的准确模型 ID，需要安装后从 `/v1/models` 读取并回写 catalog/preset，不能猜测。

## 3. 失败测试

实施前以下行为不存在或会失败：

1. 配置 schema 不能读取和验证独立 media provider、base URL、密钥、图片模型、视频模型、HTTP timeout 和轮询间隔。
2. `llama.cpp` 不是具名语言 Provider；Gemma 本地模型无法通过 catalog、preset、Web 保存和 provider probe。
3. 本机模型 preset 不能在 Web 中被稳定选择。
4. 图片请求不能证明 `response_format` 位于 `extra_body`，也不能验证 size/ratio、编辑输入和 URL/Base64 响应。
5. 视频创建不能证明返回并持久使用 `video_id`；查询不能证明从不使用 `task_id`。已由确定性测试和真实创建/完成验收覆盖。
6. 视频非法 `8n+1`、帧率、宽高、缺失 prompt/video_id、互斥参数不能在发送前失败。已由 Provider 参数矩阵覆盖。
7. 429、Retry-After、5xx、超时、abort、过快轮询、failed 状态、completed 无 URL、无效 JSON、下载非媒体内容和超大响应没有稳定错误/恢复合同。
8. POST 网络边界不确定时没有测试证明“不自动重放”；GET 临时失败没有测试证明“有界重试”。
9. 生成文件不能作为 typed `file` artifact 进入 session evidence，宿主只能看到通用 JSON。
10. media extension 开关、工具注册、disabled 行为和 skill discovery 没有测试。
11. Web bootstrap、保存、secret 保留/clear、媒体 probe 和四语言 locale key 没有测试。
12. 本机 `llama-server`、Gemma GGUF、SHA-256、router 加载、32K context、流式输出已真实验证；Gemma 原生 tool-call 不成立，已按实测降级为 `tools: false`。
13. Agnes 真实图片、编辑、视频创建/查询/下载已验证；真实 poll 的 `id` 回显差异已进入 adapter。
14. Web 没有直接生成图片、创建/查询视频和安全读取生成文件的 API；浏览器没有提示词输入、执行状态、恢复中的 `video_id` 或预览。
15. 如果 Web 直接调用 Agent tool wrapper，会伪造 tool ledger/change history 所有权；如果浏览器直接调用 Provider，会暴露媒体密钥。这两条路径都必须由测试拒绝，Web 只能调用共享媒体执行服务。

## 4. 目标

- 语言模型主链路新增一个明确的 `llama.cpp` Provider，认证模式为 `none`，暴露 Gemma 与两个 Qwen3 本地 preset；Gemma 不发送工具合同，Qwen3 preset 复用 Chat Completions streaming、tool call、tool result replay 和 session 恢复。
- 把 `chat_template_kwargs.enable_thinking` 提炼为共享请求方言，Agnes 文本与 llama.cpp 只声明能力，不复制请求逻辑。
- 新增独立 media 配置 owner 和 provider catalog。通用媒体执行层负责校验、HTTP、错误分类、abort、GET retry、下载与 artifact；Agnes adapter 只负责 Agnes wire 差异。
- `generate_image` 同步生成或编辑并保存本地图片；`generate_video` 以 `create` 和 `poll` 两个操作表达异步协议。create 一次提交并持久返回 `video_id`，poll 只用 `video_id`、遵守最小间隔、完成后下载本地视频。
- 媒体工具通过现有 extension registry、tool ledger、evidence builder、session 和宿主壳运行。生成文件进入通用 metadata artifact，不由 presenter 猜测。
- Web 的“图像与视频”工作流同时承担配置与人类生成：图片表单支持提示词、清晰度和比例；视频表单支持提示词、画幅、时长和负面提示词，创建后自动低频查询并展示 `video_id`、状态、进度、预览和项目内路径。语言模型页显示 Gemma 与两个 Qwen3 本地 preset。
- 新增简短 `skills/agnes-media/SKILL.md`，只保留两工具正确使用顺序和高风险合同，详细 API 事实由代码/schema 负责。
- 在 `D:\AI\llama.cpp` 安装官方 CUDA 12.4 binaries 和 Gemma 3 12B QAT Q4_0；router 最多加载一个模型，默认 32,768 context，Q8 KV cache，自动 GPU fit，绑定 `127.0.0.1:8080`。
- 所有确定性测试、真实 Agnes 验收、本机 llama.cpp 验收、完整 `npm.cmd run verify` 通过；`spec.md` 与当前事实一致；最终 commit 并 push `origin/master`。

## 5. 不做范围

- 不把 Agnes 图片/视频塞进文本 Chat Completions message schema。
- 不引入另一套 Agent loop、session、WebSocket、tool ledger、错误展示或 Web 配置存储。
- 不接入 Agnes 的旧 `task_id` 视频查询路径。
- 不自动重放结果未知的图片 POST 或视频创建 POST。
- 不让浏览器直接访问 Agnes endpoint 或读取 API Key；所有生成请求必须经过 loopback Web 的 token、Origin 和输入校验。
- 不把 Web 人类生成伪装成 Agent tool call，不创建假的 session/tool ledger 记录；生成文件和视频任务使用共享媒体事实，Agent 入口另行记录真实 tool/change/workset 事实。
- 不把 llama.cpp 内置文件/命令 tools 暴露给模型；Kitty 继续拥有唯一工具面。
- 不在本机部署扩散图片或视频模型。本次免费图片/视频能力来自用户指定的 Agnes 免费 API；8 GB 显存不适合把现代视频扩散模型作为本次可用性承诺。
- 不把模型二进制、GGUF、真实生成媒体或密钥提交到 Git。
- 不为纯配色和装饰写长期测试；Web 只自动验证结构、字段、状态、顺序和交互事实。

## 6. 设计

### 6.1 语言 Provider 主链路

`Web/.env -> normalizeRuntimeConfig -> provider catalog -> capability/dialect -> OpenAI client -> Agent turn -> tool/session`。

- `ProviderInfo` 新增认证模式。远程 Provider 声明 Bearer；llama.cpp 声明 none。client 在 none 模式使用 SDK 所需的本地占位值但不把项目密钥作为远端凭据；probe 不发送 Authorization。
- `llama.cpp` 使用 `http://127.0.0.1:8080/v1`、Chat Completions、streaming、tools、usage 和 chat-template thinking。
- Gemma 以 router `/v1/models` 的真实 ID进入 catalog；Web 以唯一 preset ID 选择。
- 本地 server 只监听 loopback，`--models-max 1` 防止模型占满内存，`--fit on` 根据实时显存调节 offload；不启用 llama.cpp 内置 agent/tools。

### 6.2 媒体配置与模块边界

`Web/.env -> media config -> media catalog -> Agnes adapter -> provider response -> local artifact -> ToolResultEnvelope -> session/host`。

- `src/media/catalog.ts`：媒体 Provider、模型、能力和固有限制唯一 owner。
- `src/media/errors.ts`：结构化用户/合同/临时/provider/abort 错误；控制流不依赖展示字符串。
- `src/media/http.ts`：Bearer、timeout、abort、响应大小、JSON、Retry-After 和仅 GET 的有界 retry。
- `src/media/providers/agnes.ts`：图片 body、视频 create、`video_id` poll 和 Agnes response normalization。
- `src/media/artifacts.ts`：限制协议、content-type、最大字节、原子文件写入和扩展名选择。
- `src/extensions/tools/media/`：两个薄工具，读取 `RuntimeConfig.media`，校验 tool args，调用媒体核心并返回 changed path/artifact。
- `ToolExecutionMetadata.artifacts` 成为通用工具产物输入；evidence builder 只做路径规范化和投影，不解析媒体 JSON 重建事实。

### 6.3 图片执行

1. 工具校验 prompt、size/ratio、输入图片数量和 output path。
2. adapter 发送一次 POST；不做隐式 retry。
3. URL 响应走有界 GET 下载；Base64 响应在大小上限内解码。
4. 文件先写同目录临时文件，再原子 rename；失败清理临时文件。
5. 成功 result 记录模型、标准化尺寸、path、bytes、content type 和 typed file artifact，不记录 secret 或完整 Base64。

### 6.4 视频执行、恢复与限流

`generate_video(operation=create)`：

1. 校验 prompt、帧数、帧率、宽高、image/keyframes。
2. 在 tool ledger 已进入 running 后发送一次 POST。
3. 解析并要求非空 `video_id`，立即把 queued 结果交给现有 tool ledger/session 持久化；不在同一调用内长轮询。

`generate_video(operation=poll)`：

1. 只接受 `video_id`，可本地等待有限秒数且响应 abort。
2. 用 `GET /agnesapi?video_id=...` 查询，不接受 `task_id` 作为输入。
3. 对 429/408/5xx/网络临时失败按 Retry-After 有界重试；本地最小轮询间隔避免超过 RPM 20。
4. queued/in_progress 返回 progress、seconds、size 和下次查询时间；failed 返回 provider 事实；completed 下载并原子保存 mp4，返回 typed artifact。

强杀发生在 POST 响应确认前时，现有 ledger 将外部副作用标为 uncertain，不自动重放。确认 `video_id` 后的 create 已是独立完成工具结果，后续进程可从 session/ledger 读取 ID 再 poll。重复 poll 是只读且幂等；重复文件下载覆盖采用原子写，不产生半文件。

### 6.5 Web 与本地化

- bootstrap 投影 language presets 和 media presets，不由浏览器复制 catalog。
- 媒体配置和人类生成共享一个首页入口和 panel；保存仍走 `/api/config` 的 known-key/secret 规则。
- `/api/media/probe` 只验证鉴权与模型服务可达，不生成收费/耗时产物。
- `POST /api/media/images`、`POST /api/media/videos` 和 `POST /api/media/videos/:videoId/poll` 复用同一共享媒体服务；图片和视频 create POST 不自动重放，poll 与下载才允许有界重试。
- 生成产物只写入项目 `generated/kitty/`，API 只返回相对路径；`GET /api/media/artifacts?path=...` 必须验证 token、项目边界、生成目录和媒体 magic，再以真实 MIME 返回。浏览器通过带 Authorization 的 fetch 读取 Blob，不把启动 token 放进媒体 URL。
- 前端以图片/视频 tab 分隔模式；提交期间禁用重复动作。视频创建成功后把 `video_id` 保存在 sessionStorage，按服务端 `nextPollAt` 调度查询，刷新后可恢复；停止按钮只停止本地查询，不声称取消 Provider 任务。
- zh-CN、en、ja、ko catalog 同步新增完全一致的 key 和 placeholder；provider/model/env key 保持原文。

### 6.6 共享媒体执行服务

- `src/media/generation.ts` 拥有图片生成、视频 create/poll、任务记录、下载、输出路径和结构化结果；它不依赖 ToolContext、Web 或 presentation。
- service 通过 artifact writer 回调提交已验证字节。Agent writer 继续记录 change history/workset/typed artifact；Web writer 只原子写入并返回文件事实。
- `src/extensions/tools/media/` 只解析 tool args、传递 abort/config/state root，并把 service 结果投影成 tool result。`src/web/mediaService.ts` 只解析 Web 输入、调用 service、把绝对路径投影为相对路径并安全读取产物。
- 视频任务记录继续由 `.kitty/extensions/media/video-tasks/<video_id>.json` 唯一持有；Agent 与 Web 查询同一记录，不维护第二套任务状态。

### 6.7 Skill

- 通过 skill-creator 初始化 `skills/agnes-media`，沿用 Kitty 当前 runtime skill 包形状。
- SKILL 只说明触发范围、图片工具、视频 create/poll 顺序、`video_id`、轮询节奏、产物路径和错误恢复；不复制整个官方文档。
- 使用 skill validator 和 Kitty 自身 discovery/health 测试验证。

### 6.8 本机部署

- `D:\AI\llama.cpp\bin`：官方 llama.cpp `b10068` CUDA 12.4 可执行文件与 runtime DLL。
- `D:\AI\llama.cpp\models`：Gemma 校验后的 GGUF；不下载视觉 projector 或其他本地模型。
- `D:\AI\llama.cpp\logs`：server stdout/stderr；不进入仓库。
- 仓库脚本只保存可移植的 start/stop/status 逻辑和默认路径，不保存机器 secret。
- router 参数：loopback、port 8080、models-dir、models-max 1、ctx 32768、K/V q8_0、jinja、GPU fit、idle sleep。安装后以实际 `/v1/models` 回写模型 ID。

## 7. 实施任务

- [x] 写失败测试：media config/catalog、llama catalog/auth/dialect/manifest、同 Provider preset ID、artifact metadata、Agnes image/video wire、错误/retry/abort/rate boundary、extension、Web、locale、skill；深层下载/原子写/中断边界已覆盖。
- [x] 重构语言 Provider 共享合同：认证模式和 chat-template thinking；接入 llama.cpp 及 Gemma preset，定向 provider/config 测试变绿。
- [x] 建立 media catalog/config/env/template/preflight owner；从本机现有 key初始化 `.kitty/.env` 的媒体 key，保证 secret 不进入 Git。
- [x] 实现通用媒体 HTTP、错误、artifact 与 Agnes adapter；核心实现和深层下载/原子写/中断测试已完成。
- [x] 接入 media extension、两个工具、typed file artifact、tool presentation与 recovery evidence；完成注册、关闭开关、session evidence 测试。
- [x] 用 skill-creator 初始化并编写 `skills/agnes-media`，运行 validator 和 Kitty skill discovery 测试。
- [x] 新增 Web 图像/视频工作流、media probe、preset ID 和四语言投影；完成 API/结构/保存/secret/交互测试。
- [x] 提炼 `src/media/generation.ts` 共享执行服务，保持 Agent 工具现有图片、视频、change history、任务持久化和中断行为测试变绿。
- [x] 新增 Web 图片生成、视频 create/poll、生成文件读取 API 与 `WebMediaService`；覆盖 token/Origin、输入校验、目录边界、POST 不重放、视频任务恢复和有效 MIME。
- [x] 在媒体工作流加入图片/视频 tab、提示词与参数控件、执行状态、自动轮询、停止本地轮询、预览和文件路径；同步四语言 typed catalog 和移动端结构测试。
- [x] 安装并校验 llama.cpp CUDA binaries 和 Gemma GGUF 到 D 盘；增加启动/停止/状态脚本，启动 router 并读取真实模型 ID。
- [x] 用 Kitty 对 Gemma 本地模型验收流式回复、中文、上下文配置、无 key 和错误模型边界；记录加载时间、速度与内存，并根据实测把不成立的原生 tool call 修正为 `tools: false`。
- [x] 用 Agnes 当前 key 做低频真实验收：图片 URL/Base64/编辑字段探测、视频 create、按持久 `video_id` poll、最终下载；真实 poll 的 `id` 回显差异已修正，不超过 RPM 20。
- [ ] 演练超时、429/Retry-After、5xx、abort、连续 poll、进程终止/恢复、无效响应、下载中断和原子文件边界；确定性边界已覆盖，真实进程终止/恢复仍待本地 router 完成后演练。
- [x] 同步 `spec.md` 和必要运行事实，更新本 plan 收口记录。
- [x] 运行全部定向测试、`npm.cmd run verify`、开发入口 smoke 和真实验收；当前 `npm.cmd run verify` 为 422 tests，421 passed、1 skipped、0 failed；Gemma 本机推理和开发入口真实验收仍待完成。
- [ ] 审查 Git diff、secret/大文件泄漏和工作树状态；用户已明确授权在真实验收前 commit/push，模型与生成媒体不进入仓库。

## 8. 验证计划

### 确定性测试

- provider/config：catalog、auth、dialect、request body、probe、schema、template、preflight。
- media：request/response normalization、参数矩阵、POST no-retry、GET retry、Retry-After、abort、timeout、response-size、Base64、atomic download、poll interval。
- tools/session：extension registration、disabled、tool argument contract、artifact evidence、interrupted/uncertain recovery。
- Web/i18n：bootstrap、save、secret preserve/clear、media probe、preset identity、四 catalog key/placeholder 一致、页面字段存在且不溢出。
- Web generation：图片 POST、视频 create/poll、artifact GET、token/Origin、目录边界、重复提交状态、sessionStorage 恢复和 Blob 预览。
- skill：frontmatter validator、Kitty discovery、health 和工具名/工作流当前事实。

### 本机 llama.cpp 验收

- 对 release zip 和 GGUF 运行 SHA-256 校验。
- `llama-server --version` 与 `llama-cli --version` 成功。
- `/health`、`/v1/models`、Gemma `/v1/chat/completions` 非流式与流式成功。
- Gemma 通过 Kitty provider probe 和流式回复，并完成一次强制 tool-call schema 探测与端到端工具结果 replay。
- router 在模型切换时最多一个 loaded model；记录加载时间、生成速度、RAM/VRAM 峰值和实际上下文边界。
- 停止/重启 server 后配置仍可用；server 不在 `0.0.0.0` 监听。

### Agnes 真实验收

- 图片：1K 文生图保存并验证 magic bytes/content type/dimensions；Base64 或编辑路径仅在不造成无意义重复生成时做一次最小探测。
- 视频：约 3 秒、低规格任务；创建响应持久得到 `video_id`，所有查询 URL 都只含 `video_id`，完成后验证 mp4 magic bytes、非零大小和响应 seconds/size。
- 请求日志只记录 method、host、path、status、duration、request ID；Authorization 和 Base64 内容不可见。
- 控制请求频率低于 RPM 20；真实 provider 暂时不可用时保留完整非敏感错误证据并在预算内重试到可判定结果。

### 完整收口命令

```powershell
npm.cmd run verify
npm.cmd run dev -- --help
npm.cmd run dev -- --version
```

真实 provider eval 不混入普通 deterministic suite。视觉颜色、间距、品牌感由人类验收；Agent 只验证结构、顺序、尺寸、不溢出和交互事实。

## 9. 收口

尚未完成。执行过程中逐项更新 checklist；新证据推翻设计时先更新本文件再改代码。

最终收口必须记录：目标完成情况、失败测试转绿情况、修改文件、安装位置与版本、模型文件与校验、真实 Agnes 产物、全部验证命令、未验证内容、剩余风险、commit 和 push 事实。
