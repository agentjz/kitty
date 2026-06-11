import type { Command } from "commander";
import path from "node:path";

import { probeProviderConnection } from "../../provider/connection.js";
import { formatConfigPreflightReport, inspectConfigPreflight } from "../../config/preflight.js";
import type { CliOverrides, RuntimeConfig } from "../../types.js";
import { ui } from "../../utils/console.js";
import { writeStdoutLine } from "../../utils/stdio.js";

export function registerDoctorCommand(
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
    .command("doctor")
    .description("Check local setup and validate the API connection.")
    .action(async () => {
      const overrides = options.getCliOverrides();
      const cwd = overrides.cwd ? path.resolve(overrides.cwd) : process.cwd();
      const preflight = await inspectConfigPreflight(cwd);

      ui.heading("kitty doctor");
      for (const line of formatConfigPreflightReport(preflight)) {
        writeStdoutLine(line);
      }

      const runtime = await options.resolveRuntime(overrides);

      ui.heading("runtime");
      ui.info(`env: ${runtime.paths.configDir}`);
      ui.info(`provider: ${runtime.config.provider}`);
      ui.info(`model: ${runtime.config.model}`);
      ui.info(`baseUrl: ${runtime.config.baseUrl}`);

      if (!runtime.config.apiKey.trim()) {
        throw new Error(
          "User-fixable error: API key not found. Set `KITTY_API_KEY` in the current project `.kitty/.env`, then rerun `kitty doctor`.",
        );
      }

      const diagnosis = await probeProviderConnection({
        provider: runtime.config.provider,
        model: runtime.config.model,
        baseUrl: runtime.config.baseUrl,
        apiKey: runtime.config.apiKey,
      });
      if (diagnosis.kind === "ok") {
        ui.success(`Provider reachable. models=${diagnosis.models}`);
        if (diagnosis.resolvedBaseUrl !== runtime.config.baseUrl) {
          ui.info(`resolvedBaseUrl: ${diagnosis.resolvedBaseUrl}`);
        }
        return;
      }

      throw new Error(diagnosis.message);
    });
}

