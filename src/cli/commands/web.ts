import type { Command } from "commander";
import process from "node:process";

import type { CliOverrides } from "../../types.js";

export function registerWebCommand(
  program: Command,
  dependencies: {
    getCliOverrides: () => CliOverrides;
    resolveRuntime: (overrides: CliOverrides) => Promise<{
      cwd: string;
      config: import("../../types.js").RuntimeConfig;
      paths: import("../../types.js").RuntimeConfig["paths"];
      overrides: CliOverrides;
    }>;
  },
): void {
  program
    .command("web")
    .description("Start web shell: a browser-accessible chat interface.")
    .option("-p, --port <number>", "HTTP port (default: 3000)")
    .action(async (options: { port?: string }) => {
      const runtime = await dependencies.resolveRuntime(dependencies.getCliOverrides());

      const { startWebShell } = await import("../../web/index.js");
      const { SessionStore } = await import("../../session/index.js");
      const { resolveCliSession, createSessionStore } = await import("./sessionHelpers.js");

      const sessionStore = await createSessionStore(runtime.paths.sessionsDir);

      // 先让用户在终端选择历史会话或新建会话
      const selected = await resolveCliSession({
        sessionStore,
        cwd: runtime.cwd,
        cwdOverridden: Boolean(runtime.overrides.cwd),
        interactive: true,
      });

      if (!selected) {
        return;
      }

      // Handle Ctrl+C explicitly (not done by readline in web mode)
      let stopped = false;
      const onSigint = () => {
        if (stopped) return;
        stopped = true;
        process.exit(0);
      };
      process.on("SIGINT", onSigint);

      try {
        await startWebShell({
          cwd: selected.cwd,
          config: runtime.config,
          session: selected.session,
          sessionStore,
          port: options.port ? Number(options.port) : undefined,
        });
      } finally {
        process.off("SIGINT", onSigint);
      }
    });
}
