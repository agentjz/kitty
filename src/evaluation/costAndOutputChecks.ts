import type { LoadedSkill } from "../types.js";
import { passed, type EvaluationCheckId, type EvaluationCheckResult } from "./types.js";

export async function runToolOutputGovernanceCheck(id: EvaluationCheckId): Promise<EvaluationCheckResult> {
  const { governToolOutput } = await import("../tools/outputGovernance/index.js");
  const testOutput = governToolOutput({
    toolName: "bash",
    command: "npm test",
    status: "failed",
    exitCode: 1,
    output: [
      "FAIL tests/provider/deepseek-replay.test.ts",
      "Expected reasoning_content to be present.",
      "Tests: 1 failed, 24 passed, 25 total",
      "x".repeat(10_000),
    ].join("\n"),
    outputPath: ".kitty/observability/command-output/eval/test.txt",
    truncated: true,
  });
  const searchOutput = governToolOutput({
    toolName: "bash",
    command: "rg provider src",
    status: "completed",
    exitCode: 0,
    output: Array.from({ length: 80 }, (_, index) => `src/provider/file${index}.ts:${index + 1}:provider`).join("\n"),
  });
  const hugeOutput = governToolOutput({
    toolName: "bash",
    command: "node huge-output.js",
    status: "completed",
    exitCode: 0,
    output: Array.from({ length: 40_000 }, (_, index) => `line ${index}: ${"x".repeat(80)}`).join("\n"),
    outputPath: ".kitty/observability/command-output/eval/huge.txt",
    truncated: true,
  });
  const tailFailure = governToolOutput({
    toolName: "bash",
    command: "node verify.js",
    status: "failed",
    exitCode: 1,
    output: [
      ...Array.from({ length: 500 }, (_, index) => `progress ${index}`),
      "EVIDENCE_ROOT_CAUSE: expected READY but received BROKEN",
    ].join("\n"),
    outputPath: ".kitty/observability/command-output/eval/tail-failure.txt",
    truncated: true,
  });

  const ready =
    testOutput.kind === "test" &&
    testOutput.projection.includes("FAIL tests/provider/deepseek-replay.test.ts") &&
    testOutput.projection.includes("[full output:") &&
    searchOutput.kind === "search" &&
    searchOutput.projection.includes("matches shown:") &&
    hugeOutput.kind === "generic" &&
    hugeOutput.projectedChars < 4_000 &&
    hugeOutput.savedTokens > 100_000 &&
    hugeOutput.outputPath === ".kitty/observability/command-output/eval/huge.txt" &&
    tailFailure.projection.includes("EVIDENCE_ROOT_CAUSE") &&
    tailFailure.projection.includes("inspect with read") &&
    tailFailure.projection.includes("exit=1");

  if (!ready) {
    return {
      id,
      status: "failed",
      fact: `tool output governance incomplete: test=${testOutput.kind}/${testOutput.savedTokens}, search=${searchOutput.kind}/${searchOutput.savedTokens}, huge=${hugeOutput.projectedChars}/${hugeOutput.savedTokens}, tail=${tailFailure.projectedChars}`,
    };
  }

  return passed(
    id,
    `tool output governance ready: testSaved=${testOutput.savedTokens}, searchSaved=${searchOutput.savedTokens}, hugeProjected=${hugeOutput.projectedChars}, hugeSaved=${hugeOutput.savedTokens}, tailRootCause=preserved`,
  );
}

