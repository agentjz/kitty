export interface EvaluationScenario {
  id: string;
  userExperience: string;
  machineFacts: string[];
  acceptance: string[];
}

const EVALUATION_SCENARIOS: readonly EvaluationScenario[] = [
  {
    id: "simple-question-stays-small",
    userExperience: "A short user question receives a short answer without starting unnecessary long-running work.",
    machineFacts: [
      "context contains the current user input",
      "execution ledger has no new background or subagent execution",
      "tool calls are absent unless factual inspection is needed",
    ],
    acceptance: [
      "answer is direct",
      "no delegated execution is created",
      "no project-wide scan is triggered by default",
    ],
  },
  {
    id: "long-session-keeps-confirmed-facts",
    userExperience: "A long session keeps nearby conversation natural and carries older confirmed constraints through memory.",
    machineFacts: [
      "provider request keeps visible near-field conversation",
      "runtime memory asset exists",
      "context injects session memory for older continuity",
      "memory asset can be read by the user",
    ],
    acceptance: [
      "recent conversation can be recalled naturally",
      "confirmed constraint appears in session memory",
      "old focus is not treated as current focus",
    ],
  },
  {
    id: "old-goal-stays-history",
    userExperience: "Previous goals stay as evidence and do not hijack the current turn.",
    machineFacts: [
      "visible near-field conversation is distinct from runtime facts",
      "internal wake is excluded from visible conversation",
      "working memory carries the active focus",
    ],
    acceptance: [
      "model answers the current request",
      "prior goals are not narrated unless asked",
      "internal facts are not presented as user intent",
    ],
  },
  {
    id: "project-map-orients-without-judging",
    userExperience: "The agent can quickly orient itself in a project without blindly reading everything.",
    machineFacts: [
      "project map lists directories, entries, scripts, tests, specs, and git facts",
      "project map is injected as a concise fact block",
      "project map does not classify semantic importance",
    ],
    acceptance: [
      "project map is visible in status",
      "context includes concise project map facts",
      "large directory trees are not dumped into prompt",
    ],
  },
  {
    id: "memory-can-be-reviewed-and-traced",
    userExperience: "The user can inspect, search, delete, and reuse saved memory.",
    machineFacts: [
      "memory assets are stored under .kitty/memory",
      "memory CLI can list/read/search/delete",
      "memory can be appended to skill references",
    ],
    acceptance: [
      "memory content is user-readable",
      "deleted memory is no longer listed",
      "skill reference records the source memory asset",
    ],
  },
  {
    id: "background-can-recover-or-terminate",
    userExperience: "A background task that finishes, stalls, or fails remains visible and controllable.",
    machineFacts: [
      "execution ledger stores background status",
      "runtime status shows health and output",
      "terminate tool can close a running background execution",
    ],
    acceptance: [
      "running background appears in status",
      "stalled background has a visible health fact",
      "terminated background records close reason",
    ],
  },
  {
    id: "subagent-wakes-lead-with-result",
    userExperience: "A subagent works in isolated context and returns a result that wakes the lead.",
    machineFacts: [
      "subagent execution has blocking wait policy",
      "worker output is written to execution summary/output",
      "wake facts are internal runtime facts",
    ],
    acceptance: [
      "lead yields while subagent is active",
      "lead resumes after completion or deadline",
      "wake facts do not become user input",
    ],
  },
  {
    id: "spec-workflow-completes",
    userExperience: "Spec mode can move from requirements through validation with notes and checkpoints.",
    machineFacts: [
      "spec state tracks stage and status",
      "spec documents exist",
      "checkpoint create/list/restore works",
    ],
    acceptance: [
      "requirements, design, tasks, implement, validate are represented",
      "notes preserve interview facts",
      "ordinary agent mode does not auto-enter spec mode",
    ],
  },
];

export function listEvaluationScenarios(): EvaluationScenario[] {
  return EVALUATION_SCENARIOS.map((scenario) => ({
    ...scenario,
    machineFacts: [...scenario.machineFacts],
    acceptance: [...scenario.acceptance],
  }));
}
