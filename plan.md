# Agnes 多模态 Plan

## 1. 目标

Kitty 通过 Agnes AI 提供图片与视频能力。Agent 与 Web 人类工作台复用同一媒体服务、配置、产物边界和错误事实；语言模型配置不承载媒体表单。Kitty 不维护本地模型部署、本地模型 preset、下载脚本或本地推理运行时。

## 2. 当前事实

- 图片模型是 `agnes-image-2.1-flash`，接口是 `POST /v1/images/generations`；URL 输出格式位于 `extra_body.response_format`。
- 视频模型是 `agnes-video-v2.0`；创建响应以 `video_id` 为持久 owner，查询使用 `GET /agnesapi?video_id=...`。
- 生成产物写入项目 `generated/kitty/`，该目录不进入 Git。
- 图片只对 Agnes 明确返回的 408、429、502、503、504、520、522、524 做有界重试。网络失败、超时和 abort 不重放；连续 503 后回退到 `agnes-image-2.0-flash`。
- 图片与视频配置独立于语言 Provider。Web 配置和 Agent 工具读取同一 `RuntimeConfig.media`。
- Provider 错误进入 tool journal 和 typed presentation；Web 实时事件与 session replay 展示精简状态与 request ID。
- `.kitty/.env` 与 `.kitty/.env.example` 在源码维护中从当前模板完整重建；`kitty start` 仍兼容用户已有配置并只补缺失键。

## 3. 边界

- 图片 POST 只在收到明确临时 HTTP 响应后重试；不对未知网络结果自动重放。
- 视频创建 POST 不自动重放；poll 与下载可以有界重试。
- Abort 必须中断请求或退避，并阻止后续 retry、fallback、poll 与文件写入。
- 文件先写临时文件再原子替换；失败不留下伪完成产物。
- API key、完整 Base64、原始上游错误体和生成媒体不进入 Git、测试快照或文档。

## 4. 验收

- [x] Agnes 图片/视频 Provider、Agent 工具和 Web 人类工作台复用共享媒体核心。
- [x] 图片临时响应有界重试、503 fallback、abort 和错误投影有产品行为测试。
- [x] 真实 Agnes 模型列表与 1K 图片生成通过；生成文件 magic、MIME 和视觉内容已检查。
- [x] `generated/` 已加入 `.gitignore`。
- [x] Gemma、llama.cpp Provider/preset、部署脚本和 D 盘本地部署已移除。
- [x] 语言 preset 收敛到 Agnes 与 DeepSeek；其他厂商特判删除，通用 `openai-compatible` 协议入口保留。
- [x] `npm.cmd run verify` 通过：403 tests，402 passed、1 skipped、0 failed。
