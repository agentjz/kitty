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
    assert.ok(messages.welcome.trim());
    assert.ok(messages.authorNote.title.trim());
    const runtimeFields = [...messages.runtime.modelFields, ...messages.runtime.browserFields, ...messages.runtime.otherFields];
    assert.equal(runtimeFields.some((field) => field.envKey === "KITTY_LOCALE" && field.label.length > 0), true);
    const profileField = messages.runtime.otherFields.find((field) => field.envKey === "KITTY_PROFILE");
    assert.ok(profileField);
    assert.equal(profileField.options?.some((option) => option.value === "sharp" && option.label.trim().length > 0), true);
    assert.ok(messages.capabilities.catalog.web.name.trim());
    assert.ok(messages.capabilities.catalog.web.summary.trim());
    assert.ok(messages.other.browserHeadless.trim());
    const browserTimeout = messages.runtime.browserFields.find((field) => field.envKey === "KITTY_PLAYWRIGHT_TIMEOUT_MS");
    assert.deepEqual({ min: browserTimeout?.min, max: browserTimeout?.max, step: browserTimeout?.step }, { min: 5000, max: 600000, step: 1000 });
    assert.ok(browserTimeout?.hint?.trim());
    assert.ok(messages.skills.save.trim());
    assert.ok(messages.skills.deleteConfirm.trim());
  }
});

test("TUI command discovery and keyboard help use the selected locale", () => {
  assert.equal(filterTuiCommandMenu("current project status", "en")[0]?.name, "/status");
  for (const locale of SUPPORTED_LOCALES) {
    const sections = getTuiShortcutHelp(locale);
    assert.ok(sections.length > 0);
    assert.ok(sections.every((section) => section.title.trim() && section.shortcuts.every((shortcut) => shortcut.action.trim())));
  }
});

test("CLI, preflight, and Telegram presenters use the selected locale", () => {
  const locale = "ko";
  const help = buildCliProgram({}, locale).helpInformation();
  const report = formatConfigPreflightReport({
    rootDir: "C:/repo",
    kittyDir: "C:/repo/.kitty",
    files: [],
    env: {
      activeKeys: [],
      missingKeys: [],
      provider: "agnes",
      model: "agnes-2.0-flash",
      baseUrl: "https://apihub.agnes-ai.com/v1",
      providerProfile: "Agnes AI",
      modelProfile: "Agnes 2.0 Flash",
      wireApi: "chat.completions",
      apiKeyPresent: true,
      apiKeyRequired: true,
    },
    ready: true,
    nextSteps: [],
  }, locale);
  assert.ok(help.trim());
  assert.ok(formatRemoteCommandHelp("telegram", locale).trim());
  assert.ok(report.length > 0);
});

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g)].map((match) => match[1] as string).sort();
}
