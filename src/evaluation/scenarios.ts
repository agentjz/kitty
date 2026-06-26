import type { EvaluationCheckId, EvaluationScenario } from "./types.js";

export const LOCAL_EVALUATION_CHECK_IDS: readonly EvaluationCheckId[] = [
  "runtime-status-builds",
  "project-map-builds",
  "memory-assets-readable",
  "extension-surface-current",
  "skill-packages-readable",
  "config-preflight-readable",
  "cache-economy-ready",
  "tool-output-governance-ready",
  "production-scene-ready",
  "host-turn-boundary-runs",
  "remote-entrypoints-available",
  "recovery-drills-pass",
];

export const EVALUATION_SCENARIOS: readonly EvaluationScenario[] = [
  {
    id: "runtime-status-builds",
    suite: "local",
    title: "当前现场可审阅",
    userPath: "用户运行 `kitty status` 时，可以看到 session、context、memory、skills、execution 和 cache 的当前事实。",
    evidence: "构建 runtime status，并确认 sessions / executions 等现场摘要可用。",
  },
  {
    id: "project-map-builds",
    suite: "local",
    title: "进入仓库能快速定向",
    userPath: "用户把 Kitty 打开在一个仓库里，模型能看到目录、入口、脚本、测试、项目文档和 git 事实。",
    evidence: "构建 project map，并确认目录、脚本和仓库事实可读。",
  },
  {
    id: "memory-assets-readable",
    suite: "local",
    title: "记忆资产可审阅",
    userPath: "用户可以查看 session/project/user/evidence memory，不靠隐藏上下文猜历史。",
    evidence: "枚举 runtime memory assets，并确认资产索引可读。",
  },
  {
    id: "extension-surface-current",
    suite: "local",
    title: "工具面只暴露当前能力",
    userPath: "默认 agent 打开当前真实 extensions，不复活已删除能力。",
    evidence: "读取 extension registry，并确认默认启用面来自当前定义。",
  },
  {
    id: "skill-packages-readable",
    suite: "local",
    title: "方法包按需可用",
    userPath: "模型能先看到 skill 索引，必要时再加载正文、资源或脚本。",
    evidence: "加载 project context，并确认 runtime skills 可发现。",
  },
  {
    id: "config-preflight-readable",
    suite: "local",
    title: "首次配置路径清楚",
    userPath: "用户运行 `kitty init` / `kitty doctor` 后，能知道 `.kitty/.env` 是否完整、下一步补什么。",
    evidence: "执行 config preflight，并确认本地模板和 env contract 可检查。",
  },
  {
    id: "cache-economy-ready",
    suite: "local",
    title: "成本事实可审阅",
    userPath: "用户能看到 provider usage、cache hit/miss、稳定前缀和按需 skill 边界，而不是只看到 token 总数。",
    evidence: "验证 usage 归一化、provider cache policy、stable/volatile prompt fingerprint、skill index boundary 和大输出压缩。",
  },
  {
    id: "tool-output-governance-ready",
    suite: "local",
    title: "工具输出治理可验收",
    userPath: "工具产生大量输出时，模型只看到有界证据，完整输出仍可恢复，节省 token 的事实能进入现场。",
    evidence: "构造测试失败、搜索输出和超大通用输出，确认投影有界、raw output 可恢复、saved tokens 可记录。",
  },
  {
    id: "production-scene-ready",
    suite: "local",
    title: "生产现场一眼可读",
    userPath: "用户运行 `kitty status` 或 `kitty background` 时，能看到当前现场、后台风险、下一步、恢复状态、成本、skill 和 memory 可审阅性。",
    evidence: "构建带 session、memory、cache、skill、background 和 provider usage 的 runtime scene，并确认 scene 与 CLI 文本都暴露关键事实。",
  },
  {
    id: "host-turn-boundary-runs",
    suite: "local",
    title: "一次 agent turn 有明确边界",
    userPath: "用户发起一次任务后，host 能记录 turn 开始、完成、失败或中断，不把内部事实写成用户意图。",
    evidence: "用假 turn 跑 host boundary，并确认 session events 闭环。",
  },
  {
    id: "remote-entrypoints-available",
    suite: "local",
    title: "远程入口复用同一主干",
    userPath: "Web / Telegram 入口能接入同一 turn 输入，不分裂成另一套 agent。",
    evidence: "验证 web input port、HTML shell 和 Telegram file turn input 可用。",
  },
  {
    id: "recovery-drills-pass",
    suite: "local",
    title: "后台和子执行可恢复",
    userPath: "background 或 subagent 卡住、消失、超时后，Kitty 能 reconcile、暂停等待或终止现场。",
    evidence: "演练 stale background、expired lead-wait subagent、running process termination 和 runtime status。",
  },
];

export function listEvaluationChecks(): EvaluationCheckId[] {
  return [...LOCAL_EVALUATION_CHECK_IDS];
}

export function listEvaluationScenarios(): EvaluationScenario[] {
  return listEvaluationChecks().map((id) => {
    const scenario = EVALUATION_SCENARIOS.find((item) => item.id === id);
    if (!scenario) {
      throw new Error(`Missing evaluation scenario: ${id}`);
    }
    return scenario;
  });
}
