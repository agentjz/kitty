import type { Command } from "commander";
import path from "node:path";

import { probeProviderConnection, type ProviderConnectionProbeResult } from "../../provider/connection.js";
import { resolveModelProfile } from "../../provider/catalog.js";
import { formatConfigPreflightReport, inspectConfigPreflight } from "../../config/preflight.js";
import type { CliOverrides, RuntimeConfig } from "../../types.js";
import { ui } from "../../utils/console.js";
import { writeStdoutLine } from "../../utils/stdio.js";
import { translate, type KittyLocale } from "../../i18n/index.js";

type ProviderProbe = typeof probeProviderConnection;

export function registerDoctorCommand(
  program: Command,
  options: {
    locale: KittyLocale;
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
    .description(translate(options.locale, "cli.command.doctor"))
    .action(async () => {
      const overrides = options.getCliOverrides();
      const cwd = overrides.cwd ? path.resolve(overrides.cwd) : process.cwd();
      const preflight = await inspectConfigPreflight(cwd);

      ui.heading("kitty doctor");
      for (const line of formatConfigPreflightReport(preflight, options.locale)) {
        writeStdoutLine(line);
      }

      const runtime = await options.resolveRuntime(overrides);

      const locale = runtime.config.locale;
      ui.heading(translate(locale, "doctor.runtime"));
      ui.info(`${translate(locale, "doctor.env")}: ${runtime.paths.configDir}`);
      ui.info(`${translate(locale, "preflight.provider")}: ${runtime.config.provider}`);
      ui.info(`${translate(locale, "preflight.model")}: ${runtime.config.model}`);
      ui.info(`${translate(locale, "preflight.baseUrl")}: ${runtime.config.baseUrl}`);
      const profile = resolveModelProfile({
        provider: runtime.config.provider,
        model: runtime.config.model,
      });
      ui.info(`${translate(locale, "preflight.providerProfile")}: ${profile.provider.label}`);
      ui.info(`${translate(locale, "preflight.modelProfile")}: ${profile.model.label}`);
      ui.info(`${translate(locale, "preflight.wireApi")}: ${profile.model.wireApi}`);
      ui.info(`${translate(locale, "doctor.reasoningReplay")}: ${profile.model.capabilities.reasoningContentReplay}`);
      ui.info(`${translate(locale, "doctor.contextLimit")}: ${profile.model.limit.context}`);
      ui.info(`${translate(locale, "doctor.outputLimit")}: ${profile.model.limit.output}`);

      if (!runtime.config.apiKey.trim()) {
        throw new Error(
          translate(locale, "doctor.apiKeyMissing"),
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
        ui.success(formatProviderProbeSuccess(diagnosis, locale));
        if (diagnosis.resolvedBaseUrl !== runtime.config.baseUrl) {
          ui.info(`${translate(locale, "preflight.baseUrl")}: ${diagnosis.resolvedBaseUrl}`);
        }
        if (!preflight.ready) {
          throw new Error(translate(locale, "doctor.templateIncomplete"));
        }
        ui.success(translate(locale, "doctor.ready"));
        return;
      }

      throw new Error(diagnosis.message);
    });
}

function formatProviderProbeSuccess(
  diagnosis: Extract<ProviderConnectionProbeResult, { kind: "ok" }>,
  locale: KittyLocale,
): string {
  if (diagnosis.probe === "responses") {
    return translate(locale, "doctor.providerResponsesOk");
  }

  if (diagnosis.probe === "chat.completions") {
    return translate(locale, "doctor.providerChatOk");
  }

  return translate(locale, "doctor.providerModelsOk", { count: diagnosis.models ?? 0 });
}

