import type { Command } from "commander";

import type { CliProgramDependencies } from "../dependencies.js";
import { createHostSession } from "../../host/session.js";
import type { CliOverrides, RuntimeConfig, SessionRecord } from "../../types.js";
import { ui } from "../../utils/console.js";
import { writeStdoutLine } from "../../utils/stdio.js";
import { formatSpecWorkflowBrief } from "../../spec/workflowSummary.js";
import { createSessionStore } from "./sessionHelpers.js";

export function registerSpecCommand(
  program: Command,
  options: {
    getCliOverrides: () => CliOverrides;
    resolveRuntime: (overrides: CliOverrides) => Promise<{
      cwd: string;
      config: RuntimeConfig;
      paths: RuntimeConfig["paths"];
      overrides: CliOverrides;
    }>;
    dependencies: CliProgramDependencies;
  },
): void {
  program
    .command("spec")
    .description("Start spec mode: isolated requirements, design, tasks, implementation, and validation workflow.")
    .argument("[prompt...]", "Optional one-shot spec prompt. Without a prompt, opens interactive spec mode.")
    .option("--resume <sessionId>", "Resume a saved session in spec mode.")
    .option("--status", "Print the current spec workflow status without starting a turn.")
    .action(async (promptParts: string[], commandOptions: { resume?: string; status?: boolean }) => {
      const prompt = promptParts.join(" ").trim();
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const sessionStore = await createSessionStore(runtime.paths.sessionsDir);
      const session = commandOptions.resume
        ? await sessionStore.load(commandOptions.resume)
        : await createHostSession(sessionStore, runtime.cwd);

      if (commandOptions.status) {
        const specRuntime = await loadSpecRuntimeForCli(runtime.cwd, session.id, runtime.config.projectDocMaxBytes);
        writeStdoutLine(formatSpecWorkflowBrief(specRuntime.workflow));
        return;
      }

      if (!prompt) {
        await startSpecInteractive(options.dependencies, {
          cwd: runtime.cwd,
          config: runtime.config,
          session,
          sessionStore,
        });
        return;
      }

      const result = await runSpecOneShot(options.dependencies, {
        prompt,
        cwd: runtime.cwd,
        config: runtime.config,
        session,
        sessionStore,
      });
      if (!result.closeout.completed) {
        ui.error(result.closeout.unfinishedReason ?? "Spec one-shot did not complete.");
        process.exitCode = 1;
      }
    });
}

async function loadSpecRuntimeForCli(cwd: string, sessionId: string, projectDocMaxBytes: number) {
  const { loadSpecRuntime } = await import("../../spec/runtime.js");
  return loadSpecRuntime({
    cwd,
    sessionId,
    projectDocMaxBytes,
  });
}

async function startSpecInteractive(
  dependencies: CliProgramDependencies,
  options: {
    cwd: string;
    config: RuntimeConfig;
    session: SessionRecord;
    sessionStore: Awaited<ReturnType<typeof createSessionStore>>;
  },
): Promise<void> {
  if (dependencies.startSpecInteractive) {
    await dependencies.startSpecInteractive(options);
    return;
  }

  const { startSpecInteractiveChat } = await import("../../shell/cli/specInteractive.js");
  await startSpecInteractiveChat(options);
}

async function runSpecOneShot(
  dependencies: CliProgramDependencies,
  options: {
    prompt: string;
    cwd: string;
    config: RuntimeConfig;
    session: SessionRecord;
    sessionStore: Awaited<ReturnType<typeof createSessionStore>>;
  },
) {
  if (dependencies.runSpecOneShot) {
    return dependencies.runSpecOneShot(options);
  }

  const { runSpecOneShotPrompt } = await import("../specOneShot.js");
  return runSpecOneShotPrompt(options.prompt, options.cwd, options.config, options.session, options.sessionStore);
}
