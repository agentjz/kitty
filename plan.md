# Memory 主干重构计划

## 目标

把 Kitty 的记忆系统做成可继续演进的本地 agent memory 主干：

- 当前 session 不失忆。
- 长任务有任务现场。
- 历史证据可追溯。
- 长期资产可审阅。
- 召回只暴露候选事实，最终取舍交给模型。

## 判断

成熟记忆不是把历史整段塞回上下文，也不是把所有内容扔进一个向量库。

Kitty 当前已有正确骨架：

- session memory 由模型在 turn 收口时写出。
- working memory 承接当前工作焦点、todo、checkpoint 和近期工具批次。
- `.kitty/memory/**` 暴露可审阅文件资产。
- `kitty memory` 能 list/read/search/delete，并把资产沉淀到 spec notes 或 skill references。

本轮修复点：

- project/user/evidence memory 没有统一元数据契约。
- memory asset 的证据引用只靠散落的 `Evidence:` 行。
- 搜索已从整句包含改为多词候选召回，并返回命中分数。
- 没有标准写入入口，长期资产容易变成随手写文件。
- 测试还没覆盖“证据引用、分词召回、长期资产写入、删除边界”这些真实行为。

## 设计

### 证据

证据是底座。

每条 memory asset 都可以带：

- `Kind`
- `Title`
- `Updated`
- `Evidence`
- `Scope`
- `Tags`

机器只解析这些死事实，不替模型判断含义。

### 会话记忆

session memory 保持当前设计：

- 模型写内容。
- 机器维护固定区块和长度边界。
- session record 是运行时入口。
- `.kitty/memory/sessions/*.md` 是同一次保存生成的可审阅资产。

### 长期资产

project/user/evidence memory 统一通过 runtime memory 写入入口创建。

资产文件使用稳定 Markdown：

```md
# <title>

Kind: project
Updated: <iso time>
Evidence: session:<id>
Scope: <scope>
Tags: tag-a, tag-b

<content>
```

没有证据引用也可以写，但 CLI/status/search 必须显式暴露 `evidenceRefs: []`，不伪造来源。

### 召回

`kitty memory --query` 是机器召回候选，不是语义判断。

召回规则：

- 标准化文本。
- 查询切成 token。
- 每个 token 都必须命中同一个 asset。
- 返回命中的证据行和命中分数。
- 不把搜索结果自动注入模型上下文。

### 沉淀

已有沉淀路径保留：

- memory asset -> spec notes
- memory asset -> skill references

新增写入入口后，后续可以让模型把 session memory 中的稳定经验沉淀为 project/user/evidence asset。

本轮不做：

- 图数据库。
- 向量数据库。
- 大规模长期画像自动生成。
- 腾讯整套 memory pipeline 迁移。

这些可以作为未来方向，但不进入当前实现主干。

## 执行清单

- [x] 增加 memory asset 元数据解析。
- [x] 增加统一的 runtime memory asset 写入入口。
- [x] session memory asset 使用统一元数据头。
- [x] search 改成 token 候选召回，并返回 score。
- [x] CLI 支持创建 project/user/evidence memory asset。
- [x] status/list 展示统一证据引用。
- [x] 测试覆盖 session asset 元数据、长期资产写入、搜索召回、删除边界、sink 路径。
- [x] 同步 README、philosophy、spec。
- [x] 运行完整验证。

## 完成标准

- `kitty memory --create project ...` 能生成可审阅 asset。
- 每条 asset 的 kind、scope、tags、evidenceRefs 由同一套解析逻辑得到。
- 搜索能按多个词召回同一 asset 的候选事实。
- session memory、project memory、user memory、evidence memory 在代码、测试、文档中讲同一个事实。
- `npm.cmd run verify` 通过。
