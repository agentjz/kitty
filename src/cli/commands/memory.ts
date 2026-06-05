import type { Command } from "commander";

import { buildRuntimeStatus } from "../../runtime/status.js";
import {
  appendRuntimeMemoryAssetToSkillReference,
  deleteRuntimeMemoryAsset,
  readRuntimeMemoryAsset,
  appendRuntimeMemoryAssetToSpecNotes,
  searchRuntimeMemoryAssets,
} from "../../runtime/memory/index.js";
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
    .option("--append-to-spec <specId>", "Append the selected memory asset to a spec notes.md document.")
    .option("--append-to-skill <skillName>", "Append the selected memory asset to a runtime skill references/ file.")
    .option("--file <fileName>", "Target file name for --append-to-skill.")
    .option("-q, --query <query>", "Search runtime memory assets.")
    .option("--json", "Print structured JSON.")
    .action(async (memoryId: string | undefined, commandOptions: {
      appendToSkill?: string;
      appendToSpec?: string;
      delete?: boolean;
      file?: string;
      json?: boolean;
      query?: string;
    }) => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());
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

async function handleSelectedMemory(
  cwd: string,
  memoryId: string,
  options: { appendToSkill?: string; appendToSpec?: string; delete?: boolean; file?: string; json?: boolean },
): Promise<void> {
  if (options.appendToSkill && options.appendToSpec) {
    throw new Error("Choose either --append-to-spec or --append-to-skill, not both.");
  }

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

  if (options.appendToSpec) {
    const appended = await appendRuntimeMemoryAssetToSpecNotes({
      rootDir: cwd,
      memoryId,
      specId: options.appendToSpec,
    });
    if (options.json) {
      writeStdoutLine(JSON.stringify({ appended }, null, 2));
      return;
    }
    ui.success(`Appended memory asset ${memoryId} to spec ${options.appendToSpec}`);
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
    writeStdoutLine(`${result.id}  ${result.path}`);
    for (const match of result.matches) {
      writeStdoutLine(`  ${match}`);
    }
  }
}

async function handleMemoryList(cwd: string, json: boolean): Promise<void> {
  const status = await buildRuntimeStatus(cwd);

  if (json) {
    writeStdoutLine(JSON.stringify(status.memory, null, 2));
    return;
  }

  if (status.memory.assets.length === 0) {
    ui.info("No runtime memory assets yet.");
    return;
  }

  for (const memory of status.memory.assets) {
    writeStdoutLine([
      memory.id,
      memory.kind,
      memory.updatedAt ?? "",
      `bytes=${memory.size}`,
      memory.evidenceRefs.length > 0 ? `evidence=${memory.evidenceRefs.join(",")}` : undefined,
      memory.path,
    ].filter(Boolean).join("  "));
  }
}
