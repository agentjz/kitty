# Kitty Model Evidence Kernel Plan

## 1. 需求文档

Kitty 要达到的不是“工具能执行”，而是模型在每次工具调用后，都拿到完成下一步所需的最小充分证据。

用户体验必须满足：

- 小结果直接完整可用，不需要模型重复读取。
- 大结果有界，但退出状态、目标位置、关键头尾、错误根因、变更范围和恢复方法不丢。
- 路径只在能证明来源或支持恢复时出现；工作区内优先相对路径，工作区外保留绝对路径。
- 模型视图、用户视图、持久事实和原始 artifact 分开，各有唯一 owner。
- 近期工具结果优先保真，较旧结果按预算变成 compact view，不做多轮盲截断。
- 工具结果协议、上下文压缩、session 恢复、provider replay、observability 和评测讲同一事实。

本轮同时审查全部核心模块。已有成熟 contract 的 provider、host、control-plane、execution 和 runtime projection 保留；只有与新结果合同接线或验收有关时才修改。

业务完成标准：

- 模型能从工具结果直接判断成功、失败、影响范围和下一步。
- 任意被截断结果都有可执行的恢复路径。
- 长会话不会因为同一结果被反复截断而持续丢信息。
- 评测证明证据保真和任务闭环，不只证明 token 变少。

## 2. 当前事实

### 2.1 当前代码

- `ToolExecutionResult` 只有 `ok/output/metadata`，模型结果合同仍以字符串为主。
- `src/agent/toolResults/modelProjection.ts` 按工具名解析 JSON，再生成 model-facing 文本。
- bash 大输出有 raw artifact、governance projection 和成本指标。
- tool message 当前只持久化 model projection，canonical result envelope 不进入 session。
- context compression 会再次按固定字符数截断旧 tool message。
- session memory 会把已经投影过的 tool message 再压成单行 1200 字符证据。
- output classifier 依赖命令和文本正则；structured projector 多数只取前若干匹配行。
- local eval 验证 kind、长度、saved tokens 和 artifact path，不验证下一步任务是否仍可完成。
- provider replay、host turn、control-plane execution、runtime status 和多宿主边界已有明确 owner 和行为测试。

### 2.2 成熟实现对照

- Codex：结果明确暴露 chunk/session、wall time、exit code、original token count，并按 token 保留头尾；history 维护 call/output 配对不变量。
- Gemini CLI：`llmContent` 与 `returnDisplay` 分离；近期工具结果优先完整；旧大结果落盘后再截断；可选 tool-output distillation。
- OpenCode：工具返回 `title/metadata/output/attachments`；截断有 line/byte 双限制、head/tail 方向和可执行恢复指令。
- Cline：终端增量结果保留头尾，并明确省略行数。

共同底线不是统一文案，而是：结构状态明确、来源明确、截断透明、恢复可执行、近期保真、错误可行动、UI 与模型视图分离、行为可评测。

### 2.3 已知缺口

- 没有 typed model-evidence envelope。
- 没有 provenance、artifact、truncation、error、compact view 的统一 contract。
- generic bash 只保留前部，末尾退出摘要和根因可能丢失。
- diagnostic/search 投影靠固定前 N 行，不能证明最小充分。
- artifact path 只是字符串提示，没有统一恢复参数和保留事实。
- tool result 在 session 中只剩一次性文本投影，无法按新鲜度重新投影。
- 没有证据保真 corpus、对抗输出或 task-success-per-token 验收。
- tool registry 没有 effect/read-only/parallel-safe 等执行语义；当前 batch 全部串行。

## 3. 失败测试

实施前下列行为缺少保护，视为失败：

