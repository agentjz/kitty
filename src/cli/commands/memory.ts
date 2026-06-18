import type { Command } from "commander";

import { buildRuntimeStatus, type RuntimeStatus } from "../../runtime/status.js";
import {
  appendRuntimeMemoryAssetToSkillReference,
  createRuntimeMemoryAsset,
  deleteRuntimeMemoryAsset,
  readRuntimeMemoryAsset,
  searchRuntimeMemoryAssets,
} from "../../runtime/memory/index.js";
import type { WritableRuntimeMemoryAssetKind } from "../../runtime/memory/index.js";
import type { CliOverrides, RuntimeConfig } from "../../types.js";
import { ui } from "../../utils/console.js";
import { writeStdoutLine } from "../../utils/stdio.js";

export function registerMemoryCommand(
  program: Command,
  options: {
    getCliOverrides: () => CliOverrides;
    resolveRuntime: (overrides: CliOverrides) => Promise<{
      cwd: string;
      config: RuntimeConfig;
      paths: RuntimeConfig["paths"];
      overrides: CliOverrides;
    }>;
  },
): void {
  program
    .command("memory")
    .description("List readable runtime memory assets.")
    .argument("[memoryId]", "Optional runtime memory asset id to read.")
    .option("--delete", "Delete the selected runtime memory asset.")
    .option("--append-to-skill <skillName>", "Append the selected memory asset to a runtime skill references/ file.")
    .option("--create <kind>", "Create a project, user, or evidence memory asset.")
    .option("--title <title>", "Title for --create.")
    .option("--content <content>", "Content for --create.")
    .option("--evidence <refs>", "Comma-separated evidence refs for --create.")
    .option("--scope <scope>", "Scope metadata for --create.")
    .option("--tags <tags>", "Comma-separated tags for --create.")
    .option("--file <fileName>", "Target file name for --append-to-skill.")
    .option("-q, --query <query>", "Search runtime memory assets.")
    .option("--json", "Print structured JSON.")
    .action(async (memoryId: string | undefined, commandOptions: {
      appendToSkill?: string;
      content?: string;
      create?: string;
      delete?: boolean;
      evidence?: string;
      file?: string;
      json?: boolean;
      query?: string;
      scope?: string;
      tags?: string;
      title?: string;
    }) => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      if (commandOptions.create) {
        await handleMemoryCreate(runtime.cwd, commandOptions);
        return;
      }

      if (memoryId) {
        await handleSelectedMemory(runtime.cwd, memoryId, commandOptions);
        return;
      }

      if (commandOptions.query) {
        await handleMemorySearch(runtime.cwd, commandOptions.query, commandOptions.json === true);
        return;
      }

      await handleMemoryList(runtime.cwd, commandOptions.json === true);
    });
}

async function handleMemoryCreate(
  cwd: string,
  options: {
    content?: string;
    create?: string;
    evidence?: string;
    file?: string;
    json?: boolean;
    scope?: string;
    tags?: string;
    title?: string;
  },
): Promise<void> {
  const kind = parseWritableMemoryKind(options.create);
  if (!options.title?.trim()) {
    throw new Error("--title is required when creating a memory asset.");
  }
  if (!options.content?.trim()) {
    throw new Error("--content is required when creating a memory asset.");
  }

  const created = await createRuntimeMemoryAsset({
    rootDir: cwd,
    kind,
    title: options.title,
    content: options.content,
    evidenceRefs: parseCsvOption(options.evidence),
    scope: options.scope,
    tags: parseCsvOption(options.tags),
    fileName: options.file,
  });

  if (options.json) {
    writeStdoutLine(JSON.stringify({ created }, null, 2));
    return;
  }
  ui.success(`Created memory asset ${created.id}`);
  writeStdoutLine(created.path);
}

async function handleSelectedMemory(
  cwd: string,
  memoryId: string,
  options: { appendToSkill?: string; delete?: boolean; file?: string; json?: boolean },
): Promise<void> {
  if (options.appendToSkill) {
    const appended = await appendRuntimeMemoryAssetToSkillReference({
      rootDir: cwd,
      memoryId,
      skillName: options.appendToSkill,
      fileName: options.file,
    });
    if (options.json) {
      writeStdoutLine(JSON.stringify({ appended }, null, 2));
      return;
    }
    ui.success(`Appended memory asset ${memoryId} to skill ${options.appendToSkill}`);
    writeStdoutLine(appended.path);
    return;
  }

  if (options.delete) {
    const deleted = await deleteRuntimeMemoryAsset(cwd, memoryId);
    if (options.json) {
      writeStdoutLine(JSON.stringify({ deleted }, null, 2));
      return;
    }
    ui.success(`Deleted memory asset ${deleted.id}`);
    writeStdoutLine(deleted.path);
    return;
  }

  const memory = await readRuntimeMemoryAsset(cwd, memoryId);
  if (options.json) {
    writeStdoutLine(JSON.stringify(memory, null, 2));
    return;
  }
  writeStdoutLine(memory.content.trimEnd());
}

async function handleMemorySearch(cwd: string, query: string, json: boolean): Promise<void> {
  const results = await searchRuntimeMemoryAssets(cwd, query);
  if (json) {
    writeStdoutLine(JSON.stringify({ query, results }, null, 2));
    return;
  }
  if (results.length === 0) {
    ui.info("No matching runtime memory assets.");
    return;
  }
  for (const result of results) {
    writeStdoutLine(`${result.id}  score=${result.score}  ${result.path}`);
    for (const match of result.matches) {
      writeStdoutLine(`  ${match}`);
    }
  }
}

function parseWritableMemoryKind(value: string | undefined): WritableRuntimeMemoryAssetKind {
  if (value === "project" || value === "user" || value === "evidence") {
    return value;
  }
  throw new Error("--create must be one of: project, user, evidence.");
}

function parseCsvOption(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function readMemoryListForCli(cwd: string): Promise<RuntimeStatus["memory"]> {
  return (await buildRuntimeStatus(cwd)).memory;
}

export function formatMemoryListForCli(memory: Awaited<ReturnType<typeof readMemoryListForCli>>): string {
  if (memory.assets.length === 0) {
    return "No runtime memory assets yet.";
  }
  return memory.assets.map((asset) => [
    asset.id,
    asset.kind,
    asset.updatedAt ?? "",
    `bytes=${asset.size}`,
    asset.evidenceRefs.length > 0 ? `evidence=${asset.evidenceRefs.join(",")}` : undefined,
    asset.path,
  ].filter(Boolean).join("  ")).join("\n");
}

async function handleMemoryList(cwd: string, json: boolean): Promise<void> {
  const memory = await readMemoryListForCli(cwd);

  if (json) {
    writeStdoutLine(JSON.stringify(memory, null, 2));
    return;
  }

  if (memory.assets.length === 0) {
    ui.info("No runtime memory assets yet.");
    return;
  }

  writeStdoutLine(formatMemoryListForCli(memory));
}
