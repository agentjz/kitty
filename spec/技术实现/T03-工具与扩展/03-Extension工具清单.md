# Extension 工具清单

## todo

- `todo_write`：写入当前会话 todo 列表，结果进入 session 和 working memory，并显示 checklist preview。

## worktree

- `worktree_create`：创建 git worktree，并记录 lifecycle state。
- `worktree_events`：读取最近 worktree lifecycle 事件。
- `worktree_get`：读取一个 worktree 事实。
- `worktree_keep`：标记或取消保留 worktree 路径。
- `worktree_list`：列出当前仓库 worktree。
- `worktree_remove`：删除 git worktree，并记录 lifecycle state。

## network

- `download_url`：只下载 HTTP(S) URL 到本地文件，并上报 changed path。
- `http_probe`：探测一个 HTTP endpoint 的状态、耗时和响应头。
- `http_request`：执行单个 HTTP 请求，支持 session 默认值和断言。
- `http_session`：集中管理 HTTP base URL、headers、query、cookies 和 token。
- `http_suite`：按顺序执行 HTTP 请求步骤和断言。
- `network_trace`：写入结构化网络证据 JSON，request 必须包含 method 和 url。
- `openapi_inspect`：读取 OpenAPI JSON 并列出 operations。
- `openapi_lint`：检查 OpenAPI JSON 的核心结构事实。

## background

- `background_run`：启动后台命令，写入 control-plane execution 账本，持续记录运行输出预览、摘要、last output 和 deadline，返回 execution id、pid、deadline 和状态。
- `background_check`：读取后台 execution 摘要，并 reconcile 已丢失的 running pid；输出 total、active、recent、health、deadline、last output 和 output preview。
- `background_wait`：等待指定后台 execution 完成或超时，返回最新 lifecycle、health 和 output preview。
- `background_stop`：停止指定后台 execution，并返回最终 lifecycle 事实。
- `background_terminate`：终止一个后台 execution，等待当前宿主进程内的后台 handle 释放，并把生命周期关闭为 aborted。

## subagent

- `subagent_launch`：启动聚焦 subagent execution，写入 objective、boundary、expected output、timeout/deadline 等派工事实，返回 execution id、actor、deadline 和状态。execution 默认带阻塞型 `waitPolicy`；lead 调用后会让出当前轮，由 host 等 execution 结束后唤醒 lead。worker 最终可见回答写入 execution summary/output/changed paths。
- `subagent_check`：列出 subagent execution 摘要；输出 total、active、recent、health、派工边界、deadline 和 worker summary/output preview。

## skills

- `skill_list`：列出项目运行时 skill 的名称、说明和路径，不读取完整正文。
- `skill_load`：按精确名称读取一个 skill 的完整正文。模型决定是否加载；机器不做关键词匹配、语义路由或自动加载。使用事实记录到 observability 和 task lifecycle。
- `skill_read_resource`：按 skill 名称和资源路径读取该 skill 包声明的资源文件。资源只能来自该 skill 的资源索引。
- `skill_run_script`：按 skill 名称和资源路径运行该 skill 包声明的 `scripts/` 资源。它不是第二个 bash；只能执行 skill 资源索引里属于 `scripts/` 的文件，并记录命令输出事实、observability 事件和 task lifecycle 事实。
- `skill_check`：检查 skill frontmatter 里 `requires` 声明的命令依赖是否可用。它只检查声明事实，不替模型判断是否应该使用该 skill。
