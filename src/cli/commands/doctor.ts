import type { Command } from "commander";
import path from "node:path";

import { probeProviderConnection, type ProviderConnectionProbeResult } from "../../provider/connection.js";
import { resolveModelProfile } from "../../provider/catalog.js";
import { formatConfigPreflightReport, inspectConfigPreflight } from "../../config/preflight.js";
import type { CliOverrides, RuntimeConfig } from "../../types.js";
import { ui } from "../../utils/console.js";
import { writeStdoutLine } from "../../utils/stdio.js";

type ProviderProbe = typeof probeProviderConnection;

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
    probeProviderConnection?: ProviderProbe;
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
      const profile = resolveModelProfile({
        provider: runtime.config.provider,
        model: runtime.config.model,
      });
      ui.info(`provider profile: ${profile.provider.label}`);
      ui.info(`model profile: ${profile.model.label}`);
      ui.info(`wire API: ${profile.model.wireApi}`);
      ui.info(`reasoning replay: ${profile.model.capabilities.reasoningContentReplay}`);
      ui.info(`context limit: ${profile.model.limit.context}`);
      ui.info(`output limit: ${profile.model.limit.output}`);

      if (!runtime.config.apiKey.trim()) {
        throw new Error(
          "User-fixable error: API key not found. Set `KITTY_API_KEY` in the current project `.kitty/.env`, then rerun `kitty doctor`.",
        );
      }

      const providerProbe = options.probeProviderConnection ?? probeProviderConnection;
      const diagnosis = await providerProbe({
        provider: runtime.config.provider,
        model: runtime.config.model,
        baseUrl: runtime.config.baseUrl,
        apiKey: runtime.config.apiKey,
      });
      if (diagnosis.kind === "ok") {
        ui.success(formatProviderProbeSuccess(diagnosis));
        if (diagnosis.resolvedBaseUrl !== runtime.config.baseUrl) {
          ui.info(`resolvedBaseUrl: ${diagnosis.resolvedBaseUrl}`);
        }
        if (!preflight.ready) {
          throw new Error("User-fixable error: local project template is incomplete. Run `kitty init`, then rerun `kitty doctor`.");
        }
        ui.success("Kitty is ready. Start with `kitty` or run `kitty \"your task\"`.");
        return;
      }

      throw new Error(diagnosis.message);
    });
}

function formatProviderProbeSuccess(
  diagnosis: Extract<ProviderConnectionProbeResult, { kind: "ok" }>,
): string {
  if (diagnosis.probe === "responses") {
    return "Provider reachable. responses probe ok";
  }

  if (diagnosis.probe === "chat.completions") {
    return "Provider reachable. chat completions probe ok";
  }

  return `Provider reachable. models=${diagnosis.models ?? 0}`;
}

