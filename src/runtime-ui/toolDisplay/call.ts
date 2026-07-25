import { tryParseJson } from "../../utils/json.js";
import { normalizeDisplayPath } from "../pathDisplay.js";
import { truncate } from "../previewPolicy.js";
import { projectToolCallPresentation } from "../toolPresentation.js";
import { readStringField } from "./shared.js";
import type { ToolDisplay } from "./types.js";

export function buildToolCallDisplay(
  name: string,
  rawArgs: string,
  maxChars: number,
  cwd?: string,
): ToolDisplay {
  const sharedDisplay = buildSharedToolCallDisplay(projectToolCallPresentation(name, rawArgs), cwd);
  if (sharedDisplay) {
    return sharedDisplay;
  }
  const parsed = tryParseJson(rawArgs);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      summary: `${name} ${truncate(rawArgs, maxChars)}`,
    };
  }

  const args = parsed as Record<string, unknown>;
  const path = normalizeDisplayPath(readStringField(args, "path"), cwd);

  switch (name) {
    case "worktree_create": {
      const branch = readStringField(args, "branch");
      return {
        summary: `${name} ${path ?? "(missing path)"}${branch ? ` branch=${branch}` : ""}`,
      };
    }
    case "worktree_get":
    case "worktree_keep":
    case "worktree_remove":
      return {
        summary: `${name} ${path ?? "(missing path)"}`,
      };
    case "worktree_events": {
      const limit = typeof args.limit === "number" ? Math.trunc(args.limit) : undefined;
      return {
        summary: `${name}${limit ? ` limit=${limit}` : ""}`,
      };
    }
    case "worktree_list":
      return {
        summary: name,
      };
    case "todo_write": {
      const items = Array.isArray(args.items) ? args.items : [];
      return {
        summary: `${name} items=${items.length}`,
      };
    }
    case "web_search": {
      const query = readStringField(args, "query");
      return {
        summary: query ? `${name} ${truncate(query, maxChars)}` : name,
      };
    }
    case "web_fetch": {
      const url = readStringField(args, "url");
      return { summary: url ? `${name} ${truncate(url, maxChars)}` : name };
    }
    case "web_download": {
      const url = readStringField(args, "url");
      return {
        summary: `${name} ${path ?? "(missing path)"}${url ? ` ${truncate(url, maxChars)}` : ""}`,
      };
    }
    default:
      if (name.startsWith("playwright_")) {
        const target = readStringField(args, "url")
          ?? readStringField(args, "element")
          ?? readStringField(args, "ref");
        return {
          summary: target ? `${name} ${truncate(target, maxChars)}` : name,
        };
      }
      return {
        summary: `${name} ${truncate(rawArgs, maxChars)}`,
      };
  }
}

function buildSharedToolCallDisplay(
  presentation: ReturnType<typeof projectToolCallPresentation>,
  cwd?: string,
): ToolDisplay | undefined {
  switch (presentation.kind) {
    case "change": {
      const target = normalizeDisplayPath(presentation.target, cwd) ?? "(missing path)";
      const operations = presentation.operationCount && presentation.operationCount > 0
        ? ` edits=${presentation.operationCount}`
        : "";
      return { summary: `${presentation.name} ${target}${operations}` };
    }
    case "read": {
      const target = normalizeDisplayPath(presentation.target, cwd) ?? "(missing path)";
      const range = presentation.offset === undefined
        ? ""
        : presentation.limit === undefined
          ? `:${presentation.offset}`
          : `:${presentation.offset}-${Math.max(presentation.offset, presentation.offset + presentation.limit - 1)}`;
      return { summary: `${presentation.name} ${target}${range}` };
    }
    case "command":
      return {
        summary: `bash ${presentation.command ?? ""}`.trim()
          + (presentation.cwd ? ` cwd=${presentation.cwd}` : ""),
      };
    case "tool":
      return undefined;
  }
}
