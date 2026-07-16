import type { TodoStatus } from "../types.js";
import { normalizeTodoItems } from "../session/todos.js";
import { tryParseJson } from "../utils/json.js";

export type ToolCallPresentation =
  | {
    readonly kind: "change";
    readonly name: "write" | "edit" | "document_write";
    readonly target?: string;
    readonly operationCount?: number;
  }
  | {
    readonly kind: "read";
    readonly name: "read" | "document_read";
    readonly target?: string;
    readonly offset?: number;
    readonly limit?: number;
    readonly unit?: "line" | "unit";
  }
  | {
    readonly kind: "command";
    readonly name: "bash";
    readonly command?: string;
    readonly cwd?: string;
  }
  | { readonly kind: "tool"; readonly name: string };

export interface ToolPlanItem {
  readonly id: string;
  readonly text: string;
  readonly status: TodoStatus;
}

export type ToolResultPresentation =
  | {
    readonly kind: "change";
    readonly name: "write" | "edit";
    readonly action: "created" | "updated";
    readonly path: string;
    readonly addedLines: number;
    readonly removedLines: number;
    readonly diffLines: readonly string[];
  }
  | {
    readonly kind: "read";
    readonly name: "read" | "document_read";
    readonly path: string;
    readonly startLine?: number;
    readonly endLine?: number;
    readonly startUnit?: number;
    readonly endUnit?: number;
    readonly unit?: string;
    readonly content?: string;
    readonly truncated: boolean;
  }
  | {
    readonly kind: "document-change";
    readonly name: "document_write";
    readonly action: "created" | "updated";
    readonly path: string;
    readonly bytes?: number;
  }
  | {
    readonly kind: "command";
    readonly name: "bash";
    readonly command: string;
    readonly status?: string;
    readonly durationMs?: number;
    readonly output?: string;
    readonly outputPath?: string;
    readonly truncated: boolean;
  }
  | {
    readonly kind: "plan";
    readonly name: "todo_write";
    readonly items: readonly ToolPlanItem[];
    readonly completed: number;
  }
  | { readonly kind: "none"; readonly name: string };

export function projectToolCallPresentation(name: string, rawArgs: string): ToolCallPresentation {
  const normalizedName = name.toLowerCase();
  const args = readObject(rawArgs);
  const target = readString(args?.path);
  if (normalizedName === "write" || normalizedName === "edit" || normalizedName === "document_write") {
    return {
      kind: "change",
      name: normalizedName,
      target,
      operationCount: normalizedName === "edit" && Array.isArray(args?.edits) ? args.edits.length : undefined,
    };
  }
  if (normalizedName === "read") {
    return {
      kind: "read",
      name: "read",
      target,
      offset: readNumber(args?.offset),
      limit: readNumber(args?.limit),
      unit: "line",
    };
  }
  if (normalizedName === "document_read") {
    return {
      kind: "read",
      name: "document_read",
      target,
      offset: readNumber(args?.start),
      limit: readNumber(args?.limit),
      unit: "unit",
    };
  }
  if (normalizedName === "bash") {
    return {
      kind: "command",
      name: "bash",
      command: readString(args?.command),
      cwd: readString(args?.cwd),
    };
  }
  return { kind: "tool", name };
}

export function projectToolResultPresentation(name: string, rawOutput: string): ToolResultPresentation {
  const normalizedName = name.toLowerCase();
  const output = readObject(rawOutput);
  if (!output) {
    return { kind: "none", name };
  }

  if (normalizedName === "write" || normalizedName === "edit") {
    const diff = readString(output.diff);
    const path = readString(output.path);
    if (!diff || !path) {
      return { kind: "none", name };
    }
    const diffLines = diff.trimEnd().split(/\r?\n/);
    return {
      kind: "change",
      name: normalizedName,
      action: normalizedName === "write" && output.existed === false ? "created" : "updated",
      path,
      addedLines: diffLines.filter((line) => line.startsWith("+")).length,
      removedLines: diffLines.filter((line) => line.startsWith("-")).length,
      diffLines,
    };
  }

  if (normalizedName === "document_write") {
    const path = readString(output.path);
    if (!path) {
      return { kind: "none", name };
    }
    return {
      kind: "document-change",
      name: "document_write",
      action: output.existed === false ? "created" : "updated",
      path,
      bytes: readNumber(output.bytes),
    };
  }

  if (normalizedName === "read" || normalizedName === "document_read") {
    const path = readString(output.path);
    if (!path) {
      return { kind: "none", name };
    }
    return {
      kind: "read",
      name: normalizedName,
      path,
      startLine: readNumber(output.startLine),
      endLine: readNumber(output.endLine),
      startUnit: readNumber(output.startUnit),
      endUnit: readNumber(output.endUnit),
      unit: readString(output.unit),
      content: readString(output.content),
      truncated: output.truncated === true,
    };
  }

  if (normalizedName === "bash") {
    const command = readString(output.command);
    if (!command) {
      return { kind: "none", name };
    }
    return {
      kind: "command",
      name: "bash",
      command,
      status: readString(output.status),
      durationMs: readNumber(output.durationMs),
      output: readString(output.output),
      outputPath: readString(output.outputPath),
      truncated: output.truncated === true,
    };
  }

  if (normalizedName === "todo_write") {
    if (!Array.isArray(output.items)) {
      return { kind: "none", name };
    }
    try {
      const items = normalizeTodoItems(output.items).map((item) => ({ ...item }));
      return {
        kind: "plan",
        name: "todo_write",
        items,
        completed: items.filter((item) => item.status === "completed").length,
      };
    } catch {
      return { kind: "none", name };
    }
  }

  return { kind: "none", name };
}

export function readToolResultLifecycleStatus(rawOutput: string): string | undefined {
  return readString(readObject(rawOutput)?.status);
}

function readObject(raw: string): Record<string, unknown> | undefined {
  const parsed = tryParseJson(raw);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
