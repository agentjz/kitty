import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_LOCALE,
  parseKittyLocale,
  SUPPORTED_LOCALES,
  translate,
} from "../../src/i18n/index.js";
import { enMessages, type MessageKey } from "../../src/i18n/en.js";
import { filterTuiCommandMenu } from "../../src/shell/tui/commandMenu.js";
import { getTuiShortcutHelp } from "../../src/shell/tui/keyboardHelp.js";
import { buildCliProgram } from "../../src/cli/program.js";
import { formatConfigPreflightReport } from "../../src/config/preflight.js";
import { formatRemoteCommandHelp } from "../../src/remote/commands.js";
import { buildWebMessages } from "../../src/web/messages.js";

test("locale parsing accepts only the declared presentation locales", () => {
  assert.equal(DEFAULT_LOCALE, "zh-CN");
  assert.deepEqual(SUPPORTED_LOCALES, [
    "zh-CN", "en", "ja", "ko",
  ]);
  assert.equal(parseKittyLocale("ja"), "ja");
  assert.equal(parseKittyLocale(" zh-CN "), "zh-CN");
  assert.equal(parseKittyLocale("zh-TW"), undefined);
  assert.equal(parseKittyLocale("fr"), undefined);
  assert.equal(parseKittyLocale("en-US"), undefined);
});

test("every catalog resolves every schema key with the same placeholders", () => {
  const entries = Object.entries(enMessages) as [MessageKey, string][];
  for (const locale of SUPPORTED_LOCALES) {
    for (const [key, source] of entries) {
      const message = translate(locale, key);
      assert.ok(message.trim(), `${locale}:${key} must not be empty`);
      assert.deepEqual(placeholders(message), placeholders(source), `${locale}:${key} placeholders`);
    }
  }
});

test("registered non-English catalogs do not fall back to English presentation", () => {
  for (const locale of SUPPORTED_LOCALES.filter((candidate) => candidate !== "en")) {
    assert.notEqual(translate(locale, "cli.program.description"), enMessages["cli.program.description"], locale);
    assert.notEqual(translate(locale, "interaction.steerAccepted"), enMessages["interaction.steerAccepted"], locale);
  }
});

test("typed catalogs interpolate dynamic values in every supported locale", () => {
  for (const locale of SUPPORTED_LOCALES) {
    const message = translate(locale, "tui.newContentRows", { count: 3 });
    assert.equal(message.includes("3"), true);
    assert.equal(message.includes("{count}"), false);
  }
});

test("the Web presentation projects every supported runtime locale", () => {
  for (const locale of SUPPORTED_LOCALES) {
    const messages = buildWebMessages(locale);
    assert.equal(messages.welcome, translate(locale, "tui.authorTip"));
    assert.equal(messages.runtime.fields.some((field) => field.envKey === "KITTY_LOCALE" && field.label.length > 0), true);
    assert.equal(Object.values(messages.extensionSummaries).every((summary) => summary.length > 0), true);
  }
});

test("TUI command discovery and keyboard help use the selected locale", () => {
  assert.equal(filterTuiCommandMenu("current project status", "en")[0]?.name, "/status");
  assert.equal(getTuiShortcutHelp("en")[0]?.title, "Discovery");
  assert.equal(getTuiShortcutHelp("ja")[0]?.shortcuts[0]?.action, "コマンド補完");
});

test("CLI, preflight, and Telegram presenters use the selected locale", () => {
  const locale = "ko";
  const help = buildCliProgram({}, locale).helpInformation();
  assert.equal(help.includes(translate(locale, "cli.program.description")), true);
  assert.equal(formatRemoteCommandHelp("telegram", locale).includes(translate(locale, "remote.command.stop.description")), true);
  const report = formatConfigPreflightReport({
    rootDir: "C:/repo",
    kittyDir: "C:/repo/.kitty",
    files: [],
    env: {
      activeKeys: [],
      missingKeys: [],
      provider: "openai",
      model: "gpt-5.5",
      baseUrl: "https://api.openai.com/v1",
      providerProfile: "OpenAI official",
      modelProfile: "GPT-5.5",
      wireApi: "responses",
      apiKeyPresent: true,
    },
    ready: true,
    nextSteps: [],
  }, locale);
  assert.equal(report.some((line) => line.startsWith(`${translate(locale, "preflight.project")}:`)), true);
});

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g)].map((match) => match[1] as string).sort();
}