1. 失败根因只出现在超长输出末尾时，model view 必须保留根因。
2. 成功命令无输出时，model view 必须包含成功状态、exit code 和耗时。
3. 被截断结果必须包含 artifact path、原始规模、省略规模和可执行恢复动作。
4. read/edit/write 结果必须包含规范化目标路径；read 必须包含实际行区间和 continuation。
5. tool call 与 tool result 在 session/provider replay 中必须一一配对。
6. 最近 tool result 使用 full model view；旧结果使用 compact view；不能对 compact view 再做无语义盲截断。
7. UI callback 继续看到用户展示结果，provider 只看到 model view。
8. adversarial test/build/search/git/generic fixtures 中，规定的必要证据必须全部保留。
9. production tool eval 必须验证模型消费了工具返回的 sentinel 事实，而不只验证存在 tool message。
10. 只有声明为 read-only 且 parallel-safe 的同批工具才能并行；写入、进程和外部副作用保持顺序。

## 4. 目标

- 建立 `ToolResultEnvelope`，统一 status、summary、provenance、facts、error、artifacts、truncation、modelView、compactView。
- agent turn 在工具执行后构建 envelope，session 持久化 envelope，provider request 只投影适龄 model view。
- output governance 改成 head/tail + typed facts + artifact recovery；工具专用 projector 只做确定性证据选择。
- context compression 识别 envelope，近期保真、旧结果 compact，不重复破坏性截断。
- tool registry 增加 effect 与 parallel-safe contract，并只对安全连续批次并发。
- observability 记录 evidence version、artifact、projection 和保真指标。
- local/production evaluation 增加证据保真与真实消费闭环。
- `spec.md`、测试和当前代码同步。

## 5. 不做范围

- 不重写已通过 contract 验收的 provider transport、host lifecycle、control-plane schema 和 TUI layout。
- 不引入旧兼容层、双协议或迁移包装。
- 不用模型总结替代确定性工具事实。
- 不追求所有工具输出同一种文案。
- 不以文件拆分数量、测试数量或 token 节省率单独宣称成熟。

## 6. 设计

### 6.1 主链路

```text
tool call
  -> registry argument/effect contract
  -> execution raw result
  -> ToolResultEnvelope
       status / provenance / facts / error
       modelView / compactView
       artifact / truncation / recovery
  -> session canonical envelope
  -> current provider request uses modelView
  -> aged or compressed request uses compactView
  -> UI uses display/raw result
  -> observability records envelope metrics
```

### 6.2 结果边界

- 工具实现拥有原始事实和 metadata。
- evidence builder 拥有统一 envelope。
- projector 拥有 modelView/compactView，不拥有业务结论。
- session 拥有 canonical envelope，不保存 raw 大输出。
- artifact store 拥有 raw 大输出。
- context 只选择 full/compact view，不重新解释工具结果。
- presenter 只消费 display result，不复用 model projection。

### 6.3 最小充分证据

所有结果至少包含：tool、status、summary。

按类型增加：

- file read：path、line range、content、continuation。
- edit/write：path、applied count/bytes、changed paths、diff/diagnostics。
- shell：cwd、exit code、duration、head/tail output、truncation、artifact recovery。
- search：query 来源、match count、代表性证据、omitted count、继续缩小或读取 artifact 的方法。
- execution：id、kind、status、summary、output tail、下一次可执行 action。
- failure：stable code、message、相关 path/args、recovery action。

### 6.4 路径规则

- 证明“读了/改了谁”的目标路径必须给。
- 工作区内使用相对路径；工作区外使用绝对路径。
- 行号和 continuation 与路径放在一起。
- raw artifact path 只在存在 artifact 时给，并附恢复参数。
- 不重复工具调用参数中与下一步无关的噪音路径。

### 6.5 新鲜度与压缩

- 当前工具批次和最近若干消息使用 `modelView`。
- 进入普通/aggressive/hard compression 的旧 tool message直接换成 `compactView`。
- compact view 自身满足严格上限，context 不再对它二次字符串截断。
- provider wire 所需 call/output 边界始终保留。

### 6.6 并发

- registry entry 声明 `effect: read | write | process | external | state` 和 `parallelSafe`。
- 仅连续、parallelSafe、read effect 的调用并发。
- 其余保持模型给出的顺序。
- abort 和单项失败分别记录，不取消已经完成的兄弟 read。

### 6.7 评测

