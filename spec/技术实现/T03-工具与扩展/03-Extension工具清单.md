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

## spec

- `spec_list`：列出 `.kitty/specs/changes` 下的 durable spec。
- `spec_search`：按 title、summary 和四个文档内容搜索 spec。
- `spec_create`：创建 spec、初始化带骨架的四个文档、绑定当前 session、创建隔离 git worktree，并把 Task Lifecycle 切到 `spec_work`；返回 workflow summary。
- `spec_open`：按 `specId` 打开 spec，绑定当前 session，返回四个文档和 workflow summary，并记录 active spec。
- `spec_update_state`：更新 title、summary、stage、status 和确认标记，并同步 Task Lifecycle 的 active spec/stage 事实。
- `spec_append_note`：追加事实笔记到 `notes.md`。
- `spec_write_document`：写入 `requirements`、`design`、`tasks` 或 `notes` 文档。
- `spec_read_document`：读取单个文档，或读取全部文档。
- `spec_checkpoint_create`：保存 spec state、四个文档和隔离 worktree checkpoint。
- `spec_checkpoint_list`：列出一个 spec 的 checkpoint。
- `spec_checkpoint_restore`：恢复 spec state、四个文档和隔离 worktree。
- `spec_task_update`：更新 spec task 状态、标题、证据，可选择同时创建 checkpoint。

实现落点：

- `src/spec/`
- `src/extensions/tools/spec/`
- `src/spec/runtime.ts`
- `src/host/toolRegistry.ts`
- `tests/spec/`
- `tests/extensions/spec-tools.test.ts`

`kitty spec` 入口通过 `src/spec/runtime.ts` 决定阶段工具面。没有 active spec 或尚未确认 requirements、design、tasks 时，只暴露 `read`、`bash` 和 spec 工具；确认后进入 implement、validate、archive 才暴露完整 core 工具。
