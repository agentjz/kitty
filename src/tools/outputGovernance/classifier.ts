import type { ToolOutputKind, ToolOutputSource } from "./types.js";

export function classifyToolOutput(source: ToolOutputSource): ToolOutputKind {
  const output = source.output.trim();
  if (!output) {
    return "empty";
  }

  const command = (source.command ?? "").toLowerCase();
  const text = output.toLowerCase();

  if (looksLikeGitDiff(command, text)) {
    return "git_diff";
  }
  if (looksLikeSearch(command)) {
    return "search";
  }
  if (looksLikeTypecheck(command, text)) {
    return "typecheck";
  }
  if (looksLikeTest(command, text)) {
    return "test";
  }
  if (looksLikeBuild(command, text)) {
    return "build";
  }
  return "generic";
}

function looksLikeGitDiff(command: string, text: string): boolean {
  return /\bgit\s+(diff|show)\b/.test(command) || text.includes("diff --git ");
}

function looksLikeSearch(command: string): boolean {
  return /(^|\s)(rg|grep)(\s|$)/.test(command);
}

function looksLikeTypecheck(command: string, text: string): boolean {
  return /\b(tsc|typecheck|mypy)\b/.test(command) ||
    /\b(error|warning)\s+ts\d+:/i.test(text);
}

function looksLikeTest(command: string, text: string): boolean {
  return /\b(test|vitest|jest|pytest|playwright|node --test)\b/.test(command) ||
    /\b(test result|tests? failed|tests? passed|failing tests?|failures?)\b/.test(text);
}

function looksLikeBuild(command: string, text: string): boolean {
  return /\b(build|compile|cargo check|cargo clippy|npm run build|pnpm build)\b/.test(command) ||
    /\b(compilation failed|build failed|compiled successfully|error\[e\d+\])\b/.test(text);
}