- deterministic evidence corpus：test/build/typecheck/search/diff/generic/read/edit/error。
- adversarial fixtures：根因在尾部、单行超长、混合编码、无输出、输出与退出码矛盾、路径含空格。
- invariants：非空、call/output 配对、artifact 可读、compact 不丢 status/target/error。
- product metric：task success、evidence recall、recovery success、projected tokens，联合判断。
- production tool eval 使用唯一 sentinel，最终回答必须消费 sentinel。

## 7. 实施任务

- [x] 新增 typed evidence contract 和 builder。
- [x] 改造 model projection 为 envelope 输出，保留 tool-specific deterministic projectors。
- [x] 改善 bash/search/diagnostic/diff/generic 的头尾和恢复策略。
- [x] session message 持久化 envelope，snapshot/schema 同步。
- [x] context full/compact 选择，删除旧 tool message 二次盲截断。
- [x] registry 增加 effect/parallelSafe，batch executor 实现安全并行。
- [x] observability 增加 evidence contract 指标。
- [x] 补齐 unit、integration、compression、replay、parallel、adversarial tests。
- [x] 升级 local/production evaluation。
- [x] 同步 `spec.md`。
- [x] 运行定向测试、`npm.cmd run eval:local`、`npm.cmd run verify`。
- [x] 修正生产会话抽查发现的派生状态污染：已恢复失败不得残留为 blocker，cwd 不得进入 activeFiles，changedPaths 必须使用模型路径规则。
- [x] 重跑完整验证与真实 production repair，确认持久化 task state 与工具证据一致。

## 8. 验证计划

```powershell
npm.cmd run test:build
node --test .test-build/tests/agent/tool-result-projection.test.js .test-build/tests/tools/output-governance.test.js .test-build/tests/tools/bash-output-governance.test.js .test-build/tests/context/compression.test.js
npm.cmd run eval:local
npm.cmd run verify
git diff --check
```

真实 provider 验收仅使用当前显式配置，并在本轮代码完成后运行 `npm.cmd run eval:production`；它必须验证 sentinel 被最终回答消费。

## 9. 收口

完成状态：已完成。

实际完成：

- 建立唯一 `ToolResultEnvelope`，贯通 tool execution、agent turn、session、context、memory、checkpoint、task state 和 observability。
- model view 与 compact view 分离；近期保真，旧结果直接切 compact，不再重复盲截断。
- generic/search/diagnostic/diff 输出使用头尾证据；被截断结果暴露 artifact、规模和可执行 read recovery。
- bash 非零退出、超时、停滞和中断统一为失败结果。
- tool registry 增加 effect 与 parallel-safe contract；连续安全读取并行，副作用工具保持顺序。
- 删除内部状态和配置中没有迁移能力的代际编号字段。
- task state 与 checkpoint 改读 typed evidence，不再从展示字符串反推状态。
- production repair 从 runner 拆出独立职责，并改为真实失败、修改、复验闭环。

验证：

- 定向 evidence/context/session/parallel tests：通过。
- `npm.cmd run verify`：通过，297 tests，296 passed，1 platform skip，0 failed。
- `npm.cmd run eval:local`：通过，tail root cause preserved。
- `npm.cmd run eval:production`：第一次揭示验收答案泄漏；修正场景后第二次通过。
- 真实 production repair：failed evidence preserved，`BROKEN -> READY`，复验通过，最终回答消费 `PRODUCTION_REPAIR_SENTINEL`。
- 真实 session 状态抽查：`activeFiles=[verify.cjs,status.txt]`，`blockers=[]`，`changedPaths=[status.txt]`；已恢复失败和绝对 cwd/path 不再污染当前状态。

未验证与剩余风险：

- 真实 production repair 使用当前 DeepSeek provider；其他 provider 的 wire contract 由确定性 provider matrix 覆盖，本轮未逐个产生真实 API 消费。
- Windows 当前环境不执行 POSIX 进程树测试，该项按既有设计 skip。

未经用户明确要求未 commit、未 push、未 publish。