export async function runCacheEconomyCheck(id: EvaluationCheckId): Promise<EvaluationCheckResult> {
  const { normalizeProviderUsage } = await import("../provider/usageNormalizer.js");
  const { resolveProviderCachePolicy } = await import("../provider/cachePolicy.js");
  const { buildCompressedContextRequest } = await import("../context/runtime/compression/builder.js");
  const { buildContextRuntimePromptLayers } = await import("../context/runtime/prompt.js");
  const { renderPromptLayers } = await import("../agent/prompt/format.js");
  const { getInitialRuntimeConfig } = await import("../config/initialConfig.js");
  const { getAppPaths } = await import("../config/paths.js");
  const { resolveTelegramRuntimeConfig } = await import("../config/hosts.js");

  const deepSeek = normalizeProviderUsage({
    prompt_tokens: 1000,
    prompt_cache_hit_tokens: 800,
    prompt_cache_miss_tokens: 200,
    completion_tokens: 40,
  });
  const openai = normalizeProviderUsage({
    prompt_tokens: 1200,
    prompt_tokens_details: {
      cached_tokens: 960,
    },
  });
  const policy = resolveProviderCachePolicy({
    provider: "openai",
    model: "gpt-5.5",
    sessionId: "eval-session",
  });
  const config = {
    ...getInitialRuntimeConfig(),
    apiKey: "eval-key",
    model: "gpt-5.5",
    telegram: resolveTelegramRuntimeConfig(getInitialRuntimeConfig().telegram, process.cwd()),
    paths: getAppPaths(process.cwd()),
  };
  const projectContext = {
    rootDir: process.cwd(),
    stateRootDir: process.cwd(),
    cwd: process.cwd(),
    instructions: [],
    instructionText: "",
    instructionTruncated: false,
    ignoreRules: [],
    skills: [buildCostSkillFixture()],
  };
  const firstPrompt = buildContextRuntimePromptLayers({
    cwd: process.cwd(),
    config,
    projectContext: {
      ...projectContext,
      projectMap: {
        rootDir: process.cwd(),
        cwd: process.cwd(),
        topLevelDirectories: ["src"],
        entryFiles: ["src/cli.ts"],
        testDirectories: ["tests"],
        packageScripts: ["test"],
        specDocuments: ["spec.md"],
        git: {
          available: true,
          hasChanges: false,
          recentChanges: [],
        },
        summary: "Evaluation project map fixture.",
        updatedAt: "2026-06-16T00:00:00.000Z",
      },
    },
  });
  const secondPrompt = buildContextRuntimePromptLayers({
    cwd: process.cwd(),
    config,
    projectContext: {
      ...projectContext,
      projectMap: {
        rootDir: process.cwd(),
        cwd: process.cwd(),
        topLevelDirectories: ["src"],
        entryFiles: ["src/cli.ts"],
        testDirectories: ["tests"],
        packageScripts: ["test"],
        specDocuments: ["spec.md"],
        git: {
          available: true,
          hasChanges: true,
          recentChanges: ["M src/context/runtime/compression/builder.ts"],
        },
        summary: "Evaluation project map fixture.",
        updatedAt: "2026-06-16T00:01:00.000Z",
      },
    },
  });
  const requestConfig = {
    contextWindowMessages: 120,
    model: "gpt-5.5",
    maxContextChars: 900_000,
    contextSummaryChars: 120_000,
  };
  const first = buildCompressedContextRequest(
    firstPrompt,
    [
      { role: "user", content: "first", createdAt: "2026-06-16T00:00:00.000Z" },
      { role: "tool", name: "bash", content: `large output ${"x".repeat(20_000)}`, createdAt: "2026-06-16T00:00:01.000Z" },
    ],
    requestConfig,
  );
  const second = buildCompressedContextRequest(
    secondPrompt,
    [
      { role: "user", content: "first", createdAt: "2026-06-16T00:00:00.000Z" },
      { role: "tool", name: "bash", content: `large output ${"x".repeat(20_000)}`, createdAt: "2026-06-16T00:00:01.000Z" },
      { role: "user", content: "second", createdAt: "2026-06-16T00:01:00.000Z" },
    ],
    requestConfig,
  );
  const compactedLargeOutput = buildCompressedContextRequest(
    firstPrompt,
    [
      { role: "user", content: "large output", createdAt: "2026-06-16T00:00:00.000Z" },
      { role: "tool", name: "bash", content: `large output ${"x".repeat(20_000)}`, createdAt: "2026-06-16T00:00:01.000Z" },
      { role: "user", content: "continue", createdAt: "2026-06-16T00:00:02.000Z" },
    ],
    {
      contextWindowMessages: 3,
      model: "gpt-5.5",
      maxContextChars: 8_000,
      contextSummaryChars: 600,
    },
  );
  const renderedPrompt = renderPromptLayers(firstPrompt);

  if (
    deepSeek?.cacheHitRate !== 0.8 ||
    openai?.cacheReadTokens !== 960 ||
    !policy.promptCacheKey ||
    first.cacheLayout?.stablePrefixFingerprint !== second.cacheLayout?.stablePrefixFingerprint ||
    first.cacheLayout?.volatileTailFingerprint === second.cacheLayout?.volatileTailFingerprint ||
    renderedPrompt.includes("FULL_SKILL_BODY_MUST_NOT_ENTER_DEFAULT_CONTEXT") ||
    !renderedPrompt.includes("cost-skill") ||
    (compactedLargeOutput.cacheLayout?.volatileTailChars ?? Number.POSITIVE_INFINITY) >= 20_000
  ) {
    return {
      id,
      status: "failed",
      fact: "cache economy checks did not converge",
    };
  }

  return passed(
    id,
    `cache economy ready: deepseekHit=${deepSeek?.cacheHitRate}, openaiCached=${openai?.cacheReadTokens}, stablePrefix=${first.cacheLayout?.stablePrefixFingerprint ?? "unknown"}, stableChars=${first.cacheLayout?.stablePrefixChars ?? 0}, compactedTailChars=${compactedLargeOutput.cacheLayout?.volatileTailChars ?? 0}, skillIndex=only`,
  );
}

function buildCostSkillFixture(): LoadedSkill {
  return {
    name: "cost-skill",
    description: "Loaded only when needed.",
    path: "skills/cost-skill/SKILL.md",
    absolutePath: "skills/cost-skill/SKILL.md",
    body: "FULL_SKILL_BODY_MUST_NOT_ENTER_DEFAULT_CONTEXT",
    dependencies: [],
    resources: [{
      path: "references/cost.md",
      size: 100_000,
      kind: "references",
    }],
    health: {
      status: "ready",
      bodyPresent: true,
      resourceCount: 1,
      dependencyCount: 0,
      resourceGroups: {
        references: 1,
        scripts: 0,
        examples: 0,
        assets: 0,
        other: 0,
      },
      issues: [],
    },
  };
}
